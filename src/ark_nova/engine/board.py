"""The zoo map as a hex board (BGA coordinates, see docs/map_geometry.md).

Cells are (x, y) with x + y odd, x in 0..8, y in 0..12 (58 cells, flat-top hexes, y is a doubled row). Shapes and rotations
use axial coordinates (q, r) = (x, (y - x - 1) / 2); rotation k turns a shape k * 60 degrees clockwise around its anchor cell.
"""
from dataclasses import dataclass
from functools import lru_cache

from ark_nova import data

Cell = tuple[int, int]
_AXIAL_NEIGHBOURS = [(0, 1), (0, -1), (1, 0), (1, -1), (-1, 1), (-1, 0)]
# on the map 13 board the first building must touch the centre marker instead of the border
CENTRE_CELLS = {"13": frozenset({(4, 5), (4, 7)})}


def to_axial(c: Cell) -> tuple[int, int]:
    return c[0], (c[1] - c[0] - 1) // 2


def from_axial(a: tuple[int, int]) -> Cell:
    return a[0], 2 * a[1] + a[0] + 1


def rotate(a: tuple[int, int], k: int) -> tuple[int, int]:
    for _ in range(k % 6):
        a = (-a[1], a[0] + a[1])
    return a


def footprint_cells(shape, anchor: Cell, rotation: int) -> list:
    q, r = to_axial(anchor)
    return [from_axial((q + rotate(o, rotation)[0], r + rotate(o, rotation)[1])) for o in shape]


def neighbours(c: Cell) -> list[Cell]:
    q, r = to_axial(c)
    return [from_axial((q + dq, r + dr)) for dq, dr in _AXIAL_NEIGHBOURS]


def hex_distance(a: Cell, b: Cell) -> int:
    dx, dy = abs(a[0] - b[0]), abs(a[1] - b[1])
    return dx + max(0, (dy - dx) // 2)


@dataclass(frozen=True)
class Board:
    map_id: str
    cells: frozenset
    terrain: dict                       # cell -> 'plain' | 'rock' | 'water'
    flags: frozenset                    # cells that need the upgraded (level II) Build action
    border: frozenset                   # cells with a neighbour off the board
    blocked: frozenset                  # cells that can never be built on (map 13 centre)
    start_cells: frozenset              # cells whose neighbours may hold the first building (map 13); empty = use the border
    bonuses: dict                       # cell -> list of placement bonuses [{"type", "value"}]


@lru_cache(maxsize=None)
def board(map_id: str) -> Board:
    geo = data.map_by_id(map_id)["geometry"]
    if not geo:
        raise KeyError(f"map {map_id} has no geometry")
    cells = frozenset((h["x"], h["y"]) for h in geo["hexes"])
    terrain = {(h["x"], h["y"]): h["terrain"] for h in geo["hexes"]}
    flags = frozenset((s["x"], s["y"]) for s in geo["special_hexes"] if s["kind"] == "upgrade_flag")
    border = frozenset(c for c in cells if any(n not in cells for n in neighbours(c)))
    centre = CENTRE_CELLS.get(map_id, frozenset())
    bonuses: dict = {}
    for b in geo["placement_bonuses"]:
        bonuses.setdefault((b["x"], b["y"]), []).append(b["bonus"])
    return Board(map_id, cells, terrain, flags, border, centre, centre, bonuses)
