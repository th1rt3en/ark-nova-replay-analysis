"""Engine entry points. Setup is implemented; the turn rules arrive in phase 2-4 of the plan.

API (all pure, no I/O):
    initial_state(config, seed) -> GameState        decks built, players created, nothing dealt
    start_game(config, seed)    -> GameState        + initial deal and map start effects; waiting for the initial discards
    legal_actions(state)        -> list[Action]     for the current phase
    apply(state, action)        -> GameState        returns a new state; raises IllegalAction
"""
import copy
from itertools import combinations

from ark_nova import data
from ark_nova.engine import breaks, endgame, icons, marks, sponsor_variants, venom, animals_action, association, bonuses, build_action, card_programs, cards_action, effects, sponsors_action, tracks
from ark_nova.engine.board import board, neighbours
from ark_nova.engine.actions import Action
from ark_nova.engine.cards import search_deck
from ark_nova.engine.rng import Rng, build_deck
from ark_nova.engine.state import (
    ActionCardChoice, ActionCardState, Building, DISPLAY_SIZE, GameConfig, GameState, Phase, PlayerState, Prompt, SeedSpec,
    STATE_VERSION, Token,
)

ACTION_TYPES = ("animals", "association", "build", "cards", "sponsors")
HAND_DEAL = 8
ENDGAME_DEAL = 2
INITIAL_DISCARD = 4
START_MONEY = 25
MAX_X_TOKENS = 5
BREAK_AT = 9          # the break starts when the break token reaches this position (2 players)


class IllegalAction(Exception):
    pass


def deck_cards(deck: str, marine_worlds: bool) -> list[str]:
    """Card keys of one of the three decks ('main', 'endgame', 'base_project') for a game."""
    keys = []
    for key, card in data.cards_by_key().items():
        if card["deck"] != deck or not card["active"]:
            continue
        if card["source"] == "marine_worlds" and not marine_worlds:
            continue
        keys.append(key)
    return sorted(keys)


PLACEHOLDER_ID = 9000                # token ids from here are the engine's own (a replay swaps them for BGA's ids when it meets them)


def _initial_tokens(seat: int) -> list[Token]:
    """Association workers: 3 in the supply, 1 in reserve (BGA `setupPlayer`)."""
    return [Token(PLACEHOLDER_ID + 10 * seat + i, "worker", loc) for i, loc in enumerate(["supply_1", "supply_2", "supply_3", "reserve"])]


def _initial_buildings(map_id: str, seat: int) -> list[Building]:
    """Map 13 (Drawing Board) starts with a free 2-space enclosure on the two centre spaces."""
    return [Building(id=PLACEHOLDER_ID + 100 + seat, type="size-2", x=4, y=5, rotation=0)] if map_id == "13" else []


def initial_state(config: GameConfig, seed: SeedSpec) -> GameState:
    """Decks built and players created; nothing is dealt yet."""
    if len(config.player_ids) != 2 or len(config.maps) != 2:
        raise ValueError("exactly 2 players are supported")
    base = deck_cards("base_project", config.marine_worlds)
    if len(config.base_projects) != 3 or len(set(config.base_projects)) != 3 or not set(config.base_projects) <= set(base):
        raise ValueError("base_projects must be 3 distinct base projects valid for this game")
    rng = Rng(seed.tail_seed)
    choices = config.action_cards or [[ActionCardChoice(t) for t in ACTION_TYPES] for _ in range(2)]
    state = GameState(
        version=STATE_VERSION,
        config=config,
        seed=seed,
        rng=0,
        main_deck=build_deck(deck_cards("main", config.marine_worlds), seed.main_order, rng),
        endgame_deck=build_deck(deck_cards("endgame", config.marine_worlds), seed.endgame_order, rng),
        conservation_options={th: list(bs) for th, bs in (config.conservation_bonuses or {}).items()},
        board_tokens=association.initial_board(config.marine_worlds),
        base_projects=list(config.base_projects),
        base_projects_unused=[k for k in base if k not in config.base_projects],
        players=[
            PlayerState(seat=i, map_id=config.maps[i], money=START_MONEY, appeal=i, reputation=1,      # 0 / 1 appeal for the first / second player
                        action_cards=[ActionCardState(type=c.type, variant=c.variant) for c in choices[i]],
                        tokens=_initial_tokens(i), buildings=_initial_buildings(config.maps[i], i))
            for i in range(2)
        ],
    )
    state.rng = rng.state
    return state


def start_game(config: GameConfig, seed: SeedSpec) -> GameState:
    """Initial deal (seat order: the first player gets the top cards), map start effects, then wait for the initial discards."""
    state = initial_state(config, seed)
    for p in state.players:
        p.hand = [state.main_deck.pop(0) for _ in range(HAND_DEAL)]
        p.endgame_hand = [state.endgame_deck.pop(0) for _ in range(ENDGAME_DEAL)]
    for p in state.players:                       # Map 14: find a person sponsor at the start of the game
        if p.map_id == "14":
            found = search_deck(state.main_deck, ("person", None))
            if found:
                p.hand.append(found)
    for p in state.players:                       # the whole hand (8 cards, 9 with a Map 14 sponsor) is offered for the discard
        p.initial_offer = list(p.hand)
    state.phase = Phase.SETUP
    state.prompt = Prompt(kind="initial_discard", player=0, args={"count": INITIAL_DISCARD})
    return state


def legal_actions(state: GameState) -> list[Action]:
    """Legal actions for the current prompt (in setup: for both players)."""
    if state.phase is Phase.SETUP:
        return [Action(p.seat, "initial_discard", {"cards": list(c)})
                for p in state.players if p.initial_offer
                for c in combinations(p.initial_offer, INITIAL_DISCARD)]
    pr = state.prompt
    if pr is None:
        return []
    p = state.players[pr.player]
    if pr.kind == "choose_action_card":
        only = pr.args.get("only")
        if pr.args.get("hypnosis"):                              # one of the first 3 cards of the other player
            return ([Action(p.seat, "choose_action_card", {"type": c.type, "spend": k, "hypnosis": True})
                     for c in state.players[1 - p.seat].action_cards[:3] for k in range(0, p.x_tokens + 1)]
                    + [Action(p.seat, "skip_extra", {})])
        chosen = [Action(p.seat, "choose_action_card", {"type": c.type, "spend": k})
                  for c in p.action_cards if only is None or c.type in only for k in range(0, p.x_tokens + 1)]
        if only is not None:                                     # a second action: Action: X can be declined (not put back for an X token), Determination can put any action back
            if pr.args.get("optional"):
                return chosen + [Action(p.seat, "skip_extra", {})]
            return chosen + [Action(p.seat, "skip_extra", {})] + [Action(p.seat, "skip_action", {"type": c.type, **({"repeat": m} if m else {})})
                                                                  for c in p.action_cards if c.type in only for m in range(0, c.tokens.count("Multiplier") + 1)]
        return chosen + [Action(p.seat, "skip_action", {"type": c.type, **({"repeat": m} if m else {})})
                         for c in p.action_cards for m in range(0, c.tokens.count("Multiplier") + 1)]
    if pr.kind == "cards_take":
        acts = []
        a = pr.args
        for k in range(1, 1 if venom.blocked(state, p.seat) else min(a["remaining"], len(state.main_deck)) + 1):
            acts.append(Action(p.seat, "take_cards", {"mode": "deck", "count": k}))
        reach = [c for c in state.display[:cards_action.reputation_range(p.reputation)] if c]
        if not cards_action.deck_only(a["level"]):
            acts += [Action(p.seat, "take_cards", {"mode": "range", "card": c}) for c in reach]
        if a["snap"] and a["taken"] == a.get("snapped", 0) and a.get("snaps_left", 1) > 0:       # snapping ignores the reputation range (verified on the logs)
            snaps = [Action(p.seat, "take_cards", {"mode": "snap", "card": c}) for c in dict.fromkeys(state.display) if c]
            if a.get("snapped"):                                 # a second snap: nothing else is possible any more
                return snaps
            acts += snaps
        elif a.get("snapped"):
            return []
        return acts
    if pr.kind == "build_place":
        return _build_actions(state, p)
    if pr.kind == "sponsors_play":
        return _sponsor_actions(state, p)
    if pr.kind == "effects":
        return effects.legal(state, p)
    if pr.kind == "animals_play":
        return animals_action.legal(state, p)
    if pr.kind == "association_tasks":
        return association.legal(state, p)
    if pr.kind == "cards_discard":
        return [Action(p.seat, "discard_cards", {"cards": list(c)}) for c in combinations(sorted(set(p.hand)), pr.args["count"])]
    raise NotImplementedError(f"prompt {pr.kind!r} is not implemented yet")


def _sponsor_actions(state: GameState, p) -> list[Action]:
    a = state.prompt.args
    acts = [Action(p.seat, "play_sponsor", {"card": k, "from_display": d})
            for k, d in sponsors_action.playable(state, p.seat, a["level"], a["left"], p.money)
            if (a["level"] >= 2 or not a["played"]) and not a.get("broke")]
    if not a["played"] and not a.get("broke"):
        acts.append(Action(p.seat, "sponsor_break", {}))
    else:
        acts.append(Action(p.seat, "finish_sponsors", {}))
    return acts + sponsor_variants.legal(state, p)


BUILD_EXTRA_COST = {1: 3, 2: 2}       # Pavilion / Kiosk Build: the additional pavilion / kiosk costs 3 at level I, 2 at level II
TERRAIN_COST = 2                       # Terrain Build, level I: covering a rock / water space costs 2 more; level II: it gives 2 money
EXTRA_TYPE = {1: "pavilion", 2: "kiosk"}


def _build_rules(p, a) -> dict:
    rules = dict(_player_rules(p))
    if a.get("variant") == 4 and not a.get("terrain_used"):
        rules["terrain_hexes"] = 1
    return rules


def _build_actions(state: GameState, p) -> list[Action]:
    a = state.prompt.args
    bd = board(p.map_id)
    mine = [(b.type, b.x, b.y, b.rotation) for b in p.buildings]
    rules = _build_rules(p, a)
    variant = a.get("variant", 0)
    acts = []
    for t, size in build_action.SIZES.items():
        if t in build_action.AQUARIUMS and not state.config.marine_worlds:      # aquariums belong to Marine Worlds
            continue
        if t in build_action.UNIQUE and any(b.type == t for b in p.buildings):
            continue
        again = variant == 3 and a["level"] >= 2 and t.startswith("size-")        # +1 Build, level II: several identical standard enclosures
        normal = size <= a["remaining"] and (t not in a["placed"] or again) and not (a["level"] < 2 and a["placed"])
        extra = variant in EXTRA_TYPE and EXTRA_TYPE[variant] == t and not a.get("extra_used")
        if not normal and not extra:
            continue
        for x, y, k in build_action.valid_placements(bd, mine, t, a["level"], rules):
            tcost = TERRAIN_COST if _covers_terrain(bd, t, x, y, k) and variant == 4 and a["level"] == 1 else 0
            if normal and build_action.cost(t) + tcost <= p.money:
                acts.append(Action(p.seat, "place_building", {"type": t, "x": x, "y": y, "rotation": k}))
            if extra and BUILD_EXTRA_COST[a["level"]] <= p.money:
                acts.append(Action(p.seat, "place_building", {"type": t, "x": x, "y": y, "rotation": k, "extra": True}))
    if a["placed"]:
        acts.append(Action(p.seat, "finish_build", {}))
    return acts


def _covers_terrain(bd, t: str, x: int, y: int, k: int) -> bool:
    return any(bd.terrain[c] != "plain" for c in build_action.footprint(t, x, y, k) if c in bd.terrain)


def apply(state: GameState, action: Action) -> GameState:
    """Returns a new state. Raises IllegalAction for an illegal action and NotImplementedError for rules not written yet."""
    new = copy.deepcopy(state)
    if new.phase is Phase.SETUP and action.kind == "initial_discard":
        _initial_discard(new, action)
        return new
    pr = new.prompt
    if pr is not None and pr.kind == "effects" and action.player != pr.player and any(e.get("player") == action.player for e in pr.args["pending"]):
        pass                                             # the other player has an effect to resolve too (endgame card discard)
    elif pr is None or action.player != pr.player:
        raise IllegalAction("it is not this player's decision")
    handler = _TURN_HANDLERS.get((pr.kind, action.kind))
    if handler is None:
        raise IllegalAction(f"{action.kind} is not possible while the prompt is {pr.kind}")
    try:
        handler(new, action)
    except effects.IllegalEffect as ex:
        raise IllegalAction(str(ex))
    icons.sync_all(new)
    return new


# ---- turn: choosing an action card, the Cards action, end of turn -----------------------------------------------------

def _choose_action_card(state: GameState, action: Action) -> None:
    p = state.players[action.player]
    args = state.prompt.args
    spend = int(action.args.get("spend", 0))
    hypnosis = bool(action.args.get("hypnosis"))               # Hypnosis: an action card of the other player at strength 1-3
    if hypnosis and not args.get("hypnosis"):
        raise IllegalAction("no hypnosis now")
    owner = state.players[1 - p.seat] if hypnosis else p
    idx = next((i for i, c in enumerate(owner.action_cards) if c.type == action.args["type"]), None)
    if idx is None or (hypnosis and idx > 2):
        raise IllegalAction("no such action card")
    if not 0 <= spend <= p.x_tokens:
        raise IllegalAction("cannot spend that many X tokens")
    card = owner.action_cards[idx]
    only = args.get("only")
    if only is not None and card.type not in only:
        raise IllegalAction(f"the second action must be one of {only}")
    supported = ((card.type == "cards" and card.variant in cards_action.SUPPORTED_VARIANTS)
                 or (card.type == "sponsors")
                 or (card.type == "association")
                 or (card.type == "build")
                 or (card.type == "animals"))
    if not supported:
        raise NotImplementedError(f"action card {card.type} variant {card.variant} is not implemented yet")
    if args.get("repeat"):                                      # Multiplier: the action once more, using up a token
        if "Multiplier" not in card.tokens:
            raise IllegalAction("no Multiplier token left")
        card.tokens.remove("Multiplier")
    strength = max(1, idx + 1 + spend - venom.strength_penalty(card))              # Constriction: -2 strength (on a hypnotised card too)
    if not hypnosis:
        venom.remove_tokens(p, card)
    p.x_tokens -= spend
    carry = args.get("carry") or {}
    state.current_action = {"seat": p.seat, "type": card.type, "variant": card.variant, "level": card.level,
                            "slot": idx + 1, "strength": strength, "after": list(carry.get("after") or []), "extra": carry.get("extra")}
    if hypnosis:
        state.current_action.update(owner=owner.seat, hypnosis=True, extra=None)
    if card.type == "build":
        state.prompt = Prompt(kind="build_place", player=p.seat, args={
            "level": card.level, "remaining": strength + (1 if card.variant == 3 else 0), "placed": [], "variant": card.variant})
        return
    if card.type == "association":
        association.open_action(state, p.seat, card.level, strength, card.variant)
        return
    if card.type == "animals":
        animals_action.open_action(state, p.seat, card.level, strength, card.variant)
        return
    if card.type == "sponsors":
        state.prompt = Prompt(kind="sponsors_play", player=p.seat, args={
            "level": card.level, "strength": strength, "left": sponsors_action.budget(card.level, strength), "played": [],
            "variant": card.variant})
        return
    cards_action.open_action(state, p, card, strength)


def advance_break(state: GameState, seat: int, n: int) -> None:
    """The break token moves; reaching the last space gives the player an X token at once (the break itself starts after the turn)."""
    before = state.break_position
    state.break_position = min(BREAK_AT, before + n)
    if before < BREAK_AT <= state.break_position:
        _gain(state, seat, x_tokens=1)


def _gain(state: GameState, seat: int, money: int = 0, appeal: int = 0, x_tokens: int = 0, reputation: int = 0,
          conservation: int = 0) -> None:
    """Resource gains with the track rules: appeal 113 and X tokens 5 (gains above a limit are lost), reputation up to 15 with the
    track bonuses on the way (excess reputation becomes appeal), conservation up to 41 (the 2/5/8/10 choices are not implemented)."""
    p = state.players[seat]
    ca = state.current_action
    if money > 0 and ca and ca.get("seat") == seat and ca.get("type") == "sponsors" and ca.get("variant") == 2 and not ca.get("s2_done"):
        ca["s2_done"] = True                                # Money Sponsors (2): the first money of the action comes with extra money
        money += sponsor_variants.S2_BONUS[ca["level"]]
    p.money += money
    p.appeal = tracks.clamp_appeal(p.appeal + appeal)
    p.x_tokens = min(MAX_X_TOKENS, p.x_tokens + x_tokens)
    if conservation:
        old = p.conservation
        p.conservation = tracks.clamp_conservation(old + conservation)
        for t in tracks.BONUS_THRESHOLDS:
            if old < t <= p.conservation:
                bonuses.threshold_reached(state, seat, t)
    if reputation:
        old = p.reputation
        p.reputation = min(bonuses.reputation_cap(p), old + reputation)
        for step in range(old + 1, p.reputation + 1):
            bonus = tracks.REPUTATION_BONUSES.get(step, {})
            _gain(state, seat, x_tokens=bonus.get("xtoken", 0), conservation=bonus.get("conservation", 0))
            if bonus.get("upgrade"):
                bonuses.defer(state, {"kind": "upgrade", "player": seat, "source": "reputation track", "optional": False})
            if bonus.get("worker"):
                bonuses.hire_worker(state, seat)
            if bonus.get("take"):
                bonuses.defer(state, {"kind": "take", "source": "reputation track", "optional": False, "player": seat})
        if old + reputation > bonuses.reputation_cap(p) == tracks.MAX_REPUTATION:      # beyond the end of the track: 1 appeal per point lost
            _gain(state, seat, appeal=old + reputation - tracks.MAX_REPUTATION)      # (at 9 until the Cards action is upgraded nothing is paid: logs)


def _place_building(state: GameState, action: Action) -> None:
    p = state.players[action.player]
    a = state.prompt.args
    t, x, y, k = action.args["type"], int(action.args["x"]), int(action.args["y"]), int(action.args["rotation"])
    if t not in build_action.SIZES:
        raise NotImplementedError(f"building type {t} is not implemented yet")
    if t in build_action.AQUARIUMS and not state.config.marine_worlds:
        raise IllegalAction("aquariums need Marine Worlds")
    if Action(p.seat, "place_building", dict(action.args)) not in _build_actions(state, p):
        if t in build_action.UNIQUE and any(b.type == t for b in p.buildings):
            raise IllegalAction(f"only one {t} per player")
        raise IllegalAction(f"{t} cannot be placed at {(x, y, k)} (or not enough size / money, or the type was used in this action)")
    for name, why in card_programs.UNSUPPORTED_IN_BUILD.items():
        if name in p.sponsors:
            raise NotImplementedError(f"Build action with {why}")
    bd = board(p.map_id)
    variant = a.get("variant", 0)
    if action.args.get("extra"):                          # the additional pavilion / kiosk of Pavilion / Kiosk Build
        p.money -= BUILD_EXTRA_COST[a["level"]]
        a["extra_used"] = True
    else:
        p.money -= build_action.cost(t)
        a["remaining"] -= build_action.SIZES[t]
        a["placed"].append(t)
    if variant == 4 and _covers_terrain(bd, t, x, y, k):  # Terrain Build: 2 more at level I, level II: gain 2 money
        a["terrain_used"] = True
        if a["level"] == 1:
            p.money -= TERRAIN_COST
        else:
            _gain(state, p.seat, money=2)
    _put_building(state, p.seat, t, x, y, k)
    more = [x for x in _build_actions(state, p) if x.kind == "place_building"]
    if a["level"] < 2:                                    # level I: one building, only the additional one of Pavilion / Kiosk Build may follow
        more = [x for x in more if x.args.get("extra")]
    if not more:
        _end_turn(state)


def _player_rules(p) -> dict:
    """Placement rules that come from the player's own cards: Diversity Researcher builds over water and rock and ignores their requirements."""
    return {"overbuild": True} if "S219" in p.sponsors else {}


def _put_building(state: GameState, seat: int, t: str, x: int, y: int, k: int, double: bool = False) -> None:
    """A building goes on the map (paid or free is decided by the caller): placement bonuses (twice with `double`), pavilion appeal,
    the Landscape Gardener's X token, the +7 for covering the whole map."""
    p = state.players[seat]
    bd = board(p.map_id)
    cells = build_action.footprint(t, x, y, k)
    gains = [] if "S280" in p.sponsors else build_action.placement_bonuses(bd, cells) * (2 if double else 1)      # Reconstruction: no bonuses
    for b in gains:
        if b is None or b["type"] not in ("money", "xtoken", "reputation"):
            raise NotImplementedError(f"placement bonus {b and b['type']} is not implemented yet")
    before = [(b.type, b.x, b.y, b.rotation) for b in p.buildings]
    p.buildings.append(Building(id=max([b.id for b in p.buildings], default=0) + 1, type=t, x=x, y=y, rotation=k))
    for b in gains:
        _gain(state, seat, money=b["value"] if b["type"] == "money" else 0, x_tokens=b["value"] if b["type"] == "xtoken" else 0,
              reputation=b["value"] if b["type"] == "reputation" else 0)
    for sponsor, terrain in (("S241", "water"), ("S242", "rock")):         # Hydrologist / Geologist: money for covered spaces next to water / rock
        if sponsor in p.sponsors:
            _gain(state, seat, money=sum(any(bd.terrain.get(n) == terrain for n in neighbours(c)) for c in cells))
    if t in build_action.AQUARIUMS:                                     # an aquarium is a water icon played into the zoo (Aquarium sponsor: 2 appeal)
        from collections import Counter
        for eff in effects.fire_icon_counter(state, seat, Counter({"Water": 1})):
            bonuses.defer(state, eff)
    if t == "pavilion":
        _gain(state, seat, appeal=1)
        if "S276" in p.sponsors and state.current_action is not None and not state.current_action.get("gardener"):
            state.current_action["gardener"] = True                     # Landscape Gardener: 1 X token per action
            _gain(state, seat, x_tokens=1)
    if bd.map_id not in build_action.NO_FULL_MAP_BONUS and not build_action.covers_map(bd, before)             and build_action.covers_map(bd, before + [(t, x, y, k)]):
        _gain(state, seat, appeal=build_action.FULL_MAP_APPEAL)


def _put_sponsor_tokens(state: GameState, p, k: str) -> None:
    """Breeding Cooperation / Breeding Program: 2 player tokens on the card."""
    if k in association.SPONSOR_TOKENS:
        ids = [t.id for q in state.players for t in q.tokens] + [t.id for t in state.board_tokens]
        for i in range(2):
            p.tokens.append(Token(max(ids, default=0) + 1 + i, "token", association.token_location(k)))


def _play_sponsor(state: GameState, action: Action) -> None:
    p = state.players[action.player]
    a = state.prompt.args
    k, from_display = action.args["card"], bool(action.args.get("from_display"))
    if a["played"] and a["level"] < 2:
        raise IllegalAction("a level I Sponsors action plays exactly one sponsor")
    if (k, from_display) not in sponsors_action.playable(state, p.seat, a["level"], a["left"], p.money):
        raise IllegalAction(f"{k} cannot be played now")
    if sponsors_action.has_unimplemented_effect(k):
        raise NotImplementedError(f"the effect of sponsor {k} is not implemented yet")
    card = data.cards_by_key()[k]
    if from_display:
        i = state.display.index(k)
        p.money -= i + 1                                     # the folder number is paid on top
        state.display[i] = None
    else:
        p.hand.remove(k)
    p.sponsors.append(k)
    _put_sponsor_tokens(state, p, k)
    a["left"] -= sponsors_action.level_of(k)
    a["played"].append(k)
    own = sponsors_action.own_gain(k)
    printed = card_programs.PRINTED_OVERRIDE.get(k) or {"appeal": card.get("appeal") or 0, "reputation": card.get("reputation") or 0,
                                                      "conservation": card.get("conservationPoint") or 0}
    _gain(state, p.seat, money=own.get("money", 0), x_tokens=own.get("xtoken", 0),
          appeal=printed.get("appeal", 0) + own.get("appeal", 0), reputation=printed.get("reputation", 0) + own.get("reputation", 0),
          conservation=printed.get("conservation", 0) + own.get("conservation", 0))
    pending = effects.on_play(state, p.seat, k)
    if not _open_effects(state, p.seat, pending, {"kind": "sponsors_play", "args": a}):
        _after_sponsor(state, p.seat)


def play_sponsor_outside_action(state: GameState, seat: int, k: str) -> list:
    """A sponsor played by an effect (Marketing): into the zoo with its printed gains; returns its pending effects."""
    p = state.players[seat]
    card = data.cards_by_key()[k]
    p.hand.remove(k)
    p.sponsors.append(k)
    own = sponsors_action.own_gain(k)
    printed = card_programs.PRINTED_OVERRIDE.get(k) or {"appeal": card.get("appeal") or 0, "reputation": card.get("reputation") or 0,
                                                      "conservation": card.get("conservationPoint") or 0}
    _gain(state, seat, money=own.get("money", 0), x_tokens=own.get("xtoken", 0),
          appeal=printed.get("appeal", 0) + own.get("appeal", 0), reputation=printed.get("reputation", 0) + own.get("reputation", 0),
          conservation=printed.get("conservation", 0) + own.get("conservation", 0))
    return effects.on_play(state, seat, k)


def _after_sponsor(state: GameState, seat: int) -> None:
    a = state.prompt.args
    p = state.players[seat]
    if sponsor_variants.has_side(a) and sponsor_variants.legal(state, p):               # a side action may still follow: the player ends the action
        return
    if a["level"] < 2 or not sponsors_action.playable(state, seat, a["level"], a["left"], p.money):
        _end_turn(state)


def _open_effects(state: GameState, seat: int, pending: list, resume: dict) -> bool:
    """Open the prompt `effects` for the pending effects plus the conservation thresholds reached meanwhile; False when there are none."""
    pending = list(pending) + bonuses.drain(state)
    if not pending:
        return False
    effects.open_prompt(state, seat, pending, resume)
    return True


def _resume_after_effects(state: GameState) -> None:
    resume = state.prompt.args["resume"]
    seat = resume["seat"] if resume["kind"] == "end" else state.prompt.player
    kind = resume["kind"]
    if kind == "end" and resume.get("again"):
        _end_turn(state)
    elif kind == "end":
        _after_action(state, seat, resume.get("extra"))
    elif kind == "prompt":                                         # an effects step before a prompt that was waiting (Digging cards)
        state.prompt = Prompt(kind=resume["prompt_kind"], player=seat, args=resume["args"])
    elif kind == "sponsors_play":
        state.prompt = Prompt(kind="sponsors_play", player=seat, args=resume["args"])
        _after_sponsor(state, seat)
    elif kind == "break":
        breaks.run(state, resume["initiator"], resume["step"])
    elif kind == "final_scoring":
        _score_game(state)
    elif kind == "animals_play":
        state.prompt = Prompt(kind="animals_play", player=seat, args=resume["args"])
        animals_action.after_step(state, seat)
    elif kind == "association_tasks":
        state.prompt = Prompt(kind="association_tasks", player=seat, args=resume["args"])
        association.after_step(state, seat)
    else:
        raise NotImplementedError(f"resume {kind}")


def _finish_sponsors(state: GameState, action: Action) -> None:
    if not state.prompt.args["played"] and not state.prompt.args.get("broke"):
        raise IllegalAction("play a sponsor first (or take the break option)")
    _end_turn(state)


def _sponsor_break(state: GameState, action: Action) -> None:
    a = state.prompt.args
    if a["played"]:
        raise IllegalAction("the break option replaces playing sponsors")
    x = a["strength"]
    advance_break(state, action.player, x)
    _gain(state, action.player, money=x * (2 if a["level"] >= 2 else 1))
    if sponsor_variants.has_side(a):
        a["broke"] = True                                     # the side actions of the variant may still follow
        if sponsor_variants.legal(state, state.players[action.player]):
            return
        a["broke"] = False
    _end_turn(state)


def _finish_build(state: GameState, action: Action) -> None:
    if not state.prompt.args["placed"]:
        raise IllegalAction("build at least one building first")
    _end_turn(state)


def _skip_action(state: GameState, action: Action) -> None:
    """Decline to perform an action: the chosen card still goes to slot 1 and the player gets 1 X token (at most 5)."""
    p = state.players[action.player]
    idx = next((i for i, c in enumerate(p.action_cards) if c.type == action.args["type"]), None)
    if idx is None:
        raise IllegalAction("no such action card")
    card = p.action_cards[idx]
    again = int(action.args.get("repeat", 0))                    # Multiplier: put the card back once more per token, an X token each
    if not 0 <= again <= card.tokens.count("Multiplier"):
        raise IllegalAction("not that many Multiplier tokens on the card")
    for _ in range(again):
        card.tokens.remove("Multiplier")
    p.x_tokens = min(MAX_X_TOKENS, p.x_tokens + 1 + again)
    venom.remove_tokens(p, card)
    state.current_action = {"seat": p.seat, "type": card.type, "slot": idx + 1, "strength": 0, "skipped": True}
    _end_turn(state)


def _take_cards(state: GameState, action: Action) -> None:
    p = state.players[action.player]
    a = state.prompt.args
    mode = action.args["mode"]
    if mode == "deck":
        k = int(action.args["count"])
        if not 1 <= k <= a["remaining"]:
            raise IllegalAction("cannot draw that many cards")
        if k > len(state.main_deck):
            raise NotImplementedError("the deck would run out (reshuffling the discard pile is not implemented yet)")
        if venom.blocked(state, p.seat):
            raise IllegalAction("pay for Venom before drawing cards")
        venom.settle(state, p.seat)
        p.hand += [state.main_deck.pop(0) for _ in range(k)]
        a["remaining"] -= k
        a["taken"] += k
    elif mode in ("range", "snap"):
        card = action.args["card"]
        reach = state.display if mode == "snap" else state.display[:cards_action.reputation_range(p.reputation)]
        if card not in reach:
            raise IllegalAction("that card is not available (reputation range applies to drawing, not to snapping)")
        if mode == "range":
            if cards_action.deck_only(a["level"]) or a["remaining"] < 1:
                raise IllegalAction("cannot take a card from the display now")
            a["remaining"] -= 1
            a["taken"] += 1
        else:
            if not a["snap"] or a["taken"] != a.get("snapped", 0) or a.get("snaps_left", 1) <= 0:
                raise IllegalAction("cannot snap now")
            a["snapped"] = a.get("snapped", 0) + 1
            a["snaps_left"] = a.get("snaps_left", 1) - 1
            a["remaining"] = a["snaps_left"]                     # a second snap (Snap cards, level II, strength 5) is still to come
            a["discard"] = 0
            a["taken"] = a["snapped"]
        state.display[state.display.index(card)] = None
        marks.taken(state, card)
        p.hand.append(card)
    else:
        raise IllegalAction(f"unknown mode {mode!r}")
    if a["remaining"] == 0:
        if a["discard"]:
            state.prompt = Prompt(kind="cards_discard", player=p.seat, args={"count": a["discard"]})
        else:
            _end_turn(state)


def _discard_for_cards(state: GameState, action: Action) -> None:
    p = state.players[action.player]
    cards = list(action.args["cards"])
    if len(cards) != state.prompt.args["count"]:
        raise IllegalAction("discard the required number of cards")
    for c in cards:
        if c not in p.hand:
            raise IllegalAction(f"{c} is not in hand")
        p.hand.remove(c)
        state.main_discard.append(c)
    _end_turn(state)


WAVE_SPONSORS = {"S266", "S270", "S277", "S279"}       # Marine Worlds sponsors with a Wave icon (the card data only has it on animals; found in the logs)


def is_wave(key: str) -> bool:
    return bool(data.cards_by_key()[key].get("wave")) or key in WAVE_SPONSORS


def _refill_display(state: GameState) -> None:
    """Close the gaps (cards move towards slot 1) and add new cards at the end. Marine Worlds: every Wave card that is revealed removes the
    leftmost card of the display (to the discard pile), and the display is refilled again."""
    while True:
        cards = [c for c in state.display if c]
        missing = DISPLAY_SIZE - len(cards)
        if missing > len(state.main_deck):
            raise NotImplementedError("the deck would run out (reshuffling the discard pile is not implemented yet)")
        new = [state.main_deck.pop(0) for _ in range(missing)]
        cards += new
        waves = sum(1 for k in new if is_wave(k))
        if waves:
            for gone in cards[:waves]:
                marks.discard(state, gone)
            cards = cards[waves:]
        state.display = cards + [None] * (DISPLAY_SIZE - len(cards))
        if not waves:
            state.display = cards
            return


def _end_turn(state: GameState) -> None:
    """Action finished: conservation thresholds reached are resolved first, then (Multiplier tokens left on the card: the action may be done
    once more) the used card goes to slot 1 (the cards below move up), the display is refilled, the turn passes."""
    ca = state.current_action
    seat = ca["seat"]
    if _open_effects(state, seat, [], {"kind": "end", "seat": seat, "again": True}):
        return
    owner = state.players[ca.get("owner", seat)]
    card = next(c for c in owner.action_cards if c.type == ca["type"])
    after = ca.get("after") or []
    extra = ca.get("extra")
    if not ca.get("hypnosis") and not ca.get("skipped") and "Multiplier" in card.tokens:
        state.current_action = None
        state.prompt = Prompt(kind="choose_action_card", player=seat, args={
            "only": [card.type], "optional": True, "repeat": True, "type": card.type, "carry": {"after": after, "extra": extra}})
        return
    _complete(state, seat, owner, card.type, after, extra)


def _complete(state: GameState, seat: int, owner, card_type: str, after: list, extra) -> None:
    i = next(i for i, c in enumerate(owner.action_cards) if c.type == card_type)
    if state.current_action is not None and state.current_action.get("hypnosis"):
        venom.remove_tokens(owner, owner.action_cards[i], owner_paid=False)            # the Venom / Constriction tokens of the hypnotised card go at the end
    owner.action_cards = [owner.action_cards[i]] + owner.action_cards[:i] + owner.action_cards[i + 1:]
    state.current_action = None
    if after:                                        # effects that wait for the end of the action (Expert on Africa, marks)
        effects.open_prompt(state, seat, after, {"kind": "end", "seat": seat, "extra": extra})
        return
    _after_action(state, seat, extra)


def _after_action(state: GameState, seat: int, extra) -> None:
    """Determination / Action: X of an animal: a second action of another (or the named) action card before the turn ends; Hypnosis: an
    action card of the other player."""
    if extra and extra.get("hypnosis"):
        state.prompt = Prompt(kind="choose_action_card", player=seat, args={"hypnosis": True, "optional": True})
        return
    if extra:
        state.prompt = Prompt(kind="choose_action_card", player=seat, args={"only": list(extra["types"]), "optional": bool(extra["optional"]),
                                                                                        "determination": not extra["optional"]})
        return
    _finish_turn(state, seat)


def _skip_extra(state: GameState, action: Action) -> None:
    args = state.prompt.args
    if not args.get("optional") and not args.get("determination"):
        raise IllegalAction("the second action is not optional")
    if args.get("repeat"):                                       # no more Multiplier repetitions: the action is over
        p = state.players[action.player]
        carry = args.get("carry") or {}
        _complete(state, p.seat, p, args["type"], carry.get("after") or [], carry.get("extra"))
        return
    _finish_turn(state, action.player)


def _finish_turn(state: GameState, seat: int) -> None:
    venom.finish_turn(state, seat)
    _refill_display(state)
    state.turn += 1
    state.active_player = 1 - seat
    endgame.check_trigger(state, [seat, 1 - seat], True, 1 - seat)
    if endgame.last_turn_done(state, seat):                       # no break after the last turn
        _end_game(state)
        return
    if state.break_position >= BREAK_AT:
        breaks.start(state, seat)
        return
    state.prompt = Prompt(kind="choose_action_card", player=state.active_player)


def _end_game(state: GameState) -> None:
    """The last turn is over: the endgame cards are discarded down to one (when nobody reached 10 conservation), then the final scoring."""
    state.phase = Phase.SCORING
    state.current_action = None
    if not state.endgame_discard_done:
        state.endgame_discard_done = True
        pending = [{"kind": "endgame_discard", "player": p.seat, "optional": False} for p in state.players if len(p.endgame_hand) > 1]
        if pending:
            effects.open_prompt(state, pending[0]["player"], pending, {"kind": "final_scoring"})
            return
    _score_game(state)


def _score_game(state: GameState) -> None:
    endgame.final_scoring(state)
    endgame.finish(state)


_TURN_HANDLERS = {
    ("choose_action_card", "choose_action_card"): _choose_action_card,
    ("choose_action_card", "skip_action"): _skip_action,
    ("choose_action_card", "skip_extra"): _skip_extra,
    ("cards_take", "take_cards"): _take_cards,
    ("build_place", "place_building"): _place_building,
    ("build_place", "finish_build"): _finish_build,
    ("cards_discard", "discard_cards"): _discard_for_cards,
    ("sponsors_play", "play_sponsor"): _play_sponsor,
    ("sponsors_play", "finish_sponsors"): _finish_sponsors,
    ("sponsors_play", "sponsor_side"): lambda st, act: sponsor_variants.apply(st, act),
    ("sponsors_play", "sponsor_break"): _sponsor_break,
    ("animals_play", "play_animal"): lambda st, act: animals_action.play(st, act),
    ("animals_play", "animals_single"): lambda st, act: animals_action.choose_single(st, act),
    ("animals_play", "finish_animals"): lambda st, act: animals_action.finish(st, act),
    ("association_tasks", "association_task"): lambda st, act: association.do_task(st, act),
    ("association_tasks", "choose_slot"): lambda st, act: association.choose_slot(st, act),
    ("association_tasks", "choose_bonus"): lambda st, act: association.choose_bonus(st, act),
    ("association_tasks", "donate"): lambda st, act: association.donate(st, act),
    ("association_tasks", "finish_association"): lambda st, act: association.finish(st, act),
    ("association_tasks", "self_clever"): lambda st, act: association.self_clever(st, act),
    ("association_tasks", "take_instead"): lambda st, act: association.take_instead(st, act),
    ("effects", "place_building"): lambda st, act: effects.resolve_build(st, act),
    ("effects", "take_cards"): lambda st, act: effects.resolve_take(st, act),
    ("effects", "choose_effect"): lambda st, act: effects.resolve_choice(st, act),
    ("effects", "skip_effect"): lambda st, act: effects.skip(st, act),
}


def _initial_discard(state: GameState, action: Action) -> None:
    p = state.players[action.player]
    cards = list(action.args["cards"])
    if not p.initial_offer:
        raise IllegalAction("this player has already discarded")
    if len(cards) != INITIAL_DISCARD or len(set(cards)) != INITIAL_DISCARD or not set(cards) <= set(p.initial_offer):
        raise IllegalAction(f"discard exactly {INITIAL_DISCARD} of the cards in hand")
    for c in cards:
        p.hand.remove(c)
    state.main_discard.extend(cards)
    p.initial_offer = []
    if all(not q.initial_offer for q in state.players):     # both done: fill the display, first player starts
        state.display = [state.main_deck.pop(0) for _ in range(DISPLAY_SIZE)]
        state.phase = Phase.TURN
        state.active_player = 0
        state.prompt = Prompt(kind="choose_action_card", player=0)
    else:
        waiting = next(q.seat for q in state.players if q.initial_offer)
        state.prompt = Prompt(kind="initial_discard", player=waiting, args={"count": INITIAL_DISCARD})
