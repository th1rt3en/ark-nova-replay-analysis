"""Request guards, as middleware: a size limit for uploads (always on) and a rate limit per client (only when `RATE_LIMIT_ENABLED` is set)."""
import threading
import time

from fastapi import Request
from fastapi.responses import JSONResponse

from ark_nova.config import Settings

MAX_UPLOAD_BYTES = 64 * 1024 * 1024          # the biggest log seen is 16 MB; states of a fork / sandbox are smaller
_WINDOW = 60.0
_hits: dict[str, list[float]] = {}           # client -> times of its requests in the last minute (one instance serves everything: `--max-instances 1`)
_lock = threading.Lock()


def client_key(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")  # Cloud Run puts the client IP first
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


def _limited(key: str, limit: int) -> bool:
    now = time.monotonic()
    with _lock:
        hits = [t for t in _hits.get(key, ()) if now - t < _WINDOW]
        over = len(hits) >= limit
        if not over:
            hits.append(now)
        if hits:
            _hits[key] = hits
        else:
            _hits.pop(key, None)
        if len(_hits) > 10000:                                           # (clients that have gone quiet are forgotten)
            for k in [k for k, v in _hits.items() if not v or now - v[-1] >= _WINDOW]:
                _hits.pop(k, None)
    return over


async def rate_limit_middleware(request: Request, call_next):
    settings: Settings = request.app.state.settings
    if request.method in ("POST", "PUT", "PATCH"):
        try:
            size = int(request.headers.get("content-length") or 0)
        except ValueError:
            size = 0
        if size > MAX_UPLOAD_BYTES:
            return JSONResponse(status_code=413, content={"status": "too_large", "message": "That request is too large."})
    # only the API is limited (pages and pictures are static files); the health check and the socket-less polling of a live game are cheap but frequent, so they are exempt too
    path = request.url.path
    if settings.rate_limit_enabled and path.startswith("/api/") and not path.startswith("/api/games/") and _limited(client_key(request), settings.rate_limit_per_minute):
        return JSONResponse(status_code=429, content={"status": "rate_limited", "message": "Too many requests: wait a moment."}, headers={"Retry-After": "30"})
    return await call_next(request)
