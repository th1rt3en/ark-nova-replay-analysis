// The Table Durable Object: the keeper of one game (docs/live_game_plan.md, 3.2 / 3.3 / 3.5).
//
// It orders the moves, stores them in its own SQLite database and pushes the new view to every open WebSocket. It knows no rule: Cloud Run decides whether a move is
// legal, applies it with the engine and sends the result (`/append`) together with the views of both seats and of the spectators. Nothing else runs on the object while
// a request is handled, and an append is one SQLite transaction, so the version check needs no lock.
//
// Internal routes (reached through the Worker, which has checked the signature of Cloud Run):
//   POST /init       {config, engine_version, seats: [{token_hash}, {token_hash}], views?, snapshot?}      create the table (version 0, status `waiting`)
//   POST /config     {patch}: merge keys into the stored config (the maps and the viewer header once the players have chosen their maps; `abandon` = the proposal to
//                    abandon and the cooldowns, which is also pushed to the sockets as {type: "abandon"})
//   GET  /state      latest snapshot + the actions since, the game row, the seat hashes                      what Cloud Run folds to get the state
//   POST /append     {expected_version, request_id, action, step, views, snapshot?, status?, end_reason?, registry_event?}
//   GET  /view?seat= the latest stored view of 0 | 1 | spectator
//   GET  /request?id= the version a request id was appended at (a retry after a lost answer asks this), 404 when it is not known
//   POST /seat       {seat, name}                                                                            a player took a seat
//   POST /status     {status, end_reason?, registry_event?}                                                  concede, abandon, error, ...
//   GET  /record     every action and step (for the export to GCS)
//   GET  /registry, POST /registry/ack {up_to_seq}                                                           registry events BigQuery has not acknowledged
//   POST /finalize   delete everything (after the export is confirmed)
// The WebSocket is `GET /ws?s=<seat token>` (no token: a spectator).
import { DurableObject } from "cloudflare:workers";
import { sha256Hex, timingSafeEqual } from "./auth";

export const FINAL_STATUSES = ["finished", "conceded", "abandoned", "error"];
const ROLES = ["0", "1", "spectator"];
const SNAPSHOT_EVERY = 25;

class HttpError extends Error {
    constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
        super(message);
    }
}

const json = (data: unknown, status = 200): Response => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export class Table extends DurableObject<Env> {
    private sql: SqlStorage;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        this.sql = ctx.storage.sql;
        ctx.blockConcurrencyWhile(async () => this.createSchema());
    }

    private createSchema() {
        {
            this.sql.exec(`
                CREATE TABLE IF NOT EXISTS game (
                    id INTEGER PRIMARY KEY CHECK (id = 1), config TEXT NOT NULL, engine_version TEXT NOT NULL, status TEXT NOT NULL, end_reason TEXT,
                    version INTEGER NOT NULL, seat_hash_0 TEXT NOT NULL, seat_hash_1 TEXT NOT NULL, name_0 TEXT, name_1 TEXT, created_at INTEGER NOT NULL, ended_at INTEGER);
                CREATE TABLE IF NOT EXISTS actions (n INTEGER PRIMARY KEY, action TEXT NOT NULL, request_id TEXT NOT NULL, at INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS steps (n INTEGER PRIMARY KEY, step TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS views (role TEXT PRIMARY KEY, version INTEGER NOT NULL, payload TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS snapshots (version INTEGER PRIMARY KEY, state TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS requests (request_id TEXT PRIMARY KEY, version INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS registry_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, acked INTEGER NOT NULL DEFAULT 0);
            `);
        }
    }

    // ---- HTTP -----------------------------------------------------------------------------------------------------------------------------
    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        try {
            if (url.pathname === "/ws") return await this.openSocket(request, url);
            const body = request.method === "POST" ? await request.json<any>().catch(() => { throw new HttpError(400, "the body must be JSON"); }) : null;
            switch (`${request.method} ${url.pathname}`) {
                case "POST /init": return json(this.init(body));
                case "POST /config": return json(this.patchConfig(body));
                case "GET /state": return json(this.state());
                case "POST /append": return this.append(body);
                case "GET /view": return this.view(url.searchParams.get("seat") ?? "");
                case "GET /request": return this.requestResult(url.searchParams.get("id") ?? "");
                case "POST /seat": return json(this.seat(body));
                case "POST /status": return json(this.setStatus(body));
                case "GET /record": return json(this.record());
                case "GET /registry": return json({ events: this.sql.exec("SELECT seq, payload FROM registry_events WHERE acked = 0 ORDER BY seq").toArray().map((r) => ({ seq: r.seq, event: JSON.parse(r.payload as string) })) });
                case "POST /registry/ack": this.sql.exec("UPDATE registry_events SET acked = 1 WHERE seq <= ?", Number(body.up_to_seq)); return json({ ok: true });
                case "POST /finalize": return json(await this.finalize());
                default: throw new HttpError(404, `no route ${request.method} ${url.pathname}`);
            }
        } catch (e) {
            if (e instanceof HttpError) return json({ status: "error", message: e.message, ...e.extra }, e.status);
            throw e;
        }
    }

    private game() {
        const rows = this.sql.exec("SELECT * FROM game WHERE id = 1").toArray();
        if (!rows.length) throw new HttpError(404, "no such table");
        return rows[0] as Record<string, any>;
    }

    private init(body: any) {
        if (this.sql.exec("SELECT 1 FROM game").toArray().length) throw new HttpError(409, "the table already exists");
        const seats = body?.seats;
        if (!body?.config || !body?.engine_version || !Array.isArray(seats) || seats.length !== 2 || !seats.every((s: any) => typeof s?.token_hash === "string")) {
            throw new HttpError(422, "send {config, engine_version, seats: [{token_hash}, {token_hash}]}");
        }
        const now = Date.now();
        this.ctx.storage.transactionSync(() => {
            this.sql.exec("INSERT INTO game (id, config, engine_version, status, version, seat_hash_0, seat_hash_1, created_at) VALUES (1, ?, ?, 'waiting', 0, ?, ?, ?)",
                JSON.stringify(body.config), String(body.engine_version), seats[0].token_hash, seats[1].token_hash, now);
            this.storeViews(body.views, 0);
            if (body.snapshot) this.sql.exec("INSERT INTO snapshots (version, state) VALUES (0, ?)", JSON.stringify(body.snapshot.state));
            if (body.registry_event) this.sql.exec("INSERT INTO registry_events (payload) VALUES (?)", JSON.stringify(body.registry_event));
        });
        return { version: 0 };
    }

    private patchConfig(body: any) {
        const g = this.game();
        if (!body?.patch || typeof body.patch !== "object") throw new HttpError(422, "send {patch}");
        this.sql.exec("UPDATE game SET config = ? WHERE id = 1", JSON.stringify({ ...JSON.parse(g.config), ...body.patch }));
        if ("abandon" in body.patch) {                                            // a proposal to abandon was made, answered or withdrawn: the sockets show it at once
            const a = body.patch.abandon ?? {};
            const msg = JSON.stringify({ type: "abandon", proposal: a.proposal ?? null, cooldown: a.cooldown ?? {}, now: Date.now() });
            for (const ws of this.ctx.getWebSockets()) ws.send(msg);
        }
        return { ok: true };
    }

    private state() {
        const g = this.game();
        const snap = this.sql.exec("SELECT version, state FROM snapshots ORDER BY version DESC LIMIT 1").toArray()[0];
        const since = snap ? Number(snap.version) : 0;
        const actions = this.sql.exec("SELECT n, action FROM actions WHERE n > ? ORDER BY n", since).toArray().map((r) => ({ n: r.n, action: JSON.parse(r.action as string) }));
        return {
            version: g.version, status: g.status, end_reason: g.end_reason, engine_version: g.engine_version, config: JSON.parse(g.config), created_at: g.created_at, ended_at: g.ended_at,
            seats: [{ name: g.name_0, token_hash: g.seat_hash_0 }, { name: g.name_1, token_hash: g.seat_hash_1 }],
            snapshot: snap ? { version: snap.version, state: JSON.parse(snap.state as string) } : null, actions,
        };
    }

    private storeViews(views: Record<string, unknown> | undefined, version: number) {
        for (const [role, payload] of Object.entries(views ?? {})) {
            if (!ROLES.includes(role)) throw new HttpError(422, `unknown view ${role}`);
            this.sql.exec("INSERT INTO views (role, version, payload) VALUES (?, ?, ?) ON CONFLICT(role) DO UPDATE SET version = excluded.version, payload = excluded.payload",
                role, version, JSON.stringify(payload));
        }
    }

    private append(body: any): Response {
        if (typeof body?.request_id !== "string" || !Number.isInteger(body?.expected_version) || body.action === undefined || !body.views) {
            throw new HttpError(422, "send {expected_version, request_id, action, step, views}");
        }
        let outcome: { version: number; duplicate: boolean };
        this.ctx.storage.transactionSync(() => {
            const done = this.sql.exec("SELECT version FROM requests WHERE request_id = ?", body.request_id).toArray()[0];
            if (done) { outcome = { version: Number(done.version), duplicate: true }; return; }               // a retry after a lost answer: the stored result
            const g = this.game();
            if (FINAL_STATUSES.includes(g.status)) throw new HttpError(409, "the table has ended", { status_now: g.status });
            if (g.version !== body.expected_version) throw new HttpError(409, "stale version", { current_version: g.version });
            const n = g.version + 1, now = Date.now();
            this.sql.exec("INSERT INTO actions (n, action, request_id, at) VALUES (?, ?, ?, ?)", n, JSON.stringify(body.action), body.request_id, now);
            this.sql.exec("INSERT INTO steps (n, step) VALUES (?, ?)", n, JSON.stringify(body.step ?? null));
            this.storeViews(body.views, n);
            if (body.snapshot) this.sql.exec("INSERT OR REPLACE INTO snapshots (version, state) VALUES (?, ?)", n, JSON.stringify(body.snapshot.state));
            this.sql.exec("INSERT INTO requests (request_id, version) VALUES (?, ?)", body.request_id, n);
            this.sql.exec("UPDATE game SET version = ? WHERE id = 1", n);
            if (body.status) this.applyStatus(body.status, body.end_reason, now);
            if (body.registry_event) this.sql.exec("INSERT INTO registry_events (payload) VALUES (?)", JSON.stringify(body.registry_event));
            outcome = { version: n, duplicate: false };
        });
        if (!outcome!.duplicate) this.broadcast();
        return json({ ...outcome!, snapshot_due: outcome!.version % SNAPSHOT_EVERY === 0 });
    }

    private applyStatus(status: string, endReason: string | undefined, now: number) {
        this.sql.exec("UPDATE game SET status = ?, end_reason = COALESCE(?, end_reason), ended_at = CASE WHEN ? THEN ? ELSE ended_at END WHERE id = 1",
            status, endReason ?? null, FINAL_STATUSES.includes(status) ? 1 : 0, now);
    }

    private setStatus(body: any) {
        if (typeof body?.status !== "string") throw new HttpError(422, "send {status}");
        const g = this.game();
        if (FINAL_STATUSES.includes(g.status)) throw new HttpError(409, "the table has ended", { status_now: g.status });
        this.ctx.storage.transactionSync(() => {
            this.applyStatus(body.status, body.end_reason, Date.now());
            if (body.registry_event) this.sql.exec("INSERT INTO registry_events (payload) VALUES (?)", JSON.stringify(body.registry_event));
        });
        this.broadcastStatus();
        return { status: body.status };
    }

    private seat(body: any) {
        if (![0, 1].includes(body?.seat) || typeof body?.name !== "string" || !body.name.trim()) throw new HttpError(422, "send {seat: 0 | 1, name}");
        this.game();
        this.sql.exec(`UPDATE game SET name_${body.seat} = ? WHERE id = 1`, body.name.trim().slice(0, 40));
        const g = this.game();
        this.broadcastLobby();
        return { names: [g.name_0, g.name_1] };
    }

    private view(role: string): Response {
        if (!ROLES.includes(role)) throw new HttpError(422, "seat must be 0, 1 or spectator");
        const row = this.sql.exec("SELECT version, payload FROM views WHERE role = ?", role).toArray()[0];
        if (!row) throw new HttpError(404, "no view yet");
        return json({ version: row.version, ...JSON.parse(row.payload as string) });
    }

    private requestResult(id: string): Response {
        this.game();
        const row = this.sql.exec("SELECT version FROM requests WHERE request_id = ?", id).toArray()[0];
        if (!row) throw new HttpError(404, "no such request");
        return json({ version: row.version });
    }

    private record() {
        const g = this.game();
        return {
            game: { config: JSON.parse(g.config), engine_version: g.engine_version, status: g.status, end_reason: g.end_reason, version: g.version, names: [g.name_0, g.name_1], created_at: g.created_at, ended_at: g.ended_at },
            actions: this.sql.exec("SELECT n, action, request_id, at FROM actions ORDER BY n").toArray().map((r) => ({ n: r.n, action: JSON.parse(r.action as string), request_id: r.request_id, at: r.at })),
            steps: this.sql.exec("SELECT n, step FROM steps ORDER BY n").toArray().map((r) => ({ n: r.n, step: JSON.parse(r.step as string) })),
        };
    }

    private async finalize() {
        this.game();
        for (const ws of this.ctx.getWebSockets()) ws.close(1000, "the table is closed");
        await this.ctx.storage.deleteAll();
        this.createSchema();                                                         // (an empty table again: every later call answers "no such table")
        return { deleted: true };
    }

    // ---- WebSockets (hibernation API: an idle table costs nothing) -------------------------------------------------------------------------
    private async openSocket(request: Request, url: URL): Promise<Response> {
        if (request.headers.get("Upgrade") !== "websocket") throw new HttpError(426, "a WebSocket is expected here");
        const g = this.game();
        const token = url.searchParams.get("s");
        let role = "spectator";
        if (token) {
            const h = await sha256Hex(token);
            role = timingSafeEqual(h, g.seat_hash_0) ? "0" : timingSafeEqual(h, g.seat_hash_1) ? "1" : "";
            if (!role) throw new HttpError(403, "unknown seat token");
        }
        const pair = new WebSocketPair();
        this.ctx.acceptWebSocket(pair[1], [role]);
        pair[1].send(this.hello(role));
        return new Response(null, { status: 101, webSocket: pair[0] });
    }

    private hello(role: string): string {
        const g = this.game();
        const row = this.sql.exec("SELECT version, payload FROM views WHERE role = ?", role).toArray()[0];
        return JSON.stringify(row ? { type: "state", version: row.version, status: g.status, ...JSON.parse(row.payload as string) } : { type: "waiting", status: g.status, names: [g.name_0, g.name_1] });
    }

    private broadcast() {
        const g = this.game();
        const views = new Map<string, string>();
        for (const r of this.sql.exec("SELECT role, version, payload FROM views").toArray()) {
            views.set(r.role as string, JSON.stringify({ type: "state", version: r.version, status: g.status, ...JSON.parse(r.payload as string) }));
        }
        for (const ws of this.ctx.getWebSockets()) {
            const role = this.ctx.getTags(ws)[0];
            const msg = views.get(role);
            if (msg) ws.send(msg);
        }
    }

    private broadcastStatus() {
        const g = this.game();
        const msg = JSON.stringify({ type: "status", status: g.status, end_reason: g.end_reason });
        for (const ws of this.ctx.getWebSockets()) ws.send(msg);
    }

    private broadcastLobby() {
        const g = this.game();
        const msg = JSON.stringify({ type: "lobby", names: [g.name_0, g.name_1], status: g.status });
        for (const ws of this.ctx.getWebSockets()) ws.send(msg);
    }

    webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
        if (message === "ping") ws.send("pong");                                  // (the page keeps the socket alive with it; nothing else is accepted from a browser)
    }

    webSocketClose(ws: WebSocket, code: number): void {
        try { ws.close(code, "bye"); } catch { /* already closed */ }
    }
}
