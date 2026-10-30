import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sign } from "../src/auth";

// the same rules as tests/test_chat.py (the Python twin MemoryChat): a room keeps the last messages, checks the text and slows a sender down
const fetchWorker = (path: string, init?: RequestInit) => (exports as any).default.fetch(new Request("http://live" + path, init));
async function call(room: string, op: string, args: Record<string, unknown>): Promise<{ status: number; body: any }> {
    const path = `/internal/chat/${room}/${op}`, body = JSON.stringify(args);
    const res = await fetchWorker(path, { method: "POST", body, headers: await sign("test-secret", "POST", path, body) });
    return { status: res.status, body: await res.json() };
}
const post = (room: string, sender: string, text: unknown, extra: Record<string, unknown> = {}) => call(room, "post", { sender, name: sender, kind: "player", seat: 0, text, ...extra });
const later = (room: string, ms: number) => (env.CHAT.get(env.CHAT.idFromName(room)) as any).advance(ms);

describe("the chat rooms", () => {
    it("need the signature and a valid room and operation", async () => {
        const path = "/internal/chat/E1/list", body = "{}";
        expect((await fetchWorker(path, { method: "POST", body })).status).toBe(403);
        expect((await fetchWorker(path, { method: "GET" })).status).toBe(405);
        expect((await fetchWorker("/internal/chat/X1/list", { method: "POST", body, headers: await sign("test-secret", "POST", "/internal/chat/X1/list", body) })).status).toBe(404);
    });

    it("keeps the messages in order and lists what is newer than a number", async () => {
        const room = "E101";
        expect((await call(room, "list", {})).body.result).toEqual({ messages: [], last: 0 });
        const first = (await post(room, "a", "  hello  ")).body.result.message;
        expect(first).toMatchObject({ seq: 1, name: "a", kind: "player", seat: 0, text: "hello" });
        await later(room, 1000);
        await post(room, "b", "hi", { kind: "spectator", seat: null, name: "Carol" });
        const all = (await call(room, "list", {})).body.result;
        expect(all.messages.map((m: any) => [m.seq, m.name, m.kind, m.seat])).toEqual([[1, "a", "player", 0], [2, "Carol", "spectator", null]]);
        expect(all.last).toBe(2);
        expect((await call(room, "list", { since: 1 })).body.result.messages.map((m: any) => m.seq)).toEqual([2]);
    });

    it("checks the text and slows a sender down", async () => {
        const room = "L102";
        expect((await post(room, "a", "   ")).status).toBe(422);
        expect((await post(room, "a", "x".repeat(501))).status).toBe(422);
        expect((await post(room, "a", 5)).status).toBe(422);
        expect((await call(room, "post", { sender: "a", name: "a", kind: "robot", text: "x" })).status).toBe(422);
        expect((await post(room, "a", "ok")).status).toBe(200);
        const fast = await post(room, "a", "again");
        expect(fast.status).toBe(429);
        expect(fast.body.error.code).toBe("slow_down");
        expect((await post(room, "b", "someone else")).status).toBe(200);                          // (another sender is not slowed)
        await later(room, 1000);
        expect((await post(room, "a", "later")).status).toBe(200);
    });

    it("keeps only the last 300 messages", async () => {
        const room = "E103";
        for (let i = 0; i < 305; i++) { await later(room, 1000); await post(room, "a", "m" + i); }
        const got = (await call(room, "list", { since: 0 })).body.result;
        expect(got.last).toBe(305);
        expect(got.messages[0].seq).toBe(6);                                                      // (seq 1-5 are gone, the list is capped at 200 per call)
    }, 60000);
});
