"""Who is on the site right now. The pages send an anonymous heartbeat (a random id in the browser, `web/js/presence.js`) straight to the Cloudflare Worker (`POST /presence`):
Cloud Run never sees it, so the heartbeats do not keep the service awake, and the count lives in the Worker's `Presence` Durable Object (`cloudflare/src/presence.ts`), so a
restart or a deploy of Cloud Run loses nothing. Cloud Run only reads the count (`HttpPresence.online`, a signed internal call) for the admin route and the page `web/online.html`.
`MemoryPresence` is the twin for tests and the dev server (no Worker): it counts nothing, as no heartbeat reaches it.
"""
import json
import urllib.error
import urllib.request

from ark_nova.live.keeper import USER_AGENT, LiveError, sign

EMPTY = {"online": 0, "by_page": {"replay": 0, "fork": 0, "play": 0, "sandbox": 0, "other": 0}, "peak_24h": 0, "hourly_peaks": [], "window_s": 180}


class MemoryPresence:
    def online(self, hours: int = 48) -> dict:
        return dict(EMPTY, now=0)


class HttpPresence:
    """`POST /internal/presence/online` of the Worker (the signature of `HttpKeeper`)."""

    def __init__(self, base_url: str, secret: str, timeout: float = 15.0):
        self.base, self.secret, self.timeout = base_url.rstrip("/"), secret, timeout

    def online(self, hours: int = 48) -> dict:
        path = "/internal/presence/online"
        data = json.dumps({"hours": hours}, separators=(",", ":")).encode()
        req = urllib.request.Request(self.base + path, data=data, method="POST", headers={**sign(self.secret, "POST", path, data), "Content-Type": "application/json", "User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return json.loads(r.read() or b"{}")["result"]
        except urllib.error.HTTPError as e:
            raise LiveError(f"the presence count could not be read (HTTP {e.code})", 502)
        except (urllib.error.URLError, TimeoutError, ConnectionError, KeyError, ValueError) as e:
            raise LiveError(f"the presence count did not answer: {e}", 502)
