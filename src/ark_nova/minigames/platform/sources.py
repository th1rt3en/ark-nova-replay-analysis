"""Where the tables of the puzzles come from (docs/accounts_plan.md, "Daily rollover and picking the table").

A `SourceIndex` answers one question for a game: give me up to `k` random candidate table ids that the game has not used yet. The production one runs the game's own SQL
file (`minigames/sql/<key>.sql`) on BigQuery; `ListSourceIndex` (tests, dev server) takes a plain list.
"""
from pathlib import Path
from typing import Iterable, Protocol


class SourceIndex(Protocol):
    def candidates(self, game_key: str, exclude: frozenset, k: int, rng) -> list[int]: ...


class ListSourceIndex:
    """A fixed list of table ids (the same for every game, or one list per game key)."""

    def __init__(self, tables: Iterable[int] | dict):
        self._tables = tables

    def candidates(self, game_key, exclude, k, rng):
        pool = self._tables.get(game_key, []) if isinstance(self._tables, dict) else list(self._tables)
        pool = [t for t in pool if t not in exclude]
        rng.shuffle(pool)
        return pool[:k]


SQL_DIR = Path(__file__).resolve().parents[1] / "sql"


class BigQuerySourceIndex:
    """Runs the game's own SQL file `minigames/sql/<key>.sql` (edited by hand: it holds the filters). The query gets the parameters `@exclude` (an array of
    table ids already used by that game) and `@k` and must return `table_id` rows in random order, at most `@k`."""

    def __init__(self, sql_dir: Path = SQL_DIR):
        self._dir = sql_dir
        self._client = None

    def candidates(self, game_key, exclude, k, rng):
        from google.cloud import bigquery                     # the `gcp` extra

        sql = (self._dir / f"{game_key}.sql").read_text(encoding="utf-8")
        self._client = self._client or bigquery.Client()
        config = bigquery.QueryJobConfig(query_parameters=[bigquery.ArrayQueryParameter("exclude", "INT64", sorted(exclude)), bigquery.ScalarQueryParameter("k", "INT64", k)])
        return [int(r["table_id"]) for r in self._client.query(sql, job_config=config).result()]
