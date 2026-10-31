// The lobbies of the custom games: one Durable Object holds every open lobby, the presence of the players and the invitations (docs/live_game_plan.md, the custom games).
// It holds no game rule and makes no table: Cloud Run authenticates the player (the session cookie), sends the account with every call (`POST /internal/lobbies/<op>`,
// signed like the other internal routes) and, when the host starts a game, makes the live table between `begin_start` and `finish_start`.
// `src/ark_nova/live/lobbies.py` (`MemoryLobbies`) is the twin of this file in Python for tests and the dev server: keep the two the same.
import { DurableObject } from "cloudflare:workers";

export const MODES = ["ark360"];
const MODE_LABELS: Record<string, string> = { ark360: "Ark360" };
export const SEATS = 2;
export const ONLINE_SECONDS = 45;          // a player whose page asked for the inbox this recently is online
export const IDLE_SECONDS = 90;            // a lobby whose host (a member) has not been seen for this long is closed (the member is taken out)
export const INVITE_SECONDS = 600;
export const STARTED_KEEP_SECONDS = 12 * 3600;      // a started lobby stays (members are sent to the table by it, everybody finds the game in the list of the games in progress)
const NOTICE_KEEP = 20;

type Account = { id: string; username: string };
type Seat = Account | null;
type Invite = { id: string; to_id: string; to_name: string; seat: number; status: "pending" | "declined" | "accepted" | "expired"; at: number };
type Lobby = {
    id: string; mode: string; marine_worlds: boolean; rated: boolean; status: "open" | "starting" | "started"; created_at: number; started_at?: number;
    seats: Seat[]; invites: Invite[]; game: { game_id: string; tokens: Record<string, string> } | null;
};
type Args = Record<string, any>;

export class LobbyError extends Error {
    constructor(message: string, public status = 409, public code = "lobby") { super(message); }
}

export const OPS = ["create", "list", "get", "join", "leave", "kick", "invite", "cancel_invite", "answer", "inbox", "online", "begin_start", "finish_start", "abort_start", "notify"];
const SWEEP_MS = 30_000;                   // while a lobby is open the object wakes this often to close the lobbies whose host left

/** What a socket of a page says about itself: who (a visitor has no account) and the topics it wants to hear about (`list`, `lobby:L3`, `chat:E7`; `inbox` is its account's own). */
type Attachment = { id: string | null; name: string | null; topics: string[] };

// The pages hold a WebSocket to this object (`/lobbies-ws`, `index.ts`) and are told *that* something changed ({type: "changed", topic}), then they ask Cloud Run for the view, which
// stays per viewer. A player is online while a socket of theirs is open (the older way, a page that asks for the inbox every few seconds, still counts: `seen`).
export class Lobbies extends DurableObject<Env> {
    private lobbies = new Map<string, Lobby>();
    private seen = new Map<string, { name: string; at: number }>();       // account id -> the last time its page asked (presence of a page that polls; not stored: a page asks again within seconds)
    private notices = new Map<string, any[]>();                          // one-shot messages for the pages
    private next = 0;
    private dirty = false;
    /** Tests move the clock with this (seconds). */
    clockOffset = 0;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        ctx.blockConcurrencyWhile(async () => {
            const saved = await ctx.storage.get<{ lobbies: Lobby[]; next: number; notices?: [string, any[]][] }>("state");
            if (saved) {
                this.next = saved.next;
                for (const l of saved.lobbies) this.lobbies.set(l.id, l);
                for (const [id, box] of saved.notices ?? []) this.notices.set(id, box);
            }
        });
        ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));          // (the pages' keep-alive does not wake the object)
    }

    private now(): number { return Date.now() / 1000 + this.clockOffset; }

    /** Tests only: the clock runs this many seconds ahead. */
    async advance(seconds: number): Promise<void> { this.clockOffset += seconds; }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const op = url.pathname.replace(/^\//, "");
        if (op === "ws") return this.openSocket(request, url);
        if (request.method !== "POST" || !OPS.includes(op)) return Response.json({ error: { status: 404, code: "no_op", message: "no such operation" } }, { status: 404 });
        const args = (await request.json<Args>().catch(() => null)) ?? {};
        try {
            const result = this.run(op, args);
            if (this.dirty) { this.dirty = false; await this.save(); }
            await this.schedule();
            return Response.json({ result });
        } catch (e) {
            if (e instanceof LobbyError) return Response.json({ error: { status: e.status, code: e.code, message: e.message } }, { status: e.status });
            throw e;
        }
    }

    private async save(): Promise<void> {
        await this.ctx.storage.put("state", { lobbies: [...this.lobbies.values()], next: this.next, notices: [...this.notices] });
    }

    // ---- the sockets of the pages ----
    private openSocket(request: Request, url: URL): Response {
        if (request.headers.get("Upgrade") !== "websocket") return new Response("a WebSocket is expected here", { status: 426 });
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment({ id: url.searchParams.get("a") || null, name: url.searchParams.get("n") || null, topics: [] } satisfies Attachment);
        const who = url.searchParams.get("a");
        if (who) this.presenceChanged(who);
        return new Response(null, { status: 101, webSocket: client });
    }
    private sockets(): { ws: WebSocket; at: Attachment }[] {
        return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN).map((ws) => ({ ws, at: (ws.deserializeAttachment() ?? { id: null, name: null, topics: [] }) as Attachment }));
    }
    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
        let data: any = null;
        try { data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message)); } catch { return; }
        if (data && Array.isArray(data.sub)) {                                                    // {sub: ["list", "lobby:L3", "chat:L3"]}: what this page wants to hear about
            const at = (ws.deserializeAttachment() ?? { id: null, name: null, topics: [] }) as Attachment;
            at.topics = data.sub.filter((t: unknown) => typeof t === "string" && /^[a-z]+(:[EL]\d{1,9})?$/.test(t)).slice(0, 10);
            ws.serializeAttachment(at);
        }
    }
    async webSocketClose(ws: WebSocket): Promise<void> { await this.socketGone(ws); }
    async webSocketError(ws: WebSocket): Promise<void> { await this.socketGone(ws); }
    private async socketGone(ws: WebSocket): Promise<void> {
        const at = (ws.deserializeAttachment() ?? null) as Attachment | null;
        try { ws.close(); } catch { /* closed already */ }
        if (at && at.id) { this.seen.set(at.id, { name: at.name ?? "", at: this.now() }); this.presenceChanged(at.id); }       // (it is online for another 45 s: a page that moves to another page reconnects within seconds)
        await this.schedule();
    }
    /** Somebody went online or away: the lobby they sit in shows their dot. */
    private presenceChanged(id: string): void {
        const lob = this.lobbyOf(id);
        if (lob) this.push(`lobby:${lob.id}`);
    }
    /** Tell every socket that listens to `topic` that it changed; `inbox` goes to the sockets of the account only. */
    private push(topic: string, account?: string): void {
        const msg = JSON.stringify({ type: "changed", topic });
        for (const { ws, at } of this.sockets()) {
            if (account !== undefined ? at.id === account : at.topics.includes(topic)) { try { ws.send(msg); } catch { /* going away */ } }
        }
    }
    /** After a change: the sockets of the lobbies that changed and of the list hear about it; the accounts concerned (members, invited, a notice for them) get an `inbox` poke. */
    private announce(before: Map<string, string>, noticesBefore: Map<string, number>): void {
        const changed: string[] = [];
        for (const [id, lob] of this.lobbies) if (before.get(id) !== JSON.stringify(lob)) changed.push(id);
        for (const id of before.keys()) if (!this.lobbies.has(id)) changed.push(id);
        const touched = new Set<string>();
        for (const id of changed) {
            const lob = this.lobbies.get(id) ?? (JSON.parse(before.get(id)!) as Lobby);
            for (const m of lob.seats) if (m) touched.add(m.id);
            for (const i of lob.invites) touched.add(i.to_id);
            const was = before.get(id) ? (JSON.parse(before.get(id)!) as Lobby) : null;
            if (was) { for (const m of was.seats) if (m) touched.add(m.id); for (const i of was.invites) touched.add(i.to_id); }
            this.push(`lobby:${id}`);
        }
        if (changed.length) this.push("list");
        for (const [acc, box] of this.notices) if (noticesBefore.get(acc) !== box.length) touched.add(acc);
        for (const acc of touched) this.push("inbox", acc);
    }
    /** The lobbies that wait for their host are checked every 30 s (a host who left is noticed without anybody asking). */
    private async schedule(): Promise<void> {
        const open = [...this.lobbies.values()].some((l) => l.status !== "started");
        const set = await this.ctx.storage.getAlarm();
        if (open && set === null) await this.ctx.storage.setAlarm(Date.now() + SWEEP_MS);
    }
    async alarm(): Promise<void> {
        const before = this.snapshot(), nb = this.noticeCounts();
        this.sweep();
        this.announce(before, nb);
        if (JSON.stringify([...this.snapshot()]) !== JSON.stringify([...before])) this.dirty = true;
        if (this.dirty) { this.dirty = false; await this.save(); }
        await this.schedule();
    }
    private snapshot(): Map<string, string> { return new Map([...this.lobbies].map(([id, l]) => [id, JSON.stringify(l)])); }
    private noticeCounts(): Map<string, number> { return new Map([...this.notices].map(([id, box]) => [id, box.length])); }

    run(op: string, a: Args): any {
        const before = this.snapshot(), nb = this.noticeCounts();
        try {
            return this.runOp(op, a);
        } finally {
            this.announce(before, nb);
        }
    }

    private runOp(op: string, a: Args): any {
        const m: Record<string, (a: Args) => any> = {
            create: (x) => this.create(x.account, x.settings ?? {}), list: (x) => this.list(x.account), get: (x) => this.getView(x.account, x.lobby_id), join: (x) => this.join(x.account, x.lobby_id, x.seat),
            leave: (x) => this.leave(x.account), kick: (x) => this.kick(x.account, x.lobby_id, x.target_id), invite: (x) => this.invite(x.account, x.lobby_id, x.username, x.seat),
            cancel_invite: (x) => this.cancelInvite(x.account, x.lobby_id, x.invite_id), answer: (x) => this.answer(x.account, x.invite_id, x.accept), inbox: (x) => this.inbox(x.account),
            online: (x) => this.online(x.account, x.q ?? ""), begin_start: (x) => this.beginStart(x.account, x.lobby_id), finish_start: (x) => this.finishStart(x.lobby_id, x.game_id, x.tokens),
            abort_start: (x) => this.abortStart(x.lobby_id), notify: (x) => this.notify(x.topic),
        };
        const anonymousOk = op === "list" || op === "get";                                    // (anybody may look: `account` is null for a visitor who is not logged in)
        if (op !== "finish_start" && op !== "abort_start" && op !== "notify" && !(a.account && typeof a.account.id === "string" && typeof a.account.username === "string") && !(anonymousOk && !a.account)) throw new LobbyError("send {account}", 422, "bad_request");
        const before = JSON.stringify([...this.lobbies.values()]) + this.next;
        const out = m[op](a);
        if (JSON.stringify([...this.lobbies.values()]) + this.next !== before) this.dirty = true;
        return out;
    }

    /** Somebody else's page wants the topic's sockets woken (Cloud Run tells it that a chat message was written). */
    private notify(topic: string): any {
        if (typeof topic === "string" && /^[a-z]+:[EL]\d{1,9}$/.test(topic)) this.push(topic);
        return { ok: true };
    }

    // ---- presence: an open socket, or (a page that polls) a recent call ----
    private heartbeat(a: Account): void { this.seen.set(a.id, { name: a.username, at: this.now() }); }
    private hasSocket(id: string): boolean { return this.sockets().some(({ at }) => at.id === id); }
    private lastSeen(id: string): number { return this.hasSocket(id) ? this.now() : (this.seen.get(id)?.at ?? 0); }
    private isOnline(id: string): boolean { return this.now() - this.lastSeen(id) <= ONLINE_SECONDS; }
    /** Everybody who is online: id -> name. */
    private presence(): Map<string, string> {
        const out = new Map<string, string>();
        const now = this.now();
        for (const [id, s] of this.seen) if (now - s.at <= ONLINE_SECONDS) out.set(id, s.name);
        for (const { at } of this.sockets()) if (at.id && at.name) out.set(at.id, at.name);
        return out;
    }
    private online(a: Account, q: string): any {
        const query = q.trim().toLowerCase();
        const names = [...this.presence()].filter(([id, n]) => id !== a.id && n.toLowerCase().startsWith(query)).map(([, n]) => n).sort();
        return { names: names.slice(0, 8) };
    }

    // ---- lobbies ----
    private sweep(): void {
        const now = this.now();
        for (const [id, lob] of [...this.lobbies]) {
            if (lob.status === "started") { if (now - (lob.started_at ?? 0) > STARTED_KEEP_SECONDS) this.lobbies.delete(id); continue; }
            lob.invites = lob.invites.filter((i) => i.status !== "pending" || now - i.at <= INVITE_SECONDS);
            const host = lob.seats[0]!;
            if (now - this.lastSeen(host.id) > IDLE_SECONDS) { this.close(lob, "its host left"); continue; }
            for (let k = 1; k < SEATS; k++) { const s = lob.seats[k]; if (s && now - this.lastSeen(s.id) > IDLE_SECONDS) lob.seats[k] = null; }
        }
    }
    private close(lob: Lobby, why: string): void {
        for (const m of lob.seats.slice(1)) if (m) this.tell(m.id, { type: "closed", lobby: lob.id, message: `The lobby of ${lob.seats[0]!.username} was closed: ${why}.` });
        this.lobbies.delete(lob.id);
    }
    private tell(id: string, notice: Record<string, unknown>): void {
        const box = this.notices.get(id) ?? [];
        box.push({ ...notice, at: this.now() });
        this.notices.set(id, box.slice(-NOTICE_KEEP));
        this.dirty = true;                                          // (kept in the storage: the object may sleep between the notice and the page's call)
    }
    private lobbyOf(id: string): Lobby | undefined {
        return [...this.lobbies.values()].find((l) => (l.status === "open" || l.status === "starting") && l.seats.some((m) => m && m.id === id));
    }
    private get(id: string): Lobby {
        const lob = this.lobbies.get(id);
        if (!lob) throw new LobbyError("No such lobby: it was closed.", 404, "no_lobby");
        return lob;
    }
    private member(lob: Lobby, a: Account): number {
        const k = lob.seats.findIndex((m) => m && m.id === a.id);
        if (k < 0) throw new LobbyError("You are not in this lobby.", 403, "not_member");
        return k;
    }
    private needHost(lob: Lobby, a: Account): void { if (this.member(lob, a) !== 0) throw new LobbyError("Only the host can do that.", 403, "not_host"); }
    private needOpen(lob: Lobby): void { if (lob.status !== "open") throw new LobbyError("This lobby has started.", 409, "started"); }

    private create(a: Account, s: Args): any {
        const mode = s.game_mode || "ark360";
        if (!MODES.includes(mode)) throw new LobbyError(`The game mode must be one of ${JSON.stringify(MODES)}.`, 422, "bad_mode");
        this.sweep(); this.heartbeat(a);
        if (this.lobbyOf(a.id)) throw new LobbyError("You are in a lobby already: leave it first.", 409, "in_lobby");
        this.next += 1;
        const lob: Lobby = { id: `L${this.next}`, mode, marine_worlds: !!s.marine_worlds, rated: !!s.rated, status: "open", created_at: this.now(), seats: [{ id: a.id, username: a.username }, null], invites: [], game: null };
        this.lobbies.set(lob.id, lob);
        return this.view(lob, a);
    }

    private row(lob: Lobby): any {
        const players = lob.seats.filter((m) => m).length;
        return { id: lob.id, host: lob.seats[0]!.username, players, seats: SEATS, mode: lob.mode, mode_label: MODE_LABELS[lob.mode] ?? lob.mode, marine_worlds: lob.marine_worlds, rated: lob.rated, full: players >= SEATS, created_at: lob.created_at };
    }

    /** The open lobbies and the games in progress; anybody may look (`a` null = a visitor who is not logged in). */
    private list(a: Account | null): any {
        this.sweep(); if (a) this.heartbeat(a);
        const rows = [...this.lobbies.values()].filter((l) => l.status === "open").map((l) => this.row(l)).sort((x, y) => y.created_at - x.created_at);
        const mine = a ? this.lobbyOf(a.id) : undefined;
        const games = [...this.lobbies.values()].filter((l) => l.status === "started" && l.game).sort((x, y) => (y.started_at ?? 0) - (x.started_at ?? 0)).map((l) => {
            const mineGame = !!a && l.seats.some((m) => m && m.id === a.id);             // (a player of the game goes back to it with their account)
            return { lobby: l.id, game_id: l.game!.game_id, players: l.seats.map((m) => m!.username), mode_label: MODE_LABELS[l.mode] ?? l.mode, marine_worlds: l.marine_worlds, rated: l.rated, started_at: l.started_at, mine: mineGame };
        });
        return { lobbies: rows, games, mine: mine ? mine.id : null, modes: MODES };
    }

    /** Anybody may look at a lobby, logged in or not (a link to it does not seat them: a logged-in player takes an empty seat, `join`). */
    private getView(a: Account | null, id: string): any {
        this.sweep(); if (a) this.heartbeat(a);
        return this.view(this.get(id), a);
    }

    private pendingOn(lob: Lobby, seat: number): Invite | undefined { return lob.invites.find((i) => i.status === "pending" && i.seat === seat); }

    private view(lob: Lobby, a: Account | null): any {
        const idx = a ? lob.seats.findIndex((m) => m && m.id === a.id) : -1;
        const k = idx < 0 ? null : idx;
        const out: any = {
            ...this.row(lob), status: lob.status, is_host: k === 0, is_member: k !== null, my_seat: k, you: a ? a.id : null, can_start: k === 0 && lob.seats.every((m) => m) && lob.status === "open",
            seats_detail: lob.seats.map((m, i) => {
                const inv = m ? undefined : this.pendingOn(lob, i);                      // (a pending seat shows the invited player, not yet seated)
                return { index: i, account_id: m ? m.id : null, username: m ? m.username : (inv ? inv.to_name : null), host: i === 0, online: !!m && this.isOnline(m.id), pending: !!inv };
            }),
        };
        if (k === 0) out.invites = lob.invites.filter((i) => i.status === "pending" || i.status === "declined").map((i) => ({ id: i.id, username: i.to_name, status: i.status, seat: i.seat }));
        if (lob.status === "started" && lob.game) out.game = { game_id: lob.game.game_id };      // (a member's page asks for its seat with its account; the others may watch the table)
        return out;
    }

    private join(a: Account, id: string, seat?: number): any {
        this.sweep(); this.heartbeat(a);
        return this.joinLobby(this.get(id), a, seat);
    }
    /** The player takes an empty seat: the one they click, or (an accepted invitation) the one the host offered. A seat with an invitation out is for the invited player only. */
    private joinLobby(lob: Lobby, a: Account, seat?: number | null): any {
        if (lob.seats.some((m) => m && m.id === a.id)) return this.view(lob, a);
        this.needOpen(lob);
        if (this.lobbyOf(a.id)) throw new LobbyError("You are in another lobby: leave it first.", 409, "in_lobby");
        const mine = lob.invites.find((i) => i.status === "pending" && i.to_id === a.id);
        if (seat === undefined || seat === null) seat = mine ? mine.seat : lob.seats.findIndex((m, k) => m === null && !this.pendingOn(lob, k));
        if (!Number.isInteger(seat) || (seat as number) < 0 || (seat as number) >= SEATS) throw new LobbyError("This lobby is full.", 409, "full");
        const s = seat as number;
        if (lob.seats[s] !== null) throw new LobbyError("That seat is taken.", 409, "taken");
        const held = this.pendingOn(lob, s);
        if (held && held.to_id !== a.id) throw new LobbyError("That seat has an invitation out for another player.", 409, "invited_seat");
        lob.seats[s] = { id: a.id, username: a.username };
        for (const i of lob.invites) if (i.to_id === a.id && i.status === "pending") i.status = "accepted";
        return this.view(lob, a);
    }

    private leave(a: Account): any {
        const lob = this.lobbyOf(a.id);
        if (!lob) return { left: false };
        if (lob.status === "starting") throw new LobbyError("The game is starting.", 409, "starting");
        if (lob.seats[0]!.id === a.id) this.close(lob, "the host left");
        else lob.seats[this.member(lob, a)] = null;
        return { left: true };
    }

    private kick(a: Account, id: string, target: string): any {
        const lob = this.get(id);
        this.needHost(lob, a); this.needOpen(lob);
        const k = lob.seats.findIndex((m) => m && m.id === target);
        if (k < 1) throw new LobbyError("There is nobody to remove there.", 404, "no_member");
        const gone = lob.seats[k]!;
        lob.seats[k] = null;
        this.tell(gone.id, { type: "removed", lobby: lob.id, message: `${a.username} removed you from the lobby.` });
        return this.view(lob, a);
    }

    // ---- invitations ----
    private invite(a: Account, id: string, username: string, seat?: number | null): any {
        this.sweep();
        const lob = this.get(id);
        this.needHost(lob, a); this.needOpen(lob);
        const name = (username ?? "").trim().toLowerCase();
        const target = [...this.presence()].find(([, n]) => name && n.toLowerCase() === name);
        if (!target) throw new LobbyError("That player is not online (only players who are logged in and on the site can be invited).", 404, "not_online");
        const [tid, tname] = target;
        if (tid === a.id || lob.seats.some((m) => m && m.id === tid)) throw new LobbyError("That player is in the lobby already.", 409, "in_lobby");
        if (lob.invites.some((i) => i.status === "pending" && i.to_id === tid)) throw new LobbyError("That player has been invited already.", 409, "invited");
        if (seat === undefined || seat === null) seat = lob.seats.findIndex((m, k) => m === null && !this.pendingOn(lob, k));           // (no seat named: the first empty seat without an invitation)
        if (!Number.isInteger(seat) || (seat as number) < 1 || (seat as number) >= SEATS || lob.seats[seat as number] !== null) throw new LobbyError("There is no empty seat to invite a player to.", 409, "no_empty_seat");
        if (this.pendingOn(lob, seat as number)) throw new LobbyError("That seat has an invitation out: wait for the answer or cancel it.", 409, "no_empty_seat");
        lob.invites.push({ id: crypto.randomUUID().replace(/-/g, "").slice(0, 12), to_id: tid, to_name: tname, seat: seat as number, status: "pending", at: this.now() });
        return this.view(lob, a);
    }

    private cancelInvite(a: Account, id: string, inviteId: string): any {
        const lob = this.get(id);
        this.needHost(lob, a);
        lob.invites = lob.invites.filter((i) => i.id !== inviteId);
        return this.view(lob, a);
    }

    private answer(a: Account, inviteId: string, accept: boolean): any {
        this.sweep(); this.heartbeat(a);
        for (const lob of this.lobbies.values()) {
            const inv = lob.invites.find((i) => i.id === inviteId && i.to_id === a.id && i.status === "pending");
            if (!inv) continue;
            if (accept) { this.joinLobby(lob, a, inv.seat); return { lobby: lob.id, accepted: true }; }       // (throws when the lobby is full or has started: the page shows that it is gone)
            inv.status = "declined";
            this.tell(lob.seats[0]!.id, { type: "declined", lobby: lob.id, by: a.username, message: `${a.username} declined your invitation.` });
            return { lobby: lob.id, accepted: false };
        }
        throw new LobbyError("That invitation is no longer open.", 404, "no_invite");
    }

    private inbox(a: Account): any {
        this.heartbeat(a); this.sweep();
        const invites = [...this.lobbies.values()].filter((l) => l.status === "open").flatMap((lob) => lob.invites.filter((i) => i.status === "pending" && i.to_id === a.id).map((i) => ({
            id: i.id, lobby: lob.id, host: lob.seats[0]!.username, mode: lob.mode, mode_label: MODE_LABELS[lob.mode] ?? lob.mode, marine_worlds: lob.marine_worlds, rated: lob.rated })));
        const notices = this.notices.get(a.id) ?? [];
        this.notices.delete(a.id);
        return { invites, notices };
    }

    // ---- starting: Cloud Run makes the table between begin_start and finish_start ----
    private beginStart(a: Account, id: string): any {
        this.sweep();
        const lob = this.get(id);
        this.needHost(lob, a); this.needOpen(lob);
        if (!lob.seats.every((m) => m)) throw new LobbyError("Both seats must be taken before the game can start.", 409, "not_full");
        lob.status = "starting";
        return { mode: lob.mode, marine_worlds: lob.marine_worlds, rated: lob.rated, seats: lob.seats.map((m) => ({ ...m! })) };
    }
    private finishStart(id: string, gameId: string, tokens: Record<string, string>): any {
        const lob = this.get(id);
        lob.status = "started"; lob.started_at = this.now(); lob.game = { game_id: gameId, tokens: { ...tokens } };
        for (const i of lob.invites) if (i.status === "pending") i.status = "expired";
        return { ok: true };
    }
    private abortStart(id: string): any {
        const lob = this.lobbies.get(id);
        if (lob && lob.status === "starting") lob.status = "open";
        return { ok: true };
    }
}
