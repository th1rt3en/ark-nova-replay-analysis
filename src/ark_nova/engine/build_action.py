"""The Build action (variant 0; level I and II) and building placement rules.

Rules (reverse engineered from BGA's own list of legal placements in the logs, see docs/engine_design.md; the shapes and
rules below reproduce that list exactly for every building type of level I):
- strength = maximum total size. Level I: one building. Level II: several buildings of different types, until the size is
  used up or the player stops. Cost: 2 per space.
- placement: all cells on the map, plain (rock and water are never built on by this variant), free, and cells with an
  upgrade flag only with level II. The first building must touch the border of the map, every later one must touch an
  existing building. Map 13 has no border rule: every building may also touch the centre marker.
- petting zoo and aquariums: at most one of each per player;
- kiosks must be at least 3 hexes away from every other kiosk; aquariums (Marine Worlds only) must touch a water hex.
- a pavilion gives 1 appeal; covered hexes give their printed placement bonus.
- reptile house and large bird aviary (size 5, level II only, one each; shapes fitted to the logs). Moving already placed animals
  into them (rulebook p.12) belongs to the Animals action, which is not implemented yet.
- covering every plain space gives +7 appeal once (none on map 13). Sponsor buildings use `UNIQUE_SHAPES` (fitted to the logs); those of unknown shape are ignored.
Not implemented yet: the alternative Build cards.
"""
import json
from pathlib import Path

from ark_nova import data
from ark_nova.engine.board import Board, board, footprint_cells, from_axial, hex_distance, neighbours, to_axial

UNIQUE_ANCHOR = (4, 5)      # board cell that the anchor of every shape in unique_shapes.json is drawn on (keeps all cells positive)

SIZES = {"size-1": 1, "size-2": 2, "size-3": 3, "size-4": 4, "size-5": 5, "pavilion": 1, "kiosk": 1, "petting-zoo": 3,
         "small-aquarium": 2, "large-aquarium": 5, "reptile-house": 5, "large-bird-aviary": 5}
# cells of each shape in axial coordinates around the anchor cell (0, 0)
SHAPES = {
    "size-1": [(0, 0)], "pavilion": [(0, 0)], "kiosk": [(0, 0)],
    "size-2": [(0, 0), (0, 1)], "size-3": [(0, 0), (0, 1), (1, 0)], "petting-zoo": [(0, 0), (0, 1), (1, -1)],
    "small-aquarium": [(0, 0), (0, 1)], "size-4": [(0, -1), (0, 0), (1, -1), (1, 0)],
    "size-5": [(-1, 0), (-1, 1), (0, -1), (0, 0), (0, 1)], "large-aquarium": [(0, 0), (1, -2), (1, -1), (1, 0), (1, 1)],
    "reptile-house": [(-1, 0), (-1, 1), (0, 0), (1, -1), (1, 0)],          # fitted to BGA's placement lists (26 of 26 non-empty lists)
    "large-bird-aviary": [(-1, 0), (-1, 1), (0, 0), (0, 1), (1, -1)],
}
AQUARIUMS = {"small-aquarium", "large-aquarium"}
UNIQUE = {"petting-zoo", "small-aquarium", "large-aquarium", "reptile-house", "large-bird-aviary"}   # at most one of each special enclosure (rulebook p.10)
LEVEL_II_ONLY = {"reptile-house", "large-bird-aviary"}
COST_PER_SPACE = 2
KIOSK_DISTANCE = 3


def _load_unique_shapes() -> dict:
    """Shapes of the sponsor buildings (zoo school, penguin pool, ...): fitted to the logs by scripts/fit_unique_shapes.py, editable by hand
    in data/unique_shapes.json. Entries without cells (shape not found) are left out: their buildings are unknown on the map."""
    path = Path(data.__file__).with_name("unique_shapes.json")
    raw = json.loads(path.read_text()) if path.exists() else {}
    return {t: shape_from_cells(v["cells"], tuple(v["anchor"])) for t, v in raw.items() if v.get("cells")}


def shape_from_cells(cells: list, anchor: tuple) -> list:
    """Board cells (x, y), x + y odd, as stored in unique_shapes.json -> axial offsets around the anchor cell."""
    aq, ar = to_axial(anchor)
    return [(q - aq, r - ar) for q, r in map(to_axial, map(tuple, cells))]


def shape_to_cells(shape: list, anchor: tuple = UNIQUE_ANCHOR) -> list:
    """Inverse of shape_from_cells: the shape drawn on the board with its anchor cell at `anchor`."""
    aq, ar = to_axial(anchor)
    return sorted(list(from_axial((aq + q, ar + r))) for q, r in shape)


UNIQUE_SHAPES = _load_unique_shapes()


def shape_of(t: str) -> list:
    return SHAPES[t] if t in SHAPES else UNIQUE_SHAPES[t]


def knows_shape(t: str) -> bool:
    return t in SHAPES or t in UNIQUE_SHAPES


def footprint(t: str, x: int, y: int, rotation: int) -> list:
    return footprint_cells(shape_of(t), (x, y), rotation)


def cost(t: str) -> int:
    return COST_PER_SPACE * SIZES[t]


def valid_placements(bd: Board, buildings: list, t: str, level: int, rules: dict = None) -> list:
    """All (x, y, rotation) where a building of type `t` may be placed, given the player's buildings [(type, x, y, rotation)].

    `rules` are the extra conditions of a card that places a building (sponsors): rock / water = at least that many rock / water spaces
    next to the building, border = at least that many of its spaces on the border, on_water = it is built on water spaces, free_position
    = it need not touch another building (and does not need the border), flags = flagged spaces may be used without level II."""
    rules = rules or {}
    occupied: dict = {}
    for bt, bx, by, br in buildings:
        for c in footprint(bt, bx, by, br) if knows_shape(bt) else []:
            occupied[c] = bt
    kiosks = [c for c, bt in occupied.items() if bt == "kiosk"]
    if t in LEVEL_II_ONLY and level < 2:
        return []
    rotations = [0] if len(shape_of(t)) == 1 else range(6)
    out = []
    for (x, y) in sorted(bd.cells):
        for k in rotations:
            cells = footprint(t, x, y, k)
            wanted = "water" if rules.get("on_water") else "plain"
            overbuild = rules.get("overbuild")           # Diversity Researcher: water and rock spaces can be built on
            if any(c not in bd.cells or c in occupied or c in bd.blocked for c in cells):
                continue
            wrong = [c for c in cells if bd.terrain[c] != wanted]
            if wrong and not overbuild and not (rules.get("terrain_hexes") and len(wrong) == 1):   # Terrain Build: 1 rock / water space
                continue
            if level < 2 and not rules.get("flags") and any(c in bd.flags for c in cells):
                continue
            around = {n for c in cells for n in neighbours(c) if n not in cells}
            if not overbuild and sum(bd.terrain.get(n) == "rock" for n in around) < rules.get("rock", 0):
                continue
            if not overbuild and sum(bd.terrain.get(n) == "water" for n in around) < rules.get("water", 0):
                continue
            if sum(c in bd.border for c in cells) < rules.get("border", 0):
                continue
            if t in AQUARIUMS and not overbuild and not any(bd.terrain[c] == "water" for c in cells)                     and not any(bd.terrain.get(n) == "water" and n not in occupied for c in cells for n in neighbours(c)):
                continue                                  # (a water space that is covered by a building (Terrain Build) does not count; an aquarium on water needs no other)
            if t == "kiosk" and any(hex_distance(cells[0], o) < KIOSK_DISTANCE for o in kiosks):
                continue
            touches_building = any(n in occupied for c in cells for n in neighbours(c))
            if rules.get("free_position"):
                out.append((x, y, k))
                continue
            if bd.start_cells:           # map 13: the centre marker always counts as a neighbour to build next to
                if not touches_building and not any(n in bd.start_cells for c in cells for n in neighbours(c)):
                    continue
            elif occupied:
                if not touches_building:
                    continue
            elif not any(c in bd.border for c in cells):
                continue
            out.append((x, y, k))
    return out


FULL_MAP_APPEAL = 7
NO_FULL_MAP_BONUS = {"13"}          # map 13 (drawing board) gives no appeal for covering the map


def covers_map(bd: Board, buildings: list) -> bool:
    """True when the buildings cover every buildable space (plain terrain; rock, water and blocked cells are not needed)."""
    covered = {c for bt, bx, by, br in buildings if knows_shape(bt) for c in footprint(bt, bx, by, br)}
    return all(c in covered for c in bd.cells if bd.terrain[c] == "plain" and c not in bd.blocked)


def placement_bonuses(bd: Board, cells: list) -> list:
    return [b for c in cells for b in bd.bonuses.get(c, [])]
