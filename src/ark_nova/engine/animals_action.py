"""The Animals action (rulebook p.11-13), standard action card (variant 0).

Level I plays 1 animal (2 with a strength of at least 5) from the hand; level II plays 1 (2 with a strength of at least 3), from the hand or
from the display within the reputation range (paying the folder number extra), and gains 1 reputation first at a strength of at least 5.
An animal needs: its conditions (icons, partner zoo, upgraded action, ...), its cost (the price minus 3 per continent icon of the animal
that a partner zoo covers) and an enclosure: an empty standard enclosure of at least its size next to enough water / rock spaces, or (if
the card allows it) room in a special enclosure. Then its printed appeal / reputation / conservation points and its ability are gained and
its icons are played into the zoo (triggers of the cards in play).

Animal abilities: only animals whose play is known are implemented (`data/animal_play_effects.json`, from `scripts/infer_animal_effects.py`:
what the logs show for every animal); the others raise NotImplementedError.
"""
import json
from collections import Counter
from functools import lru_cache
from pathlib import Path

from ark_nova import data
from ark_nova.data.map_quirks import base_map_id
from ark_nova.engine import animal_abilities, bonuses, cards_action, map_rules, marks, sponsor_extras
from ark_nova.engine.actions import Action
from ark_nova.engine.board import board, footprint_cells, neighbours
from ark_nova.engine.icons import icon_counts, requirement
from ark_nova.engine.state import GameState

CAPACITY = {"petting-zoo": 3, "reptile-house": 5, "large-bird-aviary": 5, "small-aquarium": 2, "large-aquarium": 5, "underwater-tunnel": 2}
SPECIAL_TYPES = {"Petting Zoo": ("petting-zoo",), "Reptile House": ("reptile-house",), "Large Bird Aviary": ("large-bird-aviary",),
                 "Aquarium": ("small-aquarium", "large-aquarium", "underwater-tunnel")}      # (the Underwater Tunnel of S279 takes sea animals, 2 markers)
CONTINENT_TAGS = {"africa": "Africa", "europe": "Europe", "asia": "Asia", "americas": "Americas", "australia": "Australia"}
_ICON = {"science": "Science", "primate": "Primate", "reptile": "Reptile", "bird": "Bird", "predator": "Predator", "herbivore": "Herbivore",
         "seaAnimal": "SeaAnimal", "americas": "Americas", "africa": "Africa", "europe": "Europe", "asia": "Asia", "australia": "Australia",
         "bear": "Bear", "pet": "Pet"}
PARTNER_DISCOUNT = 3
_EFFECTS = Path(data.__file__).with_name("animal_play_effects.json")


def _g():
    from ark_nova.engine import game
    return game


def _fx():
    from ark_nova.engine import effects
    return effects


@lru_cache(maxsize=None)
def play_effects() -> dict:
    return json.loads(_EFFECTS.read_text()) if _EFFECTS.exists() else {}


def card(key: str) -> dict:
    return data.cards_by_key()[key]


def max_animals(level: int, strength: int, variant: int = 0) -> int:
    return (1 if strength < 5 else 2) if level < 2 else (1 if strength < 3 else 2)


SUPPORTED_ABILITIES = ("Hunter", "Sun Bathing", "Snapping 1", "Snapping 2", "Perception 4", "Clever", "Boost: Association", "Boost: Sponsors",
                       "Boost: Animal", "Boost: Card", "Boost: Building")
_BOOST_TYPE = {"Association": "association", "Sponsors": "sponsors", "Animal": "animals", "Card": "cards", "Building": "build"}


def abilities(key: str) -> list:
    return [(ab["keyword"]["name"], ab.get("value")) for ab in card(key).get("abilities") or []]


def supported(name: str) -> bool:
    return name in SUPPORTED_ABILITIES or animal_abilities.supported(name)


def implemented(key: str) -> bool:
    """Animals without an ability or with abilities implemented here, and those whose play the logs show to be a fixed gain."""
    return not unsupported_abilities(key)


def unsupported_abilities(key: str) -> list:
    return [name for name, _ in abilities(key) + reef_abilities(key) if not supported(name)]


def own_gain(key: str) -> dict:
    e = play_effects().get(key, {})
    return dict(e.get("gain", {})) if e.get("kind") == "fixed" else {}


def reef_abilities(key: str) -> list:
    """The Reef Dweller effect of a sea animal: it triggers whenever another animal is placed in the same aquarium."""
    c = card(key)
    if "reefDwellerEffect" not in c:
        return []
    return [(ab["keyword"]["name"], ab.get("value")) for ab in c["reefDwellerEffect"] or []]


def own_abilities(key: str, b) -> list:
    """What the animal does when it is played: its abilities, and in an aquarium also its own Reef Dweller effect (when that is not the very
    same effect as the ability: the two lists are identical for some cards)."""
    pairs = abilities(key)
    reef = reef_abilities(key)
    if b is not None and b.type in ("small-aquarium", "large-aquarium", "underwater-tunnel") and reef != pairs:
        pairs = pairs + reef
    return pairs


def reef_effects(state, key: str, b) -> list:
    """A Reef Dweller (a sea animal with a Reef Dweller effect) placed in an aquarium makes every other sea animal in the aquariums of the zoo trigger its Reef Dweller
    effect (confirmed by the user: 724827313 T68, a Cowfish in the small aquarium, the new animal in the large one). Sea animals without one (their effect is only an ability) neither trigger nor are triggered (checked on the logs)."""
    if b is None or b.type not in ("small-aquarium", "large-aquarium", "underwater-tunnel") or not reef_abilities(key):
        return []
    out = []
    seat = next(i for i, pl in enumerate(state.players) if b in pl.buildings)
    zoo = [o for bb in state.players[seat].buildings if bb.type in ("small-aquarium", "large-aquarium", "underwater-tunnel") for o in bb.animals]      # (any aquarium of the zoo)
    for other in zoo:
        if other != key:
            pairs = reef_abilities(other)
            if any(not supported(n) for n, _ in pairs):
                raise NotImplementedError(f"the Reef Dweller effect of {other}: {[n for n, _ in pairs if not supported(n)]} (see ISSUES.md)")
            out += ability_effects(state, other, pairs)
    return out


def ability_effects(state, key: str, pairs=None) -> list:
    """Pending effects of the animal's abilities: Hunter X (reveal X, keep an animal), Perception X (reveal X, keep one), Sun Bathing X
    (sell up to X cards), Snapping N (take N cards from the display, any)."""
    out = []
    for name, value in (abilities(key) if pairs is None else pairs):
        if name == "Hunter":
            out.append({"kind": "reveal", "source": key, "x": int(value), "filter": "animal", "optional": False})
        elif name.startswith("Perception"):
            out.append({"kind": "reveal", "source": key, "x": int(name.split()[1]), "filter": "any", "optional": False, "n": int(name.split()[1]) // 2})        # (Perception 4: draw 4, keep 2)
        elif name == "Sun Bathing":
            out.append({"kind": "sell", "source": key, "max": int(value), "optional": True})
        elif name.startswith("Boost: "):        # the X action card goes to slot 1 or slot 5 at the end of the action (player's choice)
            state.current_action.setdefault("after", []).append({"kind": "boost", "type": _BOOST_TYPE[name[7:]], "source": key, "optional": True})
        elif name == "Clever":                  # any action card may go to slot 1 at the end of the action
            state.current_action.setdefault("after", []).append({"kind": "slot1", "source": key, "optional": True})
        elif name.startswith("Snapping"):
            out += [{"kind": "take", "source": key, "snap": True, "optional": True} for _ in range(int(name.split()[1]))]
        elif animal_abilities.supported(name):
            out += animal_abilities.effects_for(state, state.current_action["seat"], key, name, value)
    return out


def is_small(c: dict) -> bool:
    return c["size"] <= 2


def is_large(c: dict) -> bool:
    return c["size"] >= 4


def cost(state: GameState, seat: int, key: str) -> int:
    p = state.players[seat]
    c = card(key)
    mine = Counter(t.type.split("-", 1)[1].lower() for t in p.tokens if t.type.startswith("partner-"))
    price = c["price"] - PARTNER_DISCOUNT * sum(mine[tag] for tag in c.get("tags", []) if tag in CONTINENT_TAGS)
    if "S229" in p.sponsors and is_small(c):                 # Expert in Small Animals
        price -= 3
    if "S230" in p.sponsors and is_large(c):                 # Expert in Large Animals
        price -= 4
    a = state.prompt.args if state.prompt is not None and state.prompt.kind == "animals_play" else {}
    if a.get("variant") == 3 and a.get("level") == 1 and not a.get("played"):     # Discount Animals, level I: the first animal costs 2 less
        price -= 2
    return max(0, price)


def waza_allows(p, c: dict) -> bool:
    """Waza Special Assignment (S227): the kind that was not chosen (small 1-2 / large 4-5) can no longer be played."""
    chosen = p.flags.get("waza")
    cls = sponsor_extras.size_class(c)
    return not chosen or cls is None or cls == ("small" if chosen == sponsor_extras.WAZA_SMALL else "large")


def failed_conditions(state: GameState, seat: int, key: str, level: int) -> list:
    """The conditions of the animal that the zoo does not meet (a missing icon counts once per missing icon)."""
    p = state.players[seat]
    icons = icon_counts(state, seat)
    failed = []
    for req, n in Counter(card(key).get("requirements", [])).items():
        if req == "animalsII":
            missing = 0 if level >= 2 else 1
        elif req == "university":
            missing = 0 if any(t.location.startswith("university_") for t in p.tokens) else 1
        elif req == "Partner Zoo":      # a partner zoo (of any continent) or a university, checked on the logs
            tags = {x for x in card(key).get("tags", []) if x in CONTINENT_TAGS}
            missing = 0 if any(t.type.startswith("partner-") and t.type.split("-", 1)[1].lower() in tags for t in p.tokens) else 1      # (the partner zoo of one of the animal's continents, given by the user; plays without it use Ignore Animals, the map 6 / 6a Research Institute, the token ...)
        elif req in _ICON:
            missing = max(0, n - icons[_ICON[req]])
        else:
            continue
        failed += [req] * missing
    return failed


def conditions_met(state: GameState, seat: int, key: str, level: int) -> bool:
    """Camouflage: an animal played after it in the same action may ignore one of its conditions (one missing icon or other condition)."""
    if not waza_allows(state.players[seat], card(key)):
        return False
    failed = failed_conditions(state, seat, key, level)
    credit = bool(state.current_action and state.current_action.get("camouflage")) or ignore_credit(state) or institute_connected(state.players[seat])          or ("S263" in state.players[seat].sponsors and sponsor_extras.size_class(card(key)) == "large")        # Waza Large Animal Program: a large animal ignores 1 condition
    token = any(t.type == "bonus-ignore-conditions" for t in state.players[seat].tokens)       # (the rock / water of the enclosure still counts)
    return not failed or token or (credit and len(failed) == 1)


def institute_connected(p) -> bool:
    """Maps 6 / 6a: while the Research Institute is connected (a building on its space (0, 11)) each animal played ignores 1 condition."""
    from ark_nova.engine.build_action import footprint, knows_shape
    return base_map_id(p.map_id) in ("6", "6a") and any((0, 11) in footprint(b.type, b.x, b.y, b.rotation) for b in p.buildings if knows_shape(b.type))


def ignore_credit(state) -> bool:
    """Ignore Animals: when the strength allows 2 animals the player may choose, before playing any, to play only 1 and ignore 1 of its conditions."""
    a = state.prompt.args if state.prompt is not None and state.prompt.kind == "animals_play" else {}
    return bool(a.get("single")) and not a["played"]


def can_single(a) -> bool:
    return a.get("variant") == 1 and max_animals(a["level"], a["strength"]) == 2 and not a["played"] and not a.get("single")


def choose_single(state: GameState, action: Action) -> None:
    a = state.prompt.args
    if not can_single(a):
        raise _fx().IllegalEffect("no single animal choice now")
    a["single"] = True


def effective_size(p, b, bd) -> int:
    """Expansion Area (S272): 3-space enclosures on at least 1 border space count as 5-space enclosures."""
    from ark_nova.engine.build_action import footprint
    n = int(b.type[5:])
    cells = footprint(b.type, b.x, b.y, b.rotation)
    if n == 3 and "S272" in p.sponsors and any(c in bd.border for c in cells):
        n = 5
    if base_map_id(p.map_id) in ("2", "2a") and any(g in neighbours(c) for c in cells for g in _gates(p.map_id)):       # maps 2 / 2a: each standard enclosure next to the gate has +2 capacity (the logs show it on both)
        n += 2
    return n


def _gates(map_id: str) -> list:
    return [(s["x"], s["y"]) for s in data.map_by_id(map_id)["geometry"]["special_hexes"] if s["kind"] == "gate"]


def _around(bd, cells) -> set:
    return {n for c in cells for n in neighbours(c) if n not in cells}


def flock_free(state: GameState, seat: int, key: str) -> bool:
    """Flock Animal X: the animal needs no enclosure when the zoo has a herbivore of at least size X (the ability belongs to the animal, not to an enclosure)."""
    from ark_nova.engine import build_action
    p = state.players[seat]
    for name, value in abilities(key):
        if name == "Flock Animal" and (any("herbivore" in card(o).get("tags", []) and (card(o).get("size") or 0) >= int(value) for o in p.animals)
                                       or any(b.animal and "herbivore" in card(b.animal).get("tags", []) and build_action.SIZES.get(b.type, 0) >= int(value) for b in p.buildings)
                                       or (icon_counts(state, seat)["Herbivore"] and any(b.animal and build_action.SIZES.get(b.type, 0) >= int(value) for b in p.buildings))):
            return True        # (the *enclosure* of a herbivore has the size: a small herbivore in a big enclosure counts; a herbivore icon of a university or token counts too: found in the logs)
    return False


def hosts(state: GameState, seat: int, key: str, occupied: bool = False) -> list:
    """[(building, satisfies the water / rock requirements)] of the enclosures that fit the animal: the empty ones (to play it), or the occupied
    ones (to release it: the flipped enclosure is not tied to an animal)."""
    from ark_nova.engine.build_action import footprint, knows_shape
    p = state.players[seat]
    c = card(key)
    bd = board(p.map_id)
    overbuild = "S219" in p.sponsors                          # Diversity Researcher ignores water and rock requirements
    out = []

    covered = {c for b in p.buildings if knows_shape(b.type) and b.type != "underwater-tunnel" for c in footprint(b.type, b.x, b.y, b.rotation)}      # a rock / water hex under a building (Terrain Build) no longer counts; the water under a tunnel still does

    def near_ok(b) -> bool:
        cells = footprint(b.type, b.x, b.y, b.rotation)
        around = _around(bd, set(cells)) - covered
        own_water = sum(bd.terrain.get(n) == "water" for n in cells) if b.type == "underwater-tunnel" else 0         # (the tunnel is built on water: its own spaces count)
        return overbuild or (sum(bd.terrain.get(n) == "water" for n in around) + own_water >= requirement(key, "water", state.config.marine_worlds)
                             and sum(bd.terrain.get(n) == "rock" for n in around) >= requirement(key, "rock", state.config.marine_worlds))

    if c.get("canBeInStandardEnclosure") is not False:
        for b in p.buildings:
            if b.type.startswith("size-") and (b.animal is not None) == occupied and effective_size(p, b, bd) >= c["size"]:
                out.append((b, near_ok(b)))
    for spec in c.get("specialEnclosures") or []:
        pool = spec["type"] == "Aquarium" and not occupied                 # the aquariums of a zoo share their spaces: an animal may take them in several
        free = 0
        if pool:
            aq = [b for b in p.buildings if b.type in SPECIAL_TYPES["Aquarium"]]
            free = sum(CAPACITY[b.type] for b in aq) - sum(_special_size(a) for a in {a for b in aq for a in b.animals})
        for t in SPECIAL_TYPES.get(spec["type"], ()):
            for b in p.buildings:
                if b.type == t and ((bool(b.animals) if occupied else (free >= spec["size"] if pool else
                                                                       CAPACITY[t] - sum(_special_size(a) for a in b.animals) >= spec["size"]))):
                    out.append((b, near_ok(b)))
    return out


def enclosure_options(state: GameState, seat: int, key: str) -> list:
    """[(x, y)] anchors of the buildings the animal can go to."""
    return [(b.x, b.y) for b, ok in hosts(state, seat, key) if ok]


def _special_size(animal_key: str) -> int:
    return max((s["size"] for s in card(animal_key).get("specialEnclosures") or []), default=1)


def _cost_ok(state: GameState, seat: int, key: str, from_display: bool, folder: int) -> bool:
    return cost(state, seat, key) + (folder if from_display else 0) <= state.players[seat].money


def playable(state: GameState, seat: int, level: int) -> list:
    """(card key, from_display, folder) that can be played now."""
    p = state.players[seat]
    out = []
    for k in sorted(set(p.hand)):
        if k.startswith("A") and conditions_met(state, seat, k, level) and _cost_ok(state, seat, k, False, 0) \
                and (enclosure_options(state, seat, k) or flock_free(state, seat, k)):
            out.append((k, False, 0))
    if level >= 2:
        for folder, k in enumerate(state.display[:cards_action.reputation_range(p.reputation)], start=1):
            if k and k.startswith("A") and conditions_met(state, seat, k, level) and _cost_ok(state, seat, k, True, folder) \
                    and (enclosure_options(state, seat, k) or flock_free(state, seat, k)):
                out.append((k, True, folder))
    return out


# ---- the action ------------------------------------------------------------------------------------------------------------------

def open_action(state: GameState, seat: int, level: int, strength: int, variant: int = 0) -> None:
    from ark_nova.engine.state import Prompt
    if level >= 2 and strength >= 5:
        _g()._gain(state, seat, reputation=1)                 # at the very beginning, so that the reputation range is already higher
    args = {"level": level, "strength": strength, "played": [], "variant": variant}
    if variant == 4:                                          # Mark Animals: a mark at the end of the action
        state.current_action.setdefault("after", []).append({"kind": "mark", "source": "animals4", "optional": False})
    from ark_nova.engine import bonuses, effects
    pending = bonuses.drain(state)                            # the reputation of the strength 5 bonus may have reached a track bonus (upgrade ...): resolved first
    if pending:
        effects.open_prompt(state, seat, pending, {"kind": "prompt", "prompt_kind": "animals_play", "args": args})
    else:
        state.prompt = Prompt(kind="animals_play", player=seat, args=args)


def small_extra(p, a) -> bool:
    """Waza Small Animal Program (S228): when only small animals were played, one more small animal from the hand may follow."""
    return ("S228" in p.sponsors and bool(a["played"]) and len(a["played"]) == max_animals(a["level"], a["strength"])
            and all(sponsor_extras.size_class(card(k)) == "small" for k in a["played"]))


def legal(state: GameState, p) -> list:
    a = state.prompt.args
    acts = []
    extra = small_extra(p, a)
    if can_single(a):                                       # Ignore Animals: the choice has to be made before the first animal is played
        acts.append(Action(p.seat, "animals_single", {}))
    if (len(a["played"]) < (1 if a.get("single") else max_animals(a["level"], a["strength"])) and not a.get("capped")) or extra:
        for k, d, folder in playable(state, p.seat, a["level"]):
            if extra and (d or sponsor_extras.size_class(card(k)) != "small"):
                continue
            for x, y in enclosure_options(state, p.seat, k):
                acts.append(Action(p.seat, "play_animal", {"card": k, "from_display": d, "x": x, "y": y}))
            if flock_free(state, p.seat, k):                      # Flock Animal: no enclosure is flipped
                acts.append(Action(p.seat, "play_animal", {"card": k, "from_display": d, "flock": True}))
        for k in sorted(set(p.stored)):                          # map 11: an animal of the storage is played directly (the price is the same)
            if k.startswith("A") and conditions_met(state, p.seat, k, a["level"]) and _cost_ok(state, p.seat, k, False, 0):
                acts += [Action(p.seat, "play_animal", {"card": k, "from_display": False, "x": x, "y": y, "stored": True}) for x, y in enclosure_options(state, p.seat, k)]
                if flock_free(state, p.seat, k):
                    acts.append(Action(p.seat, "play_animal", {"card": k, "from_display": False, "flock": True, "stored": True}))
    if a["played"]:
        acts.append(Action(p.seat, "finish_animals", {}))
    return acts


def play(state: GameState, action: Action) -> None:
    g, fx = _g(), _fx()
    p = state.players[action.player]
    a = state.prompt.args
    if action not in legal(state, p):
        raise fx.IllegalEffect(f"that animal cannot be played now: {action.args}")
    k, from_display = action.args["card"], bool(action.args["from_display"])
    if not implemented(k):
        raise NotImplementedError(f"the play of animal {k} ({card(k)['name']}) is not implemented yet: {unsupported_abilities(k)} (see ISSUES.md)")
    if failed_conditions(state, p.seat, k, a["level"]):
        if ignore_credit(state):
            a["capped"] = True                               # Ignore Animals: that was the only animal of the action
        elif institute_connected(p) and len(failed_conditions(state, p.seat, k, a["level"])) == 1:
            pass                                             # the Research Institute ignores it
        elif "S263" in p.sponsors and sponsor_extras.size_class(card(k)) == "large" and len(failed_conditions(state, p.seat, k, a["level"])) == 1:
            pass                                             # Waza Large Animal Program ignores it
        elif state.current_action.get("camouflage") and len(failed_conditions(state, p.seat, k, a["level"])) == 1:
            state.current_action.pop("camouflage")           # the Camouflage credit is used
        else:                                                # the bonus token that ignores the conditions is used up
            p.tokens.remove(next(t for t in p.tokens if t.type == "bonus-ignore-conditions"))
    c = card(k)
    price = cost(state, p.seat, k)
    if from_display:
        i = state.display.index(k)
        price += i + 1
        state.display[i] = None
        if a.get("variant") == 4 and a["level"] >= 2 and marks.owner(state, k) is not None:      # Mark Animals, level II: 1 reputation for a marked animal
            g._gain(state, p.seat, reputation=1)
        marks.taken(state, k)
    elif action.args.get("stored"):
        p.stored.remove(k)
    else:
        p.hand.remove(k)
    p.money -= price
    b = None if action.args.get("flock") else next(b for b in p.buildings if (b.x, b.y) == (action.args["x"], action.args["y"]))
    if b is None:
        pass                                                  # Flock Animal: it lives with the herd, no enclosure is flipped
    elif b.type.startswith("size-") and b.animal is None:
        b.animal = k
    else:                                                     # special enclosures
        b.animals.append(k)
    p.animals.append(k)
    a["played"].append(k)
    own = own_gain(k)
    waza = p.flags.get("waza")                                # Waza Special Assignment: appeal for every animal of the chosen kind
    if waza and sponsor_extras.size_class(c) == ("small" if waza == sponsor_extras.WAZA_SMALL else "large"):
        g._gain(state, p.seat, appeal=sponsor_extras.WAZA_APPEAL[waza])
    pairs = own_abilities(k, b)
    # the printed appeal, reputation and conservation points are effects of their own, resolved in any order the player likes
    printed = [{"kind": "gain", "source": k, "res": res, "n": n, "optional": False}
               for res, n in (("appeal", (c.get("appeal") or 0) + own.get("appeal", 0)), ("reputation", (c.get("reputation") or 0) + own.get("reputation", 0)),
                              ("conservation", (c.get("conservationPoint") or 0) + own.get("conservation", 0))) if n]
    g._gain(state, p.seat, money=own.get("money", 0), x_tokens=own.get("xtoken", 0))
    if a.get("variant") == 3 and a["level"] >= 2:            # Discount Animals, level II: pay 2 for 1 appeal, once per animal
        printed.append({"kind": "pay_appeal", "source": k, "optional": True})
    if b is not None and b.type.startswith("size-") and state.config.map_known[p.seat]:        # (a map that had to be guessed is not trusted with the tower)
        tower = map_rules.tower_appeal(p, b)                                     # map 1: the Observation Tower (an effect of its own: a Venom of the same animal looks at the appeal before it)
        if tower:
            printed.append({"kind": "gain", "source": "map1", "res": "appeal", "n": tower, "optional": False})
    pending = printed + ability_effects(state, k, pairs) + reef_effects(state, k, b) + fx.fire_icons(state, p.seat, k) + map_rules.continent_effects(state, p, k, b)
    if not g._open_effects(state, p.seat, pending, {"kind": "animals_play", "args": a}):
        after_step(state, p.seat)


def finish(state: GameState, action: Action) -> None:
    if not state.prompt.args["played"]:
        raise _fx().IllegalEffect("play an animal first")
    _end(state, action.player)


def _end(state: GameState, seat: int) -> None:
    """End of the action; Waza Small Animal Program: after only small animals one small animal may be snapped from the display."""
    p = state.players[seat]
    a = state.prompt.args
    if a.get("variant") == 2 and not any(k.startswith("A") for k in p.hand):    # Hunter Animals: no animals left in hand: Hunter 4 (level I) / 6 (level II)
        state.current_action.setdefault("after", []).append({"kind": "reveal", "source": "animals2", "x": 4 if a["level"] == 1 else 6,
                                                              "filter": "animal", "optional": True})
    if "S228" in p.sponsors and a["played"] and all(sponsor_extras.size_class(card(k)) == "small" for k in a["played"]):
        state.current_action.setdefault("after", []).append({"kind": "take", "source": "S228", "snap": True, "small": True, "optional": True})
    _g()._end_turn(state)


def after_step(state: GameState, seat: int) -> None:
    acts = [x for x in legal(state, state.players[seat]) if x.kind != "animals_single"]
    if not acts or all(x.kind == "finish_animals" for x in acts):
        if acts and _g().harbor_ready(state, seat) and any(k.startswith("A") for k in state.players[seat].hand):
            return                                                    # Commercial Harbor: a sale may pay for one more animal, the player ends the action
        _end(state, seat)
