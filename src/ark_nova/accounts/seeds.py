"""Where a new account's starting Elo comes from: the BGA players of the BigQuery index (docs/accounts_plan.md, "Signup and the BGA Elo copy").

`lookup(name)` returns every BGA player id that has ever used that username (case-insensitive), each with its latest `post_match_elo`. The production index reads the small
table `bga_player_elo`, rebuilt daily from `all_games_stat` (`scripts/setup_bga_player_elo.py`); scanning the view on every signup would read about 370 MB.
"""
from dataclasses import dataclass
from typing import Iterable, Optional, Protocol


@dataclass(frozen=True)
class BgaPlayer:
    bga_player_id: str
    name: str
    elo: float                        # post_match_elo of that player's latest game
    arena: Optional[int] = None
    games: int = 0
    last_game_at: str = ""


class BgaSeedIndex(Protocol):
    def lookup(self, username_lower: str) -> list[BgaPlayer]: ...


class NoSeeds:
    """No BGA data configured: every name is a new player."""

    def lookup(self, username_lower):
        return []


class ListSeedIndex:
    def __init__(self, players: Iterable[BgaPlayer]):
        self._by_name: dict[str, list[BgaPlayer]] = {}
        for p in players:
            self._by_name.setdefault(p.name.lower(), []).append(p)

    def lookup(self, username_lower):
        return sorted(self._by_name.get(username_lower, []), key=lambda p: p.last_game_at, reverse=True)


class BigQuerySeedIndex:
    def __init__(self, table: str):
        self._table = table
        self._client = None

    def lookup(self, username_lower):
        from google.cloud import bigquery                              # the `gcp` extra

        self._client = self._client or bigquery.Client()
        config = bigquery.QueryJobConfig(query_parameters=[bigquery.ScalarQueryParameter("name", "STRING", username_lower)])
        rows = self._client.query(f"SELECT bga_player_id, player, elo, arena_rating, games, last_game_at FROM `{self._table}` WHERE player_lower = @name ORDER BY last_game_at DESC", job_config=config).result()
        return [BgaPlayer(str(r["bga_player_id"]), r["player"], float(r["elo"]), r["arena_rating"], int(r["games"] or 0), r["last_game_at"].isoformat() if r["last_game_at"] else "") for r in rows]
