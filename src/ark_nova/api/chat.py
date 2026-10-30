"""The routes of the chat of the lobbies and the tables (`live/chat.py`): `/api/chat/tables/{E7}` and `/api/chat/lobbies/{L12}`, GET `?since=<seq>` to read, POST `{text}` to write.
A player of a table sends the seat token (`X-Seat-Token`); a spectator who writes needs the account cookie; a lobby needs the account of one of its members."""
import json
import re

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from ark_nova.api.accounts import same_origin
from ark_nova.live.chat import ChatError, ChatService
from ark_nova.live.keeper import Forbidden, LiveError, NoSuchTable
from ark_nova.live.lobbies import LobbyError

MAX_BODY = 4_000


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"status": code, "message": message})


def add_routes(app: FastAPI, chat: ChatService, allowed_origins: list[str]) -> None:
    table_id, lobby_id = re.compile(r"^E\d{1,9}$"), re.compile(r"^L\d{1,9}$")

    def account_of(request: Request):
        accounts = getattr(request.app.state, "accounts", None)
        return accounts.account_for(request.cookies.get("ark_session")) if accounts is not None else None

    async def run(fn):
        try:
            return JSONResponse(await run_in_threadpool(fn))
        except ChatError as e:
            return _error(e.status, e.code, str(e))
        except LobbyError as e:
            return _error(e.status or 409, e.code, str(e))
        except NoSuchTable:
            return _error(404, "no_game", "No such game.")
        except Forbidden as e:
            return _error(403, "forbidden", str(e))
        except LiveError:
            return _error(502, "chat_failed", "The chat could not be reached, try again.")

    async def text_of(request: Request) -> tuple[str, str | None]:
        if not same_origin(request, allowed_origins):
            raise ChatError("This request did not come from the site.", 403, "bad_origin")
        raw = await request.body()
        if len(raw) > MAX_BODY:
            raise ChatError("That message is too large.", 413, "too_large")
        try:
            body = json.loads(raw or b"{}")
        except ValueError:
            raise ChatError("The body must be JSON.", 422, "bad_json")
        if not isinstance(body, dict):
            raise ChatError("The body must be a JSON object.", 422, "bad_json")
        return body.get("text"), request.headers.get("X-Seat-Token") or body.get("token")

    def since_of(request: Request) -> int:
        try:
            return max(0, int(request.query_params.get("since", "0")))
        except ValueError:
            return 0

    @app.get("/api/chat/tables/{game_id}")
    async def read_table(game_id: str, request: Request):
        if not table_id.match(game_id):
            return _error(404, "no_game", "No such game.")
        since = since_of(request)
        return await run(lambda: chat.read_table(game_id, since))

    @app.post("/api/chat/tables/{game_id}")
    async def post_table(game_id: str, request: Request):
        if not table_id.match(game_id):
            return _error(404, "no_game", "No such game.")
        try:
            text, token = await text_of(request)
        except ChatError as e:
            return _error(e.status, e.code, str(e))
        account = account_of(request)
        return await run(lambda: chat.post_table(game_id, token, account, text))

    def need_account(request: Request):
        account = account_of(request)
        if account is None:
            raise ChatError("Log in to use the lobbies.", 401, "login_needed")
        return account

    @app.get("/api/chat/lobbies/{lobby}")
    async def read_lobby(lobby: str, request: Request):
        if not lobby_id.match(lobby):
            return _error(404, "no_lobby", "No such lobby.")
        since = since_of(request)
        return await run(lambda: chat.read_lobby(lobby, account_of(request), since))              # (anybody reads)

    @app.post("/api/chat/lobbies/{lobby}")
    async def post_lobby(lobby: str, request: Request):
        if not lobby_id.match(lobby):
            return _error(404, "no_lobby", "No such lobby.")
        try:
            text, _ = await text_of(request)
        except ChatError as e:
            return _error(e.status, e.code, str(e))
        return await run(lambda: chat.post_lobby(lobby, need_account(request), text))
