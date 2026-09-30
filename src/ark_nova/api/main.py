"""FastAPI app: /healthz, /api/tables/{id} (flow 1 skeleton) and the static frontend."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from ark_nova.api.ratelimit import rate_limit_middleware
from ark_nova.config import Settings
from ark_nova.storage.index import NotConfiguredIndex, TableIndex
from ark_nova.storage.requests import request_log

WEB_DIR = Path(__file__).resolve().parents[3] / "web"


def create_app(settings: Settings | None = None, index: TableIndex | None = None) -> FastAPI:
    app = FastAPI(title="Ark Nova replay")
    app.state.settings = settings or Settings.from_env()
    app.state.index = index or NotConfiguredIndex()
    app.middleware("http")(rate_limit_middleware)

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    @app.get("/api/tables/{table_id}")
    def get_table(table_id: int):
        logged = app.state.index.find(table_id)
        if logged is None:
            request_log(table_id)
            return JSONResponse(status_code=404, content={"error": "not_logged", "table_id": table_id, "requested": True})
        # TODO: read the log from GCS, parse, build the replay.
        return {"table_id": logged.table_id, "gcs_path": logged.gcs_path, "player_maps": logged.player_maps,
                "marine_worlds": logged.marine_worlds}

    if WEB_DIR.is_dir():
        app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
    return app


app = create_app()
