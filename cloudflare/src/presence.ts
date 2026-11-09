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
        // The busiest sample of each hour, kept up to date by sample(): the long views of the online page read these (at most 336 rows) instead of every 5-minute sample (4032 rows).
        const fresh = ctx.storage.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'hourly'").toArray().length === 0;
        ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS hourly (hour INTEGER PRIMARY KEY, users INTEGER NOT NULL, replay INTEGER NOT NULL, fork INTEGER NOT NULL, play INTEGER NOT NULL, sandbox INTEGER NOT NULL, other INTEGER NOT NULL)");
        if (fresh) ctx.storage.sql.exec("INSERT INTO hourly SELECT (at / 3600000) * 3600000, MAX(users), MAX(replay), MAX(fork), MAX(play), MAX(sandbox), MAX(other) FROM history GROUP BY (at / 3600000)");       // (once: the samples taken before this table existed)
    }

    private seenSize: number | null = null;                                  // (the number of ids in `seen`, kept in memory: counting them with every new id read the whole table)
    private cached = new Map<number, { at: number; value: { perHour: any[]; day: number; samples: any[]; step: number } }>();        // (the history part of `online`, per `hours`: the page asks every 30 s)

    private now(): number { return Date.now() + this.clockOffset; }
    async advance(ms: number): Promise<void> { this.clockOffset += ms; this.counted = null; this.cached.clear(); }

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
        if (!known) {
            this.seenSize ??= this.ctx.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM seen").one().n;
            if (this.seenSize >= MAX_IDS) return Response.json({ error: "full" }, { status: 429 });
            this.seenSize++;
        }
        this.counted = null;
        this.ctx.storage.sql.exec("INSERT INTO seen (id, page, at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET page = excluded.page, at = excluded.at", id, page, this.now());
        if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + SAMPLE_MS);
        return Response.json({ ok: true });
    }

    private counted: { at: number; value: { users: number } & Record<Page, number> } | null = null;       // (the count of the people online, kept for 15 s and dropped by every heartbeat)

    private count(): { users: number } & Record<Page, number> {
        if (this.counted && Date.now() - this.counted.at < 15000) return this.counted.value;
        const value = this.countNow();
        this.counted = { at: Date.now(), value };
        return value;
    }

    private countNow(): { users: number } & Record<Page, number> {
        const out = { users: 0, replay: 0, fork: 0, play: 0, sandbox: 0, other: 0 };
        for (const r of this.ctx.storage.sql.exec<{ page: Page; n: number }>("SELECT page, COUNT(*) AS n FROM seen WHERE at > ? GROUP BY page", this.now() - WINDOW_MS)) {
            out[r.page] = r.n;
            out.users += r.n;
        }
        return out;
    }

    /** Keeps a sample of the count and forgets what is old. Returns whether anybody was seen lately (then the next sample is scheduled). */
    async sample(): Promise<boolean> {
        const now = this.now(), c = this.countNow();
        this.ctx.storage.sql.exec("INSERT OR REPLACE INTO history (at, users, replay, fork, play, sandbox, other) VALUES (?, ?, ?, ?, ?, ?, ?)", now, c.users, c.replay, c.fork, c.play, c.sandbox, c.other);
        const hour = Math.floor(now / 3600000) * 3600000;
        this.ctx.storage.sql.exec("INSERT INTO hourly (hour, users, replay, fork, play, sandbox, other) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(hour) DO UPDATE SET users = MAX(users, excluded.users), replay = MAX(replay, excluded.replay), fork = MAX(fork, excluded.fork), play = MAX(play, excluded.play), sandbox = MAX(sandbox, excluded.sandbox), other = MAX(other, excluded.other)", hour, c.users, c.replay, c.fork, c.play, c.sandbox, c.other);
        this.ctx.storage.sql.exec("DELETE FROM hourly WHERE hour < ?", now - KEEP_HISTORY_MS);
        this.ctx.storage.sql.exec("DELETE FROM seen WHERE at < ?", now - KEEP_SEEN_MS);
        this.seenSize = null;
        this.cached.clear();
        this.ctx.storage.sql.exec("DELETE FROM history WHERE at < ?", now - KEEP_HISTORY_MS);
        return c.users > 0;
    }

    private online(args: Record<string, unknown>) {
        const hours = Math.min(Math.max(Math.floor(Number(args.hours)) || 48, 1), 24 * 14), now = this.now();
        const c = this.count();
        const h = this.history(hours, now);
        return { now, window_s: WINDOW_MS / 1000, online: c.users, by_page: { replay: c.replay, fork: c.fork, play: c.play, sandbox: c.sandbox, other: c.other },
                 peak_24h: Math.max(h.day, c.users), hourly_peaks: h.perHour, step_ms: h.step, samples: h.samples };
    }

    /** The part of `online` that comes from the stored samples. Short views read the 5-minute samples (at most 576 rows), long ones the hourly peaks (at most 336); the answer is kept for a while
     *  (30 s, 5 minutes for the long views) and dropped when a new sample is taken, so an open page that asks every 30 s does not read the same rows again and again. */
    private history(hours: number, now: number) {
        const hit = this.cached.get(hours), ttl = SAMPLE_MS;                       // (the samples change only when sample() runs, which drops the cache: until then the answer is the same)
        if (hit && Date.now() - hit.at < ttl) return hit.value;
        const sql = this.ctx.storage.sql, since = now - hours * 3600 * 1000, step = hours > 48 ? 3600 * 1000 : SAMPLE_MS;
        type Row = { at: number; users: number; replay: number; fork: number; play: number; sandbox: number; other: number };
        const perHour = sql.exec<{ hour: number; peak: number }>("SELECT hour, users AS peak FROM hourly WHERE hour + 3600000 > ? ORDER BY hour", since).toArray();
        const day = sql.exec<{ peak: number | null }>("SELECT MAX(users) AS peak FROM hourly WHERE hour + 3600000 > ?", now - 24 * 3600 * 1000).one().peak ?? 0;
        // the timeline: every sample (5 minutes apart) for up to 2 days, the busiest sample of each hour beyond that. A gap is a time when nobody was there (sampling pauses then).
        const rows: Row[] = hours > 48
            ? sql.exec<Row>("SELECT hour AS at, users, replay, fork, play, sandbox, other FROM hourly WHERE hour + 3600000 > ? ORDER BY hour", since).toArray()
            : sql.exec<Row>("SELECT at, users, replay, fork, play, sandbox, other FROM history WHERE at > ? ORDER BY at", since).toArray();
        const buckets = new Map<number, Row>();
        for (const r of rows) {
            const b = Math.floor(r.at / step), m = buckets.get(b);
            buckets.set(b, m ? { at: b * step, users: Math.max(m.users, r.users), replay: Math.max(m.replay, r.replay), fork: Math.max(m.fork, r.fork), play: Math.max(m.play, r.play), sandbox: Math.max(m.sandbox, r.sandbox), other: Math.max(m.other, r.other) } : { ...r, at: b * step });
        }
        const value = { perHour, day, samples: [...buckets.values()], step };
        this.cached.set(hours, { at: Date.now(), value });
        return value;
    }

    async alarm(): Promise<void> {
        if (await this.sample()) await this.ctx.storage.setAlarm(Date.now() + SAMPLE_MS);       // (nobody lately: no alarm until the next heartbeat)
    }
}
