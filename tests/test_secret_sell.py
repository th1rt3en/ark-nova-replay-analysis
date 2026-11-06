"""Sunbathed (sold) and pouched cards are private: the other player's log says how many, not which."""
from types import SimpleNamespace as N

from ark_nova.replay import view


def _ev(log: str, n: int):
    return N(type="pDiscardCards", log=log, player="1", args={"cards": [{"id": "A1_X"}] * n, "player_name": "seowy", "bonuses_desc": "4 money"})


def test_sunbathing_is_secret_and_counted():
    one, two = _ev("You sell ${card_names} cards for ${bonuses_desc}", 1), _ev("You sell ${card_names} cards for ${bonuses_desc}", 2)
    assert view._secret(one) and view._secret(two)
    assert view._hidden_text(one) == "You sell 1 card for 4 money"
    assert view._hidden_text(two) == "You sell 2 cards for 4 money"


def test_pouching_is_secret_and_counted():
    one = _ev("You pouch ${card_names} cards for ${bonuses_desc}", 1)
    assert view._secret(one)
    assert view._hidden_text(one) == "You pouch 1 card for 4 money"
