"""Forking a replay: play on from any step that the engine played, for both seats, with the deck order fixed by a seed.

The fork page keeps the whole engine state in the browser (the server stays stateless): every move is posted with the state it applies to, checked against
`legal_actions`, applied, and the new state comes back together with everything the viewer shows and the legal actions of the next decision.

Seed: the order of the cards still in the draw pile and in the endgame deck. Seed 1 is the order of the replay (the cards the log shows being drawn first, the
rest shuffled with seed 1); any other seed shuffles the cards that were never seen with that seed (`reorder_decks`), the same way for every fork point,
so two forks with the same seed see the same cards come up in the same order.
"""
import copy
import json
from collections import Counter
import re

from ark_nova import data
from ark_nova.engine.actions import Action
from ark_nova.engine.build_action import SIZES, UNIQUE_SHAPES, knows_shape, shape_of
from ark_nova.engine import turns
from ark_nova.engine.game import IllegalAction, apply, deck_cards, legal_actions
from ark_nova.engine.rng import Rng, build_deck
from ark_nova.engine.state import GameState
from ark_nova.replay.options import effect_name, step_options
from ark_nova.replay.view import state_view

DEFAULT_SEED = 1
MAX_SEED = (1 << 63) - 1
_CARD = re.compile(r"^[ASPF]\d{3}$")


def reorder_decks(state: GameState, seed: int) -> GameState:
    """A copy of the state whose draw pile and endgame deck follow `seed` (see the module text). The seed 1 changes nothing."""
    st = copy.deepcopy(state)
    if seed == st.seed.tail_seed:
        return st
    rng = Rng(seed)
    cfg = st.config
    main = build_deck(deck_cards("main", cfg.marine_worlds), st.seed.main_order, rng)
    endgame = build_deck(deck_cards("endgame", cfg.marine_worlds), st.seed.endgame_order, rng)
    keep_m, keep_e = set(st.main_deck), set(st.endgame_deck)
    st.main_deck = [c for c in main if c in keep_m]
    st.endgame_deck = [c for c in endgame if c in keep_e]
    after = Rng(seed)
    after.next_u64()
    st.rng = after.state                                                   # (what the game still draws by chance depends on the seed too)
    st.seed.tail_seed = seed
    return st


def shapes() -> dict:
    """The cells of every building relative to its anchor, in axial coordinates (q, r), for rotation 0: the viewer turns them (rotation k = k * 60 degrees clockwise
    around the anchor, as `engine.board.rotate`) to draw a building that is being placed."""
    return {t: [list(o) for o in shape_of(t)] for t in sorted(set(SIZES) | set(UNIQUE_SHAPES)) if knows_shape(t)}      # (the sponsors' buildings too)


def _name(key: str) -> str:
    c = data.cards_by_key().get(key)
    return (c or {}).get("name", key) if isinstance(c, dict) else key


def _fmt(v) -> str:
    if isinstance(v, str):
        return _name(v) if _CARD.match(v) else v
    if isinstance(v, bool):
        return "yes" if v else "no"
    if isinstance(v, (list, tuple)):
        return "(" + ", ".join(_fmt(x) for x in v) + ")" if v and all(isinstance(x, (int, float)) for x in v) else ", ".join(_fmt(x) for x in v)
    if isinstance(v, dict):
        return "{" + ", ".join(f"{k}: {_fmt(x)}" for k, x in v.items()) + "}"
    return str(v)


def _variant(v: str) -> str:
    return f"{v[:-1].capitalize()} {v[-1]}" if v and v[-1].isdigit() else v


def describe_action(a: Action, state: GameState | None = None) -> str:
    """One line for a legal action."""
    args = dict(a.args)
    k = a.kind
    if k == "choose_action_card":
        spend = args.pop("spend", 0)
        text = f"Choose {args.pop('type', '?').capitalize()}" + (f", spend {spend} X token{'s' if spend != 1 else ''}" if spend else "")
        return text + (", hypnosis" if args.pop("hypnosis", False) else "")
    if k == "skip_action":
        return f"Skip {str(args.pop('type', '?')).capitalize()}: put it on slot 1 and gain an X token" + (f" (repeat {args.pop('repeat')})" if "repeat" in args else "")
    if k == "place_building":
        extra = " (additional)" if args.pop("extra", False) else ""
        return f"Place {args.pop('type', '?')} at ({args.pop('x', '?')}, {args.pop('y', '?')}) rotation {args.pop('rotation', 0)}{extra}"
    if k == "play_animal":
        src = " from the display" if args.pop("from_display", False) else ""
        card = _name(args.pop("card", "?"))
        where = f" at ({args.pop('x')}, {args.pop('y')})" if "x" in args and "y" in args else ""
        return f"Play {card}{src}{where}" + ("".join(f", {k2}={_fmt(v)}" for k2, v in args.items()))
    if k == "play_sponsor":
        return f"Play {_name(args.pop('card', '?'))}" + (" from the display" if args.pop("from_display", False) else "")
    if k == "take_cards":
        mode = args.pop("mode", "")
        if mode == "deck":
            n = args.pop("count", 1)
            return f"Draw {n} card{'s' if n != 1 else ''} from the deck"
        return ("Snap " if mode == "snap" else "Take ") + _name(args.pop("card", "?")) + (" from the display" if mode == "snap" else " in reputation range")
    if k in ("choose_effect", "skip_effect"):
        pending = (state.prompt.args.get("pending") if state is not None and state.prompt is not None else None) or []
        i = args.pop("index", 0)
        e = pending[i] if isinstance(i, int) and 0 <= i < len(pending) else {}
        name = effect_name(e) or str(e.get("kind", "effect")).replace("_", " ").capitalize()
        rest = args.pop("args", None) or {}
        return ("Skip: " if k == "skip_effect" else "") + name + "".join(f", {k2} {_fmt(v)}" for k2, v in rest.items())
    if k == "choose_map":
        return "Select map " + str(args.pop("map", "?"))
    if k == "draft_pick":
        return "Pick " + _variant(args.pop("variant", "?"))
    if k == "draft_keep":
        return "Keep " + " and ".join(_variant(v) for v in args.pop("keep", []))
    if k == "discard_cards":
        return "Discard " + _fmt(args.pop("cards", []))
    if k == "association_task":
        task = args.pop("task", "")
        return "Association task: " + task + "".join(f", {k2} {_fmt(v)}" for k2, v in args.items())
    text = k.replace("_", " ").capitalize()
    return text + (": " + ", ".join(f"{k2} {_fmt(v)}" for k2, v in args.items()) if args else "")


def _canon(a: Action) -> str:
    return json.dumps({"player": a.player, "kind": a.kind, "args": a.args}, sort_keys=True, default=list)


def encode_actions(state: GameState) -> list[dict]:
    out = []
    for a in legal_actions(state):
        out.append({"player": a.player, "kind": a.kind, "args": json.loads(json.dumps(a.args, default=list)), "text": describe_action(a, state)})
    return out


def step_payload(state: GameState, label: str, irreversible: str = "") -> dict:
    """A step of the fork, as the viewer shows it, with the engine state it came from (for the next move) and the legal actions."""
    view = state_view(state)
    view["main_deck_known"] = len(view["main_deck"])                       # in a fork the order of the pile is fixed by the seed
    return {"move_id": None, "label": label, "state": view, "engine": {"source": "engine", "status": "ok", "detail": ""}, "options": step_options(state),
            "actor": None, "label_pov": None, "fork": True, "actions": encode_actions(state), "engine_state": state.to_dict(),
            "irreversible": bool(irreversible), "irreversible_reason": irreversible}


def play(state_dict: dict, action_dict: dict, names: list[str]) -> dict:
    """Apply one action to the state (both given as JSON); raises IllegalAction / NotImplementedError / ValueError."""
    state = GameState.from_dict(state_dict)
    action = Action(int(action_dict["player"]), str(action_dict["kind"]), dict(action_dict.get("args") or {}))
    if _canon(action) not in {_canon(a) for a in legal_actions(state)}:
        raise IllegalAction("that action is not legal in this position")
    who = names[action.player] if 0 <= action.player < len(names) else f"seat {action.player}"
    new = apply(state, action)
    return step_payload(new, narrate(state, action, new, who), is_irreversible(state, action, new))


is_irreversible = turns.irreversible                                       # (the rule of what cannot be taken back lives in the engine: engine/turns.py)


GAINS = (("money", "money"), ("appeal", "appeal"), ("reputation", "reputation"), ("conservation", "conservation"), ("x_tokens", "X token"))


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" + ("" if n == 1 else "s")


def _article(word: str) -> str:
    return ("an " if word[:1] in "aeiou" else "a ") + word


def narrate(before: GameState, action: Action, after: GameState, who: str) -> str:
    """The log line of a move of a fork, in words: what was done and what it cost / gave (read off the states before and after)."""
    if action.kind == "concede":
        return f"{who} conceded the game"
    p0, p1 = before.players[action.player], after.players[action.player]
    args = action.args
    delta = {k: getattr(p1, k) - getattr(p0, k) for k, _ in GAINS}
    spent, earned = -delta["money"], delta["money"]
    skip = set()                                                           # the fields the sentence already says
    k = action.kind
    if k == "choose_action_card":
        slot = next((i for i, c in enumerate(p0.action_cards) if c.type == args.get("type")), 0)
        x = args.get("spend", 0)
        text = f"chose the {args.get('type', '?').capitalize()} card (strength {slot + 1 + x}" + (f", spending {_plural(x, 'X token')}" if x else "") + ")"
        skip = {"x_tokens"}
    elif k == "skip_action":
        text = f"put the {args.get('type', '?').capitalize()} card back on slot 1 and gained an X token"
        skip = {"x_tokens"}
    elif k == "place_building":
        t = args.get("type", "?")
        what = f"an additional {t}" if args.get("extra") else _article(f"{t} enclosure" if t.startswith("size-") else t.replace("-", " "))
        prompt = before.prompt.args if before.prompt is not None else {}
        over = prompt.get("variant") == 4 and spent > build_cost(t)
        text = (f"used the build4 effect to build over rock/water: built {what}" if over else f"built {what}") + (f" for {spent} money" if spent > 0 else "")
        skip = {"money"}
    elif k == "play_animal":
        text = f"played {_name(args.get('card', '?'))}" + (" from the display" if args.get("from_display") else "") + (f" for {spent} money" if spent > 0 else "")
        skip = {"money"}
    elif k == "play_sponsor":
        text = f"played {_name(args.get('card', '?'))}" + (" from the display" if args.get("from_display") else "") + (f" for {spent} money" if spent > 0 else "")
        skip = {"money"}
    elif k == "sponsor_break":
        text = f"advanced the break by {after.break_position - before.break_position} and gained {max(earned, 0)} money"
        skip = {"money"}
    elif k == "take_cards":
        mode = args.get("mode")
        if mode == "deck":
            text = f"drew {_plural(args.get('count', 1), 'card')} from the deck"
        else:
            text = ("snapped " if mode == "snap" else "took ") + _name(args.get("card", "?")) + " from the display"
    elif k == "discard_cards":
        text = f"discarded {_plural(len(args.get('cards', [])), 'card')}" + (f" ({args['mode']})" if args.get("mode") else "")
    elif k == "choose_effect" and "cards" in args and describe_action(action, before).startswith("Sun"):
        text = f"sunbathed {_plural(len(args['cards']), 'card')} for {earned} money"
        skip = {"money"}
    elif k == "choose_effect" and isinstance(args.get("card"), str) and _effect_kind(before, args) == "marketing":
        text = f"marketed sponsor {_name(args['card'])} for {max(spent, 0)} money"
        skip = {"money"}
    elif k == "choose_effect" and _effect_kind(before, args) == "search_category":
        pending = before.prompt.args.get("pending") or []
        cat = str(pending[args["index"]].get("category", ""))
        got = list((Counter(p1.hand) - Counter(p0.hand)).elements())              # (a search is public: the card is named)
        icon = "<SEARCH-" + ("SEAANIMAL" if cat == "marine" else cat.upper()) + ">"
        text = f"drew {_name(got[0]) if got else 'no card'} with the {icon} effect"
    elif k == "choose_effect" and args.get("hire"):
        text = "gained a worker"
    elif k == "choose_effect" and isinstance(args.get("upgrade"), str):
        text = f"upgraded the {args['upgrade'].capitalize()} action card"
    elif k == "confirm_turn":
        text = "confirmed the turn"
    elif k == "undo_last":
        text = "took back the last step"
    elif k == "restart_turn":
        text = "restarted the turn"
    elif k == "skip_effect":
        text = "passed on " + describe_action(action, before).removeprefix("Skip: ")
    elif k == "association_task":
        text = "performed the association task: " + str(args.get("task", "?"))
    elif k == "finish_build":
        text = "stopped building"
    elif k in ("finish_sponsors", "finish_animals", "finish_association"):
        text = "stopped " + {"finish_sponsors": "playing sponsors", "finish_animals": "playing animals", "finish_association": "performing association tasks"}[k]
    else:
        text = describe_action(action, before)
        text = text[:1].lower() + text[1:]
        if k == "choose_effect" and text.startswith("income"):
            text = "collected the " + text.replace("income ", "income of the ", 1).replace("income of the appeal", "income from appeal")
        elif k == "choose_effect" and text.startswith("break discard"):
            text = "discarded down to the hand limit"
    moved = after.break_position - before.break_position
    if moved and k != "sponsor_break":
        text += f", advancing the break by {moved}"
    gains = [f"{d:+d} {name}" for key, name in GAINS if key not in skip and (d := delta[key])]
    return f"{who} {text}" + (f" ({', '.join(gains)})" if gains else "")


def _effect_kind(state: GameState, args: dict) -> str:
    pending = (state.prompt.args.get("pending") if state.prompt is not None else None) or []
    i = args.get("index", -1)
    return str(pending[i].get("kind", "")) if isinstance(i, int) and 0 <= i < len(pending) else ""


def build_cost(t: str) -> int:
    from ark_nova.engine.build_action import cost
    return cost(t) if t in SIZES else 0
