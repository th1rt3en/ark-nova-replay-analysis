"""Run the website against the local `log_examples/` instead of BigQuery/GCS (every table with a file there counts as indexed and logged).

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


class LocalIndex:
    def find(self, table_id):
        return TableRecord(table_id, f"{table_id}.json") if (LOG_DIR / f"{table_id}.json").exists() else None


class LocalLogs:
    def read(self, gcs_path, table_id):
        path = LOG_DIR / gcs_path
        if not path.exists():
            raise LogNotFound(gcs_path)
        return path.read_bytes()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    uvicorn.run(create_app(Settings(), LocalIndex(), LocalLogs()), host="127.0.0.1", port=ap.parse_args().port)
