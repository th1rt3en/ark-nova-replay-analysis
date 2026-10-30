"""The map selection at the start of a new game (before the action card draft of a Marine Worlds game, before the deal).

`GameConfig.game_mode`:
- `original`: each player is dealt 2 maps of the pool (4 different maps) and independently picks the one to play;
- `random-mirrored` (default): both players play on the same map drawn at random from the pool, nothing to choose;
- `free-select`: both players pick any map of the pool (the same one is allowed);
- `ark360`: like `random-mirrored`, on the maps that `ark360.applicable` allows, and the placement bonuses are at random places (`engine/ark360.py`).
The pool is every map with a geometry (the beginner maps 0 / A are left out unless enabled), the Marine Worlds maps 10-14 only in a Marine Worlds game,
minus `GameConfig.maps_to_exclude`. A game that is given its `maps` (a replay, a test) skips all this.

`GameState.map_select` (JSON): `mode`, `pool`, `offers` (per seat what it chooses from), `chosen`, `stage` (pick | done). The players pick at the same
time with `choose_map {map}`.
"""
import copy

from ark_nova import data
from ark_nova.data.map_support import UNSUPPORTED_MAPS
from ark_nova.engine import ark360
from ark_nova.engine.actions import Action
from ark_nova.engine.rng import Rng
from ark_nova.engine.state import Phase, Prompt

MODES = ("original", "random-mirrored", "free-select", "ark360")
DEFAULT_MODE = "random-mirrored"
MARINE_WORLDS_MAPS = frozenset({"10", "11", "12", "13", "14"})
DEAL = 2


class MapSelectError(Exception):
    pass


def pool(config) -> list:
    """The maps of a new game, in the order of the data (the variants 'a' follow the numbers)."""
    excluded = {str(m) for m in (config.maps_to_exclude or [])}
    ids = [m["id"] for m in data.maps() if m.get("geometry") and m["id"] not in UNSUPPORTED_MAPS and m["id"] not in excluded
           and (config.marine_worlds or m["id"] not in MARINE_WORLDS_MAPS)]
    return [m for m in ids if ark360.applicable(m)] if getattr(config, "game_mode", None) == ark360.MODE else ids


def begin(state) -> None:
    """Deal the maps (or draw the shared one); the game then waits for the picks, or goes on at once when nothing is left to choose."""
    cfg = state.config
    mode = cfg.game_mode or DEFAULT_MODE
    if mode not in MODES:
        raise ValueError(f"game_mode must be one of {list(MODES)}")
    maps = pool(cfg)
    need = 2 * DEAL if mode == "original" else 1
    if len(maps) < need:
        raise ValueError(f"the map pool has {len(maps)} maps, the game mode {mode!r} needs {need}")
    rng = Rng(state.rng)
    if mode in ("random-mirrored", ark360.MODE):
        drawn = list(maps)
        rng.shuffle(drawn)
        state.rng = rng.state
        state.map_select = {"mode": mode, "pool": maps, "offers": [[drawn[0]], [drawn[0]]], "chosen": [drawn[0], drawn[0]], "stage": "done"}
        _finish(state)
        return
    if mode == "original":
        drawn = list(maps)
        rng.shuffle(drawn)
        offers = [drawn[:DEAL], drawn[DEAL:2 * DEAL]]
    else:
        offers = [list(maps), list(maps)]
    state.rng = rng.state
    state.map_select = {"mode": mode, "pool": maps, "offers": offers, "chosen": [None, None], "stage": "pick"}
    state.phase = Phase.SETUP
    state.prompt = Prompt(kind="map_select", player=0, args={})


def legal(state) -> list:
    d = state.map_select
    if d is None or d["stage"] == "done":
        return []
    return [Action(seat, "choose_map", {"map": m}) for seat in (0, 1) if d["chosen"][seat] is None for m in d["offers"][seat]]


def apply(state, action: Action) -> None:
    d = state.map_select
    if d is None or d["stage"] == "done":
        raise MapSelectError("no map selection is going on")
    seat = action.player
    if d["chosen"][seat] is not None:
        raise MapSelectError("this player has already chosen a map")
    m = str(action.args.get("map"))
    if m not in d["offers"][seat]:
        raise MapSelectError("pick one of the maps on offer")
    d["chosen"][seat] = m
    if all(c is not None for c in d["chosen"]):
        d["stage"] = "done"
        _finish(state)


def _finish(state) -> None:
    from ark_nova.engine import game
    chosen = list(state.map_select["chosen"])
    game.assign_maps(state, chosen)
    if state.config.game_mode == ark360.MODE:                  # the same layout for both players (the map is the same)
        layout = ark360.layout_for(chosen[0], state.seed.tail_seed)
        for p in state.players:
            p.bonus_layout = copy.deepcopy(layout)
    game.continue_setup(state)
