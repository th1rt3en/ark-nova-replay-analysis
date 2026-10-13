"""What the replay site needs from BGA's table info (`tableinfos.html`, captured by the browser extension) instead of the index.

BGA rates players on its own scale; the index (`all_games_stat.elo`, the Elo before the game, truncated) is that scale minus 1300. Checked on table 607674960:
pre-match rating = `rank_after_game` - `point_win` (the change of the game), index elo = floor(pre-match - 1300), `post_match_elo` = `rank_after_game` - 1300.
"""
import math

from ark_nova.storage.index import TableRecord, map_id


OFFSET = 1300


def elos_from_tableinfo(info: dict) -> dict[str, int]:
    """{BGA player id: the Elo the player had before the game} (the index's `elo`)."""
    out: dict[str, int] = {}
    for p in (info.get("result") or {}).get("player") or []:
        out[str(p["player_id"])] = math.floor(float(p["rank_after_game"]) - float(p["point_win"]) - OFFSET)
    return out


def table_id_of(info: dict) -> str:
    return str(info.get("id") or "")


def maps_from_tableinfo(info: dict) -> dict[str, str]:
    """{BGA player id: map id} from the table info (`result.stats.player.map`, labelled "Map 9: Geographical Zoo"); {} when it is not there."""
    field = (((info.get("result") or {}).get("stats") or {}).get("player") or {}).get("map") or {}
    labels = field.get("valuelabels") or {}
    return {str(pid): map_id(labels.get(pid) or f"Map {value}") for pid, value in (field.get("values") or {}).items()}


def marine_worlds_of(info: dict) -> bool:
    """The "Expansion" option (111) is on for Marine Worlds (checked on table 607674960: the index says Marine Worlds, the option is 1)."""
    return str((info.get("options") or {}).get("111", {}).get("value")) == "1"


def same_map_of(info: dict) -> bool:
    """BGA's "Competitive level" option (102) is "Same map for all players" in the table info."""
    opt = (info.get("options") or {}).get("102") or {}
    values = opt.get("values")
    try:
        return values[int(opt["value"])]["name"] == "Same map for all players"
    except (KeyError, IndexError, TypeError, ValueError):
        return False


def record_from_tableinfo(info: dict, table_id: int) -> TableRecord:
    """The record that stands in for the index of a table that is not indexed: the Elo of the players (the maps and Marine Worlds come from the log)."""
    return TableRecord(table_id=table_id, elos=elos_from_tableinfo(info), same_map=same_map_of(info), player_maps=maps_from_tableinfo(info), marine_worlds=marine_worlds_of(info))
