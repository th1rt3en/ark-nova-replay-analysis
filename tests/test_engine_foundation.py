import pytest

from ark_nova import data
from ark_nova.engine.actions import ACTION_SPECS, Action
from ark_nova.engine.game import deck_cards, initial_state
from ark_nova.engine.rng import Rng, build_deck
from ark_nova.engine.state import GameConfig, GameState, SeedSpec, Token


def test_rng_is_deterministic_and_in_range():
    a, b = Rng(42), Rng(42)
    assert [a.next_u64() for _ in range(5)] == [b.next_u64() for _ in range(5)]
    assert all(0 <= Rng(7).randbelow(6) < 6 for _ in range(50))
    items = list(range(20))
    Rng(1).shuffle(items)
    assert sorted(items) == list(range(20)) and items != list(range(20))


def test_rng_state_resumes():
    r = Rng(9)
    r.next_u64()
    saved = r.state
    nxt = r.next_u64()
    assert Rng(saved).next_u64() == nxt


def test_build_deck_keeps_known_prefix():
    cards = [f"A{n:03d}" for n in range(1, 40)]
    prefix = ["A020", "A005", "A033"]
    d1 = build_deck(cards, prefix, Rng(5))
    d2 = build_deck(list(reversed(cards)), prefix, Rng(5))
    assert d1[:3] == prefix and sorted(d1) == sorted(cards)
    assert d1 == d2                                   # independent of the input order
    assert build_deck(cards, prefix, Rng(6)) != d1    # the tail depends on the seed
    with pytest.raises(ValueError):
        build_deck(cards, ["X999"], Rng(1))


def _config(mw=True):
    base = deck_cards("base_project", mw)
    return GameConfig(marine_worlds=mw, player_ids=["1", "2"], maps=["1", "3a"], base_projects=base[:3])


def test_deck_sizes():
    base = {d: len(deck_cards(d, False)) for d in ("main", "endgame", "base_project")}
    mw = {d: len(deck_cards(d, True)) for d in ("main", "endgame", "base_project")}
    assert base == {"main": 214, "endgame": 11, "base_project": 12}
    assert mw == {"main": 267, "endgame": 17, "base_project": 13}


def test_initial_state_and_json_roundtrip():
    main = deck_cards("main", True)
    seed = SeedSpec(tail_seed=123, main_order=[main[10], main[3]], endgame_order=[deck_cards("endgame", True)[4]])
    s = initial_state(_config(), seed)
    assert s.main_deck[:2] == [main[10], main[3]] and len(s.main_deck) == 267
    assert len(s.base_projects_unused) == 10 and len(s.players[0].action_cards) == 5
    assert [p.appeal for p in s.players] == [0, 1] and [p.money for p in s.players] == [25, 25]
    s.players[1].tokens.append(Token(1, "worker", "supply_1"))
    again = GameState.from_dict(s.to_dict())
    assert again == s
    assert initial_state(_config(), seed).main_deck == s.main_deck     # deterministic


def test_base_projects_validated():
    cfg = _config()
    cfg.base_projects = ["P113", "P101", "P102"]      # P113 is a main-deck project
    with pytest.raises(ValueError):
        initial_state(cfg, SeedSpec())
    cfg = _config(mw=False)
    cfg.base_projects = ["P101", "P102", "P133"]      # P133 needs Marine Worlds
    with pytest.raises(ValueError):
        initial_state(cfg, SeedSpec())


def test_action_roundtrip_and_vocabulary():
    a = Action(0, "choose_action_card", {"type": "build", "x_tokens": 0})
    assert Action.from_dict(a.to_dict()) == a
    with pytest.raises(ValueError):
        Action.from_dict({"player": 0, "kind": "nope", "args": {}})
    assert "buyAnimal" in ACTION_SPECS["play_animal"].log_events


def test_main_deck_contains_only_main_cards():
    for k in deck_cards("main", True):
        assert data.cards_by_key()[k]["deck"] == "main"
