"""Card predicates and deck operations shared by the engine and the log parser."""
from typing import Optional

from ark_nova import data

# Search conditions: ("tag", "reptile") | ("sponsor", None) | ("person", None) | ("animal", None) | ("project", None)
Condition = tuple[str, Optional[str]]


def matches(cond: Condition, key: str) -> bool:
    card = data.cards_by_key()[key]
    kind, arg = cond
    if kind == "tag":                       # animals and sponsors carry icon tags (projects do not)
        return card["card_type"] in ("animal", "sponsor") and arg in card.get("tags", [])
    if kind == "sponsor":
        return card["card_type"] == "sponsor"
    if kind == "person":
        return card["card_type"] == "sponsor" and card.get("type") == "HUMAN"
    if kind == "animal":
        return card["card_type"] == "animal"
    if kind == "project":
        return card["card_type"] == "project"
    raise ValueError(cond)


def search_deck(deck: list[str], cond: Condition) -> Optional[str]:
    """Remove and return the first card of `deck` (top first) that satisfies `cond`; everything else keeps its order."""
    for i, key in enumerate(deck):
        if matches(cond, key):
            return deck.pop(i)
    return None
