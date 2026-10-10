"""Run the website with the local `log_examples/` first (every table with a file there counts as indexed and logged); other tables go to
BigQuery / GCS when they are available.

Usage: python scripts/dev_server.py [--port 8000] [--live]
--live: live games on in-memory twins of the keeper, the registry and the archive (open /play.html; no socket server, the page asks every 2 seconds; games are lost on restart).
Maps and the Marine Worlds flag are inferred from the log, as the replay config does in tests.
"""
import argparse
import os
from pathlib import Path

import uvicorn

from ark_nova.api.main import create_app
from ark_nova.config import Settings
from ark_nova.storage.index import TableRecord
from ark_nova.storage.logs import LogNotFound

LOG_DIR = Path(__file__).resolve().parents[1] / "log_examples"


def _remote_index(settings: Settings):
    """BigQuery / GCS for the tables that are not in log_examples (needs the `gcp` extra and gcloud credentials); None when unavailable."""
    try:
        from ark_nova.storage.index import BigQueryIndex
        from ark_nova.storage.logs import GcsLogStore
        return BigQueryIndex(settings.bq_table, settings.bq_logs_table), GcsLogStore(settings.gcs_bucket)
    except Exception as ex:                                  # noqa: BLE001
        print(f"BigQuery / GCS not available ({ex}): only the tables in log_examples work")
        return None, None


class LocalIndex:
    def __init__(self, remote=None):
        self.remote = remote

    def find(self, table_id):
        if (LOG_DIR / f"{table_id}.json").exists():
            return TableRecord(table_id, f"{table_id}.json")           # (maps are inferred from the log, or read from data_manual/sample_maps.json)
        return self.remote.find(table_id) if self.remote is not None else None


class LocalLogs:
    def __init__(self, remote=None):
        self.remote = remote

    def read(self, gcs_path, table_id):
        path = LOG_DIR / gcs_path
        if path.exists():
            return path.read_bytes()
        if self.remote is not None:
            return self.remote.read(gcs_path, table_id)
        raise LogNotFound(gcs_path)


PLANNING_DIR = Path(__file__).resolve().parents[1] / "data_manual" / "planning"
PLANNING_SHEETS = ("visibility", "reversibility")


def _planning_routes(app) -> None:
    """Development only: `web/planning.html` reads and saves the planning sheets (data_manual/planning/*.json, 4 space indent) through these."""
    import json

    from fastapi import HTTPException, Request
    from fastapi.responses import JSONResponse

    @app.get("/api/dev/planning/{name}")
    def get_sheet(name: str):
        if name not in PLANNING_SHEETS or not (PLANNING_DIR / f"{name}.json").exists():
            raise HTTPException(404)
        return JSONResponse(json.loads((PLANNING_DIR / f"{name}.json").read_text(encoding="utf-8")))

    @app.put("/api/dev/planning/{name}")
    async def put_sheet(name: str, request: Request):
        if name not in PLANNING_SHEETS:
            raise HTTPException(404)
        sheet = await request.json()
        if not isinstance(sheet, dict) or not isinstance(sheet.get("items"), list) or sheet.get("sheet") != name:
            raise HTTPException(422, "not a planning sheet")
        (PLANNING_DIR / f"{name}.json").write_text(json.dumps(sheet, indent=4, ensure_ascii=False) + "\n", encoding="utf-8")
        return {"ok": True}

    @app.post("/api/dev/minigames/rollover")
    def dev_rollover(day: str | None = None):
        """Development only: create today's (or `day`'s) puzzles now instead of waiting for the cron trigger."""
        return {"day": day or app.state.minigames.today(), "games": app.state.minigames.rollover(day)}

    routes = app.router.routes                       # the static files are mounted at "/": these routes must come first
    mine = [r for r in routes if getattr(r, "path", "").startswith("/api/dev/")]
    app.router.routes[:] = mine + [r for r in routes if r not in mine]


def _minigames(index, logs):
    """The mini games of data_manual/minigames.json on the local logs: puzzles come from the tables in log_examples, results are kept in build/minigames_dev.sqlite."""
    import json

    from ark_nova.minigames.platform.contract import GameLog
    from ark_nova.minigames.platform.manifest import load_games, load_manifest
    from ark_nova.minigames.platform.service import MiniGameService
    from ark_nova.minigames.platform.sources import ListSourceIndex
    from ark_nova.minigames.platform.store import SqliteStore

    def read_log(table_id):
        rec = index.find(table_id)
        if rec is None or not rec.logged:
            raise LookupError(f"no log for table {table_id}")
        return GameLog(json.loads(logs.read(rec.gcs_path, table_id)), table_id)

    db = Path(__file__).resolve().parents[1] / "build" / "minigames_dev.sqlite"
    db.parent.mkdir(exist_ok=True)
    entries = load_manifest()
    tables = [int(p.stem) for p in LOG_DIR.glob("*.json") if p.stem.isdigit()]
    return MiniGameService(SqliteStore(str(db)), ListSourceIndex(tables), read_log, load_games(entries), entries)


def _accounts():
    """Accounts on a local SQLite file (build/accounts_dev.sqlite). BGA names to try the signup with: Xiao93 (one BGA player), Eagles Gaming (three), and every
    player name of the logs in log_examples is not looked up: the real BGA data is only read in production."""
    from ark_nova.accounts.seeds import BgaPlayer, ListSeedIndex
    from ark_nova.accounts.service import AccountService
    from ark_nova.accounts.store import SqliteStore

    db = Path(__file__).resolve().parents[1] / "build" / "accounts_dev.sqlite"
    db.parent.mkdir(exist_ok=True)
    seeds = ListSeedIndex([BgaPlayer("89107474", "Xiao93", 447.53, 1683, 410, "2026-10-08T17:54:00+00:00"),
                           BgaPlayer("111", "Eagles Gaming", 300.2, 1500, 20, "2025-01-01T00:00:00+00:00"), BgaPlayer("222", "Eagles Gaming", 512.9, 1600, 90, "2026-09-01T00:00:00+00:00"),
                           BgaPlayer("333", "Eagles Gaming", 150.0, 1400, 3, "2024-01-01T00:00:00+00:00")])
    return AccountService(SqliteStore(str(db)), seeds)


def build_app():
    settings = Settings()
    index, logs = _remote_index(settings)
    live = None
    if os.environ.get("DEV_LIVE") == "1":
        from ark_nova.live import archive as arch, registry as reg
        from ark_nova.live.fake import FakeKeeper
        from ark_nova.live.service import LiveService
        live = LiveService(FakeKeeper(), engine_version="dev", registry=reg.FakeRegistry(), archive=arch.FakeArchive())
    local_index, local_logs = LocalIndex(index), LocalLogs(logs)
    app = create_app(settings, local_index, local_logs, live=live, minigames=_minigames(local_index, local_logs), accounts=_accounts())
    _planning_routes(app)
    return app


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1", help="address to listen on; 0.0.0.0 makes the server reachable from other devices on the network (it can then also save the planning sheets for them)")
    ap.add_argument("--reload", action="store_true", help="restart the server when a Python file under src/ changes (the web/ files are always read from disk)")
    ap.add_argument("--live", action="store_true", help="play live games (play.html) on in-memory twins of the keeper, registry and archive")
    args = ap.parse_args()
    if args.live:
        os.environ["DEV_LIVE"] = "1"
    if args.reload:
        uvicorn.run("dev_server:build_app", factory=True, app_dir=str(Path(__file__).resolve().parent), host=args.host, port=args.port,
                    reload=True, reload_dirs=[str(Path(__file__).resolve().parents[1] / "src")], reload_includes=["*.py", "*.json"])
    else:
        uvicorn.run(build_app(), host=args.host, port=args.port)
