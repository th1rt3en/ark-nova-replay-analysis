import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { sign } from "../src/auth";

beforeAll(async () => { await applyD1Migrations(env.DB, env.TEST_MIGRATIONS); });

const fetchWorker = (path: string, init?: RequestInit) => (exports as any).default.fetch(new Request("http://live" + path, init));
async function op(name: string, args: Record<string, unknown>): Promise<{ status: number; body: any }> {
    const path = "/internal/store/" + name, body = JSON.stringify(args);
    const res = await fetchWorker(path, { method: "POST", body, headers: await sign("test-secret", "POST", path, body) });
    return { status: res.status, body: await res.json() };
}
const account = (username: string, extra: Record<string, unknown> = {}) => ({ id_source: "new", username, username_lower: username.toLowerCase(), password_hash: "h", recovery_hash: "r", created_at: "2026-10-10T00:00:00+00:00", last_login_at: "", bga_elo_seed: null, rating: 0, ...extra });

describe("the signature", () => {
    it("is required, fresh and for this path", async () => {
        const path = "/internal/store/acct.by_id", body = '{"id":"x"}';
        expect((await fetchWorker(path, { method: "POST", body })).status).toBe(403);
        expect((await fetchWorker(path, { method: "POST", body, headers: await sign("wrong", "POST", path, body) })).status).toBe(403);
        expect((await fetchWorker(path, { method: "POST", body, headers: await sign("test-secret", "POST", "/internal/store/acct.by_username", body) })).status).toBe(403);
        expect((await fetchWorker(path, { method: "POST", body, headers: await sign("test-secret", "POST", path, body, Math.floor(Date.now() / 1000) - 3600) })).status).toBe(403);
        expect((await fetchWorker(path, { method: "GET" })).status).toBe(405);
        expect((await op("no.such_op", {})).status).toBe(404);
    });
});

describe("accounts", () => {
    it("allocates P ids in order and refuses a taken username without using a number", async () => {
        const a = await op("acct.create", { account: account("Alice"), bga_id: null });
        const b = await op("acct.create", { account: account("Bob"), bga_id: null });
        expect([a.body.result.id, b.body.result.id]).toEqual(["P1", "P2"]);
        const dup = await op("acct.create", { account: account("alice"), bga_id: null });
        expect(dup.status).toBe(409);
        expect(dup.body.error).toBe("username_taken");
        expect((await op("acct.create", { account: account("Carol"), bga_id: null })).body.result.id).toBe("P3");
    });

    it("takes a BGA id once", async () => {
        const x = await op("acct.create", { account: account("Xiao93", { bga_elo_seed: 447.53, rating: 447.53 }), bga_id: "89107474" });
        expect(x.body.result).toMatchObject({ id: "89107474", id_source: "bga", rating: 447.53, bga_elo_seed: 447.53 });
        const again = await op("acct.create", { account: account("Another"), bga_id: "89107474" });
        expect(again.status).toBe(409);
        expect(again.body.error).toBe("id_taken");
        expect((await op("acct.held_ids", { ids: ["89107474", "5", "P1"] })).body.result.sort()).toEqual(["89107474", "P1"]);
        expect((await op("acct.held_ids", { ids: [] })).body.result).toEqual([]);
    });

    it("finds, updates and keeps sessions", async () => {
        const got = (await op("acct.by_username", { username_lower: "alice" })).body.result;
        expect(got).toMatchObject({ id: "P1", username: "Alice" });
        expect((await op("acct.by_id", { id: "nope" })).body.result).toBeNull();
        await op("acct.set_passwords", { id: "P1", password_hash: "h2", recovery_hash: "r2" });
        await op("acct.touch_login", { id: "P1", at: "2026-10-11T00:00:00+00:00" });
        expect((await op("acct.by_id", { id: "P1" })).body.result).toMatchObject({ password_hash: "h2", recovery_hash: "r2", last_login_at: "2026-10-11T00:00:00+00:00" });
        for (const t of ["t1", "t2"]) await op("acct.add_session", { session: { token_hash: t, account_id: "P1", created_at: "c", expires_at: "e", user_agent: "ua" } });
        await op("acct.extend_session", { token_hash: "t1", expires_at: "later" });
        expect((await op("acct.get_session", { token_hash: "t1" })).body.result).toMatchObject({ account_id: "P1", expires_at: "later" });
        await op("acct.delete_session", { token_hash: "t1" });
        expect((await op("acct.get_session", { token_hash: "t1" })).body.result).toBeNull();
        await op("acct.delete_sessions_of", { account_id: "P1" });
        expect((await op("acct.get_session", { token_hash: "t2" })).body.result).toBeNull();
    });

    it("refuses what it cannot read", async () => {
        expect((await op("acct.by_id", { id: 5 })).status).toBe(422);
    });
});

const puzzle = (game: string, day: string, source: number) => ({ game_key: game, day, source_ref: source, moment: '{"seat":1}', builder_version: "1", public_cache: '{"cards":[]}', created_at: "t", answer_cache: '{"keep":["a"]}' });
const sub = (game: string, day: string, account: string | null, anon: string | null, score: number, at = "2026-10-10T10:00:00+00:00") => ({ game_key: game, day, account_id: account, anon_id: anon, payload: '{"picks":[]}', score, detail: "{}", submitted_at: at });

describe("mini games", () => {
    it("creates a puzzle once per game and day and remembers the source", async () => {
        expect((await op("mg.create_puzzle", { puzzle: puzzle("g", "2026-10-10", 111) })).body.result).toBe(true);
        expect((await op("mg.create_puzzle", { puzzle: puzzle("g", "2026-10-10", 222) })).body.result).toBe(false);
        expect((await op("mg.used_sources", { game_key: "g" })).body.result).toEqual([111]);                       // the refused one was not remembered
        expect((await op("mg.create_puzzle", { puzzle: puzzle("h", "2026-10-10", 111) })).body.result).toBe(true);   // another game may use the same table
        expect((await op("mg.get_puzzle", { game_key: "g", day: "2026-10-10" })).body.result).toMatchObject({ source_ref: 111, moment: '{"seat":1}', answer_cache: '{"keep":["a"]}' });
        expect((await op("mg.get_puzzle", { game_key: "g", day: "2026-10-11" })).body.result).toBeNull();
        await op("mg.set_public_cache", { game_key: "g", day: "2026-10-10", public_cache: '{"v":2}', builder_version: "2" });
        expect((await op("mg.get_puzzle", { game_key: "g", day: "2026-10-10" })).body.result).toMatchObject({ public_cache: '{"v":2}', builder_version: "2", answer_cache: null });      // a new payload clears the answer
        await op("mg.set_answer_cache", { game_key: "g", day: "2026-10-10", answer_cache: '{"keep":["b"]}' });
        expect((await op("mg.get_puzzle", { game_key: "g", day: "2026-10-10" })).body.result.answer_cache).toBe('{"keep":["b"]}');
        await op("mg.create_puzzle", { puzzle: puzzle("g", "2026-10-12", 333) });
        expect((await op("mg.puzzle_days", { game_key: "g", month: "2026-10" })).body.result).toEqual(["2026-10-10", "2026-10-12"]);
        expect((await op("mg.puzzle_days", { game_key: "g", month: "2026-09" })).body.result).toEqual([]);
    });

    it("accepts one submission per account and per anonymous id", async () => {
        expect((await op("mg.add_submission", { submission: sub("g", "2026-10-10", "P1", null, 3) })).body.result).toBe(true);
        expect((await op("mg.add_submission", { submission: sub("g", "2026-10-10", "P1", null, 4) })).body.result).toBe(false);
        expect((await op("mg.add_submission", { submission: sub("g", "2026-10-10", null, "anon-1", 2) })).body.result).toBe(true);
        expect((await op("mg.add_submission", { submission: sub("g", "2026-10-10", null, "anon-1", 2) })).body.result).toBe(false);
        expect((await op("mg.add_submission", { submission: sub("g", "2026-10-11", "P1", null, 1, "2026-11-01T00:00:00+00:00") })).body.result).toBe(true);
        expect((await op("mg.get_submission", { game_key: "g", day: "2026-10-10", account_id: "P1", anon_id: null })).body.result.score).toBe(3);
        expect((await op("mg.get_submission", { game_key: "g", day: "2026-10-10", account_id: null, anon_id: "anon-1" })).body.result.score).toBe(2);
        expect((await op("mg.get_submission", { game_key: "g", day: "2026-10-10", account_id: null, anon_id: "anon-2" })).body.result).toBeNull();
        expect((await op("mg.get_submission", { game_key: "g", day: "2026-10-10", account_id: null, anon_id: null })).body.result).toBeNull();
    });

    it("lists submissions by day, by the month of the submission and by ranked only", async () => {
        const all = (await op("mg.submissions", { game_key: "g" })).body.result;
        expect(all.length).toBe(3);
        expect((await op("mg.submissions", { game_key: "g", day: "2026-10-10" })).body.result.length).toBe(2);
        expect((await op("mg.submissions", { game_key: "g", month: "2026-11" })).body.result.length).toBe(1);
        expect((await op("mg.submissions", { game_key: "g", ranked_only: true })).body.result.every((r: any) => r.account_id !== null)).toBe(true);
    });

    it("purges one game and leaves the others", async () => {
        await op("mg.purge", { game_key: "g" });
        expect((await op("mg.submissions", { game_key: "g" })).body.result).toEqual([]);
        expect((await op("mg.used_sources", { game_key: "g" })).body.result).toEqual([]);
        expect((await op("mg.get_puzzle", { game_key: "h", day: "2026-10-10" })).body.result).toMatchObject({ source_ref: 111 });
    });
});
