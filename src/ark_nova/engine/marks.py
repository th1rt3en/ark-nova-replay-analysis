"""Marks on the animals of the display (Mark ability, Conference on Europe; rules given by the user).

At the end of the action that triggered a mark, the player puts one of their cubes on an animal of the display that has none (if there is
none the effect is skipped; the supply of cubes is endless). A marked animal that would leave the display (replenishing at the break, a Wave
card, Digging, Shark Attack) goes to the hand of the mark's owner instead; a marked animal that any player takes from the display or plays
from it gives the mark's owner 2 money. Either way the cube is gone. A mark is a token of the owner located on the card (`A###_Name`).
"""
import re

from ark_nova import data
from ark_nova.engine.state import Token

MARK_PAYS = 2


def _g():
    from ark_nova.engine import game
    return game


def location(key: str) -> str:
    name = "".join(w.capitalize() for w in re.split(r"[^A-Za-z]+", data.cards_by_key()[key]["name"]) if w)
    return f"{key}_{name}"


def _is_mark(t, key: str) -> bool:
    return t.type == "token" and t.location[:4] == key and t.location[4:5] == "_"


def owner(state, key: str):
    """The seat whose cube is on the card, or None."""
    for p in state.players:
        if any(_is_mark(t, key) for t in p.tokens):
            return p.seat
    return None


def all_marks(state) -> list:
    out = []
    for p in state.players:
        for t in p.tokens:
            if t.type == "token" and re.match(r"A\d{3}_", t.location):
                out.append((p.seat, t.location[:4]))
    return sorted(out)


def place(state, seat: int, key: str) -> None:
    ids = [t.id for p in state.players for t in p.tokens] + [t.id for t in state.board_tokens]
    state.players[seat].tokens.append(Token(max(ids, default=0) + 1, "token", location(key)))


def _remove(state, key: str):
    seat = owner(state, key)
    if seat is not None:
        p = state.players[seat]
        p.tokens = [t for t in p.tokens if not _is_mark(t, key)]
    return seat


def discard(state, key: str) -> None:
    """A card leaves the display: to the discard pile, or to the hand of the owner of its mark."""
    seat = _remove(state, key)
    if seat is None:
        state.main_discard.append(key)
    else:
        state.players[seat].hand.append(key)


def taken(state, key: str) -> None:
    """A card is taken from the display (drawn, snapped, played): its mark pays 2 money to its owner."""
    seat = _remove(state, key)
    if seat is not None:
        _g()._gain(state, seat, money=MARK_PAYS)


def markable(state) -> list:
    return [c for c in dict.fromkeys(state.display) if c and c.startswith("A") and owner(state, c) is None]
