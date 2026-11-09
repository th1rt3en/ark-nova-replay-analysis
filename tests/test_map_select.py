"""The map selection of a new game: game modes, the pool, and what follows (the action card draft in Marine Worlds, else the deal)."""
import pytest

from ark_nova.engine import game, map_select
from ark_nova.engine.actions import Action
from ark_nova.engine.game import IllegalAction, apply, legal_actions, new_game


def test_random_mirrored_is_the_default_and_gives_both_players_the_same_map():
    s = new_game({}, ["a", "b"], tail_seed=3)
    assert s.config.game_mode == "random-mirrored" and s.config.marine_worlds
    assert s.map_select["stage"] == "done" and s.config.maps[0] == s.config.maps[1] == s.players[0].map_id == s.players[1].map_id
    assert s.config.maps[0] in map_select.pool(s.config)
    assert s.prompt.kind == "draft"                                        # Marine Worlds: the action card draft follows the maps


def test_original_deals_two_maps_to_each_player_and_both_pick():
    s = new_game({"game_mode": "original"}, ["a", "b"], tail_seed=4)
    offers = s.map_select["offers"]
    assert s.prompt.kind == "map_select" and len(offers[0]) == len(offers[1]) == 2 and len(set(offers[0] + offers[1])) == 4
    assert {a.args["map"] for a in legal_actions(s) if a.player == 0} == set(offers[0])
    with pytest.raises(IllegalAction):
        apply(s, Action(0, "choose_map", {"map": offers[1][0]}))             # not one of the maps dealt to this player
    s = apply(s, Action(1, "choose_map", {"map": offers[1][1]}))
    assert s.prompt.kind == "map_select" and not [a for a in legal_actions(s) if a.player == 1]      # the other one still has to choose
    s = apply(s, Action(0, "choose_map", {"map": offers[0][0]}))
    assert [p.map_id for p in s.players] == [offers[0][0], offers[1][1]] and s.config.maps == [offers[0][0], offers[1][1]]
    assert s.prompt.kind == "draft"


def test_free_select_offers_the_whole_pool_and_allows_the_same_map():
    s = new_game({"game_mode": "free-select", "marine_worlds_flag": False}, ["a", "b"], tail_seed=5)
    pool = map_select.pool(s.config)
    assert s.map_select["offers"] == [pool, pool]
    s = apply(s, Action(0, "choose_map", {"map": pool[0]}))
    s = apply(s, Action(1, "choose_map", {"map": pool[0]}))
    assert s.config.maps[0] == s.config.maps[1]
    assert s.prompt.kind == "initial_discard" and not s.config.draft_action_cards          # no Marine Worlds: no draft, the cards are dealt


def test_the_pool_is_the_maps_1_to_8_unless_the_options_add_more():
    base = list("12345678")
    s = new_game({"marine_worlds_flag": False}, ["a", "b"], tail_seed=1)
    assert map_select.pool(s.config) == base                                                       # the default: no alternatives, no packs, no beginner maps
    pool = lambda **o: map_select.pool(new_game({"marine_worlds_flag": True, "map_options": o}, ["a", "b"], tail_seed=1).config)
    assert pool(alt="include") == base + [f"{n}a" for n in base]                                    # alternative maps added next to 1-8
    assert pool(alt="replace") == [f"{n}a" for n in base]                                           # ... or in their place
    assert pool(pack1=True) == base + ["9", "10"] and pool(pack2=True) == base + ["11", "12", "13", "14", "T1"]
    assert set(pool(pack1=True, pack2=True, alt="include")) == set(base) | {f"{n}a" for n in base} | {"9", "10", "11", "12", "13", "14", "T1"}
    assert not {"0", "A"} & set(pool(pack1=True, pack2=True, alt="include"))
    nomw = map_select.pool(new_game({"marine_worlds_flag": False, "map_options": {"pack1": True, "pack2": True}}, ["a", "b"], tail_seed=1).config)
    assert nomw == base + ["9", "T1"]                                                              # the Marine Worlds maps 10-14 need a Marine Worlds game
    assert map_select.normalize({"alt": "nonsense", "pack1": 0, "pack2": 1}) == {"pack2": True}


def test_the_pool_leaves_out_excluded_maps():
    s = new_game({"marine_worlds_flag": False, "maps_to_exclude": [3, "3a", "T1"], "map_options": {"pack2": True, "alt": "include"}}, ["a", "b"], tail_seed=1)
    pool = map_select.pool(s.config)
    assert not {"3", "3a", "T1", "10", "11", "12", "13", "14"} & set(pool) and {"1", "8a"} <= set(pool)
    mw = new_game({"maps_to_exclude": ["11"], "map_options": {"pack1": True, "pack2": True}}, ["a", "b"], tail_seed=1)
    assert "11" not in map_select.pool(mw.config) and {"10", "12", "13", "14"} <= set(map_select.pool(mw.config))


def _pick(maps):
    """A free-select game in which each seat chooses the given map (the pool may not offer it: a test of what the map does)."""
    s = new_game({"game_mode": "free-select"}, ["a", "b"], tail_seed=2)
    s.map_select["offers"] = [list(maps), list(maps)]
    return lambda a, b: apply(apply(s, Action(0, "choose_map", {"map": a})), Action(1, "choose_map", {"map": b}))


def test_the_starting_buildings_follow_the_selected_map():
    s = _pick(["13", "1"])("13", "1")
    assert [b.type for b in s.players[0].buildings] == ["size-2"] and s.players[1].buildings == []        # map 13 starts with a free 2-space enclosure


def test_map_a_starts_with_an_idle_enclosure_and_a_kiosk():
    s = _pick(["A", "0"])("A", "0")
    assert [(b.type, b.x, b.y, b.rotation, b.id) for b in s.players[0].buildings] == [("size-3", 0, 9, 0, 1), ("kiosk", 0, 7, 0, 2)]
    assert s.players[1].buildings == []                                    # map 0 has no starting building



def test_bad_options_are_refused():
    with pytest.raises(ValueError):
        new_game({"game_mode": "draft"}, ["a", "b"])
    with pytest.raises(ValueError):
        new_game({"maps": ["1", "1"]}, ["a", "b"])
    with pytest.raises(ValueError):
        new_game({"game_mode": "original", "maps_to_exclude": [m["id"] for m in game.data.maps() if m["id"] not in ("1", "2", "4")]}, ["a", "b"])      # fewer than 4 maps left


def test_a_game_with_its_maps_skips_the_selection():
    s = new_game({}, ["a", "b"], tail_seed=3)
    cfg = s.config
    t = game.start_game(cfg, s.seed)
    assert t.map_select is None and t.prompt.kind == "draft"
