import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sha256Hex, sign } from "../src/auth";

let counter = 0;
const newTable = () => env.TABLE.get(env.TABLE.idFromName("T" + ++counter + "-" + Math.random()));
const call = async (stub: DurableObjectStub, method: string, path: string, body?: unknown) => {
    const res = await stub.fetch("http://table" + path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as any };
};
const views = (n: number) => ({ "0": { view: { for: 0, n }, decision: { n } }, "1": { view: { for: 1, n } }, spectator: { view: { for: "spectator", n } } });
const move = (expected: number, id: string, extra: Record<string, unknown> = {}) => ({ expected_version: expected, request_id: id, action: { kind: "x", n: expected + 1 }, step: { label: "step " + (expected + 1) }, views: views(expected + 1), ...extra });

async function created(token0 = "tok0", token1 = "tok1") {
    const stub = newTable();
    const r = await call(stub, "POST", "/init", { config: { seed: 7, maps: ["1", "2"] }, engine_version: "1.0.0", seats: [{ token_hash: await sha256Hex(token0) }, { token_hash: await sha256Hex(token1) }], views: views(0) });
    expect(r.status).toBe(200);
    return stub;
}

describe("the Table Durable Object", () => {
    it("is created once and answers its state", async () => {
        const stub = await created();
        expect((await call(stub, "POST", "/init", { config: {}, engine_version: "1", seats: [{ token_hash: "a" }, { token_hash: "b" }] })).status).toBe(409);
        const s = await call(stub, "GET", "/state");
        expect(s.body).toMatchObject({ version: 0, status: "waiting", engine_version: "1.0.0", config: { seed: 7 }, snapshot: null, actions: [] });
        expect((await call(newTable(), "GET", "/state")).status).toBe(404);
        expect((await call(await created(), "POST", "/init", { config: {} })).status).toBe(409);
    });

    it("appends moves in order and refuses a stale version", async () => {
        const stub = await created();
        expect((await call(stub, "POST", "/append", move(0, "r1"))).body.version).toBe(1);
        expect((await call(stub, "POST", "/append", move(1, "r2"))).body.version).toBe(2);
        const stale = await call(stub, "POST", "/append", move(1, "r3"));
        expect(stale.status).toBe(409);
        expect(stale.body.current_version).toBe(2);
        const s = (await call(stub, "GET", "/state")).body;
        expect(s.version).toBe(2);
        expect(s.actions.map((a: any) => a.n)).toEqual([1, 2]);
    });

    it("completes its config on request", async () => {
        const stub = await created();
        expect((await call(stub, "POST", "/config", { patch: { maps: ["3", "4"] } })).status).toBe(200);
        expect((await call(stub, "GET", "/state")).body.config).toEqual({ seed: 7, maps: ["3", "4"] });
        expect((await call(stub, "POST", "/config", {})).status).toBe(422);
    });

    it("repeats the stored answer for a request id it already has", async () => {
        const stub = await created();
        await call(stub, "POST", "/append", move(0, "same"));
        const again = await call(stub, "POST", "/append", move(0, "same"));
        expect(again.status).toBe(200);
        expect(again.body).toMatchObject({ version: 1, duplicate: true });
        expect((await call(stub, "GET", "/state")).body.version).toBe(1);
        expect((await call(stub, "GET", "/request?id=same")).body.version).toBe(1);
        expect((await call(stub, "GET", "/request?id=other")).status).toBe(404);
    });

    it("lets exactly one of two simultaneous moves on the same version in", async () => {
        const stub = await created();
        const results = await Promise.all([call(stub, "POST", "/append", move(0, "a")), call(stub, "POST", "/append", move(0, "b"))]);
        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        expect((await call(stub, "GET", "/state")).body.version).toBe(1);
    });

    it("keeps the latest view of each seat and the snapshot, and state returns only the actions since the snapshot", async () => {
        const stub = await created();
        await call(stub, "POST", "/append", move(0, "r1"));
        await call(stub, "POST", "/append", move(1, "r2", { snapshot: { state: { s: 2 } } }));
        await call(stub, "POST", "/append", move(2, "r3"));
        expect((await call(stub, "GET", "/view?seat=1")).body).toMatchObject({ version: 3, view: { for: 1, n: 3 } });
        expect((await call(stub, "GET", "/view?seat=0")).body.decision).toEqual({ n: 3 });
        expect((await call(stub, "GET", "/view?seat=spectator")).body.view.for).toBe("spectator");
        const s = (await call(stub, "GET", "/state")).body;
        expect(s.snapshot).toEqual({ version: 2, state: { s: 2 } });
        expect(s.actions.map((a: any) => a.n)).toEqual([3]);
    });

    it("pushes to each socket its own view only, and refuses an unknown token", async () => {
        const stub = await created("seat-zero", "seat-one");
        const open = async (q: string) => {
            const res = await stub.fetch("http://table/ws" + q, { headers: { Upgrade: "websocket" } });
            if (res.status !== 101) return { status: res.status, ws: null, inbox: [] as any[] };
            const ws = res.webSocket!;
            const inbox: any[] = [];
            ws.accept();
            ws.addEventListener("message", (e: MessageEvent) => { inbox.push(JSON.parse(e.data as string)); });
            return { status: 101, ws, inbox };
        };
        const a = await open("?s=seat-zero"), b = await open("?s=seat-one"), spectator = await open(""), bad = await open("?s=nope");
        expect(bad.status).toBe(403);
        await call(stub, "POST", "/append", move(0, "r1"));
        await new Promise((r) => setTimeout(r, 50));
        expect(a.inbox.at(-1)).toMatchObject({ type: "state", version: 1, view: { for: 0 }, decision: { n: 1 } });
        expect(b.inbox.at(-1)).toMatchObject({ type: "state", version: 1, view: { for: 1 } });
        expect(spectator.inbox.at(-1)).toMatchObject({ type: "state", view: { for: "spectator" } });
        expect(a.inbox.at(-1).view.for).not.toBe(1);
        const late = await open("?s=seat-one");                                   // a returning browser gets the latest view of its seat at once
        await new Promise((r) => setTimeout(r, 50));
        expect(late.inbox[0]).toMatchObject({ type: "state", version: 1, view: { for: 1 } });
    });

    it("pushes a proposal to abandon to every socket", async () => {
        const stub = await created("seat-zero", "seat-one");
        const res = await stub.fetch("http://table/ws?s=seat-one", { headers: { Upgrade: "websocket" } });
        const ws = res.webSocket!;
        const inbox: any[] = [];
        ws.accept();
        ws.addEventListener("message", (e: MessageEvent) => { inbox.push(JSON.parse(e.data as string)); });
        await call(stub, "POST", "/config", { patch: { abandon: { proposal: { by: 0, at: 5 }, cooldown: { "1": 99 } } } });
        await new Promise((r) => setTimeout(r, 50));
        expect(inbox.at(-1)).toMatchObject({ type: "abandon", proposal: { by: 0, at: 5 }, cooldown: { "1": 99 } });
        expect((await call(stub, "GET", "/state")).body.config.abandon.proposal.by).toBe(0);
    });

    it("stops taking moves once the table has ended, and forgets everything when finalized", async () => {
        const stub = await created();
        await call(stub, "POST", "/append", move(0, "r1"));
        expect((await call(stub, "POST", "/seat", { seat: 0, name: "Ann" })).body.names).toEqual(["Ann", null]);
        expect((await call(stub, "POST", "/status", { status: "conceded", end_reason: "Ann conceded", registry_event: { status: "conceded" } })).status).toBe(200);
        const late = await call(stub, "POST", "/append", move(1, "r2"));
        expect(late.status).toBe(409);
        expect(late.body.status_now).toBe("conceded");
        const rec = (await call(stub, "GET", "/record")).body;
        expect(rec.game).toMatchObject({ status: "conceded", end_reason: "Ann conceded", version: 1, names: ["Ann", null] });
        expect(rec.actions).toHaveLength(1);
        expect(rec.steps[0].step.label).toBe("step 1");
        const reg = (await call(stub, "GET", "/registry")).body.events;
        expect(reg).toHaveLength(1);
        await call(stub, "POST", "/registry/ack", { up_to_seq: reg[0].seq });
        expect((await call(stub, "GET", "/registry")).body.events).toHaveLength(0);
        expect((await call(stub, "POST", "/finalize", {})).body.deleted).toBe(true);
        expect((await call(stub, "GET", "/state")).status).toBe(404);
    });
});

describe("the signature", () => {
    it("is the one the Python client computes (the same vector is asserted in tests/test_live.py)", async () => {
        const h = await sign("s", "POST", "/internal/table/E1/append", '{"a":1}', 1700000000);
        expect(h).toEqual({ "X-Timestamp": "1700000000", "X-Signature": "127f9b797948dc1a76c60629a7c43f434ad061a2b25c16751e55a55db223698a" });
    });
});

describe("the Worker", () => {
    const fetchWorker = (path: string, init?: RequestInit) => (exports as any).default.fetch(new Request("http://live" + path, init));
    const signed = async (method: string, path: string, body = "") => ({ method, body: body || undefined, headers: await sign("test-secret", method, path, body) });

    it("refuses internal calls without a valid signature and takes the ones with it", async () => {
        const path = "/internal/table/E1/state";
        expect((await fetchWorker(path)).status).toBe(403);
        expect((await fetchWorker(path, { headers: await sign("wrong", "GET", path, "") })).status).toBe(403);
        expect((await fetchWorker(path, { headers: await sign("test-secret", "GET", path, "", Math.floor(Date.now() / 1000) - 3600) })).status).toBe(403);
        expect((await fetchWorker(path, await signed("GET", path))).status).toBe(404);                // signed, but the table does not exist yet
        const init = JSON.stringify({ config: {}, engine_version: "1", seats: [{ token_hash: "a" }, { token_hash: "b" }] });
        expect((await fetchWorker("/internal/table/E1/init", await signed("POST", "/internal/table/E1/init", init))).status).toBe(200);
        expect((await (await fetchWorker(path, await signed("GET", path))).json()).version).toBe(0);
        const tampered = await signed("POST", "/internal/table/E1/append", "{}");
        expect((await fetchWorker("/internal/table/E1/append", { ...tampered, body: '{"x":1}' })).status).toBe(403);       // the body is part of the signature
    });

    it("hands out strictly increasing table numbers, all different under concurrency", async () => {
        const next = async () => (await (await fetchWorker("/internal/counter/next", await signed("POST", "/internal/counter/next"))).json()).n as number;
        const first = await next();
        const many = await Promise.all(Array.from({ length: 20 }, next));
        expect(new Set(many).size).toBe(20);
        expect(Math.min(...many)).toBeGreaterThan(first);
        const ens = await fetchWorker("/internal/counter/ensure", await signed("POST", "/internal/counter/ensure", '{"n": 1000}'));
        expect((await ens.json()).n).toBe(1000);
        expect(await next()).toBe(1001);
    });

    it("answers /api without a Cloud Run URL, a plain GET on /ws and a bad table id", async () => {
        expect((await fetchWorker("/api/games/E1")).status).toBe(502);
        expect((await fetchWorker("/ws/E1")).status).toBe(426);
        expect((await fetchWorker("/ws/12", { headers: { Upgrade: "websocket" } })).status).toBe(404);
        expect((await fetchWorker("/healthz")).status).toBe(200);
    });
});
