"""Map rules that BGA implemented differently in older games.

Map 6a: the placement bonus (take a card from the deck or the reputation range) that the board prints on hex (8, 5) was first implemented on
hex (8, 7); BGA fixed it later. Tables with an id below MAP_6A_FIXED_FROM_TABLE_ID were played with the bug. The logs of the sample games
put the change between table 800003565 (still on (8, 7)) and 845311539 (on (8, 5)), so the number below is a guess inside that gap: set it to
the first table id that has the fix (or the env var MAP_6A_FIXED_FROM_TABLE_ID) when it is known.
"""
import copy
import os

MAP_6A_FIXED_FROM_TABLE_ID = int(os.environ.get("MAP_6A_FIXED_FROM_TABLE_ID", "800004000"))

LEGACY_SUFFIX = "-legacy"                      # '6a-legacy' = map 6a as BGA played it before the fix
_LEGACY_MOVES = {"6a": {"take-in-range-or-deck": {(8, 5): (8, 7)}}}      # base map -> bonus type -> {printed cell: cell where it worked}


def base_map_id(map_id: str) -> str:
    return map_id[:-len(LEGACY_SUFFIX)] if str(map_id).endswith(LEGACY_SUFFIX) else str(map_id)


def played_map_id(map_id: str, table_id: int) -> str:
    """The id of the map as it behaved in table `table_id` (the plain id unless the table is older than the fix of that map)."""
    if map_id == "6a" and 0 < table_id < MAP_6A_FIXED_FROM_TABLE_ID:
        return map_id + LEGACY_SUFFIX
    return map_id


def legacy_map(base: dict, map_id: str) -> dict:
    """Copy of the map data with the placement bonuses moved to where the old BGA implementation had them."""
    m = copy.deepcopy(base)
    m["id"] = map_id
    for pb in m["geometry"]["placement_bonuses"]:
        moves = _LEGACY_MOVES[base["id"]].get((pb["bonus"] or {}).get("type"), {})
        if (pb["x"], pb["y"]) in moves:
            pb["x"], pb["y"] = moves[(pb["x"], pb["y"])]
    return m
