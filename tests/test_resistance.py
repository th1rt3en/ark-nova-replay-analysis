"""Resistance vs Adapt (owner, 2026-11-25; card text: Resistance "Draw 2 Final Scoring cards. Keep 1 and discard the other.", Adapt "Draw X Final Scoring cards,
then discard X Final Scoring cards."). Resistance only discards one of the two drawn cards: the endgame cards already held are safe. Adapt discards from the
whole endgame hand (held + drawn). Both are the pending effect `adapt` (Resistance with `keep_hand`)."""
import copy

import pytest

from ark_nova.engine import animal_abilities
from ark_nova.engine.actions import Action
from ark_nova.engine.game import IllegalAction, apply, legal_actions, new_game
from ark_nova.engine.state import Phase, Prompt


def _turn_state():
    st = new_game({"game_mode": "random-mirrored", "marine_worlds_flag": True}, ["1", "2"], 5)
    for _ in range(400):
        if st.phase is Phase.TURN:
            return st
        acts = legal_actions(st)
        actor = min(a.player for a in acts)
        st = apply(st, [a for a in acts if a.player == actor][0])
    raise AssertionError("no turn phase reached")


def _with_effect(effect_name: str, value=None):
    st = copy.deepcopy(_turn_state())
    seat = st.active_player
    p = st.players[seat]
    assert p.endgame_hand and len(st.endgame_deck) >= 3
    pending = animal_abilities.effects_of(effect_name, value, "TEST", seat) if hasattr(animal_abilities, "effects_of") else None
    if pending is None:
        pending = [{"kind": "adapt", "source": "TEST", "player": seat, "optional": False, "draw": 2, "n": 1, "keep_hand": True}] if effect_name == "Resistance" else \
                  [{"kind": "adapt", "source": "TEST", "player": seat, "optional": False, "draw": int(value), "n": int(value)}]
    st.prompt = Prompt(kind="effects", player=seat, args={"pending": pending, "resume": {"kind": "end", "seat": seat, "extra": None}})
    return st, seat


def _discards(st, seat):
    return [a for a in legal_actions(st) if a.player == seat and a.kind == "choose_effect" and "discard" in a.args]


def test_resistance_is_built_with_keep_hand():
    src = open(animal_abilities.__file__, encoding="utf8").read()
    assert '"draw": 2, "n": 1, "keep_hand": True' in src


def test_resistance_offers_only_the_drawn_cards_and_keeps_the_held_ones():
    st, seat = _with_effect("Resistance")
    held = list(st.players[seat].endgame_hand)
    drawn = st.endgame_deck[:2]
    acts = _discards(st, seat)
    assert sorted(tuple(a.args["discard"]) for a in acts) == sorted((c,) for c in set(drawn))
    for a in acts:
        new = apply(copy.deepcopy(st), a)
        hand = new.players[seat].endgame_hand
        assert all(c in hand for c in held), "a held endgame card was discarded"
        assert len(hand) == len(held) + 1


def test_resistance_refuses_discarding_a_held_card():
    st, seat = _with_effect("Resistance")
    held = st.players[seat].endgame_hand[0]
    with pytest.raises(IllegalAction):
        apply(copy.deepcopy(st), Action(seat, "choose_effect", {"index": 0, "discard": [held]}))


def test_adapt_may_discard_a_held_card():
    st, seat = _with_effect("Adapt", 2)
    held = st.players[seat].endgame_hand[0]
    acts = [a for a in _discards(st, seat) if held in a.args["discard"]]
    assert acts, "Adapt must allow discarding a card already held"
    new = apply(copy.deepcopy(st), acts[0])
    assert held not in new.players[seat].endgame_hand
