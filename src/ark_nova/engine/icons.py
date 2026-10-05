"""Icon counts of a zoo (what sponsor requirements and many card effects count).

Icons come from the played animals and sponsors (their `tags`), partner zoos (a continent icon each, plus a Partner-Zoo icon), the
universities (Fac / Science) and upgraded action cards (AnimalsII, CardsII, SponsorsII, ...). Names follow BGA's `infos.icons`.
`scripts/check_icons.py` compares the result with that oracle on every log.
"""
from collections import Counter

from ark_nova import data
from ark_nova.engine.state import GameState

_TAG_NAME = {"bird": "Bird", "predator": "Predator", "herbivore": "Herbivore", "bear": "Bear", "reptile": "Reptile", "pet": "Pet",
             "primate": "Primate", "seaAnimal": "SeaAnimal", "africa": "Africa", "europe": "Europe", "asia": "Asia",
             "americas": "Americas", "australia": "Australia", "science": "Science", "rock": "Rock", "water": "Water"}
_FAC_ICON = {"bird": "Bird", "predator": "Predator", "herbivore": "Herbivore", "reptile": "Reptile", "primate": "Primate", "bear": "Bear",
             "marine": "SeaAnimal"}
AQUARIUMS = ("small-aquarium", "large-aquarium")
_LEVEL_II_NAME = {"animals": "AnimalsII", "cards": "CardsII", "sponsors": "SponsorsII", "build": "BuildII", "association": "AssociationII"}


def card_icons(key: str, marine_worlds: bool) -> Counter:
    """The icons one card puts into a zoo."""
    card = data.cards_by_key()[key]
    if marine_worlds:
        card = {**card, **card.get("variants", {}).get("marine_worlds", {})}
    out: Counter = Counter()
    for tag in card.get("tags", []):
        if tag not in ("rock", "water"):        # the icon of the requirement field below already is that icon
            out[_TAG_NAME.get(tag, tag)] += 1
    out["Rock"] += REQUIREMENT_FIX.get(key, {}).get("rock", card.get("rock") or 0)     # the rock / water requirement icons in the upper left count too
    out["Water"] += REQUIREMENT_FIX.get(key, {}).get("water", card.get("water") or 0)
    return out


# rock / water requirements that the card data lacks (found by comparing the icon counts with BGA's on every log)
REQUIREMENT_FIX = {"S251": {"water": 1}, "A482": {"water": 1}}


def requirement(key: str, name: str, marine_worlds: bool = False) -> int:
    """The number of rock / water spaces a card wants next to it (= its rock / water icons); the Marine Worlds reprint of a card may want more
    (Sea Turtle Tank: 1 water space, 2 in Marine Worlds)."""
    card = data.cards_by_key()[key]
    if marine_worlds:
        card = {**card, **card.get("variants", {}).get("marine_worlds", {})}
    return REQUIREMENT_FIX.get(key, {}).get(name, card.get(name) or 0)


# the counters kept in `PlayerState.icons`: continents, the five animal categories, sea animals (Marine Worlds), petting zoo, bear, research, rock, water
TRACKED = ("Africa", "Europe", "Asia", "Americas", "Australia", "Bird", "Predator", "Herbivore", "Primate", "Reptile", "SeaAnimal", "Pet", "Bear",
           "Science", "Rock", "Water")


def sync_icons(state: GameState, seat: int) -> None:
    """Recount the tracked icons of a zoo: played animals and sponsors, partner zoos, universities, aquariums. Released animals drop out of
    `PlayerState.animals`, so their icons disappear with them."""
    counts = icon_counts(state, seat)
    state.players[seat].icons = {k: counts[k] for k in TRACKED}


def sync_all(state: GameState) -> None:
    for seat in range(len(state.players)):
        sync_icons(state, seat)


def icon_counts(state: GameState, seat: int) -> Counter:
    p = state.players[seat]
    out: Counter = Counter()
    for k in list(p.animals) + list(p.rescued) + list(p.sponsors):          # (the animals of the Rescued zone count for their icons, rock and water included)
        out.update(card_icons(k, state.config.marine_worlds))
    for t in p.tokens:
        if t.type.startswith("partner-"):
            out[t.type.split("-", 1)[1]] += 1
            out["Partner-Zoo"] += 1
        elif t.type.startswith("fac-science-"):
            kind = t.type.split("-", 2)[2]
            out["Science"] += 2 if kind == "science" else 1
            if kind in _FAC_ICON:
                out[_FAC_ICON[kind]] += 1
    out["Water"] += sum(1 for b in p.buildings if b.type in AQUARIUMS)       # every aquarium is a water icon (fitted on the logs)
    for c in p.action_cards:
        if c.level >= 2:
            out[_LEVEL_II_NAME[c.type]] += 1
    return out
