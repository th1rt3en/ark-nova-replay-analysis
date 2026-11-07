import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sign } from "../src/auth";

// the heartbeat of the pages and the count Cloud Run reads (src/presence.ts)
const fetchWorker = (path: string, init?: RequestInit) => (exports as any).default.fetch(new Request("http://live" + path, init));
const beat = (id: string, page = "replay") => fetchWorker("/presence", { method: "POST", body: JSON.stringify({ id, page }), headers: { "Content-Type": "text/plain" } });
async function online(args: Record<string, unknown> = {}): Promise<{ status: number; body: any }> {
    const path = "/internal/presence/online", body = JSON.stringify(args);
    const res = await fetchWorker(path, { method: "POST", body, headers: await sign("test-secret", "POST", path, body) });
    return { status: res.status, body: await res.json() };
}
const object = () => env.PRESENCE.get(env.PRESENCE.idFromName("presence")) as any;
const id = (n: number) => "visitor-" + String(n).padStart(10, "0");

describe("the presence of the pages", () => {
    it("takes a heartbeat from anywhere and only reads the count with the signature", async () => {
        const res = await beat(id(1));
        expect(res.status).toBe(204);
        expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
        expect((await fetchWorker("/presence", { method: "OPTIONS" })).status).toBe(204);
        expect((await fetchWorker("/presence", { method: "GET" })).status).toBe(405);
        expect((await fetchWorker("/internal/presence/online", { method: "POST", body: "{}" })).status).toBe(403);
        expect((await fetchWorker("/internal/presence/online", { method: "GET" })).status).toBe(405);
    });

    it("counts each id once, by page, and forgets the ones not seen for three minutes", async () => {
        await object().advance(10 * 60 * 1000);                                                       // (the ids of the other tests are gone)
        const base = (await online()).body.result.online;
        expect(base).toBe(0);
        await beat(id(10), "replay"); await beat(id(11), "play"); await beat(id(10), "replay");            // (the same id twice is one person)
        let r = (await online()).body.result;
        expect(r.online - base).toBe(2);
        expect(r.by_page.play).toBeGreaterThanOrEqual(1);
        await object().advance(2 * 60 * 1000);
        await beat(id(11), "play");                                                                   // (id 11 is still there, id 10 is not)
        await object().advance(90 * 1000);
        r = (await online()).body.result;
        expect(r.online - base).toBe(1);
    });

    it("refuses an id that is no random id and files an unknown page as other", async () => {
        expect((await beat("short")).status).toBe(422);
        expect((await beat("x".repeat(60))).status).toBe(422);
        expect((await fetchWorker("/presence", { method: "POST", body: "not json" })).status).toBe(422);
        const before = (await online()).body.result.by_page.other;
        expect((await beat(id(20), "nonsense")).status).toBe(204);
        expect((await online()).body.result.by_page.other).toBe(before + 1);
    });

    it("keeps a sample of the count and answers with the busiest of each hour", async () => {
        for (let i = 30; i < 33; i++) await beat(id(i));
        await object().sample();
        const r = (await online({ hours: 3 })).body.result;
        expect(r.peak_24h).toBeGreaterThanOrEqual(3);
        expect(r.hourly_peaks.length).toBeGreaterThanOrEqual(1);
        expect(r.hourly_peaks.at(-1).peak).toBeGreaterThanOrEqual(3);
        expect(r.window_s).toBe(180);
    });

    it("lets the history survive: an old sample is kept for two weeks, then dropped", async () => {
        await object().sample();
        await object().advance(15 * 24 * 3600 * 1000);
        await object().sample();
        const r = (await online({ hours: 24 * 14 })).body.result;
        expect(r.hourly_peaks.every((h: any) => h.hour > r.now - 14 * 24 * 3600 * 1000)).toBe(true);
    });
});
