// The chat of a lobby (L12) or of a table (E7): one Durable Object per room keeps the last messages. It holds no rule about who may write or read: Cloud Run decides that
// (a seat token or a logged-in account), checks the text and calls `POST /internal/chat/<room>/<post|list>` (signed like the other internal routes).
// `src/ark_nova/live/chat.py` (`MemoryChat`) is the twin of this file in Python for tests and the dev server: keep the two the same.
import { DurableObject } from "cloudflare:workers";

export const KEEP = 300;                   // the messages that are kept per room
export const MAX_TEXT = 500;
export const MIN_GAP_MS = 800;             // one sender writes at most one message in this time
export const ROOM_TTL_MS = 24 * 3600 * 1000;       // a room with no new message for this long is deleted

type Message = { seq: number; at: number; name: string; kind: "player" | "spectator"; seat: number | null; text: string };

export class Chat extends DurableObject<Env> {
    private last = new Map<string, number>();       // sender key -> the time of its last message (ms)
    /** Tests move the clock with this (milliseconds). */
    clockOffset = 0;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS messages (seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, seat INTEGER, text TEXT NOT NULL)");
    }

    private now(): number { return Date.now() + this.clockOffset; }
    async advance(ms: number): Promise<void> { this.clockOffset += ms; }

    async fetch(request: Request): Promise<Response> {
        const op = new URL(request.url).pathname.replace(/^\//, "");
        const body = (await request.json<Record<string, any>>().catch(() => null)) ?? {};
        if (request.method !== "POST" || (op !== "post" && op !== "list")) return Response.json({ error: { status: 404, code: "no_op", message: "no such operation" } }, { status: 404 });
        if (op === "list") return Response.json({ result: this.list(Number(body.since) || 0) });
        const text = typeof body.text === "string" ? body.text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim() : "";
        const name = typeof body.name === "string" ? body.name.slice(0, 40) : "";
        if (!text || text.length > MAX_TEXT || !name || (body.kind !== "player" && body.kind !== "spectator") || typeof body.sender !== "string")
            return Response.json({ error: { status: 422, code: "bad_message", message: `Write a message of 1 to ${MAX_TEXT} characters.` } }, { status: 422 });
        const now = this.now(), key = body.sender;
        if (now - (this.last.get(key) ?? 0) < MIN_GAP_MS) return Response.json({ error: { status: 429, code: "slow_down", message: "You are writing too fast." } }, { status: 429 });
        this.last.set(key, now);
        if (this.last.size > 200) this.last.clear();
        const seat = Number.isInteger(body.seat) ? body.seat : null;
        const seq = this.ctx.storage.sql.exec<{ seq: number }>("INSERT INTO messages (at, name, kind, seat, text) VALUES (?, ?, ?, ?, ?) RETURNING seq", now, name, body.kind, seat, text).one().seq;
        this.ctx.storage.sql.exec("DELETE FROM messages WHERE seq <= ?", seq - KEEP);
        await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
        return Response.json({ result: { message: { seq, at: now, name, kind: body.kind, seat, text } } });
    }

    private list(since: number): { messages: Message[]; last: number } {
        const rows = this.ctx.storage.sql.exec<Message>("SELECT seq, at, name, kind, seat, text FROM messages WHERE seq > ? ORDER BY seq LIMIT 200", since).toArray();
        const last = this.ctx.storage.sql.exec<{ m: number | null }>("SELECT MAX(seq) AS m FROM messages").one().m ?? 0;
        return { messages: rows, last };
    }

    async alarm(): Promise<void> { await this.ctx.storage.deleteAll(); }
}
