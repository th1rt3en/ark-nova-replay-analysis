"""The routes of the saved maps (`accounts/maps.py`): `/api/maps`. Every route needs the account cookie (401 `not_logged_in`); a map is private to its owner."""
import json

from fastapi import FastAPI, Request
from starlette.concurrency import run_in_threadpool

from ark_nova.accounts.maps import MAX_BYTES, MAX_MAPS, MapService
from ark_nova.accounts.service import AccountError, AccountService
from ark_nova.api.accounts import same_origin, session_token


def add_routes(app: FastAPI, maps: MapService, accounts: AccountService, allowed_origins: list[str]) -> None:
    def who(request: Request):
        acc = accounts.account_for(session_token(request))
        if acc is None:
            raise AccountError(401, "not_logged_in", "Log in first.")
        return acc

    async def body_of(request: Request) -> dict:
        if not same_origin(request, allowed_origins):
            raise AccountError(403, "bad_origin", "This request did not come from the site.")
        raw = await request.body()
        if len(raw) > MAX_BYTES + 2_000:
            raise AccountError(413, "too_large", "That map is too large.")
        try:
            data = json.loads(raw or b"{}")
        except ValueError:
            raise AccountError(422, "bad_json", "The body must be JSON.")
        if not isinstance(data, dict):
            raise AccountError(422, "bad_json", "The body must be a JSON object.")
        return data

    @app.get("/api/maps")
    async def list_maps(request: Request):
        acc = who(request)
        return {"maps": await run_in_threadpool(maps.list, acc), "limit": MAX_MAPS}

    @app.get("/api/maps/{map_id}")
    async def get_map(map_id: str, request: Request):
        return await run_in_threadpool(maps.get, who(request), map_id)

    @app.post("/api/maps")
    async def create_map(request: Request):
        body = await body_of(request)
        return await run_in_threadpool(maps.create, who(request), body.get("name"), body.get("data"))

    @app.put("/api/maps/{map_id}")
    async def update_map(map_id: str, request: Request):
        body = await body_of(request)
        acc = who(request)
        if "data" in body:
            return await run_in_threadpool(maps.update, acc, map_id, body.get("name"), body.get("data"))
        return await run_in_threadpool(maps.rename, acc, map_id, body.get("name"))

    @app.delete("/api/maps/{map_id}")
    async def delete_map(map_id: str, request: Request):
        if not same_origin(request, allowed_origins):
            raise AccountError(403, "bad_origin", "This request did not come from the site.")
        await run_in_threadpool(maps.delete, who(request), map_id)
        return {"deleted": map_id}
