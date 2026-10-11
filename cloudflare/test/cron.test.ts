import { describe, expect, it } from "vitest";
import { sign, verify } from "../src/auth";
import { ROLLOVER_PATH, rollover } from "../src/cron";

const env = { INTERNAL_SECRET: "test-secret", CLOUD_RUN_URL: "https://run.example/" };
const noSleep = async () => {};

describe("the mini game rollover", () => {
    it("posts a signed request to Cloud Run and stops at the first success", async () => {
        const seen: Request[] = [];
        const ok = await rollover(env, async (url, init) => { seen.push(new Request(url as string, init)); return new Response('{"day":"2026-10-11"}'); }, noSleep);
        expect(ok).toBe(true);
        expect(seen.length).toBe(1);
        expect(seen[0].url).toBe("https://run.example" + ROLLOVER_PATH);
        expect(seen[0].method).toBe("POST");
        expect(await verify("test-secret", seen[0], ROLLOVER_PATH)).toBe(true);
        expect(await verify("other-secret", seen[0], ROLLOVER_PATH)).toBe(false);
    });

    it("tries again when Cloud Run is waking up or failing", async () => {
        let calls = 0;
        const waits: number[] = [];
        const ok = await rollover(env, async () => { calls++; if (calls === 1) throw new Error("network"); return new Response("", { status: calls === 2 ? 503 : 200 }); }, async (ms) => { waits.push(ms); });
        expect(ok).toBe(true);
        expect(calls).toBe(3);
        expect(waits).toEqual([10000, 30000]);
    });

    it("gives up after three attempts and says so", async () => {
        let calls = 0;
        expect(await rollover(env, async () => { calls++; return new Response("no", { status: 500 }); }, noSleep)).toBe(false);
        expect(calls).toBe(3);
    });

    it("does nothing without its settings", async () => {
        let calls = 0;
        expect(await rollover({ CLOUD_RUN_URL: "https://x" }, async () => { calls++; return new Response("x"); }, noSleep)).toBe(false);
        expect(await rollover({ INTERNAL_SECRET: "s" }, async () => { calls++; return new Response("x"); }, noSleep)).toBe(false);
        expect(calls).toBe(0);
    });

    it("signs like the Python side expects (timestamp.method.path.sha256(empty body))", async () => {
        const h = await sign("test-secret", "POST", ROLLOVER_PATH, "", 1700000000);
        expect(h["X-Timestamp"]).toBe("1700000000");
        expect(h["X-Signature"]).toMatch(/^[0-9a-f]{64}$/);
    });
});
