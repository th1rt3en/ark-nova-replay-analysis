"""Ark360, the first custom game mode: the placement bonuses of the map are at random places.

Both players play on the same map (like `random-mirrored`) with the same layout: the bonuses of the map are moved to other hexes, their number and kinds stay, and the
rock / water zones, the upgrade flags and everything else printed on the map stay where they are. The rules of a layout are in `data/ark360.json` (edit the numbers there; the
file is part of the rules fingerprint of `engine/version.py`):

- `min_distinct_x` / `min_distinct_y`: how many of the 9 columns (x 0..8) and of the 13 rows (y 0..12) hold a bonus at least;
- `max_adjacent_pairs`: pairs of bonuses on neighbouring hexes; `max_one_hex_apart_pairs`: pairs with one hex between them (`one_hex_apart`: "straight" = the hex between
  them is on the line through both, "any" = every pair at hex distance 2); `null` = no limit, which is how it is now: put a number there to bring the rule back;
- `min_border` / `max_border`: bonuses on the border of the board (a hex with a neighbour off the board);
- `min_next_to_rock_share` / `min_next_to_water_share`: the share of the bonuses that touch a rock / water hex;
- `allowed_terrain`, `forbidden_special_kinds`: where a bonus may be put (the printed bonuses of the standard maps are on plain hexes only, none on a flag or a feature);
- `search_steps`, `search_restarts`: the effort of the search; `excluded_maps`: maps that never get this mode; `study_seconds`, `time_control`: the format of the game;
- `map_overrides`: `{map id: {layout key: number}}`, rules of one map that differ from the ones above (map 2a has 7 bonuses, so it asks for 7 rows instead of 8);
- `rules_to_come`: `{map id: text}`, the maps whose own rules are not written yet (3 / 3a / 7 / 7a: their own bonus rules). They are all drawn: with the common
  rules or, where those cannot lay out the map, with the provisional rules of `map_overrides` (3 / 3a: no adjacent-pairs limit). The text says which;
- `map_special`: `{map id: {...}}`, bonuses that follow rules of their own. `h`: the H hexes of the Hollywood maps (8 / 8a: `hollywood_h` entries of the layout, not placement bonuses of the board:
  they pay nothing, covering one reveals cards) are at least `min_distance` hexes from each other and may lie next to any other bonus; the rules above count the other bonuses only.
  `bonus_areas` (map 12): the bonus `bonus` (the binder, `conceal`) lies in the areas of one of the `options` (a list of area pairs), one in each area, on a hex of the area's list that may hold a bonus.

A layout is stored as a list of placement bonus entries (the format of `placement_bonuses` in the map geometry) in `PlayerState.bonus_layout`; `board.board_of(player)`
reads it. The search uses `Rng` only and integers, so a layout is reproducible from the seed on any platform.
"""
import copy
import json
import math
from functools import lru_cache
from pathlib import Path

from ark_nova import data
from ark_nova.data.map_support import UNSUPPORTED_MAPS
from ark_nova.engine.actions import Action
from ark_nova.engine.board import board, hex_distance, neighbours
from ark_nova.engine.rng import Rng
from ark_nova.engine.state import Phase, Prompt

MODE = "ark360"
H_KIND = "hollywood_h"                                  # the bonus type of an H entry of a layout (maps 8 / 8a)
H_MAX_TRIES = 400
CONFIG_PATH = Path(__file__).resolve().parents[1] / "data" / "ark360.json"
SEED_OFFSET = 360360                                    # the layout has a stream of its own, so the decks keep their order
STRAIGHT_GAPS = ((0, 4), (2, 2))                        # (|dx|, |dy|) of two hexes with exactly one hex between them on a straight line
WORSE_ODDS = 12                                         # the search takes a move that is one worse in 1 of this many tries
_NUMBERS = ("min_distinct_x", "min_distinct_y", "max_adjacent_pairs", "min_border", "max_border", "search_steps", "search_restarts")


class Ark360Error(ValueError):
    pass


@lru_cache(maxsize=None)
def config() -> dict:
    """`data/ark360.json`, checked."""
    cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    check_config(cfg)
    return cfg


def check_config(cfg: dict) -> None:
    check_rules(cfg.get("layout") or {})
    for map_id, over in (cfg.get("map_overrides") or {}).items():
        if not isinstance(over, dict) or not over or not set(over) <= set(cfg["layout"]):
            raise Ark360Error(f"ark360.json: map_overrides[{map_id!r}] must name rules of `layout`")
        check_rules({**cfg["layout"], **over})
    if not isinstance(cfg.get("excluded_maps"), list) or not isinstance(cfg.get("study_seconds"), int) or cfg["study_seconds"] < 0:
        raise Ark360Error("ark360.json: excluded_maps must be a list and study_seconds a number of seconds")
    if not all(isinstance(k, str) and isinstance(v, str) for k, v in (cfg.get("rules_to_come") or {}).items()):
        raise Ark360Error("ark360.json: rules_to_come maps a map id to a text")
    for map_id, sp in (cfg.get("map_special") or {}).items():
        h, areas = sp.get("h"), sp.get("bonus_areas")
        if not set(sp) <= {"h", "bonus_areas"} or (h is None and areas is None):
            raise Ark360Error(f"ark360.json: map_special[{map_id!r}] may have `h` and `bonus_areas`")
        if h is not None and (not isinstance(h.get("min_distance"), int) or h["min_distance"] < 1):
            raise Ark360Error(f"ark360.json: map_special[{map_id!r}].h.min_distance must be a whole number of 1 or more")
        if areas is not None and not (isinstance(areas.get("bonus"), str) and isinstance(areas.get("areas"), dict) and isinstance(areas.get("options"), list)
                                      and all(isinstance(o, list) and len(o) == 2 and set(o) <= set(areas["areas"]) for o in areas["options"]) and areas["options"]):
            raise Ark360Error(f"ark360.json: map_special[{map_id!r}].bonus_areas needs `bonus`, `areas` ({{name: [[x, y], ...]}}) and `options` (pairs of area names)")
    tc = cfg.get("time_control") or {}
    if not isinstance(tc.get("start"), int) or not isinstance(tc.get("increment"), int):
        raise Ark360Error("ark360.json: time_control needs start and increment, in seconds")


def check_rules(lay: dict) -> None:
    gap = lay.get("max_one_hex_apart_pairs")
    if gap is not None and (not isinstance(gap, int) or isinstance(gap, bool) or gap < 0):
        raise Ark360Error("ark360.json: layout.max_one_hex_apart_pairs must be a whole number of 0 or more, or null for no limit")
    for k in _NUMBERS:
        if not isinstance(lay.get(k), int) or lay[k] < 0:
            raise Ark360Error(f"ark360.json: layout.{k} must be a whole number of 0 or more")
    for k in ("min_next_to_rock_share", "min_next_to_water_share"):
        if not isinstance(lay.get(k), (int, float)) or not 0 <= lay[k] <= 1:
            raise Ark360Error(f"ark360.json: layout.{k} must be a number from 0 to 1")
    if lay["min_border"] > lay["max_border"]:
        raise Ark360Error("ark360.json: layout.min_border is above layout.max_border")
    if lay.get("one_hex_apart") not in ("straight", "any"):
        raise Ark360Error('ark360.json: layout.one_hex_apart must be "straight" or "any"')
    if not lay.get("allowed_terrain") or not set(lay["allowed_terrain"]) <= {"plain", "rock", "water"}:
        raise Ark360Error("ark360.json: layout.allowed_terrain must list plain, rock and / or water")


def rules(map_id: str, cfg: dict | None = None) -> dict:
    """The layout rules of one map: `layout`, with the `map_overrides` of the map on top."""
    cfg = cfg or config()
    return {**cfg["layout"], **(cfg.get("map_overrides") or {}).get(str(map_id), {})}


def special(map_id: str, cfg: dict | None = None) -> dict:
    """The special rules of one map (`map_special`): `h`, `bonus_areas`."""
    return ((cfg or config()).get("map_special") or {}).get(str(map_id), {})


def study_seconds(cfg: dict | None = None) -> int:
    return (cfg or config())["study_seconds"]


def time_control(cfg: dict | None = None) -> dict:
    return dict((cfg or config())["time_control"])


# ---- where a bonus may be and what makes a layout valid ---------------------------------------------------------------------------------------

def is_h(entry: dict) -> bool:
    return entry["bonus"]["type"] == H_KIND


def base_h(map_id: str) -> list:
    """The H hexes the map prints (maps 8 / 8a) as layout entries."""
    return [{"x": s["x"], "y": s["y"], "bonus": {"type": H_KIND, "value": 1}, "note": "H"}
            for s in data.map_by_id(map_id)["geometry"]["special_hexes"] if s["kind"] == H_KIND]


def base_entries(map_id: str, with_h: bool = False) -> list:
    """The placement bonuses as the map prints them (copies); `with_h`: the H hexes of the map too."""
    return copy.deepcopy(data.map_by_id(map_id)["geometry"]["placement_bonuses"]) + (base_h(map_id) if with_h else [])


def candidates(map_id: str, cfg: dict | None = None) -> list:
    """The hexes that may hold a bonus: the allowed terrain, not a hex with a feature of the map (flag, tower, gate ...), not blocked."""
    lay = rules(map_id, cfg)
    bd = board(map_id)
    special = {(s["x"], s["y"]) for s in data.map_by_id(map_id)["geometry"]["special_hexes"] if s["kind"] in lay["forbidden_special_kinds"] and not s.get("off_board")}
    return sorted(c for c in bd.cells if bd.terrain[c] in lay["allowed_terrain"] and c not in special and c not in bd.blocked)


def applicable(map_id: str, cfg: dict | None = None) -> bool:
    """Whether the mode can be played on the map: it has a geometry, it is not excluded, and its bonuses can meet its rules at all (enough bonuses for the columns and rows asked, enough
    hexes to put them on)."""
    cfg = cfg or config()
    if str(map_id) in {str(m) for m in cfg["excluded_maps"]} or str(map_id) in UNSUPPORTED_MAPS:
        return False
    try:
        geo = data.map_by_id(map_id)["geometry"]
    except KeyError:
        return False
    if not geo:
        return False
    n = len(geo["placement_bonuses"])
    lay = rules(map_id, cfg)
    return n >= max(lay["min_distinct_x"], lay["min_distinct_y"], lay["min_border"]) and n <= len(candidates(map_id, cfg))


def _share(share: float, n: int) -> int:
    return math.ceil(round(share * n, 9))


def measure(map_id: str, cells: list, cfg: dict | None = None) -> dict:
    """The numbers the rules are about, for the hexes of the bonuses."""
    lay = rules(map_id, cfg)
    bd = board(map_id)
    cells = [tuple(c) for c in cells]
    adjacent = apart = 0
    for i, a in enumerate(cells):
        for b in cells[i + 1:]:
            d = hex_distance(a, b)
            if d == 1:
                adjacent += 1
            elif d == 2 and (lay["one_hex_apart"] == "any" or (abs(a[0] - b[0]), abs(a[1] - b[1])) in STRAIGHT_GAPS):
                apart += 1
    touching = lambda kind: sum(1 for c in cells if any(bd.terrain.get(k) == kind for k in neighbours(c)))
    return {"bonuses": len(cells), "x": len({c[0] for c in cells}), "y": len({c[1] for c in cells}), "adjacent_pairs": adjacent, "one_hex_apart_pairs": apart,
            "border": sum(1 for c in cells if c in bd.border), "next_to_rock": touching("rock"), "next_to_water": touching("water")}


def shortfalls(map_id: str, cells: list, cfg: dict | None = None) -> dict:
    """How far each rule is broken (nothing in the result = a valid layout), by name."""
    cfg = cfg or config()
    lay = rules(map_id, cfg)
    m = measure(map_id, cells, cfg)
    n = m["bonuses"]
    out = {"distinct x": lay["min_distinct_x"] - m["x"], "distinct y": lay["min_distinct_y"] - m["y"],
           "adjacent pairs": m["adjacent_pairs"] - lay["max_adjacent_pairs"],
           "one-hex-apart pairs": 0 if lay["max_one_hex_apart_pairs"] is None else m["one_hex_apart_pairs"] - lay["max_one_hex_apart_pairs"],
           "too few on the border": lay["min_border"] - m["border"], "too many on the border": m["border"] - lay["max_border"],
           "next to rock": _share(lay["min_next_to_rock_share"], n) - m["next_to_rock"], "next to water": _share(lay["min_next_to_water_share"], n) - m["next_to_water"]}
    return {k: v for k, v in out.items() if v > 0}


def _area_cells(map_id: str, cfg: dict | None = None) -> dict:
    """map 12: `{area name: [hexes of the area that may hold a bonus]}`."""
    areas = special(map_id, cfg).get("bonus_areas")
    if not areas:
        return {}
    ok = set(candidates(map_id, cfg))
    return {name: [tuple(c) for c in cells if tuple(c) in ok] for name, cells in areas["areas"].items()}


def check_layout(map_id: str, entries: list, cfg: dict | None = None) -> list:
    """What is wrong with a layout (a list of texts; empty = valid): the bonuses must be the map's own (same number, same kinds, the H hexes of maps 8 / 8a among them), on hexes that
    may hold one, one to a hex, and the rules of the mode must hold (the H hexes and the binder have rules of their own)."""
    cfg = cfg or config()
    problems = []
    key = lambda e: json.dumps({"bonus": e["bonus"], "note": e.get("note")}, sort_keys=True)
    if sorted(key(e) for e in entries) != sorted(key(e) for e in base_entries(map_id, with_h=True)):
        problems.append("the bonuses are not the map's own")
    cells = [(e["x"], e["y"]) for e in entries]
    if len(set(cells)) != len(cells):
        problems.append("two bonuses on one hex")
    allowed = set(candidates(map_id, cfg))
    problems += [f"a bonus on ({x}, {y}), which may not hold one" for x, y in cells if (x, y) not in allowed]
    normal = [(e["x"], e["y"]) for e in entries if not is_h(e)]
    problems += [f"{name}: {v} too many / few" for name, v in shortfalls(map_id, normal, cfg).items()]
    h = [(e["x"], e["y"]) for e in entries if is_h(e)]
    rule = special(map_id, cfg).get("h")
    if rule:
        problems += [f"the H hexes {a} and {b} are closer than {rule['min_distance']}" for k, a in enumerate(h) for b in h[k + 1:] if hex_distance(a, b) < rule["min_distance"]]
    areas = special(map_id, cfg).get("bonus_areas")
    if areas:
        where = _area_cells(map_id, cfg)
        found = sorted(next((n for n, cs in where.items() if (e["x"], e["y"]) in cs), "?") for e in entries if e["bonus"]["type"] == areas["bonus"])
        if not any(found == sorted(o) for o in areas["options"]):
            problems.append(f"the {areas['bonus']} bonuses are in the areas {found}, which is not one of the allowed pairs")
    return problems


# ---- the search -----------------------------------------------------------------------------------------------------------------------------

def _cost(map_id: str, n: int, cfg: dict):
    lay = rules(map_id, cfg)
    bd = board(map_id)
    near = {kind: {c for c in bd.cells if any(bd.terrain.get(k) == kind for k in neighbours(c))} for kind in ("rock", "water")}
    need = {"rock": _share(lay["min_next_to_rock_share"], n), "water": _share(lay["min_next_to_water_share"], n)}
    straight = lay["one_hex_apart"] == "straight"

    def cost(cells: list) -> int:
        adjacent = apart = 0
        for i, a in enumerate(cells):
            for b in cells[i + 1:]:
                d = hex_distance(a, b)
                if d == 1:
                    adjacent += 1
                elif d == 2 and (not straight or (abs(a[0] - b[0]), abs(a[1] - b[1])) in STRAIGHT_GAPS):
                    apart += 1
        border = sum(1 for c in cells if c in bd.border)
        return (max(0, lay["min_distinct_x"] - len({c[0] for c in cells})) + max(0, lay["min_distinct_y"] - len({c[1] for c in cells}))
                + max(0, adjacent - lay["max_adjacent_pairs"]) + (0 if lay["max_one_hex_apart_pairs"] is None else max(0, apart - lay["max_one_hex_apart_pairs"]))
                + max(0, lay["min_border"] - border) + max(0, border - lay["max_border"])
                + max(0, need["rock"] - sum(1 for c in cells if c in near["rock"])) + max(0, need["water"] - sum(1 for c in cells if c in near["water"])))
    return cost


def _draw_h(map_id: str, rng: Rng, taken: set, cand: list, cfg: dict) -> list:
    """The cells of the H hexes: on free hexes that may hold a bonus, at least `min_distance` from each other (any distance to the other bonuses)."""
    count = len(base_h(map_id))
    rule = special(map_id, cfg).get("h")
    if not count:
        return []
    far = rule["min_distance"] if rule else 1
    free = [c for c in cand if c not in taken]
    for _ in range(H_MAX_TRIES):
        rng.shuffle(free)
        chosen: list = []
        for c in free:
            if all(hex_distance(c, o) >= far for o in chosen):
                chosen.append(c)
                if len(chosen) == count:
                    return chosen
    raise Ark360Error(f"no places found for the H hexes of map {map_id}")


def generate(map_id: str, rng: Rng, cfg: dict | None = None) -> list:
    """A layout of the map's own bonuses that meets the rules, from `rng` (its state moves on). Raises Ark360Error when the search finds none: the rules are too tight
    for the map (see `scripts/check_ark360.py`). The H hexes of maps 8 / 8a come last, drawn on the hexes the bonuses left; the binder of map 12 lies in two areas first."""
    cfg = cfg or config()
    if not applicable(map_id, cfg):
        raise Ark360Error(f"the mode cannot be played on map {map_id}")
    lay = rules(map_id, cfg)
    areas = special(map_id, cfg).get("bonus_areas")
    entries = base_entries(map_id)
    n = len(entries)
    cost = _cost(map_id, n, cfg)
    cand = candidates(map_id, cfg)
    pinned = [e for e in entries if areas and e["bonus"]["type"] == areas["bonus"]]                # (the binders: their hexes are drawn from the areas and stay)
    loose = [e for e in entries if e not in pinned]
    where = _area_cells(map_id, cfg) if areas else {}
    for _ in range(lay["search_restarts"]):
        fixed: list = []
        if areas:
            pair = areas["options"][rng.randbelow(len(areas["options"]))]
            if len(pair) != len(pinned) or any(not where[a] for a in pair):
                raise Ark360Error(f"map {map_id}: the binder areas do not fit the map")
            fixed = [where[a][rng.randbelow(len(where[a]))] for a in pair]
        pool = [c for c in cand if c not in fixed]
        rng.shuffle(pool)
        k = len(loose)
        cells, free = pool[:k], pool[k:]
        c = cost(fixed + cells)
        for _ in range(lay["search_steps"]):
            if c == 0:
                break
            i, j = rng.randbelow(k), rng.randbelow(len(free))
            old = cells[i]
            cells[i] = free[j]
            nc = cost(fixed + cells)
            if nc <= c or (nc == c + 1 and rng.randbelow(WORSE_ODDS) == 0):
                free[j], c = old, nc
            else:
                cells[i] = old
        if c == 0:
            rng.shuffle(loose)                            # which bonus lies where is drawn too
            placed = [{**e, "x": x, "y": y} for e, (x, y) in zip(loose, cells)] + [{**e, "x": x, "y": y} for e, (x, y) in zip(pinned, fixed)]
            placed += [{**h, "x": x, "y": y} for h, (x, y) in zip(base_h(map_id), _draw_h(map_id, rng, set(cells) | set(fixed), cand, cfg))]
            return sorted(placed, key=lambda e: (e["y"], e["x"]))
    raise Ark360Error(f"no layout found for map {map_id}: the rules in data/ark360.json are too tight for it")


def layout_for(map_id: str, tail_seed: int, cfg: dict | None = None) -> list:
    """The layout of a game: drawn from the game's seed on a stream of its own."""
    return generate(map_id, Rng(tail_seed + SEED_OFFSET), cfg)


# ---- the game: setup order and the study time --------------------------------------------------------------------------------------------------
#
# After the map is drawn (map_select) the starting hands and the endgame cards are dealt (but kept face down: they, the base projects and the rewards of the conservation and reputation
# tracks are revealed when the action card draft is over, `pre_draft`); then both players study the map
# (`study`: `seconds` is what the clients count down; each player says `study_ready` and may take it back with `study_unready` until the other one is ready too: when both
# are ready the study is over; the engine does not measure time), then the draft (Marine Worlds) and the initial discard.

def pre_draft(state) -> bool:
    """Whether the game is still before the end of the action card draft (the study time and the draft itself; without Marine Worlds there is no draft: the study time only). What the
    players know then: the map and the action card offers; the starting hands, the base projects and the rewards of the conservation and reputation tracks are revealed when the
    draft is over (`live/projection.py` hides them until then)."""
    if state.config.game_mode != MODE or state.phase is not Phase.SETUP:
        return False
    if state.prompt is not None and state.prompt.kind == "study":
        return True
    return state.draft is not None and state.draft["stage"] != "done"


def begin_study(state) -> None:
    state.study = {"seconds": study_seconds(), "ready": [False, False]}
    state.phase = Phase.SETUP
    state.prompt = Prompt(kind="study", player=0, args={})


def legal_study(state) -> list:
    d = state.study
    if d is None or all(d["ready"]):
        return []
    return [Action(seat, "study_unready" if d["ready"][seat] else "study_ready", {}) for seat in (0, 1)]


def apply_study(state, action) -> None:
    d = state.study
    if d is None or all(d["ready"]):
        raise Ark360Error("no study time is going on")
    if action.kind == "study_unready":
        if not d["ready"][action.player]:
            raise Ark360Error("this player is not ready")
        d["ready"][action.player] = False
        return
    if d["ready"][action.player]:
        raise Ark360Error("this player is ready already")
    d["ready"][action.player] = True
    if all(d["ready"]):
        from ark_nova.engine import draft, game
        if state.config.draft_action_cards:
            draft.begin(state)
        else:
            game.start_initial_discard(state)
