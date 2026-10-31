// The signature of the internal calls (Cloud Run -> Worker -> Durable Object) and the hash of the seat tokens.
//
// Header `X-Signature` = hex HMAC-SHA256(INTERNAL_SECRET, `${timestamp}.${method}.${path}.${sha256(body)}`), with `X-Timestamp` in seconds. A call older (or newer)
// than MAX_SKEW_S is refused, so a captured request cannot be replayed later.

export const MAX_SKEW_S = 300;

const enc = new TextEncoder();

export const toHex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
    return toHex(await crypto.subtle.digest("SHA-256", typeof data === "string" ? enc.encode(data) : data));
}

async function hmacHex(secret: string, message: string): Promise<string> {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

/** The headers Cloud Run (or a test) puts on an internal call. */
export async function sign(secret: string, method: string, path: string, body: string, nowS = Math.floor(Date.now() / 1000)): Promise<Record<string, string>> {
    const ts = String(nowS);
    return { "X-Timestamp": ts, "X-Signature": await hmacHex(secret, `${ts}.${method}.${path}.${await sha256Hex(body)}`) };
}

/** True when the request carries a valid, fresh signature. Reads the body from a clone, so the request can still be forwarded. */
export async function verify(secret: string | undefined, request: Request, path: string): Promise<boolean> {
    if (!secret) return false;
    const ts = request.headers.get("X-Timestamp"), sig = request.headers.get("X-Signature");
    if (!ts || !sig || !/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > MAX_SKEW_S) return false;
    const body = await request.clone().text();
    const want = await hmacHex(secret, `${ts}.${request.method}.${path}.${await sha256Hex(body)}`);
    return timingSafeEqual(want, sig);
}

/** A page's WebSocket to the lobbies says who it is with a ticket that Cloud Run made after checking the session: `<base64url(JSON {a: account id, n: name, e: expiry in seconds})>.<hex HMAC-SHA256(secret, "lobbyws|" + that)>`.
 *  Returns the account, or null (a visitor has no ticket; a bad or old ticket is a visitor too). */
export async function verifyTicket(secret: string | undefined, ticket: string | null, nowS = Math.floor(Date.now() / 1000)): Promise<{ id: string; name: string } | null> {
    if (!secret || !ticket) return null;
    const [payload, sig] = ticket.split(".");
    if (!payload || !sig || !timingSafeEqual(await hmacHex(secret, "lobbyws|" + payload), sig)) return null;
    try {
        const data = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
        if (typeof data.a !== "string" || typeof data.n !== "string" || typeof data.e !== "number" || data.e < nowS) return null;
        return { id: data.a, name: data.n };
    } catch { return null; }
}

export function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
