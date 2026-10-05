"""Run the website with the local `log_examples/` first (every table with a file there counts as indexed and logged); other tables go to
BigQuery / GCS when they are available.

Usage: python scripts/dev_server.py [--port 8000]
Maps and the Marine Worlds flag are inferred from the log, as the replay config does in tests.
"""
import argparse
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


def build_app():
    settings = Settings()
    index, logs = _remote_index(settings)
    return create_app(settings, LocalIndex(index), LocalLogs(logs))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--reload", action="store_true", help="restart the server when a Python file under src/ changes (the web/ files are always read from disk)")
    args = ap.parse_args()
    if args.reload:
        uvicorn.run("dev_server:build_app", factory=True, app_dir=str(Path(__file__).resolve().parent), host="127.0.0.1", port=args.port,
                    reload=True, reload_dirs=[str(Path(__file__).resolve().parents[1] / "src")], reload_includes=["*.py", "*.json"])
    else:
        uvicorn.run(build_app(), host="127.0.0.1", port=args.port)
