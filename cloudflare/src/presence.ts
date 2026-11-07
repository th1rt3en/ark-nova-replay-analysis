// Who is on the site right now: the pages send an anonymous heartbeat (a random id kept in the browser, no account, no address) every minute while a tab is on show and
// the person is active (web/js/presence.js). One Durable Object keeps the last time each id was seen and a sample of the count every 5 minutes, so the number survives a
// restart of Cloud Run (it is not involved: a heartbeat never wakes it) and the history reaches back 14 days.
//   POST /presence                   public, from the pages: { id, page }
//   POST /internal/presence/online   signed by Cloud Run: the count now, by page, and the busiest sample of each hour
import { DurableObject } from "cloudflare:workers";

export const WINDOW_MS = 3 * 60 * 1000;               // an id seen in this time is online
export const SAMPLE_MS = 5 * 60 * 1000;               // a sample of the count is kept this often while there is activity
export const KEEP_SEEN_MS = 60 * 60 * 1000;
export const KEEP_HISTORY_MS = 14 * 24 * 3600 * 1000;
export const MAX_IDS = 50000;                         // (a flood of made-up ids cannot grow the table without end)
export const PAGES = ["replay", "fork", "play", "sandbox", "other"] as const;
type Page = (typeof PAGES)[number];

const ID = /^[A-Za-z0-9_-]{16,40}$/;

export class Presence extends DurableObject<Env> {
    /** Tests move the clock with this (milliseconds). */
    clockOffset = 0;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY, page TEXT NOT NULL, at INTEGER NOT NULL)");
        ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS history (at INTEGER PRIMARY KEY, users INTEGER NOT NULL, replay INTEGER NOT NULL, fork INTEGER NOT NULL, play INTEGER NOT NULL, sandbox INTEGER NOT NULL, other INTEGER NOT NULL)");
    }

    private now(): number { return Date.now() + this.clockOffset; }
    async advance(ms: number): Promise<void> { this.clockOffset += ms; }

    async fetch(request: Request): Promise<Response> {
        const op = new URL(request.url).pathname.replace(/^\//, "");
        if (request.method !== "POST") return Response.json({ error: "wrong method" }, { status: 405 });
        if (op === "beat") return this.beat(await request.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>));
        if (op === "online") return Response.json({ result: this.online(await request.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)) });
        return Response.json({ error: "no such operation" }, { status: 404 });
    }

    private async beat(body: Record<string, unknown>): Promise<Response> {
        const id = typeof body.id === "string" ? body.id : "";
        const page: Page = (PAGES as readonly string[]).includes(body.page as string) ? (body.page as Page) : "other";
        if (!ID.test(id)) return Response.json({ error: "bad id" }, { status: 422 });
        const known = this.ctx.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM seen WHERE id = ?", id).one().n;
        if (!known && this.ctx.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM seen").one().n >= MAX_IDS) return Response.json({ error: "full" }, { status: 429 });
        this.ctx.storage.sql.exec("INSERT INTO seen (id, page, at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET page = excluded.page, at = excluded.at", id, page, this.now());
        if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + SAMPLE_MS);
        return Response.json({ ok: true });
    }

    private count(): { users: number } & Record<Page, number> {
        const out = { users: 0, replay: 0, fork: 0, play: 0, sandbox: 0, other: 0 };
        for (const r of this.ctx.storage.sql.exec<{ page: Page; n: number }>("SELECT page, COUNT(*) AS n FROM seen WHERE at > ? GROUP BY page", this.now() - WINDOW_MS)) {
            out[r.page] = r.n;
            out.users += r.n;
        }
        return out;
    }

    /** Keeps a sample of the count and forgets what is old. Returns whether anybody was seen lately (then the next sample is scheduled). */
    async sample(): Promise<boolean> {
        const now = this.now(), c = this.count();
        this.ctx.storage.sql.exec("INSERT OR REPLACE INTO history (at, users, replay, fork, play, sandbox, other) VALUES (?, ?, ?, ?, ?, ?, ?)", now, c.users, c.replay, c.fork, c.play, c.sandbox, c.other);
        this.ctx.storage.sql.exec("DELETE FROM seen WHERE at < ?", now - KEEP_SEEN_MS);
        this.ctx.storage.sql.exec("DELETE FROM history WHERE at < ?", now - KEEP_HISTORY_MS);
        return c.users > 0;
    }

    private online(args: Record<string, unknown>) {
        const hours = Math.min(Math.max(Math.floor(Number(args.hours)) || 48, 1), 24 * 14), now = this.now();
        const c = this.count();
        const perHour = this.ctx.storage.sql.exec<{ hour: number; peak: number }>(
            "SELECT (at / 3600000) * 3600000 AS hour, MAX(users) AS peak FROM history WHERE at > ? GROUP BY hour ORDER BY hour", now - hours * 3600 * 1000).toArray();
        const day = this.ctx.storage.sql.exec<{ peak: number | null }>("SELECT MAX(users) AS peak FROM history WHERE at > ?", now - 24 * 3600 * 1000).one().peak ?? 0;
        return { now, window_s: WINDOW_MS / 1000, online: c.users, by_page: { replay: c.replay, fork: c.fork, play: c.play, sandbox: c.sandbox, other: c.other },
                 peak_24h: Math.max(day, c.users), hourly_peaks: perHour };
    }

    async alarm(): Promise<void> {
        if (await this.sample()) await this.ctx.storage.setAlarm(Date.now() + SAMPLE_MS);       // (nobody lately: no alarm until the next heartbeat)
    }
}
