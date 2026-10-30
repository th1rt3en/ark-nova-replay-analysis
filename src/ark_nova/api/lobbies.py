"""The routes of the custom game lobbies (`live/lobbies.py`): `/api/lobbies...`. Every one of them needs a logged-in account (the session cookie of `api/accounts.py`)."""
import json
import re

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from ark_nova.api.accounts import same_origin
from ark_nova.live.keeper import LiveError
from ark_nova.live.lobbies import LobbyError, LobbyService
from ark_nova.live.service import IllegalMove, RatedRefused

MAX_BODY = 2_000
LOBBY_ID = r"^L\d{1,9}$"


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"status": code, "message": message})


def add_routes(app: FastAPI, board: LobbyService, allowed_origins: list[str]) -> None:
    valid = re.compile(LOBBY_ID)

    def account_of(request: Request):
        accounts = getattr(request.app.state, "accounts", None)
        return accounts.account_for(request.cookies.get("ark_session")) if accounts is not None else None

    async def body_of(request: Request) -> dict:
        if not same_origin(request, allowed_origins):
            raise LobbyError("This request did not come from the site.", 403, "bad_origin")
        raw = await request.body()
        if len(raw) > MAX_BODY:
            raise LobbyError("That request is too large.", 413, "too_large")
        try:
            data = json.loads(raw or b"{}")
        except ValueError:
            raise LobbyError("The body must be JSON.", 422, "bad_json")
        if not isinstance(data, dict):
            raise LobbyError("The body must be a JSON object.", 422, "bad_json")
        return data

    async def call(request: Request, fn, *args, post: bool = True, lobby_id: str | None = None, anonymous: bool = False):
        """Check the account (and the body of a POST), then run `fn(account, ...)` in a thread. `anonymous`: a visitor who is not logged in may call it (the account is None)."""
        try:
            if lobby_id is not None and not valid.match(lobby_id):
                raise LobbyError("No such lobby.", 404, "no_lobby")
            body = await body_of(request) if post else {}
            account = account_of(request)
            if account is None and not anonymous:
                raise LobbyError("Log in to use the lobbies.", 401, "login_needed")
            return JSONResponse(await run_in_threadpool(fn, account, body))
        except RatedRefused as e:
            return _error(e.status, "rated", str(e))
        except IllegalMove as e:
            return _error(422, "illegal", str(e))
        except LobbyError as e:
            return _error(e.status or 409, e.code, str(e))
        except LiveError:
            return _error(502, "keeper_failed", "The game keeper could not be reached, try again.")

    @app.get("/api/lobbies")
    async def listing(request: Request):
        return await call(request, lambda a, b: board.list_open(a), post=False, anonymous=True)

    @app.get("/api/lobbies/inbox")
    async def inbox(request: Request):
        return await call(request, lambda a, b: board.inbox(a), post=False)

    @app.get("/api/lobbies/online")
    async def online(request: Request, q: str = ""):
        return await call(request, lambda a, b: board.online(q, a), post=False)

    @app.post("/api/lobbies")
    async def create(request: Request):
        return await call(request, lambda a, b: board.create(a, b))

    @app.post("/api/lobbies/leave")
    async def leave(request: Request):
        return await call(request, lambda a, b: board.leave(a))

    @app.post("/api/lobbies/invites/{invite_id}/answer")
    async def answer(invite_id: str, request: Request):
        def go(a, b):
            if not isinstance(b.get("accept"), bool):
                raise IllegalMove("send {accept: true | false}", 422)
            return board.answer(a, invite_id, b["accept"])
        return await call(request, go)

    @app.get("/api/lobbies/{lobby_id}")
    async def get(lobby_id: str, request: Request):
        return await call(request, lambda a, b: board.get(lobby_id, a), post=False, lobby_id=lobby_id, anonymous=True)

    @app.post("/api/lobbies/{lobby_id}/join")
    async def join(lobby_id: str, request: Request):
        return await call(request, lambda a, b: board.join(lobby_id, a, b.get("seat")), lobby_id=lobby_id)

    @app.post("/api/lobbies/{lobby_id}/kick")
    async def kick(lobby_id: str, request: Request):
        return await call(request, lambda a, b: board.kick(lobby_id, a, b.get("account_id")), lobby_id=lobby_id)

    @app.post("/api/lobbies/{lobby_id}/invite")
    async def invite(lobby_id: str, request: Request):
        return await call(request, lambda a, b: board.invite(lobby_id, a, str(b.get("username") or ""), b.get("seat")), lobby_id=lobby_id)

    @app.post("/api/lobbies/{lobby_id}/invites/{invite_id}/cancel")
    async def cancel(lobby_id: str, invite_id: str, request: Request):
        return await call(request, lambda a, b: board.cancel_invite(lobby_id, a, invite_id), lobby_id=lobby_id)

    @app.post("/api/lobbies/{lobby_id}/start")
    async def start(lobby_id: str, request: Request):
        return await call(request, lambda a, b: board.start(lobby_id, a), lobby_id=lobby_id)
