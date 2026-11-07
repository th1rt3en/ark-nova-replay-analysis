"""Logs that players bring (the browser extension) are kept for the project: the raw log in GCS (all_games_logs/<table>.txt) and what the replay needs besides the log
(the table's three base projects, the players' maps and Elo, the same-map and Marine Worlds flags) in a BigQuery table, one row per table (a later row replaces an earlier,
incomplete one). With both, a kept table is replayed like a logged one (`api/main.py` `_kept_record`: same cache, same ETag). It runs on a thread of its own, started
while the replay is built, so it never makes the player wait; it is best effort (a failure is logged and tried again the next time the same log is brought)."""
import json
import logging
import threading
from datetime import datetime, timezone

log = logging.getLogger(__name__)

PREFIX = "all_games_logs"
JSON_FIELDS = ("maps", "elos", "elos_after", "elo_changes")          # dict columns, stored as JSON text
FLAG_FIELDS = ("same_map", "marine_worlds")                          # BOOL columns


class Contributions:
    """`bucket` and `bq_table` ("project.dataset.table") empty: nothing is kept."""

    def __init__(self, bucket: str = "", bq_table: str = ""):
        self.bucket, self.bq_table = bucket, bq_table
        self._gcs = self._bq = None
        self._lock = threading.Lock()
        self._busy: set[int] = set()                    # tables being kept right now (a reload sends the same log again)
        self._rows: dict[int, dict] = {}                # complete rows already read (a row is never changed: a later one replaces it, and a complete row is the last word)

    @property
    def enabled(self) -> bool:
        return bool(self.bucket)

    def submit(self, table_id: int, raw: dict | None, data) -> None:
        """Starts keeping the log and its data and returns at once. `raw` is None when the log is kept already (the page did not send it).
        `data`: (the three base project keys, extras) or a function that returns it (called on the thread). `extras`: maps, elos, elos_after, elo_changes, same_map, marine_worlds."""
        if not self.enabled:
            return
        with self._lock:
            if table_id in self._busy:
                return
            self._busy.add(table_id)
        threading.Thread(target=self._run, args=(table_id, raw, data), name=f"keep-log-{table_id}", daemon=True).start()

    def _run(self, table_id: int, raw: dict | None, data) -> None:
        try:
            projects, extras = data() if callable(data) else data
            self.keep(table_id, raw, projects, extras)
        except Exception:  # noqa: BLE001 - the player's replay must not depend on this
            log.exception("keeping the log of table %s failed", table_id)
        finally:
            with self._lock:
                self._busy.discard(table_id)

    def _blob(self, table_id: int):
        from google.cloud import storage

        self._gcs = self._gcs or storage.Client()
        return self._gcs.bucket(self.bucket).blob(f"{PREFIX}/{table_id}.txt")

    def has(self, table_id: int) -> bool:
        """Whether a log is kept for `table_id`. Blocking: call it off the event loop."""
        return self.enabled and self._blob(table_id).exists()

    def read(self, table_id: int) -> dict | None:
        """The log kept for `table_id`, or None (nothing kept, or storage off). Blocking: call it off the event loop."""
        if not self.enabled:
            return None
        blob = self._blob(table_id)
        if not blob.exists():
            return None
        return json.loads(blob.download_as_bytes())

    def record(self, table_id: int) -> dict | None:
        """What the newest complete row (one with the maps) holds for the table: {base_projects, maps, elos, elos_after, elo_changes, same_map, marine_worlds}, or None.
        Blocking: call it off the event loop."""
        if not (self.enabled and self.bq_table):
            return None
        if (hit := self._rows.get(table_id)) is not None:
            return hit
        from google.cloud import bigquery

        self._bq = self._bq or bigquery.Client()
        job = self._bq.query(f"SELECT * FROM `{self.bq_table}` WHERE table_id = @t AND maps IS NOT NULL ORDER BY created_at DESC LIMIT 1",
                             job_config=bigquery.QueryJobConfig(query_parameters=[bigquery.ScalarQueryParameter("t", "INT64", int(table_id))]))
        rows = list(job.result())
        if not rows:
            return None
        row = dict(rows[0].items()) if hasattr(rows[0], "items") else dict(rows[0])
        out = {"base_projects": [row.get(f"base_{i}") for i in range(3)]}
        for field in JSON_FIELDS:
            out[field] = json.loads(row[field]) if row.get(field) else {}
        for field in FLAG_FIELDS:
            out[field] = bool(row.get(field))
        if not out["maps"]:
            return None
        self._rows[table_id] = out
        return out

    def keep(self, table_id: int, raw: dict | None, projects, extras: dict | None = None) -> bool:
        """Writes the log and the row. Returns False when nothing new was written. A log that is kept already is not written again, but a row with the maps is added
        when the table has none yet (the log was kept before the maps were: an older extension, or a review page opened without the table page)."""
        blob = self._blob(table_id)
        wrote = False
        if not blob.exists():
            if raw is None:
                return False
            blob.upload_from_string(json.dumps(raw, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), content_type="text/plain; charset=utf-8", if_generation_match=0)
            wrote = True
        if not (self.bq_table and isinstance(projects, (list, tuple)) and len(projects) == 3):
            return wrote
        extras = extras or {}
        if not wrote and not (extras.get("maps") and self.record(table_id) is None):
            return False
        try:
            self._insert(table_id, projects, extras)
        except Exception:
            if wrote:
                blob.delete()                           # (the next time this log is brought, both are written again)
            raise
        return True

    def _insert(self, table_id: int, projects, extras: dict) -> None:
        from google.cloud import bigquery

        self._bq = self._bq or bigquery.Client()
        row = {"table_id": int(table_id), "base_0": projects[0], "base_1": projects[1], "base_2": projects[2], "created_at": datetime.now(timezone.utc).isoformat()}
        for field in JSON_FIELDS:
            row[field] = json.dumps(extras[field], sort_keys=True) if extras.get(field) else None
        for field in FLAG_FIELDS:
            row[field] = bool(extras[field]) if field in extras else None
        errors = self._bq.insert_rows_json(self.bq_table, [row])
        if errors:
            raise RuntimeError(f"BigQuery refused the row: {errors}")
