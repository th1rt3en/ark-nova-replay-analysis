"""FastAPI app: /healthz, table lookup (landing page flow), log fetch / verification and the static frontend."""
import json
import logging
import os
import threading
from collections import OrderedDict
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from ark_nova.api.ratelimit import rate_limit_middleware
from ark_nova.api.tableid import parse_table_id
from ark_nova.config import Settings
from ark_nova.parser.verify import verify_log
from ark_nova.engine.game import IllegalAction
from ark_nova.engine.state import GameState
from ark_nova.replay import fork as forking
from ark_nova.replay import sandbox
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
    app.state.forks = OrderedDict()                                      # table id -> (view without its steps, the engine state of every step, the labels): the last few tables
    app.state.forks_lock = threading.Lock()
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

    def _fork_entry(table_id: int, rec: TableRecord, raw: dict):
        with app.state.forks_lock:
            hit = app.state.forks.get(table_id)
            if hit is not None:
                app.state.forks.move_to_end(table_id)
                return hit
        view, states = build_replay_view(raw, rec, with_states=True)
        entry = ({k: v for k, v in view.items() if k != "steps"}, states, [st["label"] for st in view["steps"]])
        with app.state.forks_lock:
            app.state.forks[table_id] = entry
            while len(app.state.forks) > 3:
                app.state.forks.popitem(last=False)
        return entry

    @app.post("/api/tables/{table_id}/fork")
    async def fork_table(table_id: int, request: Request):
        """Fork a replay: the position after `step` (where the engine played it) with the deck order of `seed`. Everything the viewer needs comes back; the engine state travels with each step."""
        try:
            body = json.loads(await request.body())
            step = int(body["step"])
            seed = int(body.get("seed") or forking.DEFAULT_SEED)
        except (ValueError, KeyError, TypeError):
            return _error(422, "invalid", "Send {step, seed}.", table_id=table_id)
        if not 0 <= seed <= forking.MAX_SEED:
            return _error(422, "invalid", "The seed must be a number between 0 and 2^63 - 1.", table_id=table_id)
        rec = app.state.index.find(table_id)
        if rec is None or not rec.logged:
            return _error(404, "not_logged", "No log has been collected for this table.", table_id=table_id)
        try:
            raw = json.loads(app.state.logs.read(rec.gcs_path, table_id))
        except LogNotFound:
            return _error(502, "log_missing", "The log is indexed but could not be found in storage.", table_id=table_id)
        try:
            skeleton, states, labels = await run_in_threadpool(_fork_entry, table_id, rec, raw)
        except Exception:  # noqa: BLE001
            log.exception("fork build failed for table %s", table_id)
            return _error(500, "replay_failed", "The replay could not be built.", table_id=table_id)
        if not 0 <= step < len(states) or states[step] is None or states[step].prompt is None:
            return _error(422, "not_forkable", "The engine did not play this step, so it cannot be forked. Pick a step marked as played by the engine.", table_id=table_id)
        state = forking.reorder_decks(states[step], seed)
        first = forking.step_payload(state, f"Fork of table #{table_id} after step {step}: {labels[step]}")
        return JSONResponse({**skeleton, "setup_steps": 0, "steps": [first], "shapes": forking.shapes(),
                             "fork": {"table_id": table_id, "step": step, "seed": seed, "default_seed": forking.DEFAULT_SEED, "label": labels[step]}})

    @app.get("/api/sandbox/maps")
    async def sandbox_maps(marine_worlds: bool = False):
        return JSONResponse({"maps": sandbox.available_maps(marine_worlds)})

    @app.post("/api/sandbox/new")
    async def sandbox_new(request: Request):
        """Start a sandbox game: {marine_worlds, maps: [seat 0, seat 1], controller: 0 | 1}."""
        try:
            body = json.loads(await request.body())
            state, meta = sandbox.new_game(bool(body.get("marine_worlds")), [str(m) for m in body["maps"]], int(body["controller"]))
            steps = await run_in_threadpool(sandbox.first_step, state, meta)
        except (ValueError, KeyError, TypeError) as e:
            return _error(422, "invalid", str(e) if isinstance(e, sandbox.SandboxError) else "Send {marine_worlds, maps, controller}.")
        final = GameState.from_dict(steps[-1]["engine_state"])
        return JSONResponse({**sandbox.skeleton(final), "steps": steps, "sandbox": meta})

    @app.post("/api/sandbox/apply")
    async def sandbox_apply(request: Request):
        """A move of the controller on the state posted by the browser, then the moves of the bot: {state, meta, action}; returns {steps}."""
        raw_body = await request.body()
        if len(raw_body) > 3_000_000:
            return _error(413, "too_large", "That state is too large.")
        try:
            body = json.loads(raw_body)
            steps = await run_in_threadpool(sandbox.play, body["state"], body["meta"], body["action"])
        except IllegalAction as e:
            return _error(422, "illegal", str(e))
        except NotImplementedError as e:
            return _error(422, "not_implemented", f"The engine does not implement this rule yet: {e}")
        except (ValueError, KeyError, TypeError) as e:
            return _error(422, "invalid", f"Could not read the state or the action ({type(e).__name__}).")
        return JSONResponse({"steps": steps})

    @app.post("/api/sandbox/edit")
    async def sandbox_edit(request: Request):
        """An edit of the controller: {state, meta, op, args}; returns {steps: [the new step]}."""
        raw_body = await request.body()
        if len(raw_body) > 3_000_000:
            return _error(413, "too_large", "That state is too large.")
        try:
            body = json.loads(raw_body)
            step = await run_in_threadpool(sandbox.edit_payload, body["state"], body["meta"], str(body["op"]), dict(body.get("args") or {}))
        except sandbox.SandboxError as e:
            return _error(422, "invalid", str(e))
        except (IllegalAction, NotImplementedError) as e:
            return _error(422, "illegal", str(e))
        except (ValueError, KeyError, TypeError) as e:
            return _error(422, "invalid", f"Could not read the state or the edit ({type(e).__name__}).")
        return JSONResponse({"steps": [step]})

    @app.post("/api/fork/apply")
    async def fork_apply(request: Request):
        """Play one action of a fork. The body carries the whole engine state (the server keeps nothing): {state, action, names}."""
        raw_body = await request.body()
        if len(raw_body) > 3_000_000:
            return _error(413, "too_large", "That state is too large.")
        try:
            body = json.loads(raw_body)
            names = [str(n) for n in body.get("names") or []]
            step = await run_in_threadpool(forking.play, body["state"], body["action"], names)
        except IllegalAction as e:
            return _error(422, "illegal", str(e))
        except NotImplementedError as e:
            return _error(422, "not_implemented", f"The engine does not implement this rule yet: {e}")
        except (ValueError, KeyError, TypeError) as e:
            return _error(422, "invalid", f"Could not read the state or the action ({type(e).__name__}).")
        return JSONResponse(step)

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
