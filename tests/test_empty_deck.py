"""An empty draw pile is reshuffled from the discard pile when cards are drawn (the rule). The Cards action did not offer a deck draw while the draw pile was empty, so a game
that reached that point had no legal action (found by playing long games with the rule bot); the legal moves count the discard pile as cards that can be drawn."""
import copy
import random

from ark_nova.engine.game import apply, legal_actions, new_game
from ark_nova.engine.state import Phase


def _cards_prompt():
    st = new_game({"game_mode": "random-mirrored", "marine_worlds_flag": True}, ["1", "2"], 7)
    rnd = random.Random(7)
    for _ in range(3000):
        if st.prompt is not None and st.prompt.kind == "cards_take":
            return st
        acts = [a for a in legal_actions(st) if a.kind not in ("undo_last", "restart_turn")]
        seat = min(a.player for a in acts)
        mine = [a for a in acts if a.player == seat]
        st = apply(st, mine[0] if len(mine) == 1 else mine[rnd.randrange(len(mine))])
    raise AssertionError("no Cards action in the game")


def test_an_empty_draw_pile_is_reshuffled_when_cards_are_drawn():
    st = copy.deepcopy(_cards_prompt())
    assert st.phase is not Phase.OVER
    st.main_discard = list(st.main_discard) + list(st.main_deck)
    st.main_deck = []                                                   # the draw pile is used up
    total = len(st.main_discard)
    draws = [a for a in legal_actions(st) if a.kind == "take_cards" and a.args.get("mode") == "deck"]
    assert draws, "the Cards action offers no draw from the deck although the discard pile can be reshuffled"
    seat = st.prompt.player
    hand = len(st.players[seat].hand)
    k = draws[-1].args["count"]
    new = apply(st, next(a for a in draws if a.args["count"] == k))
    assert len(new.players[seat].hand) == hand + k
    assert not new.main_discard and len(new.main_deck) == total - k     # the discard pile became the draw pile
