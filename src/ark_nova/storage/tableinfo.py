"""What the replay site needs from BGA's table info (`tableinfos.html`, captured by the browser extension) instead of the index.

BGA rates players on its own scale; the index (`all_games_stat.elo`, the Elo before the game, truncated) is that scale minus 1300. Checked on table 607674960:
pre-match rating = `rank_after_game` - `point_win` (the change of the game), index elo = floor(pre-match - 1300), `post_match_elo` = `rank_after_game` - 1300.
"""
import math


OFFSET = 1300


def elos_from_tableinfo(info: dict) -> dict[str, int]:
    """{BGA player id: the Elo the player had before the game} (the index's `elo`)."""
    out: dict[str, int] = {}
    for p in (info.get("result") or {}).get("player") or []:
        out[str(p["player_id"])] = math.floor(float(p["rank_after_game"]) - float(p["point_win"]) - OFFSET)
    return out


def table_id_of(info: dict) -> str:
    return str(info.get("id") or "")
