"""Logs that players bring (the browser extension) are kept for the project: the raw log in GCS (all_games_logs/<table>.txt) and the table's three base
projects in a BigQuery table. It runs on a thread of its own, started while the replay is built, so it never makes the player wait; it is best effort
(a failure is logged and tried again the next time the same log is brought)."""
import json
import logging
import threading
from datetime import datetime, timezone

log = logging.getLogger(__name__)

PREFIX = "all_games_logs"


class Contributions:
    """`bucket` and `bq_table` ("project.dataset.table") empty: nothing is kept."""

    def __init__(self, bucket: str = "", bq_table: str = ""):
        self.bucket, self.bq_table = bucket, bq_table
        self._gcs = self._bq = None
        self._lock = threading.Lock()
        self._busy: set[int] = set()                    # tables being kept right now (a reload sends the same log again)

    @property
    def enabled(self) -> bool:
        return bool(self.bucket)

    def submit(self, table_id: int, raw: dict, base_projects) -> None:
        """Starts keeping the log and returns at once. `base_projects`: a function that returns the three keys (called on the thread), or a list."""
        if not self.enabled:
            return
        with self._lock:
            if table_id in self._busy:
                return
            self._busy.add(table_id)
        threading.Thread(target=self._run, args=(table_id, raw, base_projects), name=f"keep-log-{table_id}", daemon=True).start()

    def _run(self, table_id: int, raw: dict, base_projects) -> None:
        try:
            self.keep(table_id, raw, base_projects() if callable(base_projects) else base_projects)
        except Exception:  # noqa: BLE001 - the player's replay must not depend on this
            log.exception("keeping the log of table %s failed", table_id)
        finally:
            with self._lock:
                self._busy.discard(table_id)

    def has(self, table_id: int) -> bool:
        """Whether a log is kept for `table_id`. Blocking: call it off the event loop."""
        if not self.enabled:
            return False
        from google.cloud import storage

        self._gcs = self._gcs or storage.Client()
        return self._gcs.bucket(self.bucket).blob(f"{PREFIX}/{table_id}.txt").exists()

    def read(self, table_id: int) -> dict | None:
        """The log kept for `table_id`, or None (nothing kept, or storage off). Blocking: call it off the event loop."""
        if not self.enabled:
            return None
        from google.cloud import storage

        self._gcs = self._gcs or storage.Client()
        blob = self._gcs.bucket(self.bucket).blob(f"{PREFIX}/{table_id}.txt")
        if not blob.exists():
            return None
        return json.loads(blob.download_as_bytes())

    def keep(self, table_id: int, raw: dict, projects) -> bool:
        """Writes the log and the row; False when the log is already kept (the same table brought before)."""
        from google.cloud import storage

        self._gcs = self._gcs or storage.Client()
        blob = self._gcs.bucket(self.bucket).blob(f"{PREFIX}/{table_id}.txt")
        if blob.exists():
            return False
        blob.upload_from_string(json.dumps(raw, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), content_type="text/plain; charset=utf-8", if_generation_match=0)
        if self.bq_table and isinstance(projects, (list, tuple)) and len(projects) == 3:
            try:
                self._insert(table_id, projects)
            except Exception:
                blob.delete()                           # (the next time this log is brought, both are written again)
                raise
        return True

    def _insert(self, table_id: int, projects) -> None:
        from google.cloud import bigquery

        self._bq = self._bq or bigquery.Client()
        row = {"table_id": int(table_id), "base_0": projects[0], "base_1": projects[1], "base_2": projects[2], "created_at": datetime.now(timezone.utc).isoformat()}
        errors = self._bq.insert_rows_json(self.bq_table, [row])
        if errors:
            raise RuntimeError(f"BigQuery refused the row: {errors}")
