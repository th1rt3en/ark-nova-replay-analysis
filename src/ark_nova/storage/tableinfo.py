"""What the replay site needs from BGA's table info (`tableinfos.html`, captured by the browser extension) instead of the index.

BGA rates players on its own scale; the index (`all_games_stat.elo`, the Elo before the game, truncated) is that scale minus 1300. Checked on table 607674960:
pre-match rating = `rank_after_game` - `point_win` (the change of the game), index elo = floor(pre-match - 1300), `post_match_elo` = `rank_after_game` - 1300.
"""
import math

from ark_nova import data
from ark_nova.storage.index import TableRecord, map_id


OFFSET = 1300


def _number(value) -> float | None:
    """A number of the table info, or None: a friendly game has no rating, BGA sends null (or an empty string) for `rank_after_game` and `point_win`."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _players(info: dict) -> list[dict]:
    players = (info.get("result") or {}).get("player") if isinstance(info.get("result"), dict) else None
    return [p for p in players or [] if isinstance(p, dict) and p.get("player_id") is not None]


def elos_from_tableinfo(info: dict) -> dict[str, int]:
    """{BGA player id: the Elo the player had before the game} (the index's `elo`); a player with no rating (a friendly game) is left out."""
    out: dict[str, int] = {}
    for p in _players(info):
        after, win = _number(p.get("rank_after_game")), _number(p.get("point_win"))
        if after is not None and win is not None:
            out[str(p["player_id"])] = math.floor(after - win - OFFSET)
    return out


def elos_after_from_tableinfo(info: dict) -> dict[str, int]:
    """{BGA player id: the Elo the player has after the game} (the index's `post_match_elo` = `rank_after_game` - 1300)."""
    return {str(p["player_id"]): round(after - OFFSET) for p in _players(info) if (after := _number(p.get("rank_after_game"))) is not None}


def elo_changes_from_tableinfo(info: dict) -> dict[str, int]:
    """{BGA player id: the change of the game} (`point_win`, rounded)."""
    return {str(p["player_id"]): round(win) for p in _players(info) if (win := _number(p.get("point_win"))) is not None}


ESTIMATE_K = 20                                         # BGA's K for an established player (accounts/rating.py: checked on 74,124 games)


def estimate_elo_changes(elos: dict[str, int], ranks: dict[str, int]) -> dict[str, int]:
    """{BGA player id: the change of the game} worked out for a game of two with the Elo before it (`elos`) and the result (`ranks`: 1 = won, equal ranks = a draw), with K=20.
    Used when the table info is not there (a review page opened without the table page): the extension reads the Elo off BGA's replay. {} unless both players are known."""
    pids = list(ranks)
    if len(pids) != 2 or any(p not in elos for p in pids):
        return {}
    a, b = pids
    score = 1.0 if ranks[a] < ranks[b] else 0.5 if ranks[a] == ranks[b] else 0.0
    expected = 1.0 / (1.0 + 10 ** ((elos[b] - elos[a]) / 400.0))
    change = round(ESTIMATE_K * (score - expected))
    return {a: change, b: -change}


def table_id_of(info: dict) -> str:
    return str(info.get("id") or "")


def is_known_map(map_label: str) -> bool:
    """A map id of the data ('9', '3a', 'T1'); BGA hides the maps of the end-of-game stats from players without BGA premium ('*masked*')."""
    try:
        data.map_by_id(map_label)
        return True
    except KeyError:
        return False


def maps_from_tableinfo(info: dict) -> dict[str, str]:
    """{BGA player id: map id} from the table info (`result.stats.player.map`, labelled "Map 9: Geographical Zoo"); {} when it is not there.
    A map that BGA masks (the viewer has no BGA premium) is left out: the extension reads it off BGA's replay, else the log tells it."""
    field = (((info.get("result") or {}).get("stats") or {}).get("player") or {}).get("map") or {}
    labels = field.get("valuelabels") or {}
    out = {str(pid): map_id(labels.get(pid) or f"Map {value}") for pid, value in (field.get("values") or {}).items()}
    return {pid: m for pid, m in out.items() if is_known_map(m)}


def maps_masked(info: dict) -> bool:
    """Whether the table info has the maps of the players but BGA hid them (no BGA premium): the extension then has to read them off BGA's replay."""
    field = (((info.get("result") or {}).get("stats") or {}).get("player") or {}).get("map") or {}
    return bool(field) and not maps_from_tableinfo(info)


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
    return TableRecord(table_id=table_id, elos=elos_from_tableinfo(info), elos_after=elos_after_from_tableinfo(info), elo_changes=elo_changes_from_tableinfo(info), same_map=same_map_of(info), player_maps=maps_from_tableinfo(info), marine_worlds=marine_worlds_of(info))
