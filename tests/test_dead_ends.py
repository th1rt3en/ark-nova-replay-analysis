"""A game never stops with "no legal action". Dead ends found by playing hundreds of games with random and rule-based players of the AI project, and what the engine does now:

- an action card is chosen only when it has a move, or when a free action (the Commercial Harbor sale, a stored card back into the hand, a token of the notepad) can lead to one;
- when only free actions are left at the prompt of an action (they were used up without making a move) the action can be ended, as at the table;
- a discard that is owed is never more than the hand holds (a sale or a played sponsor may have used the cards);
- an empty draw pile is reshuffled (tests/test_empty_deck.py).
The games below are played by two seeded random players; they stuck before and reach the end now."""
import copy
import random

import pytest

from ark_nova.engine.game import apply, legal_actions, new_game
from ark_nova.engine.state import Phase

HIDDEN = ("undo_last", "restart_turn")


def _start(seed: int):
    return new_game({"game_mode": "random-mirrored", "marine_worlds_flag": True}, ["1", "2"], seed), [random.Random(seed), random.Random(seed + 1)]


def _step(st, rnd):
    acts = [a for a in legal_actions(st) if a.kind not in HIDDEN]
    assert acts, f"no legal action at {st.prompt.kind if st.prompt else None} (round {st.round}, turn {st.turn})"
    seat = min(a.player for a in acts)
    mine = [a for a in acts if a.player == seat]
    return apply(st, mine[0] if len(mine) == 1 else mine[rnd[seat].randrange(len(mine))])


def _find(kind: str, seed: int = 11, skip: int = 0):
    """A state of a seeded random game whose prompt is `kind` (the `skip`-th time)."""
    st, rnd = _start(seed)
    for _ in range(4000):
        if st.prompt is not None and st.prompt.kind == kind:
            if skip == 0:
                return st
            skip -= 1
        st = _step(st, rnd)
    raise AssertionError(f"no {kind} prompt in the game")


@pytest.mark.parametrize("seed", [200, 216, 227, 241, 299])
def test_a_random_game_that_used_to_stick_reaches_the_end(seed):
    st, rnd = _start(seed)
    for _ in range(4000):
        if st.phase is Phase.OVER:
            return
        st = _step(st, rnd)
    raise AssertionError("the game did not end")


def test_a_build_action_with_nothing_to_build_can_be_ended():
    st = copy.deepcopy(_find("build_place"))
    seat = st.prompt.player
    st.players[seat].money = 0                                          # nothing can be paid: no placement
    acts = [a for a in legal_actions(st) if a.player == seat]
    assert not any(a.kind == "place_building" for a in acts)
    fin = [a for a in acts if a.kind == "finish_build"]
    assert fin, "the action cannot be ended although nothing can be built"
    new = apply(st, fin[0])
    assert new.prompt is None or new.prompt.kind != "build_place"


def test_a_discard_is_never_more_than_the_hand_holds():
    st = copy.deepcopy(_find("cards_discard", seed=13))
    seat = st.prompt.player
    st.players[seat].hand = []                                          # a sale or a sponsor used the cards that were owed
    acts = [a for a in legal_actions(st) if a.player == seat and a.kind == "discard_cards"]
    assert acts and acts[0].args["cards"] == []
    new = apply(st, acts[0])
    assert new.prompt is None or new.prompt.kind != "cards_discard"


def test_every_legal_move_of_a_reveal_can_be_played_when_the_draw_pile_is_short():
    """Hunter Animals reveals 6 cards and keeps an animal. With fewer than 6 cards left in the draw pile the discard pile is reshuffled under them when the cards are drawn: the options have to be
    listed from the cards that will be on top, not from the short pile (it listed 'keep nothing' for a pile without an animal, and the move was refused once the animals of the discard pile were in)."""
    from ark_nova.engine.state import Prompt
    st = copy.deepcopy(_find("choose_action_card"))
    seat = st.players[0].seat
    animals = [k for k in st.main_deck + st.main_discard + [c for p in st.players for c in p.hand] if k.startswith("A")]
    others = [k for k in st.main_deck + st.main_discard if not k.startswith("A")]
    assert len(animals) >= 30 and len(others) >= 2
    st.players[seat].hand = []
    st.main_deck = others[:2]                                            # no animal among them
    st.main_discard = animals[:30]
    st.prompt = Prompt(kind="effects", player=seat, args={"pending": [{"kind": "reveal", "source": "animals2", "x": 6, "filter": "animal", "optional": True, "cond": "no_animals"}],
                                                          "resume": {"kind": "end", "seat": seat, "extra": None}})
    acts = [a for a in legal_actions(st) if a.player == seat and a.kind in ("choose_effect", "skip_effect")]
    assert acts
    for a in acts:
        apply(copy.deepcopy(st), a)                                      # no legal move may be refused
