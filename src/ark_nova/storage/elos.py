"""The Elo of the players of a table before it was played (BigQuery `all_games_stat.pre_match_elo`), for the mini games."""
from typing import Protocol

from ark_nova.storage.cache import TTLCache


class EloSource(Protocol):
    def get(self, table_id: int) -> dict: ...


class NoElos:
    def get(self, table_id):
        return {}


class BigQueryElos:
    TTL = 6 * 3600.0

    def __init__(self, stats_table: str):
        self._table = stats_table
        self._client = None
        self._cache = TTLCache()

    def get(self, table_id: int) -> dict:
        """{BGA player id: Elo rounded to a whole number}; {} when BigQuery cannot be reached (a puzzle then shows no Elo rather than failing)."""
        return self._cache.get_or_load(table_id, lambda: self._load(table_id), lambda rows: self.TTL if rows else 60.0)

    def _load(self, table_id: int) -> dict:
        try:
            from google.cloud import bigquery

            self._client = self._client or bigquery.Client()
            config = bigquery.QueryJobConfig(query_parameters=[bigquery.ScalarQueryParameter("t", "INT64", table_id)])
            rows = self._client.query(f"SELECT player_id, pre_match_elo FROM `{self._table}` WHERE table_id = @t", job_config=config).result()
            return {str(r["player_id"]): round(r["pre_match_elo"]) for r in rows if r["pre_match_elo"] is not None}
        except Exception:                                                         # noqa: BLE001
            return {}
