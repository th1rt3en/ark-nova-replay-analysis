// The daily rollover of the mini games (docs/accounts_plan.md, "Daily rollover"): at 00:00 UTC Cloudflare calls `scheduled()` (index.ts), which asks Cloud Run
// to create the day's puzzles. A second run ten minutes later is a backstop; the route is idempotent, and the first player of the day creates the puzzle anyway if both fail.
import { sign } from "./auth";

export const ROLLOVER_PATH = "/internal/minigames/rollover";
const WAITS_S = [0, 10, 30];                                  // seconds before each attempt

export async function rollover(
    env: { INTERNAL_SECRET?: string; CLOUD_RUN_URL?: string },
    fetchImpl: typeof fetch = fetch,
    sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<boolean> {
    if (!env.CLOUD_RUN_URL || !env.INTERNAL_SECRET) { console.error("rollover: CLOUD_RUN_URL or INTERNAL_SECRET is missing"); return false; }
    for (const wait of WAITS_S) {
        if (wait) await sleep(wait * 1000);
        try {
            const res = await fetchImpl(env.CLOUD_RUN_URL.replace(/\/$/, "") + ROLLOVER_PATH, { method: "POST", headers: await sign(env.INTERNAL_SECRET, "POST", ROLLOVER_PATH, "") });
            if (res.ok) { console.log("rollover:", await res.text()); return true; }
            console.error("rollover: Cloud Run answered", res.status);
        } catch (e) {
            console.error("rollover: the call failed", String(e));
        }
    }
    return false;
}
