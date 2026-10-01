"""Deck-order extraction: which cards left which deck, in which order (see docs/log_format.md, "Deck exits").

`extract_exits(parsed)` lists every exit of the main and endgame decks in time order. `known_order(exits, deck, from_exit)`
turns the exits (from a fork point on) into the deck prefix for `SeedSpec`, placing searched cards by the rule
"first match in deck order, everything else keeps its order". `simulate(order, exits)` replays the exits on such a deck.
"""
from dataclasses import dataclass
from typing import Optional

from ark_nova import data
from ark_nova.engine.cards import Condition, matches
from ark_nova.parser.model import ParsedLog

# pDrawCards `log` templates -> how the cards left the deck
NOT_DECK = ("scavenging", "Horse Whisperer", "Pilfering", "with Assertion", "with Dominance")   # discard pile / opponent hand / unused base projects
SEARCH = ("gaining a new university", "with <${type}>", "for monkey gang", "Map 8 effect", "Waza Special")
TOP = ("from the deck", "for hunter effect", "for perception effect", "for scuba dive effect", "for sprint effect")



@dataclass
class Exit:
    seq: int                  # global exit number (time order)
    move_index: int           # replay step in which it happened
    deck: str                 # 'main' | 'endgame'
    kind: str                 # 'top' | 'search'
    cards: list[str]          # card keys (A414, ...), in order
    condition: Optional[Condition] = None
    source: str = ""          # the log template, for debugging
    player: Optional[str] = None
    first_state: int = 0      # `state` of the first card (a global counter during the initial deal)


class UnclassifiedDraw(Exception):
    pass


def _tag_of(type_arg: str) -> str:
    return {"SEAANIMAL": "seaAnimal"}.get(type_arg, type_arg.lower())


def _condition(template: str, args: dict) -> Condition:
    if "Map 8 effect" in template:
        return ("sponsor", None)
    if "Waza Special" in template:
        return ("animal", None)
    t = args.get("type")
    if t == "SPONSOR-PERSON":
        return ("person", None)
    if t:
        return ("tag", _tag_of(t))
    raise UnclassifiedDraw(template)


def _keys(cards: list[dict]) -> list[str]:
    return [data.parse_bga_card_id(c["id"])[0] for c in cards]


def classify_draw(e) -> tuple[str, Optional[Condition]]:
    """How the cards of a `pDrawCards` event left their source: 'scoring' (endgame deck), 'top' / 'search' (main deck),
    'discard' (scavenging, Horse Whisperer), 'opponent' (Pilfering), 'unused_project' (Assertion, Dominance)."""
    a = e.args
    if a.get("scoringCard"):
        return "scoring", None
    if "scavenging" in e.log or "Horse Whisperer" in e.log:
        return "discard", None
    if "Pilfering" in e.log:
        return "opponent", None
    if "with Assertion" in e.log or "with Dominance" in e.log:
        return "unused_project", None
    if any(s in e.log for s in SEARCH):
        return "search", _condition(e.log, a)
    if any(s in e.log for s in TOP):
        return "top", None
    raise UnclassifiedDraw(e.log)


def extract_exits(parsed: ParsedLog) -> list[Exit]:
    exits: list[Exit] = []
    dealt = False
    for mv in parsed.moves:
        first = len(exits)
        for e in mv.events:
            a = e.args
            if not isinstance(a, dict):
                continue
            if e.type == "fillPool":
                exits.append(Exit(len(exits), mv.index, "main", "top", _keys(a.get("cards", [])), None, e.log))
            elif e.type == "pDrawCards":
                cards = a.get("cards", [])
                if not cards:
                    continue
                kind, cond = classify_draw(e)
                if kind == "scoring":
                    exits.append(Exit(len(exits), mv.index, "endgame", "top", _keys(cards), None, e.log, e.player, cards[0].get("state", 0)))
                elif kind in ("top", "search"):
                    exits.append(Exit(len(exits), mv.index, "main", kind, _keys(cards), cond, e.log, e.player, cards[0].get("state", 0)))
        if not dealt and len(exits) > first:      # the first move with deck exits is the initial deal
            _order_initial_deal(exits, first)
            dealt = True
    return exits


def _order_initial_deal(exits: list[Exit], first: int) -> None:
    """Put the exits of the initial-deal move in their true order: the private packets come in arbitrary player order, but the
    card `state` counter gives the deal order (first player 1-8, second player 9-16; endgame 1-2 / 3-4), and start-of-game
    searches (Map 14 person sponsor) happen after both hands are dealt, first player first (also by `state`)."""
    move = exits[first:]
    move.sort(key=lambda x: (0 if x.kind == "top" else 1, x.first_state))
    exits[first:] = move
    for i, x in enumerate(exits[first:], first):
        x.seq = i


def known_order(exits: list[Exit], deck: str, from_seq: int = 0) -> list[str]:
    """Deck prefix (top first) explaining the exits of `deck` with seq >= from_seq."""
    mine = [x for x in exits if x.deck == deck and x.seq >= from_seq]
    order: list[tuple[str, int]] = []        # (card, seq of the exit that removes it)
    for x in mine:
        if x.kind == "top":
            order += [(c, x.seq) for c in x.cards]
    for x in reversed([x for x in mine if x.kind == "search"]):     # latest search first, so later searched cards are placed
        for card in x.cards:
            at = len(order)
            for i, (c, seq) in enumerate(order):
                if seq > x.seq and matches(x.condition, c):
                    at = i
                    break
            order.insert(at, (card, x.seq))
    cards = [c for c, _ in order]
    if len(set(cards)) != len(cards):
        raise ValueError("a card left the deck twice")
    return cards


def simulate(order: list[str], exits: list[Exit], deck: str, from_seq: int = 0) -> None:
    """Replay the exits on a deck whose top is `order` (top draw / first match). Raises AssertionError on a mismatch."""
    d = list(order)
    for x in exits:
        if x.deck != deck or x.seq < from_seq:
            continue
        if x.kind == "top":
            got, d = d[:len(x.cards)], d[len(x.cards):]
            assert got == x.cards, f"exit {x.seq}: top draw {got} != logged {x.cards}"
        else:
            for card in x.cards:
                first = next((c for c in d if matches(x.condition, c)), None)
                assert first == card, f"exit {x.seq}: first match {first} != logged {card}"
                d.remove(card)
