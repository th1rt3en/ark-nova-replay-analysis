"""Rate-limit hook. The structure is in place (per-IP key, configurable limit) but nothing is enforced yet."""
from fastapi import Request

from ark_nova.config import Settings


def client_key(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")  # Cloud Run puts the client IP first
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


async def rate_limit_middleware(request: Request, call_next):
    settings: Settings = request.app.state.settings
    if settings.rate_limit_enabled:
        # TODO: count requests per client_key(request) per minute and return 429 above settings.rate_limit_per_minute.
        pass
    return await call_next(request)
