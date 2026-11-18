"""Log index lookup (BigQuery `table_logs`).

A table is *indexed* when it has a row (game, config and result acknowledged) and *logged* when that row points at a processed
log in GCS. Sources: `freestyle-190711.ark_nova.all_games_stat` and `freestyle-190711.ark_nova_processing.logs_archive_mapping`.
"""
import logging
import re
from dataclasses import dataclass, field
from typing import Protocol

from ark_nova.storage.cache import TTLCache

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class TableRecord:
    table_id: int
    gcs_path: str | None = None  # None until the log has been collected and processed
    player_maps: dict[str, str] = field(default_factory=dict)  # BGA player id -> map id ('1', '3a', 'T1', ...)
    marine_worlds: bool = False
    same_map: bool = False  # "Same map for all players" (BGA option 102 in the table info): both players play the same map
    elos: dict[str, int] = field(default_factory=dict)  # BGA player id -> the player's Elo at this table (column `elo`)
    thinking_times: dict[str, int] = field(default_factory=dict)  # BGA player id -> the player's thinking time in seconds (column `thinking_time`)
    elos_after: dict[str, int] = field(default_factory=dict)  # BGA player id -> the player's Elo after the game (column `post_match_elo`, same scale as `elos`)
    elo_changes: dict[str, int] = field(default_factory=dict)  # BGA player id -> the change of the game (`post_match_elo` - `pre_match_elo`, rounded)
    peaceful: bool | None = None  # BGA's "Peaceful mode" option (103): True / False when known (the table info of the extension, the index's `options`), None = not known: the replay then goes by `arena` and the log
    arena: bool | None = None  # the game has an arena rating (`pre_match_arena_rating` is filled): an arena game is never peaceful; None = not known
    base_projects: list[str] = field(default_factory=list)  # the 3 base projects in play, positions base_0..2 (['P103', 'P106', 'P111']), read off BGA's replay by the extension; empty = infer from the log

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


# One query per table reads everything the app needs from the stats rows; the view `all_games_stat` is billed for the whole raw table on every call (about 450 MB),
# so what the replay, the Elo chips and the mini games need is asked once, kept, and read from the small clustered `table_index` when that exists.
STATS_COLUMNS = "table_id, player_id, map, is_mw, elo, thinking_time, pre_match_elo, post_match_elo, pre_match_arena_rating"
CORE_COLUMNS = "table_id, player_id, map, is_mw, elo, thinking_time"      # (what a stats table without the Elo / arena columns still has)


class BigQueryIndex:
    """Indexed = rows in `all_games_stat` (table_id, player_id, map, is_mw; one row per player). Logged = a row in `logs_archive_mapping`
    (table_id, file_name = object name in the GCS bucket). Marine Worlds is on when any row has is_mw.

    `index_table` (optional, built by `scripts/setup_table_index.py`): a clustered copy of the columns below, one row per player and table. A lookup there reads a few KB
    instead of the whole view; a table that is not in it is looked up in the view only when it is recent (games finish and are processed days after their table id was
    made, so the copy lags)."""

    HIT_TTL = 3600.0
    FINAL_TTL = 24 * 3600.0          # rows of a finished, rated game never change
    MISS_TTL = 60.0
    SNAPSHOT_TTL = 600.0
    MISS_WINDOW = 25_000_000         # a table id this far below the newest one of `index_table` is not looked up in the view (about 50 days of table ids)

    def __init__(self, stats_table: str, logs_table: str, index_table: str = ""):
        self._client = None  # created on first use, so importing the app needs neither the `gcp` extra nor credentials
        self._cache = TTLCache()  # one entry per (table, id) query
        self._stats_table = stats_table
        self._logs_table = logs_table
        self._index_table = index_table

    def _query(self, sql: str, table_id: int | str) -> list:
        """Cached: results stay for an hour, empty ones (not indexed / not logged yet) only a minute since they change once the table is processed."""
        return self._cache.get_or_load((sql, table_id), lambda: self._run(sql, table_id), lambda rows: self.HIT_TTL if rows else self.MISS_TTL)

    def _run(self, sql: str, table_id: int | str | None = None) -> list:
        from google.cloud import bigquery  # the `gcp` extra

        self._client = self._client or bigquery.Client()
        params = [] if table_id is None else [bigquery.ScalarQueryParameter("table_id", "INT64" if isinstance(table_id, int) else "STRING", table_id)]
        return [dict(r) for r in self._client.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=params)).result()]

    # --- the stats rows of a table: one query, shared by the replay, the Elo chips and the mini games ---

    def stats_rows(self, table_id: int) -> list[dict]:
        def ttl(rows):
            if not rows:
                return self.MISS_TTL
            return self.FINAL_TTL if all(r.get("post_match_elo") is not None for r in rows) else self.HIT_TTL

        return self._cache.get_or_load(("stats", table_id), lambda: self._load_stats(table_id), ttl)

    def _load_stats(self, table_id: int) -> list[dict]:
        if self._index_table:
            try:
                rows = self._run(f"SELECT {STATS_COLUMNS}, peaceful_option FROM `{self._index_table}` WHERE table_id = @table_id", table_id)
                if rows:
                    return rows
                newest = self._newest_indexed()
                if newest is not None and table_id < newest - self.MISS_WINDOW:
                    return []
            except Exception:                                                     # noqa: BLE001
                log.warning("table index %s unreadable, using the view", self._index_table, exc_info=True)
        try:
            return self._run(f"SELECT {STATS_COLUMNS} FROM `{self._stats_table}` WHERE table_id = @table_id", table_id)
        except Exception:                                                         # noqa: BLE001
            # a table without the Elo / arena columns only costs the Elo chip and the arena flag, never the replay
            return self._run(f"SELECT {CORE_COLUMNS} FROM `{self._stats_table}` WHERE table_id = @table_id", table_id)

    def _newest_indexed(self) -> int | None:
        def load():
            rows = self._run(f"SELECT MAX(table_id) AS newest FROM `{self._index_table}`")
            return rows[0]["newest"] if rows and rows[0].get("newest") is not None else None

        return self._cache.get_or_load(("newest", self._index_table), load, lambda v: self.SNAPSHOT_TTL)

    def elos_before(self, table_id: int) -> dict[str, int]:
        """{BGA player id: Elo before the game (`pre_match_elo`)}; {} when it cannot be read (the mini games then show no Elo)."""
        try:
            rows = self.stats_rows(table_id)
        except Exception:                                                         # noqa: BLE001
            return {}
        return {str(r["player_id"]): round(r["pre_match_elo"]) for r in rows if r.get("pre_match_elo") is not None}

    def find(self, table_id: int) -> TableRecord | None:
        stats = self.stats_rows(table_id)
        if not stats:
            return None
        logs = self._query(f"SELECT table_id, file_name FROM `{self._logs_table}` WHERE table_id = @table_id LIMIT 1", str(table_id))
        after, change = self._elo_after(stats)
        arena, peaceful = self._flags(stats)
        return TableRecord(table_id=table_id, gcs_path=logs[0]["file_name"] if logs else None,
                           player_maps={str(r["player_id"]): map_id(str(r["map"])) for r in stats},
                           marine_worlds=any(bool(r["is_mw"]) for r in stats),
                           elos={str(r["player_id"]): round(r["elo"]) for r in stats if r.get("elo") is not None},
                           thinking_times={str(r["player_id"]): round(r["thinking_time"]) for r in stats if r.get("thinking_time") is not None},
                           elos_after=after, elo_changes=change, arena=arena, peaceful=peaceful)

    @staticmethod
    def _flags(rows: list[dict]) -> tuple[bool | None, bool | None]:
        """(arena, peaceful): whether the game has an arena rating (`pre_match_arena_rating` is filled: then it cannot be a peaceful game) and BGA's "Peaceful mode" option (103,
        `peaceful_option`, only in the table index, filled for some tables only). Without the columns both stay open (None: the replay then infers the peaceful variant from the log)."""
        from ark_nova.storage.tableinfo import peaceful_from_option

        has_arena = any("pre_match_arena_rating" in r for r in rows)
        arena = (any(r.get("pre_match_arena_rating") is not None for r in rows)) if has_arena else None
        answers = {peaceful_from_option(r.get("peaceful_option")) for r in rows} - {None}
        return arena, (answers.pop() if len(answers) == 1 else None)

    @staticmethod
    def _elo_after(rows: list[dict]) -> tuple[dict[str, int], dict[str, int]]:
        """({player id: Elo after the game}, {player id: change of the game}) from `post_match_elo` / `pre_match_elo`; ({}, {}) for a table without those columns."""
        after = {str(r["player_id"]): round(r["post_match_elo"]) for r in rows if r.get("post_match_elo") is not None}
        change = {str(r["player_id"]): round(r["post_match_elo"] - r["pre_match_elo"]) for r in rows if r.get("post_match_elo") is not None and r.get("pre_match_elo") is not None}
        return after, change
