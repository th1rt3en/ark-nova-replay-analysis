"""What is stored with every accepted action so that a record can be replayed without the engine (docs/live_game_plan.md 9.1.5).

At record time (here, with the engine that plays the game) each step gets: the text, the decision shown in the bar, who acted, and the full-information view state as a JSON
patch against the *effective* step it follows (`base`), plus the full view at checkpoints (a confirmed turn, every 25th step, the end). An `undo_last` / `restart_turn`
stores no view: it names how many effective steps it took back (`control.took_back`), and the reader drops them (replay/from_record.py).
"""
from ark_nova.engine.actions import Action
from ark_nova.engine.state import GameState, Phase
from ark_nova.live import jsonpatch
from ark_nova.replay import fork, sandbox
from ark_nova.replay.options import step_options
from ark_nova.replay.view import state_view

VIEWER_SCHEMA_VERSION = 1
FULL_EVERY = 25


HIDDEN_FROM_THE_OPPONENT = {"initial_discard": "discarded cards", "discard_cards": "discarded cards", "draft_pick": "picked an action card", "draft_keep": "kept action cards"}
PUBLIC_KINDS = {"concede", "play_animal", "play_sponsor", "take_cards", "association_task", "choose_action_card", "skip_action", "place_building", "sponsor_break", "confirm_turn", "undo_last",
                "restart_turn", "finish_build", "finish_sponsors", "finish_animals", "finish_association", "skip_effect", "skip_extra"}
CARD_ARGS = ("card", "cards", "keep", "discard")


def labels_for(act: Action, full: str, name: str) -> dict:
    """The text of a move per viewer: the mover reads it all; the opponent and spectators do not read the cards of a hidden choice (visibility sheet: the initial discard, a
    discard from the hand, the draft picks, cards chosen by an effect). A kind that is not known to be public and names cards is worded without them."""
    same = {"0": full, "1": full, "spectator": full}
    if act.kind in PUBLIC_KINDS:
        return same
    phrase = HIDDEN_FROM_THE_OPPONENT.get(act.kind)
    n = len(act.args.get("cards") or [])
    if phrase is not None:
        public = f"{name} {phrase}" if act.kind.startswith("draft") else f"{name} discarded {n} card{'s' if n != 1 else ''}"
    elif any(k in act.args for k in CARD_ARGS):
        public = f"{name} resolved an effect" if act.kind == "choose_effect" else f"{name} made a move"
    else:
        return same
    return {str(act.player): full, str(1 - act.player): public, "spectator": public}


def announcement(state: GameState, names: list[str]) -> str:
    """The line that closes the game log: who won and the scores (or the tie)."""
    res = state.result
    if res is None or len(res.scores) != 2:
        return "Game over"
    s = res.scores
    if res.winner is None:
        return f"Game over: a tie at {s[0]} points"
    w = res.winner
    return f"Game over: {names[w]} wins {s[w]} to {s[1 - w]}"


def viewer_header(state: GameState) -> dict:
    """What the viewer needs besides the steps: the maps, the card catalog, the base projects and the view before the first move."""
    sk = sandbox.skeleton(state)
    return {"viewer_schema_version": VIEWER_SCHEMA_VERSION, "marine_worlds": sk["marine_worlds"], "maps": sk["maps"], "cards": sk["cards"],
            "base_projects": sk["base_projects"], "colors": list(sandbox.COLORS), "initial_view": state_view(state)}


def step_for(old: GameState, act: Action, new: GameState, n: int, eff: list, name: str) -> dict:
    """The stored step of action number `n`; `eff` (the effective step numbers before it) is changed."""
    over = new.phase is Phase.OVER
    base = {"seat": act.player, "actor": act.player, "kind": act.kind, "action": {"player": act.player, "kind": act.kind, "args": act.args},
            "label": fork.narrate(old, act, new, name)}
    if act.kind in ("undo_last", "restart_turn"):
        took = 1 if act.kind == "undo_last" else len((old.checkpoint or {}).get("actions") or [])
        if took:
            del eff[-took:]
        return {**base, "control": {"type": "undo" if act.kind == "undo_last" else "restart", "took_back": took}}
    view_new = state_view(new)
    step = {**base, "control": None, "base": eff[-1] if eff else 0, "patch": jsonpatch.diff(state_view(old), view_new), "options": step_options(new)}
    if act.kind == "confirm_turn" or over or n % FULL_EVERY == 0:
        step["full"] = view_new                                               # (a checkpoint: the reader checks the patch chain against it)
    eff.append(n)
    return step
