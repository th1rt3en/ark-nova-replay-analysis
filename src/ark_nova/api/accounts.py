"""The routes of the accounts (docs/accounts_plan.md, "API and pages"): `/api/auth/*`. They only translate HTTP to `AccountService`.

The session is a cookie (`ark_session`, HttpOnly, SameSite=Lax, 30 days); the site and the API share an origin through the Pages proxy, so the browser sends it by itself.
"""
import json
from typing import Optional
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from ark_nova.accounts.service import AccountError, AccountService, SESSION_DAYS

COOKIE = "ark_session"
MAX_BODY = 4_000


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"status": code, "message": message})


def client_ip(request: Request) -> str:
    return request.headers.get("cf-connecting-ip") or (request.headers.get("x-forwarded-for", "").split(",")[0].strip()) or (request.client.host if request.client else "")


def same_origin(request: Request, allowed: list[str]) -> bool:
    """A browser POST must come from this site: no Origin header (not a browser) passes, otherwise the origin is the request's own host or one of the configured sites."""
    origin = request.headers.get("origin")
    if not origin:
        return True
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    return urlsplit(origin).netloc == host or origin.rstrip("/") in allowed


def session_token(request: Request) -> Optional[str]:
    return request.cookies.get(COOKIE)


def add_routes(app: FastAPI, service: AccountService, allowed_origins: list[str]) -> None:
    @app.exception_handler(AccountError)
    async def _account_error(_: Request, e: AccountError):
        return _error(e.status, e.code, e.message)

    async def body_of(request: Request) -> dict:
        if not same_origin(request, allowed_origins):
            raise AccountError(403, "bad_origin", "This request did not come from the site.")
        raw = await request.body()
        if len(raw) > MAX_BODY:
            raise AccountError(413, "too_large", "That request is too large.")
        try:
            data = json.loads(raw or b"{}")
        except ValueError:
            raise AccountError(422, "bad_json", "The body must be JSON.")
        if not isinstance(data, dict):
            raise AccountError(422, "bad_json", "The body must be a JSON object.")
        return data

    def with_cookie(request: Request, content: dict, token: Optional[str]) -> JSONResponse:
        resp = JSONResponse(content)
        secure = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
        if token:
            resp.set_cookie(COOKIE, token, max_age=SESSION_DAYS * 86400, httponly=True, samesite="lax", secure=secure, path="/")
        else:
            resp.delete_cookie(COOKIE, path="/")
        return resp

    @app.get("/api/auth/me")
    def me(request: Request):
        acc = service.account_for(session_token(request))
        return {"enabled": True, "account": service.public(acc) if acc else None}

    @app.post("/api/auth/check")
    async def check(request: Request):
        body = await body_of(request)
        return await run_in_threadpool(service.check, body.get("username"))

    @app.post("/api/auth/register")
    async def register(request: Request):
        body = await body_of(request)
        bga = body.get("bga_player_id")
        out = await run_in_threadpool(service.register, body.get("username"), body.get("password"), str(bga) if bga not in (None, "") else None, request.headers.get("user-agent", ""))
        return with_cookie(request, {"account": service.public(out.account), "recovery_code": out.recovery_code}, out.token)

    @app.post("/api/auth/login")
    async def login(request: Request):
        body = await body_of(request)
        acc, token = await run_in_threadpool(service.login, body.get("username"), body.get("password"), client_ip(request), request.headers.get("user-agent", ""))
        return with_cookie(request, {"account": service.public(acc)}, token)

    @app.post("/api/auth/logout")
    async def logout(request: Request):
        await body_of(request)
        service.logout(session_token(request))
        return with_cookie(request, {"account": None}, None)

    @app.post("/api/auth/recover")
    async def recover(request: Request):
        body = await body_of(request)
        out = await run_in_threadpool(service.recover, body.get("username"), body.get("recovery_code"), body.get("password"), request.headers.get("user-agent", ""), client_ip(request))
        return with_cookie(request, {"account": service.public(out.account), "recovery_code": out.recovery_code}, out.token)
