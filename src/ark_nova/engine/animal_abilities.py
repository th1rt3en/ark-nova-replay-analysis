"""Animal abilities (the effects that an animal has when it is played). `effects_for` returns the pending effects of one ability; the
ones with a decision are effect kinds of the prompt `effects` (`KINDS`, resolved with `choose_effect`).

Direct gains: Pack (1 appeal per predator icon), Petting Zoo Animal (3 per pet icon), Iconic Animal (1 per icon of a kind in all zoos, max 8),
Sprint X (draw X), Jumping X (break token X spaces, X money), Inventive (X tokens), Full-throated (hire a worker), Helpful (nothing).
Decisions: Posturing (free kiosks / pavilions), Peacocking (free large bird aviary), Pouch, Digging, Scavenging, Glide, Shark Attack,
Symbiosis, Cut Down, Trade, Extra Shift, Assertion / Dominance / Resistance / Adapt (endgame and base project cards), Scuba Dive,
Monkey Gang, the magnets, Determination and Action: X (a second action after this one), Camouflage, Flock Animal (see animals_action).
Not implemented (rulings unclear, see ISSUES.md): Venom, Constriction, Multiplier, Hypnosis, Pilfering, Mark, Marketing.
"""
from itertools import combinations

from ark_nova import data
from ark_nova.engine import bonuses, build_action, cards_action, marks, tracks, venom
from ark_nova.engine.actions import Action
from ark_nova.engine.icons import card_icons, icon_counts
from ark_nova.engine.rng import Rng

KINDS = ("digging", "scavenge", "glide", "glide_gain", "shark", "symbiosis", "cut_down", "trade", "extra_shift", "assertion", "pilfer", "venom", "constrict", "gain", "ability", "hypnosis", "mark", "marketing", "pay_appeal", "jumping")
SIMPLE = {"Pack", "Petting Zoo Animal", "Iconic Animal", "Sprint", "Jumping", "Inventive", "Inventive: Bear", "Inventive: Primary", "Full-throated",
          "Helpful", "Posturing", "Peacocking", "Pouch", "Digging", "Scavenging", "Glide", "Shark Attack", "Symbiosis", "Cut Down", "Trade",
          "Extra Shift", "Assertion", "Dominance", "Resistance", "Adapt", "Scuba Dive X", "Monkey Gang", "Sea Animal Magnet", "Sponsor Magnet",
          "Determination", "Camouflage", "Flock Animal", "Pilfering 1", "Pilfering 2", "Venom", "Constriction", "Hypnosis", "Mark", "Marketing",
          "Multiplier: Association", "Multiplier: Building", "Multiplier: Card", "Multiplier: Sponsors", "Action: Association", "Action: Building", "Action: Cards", "Action: Sponsors"}
_ACTION_OF = {"Association": "association", "Building": "build", "Cards": "cards", "Sponsors": "sponsors"}
ACTION_TYPES = ("animals", "association", "build", "cards", "sponsors")


def _g():
    from ark_nova.engine import game
    return game


def _fx():
    from ark_nova.engine import effects
    return effects


REEF_ONLY = {"Appeal", "Money", "Reputation", "Conservation Point", "Take Card in Range"}


def supported(name: str) -> bool:
    return name in SIMPLE or name in REEF_ONLY


def card(key: str) -> dict:
    return data.cards_by_key()[key]


def _draw(state, seat: int, n: int) -> None:
    if len(state.main_deck) < n:
        raise NotImplementedError("the deck would run out (reshuffling the discard pile is not implemented yet)")
    state.players[seat].hand += [state.main_deck.pop(0) for _ in range(n)]


def _build(source: str, types, n: int = 1) -> list:
    return [{"kind": "build", "source": source, "type": types[0], "types": list(types), "rules": {"any_level": True}, "optional": True, "double": False}
            for _ in range(n)]


PEACEFUL = {"Venom", "Constriction", "Pilfering 1", "Pilfering 2", "Hypnosis"}


def add_multiplier(state, p, card) -> None:
    """A Multiplier token goes on an action card. One put on the card of the action that is being performed cannot be used in that action (BGA
    signals the token as ready with `enableMultiplier` after the action)."""
    card.tokens.append("Multiplier")
    ca = state.current_action
    if ca is not None and ca.get("seat") == p.seat and ca.get("type") == card.type:
        ca["fresh_multiplier"] = ca.get("fresh_multiplier", 0) + 1


def peaceful_effects(state, seat: int, key: str, name: str, value) -> list:
    """The peaceful variant replaces the hostile abilities (found in the logs: Venom X -> X X tokens, Constriction -> Clever, Pilfering 1 -> 3
    money, Pilfering 2 -> Sprint 2, Hypnosis -> Mark; ISSUES.md)."""
    if name == "Venom":
        return [{"kind": "gain", "source": key, "res": "xtoken", "n": int(value or 1), "optional": False}]
    if name == "Constriction":
        state.current_action.setdefault("after", []).append({"kind": "slot1", "source": key, "optional": True})
    elif name == "Pilfering 1":
        return [{"kind": "gain", "source": key, "res": "money", "n": 3, "optional": False}]
    elif name == "Pilfering 2":
        return [{"kind": "ability", "name": "Sprint", "value": 2, "source": key, "optional": True}]
    elif name == "Hypnosis":
        state.current_action.setdefault("after", []).append({"kind": "mark", "source": key, "optional": False})
    return []


def effects_for(state, seat: int, key: str, name: str, value) -> list:
    g = _g()
    p = state.players[seat]
    icons = icon_counts(state, seat)
    if state.config.peaceful and name in PEACEFUL:
        return peaceful_effects(state, seat, key, name, value)
    if name == "Pack":
        g._gain(state, seat, appeal=icons["Predator"])
    elif name in ("Appeal", "Money", "Reputation", "Conservation Point"):        # Reef Dweller effects
        return [{"kind": "gain", "source": key, "res": {"Appeal": "appeal", "Money": "money", "Reputation": "reputation",
                                                         "Conservation Point": "conservation"}[name], "n": int(value), "optional": False}]
    elif name == "Take Card in Range":
        return [{"kind": "take", "source": key, "range_only": True, "optional": False}]
    elif name == "Petting Zoo Animal":
        g._gain(state, seat, appeal=3 * icons["Pet"])
    elif name == "Iconic Animal":
        both = icon_counts(state, 0) + icon_counts(state, 1)
        icon = next(i for i in icons if i.lower() == str(value).lower()) if any(i.lower() == str(value).lower() for i in icons) else str(value).capitalize()
        g._gain(state, seat, appeal=min(8, both[icon]))
    elif name in DEFERRED:                                        # drawing from the deck is irreversible: the player activates it when Venom is paid
        return [{"kind": "ability", "name": name, "value": value, "source": key, "optional": True}]
    elif name == "Venom":
        return [{"kind": "venom", "source": key, "n": int(value or 1), "optional": True}]
    elif name == "Hypnosis":
        return [{"kind": "hypnosis", "source": key, "optional": True}]
    elif name == "Mark":                                           # at the end of the action
        state.current_action.setdefault("after", []).append({"kind": "mark", "source": key, "optional": False})
    elif name == "Marketing":
        return [{"kind": "marketing", "source": key, "optional": True}]
    elif name.startswith("Multiplier: "):                          # a Multiplier token on the player's own action card of that kind
        kind = _MULTIPLIER_CARD[name[12:]]
        add_multiplier(state, p, next(c for c in p.action_cards if c.type == kind))
    elif name == "Constriction":
        return [{"kind": "constrict", "source": key, "optional": True}]
    elif name == "Sprint":
        _draw(state, seat, int(value))
    elif name == "Jumping":                                       # an effect of its own (the player resolves it): the break token moves X spaces and X money
        return [{"kind": "jumping", "source": key, "n": int(value), "optional": False}]
    elif name == "Inventive":                            # (an effect of its own: a Trade of the same Reef activation may use the token first)
        return [{"kind": "gain", "source": key, "res": "xtoken", "n": 1, "optional": False}]
    elif name == "Inventive: Bear":
        both = icon_counts(state, 0) + icon_counts(state, 1)
        n = min(3, both["Bear"])
        return [{"kind": "gain", "source": key, "res": "xtoken", "n": n, "optional": False}] if n else []
    elif name == "Inventive: Primary":
        n = icons["Primate"]
        n = 3 if n >= 5 else 2 if n >= 3 else 1 if n >= 1 else 0
        return [{"kind": "gain", "source": key, "res": "xtoken", "n": n, "optional": False}] if n else []
    elif name == "Full-throated":
        bonuses.hire_worker(state, seat)
    elif name == "Posturing":
        return _build(key, ("kiosk", "pavilion"), int(value))
    elif name == "Peacocking":
        return _build(key, ("large-bird-aviary",))
    elif name == "Pouch":
        return [{"kind": "pouch", "source": key, "optional": True} for _ in range(int(value))]
    elif name == "Digging":
        return [{"kind": "digging", "source": key, "n": int(value), "optional": True}]
    elif name == "Scavenging":
        rng = Rng(state.rng)
        rng.shuffle(state.main_discard)
        state.rng = rng.state
        drawn = [state.main_discard.pop(0) for _ in range(min(int(value), len(state.main_discard)))]
        return [{"kind": "scavenge", "source": key, "cards": drawn, "optional": not drawn}]
    elif name == "Glide":
        return [{"kind": "glide", "source": key, "max": int(value), "optional": True}]
    elif name == "Shark Attack":
        return [{"kind": "shark", "source": key, "n": int(value), "optional": True}]
    elif name == "Symbiosis":
        return [{"kind": "symbiosis", "source": key, "optional": True}]
    elif name in ("Pilfering 1", "Pilfering 2"):                  # the opponent decides: a card of their hand or 5 money
        opp = state.players[1 - seat]
        targets = [opp.appeal >= p.appeal]                               # the player with the most appeal (a tie counts: unclear, ISSUES.md)
        if name == "Pilfering 2":
            targets.append(opp.conservation >= p.conservation and opp.conservation > 0)           # (a tie at 0 does not count: logs)           # and the player with the most conservation points
        if tracks.is_protected(opp.appeal) or "S225" in opp.sponsors:                              # below 5 appeal a player is protected
            targets = []
        return [{"kind": "pilfer", "source": key, "player": opp.seat, "to": seat, "optional": False} for hit in targets if hit]
    elif name == "Cut Down":
        return [{"kind": "cut_down", "source": key, "optional": True}]
    elif name == "Trade":
        return [{"kind": "trade", "source": key, "optional": True}]
    elif name == "Extra Shift":
        return [{"kind": "extra_shift", "source": key, "optional": True}]
    elif name == "Assertion":
        return [{"kind": "assertion", "source": key, "optional": False}]
    elif name == "Dominance":
        if "P108" in state.base_projects_unused:
            state.base_projects_unused.remove("P108")
            p.hand.append("P108")
    elif name == "Resistance":
        return [{"kind": "adapt", "source": key, "player": seat, "optional": False, "draw": 2, "n": 1}]
    elif name == "Adapt":
        return [{"kind": "adapt", "source": key, "player": seat, "optional": False, "draw": int(value), "n": int(value)}]
    elif name == "Scuba Dive X":
        x = icons["SeaAnimal"] + icons["Reptile"]
        return [{"kind": "reveal", "source": key, "x": x, "filter": "sponsor", "optional": False}] if x else []
    elif name == "Monkey Gang":
        _monkey_gang(state, seat)
    elif name in ("Sea Animal Magnet", "Sponsor Magnet"):
        for i, c in enumerate(state.display):
            if c and ((name == "Sponsor Magnet" and c.startswith("S")) or (name == "Sea Animal Magnet" and _sea_animal(c))):
                state.display[i] = None
                marks.taken(state, c)
                p.hand.append(c)
    elif name == "Determination":
        g.add_extra(state, {"types": [t for t in ACTION_TYPES if t != state.current_action["type"]], "optional": False})
    elif name.startswith("Action: "):
        g.add_extra(state, {"types": [_ACTION_OF[name[8:]]], "optional": True})
    elif name == "Camouflage":
        state.current_action["camouflage"] = True
    return []


DEFERRED = {"Sprint", "Monkey Gang", "Scavenging"}
_MULTIPLIER_CARD = {"Association": "association", "Building": "build", "Card": "cards", "Sponsors": "sponsors"}


def activate(state, seat: int, key: str, name: str, value) -> list:
    """The deferred abilities (the same code as the direct ones)."""
    if name not in DEFERRED:
        return []
    g = _g()
    if name == "Sprint":
        _draw(state, seat, int(value))
    elif name == "Monkey Gang":
        _monkey_gang(state, seat)
    else:
        rng = Rng(state.rng)
        rng.shuffle(state.main_discard)
        state.rng = rng.state
        drawn = [state.main_discard.pop(0) for _ in range(min(int(value), len(state.main_discard)))]
        return [{"kind": "scavenge", "source": key, "cards": drawn, "optional": not drawn}]
    return []


def _sea_animal(key: str) -> bool:
    return key.startswith("A") and "seaAnimal" in card(key).get("tags", [])


def _monkey_gang(state, seat: int) -> None:
    """Reveal cards from the deck until a primate: take it, the others go under the deck in the order they were revealed."""
    tucked = []
    found = None
    while state.main_deck and found is None:
        c = state.main_deck.pop(0)
        if c.startswith("A") and "primate" in card(c).get("tags", []):
            found = c
        else:
            tucked.append(c)
    state.main_deck += tucked
    if found:
        state.players[seat].hand.append(found)


# ---- decisions ---------------------------------------------------------------------------------------------------------------------

def _subsets(items: list, n: int) -> list:
    return [list(c) for k in range(1, n + 1) for c in sorted(set(combinations(sorted(items), k)))]


def legal(state, e: dict, i: int, seat: int) -> list:
    p = state.players[seat]
    k = e["kind"]
    if k == "gain":
        return [Action(seat, "choose_effect", {"index": i, "apply": "gain", "res": e["res"]})]
    if k == "jumping":
        return [Action(seat, "choose_effect", {"index": i, "apply": "jumping"})]
    if k in ("venom", "constrict"):
        return [Action(seat, "choose_effect", {"index": i, "apply": k})]
    if k == "hypnosis":
        return [Action(seat, "choose_effect", {"index": i, "apply": "hypnosis"})]
    if k == "pay_appeal":
        return [Action(seat, "choose_effect", {"index": i, "apply": "pay_appeal"})] if p.money >= 2 else []
    if k == "mark":
        return [Action(seat, "choose_effect", {"index": i, "card": c}) for c in marks.markable(state)]
    if k == "marketing":
        return [Action(seat, "choose_effect", {"index": i, "card": c}) for c in _marketing_options(state, seat, e)]
    if k == "ability":
        return [] if venom.blocked(state, seat) else [Action(seat, "choose_effect", {"index": i, "activate": True})]
    if k == "digging":
        out = [Action(seat, "choose_effect", {"index": i, "display": c}) for c in dict.fromkeys(state.display) if c]
        if state.main_deck and not venom.blocked(state, seat):
            out += [Action(seat, "choose_effect", {"index": i, "hand": c}) for c in sorted(set(p.hand))]
        if e.get("rescue") and len(p.rescued) < RESCUE_SLOTS:       # map 10: an animal (not a petting zoo one) may go to the Rescued zone instead
            out += [Action(seat, "choose_effect", {"index": i, "display": c, "rescue": True}) for c in dict.fromkeys(state.display) if c and rescuable(c)]
            if state.main_deck and not venom.blocked(state, seat):
                out += [Action(seat, "choose_effect", {"index": i, "hand": c, "rescue": True}) for c in sorted(set(p.hand)) if rescuable(c)]
        return out
    if k == "scavenge":
        return [Action(seat, "choose_effect", {"index": i, "keep": c}) for c in dict.fromkeys(e["cards"])]
    if k == "glide":
        return [Action(seat, "choose_effect", {"index": i, "cards": c}) for c in _subsets(p.hand, e["max"])]
    if k == "glide_gain":
        return [Action(seat, "choose_effect", {"index": i, "gain": g}) for g in ("reputation", "appeal", "kiosk")]
    if k == "shark":
        reach = [c for c in state.display[:cards_action.reputation_range(p.reputation)] if c and c.startswith("A")]
        return [Action(seat, "choose_effect", {"index": i, "cards": c}) for c in _subsets(reach, e["n"])]
    if k == "symbiosis":
        from ark_nova.engine import animals_action
        return [Action(seat, "choose_effect", {"index": i, "animal": a, "ability": n}) for a in _symbiosis_targets(p, e["source"])
                for n in dict.fromkeys(n for n, _ in animals_action.abilities(a))]            # (1 ability of 1 other sea animal)
    if k == "cut_down":
        return [Action(seat, "choose_effect", {"index": i, "building": [b.x, b.y]}) for b in p.buildings if _empty_standard(b)]
    if k == "trade":
        out = []
        if p.x_tokens >= 1:
            out.append(Action(seat, "choose_effect", {"index": i, "trade": "money"}))
        if p.money >= 5 and p.x_tokens < 5:
            out.append(Action(seat, "choose_effect", {"index": i, "trade": "xtoken"}))
        return out
    if k == "extra_shift":
        return [Action(seat, "choose_effect", {"index": i, "worker": t.id}) for t in p.tokens if t.type == "worker" and t.location.startswith("association_")]
    if k == "assertion":
        return [Action(seat, "choose_effect", {"index": i, "card": c}) for c in state.base_projects_unused]
    if k == "pilfer":
        out = []
        if p.money < 5 or p.hand:                                 # with 5 money and cards the victim chooses; short of money they must give a card
            out += [Action(seat, "choose_effect", {"index": i, "give": c}) for c in sorted(set(p.hand))]
        if p.money >= 5 or (not p.hand and p.money > 0):          # without cards they pay 5, or what they have left
            out.append(Action(seat, "choose_effect", {"index": i, "pay": True}))
        if not out:                                               # 0 money and no cards: nothing happens
            out.append(Action(seat, "choose_effect", {"index": i, "nothing": True}))
        return out
    return []


RESCUE_SLOTS = 3


def rescuable(key) -> bool:
    """Map 10: an animal card, except the animals of the petting zoo, can be rescued."""
    c = data.cards_by_key().get(key or "")
    return bool(c) and key.startswith("A") and not any(s["type"] == "Petting Zoo" for s in c.get("specialEnclosures") or [])


def _marketing_options(state, seat: int, e=None) -> list:
    """Marketing: a sponsor of the hand that can be played (all requirements) for money equal to its strength."""
    from ark_nova.engine import effects, sponsors_action
    p = state.players[seat]
    level = max((c.level for c in p.action_cards if c.type == "sponsors"), default=1)
    free, person = bool(e and e.get("free")), bool(e and e.get("person"))                # map 14: a person sponsor of the hand for nothing
    return [k for k in sorted(set(p.hand)) if k.startswith("S") and (free or sponsors_action.level_for(state, seat, k) <= p.money)
            and (not person or data.cards_by_key()[k].get("type") == "HUMAN")
            and sponsors_action.requirements_met(state, seat, k, level) and effects.can_play(state, seat, k)
            and not sponsors_action.has_unimplemented_effect(k)]


def _empty_standard(b) -> bool:
    return b.type.startswith("size-") and b.animal is None and not b.animals


def _symbiosis_targets(p, source: str) -> list:
    from ark_nova.engine import animals_action
    out = []
    for a in p.animals:
        if a != source and _sea_animal(a):
            names = [n for n, _ in animals_action.abilities(a)]
            if names and "Symbiosis" not in names and all(supported(n) or animals_action.supported(n) for n in names):
                out.append(a)
    return sorted(out)


def resolve(state, action: Action, e: dict, i: int) -> None:
    fx, g = _fx(), _g()
    p = state.players[action.player]
    a = action.args
    k = e["kind"]
    if k == "hypnosis":
        other = state.players[1 - action.player]
        if other.appeal >= p.appeal and not tracks.is_protected(other.appeal) and "S225" not in other.sponsors:           # the other player is not behind (and not protected): one of their first 3 action cards
            state.current_action["extra"] = {"types": [], "optional": True, "hypnosis": True}
    elif k == "pay_appeal":
        if p.money < 2:
            raise fx.IllegalEffect("not enough money")
        g._gain(state, p.seat, money=-2, appeal=1)
    elif k == "mark":
        if a["card"] not in marks.markable(state):
            raise fx.IllegalEffect("mark an animal of the display that has no mark")
        marks.place(state, action.player, a["card"])
    elif k == "marketing":
        card = a["card"]
        if card not in _marketing_options(state, action.player, e):
            raise fx.IllegalEffect("that sponsor cannot be played with Marketing")
        from ark_nova.engine import sponsors_action
        if not e.get("free"):
            g._gain(state, action.player, money=-sponsors_action.level_for(state, action.player, card))
        if e.get("cube"):                                         # Okapi Stable: the cube is used up
            from ark_nova.engine import association
            loc = association.token_location(e["cube"])
            p.tokens.remove(next(t for t in p.tokens if t.location == loc))
        state.prompt.args["pending"][i + 1:i + 1] = g.play_sponsor_outside_action(state, action.player, card)
    elif k == "jumping":
        g.advance_break(state, action.player, e["n"])
        g._gain(state, action.player, money=e["n"])
    elif k == "venom":
        venom.give_venom(state, action.player, e["n"])
    elif k == "constrict":
        venom.give_constriction(state, action.player)
    elif k == "gain":
        g._gain(state, action.player, **{{"appeal": "appeal", "money": "money", "reputation": "reputation", "conservation": "conservation", "xtoken": "x_tokens"}[e["res"]]: e["n"]})
    elif k == "ability":
        venom.settle(state, action.player)
        state.prompt.args["pending"][i + 1:i + 1] = [{**x, "player": x.get("player", e.get("player", action.player))}
                                                    for x in activate(state, action.player, e["source"], e["name"], e["value"])]
    elif k == "digging":
        rescue = bool(a.get("rescue"))
        if rescue and (not e.get("rescue") or len(p.rescued) >= RESCUE_SLOTS or not rescuable(a.get("display") or a.get("hand"))):
            raise fx.IllegalEffect("only an animal that is not a petting zoo animal can be rescued, and the Rescued zone has 3 places")
        if "display" in a:
            c = a["display"]
            if c not in state.display:
                raise fx.IllegalEffect("that card is not in the display")
            state.display[state.display.index(c)] = None
            if rescue:
                marks.taken(state, c)                           # (taken from the display like a snapped card)
                p.rescued.append(c)
            else:
                marks.discard(state, c)
            g._refill_display(state)
        else:
            c = a["hand"]
            if c not in p.hand or not state.main_deck:
                raise fx.IllegalEffect("cannot discard that card")
            venom.settle(state, p.seat)
            p.hand.remove(c)
            (p.rescued if rescue else state.main_discard).append(c)
            p.hand.append(state.main_deck.pop(0))
        if rescue:                                                # the icons of a rescued animal count and trigger the sponsors
            state.prompt.args["pending"][i + 1:i + 1] = fx.fire_icons(state, p.seat, c)
        e["n"] -= 1
        if e["n"] > 0:
            return
    elif k == "scavenge":
        keep = a["keep"]
        if keep not in e["cards"]:
            raise fx.IllegalEffect("keep one of the cards drawn")
        rest = list(e["cards"])
        rest.remove(keep)
        p.hand.append(keep)
        state.main_discard += rest
    elif k == "glide":
        cards = list(a["cards"])
        if not 1 <= len(cards) <= e["max"] or any(cards.count(c) > p.hand.count(c) for c in cards):
            raise fx.IllegalEffect("discard up to that many cards from the hand")
        n = 0
        for c in cards:
            p.hand.remove(c)
            state.main_discard.append(c)
            n += card_icons(c, state.config.marine_worlds)["SeaAnimal"]
        state.prompt.args["pending"][i + 1:i + 1] = [{"kind": "glide_gain", "source": e["source"], "optional": False} for _ in range(n)]
    elif k == "glide_gain":
        choice = a["gain"]
        if choice == "reputation":
            g._gain(state, p.seat, reputation=1)
        elif choice == "appeal":
            g._gain(state, p.seat, appeal=2)
        elif choice == "kiosk":
            state.prompt.args["pending"][i + 1:i + 1] = _build(e["source"], ("kiosk",))
        else:
            raise fx.IllegalEffect("unknown gain")
    elif k == "shark":
        cards = list(a["cards"])
        reach = state.display[:cards_action.reputation_range(p.reputation)]
        if not 1 <= len(cards) <= e["n"] or any(c not in reach or not c.startswith("A") for c in cards) or len(set(cards)) != len(cards):
            raise fx.IllegalEffect("discard up to that many animals from the display (reputation range)")
        total = 0
        for c in cards:
            state.display[state.display.index(c)] = None
            marks.discard(state, c)
            from ark_nova.engine.association import project
            total += project(c, state.config.marine_worlds).get("appeal") or 0
        g._gain(state, p.seat, appeal=total // 2)                  # half of the sum of the discarded animals' appeal, rounded down (log: 9 + 5 -> 7)
        # (the display is refilled at the end of the action, after the Hunter / Perception effects: the logs' fillPool comes last)
    elif k == "symbiosis":
        from ark_nova.engine import animals_action
        c = a["animal"]
        if c not in _symbiosis_targets(p, e["source"]):
            raise fx.IllegalEffect("that animal has no ability to use")
        pairs = [(n, v) for n, v in animals_action.abilities(c) if n == a.get("ability")]
        if not pairs:
            raise fx.IllegalEffect("that animal has no such ability")
        new = animals_action.ability_effects(state, c, pairs)
        for x in new:
            if x["kind"] == "pouch" and x.get("source") == c:        # (the pouched card goes under the animal that has the Symbiosis, logs)
                x["source"] = e["source"]
        state.prompt.args["pending"][i + 1:i + 1] = new
    elif k == "cut_down":
        b = next((b for b in p.buildings if [b.x, b.y] == list(a["building"]) and _empty_standard(b)), None)
        if b is None:
            raise fx.IllegalEffect("no empty standard enclosure there")
        p.buildings.remove(b)
        g._gain(state, p.seat, money=build_action.cost(b.type))
    elif k == "trade":
        if a["trade"] == "money" and p.x_tokens >= 1:
            g._gain(state, p.seat, x_tokens=-1, money=5)
        elif a["trade"] == "xtoken" and p.money >= 5:
            g._gain(state, p.seat, money=-5, x_tokens=1)
        else:
            raise fx.IllegalEffect("cannot trade that")
    elif k == "extra_shift":
        t = next((t for t in p.tokens if t.id == a["worker"] and t.type == "worker" and t.location.startswith("association_")), None)
        if t is None:
            raise fx.IllegalEffect("no such worker on the association board")
        t.location = "reserve"
    elif k == "pilfer":
        to = state.players[e["to"]]
        if "give" in a and a["give"] in p.hand:
            p.hand.remove(a["give"])
            to.hand.append(a["give"])
        elif a.get("pay") and p.money >= 5 or a.get("pay") and not p.hand and p.money > 0:
            paid = min(5, p.money)
            g._gain(state, p.seat, money=-paid)
            g._gain(state, to.seat, money=paid)
        elif a.get("nothing") and not p.hand and p.money == 0:
            pass
        else:
            raise fx.IllegalEffect("give a card from the hand or pay 5 money")
    elif k == "assertion":
        c = a["card"]
        if c not in state.base_projects_unused:
            raise fx.IllegalEffect("that base project is not unused")
        state.base_projects_unused.remove(c)
        p.hand.append(c)
    fx._done(state, i)
