"""Maps made in the map editor (`web/map_editor.html`) and played in the game mode `custom-map`.

A saved map is the editor's export (`hexes`, `placement_bonuses`, `special_hexes` of the kind `upgrade_flag`, `bonus_slots`, `association`). `normalize` checks it and turns it into a map record
like the ones of `data/maps.json` (`id`, `name`, `description`, `geometry`) plus `association` (the bonuses of the partner zoo / university / worker spaces and the way the upgrades come). The
id is made from the content (`custom-<10 hex digits>`), so the same map always has the same id and a registry in `ark_nova.data` can be filled whenever a state that carries the map is built or
loaded (`GameConfig.custom_map`): the engine stays pure and every instance agrees.

A custom map has no ability of its own (no rule is keyed by its id). What the editor can draw but the engine does not play yet is refused with the name of the bonus.
"""
import copy
import hashlib
import json

from ark_nova import data

CELLS_ALL = [(x, y) for x in range(9) for y in range(13) if (x + y) % 2 == 1]       # the 58 cells of every board
MODE = "custom-map"
MAX_NAME = 40

# the placement bonuses the engine plays (`game.py` placement bonuses), by the name the editor gives them -> the name of the data
PLACEMENT = {"money": "money", "xtoken": "xtoken", "reputation": "reputation", "take-in-range-or-deck": "take-in-range-or-deck", "Clever": "Clever", "conceal": "conceal", "rescue": "Digging",
             "Mark": "Mark", "store": "store", "wave": "wave", "shark-attack": "shark-attack", "adapt": "adapt", "Multiplier": "Multiplier", "Scavenging": "Scavenging", "kiosk": "kiosk",
             "bonus-sponsor": "bonus-sponsor", "Worker": "Worker", "upgrade-card": "upgrade-card", "Partner-Zoo": "Partner-Zoo", "appeal": "appeal", "Fac": "Fac"}
# the bonuses of the project spaces and of the association spaces (`bonuses.apply_bonus`)
SPACE = frozenset({"money", "xtoken", "reputation", "conservation", "Snapping", "size-2", "take-in-range-or-deck", "bonus-sponsor", "sponsor-person-card", "Clever", "Pouch", "cut-down",
                   "Worker", "Partner-Zoo", "Fac", "upgrade-card", "Determination", "animal-magnet", "bonus-scoring-cards", "special-enclosure", "appeal"})
NAMES = {"digging": "Digging", "perception": "Perception X", "extra-shift": "Extra shift", "search-sponsor-person": "Find a person", "Pouch": "Pouching X", "pavilion": "Pavilion",
         "continent": "Continent", "hollywood_h": "H hex"}
SLOTS, INCOME_SLOTS_MAX = 7, 7
UPGRADE_MODES = ("second", "pairs")


class CustomMapError(ValueError):
    pass


def _name(t: str) -> str:
    return NAMES.get(t, t)


def _int(v, what: str, lo: int = 1, hi: int = 99) -> int:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or int(v) != v or not lo <= v <= hi:
        raise CustomMapError(f"{what}: a whole number from {lo} to {hi} is needed")
    return int(v)


def _bonus(b, allowed, what: str) -> dict | None:
    """One bonus {type, value}; `allowed` is a set of types, or a dict editor name -> name of the data."""
    if b is None:
        return None
    if not isinstance(b, dict) or not isinstance(b.get("type"), str):
        raise CustomMapError(f"{what}: not a bonus")
    t = b["type"]
    t2 = allowed.get(t) if isinstance(allowed, dict) else (t if t in allowed else None)
    if t2 is None:
        raise CustomMapError(f"{what}: {_name(t)} cannot be played in a game yet")
    return {"type": t2, "value": _int(b.get("value", 1), what + " (the number)")}


def normalize(raw: dict, name: str) -> dict:
    """The record of a map from the editor's export. Raises CustomMapError with a sentence for the person who made the map."""
    if not isinstance(raw, dict):
        raise CustomMapError("the map is not a JSON object")
    name = (name or "").strip()
    if not name or len(name) > MAX_NAME:
        raise CustomMapError(f"the name needs 1 to {MAX_NAME} characters")
    cells = set(CELLS_ALL)
    hexes = raw.get("hexes")
    if not isinstance(hexes, list) or len(hexes) != len(cells):
        raise CustomMapError(f"the board has {len(cells)} hexes")
    terrain = {}
    for h in hexes:
        c = (h.get("x"), h.get("y")) if isinstance(h, dict) else None
        if c not in cells or c in terrain or h.get("terrain") not in ("plain", "rock", "water"):
            raise CustomMapError("the hexes of the board are not valid")
        terrain[c] = h["terrain"]
    placement, seen = [], set()
    for e in raw.get("placement_bonuses") or []:
        c = (e.get("x"), e.get("y")) if isinstance(e, dict) else None
        if c not in cells:
            raise CustomMapError("a placement bonus lies outside the board")
        if c in seen:
            raise CustomMapError("two placement bonuses on one hex")
        if terrain[c] != "plain":
            raise CustomMapError("a placement bonus lies on a rock or water hex")
        seen.add(c)
        placement.append({"x": c[0], "y": c[1], "bonus": _bonus(e.get("bonus"), PLACEMENT, f"placement bonus at {c[0]},{c[1]}"), "note": ""})
    if any(e["bonus"] is None for e in placement):
        raise CustomMapError("a placement bonus is empty")
    flags = []
    for s in raw.get("special_hexes") or []:
        if not isinstance(s, dict) or s.get("kind") != "upgrade_flag" or (s.get("x"), s.get("y")) not in cells:
            raise CustomMapError("only upgrade requirement hexes can be set on a map")
        flags.append({"x": s["x"], "y": s["y"], "kind": "upgrade_flag", "off_board": False, "note": ""})
    slots_in = raw.get("bonus_slots")
    if not isinstance(slots_in, list) or len(slots_in) != SLOTS:
        raise CustomMapError(f"the project bonus panel has {SLOTS} spaces")
    slots, income = [], 0
    for i, s in enumerate(slots_in):
        if not isinstance(s, dict) or s.get("index") != i or s.get("kind") not in ("instant_income", "instant"):
            raise CustomMapError("the project bonus panel is not valid")
        income += s["kind"] == "instant_income"
        slots.append({"index": i, "kind": s["kind"], "bonus": _bonus(s.get("bonus"), SPACE, f"project bonus space {i + 1}"), "note": ""})
    if [s["kind"] for s in slots] != sorted((s["kind"] for s in slots), key=lambda k: k != "instant_income"):
        raise CustomMapError("the income spaces of the project bonus panel come first")
    assoc_in = raw.get("association") or {}
    assoc = {}
    for key, n in (("workers", 3), ("partner_zoos", 4), ("universities", 3)):
        row = assoc_in.get(key) or [None] * n
        if not isinstance(row, list) or len(row) != n:
            raise CustomMapError(f"the association board has {n} {key.replace('_', ' ')} spaces")
        assoc[key] = [_bonus(b, SPACE, f"{key.replace('_', ' ')} space {i + 1}") for i, b in enumerate(row)]
    up = assoc_in.get("upgrade") or {"mode": "second"}
    mode = up.get("mode") if isinstance(up, dict) else None
    if mode not in UPGRADE_MODES:
        raise CustomMapError("the upgrade requirement of the association board is not valid")
    assoc["upgrade"] = {"mode": "second"} if mode == "second" else {"mode": "pairs", "sets": sorted({_int(k, "an upgrade set", 1, 3) for k in up.get("sets") or []})}
    geometry = {"hexes": [{"x": x, "y": y, "terrain": terrain[(x, y)]} for x, y in sorted(cells)], "placement_bonuses": sorted(placement, key=lambda e: (e["x"], e["y"])),
                "special_hexes": sorted(flags, key=lambda e: (e["x"], e["y"])), "bonus_slots": slots, "map_rules": []}
    body = {"name": name, "geometry": geometry, "association": assoc}
    digest = hashlib.sha1(json.dumps(body, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:10]
    return {"id": f"{data.CUSTOM_PREFIX}{digest}", "name": name, "description": ["A map made in the map editor: it has no ability of its own."], **body}


def register(rec: dict) -> str:
    """Makes a normalized map known to `data.map_by_id` (the engine reads every map through it); the same record can be registered any number of times."""
    data.register_map(rec)
    return rec["id"]


def association_of(map_id: str) -> dict | None:
    """The association data of a custom map; None for a map of the game."""
    return data.map_by_id(map_id).get("association") if data.is_custom_map(map_id) else None


def copy_record(rec: dict) -> dict:
    return copy.deepcopy(rec)
