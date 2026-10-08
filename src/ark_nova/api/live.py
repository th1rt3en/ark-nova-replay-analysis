"""The routes of the live games (docs/live_game_plan.md section 6). The seat token comes in the `X-Seat-Token` header (or `token` in the body / query)."""
import json

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from ark_nova.live.keeper import AlreadyExists, Forbidden, LiveError, NoSuchTable, StaleVersion, TableEnded
from ark_nova.live.service import AbandonRefused, EngineStopped, IllegalMove, LiveService, NotReplayable, NotStarted

MAX_BODY = 20_000
GAME_ID = r"^E\d{1,9}$"


def _error(status: int, code: str, message: str, **extra) -> JSONResponse:
    return JSONResponse(status_code=status, content={"status": code, "message": message, **extra})


def _map(e: Exception) -> JSONResponse:
    if isinstance(e, StaleVersion):
        return _error(409, "stale", "Another move got in first: refresh and choose again.", current_version=e.current_version)
    if isinstance(e, TableEnded):
        return _error(409, "ended", "This game has ended.", game_status=e.status_now)
    if isinstance(e, NotReplayable):
        msg = "This game is not over yet: its replay opens when it has ended." if e.game_status in ("waiting", "playing") else "This game ended without a record to replay."
        return _error(409, "not_replayable", msg, game_status=e.game_status)
    if isinstance(e, NotStarted):
        return _error(409, "not_started", str(e))
    if isinstance(e, NoSuchTable):
        return _error(404, "no_game", "No such game.")
    if isinstance(e, Forbidden):
        return _error(403, "forbidden", str(e))
    if isinstance(e, IllegalMove):
        return _error(422, "illegal", str(e))
    if isinstance(e, AbandonRefused):
        return _error(e.status or 409, "abandon", str(e), **e.body)
    if isinstance(e, EngineStopped):
        return _error(503, "engine_stopped", str(e))
    if isinstance(e, AlreadyExists):
        return _error(409, "exists", str(e))
    return _error(502, "keeper_failed", "The game keeper could not be reached, try again.")


def add_routes(app: FastAPI, service: LiveService, ws_base: str = "") -> None:
    import re
    valid = re.compile(GAME_ID)

    async def body_of(request: Request) -> dict:
        raw = await request.body()
        if len(raw) > MAX_BODY:
            raise IllegalMove("that request is too large", 413)
        try:
            data = json.loads(raw or b"{}")
        except ValueError:
            raise IllegalMove("the body must be JSON", 422)
        if not isinstance(data, dict):
            raise IllegalMove("the body must be a JSON object", 422)
        return data

    def token_of(request: Request, body: dict | None = None) -> str | None:
        return request.headers.get("X-Seat-Token") or (body or {}).get("token") or request.query_params.get("s")

    async def run(fn, *args):
        try:
            return JSONResponse(await run_in_threadpool(fn, *args))
        except (LiveError, ValueError) as e:
            return _map(e)

    def game_or_404(game_id: str):
        return None if valid.match(game_id) else _error(404, "no_game", "No such game.")

    @app.get("/api/tables/E{number:int}/replay")
    async def recorded_replay(number: int):
        """The replay of a recorded live game (`E12`): built from its record, not from a BGA log."""
        return await run(service.recorded_replay, f"E{number}")

    @app.get("/api/live/options")
    async def live_options():
        from ark_nova.live.service import options
        return options()

    @app.post("/api/games")
    async def create_game(request: Request):
        try:
            body = await body_of(request)
        except LiveError as e:
            return _map(e)
        return await run(service.create, bool(body.get("marine_worlds")), None, body.get("game_mode"), body.get("time_control"))

    @app.get("/api/games/{game_id}")
    async def lobby(game_id: str):
        return game_or_404(game_id) or await run(service.lobby, game_id)

    @app.post("/api/games/{game_id}/join")
    async def join(game_id: str, request: Request):
        if (bad := game_or_404(game_id)):
            return bad
        try:
            body = await body_of(request)
        except LiveError as e:
            return _map(e)
        return await run(service.join, game_id, token_of(request, body) or "", str(body.get("name") or ""))

    @app.get("/api/live/config")
    async def live_config():
        return {"ws_base": ws_base}

    @app.get("/api/games/{game_id}/setup")
    async def setup(game_id: str, request: Request):
        return game_or_404(game_id) or await run(service.skeleton, game_id, token_of(request))

    @app.post("/api/games/{game_id}/preview")
    async def preview(game_id: str, request: Request):
        if (bad := game_or_404(game_id)):
            return bad
        try:
            body = await body_of(request)
            if not isinstance(body.get("version"), int) or not isinstance(body.get("action"), dict):
                raise IllegalMove("send {version, action}", 422)
        except LiveError as e:
            return _map(e)
        return await run(service.preview, game_id, token_of(request, body) or "", body["version"], body["action"])

    @app.get("/api/games/{game_id}/result")
    async def outcome(game_id: str):
        return game_or_404(game_id) or await run(service.outcome, game_id)

    @app.get("/api/games/{game_id}/state")
    async def state(game_id: str, request: Request):
        return game_or_404(game_id) or await run(service.view, game_id, token_of(request))

    @app.post("/api/games/{game_id}/actions")
    async def actions(game_id: str, request: Request):
        if (bad := game_or_404(game_id)):
            return bad
        try:
            body = await body_of(request)
            version, action = body.get("version"), body.get("action")
            if not isinstance(version, int) or not isinstance(action, dict):
                raise IllegalMove("send {version, action, request_id}", 422)
        except LiveError as e:
            return _map(e)
        return await run(service.move, game_id, token_of(request, body) or "", version, action, body.get("request_id"))

    @app.post("/api/games/{game_id}/timeout")
    async def timeout(game_id: str, request: Request):
        if (bad := game_or_404(game_id)):
            return bad
        return await run(service.timeout, game_id, token_of(request) or "")

    @app.get("/api/games/{game_id}/abandon")
    async def abandon_state(game_id: str):
        return game_or_404(game_id) or await run(service.abandon_status, game_id)

    @app.post("/api/games/{game_id}/abandon")
    async def abandon(game_id: str, request: Request):
        if (bad := game_or_404(game_id)):
            return bad
        return await run(service.abandon_propose, game_id, token_of(request) or "")

    @app.post("/api/games/{game_id}/abandon/withdraw")
    async def abandon_withdraw(game_id: str, request: Request):
        if (bad := game_or_404(game_id)):
            return bad
        return await run(service.abandon_withdraw, game_id, token_of(request) or "")

    @app.post("/api/games/{game_id}/abandon/answer")
    async def abandon_answer(game_id: str, request: Request):
        if (bad := game_or_404(game_id)):
            return bad
        try:
            body = await body_of(request)
            if not isinstance(body.get("agree"), bool):
                raise IllegalMove("send {agree: true | false}", 422)
        except LiveError as e:
            return _map(e)
        return await run(service.abandon_answer, game_id, token_of(request, body) or "", body["agree"])

    @app.post("/api/games/{game_id}/concede")
    async def concede(game_id: str, request: Request):
        if (bad := game_or_404(game_id)):
            return bad
        try:
            body = await body_of(request)
        except LiveError as e:
            return _map(e)
        return await run(service.concede, game_id, token_of(request, body) or "")
