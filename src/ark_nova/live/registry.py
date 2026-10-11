"""The table registry in BigQuery (docs/live_game_plan.md 9.2): `ark_nova_engine.live_table_events` is append only, one complete row per change of status; the view
`ark_nova_engine.live_tables` returns the latest row of each table (`started_at` carried forward from the event that has it).

BigQuery is never on the path of a move: a failed write leaves the event in the Table DO (`registry` route) and the sync tries again. Inserts carry an `insertId`
(`E12:3`), so a repeated write of the same event does not make a second row, and the view takes the highest `event_seq` anyway.
"""
import json
import time
from datetime import datetime, timezone
from typing import Any, Protocol

PROJECT = "freestyle-190711"
DATASET = "ark_nova_engine"
EVENTS = "live_table_events"
VIEW = "live_tables"

# (name, BigQuery type, mode)
SCHEMA = [
    ("table_id", "STRING", "REQUIRED"), ("table_number", "INT64", "REQUIRED"), ("event_seq", "INT64", "REQUIRED"), ("event_at", "TIMESTAMP", "REQUIRED"),
    ("status", "STRING", "REQUIRED"), ("end_reason", "STRING", "NULLABLE"),
    ("created_at", "TIMESTAMP", "NULLABLE"), ("started_at", "TIMESTAMP", "NULLABLE"), ("ended_at", "TIMESTAMP", "NULLABLE"),
    ("player_names", "STRING", "REPEATED"), ("maps", "STRING", "REPEATED"), ("marine_worlds", "BOOL", "NULLABLE"), ("config", "STRING", "NULLABLE"),
    ("engine_version", "STRING", "NULLABLE"), ("code_hash", "STRING", "NULLABLE"), ("data_hash", "STRING", "NULLABLE"),
    ("n_actions", "INT64", "NULLABLE"), ("result", "STRING", "NULLABLE"),
    ("gcs_path", "STRING", "NULLABLE"), ("exported_at", "TIMESTAMP", "NULLABLE"), ("record_bytes", "INT64", "NULLABLE"), ("schema_version", "INT64", "NULLABLE"),
]
FINAL = ("finished", "conceded", "abandoned", "error", "cancelled")


def view_sql(project: str = PROJECT, dataset: str = DATASET) -> str:
    return f"""CREATE OR REPLACE VIEW `{project}.{dataset}.{VIEW}` AS
SELECT * EXCEPT (rn, started_all) REPLACE (COALESCE(started_at, started_all) AS started_at)
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY table_id ORDER BY event_seq DESC) AS rn,
         MAX(started_at) OVER (PARTITION BY table_id) AS started_all
  FROM `{project}.{dataset}.{EVENTS}`
)
WHERE rn = 1"""


def _ts(ms_or_iso: Any) -> str | None:
    if ms_or_iso is None:
        return None
    if isinstance(ms_or_iso, (int, float)):
        return datetime.fromtimestamp(ms_or_iso / 1000, timezone.utc).isoformat()
    return str(ms_or_iso)


def build_row(table_id: str, seq: int, kept: dict, event: dict, now: float | None = None) -> dict:
    """The complete row of one event from what the keeper knows (`state`) and what the event adds. The seed never goes in: the registry is public to every analyst of the dataset."""
    cfg = kept.get("config") or {}
    options = cfg.get("options") or {}
    row = {
        "table_id": table_id, "table_number": int(table_id[1:]), "event_seq": seq, "event_at": _ts((now if now is not None else time.time()) * 1000),
        "status": event.get("status") or kept.get("status"), "end_reason": event.get("end_reason") or kept.get("end_reason"),
        "created_at": _ts(kept.get("created_at")), "started_at": _ts(event.get("started_at")), "ended_at": _ts(event.get("ended_at") or (kept.get("ended_at") if (event.get("status") in FINAL) else None)),
        "player_names": [s["name"] for s in kept.get("seats", []) if s.get("name")], "maps": [str(m) for m in cfg.get("maps", [])],
        "marine_worlds": bool(options.get("marine_worlds_flag")) if options else None, "config": json.dumps({"options": options, **({"rated": True, "accounts": [cfg.get("account_0"), cfg.get("account_1")]} if cfg.get("rated") else {})}, sort_keys=True) if options else None,
        "engine_version": kept.get("engine_version"), "code_hash": cfg.get("code_hash"), "data_hash": cfg.get("data_hash"),
        "n_actions": event.get("n_actions", kept.get("version")), "result": json.dumps(event["result"]) if event.get("result") is not None else None,
        "gcs_path": event.get("gcs_path"), "exported_at": _ts(event.get("exported_at")), "record_bytes": event.get("record_bytes"), "schema_version": cfg.get("schema_version", 1),
    }
    return {k: v for k, v in row.items() if v is not None and v != []}


class Registry(Protocol):
    def append(self, row: dict) -> None: ...
    def latest(self, table_id: str) -> dict | None: ...


class FakeRegistry:
    """In memory, with the semantics of the real one (an insertId makes a repeat harmless; `latest` is the view)."""
    def __init__(self):
        self.rows: dict = {}
        self.down = False                                      # a test switches it on to see that a game goes on without BigQuery

    def append(self, row: dict) -> None:
        if self.down:
            raise ConnectionError("BigQuery is down")
        self.rows[(row["table_id"], row["event_seq"])] = dict(row)

    def latest(self, table_id: str) -> dict | None:
        mine = [r for (t, s), r in self.rows.items() if t == table_id]
        if not mine:
            return None
        last = dict(max(mine, key=lambda r: r["event_seq"]))
        started = [r["started_at"] for r in mine if r.get("started_at")]
        if started:
            last["started_at"] = last.get("started_at") or max(started)
        return last


class BigQueryRegistry:
    def __init__(self, project: str = PROJECT, dataset: str = DATASET, client=None):
        from google.cloud import bigquery
        self.bq = bigquery
        self.client = client or bigquery.Client(project=project)
        self.project, self.dataset = project, dataset

    @property
    def events_table(self) -> str:
        return f"{self.project}.{self.dataset}.{EVENTS}"

    def append(self, row: dict) -> None:
        errors = self.client.insert_rows_json(self.events_table, [row], row_ids=[f"{row['table_id']}:{row['event_seq']}"])
        if errors:
            raise RuntimeError(f"BigQuery refused the row: {errors}")

    def latest(self, table_id: str) -> dict | None:
        q = f"SELECT * FROM `{self.project}.{self.dataset}.{VIEW}` WHERE table_id = @t"
        job = self.client.query(q, job_config=self.bq.QueryJobConfig(query_parameters=[self.bq.ScalarQueryParameter("t", "STRING", table_id)]))
        rows = list(job.result())
        return dict(rows[0]) if rows else None

    def ensure(self) -> None:
        """Create the dataset objects when they are missing (idempotent): the events table and the view."""
        bq = self.bq
        self.client.create_dataset(bq.Dataset(f"{self.project}.{self.dataset}"), exists_ok=True)
        table = bq.Table(self.events_table, schema=[bq.SchemaField(n, t, mode=m) for n, t, m in SCHEMA])
        table.clustering_fields = ["table_id"]
        self.client.create_table(table, exists_ok=True)
        self.client.query(view_sql(self.project, self.dataset)).result()
