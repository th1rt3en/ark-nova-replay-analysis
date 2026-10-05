"""FastAPI app: /healthz, table lookup (landing page flow), log fetch / verification and the static frontend."""
import json
import logging
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from ark_nova.api.ratelimit import rate_limit_middleware
from ark_nova.api.tableid import parse_table_id
from ark_nova.config import Settings
from ark_nova.parser.verify import verify_log
from ark_nova.replay.view import build_replay_view
from ark_nova.storage.index import NotConfiguredIndex, TableIndex, TableRecord
from ark_nova.storage.logs import ByteLru, CachedLogStore, LogNotFound, LogStore, NotConfiguredLogStore, default_cache_dir
from ark_nova.storage.requests import request_log

ROOT = Path(__file__).resolve().parents[3]
WEB_DIR = Path(os.environ.get("WEB_DIR") or ROOT / "web")       # the Docker image installs the package into site-packages, so it sets WEB_DIR
IMG_DIR = ROOT / "vendor" / "Next-Ark-Nova-Cards" / "public" / "img"       # card / map images; not in the Docker image yet

log = logging.getLogger(__name__)


def _default_index(settings: Settings) -> TableIndex:
    if not (settings.bq_table and settings.bq_logs_table):
        return NotConfiguredIndex()
    from ark_nova.storage.index import BigQueryIndex
    return BigQueryIndex(settings.bq_table, settings.bq_logs_table)


def _code_version() -> str:
    """Changes whenever the code or its data does (the newest .py / .json under src), so a cached replay of older code is never served."""
    src = Path(__file__).resolve().parents[1]
    newest = max((f.stat().st_mtime_ns for pattern in ("*.py", "*.json") for f in src.rglob(pattern)), default=0)
    return format(newest // 1000, "x")


VERSION = _code_version()
CACHE_CONTROL = "private, max-age=0, must-revalidate"      # the browser asks every time but gets a 304 (no body, no work) while the tag is the same


def _etag(kind: str, table_id: int) -> str:
    return f'"{VERSION}-{kind}-{table_id}"'


def _not_modified(request: Request, tag: str) -> Response | None:
    if tag in [t.strip() for t in request.headers.get("if-none-match", "").split(",")]:
        return Response(status_code=304, headers={"ETag": tag, "Cache-Control": CACHE_CONTROL})
    return None


def _cache_dir(settings: Settings) -> str | None:
    return None if settings.cache_dir.strip().lower() == "off" else (settings.cache_dir or default_cache_dir())


def _default_logs(settings: Settings) -> LogStore:
    if not settings.gcs_bucket:
        return NotConfiguredLogStore()
    from ark_nova.storage.logs import GcsLogStore
    return GcsLogStore(settings.gcs_bucket)


def _config(rec: TableRecord) -> dict:
    return {"table_id": rec.table_id, "logged": rec.logged, "player_maps": rec.player_maps, "marine_worlds": rec.marine_worlds}


def _error(status: int, code: str, message: str, **extra) -> JSONResponse:
    return JSONResponse(status_code=status, content={"status": code, "message": message, **extra})


def create_app(settings: Settings | None = None, index: TableIndex | None = None, logs: LogStore | None = None) -> FastAPI:
    app = FastAPI(title="Ark Nova replay")
    app.state.settings = settings or Settings.from_env()
    app.state.index = index or _default_index(app.state.settings)
    app.state.logs = logs or _default_logs(app.state.settings)
    st = app.state.settings
    if logs is None and st.cache_mb > 0 and not isinstance(app.state.logs, NotConfiguredLogStore):       # (a store handed in, e.g. by a test, is used as it is)
        app.state.logs = CachedLogStore(app.state.logs, st.cache_mb * 1024 * 1024 // 2, _cache_dir(st), st.cache_disk_mb * 1024 * 1024 // 2)
    # the built replays (3-7 MB of JSON, 2-3 s of work each): memory first, files for the rest; the code version is part of the key
    app.state.replays = ByteLru(st.cache_mb * 1024 * 1024 // 2, _cache_dir(st) if st.cache_mb > 0 else None, st.cache_disk_mb * 1024 * 1024 // 2, namespace="replay")
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.middleware("http")(rate_limit_middleware)

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    @app.get("/api/lookup")
    def lookup(q: str = ""):
        """Landing page: table id or BGA url -> what to do next (`ready` | `needs_log` | `not_indexed` | `unsupported` | `invalid`)."""
        table_id = parse_table_id(q)
        if table_id is None:
            return _error(400, "invalid", "Enter a table id (e.g. 924000095) or a table url (https://boardgamearena.com/table?table=924000095).")
        rec = app.state.index.find(table_id)
        if rec is None:
            request_log(table_id)
            return _error(404, "not_indexed", "This table has not been indexed yet. A request to index it has been raised, please check back later.",
                          table_id=table_id)
        if not rec.two_players:
            return _error(422, "unsupported", "Only finished 2-player Ark Nova tables are supported.", table_id=table_id)
        if rec.logged:
            return {"status": "ready", "table_id": table_id, "next": f"/replay.html?table={table_id}"}
        return {"status": "needs_log", "table_id": table_id, "next": f"/submit.html?table={table_id}"}

    @app.get("/api/tables/{table_id}")
    def get_table(table_id: int):
        """Table config from the index (maps, Marine Worlds); the replay page needs it for both log sources."""
        rec = app.state.index.find(table_id)
        if rec is None:
            return _error(404, "not_indexed", "This table has not been indexed yet.", table_id=table_id)
        return {"status": "logged" if rec.logged else "indexed", **_config(rec)}

    @app.get("/api/tables/{table_id}/log")
    def get_log(table_id: int, request: Request):
        """The raw log of a logged table, downloaded from GCS."""
        rec = app.state.index.find(table_id)
        if rec is None or not rec.logged:
            return _error(404, "not_logged", "No log has been collected for this table.", table_id=table_id)
        tag = _etag("log", table_id)
        if (cached := _not_modified(request, tag)) is not None:
            return cached
        try:
            body = app.state.logs.read(rec.gcs_path, table_id)
        except LogNotFound:
            return _error(502, "log_missing", "The log is indexed but could not be found in storage.", table_id=table_id)
        return Response(content=body, media_type="application/json", headers={"ETag": tag, "Cache-Control": CACHE_CONTROL})

    def _replay(table_id: int, rec: TableRecord, raw: dict) -> JSONResponse:
        try:
            return JSONResponse(build_replay_view(raw, rec))
        except Exception as e:  # noqa: BLE001 - a log the replay builder cannot handle must not become a 500 page
            log.exception("replay build failed for table %s", table_id)
            return _error(500, "replay_failed", f"The replay could not be built ({type(e).__name__}).", table_id=table_id)

    @app.get("/api/tables/{table_id}/replay")
    def get_replay(table_id: int, request: Request):
        """Replay data (players, maps, cards, one state per step) of a logged table, built from the GCS log."""
        rec = app.state.index.find(table_id)
        if rec is None or not rec.logged:
            return _error(404, "not_logged", "No log has been collected for this table.", table_id=table_id)
        tag = _etag("replay", table_id)
        if (cached := _not_modified(request, tag)) is not None:                     # the browser has it: nothing is read or built
            return cached
        key = (VERSION, rec.gcs_path, table_id, rec.marine_worlds, tuple(sorted((rec.player_maps or {}).items())))
        body = app.state.replays.get(key)
        if body is None:
            try:
                raw = json.loads(app.state.logs.read(rec.gcs_path, table_id))
            except LogNotFound:
                return _error(502, "log_missing", "The log is indexed but could not be found in storage.", table_id=table_id)
            res = _replay(table_id, rec, raw)
            if res.status_code != 200:
                return res
            body = res.body
            app.state.replays.put(key, body)
        return Response(content=body, media_type="application/json", headers={"ETag": tag, "Cache-Control": CACHE_CONTROL})

    @app.post("/api/tables/{table_id}/replay")
    async def post_replay(table_id: int, request: Request):
        """Replay data for a manually submitted log (verified first)."""
        rec = app.state.index.find(table_id)
        if rec is None:
            return _error(404, "not_indexed", "This table has not been indexed yet.", table_id=table_id)
        try:
            raw = json.loads(await request.body())
        except ValueError:
            return _error(422, "invalid", "The file is not valid JSON.", table_id=table_id)
        errors = verify_log(raw, table_id)
        if errors:
            return JSONResponse(status_code=422, content={"status": "invalid", "message": errors[0], "errors": errors})
        return _replay(table_id, rec, raw)

    @app.post("/api/tables/{table_id}/verify")
    async def verify(table_id: int, request: Request):
        """Manual submission: check the uploaded log is a finished 2p Ark Nova log of this (indexed) table."""
        if app.state.index.find(table_id) is None:
            return _error(404, "not_indexed", "This table has not been indexed yet.", table_id=table_id)
        try:
            raw = json.loads(await request.body())
        except ValueError:
            return JSONResponse(status_code=422, content={"ok": False, "errors": ["The file is not valid JSON."]})
        errors = verify_log(raw, table_id)
        return JSONResponse(status_code=200 if not errors else 422, content={"ok": not errors, "errors": errors})

    if IMG_DIR.is_dir():
        app.mount("/img", StaticFiles(directory=IMG_DIR), name="img")
    if WEB_DIR.is_dir():
        app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
    return app


app = create_app()
