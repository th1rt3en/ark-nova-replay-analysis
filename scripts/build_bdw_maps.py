"""Writes `src/ark_nova/data/bdw_maps.json`: the four Board Design Workshop maps (BDW1 Management Zoo, BDW2 Construction Yard, BDW3 Enigma Isle, BDW4 Vast Valley).

The maps were read off the artwork in `bdw_maps/` (12083 x 6378: the same board layout as the vendor scans, 3 times as large; hex (x, y) is at (713.6 + 204.9 x, 235 + 118 y) of the
picture scaled to 4038 x 2130), see docs/bdw_maps.md. This script is the source of the file: edit the tables here (terrain, placement bonuses, flags, the notepad panel, the
association spaces) and run it again; the result is committed like the other data.

    python scripts/build_bdw_maps.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src" / "ark_nova" / "data" / "bdw_maps.json"
CELLS = [(x, y) for x in range(9) for y in range(13) if (x + y) % 2 == 1]
B = lambda t, v=1: {"type": t, "value": v}                       # noqa: E731

# the placement bonus icons (names as in data/maps.json)
TAKE, CLEVER, X, REP, SPONSOR = "take-in-range-or-deck", "Clever", "xtoken", "reputation", "bonus-sponsor"

INCOME = [(0, "Snapping", 1), (1, "size-2", 1), (2, "money", 5)]      # the three purple spaces of the notepad panel (the same on all four maps)
ASSOC_NOTE = "read off the artwork; spaces are counted from the lowest (1st) up: a 2nd partner zoo / 2nd university gives an upgrade (mode 'second')"


def slots(fourth, tail_first=3, blue=None):
    out = [{"index": i, "kind": "instant_income", "bonus": B(t, v), "note": ""} for i, t, v in INCOME]
    i = 3
    if fourth:
        out.append({"index": i, "kind": "instant", "bonus": B(*fourth[:2]), "note": fourth[2]})
        i += 1
    for t, v in (("Worker", 1), ("money", 12), ("xtoken", 3)):
        out.append({"index": i, "kind": "instant", "bonus": B(t, v), "note": ""})
        i += 1
    if blue:
        out.append({"index": i, "kind": "instant", "bonus": B(*blue[:2]), "note": blue[2]})
    return out


def assoc(partner4, university3, worker3):
    c = lambda n: B("conservation", n) if n else None            # noqa: E731
    return {"workers": [None, None, c(worker3)], "partner_zoos": [None, None, B("Worker"), c(partner4)], "universities": [None, None, c(university3)], "upgrade": {"mode": "second"}}


MAPS = [
    dict(id="BDW1", name="Management Zoo", full_map_appeal=7,
         rock=[(0, 1), (0, 3), (4, 3), (5, 2), (2, 9), (2, 11), (6, 9), (6, 11)], water=[(1, 4), (0, 5), (4, 1), (5, 0), (8, 1), (8, 3), (5, 8), (6, 7)],
         bonuses=[(7, 0, TAKE, 1), (1, 2, "money", 5), (2, 5, CLEVER, 1), (5, 6, TAKE, 1), (0, 7, TAKE, 1), (7, 6, X, 1), (8, 9, "money", 5), (1, 10, X, 1), (4, 11, REP, 1)],
         flags=[(2, 3), (6, 5), (3, 8)], special=[],
         slots=slots(("project-support", 1, "support a conservation project at once, without workers (the project is played like any other, no cube of the player's is put on it)")),
         assoc=assoc(1, 2, None),
         description=["Each time you play the second of a species icon, gain one of: 5 money, Snapping, Marketing.",
                      "Only the 2nd icon of a kind counts, not the 4th or 6th; if you lose it (release) and gain it again the bonus is paid again."]),
    dict(id="BDW2", name="Construction Yard", full_map_appeal=7,
         rock=[(1, 0), (5, 4), (4, 5), (0, 9), (0, 11), (3, 12), (4, 11)], water=[(7, 0), (6, 1), (2, 5), (1, 6), (8, 7), (8, 9), (5, 12)],
         bonuses=[(5, 0, CLEVER, 1), (0, 3, TAKE, 1), (8, 3, X, 1), (2, 7, "kiosk", 1), (4, 7, X, 1), (6, 7, "pavilion", 1), (3, 8, "money", 1), (5, 8, "money", 1), (3, 10, "money", 1),
                  (5, 10, "money", 1), (1, 10, REP, 1), (7, 10, TAKE, 1), (8, 11, SPONSOR, 1)],
         flags=[(1, 2), (7, 2), (4, 9)], special=[{"x": 4, "y": 11, "kind": "crane", "off_board": False, "note": "the crane stands on a rock hex"}],
         slots=slots(("size-5", 1, "a free size-5 enclosure")), assoc=assoc(None, 2, 1),
         description=["You may build adjacent to the crane.",
                      "When you flip an adjacent standard enclosure to its occupied side, you may reposition the enclosure on the map (it must respect its water / rock requirements)."]),
    dict(id="BDW3", name="Enigma Isle", full_map_appeal=5,
         rock=[(7, 0), (6, 1), (0, 3), (1, 4), (5, 4), (5, 6), (2, 7), (6, 7), (2, 9), (6, 9), (2, 11), (8, 11), (1, 12)],
         water=[(1, 0), (0, 1), (8, 1), (2, 3), (6, 3), (8, 3), (3, 4), (3, 6), (4, 7), (0, 9), (0, 11), (6, 11), (7, 12)],
         bonuses=[(6, 1, "money", 6), (2, 3, X, 1), (4, 5, SPONSOR, 1), (8, 5, TAKE, 1), (0, 7, REP, 1), (6, 7, X, 1), (2, 9, TAKE, 1), (5, 10, CLEVER, 1), (7, 12, "money", 6)],
         flags=[(4, 3), (7, 4), (1, 6), (3, 10)], special=[],
         slots=slots(("bonus-kiosk-pavilion", 3, "3 free kiosks / pavilions")), assoc=assoc(2, None, 1),
         description=["You may cover water and rock spaces; pay 1 money per water or rock space you cover this way.",
                      "Income: gain 1 money per pair of connected water and rock spaces."]),
    dict(id="BDW4", name="Vast Valley", full_map_appeal=7,
         rock=[(5, 0), (5, 2), (0, 5), (1, 6), (8, 7), (4, 9), (5, 10), (3, 12)], water=[(4, 1), (8, 1), (5, 4), (2, 5), (6, 5), (0, 7), (4, 11), (5, 12)],
         bonuses=[(3, 0, CLEVER, 1), (0, 1, X, 1), (4, 3, TAKE, 1), (6, 3, REP, 1), (4, 7, SPONSOR, 1), (7, 8, X, 1), (0, 9, TAKE, 1), (3, 10, X, 1), (6, 11, TAKE, 1)],
         flags=[(8, 3), (4, 5), (5, 6), (1, 8)], special=[],
         slots=slots(None, blue=("border-capacity", 1, "passive once unlocked: an enclosure with a hex on the border counts as one size larger for the map's ability")),
         assoc=assoc(1, 1, 1),
         description=["Placing animals in oversized standard enclosures costs 5 less.",
                      "Blue space (once unlocked): a standard enclosure that touches the border counts as one size larger for this ability (a size 4 as a 5, a size 5 as a 6)."]),
]


def record(m):
    terrain = {c: "rock" for c in m["rock"]} | {c: "water" for c in m["water"]}
    cells = set(CELLS)
    assert set(terrain) <= cells and all((x, y) in cells for x, y, *_ in m["bonuses"]) and all(c in cells for c in m["flags"]), m["id"]
    special = [{"x": x, "y": y, "kind": "upgrade_flag", "off_board": False, "note": ""} for x, y in m["flags"]] + m["special"]
    geometry = {"hexes": [{"x": x, "y": y, "terrain": terrain.get((x, y), "plain")} for x, y in CELLS],
                "placement_bonuses": [{"x": x, "y": y, "bonus": B(t, v), "note": ""} for x, y, t, v in sorted(m["bonuses"], key=lambda e: (e[0], e[1]))],
                "special_hexes": special, "bonus_slots": m["slots"], "map_rules": m["description"]}
    return {"id": m["id"], "name": m["name"], "description": m["description"], "geometry": geometry, "association": m["assoc"], "full_map_appeal": m["full_map_appeal"], "bdw": True}


if __name__ == "__main__":
    OUT.write_text(json.dumps([record(m) for m in MAPS], indent=4, ensure_ascii=False) + "\n", encoding="utf-8")
    print("wrote", OUT)
