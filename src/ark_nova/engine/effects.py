"""Effects of sponsor cards: what happens when one is played and the passive triggers of the cards in play.

Playing a sponsor (see `sponsors_action`) puts it into the zoo; its icons are 'played into the zoo', which fires the triggers of every
card in play (`card_programs.TRIGGERS`, once per icon). Plain gains apply at once; anything with a decision becomes a pending effect of
the prompt `effects` (`state.prompt.args["pending"]`): free buildings, cards to take, cards revealed, sold or pouched. Mandatory
effects (the sponsor's own building, taking a card) must be resolved, optional ones can be skipped (`skip_effect`). When nothing is
pending the Sponsors action goes on (`resume` holds the previous prompt).
"""
from collections import Counter
from itertools import combinations

from ark_nova import data
from ark_nova.engine import association, animal_abilities, bonuses, marks, project_effects, sponsor_extras, venom, build_action, card_programs as prog, cards_action
from ark_nova.engine.actions import Action
from ark_nova.engine.board import board
from ark_nova.engine.icons import card_icons, icon_counts, requirement


class IllegalEffect(Exception):
    pass


def _g():
    from ark_nova.engine import game          # (game imports this module: resolved lazily)
    return game


def build_rules(card_key: str, marine_worlds: bool = False) -> tuple:
    """(building type, placement rules) of the sponsor that places a building when played."""
    t, extra = prog.UNIQUE_BUILD[card_key]
    card = data.cards_by_key()[card_key]
    rules = dict(extra)
    if requirement(card_key, "rock", marine_worlds):
        rules["rock"] = requirement(card_key, "rock", marine_worlds)
    if requirement(card_key, "water", marine_worlds):
        rules["water"] = requirement(card_key, "water", marine_worlds)
    return t, rules


def _buildings(p) -> list:
    return [(b.type, b.x, b.y, b.rotation) for b in p.buildings]


def build_options(state, seat: int, t: str, rules: dict) -> list:
    p = state.players[seat]
    if t in build_action.UNIQUE and any(b.type == t for b in p.buildings):
        return []
    if t in build_action.AQUARIUMS and not state.config.marine_worlds:
        return []
    level = max((c.level for c in p.action_cards if c.type == "build"), default=1)      # flagged spaces need the upgraded Build action
    if "S219" in p.sponsors:
        rules = {**rules, "overbuild": True}
    return build_action.valid_placements(board(p.map_id), _buildings(p), t, level, rules)


def can_play(state, seat: int, card_key: str) -> bool:
    """A sponsor that places a building can only be played when the building fits."""
    if card_key in prog.UNIQUE_BUILD:
        t, rules = build_rules(card_key, state.config.marine_worlds)
        return not build_action.knows_shape(t) or bool(build_options(state, seat, t, rules))
    return True


def unsupported(card_key: str):
    return prog.UNSUPPORTED_PLAY.get(card_key)


def special_on_play(state, seat: int, key: str, total) -> list:
    return sponsor_extras.special_on_play(state, seat, key, total)


def has_program(card_key: str) -> bool:
    return (card_key in prog.PRINTED_ONLY or card_key in prog.GAIN_PER_ICON or card_key in prog.SCUBA_DIVE
            or card_key in prog.SEARCH_DISCARD_PET or card_key in prog.UNIQUE_BUILD or card_key in prog.TAKE_ONE_CARD
            or card_key in prog.HIRE_WORKER or card_key in prog.DONATION or card_key in prog.SPECIAL_PROGRAMS)


# ---- playing a sponsor ---------------------------------------------------------------------------------------------------

def on_play(state, seat: int, card_key: str) -> list:
    """Own effects and triggers of a sponsor that has just been put into the zoo. Returns the pending effects."""
    g = _g()
    pending: list = []
    total = icon_counts(state, seat)
    if card_key in prog.GAIN_PER_ICON:
        res, icon, mult, *div = prog.GAIN_PER_ICON[card_key]
        g._gain(state, seat, **{"x_tokens" if res == "xtoken" else res: mult * (total[icon] // (div[0] if div else 1))})
    pending += special_on_play(state, seat, card_key, total)
    if card_key in prog.UNIQUE_BUILD:
        t, rules = build_rules(card_key, state.config.marine_worlds)
        if not build_action.knows_shape(t):
            raise NotImplementedError(f"the shape of the {t} building is unknown (see data/unique_shapes.json)")
        pending.append({"kind": "build", "source": card_key, "type": t, "rules": rules, "optional": card_key in prog.OPTIONAL_BUILD,
                        "double": card_key in prog.DOUBLE_PLACEMENT_BONUS})
    if card_key in prog.TAKE_ONE_CARD:
        pending.append({"kind": "take", "source": card_key, "optional": False})
    if card_key in prog.HIRE_WORKER:
        bonuses.hire_worker(state, seat)
    if card_key in prog.DONATION:
        pending.append({"kind": "donation", "source": card_key, "optional": True})
    if card_key in prog.SEARCH_DISCARD_PET and any(_is_pet(k) for k in state.main_discard):
        pending.append({"kind": "search_discard", "source": card_key, "optional": False})
    pending += fire_icons(state, seat, card_key)
    for e in pending:
        e.setdefault("player", seat)                    # (a sponsor played in the break belongs to the player whose income it is)
    return pending


def _is_pet(key: str) -> bool:
    return key.startswith("A") and "pet" in data.cards_by_key()[key].get("tags", [])


def fire_icons(state, seat: int, card_key: str) -> list:
    """Triggers of the cards in play for every icon of the card that was just played into `seat`'s zoo."""
    return fire_icon_counter(state, seat, card_icons(card_key, state.config.marine_worlds))


def fire_icon_counter(state, seat: int, own: Counter) -> list:
    """The same for any icons that have just entered the zoo (a partner zoo or university tile is 'played into the zoo' too)."""
    g = _g()
    total = icon_counts(state, seat)
    before = Counter(total)
    before.subtract(own)
    pending: list = []
    explorer = False
    for owner in (seat, 1 - seat):
        for s in state.players[owner].sponsors:
            for icon, scope, eff in prog.TRIGGERS.get(s, []):
                if scope == "self" and owner != seat:
                    continue
                if eff[0] == "explorer":
                    explorer = owner == seat
                    continue
                for _ in range(own[icon]):
                    if eff[0] == "gain":
                        v = eff[1]
                        g._gain(state, owner, money=v.get("money", 0), appeal=v.get("appeal", 0), x_tokens=v.get("xtoken", 0),
                                reputation=v.get("reputation", 0), conservation=v.get("conservation", 0))
                    elif eff[0] == "build":
                        pending.append({"kind": "build", "source": s, "type": eff[1], "rules": {}, "optional": True, "double": False, "player": owner})
                    elif eff[0] == "reveal":
                        pending.append({"kind": "reveal", "source": s, "x": eff[1], "filter": eff[2] if len(eff) > 2 and isinstance(eff[2], str) else "any", "optional": False, "player": owner})
                    elif eff[0] == "hunter":
                        pending.append({"kind": "reveal", "source": s, "x": total["Predator"], "filter": "animal", "optional": False, "player": owner})
                    elif eff[0] == "sell":
                        pending.append({"kind": "sell", "source": s, "max": eff[1], "optional": True, "player": owner})
                    elif eff[0] == "pouch":
                        pending.append({"kind": "pouch", "source": s, "optional": True, "player": owner})
                    elif eff[0] == "slot1" and state.current_action.get("type") == "break":      # (a sponsor played in the break: at once, free)
                        pending.append({"kind": "slot1", "source": s, "optional": True, "cost": 0, "player": owner})
                    elif eff[0] == "slot1":              # the used action card only goes to slot 1 at the end of the action
                        state.current_action.setdefault("after", []).append({"kind": "slot1", "source": s, "optional": True})
                    elif eff[0] == "mark":                # Conference on Europe: one mark per Europe icon, at the end of the action
                        state.current_action.setdefault("after", []).append({"kind": "mark", "source": s, "optional": False})
                    elif eff[0] == "expedition":
                        pending.append({"kind": "expedition", "source": s, "optional": True, "player": owner})
                    elif eff[0] == "enlarge":
                        pending.append({"kind": "enlarge", "source": s, "optional": True, "player": owner})
                    elif eff[0] == "marketing_cube":                # a cube of the card pays for one Marketing effect (optional)
                        loc = association.token_location(s)
                        left = sum(1 for t in state.players[owner].tokens if t.location == loc) - sum(1 for e in pending if e.get("cube") == s)
                        if left > 0:
                            pending.append({"kind": "marketing", "source": s, "optional": True, "cube": s, "player": owner})
                    elif eff[0] == "unsupported":
                        raise NotImplementedError(eff[1])
    if explorer:
        new = [i for i in prog.EXPLORER_ICONS if own[i] and not before[i]]
        g._gain(state, seat, appeal=len(new), money=2 * len(new))
    return pending


# ---- the prompt `effects` --------------------------------------------------------------------------------------------------

def open_prompt(state, seat: int, pending: list, resume) -> None:
    from ark_nova.engine.state import Prompt
    state.prompt = Prompt(kind="effects", player=seat, args={"pending": pending, "resume": resume})


def legal(state, p0) -> list:
    a = state.prompt.args
    out = []
    resume = a.get("resume") or {}
    if resume.get("kind") == "end" and resume.get("extra") and a["pending"]             and all(e["kind"] in ("slot1", "boost", "mark") for e in a["pending"]):
        out.append(Action(state.prompt.player, "go_extra", {}))        # the extra action first, the Clever / Boost after it
    for i, e in enumerate(a["pending"]):
        k = e["kind"]
        p = state.players[e.get("player", p0.seat)]
        if k in bonuses.KINDS:
            out += bonuses.legal(state, e, i, p.seat)
            continue
        if k in project_effects.KINDS:
            mine = project_effects.legal(state, e, i, p.seat)
            out += mine
            if not mine:
                out.append(Action(p.seat, "skip_effect", {"index": i}))          # nothing to do (no animal to release, no aquarium with Reef Dwellers)
            continue
        if k in sponsor_extras.KINDS:
            out += sponsor_extras.legal(state, e, i, p.seat)
            if e.get("optional"):
                out.append(Action(p.seat, "skip_effect", {"index": i}))
            continue
        if k in animal_abilities.KINDS:
            mine = animal_abilities.legal(state, e, i, p.seat)
            out += mine
            if e.get("optional") or not mine:
                out.append(Action(p.seat, "skip_effect", {"index": i}))
            continue
        if k == "build":
            for t in e.get("types", [e["type"]]):
                for x, y, r in build_options(state, p.seat, t, e["rules"]):
                    out.append(Action(p.seat, "place_building", {"type": t, "x": x, "y": y, "rotation": r}))
        elif k == "take":
            if e.get("snap"):                              # Snapping: any card of the display (Waza Small Animal Program: a small animal)
                out += [Action(p.seat, "take_cards", {"mode": "snap", "card": c}) for c in dict.fromkeys(state.display)
                        if c and (not e.get("small") or _small_animal(c))]
                if None in state.display:                  # Snapping 2: the player may refill the display before the second snap
                    out.append(Action(p.seat, "choose_effect", {"index": i, "refill": True}))
                continue
            if state.main_deck and not venom.blocked(state, p.seat):
                out.append(Action(p.seat, "take_cards", {"mode": "deck", "count": 1}))
            for c in state.display[:cards_action.reputation_range(p.reputation)]:
                if c:
                    out.append(Action(p.seat, "take_cards", {"mode": "range", "card": c}))
            if None in state.display[:cards_action.reputation_range(p.reputation) + 1]:        # the display may be refilled first: the gap closes and a card moves into the range
                out.append(Action(p.seat, "choose_effect", {"index": i, "refill": True}))
        elif k == "reveal" and venom.blocked(state, p.seat):
            out.append(Action(p.seat, "skip_effect", {"index": i}))            # drawing cards is not allowed before Venom is paid
            continue
        elif k == "reveal":
            top = state.main_deck[:e["x"]]
            opts = [c for c in top if _reveal_ok(e, c)]
            if e.get("n", 1) > 1:                                   # Perception 4: 4 cards are drawn, 2 are kept
                out += [Action(p.seat, "choose_effect", {"index": i, "keep": sorted(c)}) for c in sorted(set(combinations(sorted(opts), e["n"])))]
                continue
            for c in dict.fromkeys(opts):
                out.append(Action(p.seat, "choose_effect", {"index": i, "keep": c}))
            if not opts:
                out.append(Action(p.seat, "choose_effect", {"index": i, "keep": None}))
        elif k == "donation":
            from ark_nova.engine import association
            if association.donation_cost(state, p) <= p.money:
                out.append(Action(p.seat, "choose_effect", {"index": i, "donate": True}))
        elif k == "sell":
            hand = sorted(p.hand)
            for n in range(1, e["max"] + 1):
                for c in sorted(set(combinations(hand, n))):
                    out.append(Action(p.seat, "choose_effect", {"index": i, "cards": list(c)}))
        elif k == "pouch":
            for c in sorted(set(p.hand)):
                out.append(Action(p.seat, "choose_effect", {"index": i, "card": c}))
        elif k == "slot1":
            if e.get("cost", 0) <= p.money:                      # Clever cards of level I: 2 money
                for c in p.action_cards:
                    out.append(Action(p.seat, "choose_effect", {"index": i, "type": c.type}))
        elif k == "search_discard":
            for c in sorted(set(state.main_discard)):
                if _is_pet(c):
                    out.append(Action(p.seat, "choose_effect", {"index": i, "card": c}))
        if e.get("optional"):
            out.append(Action(p.seat, "skip_effect", {"index": i}))
    return out


def _small_animal(key: str) -> bool:
    return key.startswith("A") and sponsor_extras.size_class(data.cards_by_key()[key]) == "small"


def _reveal_ok(e, card: str) -> bool:
    if e["filter"] == "animal":
        return card.startswith("A")
    if e["filter"] == "sponsor":
        return card.startswith("S")
    return True


def _find(state, kind: str, match=None) -> int:
    for i, e in enumerate(state.prompt.args["pending"]):
        if e["kind"] == kind and (match is None or match(e)):
            return i
    raise IllegalEffect(f"no matching pending {kind} effect")


def _done(state, i: int) -> None:
    a = state.prompt.args
    seat = a["pending"][i].get("player", state.prompt.player)
    a["pending"].pop(i)
    if not a["pending"]:
        _g()._resume_after_effects(state)
    elif state.current_action is not None and state.current_action.get("type") == "break"             and not any(e.get("player", state.prompt.player) == seat for e in a["pending"]):
        _g()._refill_display(state)                 # break income: BGA refills the display when a player's income is done (before the other player's cards)


def resolve_build(state, action: Action) -> None:
    g = _g()
    p = state.players[action.player]
    t, x, y, k = action.args["type"], int(action.args["x"]), int(action.args["y"]), int(action.args["rotation"])
    def fits(e):
        return t in e.get("types", [e["type"]]) and e.get("player", p.seat) == p.seat and (x, y, k) in build_options(state, p.seat, t, e["rules"])

    try:                                            # a building that was picked up (Reconstruction) goes back before a new one is built
        i = _find(state, "build", lambda e: bool(e.get("placeback")) and fits(e))
    except IllegalEffect:                           # the most specific effect first (a kiosk-only trigger before Posturing's kiosk or pavilion)
        i = min((j for j, e in enumerate(state.prompt.args["pending"]) if e["kind"] == "build" and fits(e)),
                key=lambda j: len(state.prompt.args["pending"][j].get("types", [1])), default=None)
        if i is None:
            raise IllegalEffect("no matching pending build effect")
    e = state.prompt.args["pending"][i]
    if e.get("placeback"):                          # Reconstruction: a building that was picked up goes back on the map (no bonuses)
        from ark_nova.engine.state import Building
        pb = e["placeback"]
        from ark_nova.engine import map_rules
        areas_before = map_rules.quarters_done(p)
        p.buildings.append(Building(id=pb["id"], type=t, x=x, y=y, rotation=k, animal=pb["animal"], animals=list(pb["animals"])))
        for name in sorted(map_rules.quarters_done(p) - areas_before):          # map 13: an area that is covered again pays its bonus again
            map_rules.quarter_bonus(state, p.seat, name)
        _done(state, i)
        return
    g._put_building(state, p.seat, t, x, y, k, double=e["double"])
    if e["source"] in prog.PER_PAVILION_APPEAL:
        g._gain(state, p.seat, appeal=sum(b.type == "pavilion" for b in p.buildings))
    _done(state, i)


def resolve_take(state, action: Action) -> None:
    p = state.players[action.player]
    mode = action.args["mode"]
    i = _find(state, "take", lambda e: bool(e.get("snap")) == (mode == "snap") and e.get("player", p.seat) == p.seat
              and (not e.get("small") or _small_animal(action.args.get("card", ""))))
    if mode == "snap":
        card = action.args["card"]
        if card not in state.display:
            raise IllegalEffect("that card is not in the display")
        state.display[state.display.index(card)] = None
        marks.taken(state, card)
        p.hand.append(card)
    elif mode == "deck":
        if not state.main_deck:
            raise NotImplementedError("the deck would run out (reshuffling the discard pile is not implemented yet)")
        venom.settle(state, p.seat)
        p.hand.append(state.main_deck.pop(0))
    elif mode == "range":
        card = action.args["card"]
        if card not in state.display[:cards_action.reputation_range(p.reputation)]:
            raise IllegalEffect("that card is not within the reputation range")
        state.display[state.display.index(card)] = None
        marks.taken(state, card)
        p.hand.append(card)
    else:
        raise IllegalEffect(f"unknown mode {mode!r}")
    _done(state, i)


def resolve_choice(state, action: Action) -> None:
    g = _g()
    p = state.players[action.player]
    i = int(action.args["index"])
    if not 0 <= i < len(state.prompt.args["pending"]):
        raise IllegalEffect("no such pending effect")
    e = state.prompt.args["pending"][i]
    k = e["kind"]
    if e.get("player", state.prompt.player) != action.player:
        raise IllegalEffect("this effect belongs to the other player")
    if action.args.get("refill") and k == "take" and None in state.display:
        _g()._refill_display(state)
        return
    if k in bonuses.KINDS:
        bonuses.resolve(state, action, e, i)
        return
    if k in project_effects.KINDS:
        project_effects.resolve(state, action, e, i)
        return
    if k in sponsor_extras.KINDS:
        sponsor_extras.resolve(state, action, e, i)
        return
    if k in animal_abilities.KINDS:
        animal_abilities.resolve(state, action, e, i)
        return
    if k == "reveal":
        if len(state.main_deck) < e["x"]:
            raise NotImplementedError("the deck would run out (reshuffling the discard pile is not implemented yet)")
        top = state.main_deck[:e["x"]]
        keep = action.args.get("keep")
        options = [c for c in top if _reveal_ok(e, c)]
        if e.get("n", 1) > 1:
            keep_list = list(keep or [])
            if len(keep_list) != e["n"] or any(keep_list.count(c) > top.count(c) for c in keep_list):
                raise IllegalEffect("keep the right number of the revealed cards")
            venom.settle(state, p.seat)
            del state.main_deck[:e["x"]]
            for c in keep_list:
                top.remove(c)
                p.hand.append(c)
            state.main_discard.extend(top)
            _done(state, i)
            return
        if (keep is None and options) or (keep is not None and keep not in options):
            raise IllegalEffect("keep one of the revealed cards of the right kind")
        venom.settle(state, p.seat)
        del state.main_deck[:e["x"]]
        if keep is not None:
            top.remove(keep)
            p.hand.append(keep)
        state.main_discard.extend(top)
    elif k == "donation":
        from ark_nova.engine import association
        association.make_donation(state, p)
    elif k == "sell":
        cards = list(action.args["cards"])
        if not 1 <= len(cards) <= e["max"] or any(cards.count(c) > p.hand.count(c) for c in cards):
            raise IllegalEffect("cannot sell those cards")
        for c in cards:
            p.hand.remove(c)
        state.main_discard.extend(cards)
        g._gain(state, p.seat, money=prog.sell_price(len(cards)))
    elif k == "pouch":
        c = action.args["card"]
        if c not in p.hand:
            raise IllegalEffect("that card is not in hand")
        p.hand.remove(c)
        if e["source"] == "map":
            p.pouched.append(c)                         # (a Pouch bonus of the map: the card goes under the zoo map)
        else:
            p.under.setdefault(e["source"], []).append(c)
        g._gain(state, p.seat, appeal=prog.POUCH_APPEAL)
    elif k == "slot1":
        if e.get("cost", 0) > p.money:
            raise IllegalEffect("not enough money")
        g._gain(state, p.seat, money=-e.get("cost", 0))
        t = action.args["type"]
        j = next((j for j, c in enumerate(p.action_cards) if c.type == t), None)
        if j is None:
            raise IllegalEffect("no such action card")
        p.action_cards = [p.action_cards[j]] + p.action_cards[:j] + p.action_cards[j + 1:]
    elif k == "search_discard":
        c = action.args["card"]
        if c not in state.main_discard or not _is_pet(c):
            raise IllegalEffect("that card is not a Petting Zoo animal in the discard pile")
        state.main_discard.remove(c)
        p.hand.append(c)
    else:
        raise IllegalEffect(f"{k} effects are not resolved with choose_effect")
    _done(state, i)


def skip(state, action: Action) -> None:
    i = int(action.args["index"])
    if not 0 <= i < len(state.prompt.args["pending"]):
        raise IllegalEffect("no such pending effect")
    e = state.prompt.args["pending"][i]
    if not e.get("optional") and e["kind"] not in bonuses.KINDS and not _nothing_to_do(state, e, i):
        raise IllegalEffect("this effect is mandatory")
    if e["kind"] == "rep_bonus":                        # at 15 reputation: the point is not wasted but pays 1 appeal when the bonus is declined
        _g()._gain(state, state.prompt.args["pending"][i].get("player", state.prompt.player), appeal=1)
    _done(state, i)


def _nothing_to_do(state, e: dict, i: int) -> bool:
    """A mandatory animal ability effect without any legal choice can be skipped."""
    if e["kind"] in project_effects.KINDS:
        return not project_effects.legal(state, e, i, state.prompt.player)
    return e["kind"] in animal_abilities.KINDS and not animal_abilities.legal(state, e, i, state.prompt.player)


def search_for_category(state, seat: int, category: str) -> None:
    """A category university: take the first card of that category from the deck (a search: the other cards keep their order)."""
    from ark_nova.engine.cards import search_deck
    tag = "seaAnimal" if category == "marine" else category
    found = search_deck(state.main_deck, ("tag", tag))
    if found:
        state.players[seat].hand.append(found)
