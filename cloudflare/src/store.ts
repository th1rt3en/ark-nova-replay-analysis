// The account and mini game tables in D1 (docs/accounts_plan.md), as named operations behind `POST /internal/store/<op>`, signed like the other internal routes.
// There is no SQL from outside: Cloud Run sends an operation and its arguments, this file holds every statement. The rules (names, passwords, scoring) stay in Cloud Run.
//
// An answer is `{ result }`; a refusal that the caller must tell apart is `{ error: "<code>" }` with status 409 (a taken username, a taken BGA id).

type Args = Record<string, any>;
type Op = (db: D1Database, a: Args) => Promise<unknown>;

const ACCOUNT_FIELDS = ["id", "id_source", "username", "username_lower", "password_hash", "recovery_hash", "created_at", "last_login_at", "bga_elo_seed", "rating", "rated_games", "rated_wins"];

export class Conflict extends Error {
    constructor(public code: string) { super(code); }
}

const str = (v: unknown): string => { if (typeof v !== "string") throw new Error("a string was expected"); return v; };
const optStr = (v: unknown): string | null => (v === null || v === undefined ? null : str(v));
const num = (v: unknown): number => { if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("a number was expected"); return v; };
const optNum = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
const strs = (v: unknown): string[] => { if (!Array.isArray(v)) throw new Error("a list was expected"); return v.map(str); };

const first = async (db: D1Database, sql: string, ...args: unknown[]) => (await db.prepare(sql).bind(...args).first()) ?? null;

async function createAccount(db: D1Database, a: Args): Promise<unknown> {
    const acc = a.account;
    const bgaId = optStr(a.bga_id);
    const values = [bgaId === null ? "new" : "bga", str(acc.username), str(acc.username_lower), str(acc.password_hash), str(acc.recovery_hash), str(acc.created_at), str(acc.last_login_at ?? ""), optNum(acc.bga_elo_seed), num(acc.rating ?? 0), 0, 0];
    const cols = ACCOUNT_FIELDS.join(", ");
    try {
        if (bgaId === null) {                                                      // a new player: the counter and the insert are one batch, so a refused name does not use a number
            await db.batch([
                db.prepare("INSERT INTO counters (name, value) VALUES ('account_p', 1) ON CONFLICT(name) DO UPDATE SET value = value + 1"),
                db.prepare(`INSERT INTO accounts (${cols}) SELECT 'P' || value, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM counters WHERE name = 'account_p'`).bind(...values),
            ]);
        } else {
            await db.prepare(`INSERT INTO accounts (${cols}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(bgaId, ...values).run();
        }
    } catch (e) {
        const m = String((e as Error).message);
        if (m.includes("accounts.username_lower")) throw new Conflict("username_taken");
        if (m.includes("accounts.id")) throw new Conflict("id_taken");
        throw e;
    }
    return first(db, "SELECT * FROM accounts WHERE username_lower = ?", str(acc.username_lower));
}

const OPS: Record<string, Op> = {
    // ---- accounts
    "acct.create": createAccount,
    "acct.by_id": (db, a) => first(db, "SELECT * FROM accounts WHERE id = ?", str(a.id)),
    "acct.by_username": (db, a) => first(db, "SELECT * FROM accounts WHERE username_lower = ?", str(a.username_lower)),
    "acct.held_ids": async (db, a) => {
        const ids = strs(a.ids);
        if (!ids.length) return [];
        const rows = await db.prepare(`SELECT id FROM accounts WHERE id IN (${ids.map(() => "?").join(", ")})`).bind(...ids).all<{ id: string }>();
        return rows.results.map((r) => r.id);
    },
    "acct.usernames": async (db, a) => {
        const ids = strs(a.ids);
        if (!ids.length) return [];
        return (await db.prepare(`SELECT id, username FROM accounts WHERE id IN (${ids.map(() => "?").join(", ")})`).bind(...ids).all<{ id: string; username: string }>()).results;
    },
    "acct.set_passwords": async (db, a) => { await db.prepare("UPDATE accounts SET password_hash = ?, recovery_hash = ? WHERE id = ?").bind(str(a.password_hash), str(a.recovery_hash), str(a.id)).run(); return null; },
    "acct.touch_login": async (db, a) => { await db.prepare("UPDATE accounts SET last_login_at = ? WHERE id = ?").bind(str(a.at), str(a.id)).run(); return null; },
    "acct.add_session": async (db, a) => {
        const s = a.session;
        await db.prepare("INSERT OR REPLACE INTO sessions (token_hash, account_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)").bind(str(s.token_hash), str(s.account_id), str(s.created_at), str(s.expires_at), str(s.user_agent ?? "")).run();
        return null;
    },
    "acct.get_session": (db, a) => first(db, "SELECT * FROM sessions WHERE token_hash = ?", str(a.token_hash)),
    "acct.extend_session": async (db, a) => { await db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").bind(str(a.expires_at), str(a.token_hash)).run(); return null; },
    "acct.delete_session": async (db, a) => { await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(str(a.token_hash)).run(); return null; },
    "acct.delete_sessions_of": async (db, a) => { await db.prepare("DELETE FROM sessions WHERE account_id = ?").bind(str(a.account_id)).run(); return null; },

    // ---- ratings, the ratings board, deleting an account
    "rating.of": async (db, a) => {
        const ids = strs(a.ids);
        if (!ids.length) return [];
        return (await db.prepare(`SELECT id, rating, rated_games, rated_wins FROM accounts WHERE id IN (${ids.map(() => "?").join(", ")})`).bind(...ids).all()).results;
    },
    // The two changes of one game, all or nothing. Every statement is guarded: the first only when the game has no rating yet and both ratings are still the `before` ones, the others only when
    // the one before changed a row (`changes()`), so nothing is written twice and nothing is written half. Answers "applied", "exists" or "changed".
    "rating.commit": async (db, a) => {
        const game = str(a.game_id), ch = a.changes as any[];
        if (!Array.isArray(ch) || ch.length !== 2) throw new Error("two changes were expected");
        const ratingsStill = ch.map((c) => `(SELECT rating FROM accounts WHERE id = ?) = ?`).join(" AND ");
        const guardArgs = ch.flatMap((c) => [str(c.account_id), num(c.before)]);
        const insert = (c: any, first: boolean) => db.prepare(
            `INSERT INTO rating_history (game_id, account_id, seat, opponent_id, result, rating_before, rating_after, delta, k, at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${first ? "NOT EXISTS (SELECT 1 FROM rating_history WHERE game_id = ?)" : "changes() > 0"} AND ${ratingsStill}`)
            .bind(game, str(c.account_id), num(c.seat), str(c.opponent_id), num(c.result), num(c.before), num(c.after), num(c.after) - num(c.before), num(c.k), str(c.at), ...(first ? [game] : []), ...guardArgs);
        const update = (c: any) => db.prepare("UPDATE accounts SET rating = ?, rated_games = rated_games + 1, rated_wins = rated_wins + ? WHERE id = ? AND changes() > 0 AND rating = ?")
            .bind(num(c.after), num(c.result) === 1 ? 1 : 0, str(c.account_id), num(c.before));
        const out = await db.batch([insert(ch[0], true), insert(ch[1], false), update(ch[0]), update(ch[1])]);
        if (out[0].meta.changes > 0 && out[1].meta.changes > 0 && out[2].meta.changes > 0 && out[3].meta.changes > 0) return "applied";
        return (await first(db, "SELECT 1 AS x FROM rating_history WHERE game_id = ?", game)) ? "exists" : "changed";
    },
    "rating.changes": async (db, a) => (await db.prepare("SELECT * FROM rating_history WHERE game_id = ? ORDER BY seat").bind(str(a.game_id)).all()).results,
    "rating.history": async (db, a) => (await db.prepare("SELECT * FROM rating_history WHERE account_id = ? ORDER BY at DESC LIMIT ?").bind(str(a.account_id), Math.min(100, num(a.limit))).all()).results,
    "rating.board": async (db, a) => (await db.prepare("SELECT id, username, rating, rated_games, rated_wins FROM accounts WHERE rated_games >= ? AND deleted_at = '' ORDER BY rating DESC, rated_games DESC, id LIMIT ?")
        .bind(num(a.min_games), Math.min(200, num(a.limit))).all()).results,
    "acct.delete": async (db, a) => {
        const id = str(a.id);
        await db.batch([
            db.prepare("UPDATE accounts SET username = 'Deleted player', username_lower = ?, password_hash = '', recovery_hash = '', deleted_at = ? WHERE id = ?").bind("deleted:" + id, str(a.at), id),
            db.prepare("DELETE FROM sessions WHERE account_id = ?").bind(id),
        ]);
        return null;
    },

    // ---- mini games
    "mg.get_puzzle": (db, a) => first(db, "SELECT * FROM minigame_puzzles WHERE game_key = ? AND day = ?", str(a.game_key), str(a.day)),
    "mg.create_puzzle": async (db, a) => {
        const p = a.puzzle;
        const out = await db.batch([
            db.prepare("INSERT OR IGNORE INTO minigame_puzzles (game_key, day, source_ref, moment, builder_version, public_cache, created_at, answer_cache) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(str(p.game_key), str(p.day), num(p.source_ref), str(p.moment), str(p.builder_version ?? ""), optStr(p.public_cache), str(p.created_at ?? ""), optStr(p.answer_cache)),
            db.prepare("INSERT OR IGNORE INTO minigame_used_sources (game_key, source_ref) SELECT ?, ? WHERE changes() > 0").bind(str(p.game_key), num(p.source_ref)),
        ]);
        return out[0].meta.changes > 0;
    },
    "mg.used_sources": async (db, a) => (await db.prepare("SELECT source_ref FROM minigame_used_sources WHERE game_key = ?").bind(str(a.game_key)).all<{ source_ref: number }>()).results.map((r) => r.source_ref),
    "mg.set_public_cache": async (db, a) => { await db.prepare("UPDATE minigame_puzzles SET public_cache = ?, builder_version = ?, answer_cache = NULL WHERE game_key = ? AND day = ?").bind(str(a.public_cache), str(a.builder_version), str(a.game_key), str(a.day)).run(); return null; },
    "mg.set_answer_cache": async (db, a) => { await db.prepare("UPDATE minigame_puzzles SET answer_cache = ? WHERE game_key = ? AND day = ?").bind(str(a.answer_cache), str(a.game_key), str(a.day)).run(); return null; },
    "mg.puzzle_days": async (db, a) => (await db.prepare("SELECT day FROM minigame_puzzles WHERE game_key = ? AND day LIKE ? ORDER BY day").bind(str(a.game_key), str(a.month) + "-%").all<{ day: string }>()).results.map((r) => r.day),
    "mg.get_submission": (db, a) => {
        const account = optStr(a.account_id), anon = optStr(a.anon_id);
        if (account !== null) return first(db, "SELECT * FROM minigame_submissions WHERE game_key = ? AND day = ? AND account_id = ?", str(a.game_key), str(a.day), account);
        if (anon !== null) return first(db, "SELECT * FROM minigame_submissions WHERE game_key = ? AND day = ? AND account_id IS NULL AND anon_id = ?", str(a.game_key), str(a.day), anon);
        return Promise.resolve(null);
    },
    "mg.player_scores": async (db, a) => {
        const account = optStr(a.account_id), anon = optStr(a.anon_id), month = str(a.month) + "-%";
        if (account !== null) return (await db.prepare("SELECT day, score FROM minigame_submissions WHERE game_key = ? AND day LIKE ? AND account_id = ?").bind(str(a.game_key), month, account).all()).results;
        if (anon !== null) return (await db.prepare("SELECT day, score FROM minigame_submissions WHERE game_key = ? AND day LIKE ? AND account_id IS NULL AND anon_id = ?").bind(str(a.game_key), month, anon).all()).results;
        return [];
    },
    "mg.add_submission": async (db, a) => {
        const s = a.submission;
        try {
            await db.prepare("INSERT INTO minigame_submissions (game_key, day, account_id, anon_id, payload, score, detail, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(str(s.game_key), str(s.day), optStr(s.account_id), optStr(s.anon_id), str(s.payload), num(s.score), str(s.detail ?? "{}"), str(s.submitted_at)).run();
            return true;
        } catch (e) {
            if (String((e as Error).message).includes("UNIQUE")) return false;
            throw e;
        }
    },
    "mg.submissions": async (db, a) => {
        let sql = "SELECT * FROM minigame_submissions WHERE game_key = ?";
        const args: unknown[] = [str(a.game_key)];
        if (a.day != null) { sql += " AND day = ?"; args.push(str(a.day)); }
        if (a.month != null) { sql += " AND submitted_at LIKE ?"; args.push(str(a.month) + "%"); }
        if (a.ranked_only) sql += " AND account_id IS NOT NULL";
        return (await db.prepare(sql + " ORDER BY id").bind(...args).all()).results;
    },
    "mg.purge": async (db, a) => {
        const k = str(a.game_key);
        await db.batch(["minigame_puzzles", "minigame_used_sources", "minigame_submissions"].map((t) => db.prepare(`DELETE FROM ${t} WHERE game_key = ?`).bind(k)));
        return null;
    },
};

/** Runs one operation; the caller has already checked the signature. */
export async function runStoreOp(db: D1Database, op: string, args: Args): Promise<Response> {
    const fn = OPS[op];
    if (!fn) return Response.json({ status: "error", message: "no such operation" }, { status: 404 });
    try {
        return Response.json({ result: await fn(db, args) });
    } catch (e) {
        if (e instanceof Conflict) return Response.json({ error: e.code }, { status: 409 });
        return Response.json({ status: "error", message: String((e as Error).message) }, { status: 422 });
    }
}
