"""The routes of the mini games (docs/accounts_plan.md, "Routes and pages"). They only translate HTTP to `MiniGameService`; no game is named here."""
import hashlib
import hmac
import json
import re
import time
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from ark_nova.minigames.platform.contract import Caller, MiniGameError
from ark_nova.minigames.platform.service import MiniGameService

MAX_BODY = 20_000
ANON_ID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
SIGNATURE_WINDOW = 300


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"status": code, "message": message})


def valid_signature(secret: str, method: str, path: str, body: bytes, headers, now: Optional[int] = None) -> bool:
    """The internal calls (the cron trigger of the Worker): HMAC-SHA256 over `timestamp.method.path.sha256(body)`, like the keeper's (live/keeper.py `sign`)."""
    ts, sig = headers.get("x-timestamp", ""), headers.get("x-signature", "")
    if not secret or not ts.isdigit() or abs((int(time.time()) if now is None else now) - int(ts)) > SIGNATURE_WINDOW:
        return False
    want = hmac.new(secret.encode(), f"{ts}.{method}.{path}.{hashlib.sha256(body).hexdigest()}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, sig)


def caller_of(request: Request) -> Caller:
    """The logged-in account (the session cookie), if the accounts are on; always also the anonymous id (the browser keeps a random one and sends it in `X-Anon-Id`)."""
    anon = request.headers.get("x-anon-id", "")
    accounts = getattr(request.app.state, "accounts", None)
    acc = accounts.account_for(request.cookies.get("ark_session")) if accounts is not None else None
    return Caller(account_id=acc.id if acc else None, anon_id=anon if ANON_ID.match(anon) else None)


def add_routes(app: FastAPI, service: MiniGameService, internal_secret: str = "") -> None:
    @app.exception_handler(MiniGameError)
    async def _mini_error(_: Request, e: MiniGameError):
        return _error(e.status, e.code, e.message)

    @app.get("/api/minigames")
    def hub(request: Request):
        return {"games": service.hub(caller_of(request)), "today": service.today()}

    @app.get("/api/minigames/{key}/today")
    def today(key: str, request: Request):
        return service.puzzle(key, service.today(), caller_of(request))

    @app.get("/api/minigames/{key}/puzzle/{day}")
    def puzzle(key: str, day: str, request: Request):
        return service.puzzle(key, day, caller_of(request))

    @app.get("/api/minigames/{key}/days")
    def days(key: str, month: str, request: Request):
        return service.days(key, month, caller_of(request))

    @app.get("/api/minigames/{key}/leaderboard")
    def leaderboard(key: str, request: Request, period: str = "all"):
        board = service.leaderboard(key, period)
        board["rows"] = board["rows"][:50]
        accounts = getattr(request.app.state, "accounts", None)
        if accounts is not None:                                       # the names of the listed accounts (the board itself only knows ids)
            for r in board["rows"]:
                acc = accounts.store.by_id(r["account_id"])
                r["name"] = acc.username if acc else r["account_id"]
        return board

    @app.post("/api/minigames/{key}/submit")
    async def submit(key: str, request: Request):
        raw = await request.body()
        if len(raw) > MAX_BODY:
            return _error(413, "too_large", "That request is too large.")
        try:
            body = json.loads(raw or b"{}")
        except ValueError:
            return _error(422, "bad_json", "The body must be JSON.")
        if not isinstance(body, dict):
            return _error(422, "bad_json", "The body must be a JSON object.")
        day = body.get("day") or service.today()
        return await run_in_threadpool(service.submit, key, str(day), body.get("payload"), caller_of(request))

    @app.post("/internal/minigames/rollover")
    async def rollover(request: Request):
        body = await request.body()
        if not valid_signature(internal_secret, "POST", request.url.path, body, request.headers):
            return _error(401, "bad_signature", "The signature is missing or wrong.")
        return {"day": service.today(), "games": await run_in_threadpool(service.rollover)}
