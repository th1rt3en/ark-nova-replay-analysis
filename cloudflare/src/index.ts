// The Worker: the front door of live.<domain> (docs/live_game_plan.md, 3 and 3.5).
//   /ws/E12?s=<seat token>            -> the Table Durable Object of E12 (WebSocket)
//   /internal/table/E12/<route>       -> the same object's internal routes, only with a valid signature of Cloud Run
//   /internal/counter/<next|ensure>   -> the id counter, same rule
//   /api/*                            -> Cloud Run
import { verify } from "./auth";
export { Table } from "./table";
export { Counter } from "./counter";

const TABLE_ID = /^E\d{1,9}$/;
const json = (data: unknown, status = 200): Response => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;

        if (path === "/healthz") return json({ ok: true });

        let m = /^\/ws\/([^/]+)$/.exec(path);
        if (m) {
            if (!TABLE_ID.test(m[1])) return json({ status: "error", message: "no such table" }, 404);
            if (request.headers.get("Upgrade") !== "websocket") return json({ status: "error", message: "a WebSocket is expected here" }, 426);
            return env.TABLE.get(env.TABLE.idFromName(m[1])).fetch(rewrite(request, "/ws", url.search));
        }

        m = /^\/internal\/table\/([^/]+)(\/.+)$/.exec(path);
        if (m) {
            if (!(await verify(env.INTERNAL_SECRET, request, path))) return json({ status: "error", message: "forbidden" }, 403);
            if (!TABLE_ID.test(m[1])) return json({ status: "error", message: "no such table" }, 404);
            return env.TABLE.get(env.TABLE.idFromName(m[1])).fetch(rewrite(request, m[2], url.search));
        }

        m = /^\/internal\/counter\/(next|ensure)$/.exec(path);
        if (m) {
            if (!(await verify(env.INTERNAL_SECRET, request, path))) return json({ status: "error", message: "forbidden" }, 403);
            const counter = env.COUNTER.get(env.COUNTER.idFromName("counter"));
            if (m[1] === "next" && request.method === "POST") return json({ n: await counter.next() });
            if (m[1] === "ensure" && request.method === "POST") {
                const n = Number((await request.json<{ n?: number }>().catch(() => ({}) as { n?: number })).n);
                if (!Number.isInteger(n) || n < 0) return json({ status: "error", message: "send {n}" }, 422);
                return json({ n: await counter.ensureAtLeast(n) });
            }
            return json({ status: "error", message: "wrong method" }, 405);
        }

        if (path.startsWith("/api/")) {
            if (!env.CLOUD_RUN_URL) return json({ status: "error", message: "the API is not configured" }, 502);
            return fetch(new Request(env.CLOUD_RUN_URL.replace(/\/$/, "") + path + url.search, request));
        }

        return json({ status: "error", message: "not found" }, 404);
    },
} satisfies ExportedHandler<Env>;

function rewrite(request: Request, path: string, search: string): Request {
    const u = new URL(request.url);
    u.pathname = path;
    u.search = search;
    return new Request(u, request);
}
