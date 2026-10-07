"""Confirm, undo and restart for live play (`GameConfig.confirm_turns`; docs/live_game_plan.md 5.3 and 5.4).

A live turn does not pass by itself: after the player's last effect the engine waits at the prompt `confirm_turn`; the player may then `confirm_turn` (the turn passes: display
refill, break, the next player) or take back what they did. Everything stays a pure function of the state:

- `GameState.checkpoint` = `{"turn", "seat", "state": <the state when the checkpoint was made>, "actions": [the actions since]}`. It is made when a player's turn starts, and
  made again after every action that cannot be taken back (`irreversible`: cards were drawn or shuffled, or a secret choice was made; the rules of
  `data_manual/planning/reversibility.json`). It is dropped when the turn is confirmed.
- `undo_last` = the checkpoint state with all its actions but the last applied again (the engine is deterministic, so this is exactly the state before that action);
  `restart_turn` = the checkpoint state. Both are ordinary actions of the player, so a stored game replays through them without special cases, and the history is never deleted.
- A move after an irreversible one cannot reach back past it: the checkpoint is the state right after it.
"""
import copy

from ark_nova.engine.actions import Action
from ark_nova.engine.state import GameState, Phase

PLAYING = (Phase.TURN, Phase.FINAL_TURNS)
SECRET_EFFECTS = ("pilfer", "tutor", "search_discard", "adapt", "wave", "waza", "scavenge", "ability_draw")      # effects whose choice shows hidden information
FREE_KINDS = ("undo_last", "restart_turn")


def irreversible(before: GameState, action: Action, after: GameState) -> str:
    """Why the turn cannot be taken back past this action (cards drawn or shuffled, a secret choice), '' when it can."""
    if before.rng != after.rng or len(before.main_deck) != len(after.main_deck) or len(before.endgame_deck) != len(after.endgame_deck):
        return "cards are drawn from a deck"
    if action.kind in ("choose_effect", "skip_effect") and before.prompt is not None:
        pending = before.prompt.args.get("pending") or []
        i = action.args.get("index", -1)
        kind = str(pending[i].get("kind", "")) if isinstance(i, int) and 0 <= i < len(pending) else ""
        if any(w in kind for w in SECRET_EFFECTS):
            return "a hidden choice is made (" + kind.replace("_", " ") + ")"
    return ""


def make_checkpoint(state: GameState) -> dict:
    d = copy.deepcopy(state.to_dict())                        # (a copy: `to_dict` shares the prompt's lists and dicts with the state, which later moves change in place)
    d["checkpoint"] = None                                    # (the checkpoint does not hold the one before it)
    return {"turn": state.turn, "seat": state.active_player, "state": d, "actions": []}


def _dict(action: Action) -> dict:
    return {"player": action.player, "kind": action.kind, "args": copy.deepcopy(action.args)}


def track(old: GameState, action: Action, new: GameState) -> None:
    """After an action: keep the checkpoint of the turn up to date (`new` is changed)."""
    if not new.config.confirm_turns:
        return
    if action.kind == "confirm_turn":
        new.checkpoint = None
    elif new.checkpoint is not None and new.phase in PLAYING and old.phase in PLAYING:
        if irreversible(old, action, new):
            new.checkpoint = make_checkpoint(new)
        else:
            new.checkpoint["actions"].append(_dict(action))
    pr = new.prompt
    if new.phase in PLAYING and new.checkpoint is None and pr is not None and pr.kind == "choose_action_card" and not pr.args and new.current_action is None:
        new.checkpoint = make_checkpoint(new)                 # a turn starts


def rewind_actions(state: GameState) -> list[Action]:
    """`undo_last` and `restart_turn` of the player whose turn it is, when there is something to take back."""
    cp = state.checkpoint
    pr = state.prompt
    if not state.config.confirm_turns or cp is None or not cp["actions"] or pr is None or state.phase not in PLAYING or pr.player != state.active_player:
        return []
    return [Action(pr.player, "undo_last", {}), Action(pr.player, "restart_turn", {})]


def rewind(state: GameState, action: Action) -> GameState:
    """The state after `undo_last` / `restart_turn`: rebuilt from the checkpoint."""
    from ark_nova.engine.game import IllegalAction, apply
    if action not in rewind_actions(state):
        raise IllegalAction("there is nothing to take back")
    cp = state.checkpoint
    st = GameState.from_dict(cp["state"])
    st.checkpoint = {"turn": cp["turn"], "seat": cp["seat"], "state": copy.deepcopy(cp["state"]), "actions": []}
    if action.kind == "undo_last":
        for a in cp["actions"][:-1]:
            st = apply(st, Action(int(a["player"]), a["kind"], dict(a.get("args") or {})))
    return st
