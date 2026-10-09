// Pages Function: every /api/* request goes to Cloud Run; everything else on this site is static files served by Pages.
// Env var CLOUD_RUN_URL (Pages project settings) is the service URL.
export async function onRequest({ request, env }) {
    if (!env.CLOUD_RUN_URL) {
        return new Response(JSON.stringify({ status: "error", message: "the API is not configured" }), { status: 502, headers: { "Content-Type": "application/json" } });
    }
    const url = new URL(request.url);
    return fetch(new Request(env.CLOUD_RUN_URL.replace(/\/$/, "") + url.pathname + url.search, request));
}
