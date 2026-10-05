"""Rules of single zoo maps that change the common mechanics.

Map 12 (AI): up to four black squares cover the action strength numbers 1, 2, 4, 5 in that order (the 3 always stays open). A square comes
from each covered black-square hex of the map, from the second university and from the third worker. An action card in a space whose number
is covered gets the next higher number that is still visible (the strength track goes on past 5: with all four squares the spaces 1-3 have
strength 3 and the spaces 4 and 5 strength 6).
"""
from ark_nova import data
from ark_nova.engine import build_action
from ark_nova.engine.board import board, neighbours

CONCEAL_ORDER = (1, 2, 4, 5)


def conceal_markers(p) -> int:
    """Black squares the player has earned on map 12."""
    bd = board(p.map_id)
    covered = {c for b in p.buildings if build_action.knows_shape(b.type) for c in build_action.footprint(b.type, b.x, b.y, b.rotation)}
    hexes = sum(1 for c, bonuses in bd.bonuses.items() if c in covered and any(b and b["type"] == "conceal" for b in bonuses))
    universities = sum(1 for t in p.tokens if t.location.startswith("university_"))
    workers = sum(1 for t in p.tokens if t.type == "worker" and not t.location.startswith("supply_"))
    return min(len(CONCEAL_ORDER), hexes + (universities >= 2) + (workers >= 3))


def strength_bonus(p, slot: int) -> int:
    """Strength an action card in space `slot` (1-5) gets from the concealed numbers (0 on every other map)."""
    if p.map_id != "12":
        return 0
    hidden = set(CONCEAL_ORDER[:conceal_markers(p)])
    s = slot
    while s in hidden:
        s += 1
    return s - slot


def t1_discard_possible(p) -> bool:
    """Map T1: with the top-left bonus space unlocked, once in the turn a hand card may be discarded for +1 strength of an action."""
    return p.map_id == "T1" and bool(p.flags.get("bonus_used", 0) & 1) and not p.flags.get("t1_used") and bool(p.hand)


# ---- map 13 (Drawing Board): the four areas -------------------------------------------------------------------------------------------

# ---- map 1 (Observation Tower) ---------------------------------------------------------------------------------------------------------

def tower_appeal(p, b) -> int:
    """Maps 1 / 1a: 2 appeal each time a standard enclosure next to the Observation Tower is flipped to its occupied side."""
    if p.map_id not in ("1", "1a") or not b.type.startswith("size-"):
        return 0
    tower = next((s for s in data.map_by_id(p.map_id)["geometry"]["special_hexes"] if s["kind"] == "observation_tower"), None)
    if tower is None:
        return 0
    cells = set(build_action.footprint(b.type, b.x, b.y, b.rotation))
    return 2 if any(n in cells for n in neighbours((tower["x"], tower["y"]))) else 0


# ---- map 9 (Geographical Zoo) -----------------------------------------------------------------------------------------------------------

CONTINENTS = ("Europe", "Americas", "Africa", "Australia", "Asia")
CONTINENT_BONUSES = ({"reputation": 1}, {"appeal": 2}, {"money": 4}, {"Clever": 1}, {"kiosk-pavilion": 1})      # the 5 bonuses depicted (logs)


def continent_cells(map_id: str) -> dict:
    out: dict = {}
    for s in data.map_by_id(map_id)["geometry"]["special_hexes"]:
        if s["kind"] == "continent_area":
            out.setdefault(s["note"], set()).add((s["x"], s["y"]))
    return out


def continents_left(p) -> list:
    done = p.flags.get("m9_removed", 0)
    return [c for i, c in enumerate(CONTINENTS) if not done >> i & 1]


def continent_effects(state, p, key: str, b) -> list:
    """Map 9: an animal played into an enclosure that has a space in the area of one of its continents may remove that area's marker for a bonus."""
    if p.map_id != "9" or b is None or not build_action.knows_shape(b.type):
        return []
    from ark_nova.engine.animals_action import CONTINENT_TAGS, card
    cells = set(build_action.footprint(b.type, b.x, b.y, b.rotation))
    area = continent_cells(p.map_id)
    mine = {CONTINENT_TAGS[t] for t in card(key).get("tags", []) if t in CONTINENT_TAGS}
    return [{"kind": "continent", "continent": c, "optional": True, "player": p.seat, "source": "map9"}
            for c in continents_left(p) if c in mine and area.get(c, set()) & cells]


def covered_cells(p) -> set:
    return {c for b in p.buildings if build_action.knows_shape(b.type) for c in build_action.footprint(b.type, b.x, b.y, b.rotation)}


def quarters(map_id: str) -> dict:
    """Map 13: the 4 areas (cells without rock / water) that the two rock / river diagonals through the centre (4, 6) separate."""
    bd = board(map_id)
    out: dict = {"top": set(), "right": set(), "bottom": set(), "left": set()}
    for c in bd.cells:
        if bd.terrain[c] != "plain" or c in ((4, 5), (4, 7)):
            continue
        dx, dy = c[0] - 4, c[1] - 6
        d = abs(dy) - 1.25 * abs(dx)                       # > 0: above / below the diagonals, < 0: left / right of them
        if abs(d) <= 1.0:
            continue                                       # a hex on the diagonal
        out[("top" if dy < 0 else "bottom") if d > 0 else ("left" if dx < 0 else "right")].add(c)
    return out


QUARTER_BONUS = {"top": {"money": 3}, "right": {"appeal": 2}, "bottom": {"reputation": 1}, "left": {"hunter": 4}}


def quarters_done(p) -> set:
    """The areas of map 13 that are completely covered."""
    if p.map_id != "13":
        return set()
    cov = covered_cells(p) | {(4, 5), (4, 7)}
    return {name for name, cells in quarters(p.map_id).items() if cells <= cov}


def quarter_bonus(state, seat: int, name: str) -> None:
    """The depicted bonus of a covered area, when it is covered and in each break (the left one is a Hunter 4 effect)."""
    from ark_nova.engine import bonuses
    from ark_nova.engine import game as g
    bonus = QUARTER_BONUS[name]
    if "hunter" in bonus:
        bonuses.defer(state, {"kind": "reveal", "source": "map13", "x": bonus["hunter"], "filter": "animal", "optional": False, "player": seat})
    else:                                                                 # an effect that the player resolves (it cannot be skipped)
        for res, n in bonus.items():
            bonuses.defer(state, {"kind": "gain", "source": "map13", "res": res, "n": n, "optional": False, "player": seat})


# ---- maps 7 / 7a (Ice Cream Parlors): the kiosk placement bonuses -------------------------------------------------------------------

def kiosk_hexes_covered(p) -> bool:
    if p.map_id not in ("7", "7a"):
        return False
    from ark_nova import data
    hexes = [(pb["x"], pb["y"]) for pb in data.map_by_id(p.map_id)["geometry"]["placement_bonuses"] if "kiosk" in (pb.get("note") or "")]
    return bool(hexes) and set(hexes) <= covered_cells(p)


# ---- maps 8 / 8a (Hollywood): the H spaces ---------------------------------------------------------------------------------------------

def hollywood_hexes(map_id: str) -> list:
    from ark_nova import data
    if map_id not in ("8", "8a"):
        return []
    return [(sp["x"], sp["y"]) for sp in data.map_by_id(map_id)["geometry"]["special_hexes"] if sp["kind"] == "hollywood_h"]


def hollywood_complete(p) -> bool:
    """Every H is covered: each sponsor card has strength -1 when played."""
    hexes = hollywood_hexes(p.map_id)
    return bool(hexes) and set(hexes) <= covered_cells(p)
