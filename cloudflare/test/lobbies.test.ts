import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sign } from "../src/auth";

// the same rules as tests/test_lobbies.py (the Python twin MemoryLobbies): the Durable Object holds the lobbies, the presence of the players and the invitations
const fetchWorker = (path: string, init?: RequestInit) => (exports as any).default.fetch(new Request("http://live" + path, init));
const A = { id: "P1", username: "Alice" }, B = { id: "P2", username: "Bob" }, C = { id: "P3", username: "Carol" };

async function call(op: string, args: Record<string, unknown>): Promise<{ status: number; body: any }> {
    const path = "/internal/lobbies/" + op, body = JSON.stringify(args);
    const res = await fetchWorker(path, { method: "POST", body, headers: await sign("test-secret", "POST", path, body) });
    return { status: res.status, body: await res.json() };
}
const ok = async (op: string, args: Record<string, unknown>) => { const r = await call(op, args); expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body.result; };
const fresh = (n: string) => ({ A: { id: n + "A", username: "Alice-" + n }, B: { id: n + "B", username: "Bob-" + n }, C: { id: n + "C", username: "Carol-" + n } });   // (the object is shared by the tests: every test uses its own accounts and names)

describe("the signature", () => {
    it("is required, and only the known operations exist", async () => {
        const path = "/internal/lobbies/list", body = JSON.stringify({ account: A });
        expect((await fetchWorker(path, { method: "POST", body })).status).toBe(403);
        expect((await fetchWorker(path, { method: "GET" })).status).toBe(405);
        expect((await call("nothing", { account: A })).status).toBe(404);
        expect((await call("list", {})).status).toBe(422);
    });
});

describe("lobbies", () => {
    it("lists a lobby with its host, players and mode and only ark360 can be made", async () => {
        const { A: a, B: b, C: c } = fresh("l1");
        const made = await ok("create", { account: a, settings: { marine_worlds: true } });
        expect(made).toMatchObject({ is_host: true, players: 1, mode: "ark360", marine_worlds: true, can_start: false });
        const row = (await ok("list", { account: b })).lobbies.find((l: any) => l.id === made.id);
        expect(row).toMatchObject({ host: a.username, players: 1, seats: 2, mode_label: "Ark360", full: false });
        expect((await ok("list", { account: a })).mine).toBe(made.id);
        expect((await call("create", { account: a, settings: {} })).status).toBe(409);
        expect((await call("create", { account: c, settings: { game_mode: "original" } })).status).toBe(422);
    });

    it("joins, starts in two steps and keeps the tokens of the table", async () => {
        const { A: a, B: b, C: c } = fresh("l2");
        const lob = await ok("create", { account: a, settings: {} });
        expect((await call("begin_start", { account: a, lobby_id: lob.id })).body.error.code).toBe("not_full");
        const looked = await ok("get", { account: b, lobby_id: lob.id });                           // (a link to the lobby shows it: it does not seat the visitor)
        expect(looked).toMatchObject({ is_member: false, my_seat: null, players: 1 });
        expect(looked.invites).toBeUndefined();
        const joined = await ok("join", { account: b, lobby_id: lob.id, seat: 1 });
        expect(joined).toMatchObject({ full: true, is_host: false, can_start: false });
        expect((await call("join", { account: c, lobby_id: lob.id, seat: 1 })).body.error.code).toBe("taken");
        expect((await call("begin_start", { account: b, lobby_id: lob.id })).status).toBe(403);
        const info = await ok("begin_start", { account: a, lobby_id: lob.id });
        expect(info.seats.map((s: any) => s.username)).toEqual([a.username, b.username]);
        expect((await call("join", { account: c, lobby_id: lob.id, seat: 1 })).status).toBe(409);        // (locked while the table is made)
        await ok("abort_start", { lobby_id: lob.id });
        expect((await ok("get", { account: a, lobby_id: lob.id })).status).toBe("open");
        await ok("begin_start", { account: a, lobby_id: lob.id });
        await ok("finish_start", { lobby_id: lob.id, game_id: "E7", tokens: { [a.id]: "ta", [b.id]: "tb" } });
        expect((await ok("get", { account: a, lobby_id: lob.id })).game).toEqual({ game_id: "E7", token: "ta" });
        expect((await ok("get", { account: b, lobby_id: lob.id })).game).toEqual({ game_id: "E7", token: "tb" });
        expect((await ok("list", { account: c })).lobbies.some((l: any) => l.id === lob.id)).toBe(false);
        expect((await ok("get", { account: c, lobby_id: lob.id })).game).toEqual({ game_id: "E7" });      // (a visitor may watch the table, without a token)
    });

    it("lets the host remove a player, who is told once, and a player leave", async () => {
        const { A: a, B: b } = fresh("l3");
        const lob = await ok("create", { account: a, settings: {} });
        await ok("join", { account: b, lobby_id: lob.id, seat: 1 });
        expect((await call("kick", { account: b, lobby_id: lob.id, target_id: b.id })).status).toBe(403);
        expect((await ok("kick", { account: a, lobby_id: lob.id, target_id: b.id })).players).toBe(1);
        expect((await ok("inbox", { account: b })).notices.map((n: any) => n.type)).toEqual(["removed"]);
        expect((await ok("inbox", { account: b })).notices).toEqual([]);
        await ok("join", { account: b, lobby_id: lob.id, seat: 1 });
        expect(await ok("leave", { account: b })).toEqual({ left: true });
        expect(await ok("leave", { account: a })).toEqual({ left: true });
        expect((await call("get", { account: a, lobby_id: lob.id })).status).toBe(404);
    });
});

describe("invitations", () => {
    it("reaches an online player who accepts, and a declined one tells the host", async () => {
        const { A: a, B: b, C: c } = fresh("i1");
        const lob = await ok("create", { account: a, settings: {} });
        expect((await ok("online", { account: a, q: "bob-i1" })).names).toEqual([]);                  // Bob has not asked yet: not online
        await ok("inbox", { account: b }); await ok("inbox", { account: c });
        expect((await ok("online", { account: a, q: "bob-i1" })).names).toEqual(["Bob-i1"]);
        expect((await call("invite", { account: a, lobby_id: lob.id, username: "Nobody" })).status).toBe(404);
        const sent = await ok("invite", { account: a, lobby_id: lob.id, username: "bob-i1" });
        expect(sent.invites[0].status).toBe("pending");
        expect(sent.seats_detail[1]).toMatchObject({ account_id: null, username: b.username, pending: true });        // the seat shows Bob, not yet seated
        expect(sent.players).toBe(1);
        expect((await call("invite", { account: a, lobby_id: lob.id, username: c.username })).status).toBe(409);        // the only empty seat has an invitation out
        expect((await call("join", { account: c, lobby_id: lob.id, seat: 1 })).body.error.code).toBe("invited_seat");
        const box = await ok("inbox", { account: b });
        expect(box.invites).toHaveLength(1);
        expect(box.invites[0]).toMatchObject({ host: a.username, mode_label: "Ark360" });
        expect((await ok("inbox", { account: c })).invites).toEqual([]);
        const inv = box.invites[0];
        expect((await call("answer", { account: c, invite_id: inv.id, accept: true })).status).toBe(404);
        expect(await ok("answer", { account: b, invite_id: inv.id, accept: false })).toEqual({ lobby: lob.id, accepted: false });
        const told = (await ok("inbox", { account: a })).notices;
        expect(told.map((n: any) => [n.type, n.by])).toEqual([["declined", b.username]]);
        const afterNo = await ok("get", { account: a, lobby_id: lob.id });
        expect(afterNo.invites).toEqual([{ id: inv.id, username: b.username, status: "declined", seat: 1 }]);
        expect(afterNo.seats_detail[1]).toEqual({ index: 1, account_id: null, username: null, host: false, online: false, pending: false });      // the seat looks empty again
        const again = await ok("invite", { account: a, lobby_id: lob.id, username: b.username });          // the seat can be offered again
        const inv2 = (await ok("inbox", { account: b })).invites[0];
        expect(again.invites.some((i: any) => i.status === "pending")).toBe(true);
        expect(await ok("answer", { account: b, invite_id: inv2.id, accept: true })).toEqual({ lobby: lob.id, accepted: true });
        expect((await ok("get", { account: b, lobby_id: lob.id })).players).toBe(2);
    });

    it("keeps a seat for the invited player, and a lobby whose host is gone closes", async () => {
        const { A: a, B: b, C: c } = fresh("i2");
        const lob = await ok("create", { account: a, settings: {} });
        await ok("inbox", { account: b }); await ok("inbox", { account: c });
        expect((await call("join", { account: c, lobby_id: lob.id, seat: 0 })).body.error.code).toBe("taken");     // the host's seat
        await ok("invite", { account: a, lobby_id: lob.id, username: b.username, seat: 1 });
        const inv = (await ok("inbox", { account: b })).invites[0];
        expect((await call("join", { account: c, lobby_id: lob.id, seat: 1 })).status).toBe(409);          // the seat is Bob's
        await ok("answer", { account: b, invite_id: inv.id, accept: true });
        const after = await ok("get", { account: a, lobby_id: lob.id });
        expect(after).toMatchObject({ players: 2, can_start: true });
        expect(after.seats_detail[1]).toMatchObject({ pending: false, username: b.username });             // the filter is gone
        await ok("leave", { account: b });
        await ok("join", { account: c, lobby_id: lob.id, seat: 1 });                                      // (a visitor takes the empty seat by choosing it)
        await (env.LOBBIES.get(env.LOBBIES.idFromName("lobbies")) as any).advance(200);                   // nobody asks for 200 s
        const told = (await ok("inbox", { account: c })).notices;                                         // (Carol is seen again, Alice is not)
        expect(told.map((n: any) => n.type)).toEqual(["closed"]);
        expect((await ok("list", { account: c })).lobbies.some((l: any) => l.id === lob.id)).toBe(false);
    });
});
