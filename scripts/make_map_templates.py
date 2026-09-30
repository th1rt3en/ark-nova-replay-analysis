"""Create empty geometry templates data_manual/maps_geometry/<id>.json for every BGA-selectable map (never overwrites)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data_manual" / "maps_geometry"
MAP_IDS = [str(i) for i in range(1, 15)] + [f"{i}a" for i in range(1, 9)] + ["T1"]


def valid_hexes() -> list[dict]:
    # BGA "doubled height" coordinates, flat-top hexes: x = column 0..8, y = 0..12, a cell exists iff x+y is odd (58 cells).
    return [{"x": x, "y": y, "terrain": "plain"} for x in range(9) for y in range(13) if (x + y) % 2 == 1]


def template(map_id: str) -> dict:
    return {
        "map_id": map_id,
        "verified": False,
        "hexes": valid_hexes(),
        "placement_bonuses": [],
        "special_hexes": [],
        "bonus_slots": [{"index": i, "kind": None, "bonus": None, "note": ""} for i in range(7)],
        "map_rules": [],
    }


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for mid in MAP_IDS:
        f = OUT / f"{mid}.json"
        if not f.exists():
            f.write_text(json.dumps(template(mid), indent=4), "utf8")
            print("created", f.name)
