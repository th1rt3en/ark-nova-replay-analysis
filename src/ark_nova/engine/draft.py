"""The action card variant draft at the start of the game (after the map pick, before the deal).

Every action card has 4 alternative sides ("variants" 1-4) besides the standard one (0). The 20 variants (5 types x 4) are one pile, each exists once:
1. each player is dealt 3 variants and picks 1; the other 2 go to the opponent;
2. each player picks 1 of the 2 received; the other one goes to the opponent;
3. each player now has 3 variants (the 2 picked + the one received) and keeps 2 of them, of two different action types (not 2 builds). When all 3 are
   of one type the engine adds a random 4th variant of another type from the rest of the pile (`auto`), so that a valid pair exists.
The kept variants replace the standard side of their action card; the other 3 action cards stay standard. The Animals card of a player always goes to strength 1, the other four in a random order
into the strength slots 2-5.

`GameState.draft` (JSON) holds what the UI shows: `stage` (pick1 | pick2 | keep | done), `offers` (what each seat chooses from), `picked`, `choice` (a
simultaneous pick that waits for the other player), `kept`, `auto`, `pool` (the undealt rest). Variants are named like `build1`.
Both players choose at the same time: `draft_pick {variant}` in the first two rounds, `draft_keep {keep: [v, v]}` in the last.
"""
from itertools import combinations

from ark_nova.engine.actions import Action
from ark_nova.engine.rng import Rng
from ark_nova.engine.state import ActionCardState, Phase, Prompt

ACTION_TYPES = ("animals", "association", "build", "cards", "sponsors")
VARIANT_NUMBERS = (1, 2, 3, 4)
DEAL = 3
KEEP = 2


class DraftError(Exception):
    pass


def all_variants() -> list:
    return [f"{t}{n}" for t in ACTION_TYPES for n in VARIANT_NUMBERS]


def variant_type(v: str) -> str:
    return v[:-1]


def variant_number(v: str) -> int:
    return int(v[-1])


def begin(state) -> None:
    """Deal 3 variants to each player; the game waits for the first picks."""
    rng = Rng(state.rng)
    pile = all_variants()
    rng.shuffle(pile)
    state.rng = rng.state
    state.draft = {"stage": "pick1", "offers": [pile[:DEAL], pile[DEAL:2 * DEAL]], "picked": [[], []], "choice": [None, None],
                   "kept": [[], []], "auto": [None, None], "pool": pile[2 * DEAL:]}
    state.phase = Phase.SETUP
    state.prompt = Prompt(kind="draft", player=0, args={})


def legal(state) -> list:
    d = state.draft
    out = []
    for seat in (0, 1):
        if d is None or d["stage"] == "done" or d["choice"][seat] is not None:
            continue
        offers = d["offers"][seat]
        if d["stage"] in ("pick1", "pick2"):
            out += [Action(seat, "draft_pick", {"variant": v}) for v in offers]
        else:
            out += [Action(seat, "draft_keep", {"keep": list(c)}) for c in combinations(offers, KEEP) if variant_type(c[0]) != variant_type(c[1])]
    return out


def apply(state, action: Action) -> None:
    d = state.draft
    if d is None or d["stage"] == "done":
        raise DraftError("no draft is going on")
    seat = action.player
    if d["choice"][seat] is not None:
        raise DraftError("this player has already chosen")
    if action.kind == "draft_pick":
        if d["stage"] not in ("pick1", "pick2") or action.args.get("variant") not in d["offers"][seat]:
            raise DraftError("pick one of the offered variants")
        d["choice"][seat] = action.args["variant"]
    else:
        keep = list(action.args.get("keep") or [])
        if d["stage"] != "keep" or len(keep) != KEEP or len(set(keep)) != KEEP or not set(keep) <= set(d["offers"][seat]) \
                or len({variant_type(v) for v in keep}) != KEEP:
            raise DraftError("keep 2 of the variants, of 2 different action cards")
        d["choice"][seat] = keep
    if all(c is not None for c in d["choice"]):
        _resolve(state)


def _resolve(state) -> None:
    d = state.draft
    choice = d["choice"]
    if d["stage"] == "pick1":
        rest = [[v for v in d["offers"][s] if v != choice[s]] for s in (0, 1)]
        d["picked"] = [[choice[0]], [choice[1]]]
        d["offers"] = [rest[1], rest[0]]                        # what a player passes is what the other one picks from
        d["stage"] = "pick2"
    elif d["stage"] == "pick2":
        rest = [[v for v in d["offers"][s] if v != choice[s]] for s in (0, 1)]
        d["picked"] = [d["picked"][s] + [choice[s]] for s in (0, 1)]
        d["offers"] = [d["picked"][s] + rest[1 - s] for s in (0, 1)]      # the 2 picked and the one the opponent passed
        d["stage"] = "keep"
        _complete_single_type(state)
    else:
        d["kept"] = [list(choice[0]), list(choice[1])]
        d["stage"] = "done"
        d["choice"] = [None, None]
        _finish(state)
        return
    d["choice"] = [None, None]


def _complete_single_type(state) -> None:
    """All 3 variants of one action: a random variant of another action is added from the rest of the pile."""
    d = state.draft
    rng = Rng(state.rng)
    for s in (0, 1):
        types = {variant_type(v) for v in d["offers"][s]}
        if len(types) == 1:
            options = [v for v in d["pool"] if variant_type(v) not in types]
            v = options[rng.randbelow(len(options))]
            d["pool"].remove(v)
            d["auto"][s] = v
            d["offers"][s] = d["offers"][s] + [v]
    state.rng = rng.state


def _finish(state) -> None:
    """The kept variants go on their action cards, the Animals card of each player at strength 1 and the other four in a random order; then the cards are dealt."""
    from ark_nova.engine import game
    d = state.draft
    rng = Rng(state.rng)
    for s, p in enumerate(state.players):
        number = {variant_type(v): variant_number(v) for v in d["kept"][s]}
        given = state.config.action_cards                         # a fork of a replay: the slots are in the order of the logged game (only the variants come from the draft)
        if given and len(given) == len(state.players):
            types = [c.type for c in given[s]]
        else:
            types = [x for x in ACTION_TYPES if x != "animals"]
            rng.shuffle(types)
            types.insert(0, "animals")                            # the Animals card always starts at strength 1, the other four are shuffled
        p.action_cards = [ActionCardState(type=t, variant=number.get(t, 0)) for t in types]
    state.rng = rng.state
    game.deal_initial(state)
