"""Log index lookup (BigQuery `table_logs`).

A table is *indexed* when it has a row (game, config and result acknowledged) and *logged* when that row points at a processed
log in GCS. Sources: `freestyle-190711.ark_nova.all_games_stat` and `freestyle-190711.ark_nova_processing.logs_archive_mapping`.
"""
import re
from dataclasses import dataclass, field
from typing import Protocol

from ark_nova.storage.cache import TTLCache


@dataclass(frozen=True)
class TableRecord:
    table_id: int
    gcs_path: str | None = None  # None until the log has been collected and processed
    player_maps: dict[str, str] = field(default_factory=dict)  # BGA player id -> map id ('1', '3a', 'T1', ...)
    marine_worlds: bool = False

    @property
    def logged(self) -> bool:
        return bool(self.gcs_path)

    @property
    def two_players(self) -> bool:
        return not self.player_maps or len(self.player_maps) == 2


class TableIndex(Protocol):
    def find(self, table_id: int) -> TableRecord | None:
        """None when the table is not indexed."""
        ...


class NotConfiguredIndex:
    """Default until BigQuery is configured: every table is 'not indexed'."""

    def find(self, table_id: int) -> TableRecord | None:
        return None


def map_id(name: str) -> str:
    """BigQuery stores map names ('Map 3a: Silver Lake', 'Map A'); the engine uses the id ('3a', 'A')."""
    return re.match(r"Map (\S+?)(?::|$)", name.strip()).group(1) if re.match(r"Map \S", name.strip()) else name.strip()


class BigQueryIndex:
    """Indexed = rows in `all_games_stat` (table_id, player_id, map, is_mw; one row per player). Logged = a row in `logs_archive_mapping`
    (table_id, file_name = object name in the GCS bucket). Marine Worlds is on when any row has is_mw."""

    HIT_TTL = 3600.0
    MISS_TTL = 60.0

    def __init__(self, stats_table: str, logs_table: str):
        self._client = None  # created on first use, so importing the app needs neither the `gcp` extra nor credentials
        self._cache = TTLCache()  # one entry per (table, id) query
        self._stats_table = stats_table
        self._logs_table = logs_table

    def _query(self, sql: str, table_id: int | str) -> list:
        """Cached: results stay for an hour, empty ones (not indexed / not logged yet) only a minute since they change once the table is processed."""
        return self._cache.get_or_load((sql, table_id), lambda: self._run(sql, table_id), lambda rows: self.HIT_TTL if rows else self.MISS_TTL)

    def _run(self, sql: str, table_id: int | str) -> list:
        from google.cloud import bigquery  # the `gcp` extra

        self._client = self._client or bigquery.Client()
        config = bigquery.QueryJobConfig(query_parameters=[bigquery.ScalarQueryParameter("table_id", "INT64" if isinstance(table_id, int) else "STRING", table_id)])
        return [dict(r) for r in self._client.query(sql, job_config=config).result()]

    def find(self, table_id: int) -> TableRecord | None:
        stats = self._query(f"SELECT table_id, player_id, map, is_mw FROM `{self._stats_table}` WHERE table_id = @table_id", table_id)
        if not stats:
            return None
        logs = self._query(f"SELECT table_id, file_name FROM `{self._logs_table}` WHERE table_id = @table_id LIMIT 1", str(table_id))
        return TableRecord(table_id=table_id, gcs_path=logs[0]["file_name"] if logs else None,
                           player_maps={str(r["player_id"]): map_id(str(r["map"])) for r in stats},
                           marine_worlds=any(bool(r["is_mw"]) for r in stats))
