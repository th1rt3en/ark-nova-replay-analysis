"""Effects of a conservation project that is being supported (rules given by the user, ISSUES.md for what is assumed).

The player picks a project, a slot and a notepad bonus (`association.choose_slot`, `choose_bonus`); then every effect is a pending effect of its
own, resolved in any order: conservation points (always), reputation (some slots), the chosen notepad bonus (`project_bonus`), the effect of
the project type (`release`: release an animal with the project's icon; management plans: Hunter / Posturing / Sunbathing / Digging / Clever,
a Tutor, a Reef activation) and, when the card was just added to the projects, its place bonus. A card added from the hand or the display also
gives 1 reputation (done at once, "adding a new conservation project").
"""
from ark_nova import data
from ark_nova.engine import animal_abilities, bonuses
from ark_nova.engine.actions import Action
from ark_nova.engine.icons import _TAG_NAME, card_icons, icon_counts

KINDS = ("project_bonus", "release", "tutor", "reef")


def _fx():
    from ark_nova.engine import effects
    return effects


def tag_icon(tag: str) -> str:
    return _TAG_NAME.get(tag, tag)


RELEASE_SIZES = {0: (4, 5), 1: (3, 3), 2: (1, 2)}      # the size of the animal each slot of a Release project takes (BGA's `animalIds`, 108 lists)


def releasable(state, seat: int, tag: str, slot: int = None) -> list:
    """Animals of the zoo that carry the icon (Release projects), those of the size the slot asks for when `slot` is given."""
    p = state.players[seat]
    icon = tag_icon(tag)
    out = set(k for k in p.animals if card_icons(k, state.config.marine_worlds)[icon] > 0)
    if slot is not None:
        lo, hi = RELEASE_SIZES[slot]
        out = {k for k in out if lo <= data.cards_by_key()[k]["size"] <= hi}
    return sorted(out)


def keyword_effects(state, seat: int, source: str, b: dict) -> list:
    """The pending effects of a project bonus entry (`Keyword`, `Tutor`, `Activate Reef`, `Reputation` of the place bonuses)."""
    icons = icon_counts(state, seat)
    t = b["bonusType"]
    if t == "Tutor":
        return [{"kind": "tutor", "source": source, "tag": b["tag"], "optional": False}]
    if t == "Activate Reef":                      # every Reef Dweller effect of the animals of one aquarium (logs: 801082957 turn 37)
        return [{"kind": "reef", "source": source, "optional": False}]
    if t == "Reputation":
        per = b.get("per")
        n = b["bonusValue"] * (icons[tag_icon(per["tag"])] // per["every"] if per else 1)
        return [{"kind": "gain", "source": source, "res": "reputation", "n": n, "optional": False}] if n else []
    if t != "Keyword":
        return []
    name, per = b["keyword"], b.get("per")
    value = b.get("bonusValue", 1)
    if name == "hunter":
        n = icons[tag_icon(per["tag"])] // per["every"] if per else value
        return [{"kind": "reveal", "source": source, "x": n, "filter": "animal", "optional": False}] if n else []
    if name == "posturing":
        return animal_abilities._build(source, ("kiosk", "pavilion"), value)
    if name == "sunbathing":
        return [{"kind": "sell", "source": source, "max": value, "optional": True}]
    if name == "digging":
        return [{"kind": "digging", "source": source, "n": value, "optional": True}]
    if name == "clever":
        state.current_action.setdefault("after", []).append({"kind": "slot1", "source": source, "optional": True})
        return []
    raise NotImplementedError(f"project effect {name!r}")


def place_effects(state, seat: int, key: str, card: dict) -> list:
    """The place bonus of a card that was just added to the projects. The card data lacks the 1 reputation of the release projects (BGA's
    "adding a new conservation project"); the management plans have their own (a keyword, P138 1 reputation)."""
    out = []
    if card["type"] == "Release":
        out.append({"kind": "gain", "source": key, "res": "reputation", "n": 1, "optional": False})
    for b in card.get("placeBonuses") or []:
        out += keyword_effects(state, seat, key, b)
    return out


def slot_effects(state, seat: int, key: str, card: dict, slot: int, bonus) -> list:
    """Every effect of supporting `key` on `slot` with the notepad bonus `bonus` (a {type: value} dict or None)."""
    s = card["slots"][slot]
    cons = sum(x["bonusValue"] for x in s["bonuses"] if x["bonusType"] == "Conservation Point")
    out = [{"kind": "gain", "source": key, "res": "conservation", "n": cons, "optional": False}]
    for b in s["bonuses"]:
        if b["bonusType"] != "Conservation Point":
            out += keyword_effects(state, seat, key, b)
    if bonus is not None:
        out.append({"kind": "project_bonus", "source": key, "bonus": bonus, "optional": False})
    if card["type"] == "Release":
        out.append({"kind": "release", "source": key, "tag": card["tag"], "slot": slot, "optional": False})
        if "S224" in state.players[seat].sponsors:                       # Migration Recording: 1 more conservation for every Release project
            out.append({"kind": "gain", "source": "S224", "res": "conservation", "n": 1, "optional": False})
    return out


def legal(state, e: dict, i: int, seat: int) -> list:
    k = e["kind"]
    if k == "project_bonus":
        return [Action(seat, "choose_effect", {"index": i, "apply": "project_bonus"})]
    if k == "release":
        out = []
        for a in releasable(state, seat, e["tag"], e["slot"]):
            where = release_enclosures(state, seat, a)
            out += [Action(seat, "choose_effect", {"index": i, "release": a, "building": [b.x, b.y]}) for b in where] or [Action(seat, "choose_effect", {"index": i, "release": a})]
        return out
    if k == "tutor":
        return [Action(seat, "choose_effect", {"index": i, "apply": "tutor"})]
    if k == "reef":
        return [Action(seat, "choose_effect", {"index": i, "building": [b.x, b.y]}) for b in _reef_aquariums(state, seat)]
    return []


def _reef_aquariums(state, seat: int) -> list:
    from ark_nova.engine import animals_action
    return [b for b in state.players[seat].buildings if b.type in ("small-aquarium", "large-aquarium")
            and any(animals_action.reef_abilities(k) for k in b.animals)]


def release_enclosures(state, seat: int, key: str) -> list:
    """The occupied enclosures that the release of this animal can empty (an animal is not tied to an enclosure; the flipped one is chosen by
    priority): a special enclosure that meets the water / rock needs, the smallest standard one that does, a special one that does not, the
    smallest standard one that does not. Empty list: no enclosure is emptied (they are all too small)."""
    from ark_nova.engine import animals_action
    from ark_nova.engine.board import board
    p = state.players[seat]
    bd = board(p.map_id)
    cands = animals_action.hosts(state, seat, key, occupied=True)
    for want in (True, False):
        special = [b for b, ok in cands if ok == want and not b.type.startswith("size-")]
        if special:
            return special
        standard = [b for b, ok in cands if ok == want and b.type.startswith("size-")]
        if standard:
            least = min(animals_action.effective_size(p, b, bd) for b in standard)
            return [b for b in standard if animals_action.effective_size(p, b, bd) == least]
    return []


def release_animal(state, seat: int, key: str, building=None) -> None:
    """The animal leaves the zoo for good: the chosen enclosure is empty, its appeal is lost, the card goes to the discard pile."""
    p = state.players[seat]
    p.animals.remove(key)
    b = next((b for b in p.buildings if building is not None and [b.x, b.y] == list(building)), None)
    if b is not None:
        if b.type.startswith("size-"):
            b.animal = None
        elif key in b.animals:
            b.animals.remove(key)
        elif b.animals:
            b.animals.pop(0)
    p.released.append(key)
    state.main_discard.append(key)
    p.appeal -= data.cards_by_key()[key].get("appeal") or 0


def resolve(state, action: Action, e: dict, i: int) -> None:
    p = state.players[action.player]
    k, a = e["kind"], action.args
    if k == "project_bonus":
        bonuses.apply_bonus(state, p.seat, e["bonus"])
    elif k == "release":
        if a.get("release") not in releasable(state, p.seat, e["tag"], e["slot"]):
            raise _fx().IllegalEffect("release an animal with the icon of the project and the size of the slot")
        where = release_enclosures(state, p.seat, a["release"])
        if where and list(a.get("building") or []) not in [[b.x, b.y] for b in where]:
            raise _fx().IllegalEffect("empty one of the enclosures with the highest priority")
        release_animal(state, p.seat, a["release"], a.get("building"))
    elif k == "reef":
        from ark_nova.engine import animals_action
        b = next((b for b in _reef_aquariums(state, p.seat) if [b.x, b.y] == list(a.get("building") or [])), None)
        if b is None:
            raise _fx().IllegalEffect("choose an aquarium with Reef Dwellers")
        extra = []
        for other in b.animals:
            pairs = animals_action.reef_abilities(other)
            if pairs:
                extra += animals_action.ability_effects(state, other, pairs)
        state.prompt.args["pending"][i + 1:i + 1] = extra
    elif k == "tutor":
        from ark_nova.engine.cards import search_deck
        found = search_deck(state.main_deck, ("tag", e["tag"]))
        if found:
            p.hand.append(found)
    _fx()._done(state, i)
