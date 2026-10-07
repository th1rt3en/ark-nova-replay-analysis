"""What each viewer of a live game may see: the projection of a state for seat 0, seat 1 or a spectator (docs/live_game_plan.md section 4, the visibility sheet
`data_manual/planning/visibility.json`).

The replay shows everything because the log does. A live viewer gets `state_view` (the JSON the board is drawn from) with the secrets taken out:

- `server_only` (never leaves the server): the seed and the random state, the order and the contents of the draw pile and of the endgame deck (only their sizes are
  public), the discard pile, the base projects not in play, the opponent's legal actions;
- `owner_count`: the owner's hand, endgame hand, stored and pouched cards are listed for the owner; the opponent and spectators get as many `?` cards (the viewer
  draws `?` as a card back);
- `owner_only`: the initial offer of the owner;
- `until_revealed`: the action card draft and the map offers (the opponent's side stays hidden until the choice is made), the endgame discard, the seed (shown at
  the end of the game);
- the open prompt keeps its kind and player: the arguments (which can name drawn cards) are not part of the view, the acting seat gets its own `decision`.
"""
import copy
from typing import Any

from ark_nova.engine import gamestats
from ark_nova.engine.game import legal_actions
from ark_nova.engine.state import GameState, Phase
from ark_nova.replay import fork
from ark_nova.replay.options import step_options
from ark_nova.replay.view import state_view

HIDDEN = "?"
ROLES = ("0", "1", "spectator")
OWNER_COUNT = ("hand", "endgame_hand", "stored", "pouched")


def _mask(cards: list) -> list:
    return [HIDDEN] * len(cards)


def _mask_deep(value: Any) -> Any:
    """Every card key of a nested structure becomes `?` (the cards under another card)."""
    if isinstance(value, list):
        return [HIDDEN if isinstance(v, str) else _mask_deep(v) for v in value]
    if isinstance(value, dict):
        return {k: _mask_deep(v) for k, v in value.items()}
    return value


def project(state: GameState, role: str) -> dict:
    """The state as `role` ("0", "1" or "spectator") may see it."""
    if role not in ROLES:
        raise ValueError("role must be 0, 1 or spectator")
    seat = None if role == "spectator" else int(role)
    v = state_view(state)
    over = state.phase is Phase.OVER
    v["main_deck"], v["endgame_deck"] = [], []                              # (only the sizes stay: main_deck_size, endgame_deck_size)
    v["main_discard"] = []
    v.pop("main_discard_size", None)
    v.pop("endgame_discard", None)
    v.pop("base_projects_unused", None)
    for p in v["players"]:
        mine = p["seat"] == seat
        for k in OWNER_COUNT:
            if not mine:
                p[k] = _mask(p.get(k) or [])
        if not mine:
            p["initial_offer"] = []
            p["under"] = _mask_deep(p.get("under") or {})
    pr = v.get("prompt")
    if pr:
        v["prompt"] = {"kind": pr["kind"], "player": pr["player"]}
    v["draft"] = _project_draft(v.get("draft"), seat)
    v["map_select"] = _project_map_select(v.get("map_select"), seat)
    v["viewer"] = role
    if over:
        v["seed"] = {"tail_seed": state.seed.tail_seed}                      # (revealed to both players at the end of the game)
        res = state.result
        v["end"] = {"scores": list(res.scores) if res else [], "winner": res.winner if res else None, "conceded": res.conceded if res else None,
                    "stats": gamestats.final(state)}                      # (what the end screen shows: the page does not have to ask for it)
    return v


def _project_draft(d: dict | None, seat: int | None) -> dict | None:
    """The draft until it is over: a seat sees its own offers, picks and choice; of the other seat only whether it has chosen."""
    if not d:
        return d
    if d["stage"] == "done":
        return {"stage": "done", "kept": d["kept"], "picked": d["picked"], "offers": [[], []], "choice": [None, None], "auto": d.get("auto"), "pool": []}
    out = {"stage": d["stage"], "chosen": [c is not None for c in d["choice"]], "pool": [], "auto": [None, None]}
    for key, empty in (("offers", []), ("picked", []), ("kept", [])):
        out[key] = [d[key][s] if s == seat else list(empty) for s in (0, 1)]
    out["choice"] = [d["choice"][s] if s == seat else None for s in (0, 1)]
    return out


def _project_map_select(m: dict | None, seat: int | None) -> dict | None:
    if not m or m.get("stage") == "done":
        return m
    return {"mode": m["mode"], "stage": m["stage"], "pool": m["pool"], "chosen": [c is not None for c in m["chosen"]],
            "offers": [m["offers"][s] if s == seat else [] for s in (0, 1)]}


def decision(state: GameState, seat: int) -> dict | None:
    """What `seat` may do now: the summary the bar is drawn from and the encoded legal actions of that seat (None when it has nothing to decide)."""
    try:
        actions = [a for a in fork.encode_actions(state) if a["player"] == seat]
    except NotImplementedError:
        return None
    if not actions:
        return None
    return {"seat": seat, "prompt": state.prompt.kind if state.prompt else None, "options": step_options(state, seat), "actions": actions}


def views(state: GameState, labels: dict | None = None) -> dict:
    """The three views to store with a move: `{role: {"view": ..., "decision": ... (a seat that may act), "label": the text of the move as that viewer may read it}}`."""
    out: dict = {}
    for role in ROLES:
        item: dict = {"view": project(state, role)}
        if labels and labels.get(role):
            item["label"] = labels[role]
        if role != "spectator":
            d = decision(state, int(role))
            if d is not None:
                item["decision"] = d
        out[role] = item
    to_act = [s for s in (0, 1) if "decision" in out[str(s)]]                # who has something to decide (both at once in the setup and in the discards of a break; one when only one has to discard)
    for item in out.values():
        item["view"]["to_act"] = to_act
    return out


def legal_for(state: GameState, seat: int) -> list:
    return [a for a in legal_actions(state) if a.player == seat]
