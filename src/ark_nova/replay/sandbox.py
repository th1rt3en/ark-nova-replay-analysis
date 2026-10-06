"""Sandbox mode: a game of the engine that its controller sets up and edits freely, against a bot that only passes.

Like a fork the server keeps nothing: the engine state and the sandbox data (`meta`) travel with every step. The controller picks the maps of both seats and the seat to
play; the other seat is a bot that passes (`bot_action`). The 3 base conservation projects, the two random bonuses of the 5 and the 8 conservation spaces (and the
bonus on 16 reputation in a Marine Worlds game) start empty: `meta["unset"]` says which are still to be set (randomly or by hand) before the first move.

`meta`: {"controller": seat, "bot": seat, "unset": {"projects": [bool x3], "b5": [bool x2], "b8": [bool x2], "b99": [bool] (Marine Worlds)},
         "initial": {"5": [bonus, bonus], "8": [bonus, bonus], "99": [bonus]}  (the bonuses as set: a taken one leaves its place empty on the track)}.

The edits (`edit`) change the state directly (money, tokens, conservation, reputation are set, not gained: no threshold bonus follows); adding a partner zoo or a university
goes through the engine, so the bonuses of its space follow as pending effects.
"""
import copy
import random

from ark_nova import data
from ark_nova.engine import association, bonuses, effects
from ark_nova.engine.actions import Action
from ark_nova.engine.game import IllegalAction, apply, deal_initial, deck_cards, legal_actions, start_game
from ark_nova.engine.map_select import MARINE_WORLDS_MAPS
from ark_nova.engine.state import ActionCardState, GameConfig, GameState, SeedSpec, Token
from ark_nova.data.map_support import UNSUPPORTED_MAPS
from ark_nova.replay import fork as forking
from ark_nova.replay.view import card_catalog, map_view

# the 16 bonuses that the 5 and 8 conservation spaces (and the 16 reputation space) draw two (one) of at random, as seen in the logs; the 5 money option is always there
BONUS_POOL = [{"Partner-Zoo": 1}, {"Fac": 1}, {"Multiplier": 1}, {"xtoken": 3}, {"take-in-range-or-deck": 3}, {"size-3": 1}, {"bonus-ignore-conditions": 3},
              {"bonus-increased-hand": 1}, {"bonus-icon": 1}, {"bonus-scoring-cards": 3}, {"bonus-sponsor-gray": 1}, {"bonus-sponsor": 1}, {"reputation": 2},
              {"bonus-extra-shift": 1}, {"bonus-kiosk-pavilion": 3}, {"money": 10}]
COLORS = ["#b91b1b", "#1863a5"]
UNIVERSITIES = ("fac-rep-hand", "fac-science-rep", "fac-science-science")
MAX_BOT_MOVES = 60
FIELDS = {"money": (0, 999), "x_tokens": (0, 5), "conservation": (0, 40), "reputation": (0, 15)}


class SandboxError(ValueError):
    pass


def available_maps(marine_worlds: bool) -> list[dict]:
    return [{"id": m["id"], "name": m["name"], "marine_worlds": m["id"] in MARINE_WORLDS_MAPS} for m in data.maps()
            if m.get("geometry") and m["id"] not in UNSUPPORTED_MAPS and (marine_worlds or m["id"] not in MARINE_WORLDS_MAPS)]


def new_game(marine_worlds: bool, maps: list, controller: int, seed: int | None = None) -> tuple[GameState, dict]:
    ids = {m["id"] for m in available_maps(marine_worlds)}
    if len(maps) != 2 or any(str(m) not in ids for m in maps) or controller not in (0, 1):
        raise SandboxError("choose a map for both seats and the seat to play")
    base = deck_cards("base_project", marine_worlds)
    initial = {"5": BONUS_POOL[:2], "8": BONUS_POOL[2:4]}
    if marine_worlds:
        initial["99"] = BONUS_POOL[4:5]
    config = GameConfig(marine_worlds=marine_worlds, player_ids=["1", "2"], maps=[str(m) for m in maps], base_projects=base[:3],
                        conservation_bonuses=copy.deepcopy(initial), draft_action_cards=False, player_names=["You" if controller == 0 else "Bot", "You" if controller == 1 else "Bot"])
    state = start_game(config, SeedSpec(tail_seed=seed if seed is not None else random.SystemRandom().randrange(1, 2 ** 31)))
    meta = {"controller": controller, "bot": 1 - controller, "initial": initial,
            "unset": {"projects": [True] * 3, "b5": [True] * 2, "b8": [True] * 2, **({"b99": [True]} if marine_worlds else {})}}
    return state, meta


def names(meta: dict) -> list[str]:
    return ["You" if s == meta["controller"] else "Bot" for s in (0, 1)]


def skeleton(state: GameState) -> dict:
    """What the viewer needs besides the steps (the same keys as a replay)."""
    mw = bool(state.config.marine_worlds)
    keys = set(deck_cards("main", mw)) | set(deck_cards("endgame", mw)) | set(deck_cards("base_project", mw))
    return {"table_id": 0, "marine_worlds": bool(state.config.marine_worlds),
            "players": [{"seat": i, "id": pid, "name": n, "color": COLORS[i]} for i, (pid, n) in enumerate(zip(state.config.player_ids, state.config.player_names))],
            "maps": [map_view(m) for m in state.config.maps], "base_projects": list(state.base_projects), "result": [], "setup_steps": 0,
            "cards": card_catalog(keys, bool(state.config.marine_worlds)), "shapes": forking.shapes(), "base_pool": deck_cards("base_project", mw)}


def bot_action(state: GameState, bot: int) -> Action | None:
    """What the passing bot does: put an action card back (gain an X token), decline what can be declined, discard the first cards asked, else the first move."""
    try:
        acts = [a for a in legal_actions(state) if a.player == bot]
    except NotImplementedError:
        return None
    if not acts:
        return None
    for kind in ("skip_action", "skip_effect", "skip_extra", "skip_snap", "finish_sponsors", "finish_animals", "finish_association", "finish_build", "skip", "self_clever"):
        for a in acts:
            if a.kind == kind:
                return a
    return acts[0]


def payload(state: GameState, label: str, meta: dict, irreversible: str = "") -> dict:
    step = forking.step_payload(state, label, irreversible)
    step["sandbox"] = meta
    return step


def settle(state: GameState, meta: dict, steps: list) -> GameState:
    """Let the bot move while it is its turn (each move is a step)."""
    who = names(meta)
    for _ in range(MAX_BOT_MOVES):
        a = bot_action(state, meta["bot"])
        if a is None:
            break
        try:
            new = apply(state, a)
        except (IllegalAction, NotImplementedError):
            break
        steps.append(payload(new, forking.narrate(state, a, new, who[a.player]), meta, forking.is_irreversible(state, a, new)))
        state = new
    return state


def first_step(state: GameState, meta: dict) -> list:
    steps: list = []
    settle(state, meta, steps)
    if steps:
        return steps
    return [payload(state, "Sandbox: the game starts", meta)]


def ready(meta: dict) -> bool:
    return not any(any(v) for v in meta["unset"].values())


def play(state_dict: dict, meta: dict, action_dict: dict) -> list:
    """One move of the controller, then the bot's moves: the steps that come out."""
    if not ready(meta):
        raise IllegalAction("set the base projects and the conservation bonuses first")
    who = names(meta)
    if int(action_dict.get("player", -1)) != meta["controller"]:
        raise IllegalAction("you play the other seat's moves with the bot: it passes by itself")
    first = forking.play(state_dict, action_dict, who)
    first["sandbox"] = meta
    steps = [first]
    settle(GameState.from_dict(first["engine_state"]), meta, steps)
    return steps


# ---- edits --------------------------------------------------------------------------------------------------------------------------

def _new_token_id(state: GameState) -> int:
    return max([t.id for q in state.players for t in q.tokens] + [t.id for t in state.board_tokens], default=0) + 1


def _seat(args: dict) -> int:
    s = args.get("seat")
    if s not in (0, 1):
        raise SandboxError("which seat?")
    return s


def _card_place(state: GameState, key: str):
    """Where a card is outside the players' zoos: ('deck', list, index) | ('discard', ...) | ('endgame', ...) | ('display', ...)."""
    for name, lst in (("deck", state.main_deck), ("discard", state.main_discard), ("endgame", state.endgame_deck), ("display", state.display)):
        if key in lst:
            return name, lst, lst.index(key)
    return None


def edit(state: GameState, meta: dict, op: str, args: dict) -> tuple[GameState, dict, str]:
    """Apply an edit of the controller; returns the new state, the new meta and the line of the log. The inputs are not changed."""
    state, meta = copy.deepcopy(state), copy.deepcopy(meta)
    cfg_mw = bool(state.config.marine_worlds)
    if op == "set_projects":
        pool = deck_cards("base_project", cfg_mw)
        slots = [int(s) for s in args.get("slots") or []]
        keys = list(args.get("keys") or [None] * len(slots))
        if not slots or len(keys) != len(slots) or any(s not in (0, 1, 2) or not meta["unset"]["projects"][s] for s in slots):
            raise SandboxError("those base project slots are already set")
        projects = list(state.base_projects)
        taken = {projects[i] for i in range(3) if i not in slots}
        rnd = random.SystemRandom()
        for s, k in zip(slots, keys):
            if k is None:
                k = rnd.choice([c for c in pool if c not in taken])
            if k not in pool or k in taken:
                raise SandboxError("that base project cannot be used (twice)")
            projects[s] = k
            taken.add(k)
            meta["unset"]["projects"][s] = False
        state.base_projects = projects
        state.base_projects_unused = [k for k in pool if k not in projects]
        state.config = _replace(state.config, base_projects=list(projects))
        return state, meta, "Sandbox: the base projects are " + ", ".join(data.cards_by_key()[k]["name"].title() for k in projects)
    if op == "set_bonus":
        th, slot = str(args.get("threshold")), int(args.get("slot", 0))
        flags = meta["unset"].get("b" + th)
        if flags is None or not 0 <= slot < len(flags) or not flags[slot]:
            raise SandboxError("that bonus space is already set")
        bonus = args.get("bonus")
        others = [b for j, b in enumerate(meta["initial"][th]) if j != slot]
        if bonus is None:
            bonus = random.SystemRandom().choice([b for b in BONUS_POOL if b not in others])
        if bonus not in BONUS_POOL or bonus in others:
            raise SandboxError("that bonus cannot be used (twice on one threshold)")
        meta["initial"][th][slot] = bonus
        state.conservation_options[th] = copy.deepcopy(meta["initial"][th])
        flags[slot] = False
        return state, meta, f"Sandbox: the bonus at {'16 reputation' if th == '99' else th + ' conservation'} is {_bonus_text(bonus)}"
    if op == "set_value":
        seat, field = _seat(args), str(args.get("field"))
        if field not in FIELDS:
            raise SandboxError("money, X tokens, conservation or reputation")
        lo, hi = FIELDS[field]
        v = int(args.get("value"))
        if not lo <= v <= hi:
            raise SandboxError(f"{field.replace('_', ' ')} must be between {lo} and {hi}")
        setattr(state.players[seat], field, v)
        return state, meta, f"Sandbox: {names(meta)[seat]} {'now have' if names(meta)[seat] == 'You' else 'now has'} {v} {field.replace('_', ' ')}"
    if op == "reorder":
        seat, order = _seat(args), list(args.get("order") or [])
        p = state.players[seat]
        if sorted(order) != sorted(c.type for c in p.action_cards):
            raise SandboxError("the five action cards, each once")
        if state.current_action is not None:
            raise SandboxError("finish the action first: the action cards can be reordered between actions")
        by = {c.type: c for c in p.action_cards}
        p.action_cards = [by[t] for t in order]
        return state, meta, f"Sandbox: {names(meta)[seat]}'s action cards are now in the order " + ", ".join(t.capitalize() for t in order)
    if op == "set_variant":
        seat, typ, v = _seat(args), str(args.get("type")), int(args.get("variant", 0))
        card = next((c for c in state.players[seat].action_cards if c.type == typ), None)
        if card is None or not 0 <= v <= 4 or (v and not cfg_mw):
            raise SandboxError("the variants 1-4 are a Marine Worlds feature")
        card.variant = v
        return state, meta, f"Sandbox: {names(meta)[seat]}'s {typ.capitalize()} card is now " + ("the standard card" if not v else f"variant {v}")
    if op == "add_hand":
        seat, key = _seat(args), str(args.get("card"))
        where = _card_place(state, key)
        if where is None or where[0] == "display":
            raise SandboxError("that card is not in the deck or the discard pile")
        name, lst, i = where
        lst.pop(i)
        (state.players[seat].endgame_hand if name == "endgame" else state.players[seat].hand).append(key)
        return state, meta, f"Sandbox: {data.cards_by_key()[key]['name'].title()} was added to {names(meta)[seat]}'s hand"
    if op == "set_display":
        index, key = int(args.get("index", -1)), str(args.get("card"))
        if not 0 <= index < len(state.display):
            raise SandboxError("which display space?")
        old = state.display[index]
        where = _card_place(state, key)
        if where is None or key == old:
            raise SandboxError("pick a card of the deck, the discard pile or the display")
        name, lst, i = where
        if name == "endgame":
            raise SandboxError("endgame cards cannot go on the display")
        if old is None:
            lst.pop(i)
        else:
            lst[i] = old                                                          # (the card that leaves takes the place of the new one: every card stays unique)
        state.display[index] = key
        return state, meta, f"Sandbox: display space {index + 1} now shows {data.cards_by_key()[key]['name'].title()}"
    if op == "add_tile":
        return _add_tile(state, meta, _seat(args), str(args.get("tile")), str(args.get("name")))
    if op == "workers":
        seat, what, where = _seat(args), str(args.get("what")), str(args.get("where", ""))
        p = state.players[seat]
        if what == "unlock":
            if not bonuses.hire_worker(state, seat):
                raise SandboxError("no locked worker is left")
            return state, meta, f"Sandbox: a worker of {names(meta)[seat]} was unlocked"
        if what == "remove" and where in ("supply_", "reserve", "association_"):
            tok = next(iter(bonuses.worker_tokens(p, where)), None)
            if tok is None:
                raise SandboxError("no such worker")
            p.tokens.remove(tok)
            return state, meta, f"Sandbox: a worker of {names(meta)[seat]} was removed"
        raise SandboxError("unlock or remove a worker")
    raise SandboxError(f"unknown edit {op!r}")


def _replace(cfg, **kw):
    import dataclasses
    return dataclasses.replace(cfg, **kw)


def _bonus_text(b: dict) -> str:
    (k, v), = b.items()
    return k.replace("bonus-", "").replace("-", " ") + (f" {v}" if v != 1 else "")


def _add_tile(state: GameState, meta: dict, seat: int, tile: str, name: str):
    p = state.players[seat]
    prev = state.prompt
    if prev is None:
        raise SandboxError("not now")
    if tile == "partner":
        if name not in association.CONTINENTS or len(association.partners(p)) >= association.MAX_PARTNERS:
            raise SandboxError("no room for another partner zoo")
        tok, category = Token(_new_token_id(state), f"partner-{name}", ""), None
    elif tile == "university":
        if len(association.universities(p)) >= association.MAX_UNIVERSITIES:
            raise SandboxError("no room for another university")
        if name in UNIVERSITIES:
            tok, category = Token(_new_token_id(state), name, ""), None
        elif name in association.category_pool(state):
            tok, category = Token(_new_token_id(state), "fac-generic", ""), name
        else:
            raise SandboxError("nobody can take that university (taken, or not in this game)")
    else:
        raise SandboxError("a partner zoo or a university")
    own_context = state.current_action is None and prev.kind != "effects"          # (a waiting prompt: the bonuses of the space are opened as effects, then the prompt comes back)
    if own_context:
        state.current_action = {}
    try:
        if tile == "partner":
            association.place_partner(state, p, tok)
        else:
            association.place_university(state, p, tok, category)
    finally:
        pending = bonuses.drain(state) if own_context else []
        if own_context:
            state.current_action = None
    if pending:
        effects.open_prompt(state, seat, pending, {"kind": "restore", "prompt_kind": prev.kind, "player": prev.player, "args": prev.args})
    label = {"partner": "a partner zoo", "university": "a university"}[tile]
    return state, meta, f"Sandbox: {names(meta)[seat]} got {label} ({name.replace('fac-', '').replace('-', ' ')})"


def edit_payload(state_dict: dict, meta: dict, op: str, args: dict) -> dict:
    state = GameState.from_dict(state_dict)
    new, meta2, label = edit(state, meta, op, args)
    return payload(new, label, meta2)
