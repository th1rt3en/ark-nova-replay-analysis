"""Map rules that BGA implemented differently in older games.

Map 6a: the placement bonus (take a card from the deck or the reputation range) that the board prints on hex (8, 5) was first implemented on
hex (8, 7); BGA fixed it later. Tables with an id below MAP_6A_FIXED_FROM_TABLE_ID were played with the bug. The logs of the sample games
put the change between table 800003565 (still on (8, 7)) and 845311539 (on (8, 5)), so the number below is a guess inside that gap: set it to
the first table id that has the fix (or the env var MAP_6A_FIXED_FROM_TABLE_ID) when it is known.
"""
import copy
import os

MAP_6A_FIXED_FROM_TABLE_ID = int(os.environ.get("MAP_6A_FIXED_FROM_TABLE_ID", "800004000"))

# Project P129 (Geological): BGA may have asked 4 rock icons for the second slot before a fix, the printed card asks 3. No sample log shows the 4-icon rule
# (the oldest ones, tables 626827519 and 647641584, already offer the slot with 3), so the default is 0 = the bug never applies. Set it to the first table
# id that has the fix (or the env var GEOLOGICAL_FIXED_FROM_TABLE_ID) when a log needs it.
GEOLOGICAL_FIXED_FROM_TABLE_ID = int(os.environ.get("GEOLOGICAL_FIXED_FROM_TABLE_ID", "0"))

# Hypnosis: the variant effect of the opponent's action card (Money Sponsors bonus, Mark, the extra kiosk ...) is part of the hypnotised action. BGA first
# left it out; tables below this id were played with the bug. The sample logs put the change between table 732463562 (no Sponsors II bonus) and
# 739307302 (the Sponsors 3 effect of a hypnotised card happens; 756726232 pays the Sponsors II bonus), so the number is a guess inside that gap: set
# it to the first table id that has the fix (or the env var HYPNOSIS_VARIANT_FIXED_FROM_TABLE_ID) when it is known.
HYPNOSIS_VARIANT_FIXED_FROM_TABLE_ID = int(os.environ.get("HYPNOSIS_VARIANT_FIXED_FROM_TABLE_ID", "735000000"))

LEGACY_SUFFIX = "-legacy"                      # '6a-legacy' = map 6a as BGA played it before the fix
_LEGACY_MOVES = {"6a": {"take-in-range-or-deck": {(8, 5): (8, 7)}}}      # base map -> bonus type -> {printed cell: cell where it worked}


def base_map_id(map_id: str) -> str:
    return map_id[:-len(LEGACY_SUFFIX)] if str(map_id).endswith(LEGACY_SUFFIX) else str(map_id)


def played_map_id(map_id: str, table_id: int) -> str:
    """The id of the map as it behaved in table `table_id` (the plain id unless the table is older than the fix of that map)."""
    if map_id == "6a" and 0 < table_id < MAP_6A_FIXED_FROM_TABLE_ID:
        return map_id + LEGACY_SUFFIX
    return map_id


def hypnosis_runs_variant(table_id: int, card_type: str = "", variant: int = 0) -> bool:
    """Whether a hypnotised card of the opponent runs its variant effect (the extra of the card's face: the Money Sponsors bonus, the Mark, the extra kiosk ...) in table `table_id`.
    Tested on all 83 sample tables below 735000000 that have a hypnosis (variants always run vs the old rule): only the Money Sponsors (variant 2) bonus of a hypnotised
    Sponsors card was left out on the older tables (661243248 turn 30, 677651655 turn 40, 732463562 turn 41: engine 5 money above the log); every other variant ran (the
    Mark of 677396972 and 677682492, the +1 Build kiosk / pavilion of 668290113 and 716484804, the Cards variant of 669771146 and 715786486, the Sponsors side actions of
    719561092 and 729387250)."""
    if table_id <= 0 or table_id >= HYPNOSIS_VARIANT_FIXED_FROM_TABLE_ID:
        return True
    return not (card_type == "sponsors" and variant == 2)


def project_for_table(card: dict, table_id: int) -> dict:
    """The project as it behaved in table `table_id` (Geological asked 4 rock icons for its second slot before the fix)."""
    if card.get("key") == "P129" and 0 < table_id < GEOLOGICAL_FIXED_FROM_TABLE_ID:
        card = copy.deepcopy(card)
        card["slots"][1]["indicator"] = 4
    return card


def legacy_map(base: dict, map_id: str) -> dict:
    """Copy of the map data with the placement bonuses moved to where the old BGA implementation had them."""
    m = copy.deepcopy(base)
    m["id"] = map_id
    for pb in m["geometry"]["placement_bonuses"]:
        moves = _LEGACY_MOVES[base["id"]].get((pb["bonus"] or {}).get("type"), {})
        if (pb["x"], pb["y"]) in moves:
            pb["x"], pb["y"] = moves[(pb["x"], pb["y"])]
    return m
