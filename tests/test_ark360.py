"""Ark360 (engine/ark360.py): the layouts of the placement bonuses, the config file, and the game: the same layout for both players, the cards dealt before the study time and the draft."""
import copy
import json

import pytest

from ark_nova import data
from ark_nova.engine import ark360, map_select
from ark_nova.engine.actions import Action
from ark_nova.engine.board import board, board_of, placement_entries
from ark_nova.engine.build_action import placement_bonuses
from ark_nova.engine.game import IllegalAction, apply, legal_actions, new_game
from ark_nova.engine.map_rules import kiosk_hexes_covered
from ark_nova.engine.rng import Rng
from ark_nova.engine.state import Building, GameState, PlayerState

PLAYABLE = ["1", "1a", "2", "2a", "4", "4a", "5", "5a", "6", "6a", "7", "7a", "9", "10", "11", "12", "13", "14", "T1"]
MARINE_WORLDS = {"10", "11", "12", "13", "14"}


def test_the_config_is_valid_and_names_the_playable_maps():
    ark360.check_config(ark360.config())
    on_offer = [m["id"] for m in data.maps() if m.get("geometry") and ark360.applicable(m["id"])]
    assert sorted(on_offer) == sorted(PLAYABLE)
    for m in ("0", "A", "3", "3a", "8", "8a"):
        assert not ark360.applicable(m)                       # (the maps the mode leaves out: excluded_maps)
    assert ark360.applicable("2a") and ark360.rules("2a")["min_distinct_y"] == 7          # (7 bonuses cannot be on 8 different rows: the map has its own number)
    assert ark360.rules("1")["min_distinct_y"] == 8
    cfg = copy.deepcopy(ark360.config())
    del cfg["map_overrides"]
    assert not ark360.applicable("2a", cfg)                   # without the override the map is out


def test_a_bad_config_is_refused():
    for path, value in ((("layout", "min_distinct_y"), -1), (("layout", "one_hex_apart"), "near"), (("layout", "min_next_to_rock_share"), 1.5),
                        (("layout", "allowed_terrain"), ["lava"]), (("study_seconds",), "five minutes"), (("time_control",), {"start": 600})):
        cfg = copy.deepcopy(ark360.config())
        d = cfg
        for k in path[:-1]:
            d = d[k]
        d[path[-1]] = value
        with pytest.raises(ark360.Ark360Error):
            ark360.check_config(cfg)
    cfg = copy.deepcopy(ark360.config())
    cfg["layout"]["min_border"], cfg["layout"]["max_border"] = 5, 2
    with pytest.raises(ark360.Ark360Error):
        ark360.check_config(cfg)
    for over in ({"min_distinct_z": 3}, {}, {"max_border": -1}, {"one_hex_apart": "near"}):          # (an override names a rule of `layout` and keeps it valid)
        cfg = copy.deepcopy(ark360.config())
        cfg["map_overrides"]["2a"] = over
        with pytest.raises(ark360.Ark360Error):
            ark360.check_config(cfg)


@pytest.mark.parametrize("map_id", PLAYABLE)
def test_every_layout_meets_the_rules_and_keeps_the_bonuses_of_the_map(map_id):
    for seed in range(25):
        layout = ark360.layout_for(map_id, seed)
        assert ark360.check_layout(map_id, layout) == [], (map_id, seed)
    assert ark360.layout_for(map_id, 5) == ark360.layout_for(map_id, 5)                       # reproducible from the seed
    assert len({json.dumps(ark360.layout_for(map_id, s)) for s in range(6)}) > 1             # and different with another one


def test_a_map_can_have_rules_of_its_own():
    cfg = copy.deepcopy(ark360.config())
    cfg["map_overrides"] = {"1": {"max_adjacent_pairs": 0, "min_border": 4, "max_border": 4}}
    layout = ark360.generate("1", Rng(2), cfg)
    m = ark360.measure("1", [(e["x"], e["y"]) for e in layout], cfg)
    assert m["adjacent_pairs"] == 0 and m["border"] == 4                                          # map 1 keeps its own numbers ...
    assert ark360.rules("2", cfg)["max_adjacent_pairs"] == 1                                        # ... the others the common ones
    other = ark360.generate("2", Rng(2), cfg)
    assert ark360.check_layout("2", other, cfg) == []


def test_the_layout_changes_the_places_only():
    p = PlayerState(seat=0, map_id="1", bonus_layout=ark360.layout_for("1", 3))
    plain, laid = board("1"), board_of(p)
    assert laid.terrain == plain.terrain and laid.flags == plain.flags and laid.border == plain.border and laid.cells == plain.cells
    assert laid.bonuses != plain.bonuses
    assert sorted(json.dumps(b, sort_keys=True) for v in laid.bonuses.values() for b in v) == sorted(json.dumps(b, sort_keys=True) for v in plain.bonuses.values() for b in v)
    assert board_of(PlayerState(seat=0, map_id="1")) is plain                                  # no layout: the map's own board, as before


def test_the_rules_count_what_they_say():
    cfg = copy.deepcopy(ark360.config())
    assert ark360.measure("1", [(1, 0), (1, 2)], cfg)["adjacent_pairs"] == 1                   # neighbours
    assert ark360.measure("1", [(1, 0), (1, 4)], cfg)["one_hex_apart_pairs"] == 1              # one hex between them, on a line
    assert ark360.measure("1", [(1, 0), (3, 0)], cfg)["one_hex_apart_pairs"] == 0              # two apart, but not on a line
    cfg["layout"]["one_hex_apart"] = "any"
    assert ark360.measure("1", [(1, 0), (3, 0)], cfg)["one_hex_apart_pairs"] == 1              # ... which "any" counts
    m = ark360.measure("1", [(1, 0), (4, 1), (7, 8)], cfg)
    assert m["x"] == 3 and m["y"] == 3 and m["border"] == sum(1 for c in [(1, 0), (4, 1), (7, 8)] if c in board("1").border)


def test_the_rules_come_from_the_file(monkeypatch):
    cfg = copy.deepcopy(ark360.config())
    cfg["layout"]["min_distinct_y"] = 14                                                         # more rows than the board has
    with pytest.raises(ark360.Ark360Error):
        ark360.generate("1", Rng(1), cfg)
    cfg = copy.deepcopy(ark360.config())
    cfg["layout"]["max_adjacent_pairs"] = 0
    cfg["layout"]["min_border"], cfg["layout"]["max_border"] = 5, 5
    for seed in range(5):
        layout = ark360.generate("1", Rng(seed), cfg)
        m = ark360.measure("1", [(e["x"], e["y"]) for e in layout], cfg)
        assert m["adjacent_pairs"] == 0 and m["border"] == 5                                    # the new numbers are the ones kept


def test_a_layout_that_breaks_a_rule_is_found():
    layout = ark360.layout_for("1", 1)
    assert ark360.check_layout("1", layout) == []
    clumped = copy.deepcopy(layout)
    for e, (x, y) in zip(clumped, [(1, 0), (1, 2), (1, 4), (1, 6), (1, 8), (1, 10), (1, 12), (3, 0), (3, 2)]):
        e["x"], e["y"] = x, y
    assert ark360.check_layout("1", clumped)
    doubled = copy.deepcopy(layout)
    doubled[1]["x"], doubled[1]["y"] = doubled[0]["x"], doubled[0]["y"]
    assert "two bonuses on one hex" in ark360.check_layout("1", doubled)
    changed = copy.deepcopy(layout)
    changed[0]["bonus"] = {"type": "money", "value": 99}
    assert "the bonuses are not the map's own" in ark360.check_layout("1", changed)


# ---- the game ---------------------------------------------------------------------------------------------------------------------------

def _ark(seed=7, mw=False):
    return new_game({"game_mode": "ark360", "marine_worlds_flag": mw, "confirm_turns": True}, ["1", "2"], seed)


def test_ark360_is_a_game_mode():
    assert "ark360" in map_select.MODES and map_select.DEFAULT_MODE == "random-mirrored"
    with pytest.raises(ValueError):
        new_game({"game_mode": "ark361"}, ["1", "2"], 1)


@pytest.mark.parametrize("mw", [False, True])
def test_both_players_get_one_map_with_one_layout_from_the_playable_maps(mw):
    seen = set()
    for seed in range(30):
        s = _ark(seed, mw)
        a, b = s.players
        assert a.map_id == b.map_id == s.config.maps[0] == s.config.maps[1] and a.map_id in PLAYABLE
        assert (a.map_id in MARINE_WORLDS) <= mw                                              # (the Marine Worlds maps only in a Marine Worlds game)
        assert a.bonus_layout and a.bonus_layout == b.bonus_layout and a.bonus_layout is not b.bonus_layout
        assert ark360.check_layout(a.map_id, a.bonus_layout) == []
        seen.add(a.map_id)
    assert len(seen) >= 4                                                                         # (drawn at random)



def test_the_cards_are_dealt_before_the_study_time_and_the_draft():
    s = _ark(11, mw=True)
    assert s.prompt.kind == "study" and s.study == {"seconds": ark360.study_seconds(), "ready": [False, False]}
    hands = [list(p.hand) for p in s.players]
    ends = [list(p.endgame_hand) for p in s.players]
    assert all(len(h) == 8 or len(h) == 9 for h in hands) and all(len(e) == 2 for e in ends)    # the starting hand and the endgame cards are known now
    assert {(a.player, a.kind) for a in legal_actions(s)} == {(0, "study_ready"), (1, "study_ready")}
    s = apply(s, Action(1, "study_ready", {}))
    assert [(a.player, a.kind) for a in legal_actions(s)] == [(0, "study_ready")] and s.prompt.kind == "study"
    with pytest.raises(IllegalAction):
        apply(s, Action(1, "study_ready", {}))                                                    # once is enough
    s = apply(s, Action(0, "study_ready", {}))
    assert s.prompt.kind == "draft" and s.draft["stage"] == "pick1"                              # the draft follows (Marine Worlds)
    while s.prompt is not None and s.prompt.kind == "draft":                                      # (both players pick at the same time: the first legal move of each)
        for seat in (0, 1):
            mine = [a for a in legal_actions(s) if a.player == seat]
            if mine and s.prompt is not None and s.prompt.kind == "draft":
                s = apply(s, mine[0])
    assert s.prompt.kind == "initial_discard" and [list(p.hand) for p in s.players] == hands and [list(p.endgame_hand) for p in s.players] == ends      # nothing was dealt again


def test_without_marine_worlds_the_study_time_is_followed_by_the_initial_discard():
    s = _ark(5, mw=False)
    assert s.prompt.kind == "study" and s.draft is None
    s = apply(apply(s, Action(0, "study_ready", {})), Action(1, "study_ready", {}))
    assert s.prompt.kind == "initial_discard" and all(len(p.initial_offer) >= 8 for p in s.players)
    first = [a for a in legal_actions(s) if a.player == 0][0]
    s = apply(s, first)
    second = [a for a in legal_actions(s) if a.player == 1][0]
    s = apply(s, second)
    assert s.prompt.kind == "choose_action_card" and s.active_player == 0                       # the game is on


def test_the_state_with_a_layout_survives_json():
    s = _ark(9, mw=True)
    back = GameState.from_dict(json.loads(json.dumps(s.to_dict())))
    assert back.to_dict() == s.to_dict() and back.players[0].bonus_layout == s.players[0].bonus_layout and back.study == s.study


def test_the_placement_bonus_of_a_hex_is_the_one_of_the_layout():
    s = _ark(21)
    p = s.players[0]
    laid, printed = board_of(p), board(p.map_id)
    moved = [c for c in printed.bonuses if c not in laid.bonuses]
    assert moved, "the layout should move at least one bonus"
    assert placement_bonuses(laid, [moved[0]]) == []                                              # the printed place pays nothing now
    cell = next(iter(laid.bonuses))
    assert placement_bonuses(laid, [cell]) == laid.bonuses[cell]
    assert placement_entries(p) == p.bonus_layout and placement_entries(PlayerState(seat=0, map_id=p.map_id)) == data.map_by_id(p.map_id)["geometry"]["placement_bonuses"]


def test_the_kiosk_hexes_of_maps_7_and_7a_move_with_their_bonuses():
    for map_id in ("7", "7a"):
        layout = ark360.layout_for(map_id, 4)
        kiosks = [(e["x"], e["y"]) for e in layout if "kiosk" in (e.get("note") or "")]
        printed = [(e["x"], e["y"]) for e in ark360.base_entries(map_id) if "kiosk" in (e.get("note") or "")]
        assert kiosks and len(kiosks) == len(printed) and set(kiosks) != set(printed)
        p = PlayerState(seat=0, map_id=map_id, bonus_layout=layout, buildings=[Building(id=i, type="size-1", x=x, y=y) for i, (x, y) in enumerate(kiosks)])
        assert kiosk_hexes_covered(p)                                                              # the new hexes count
        p.buildings = [Building(id=i, type="size-1", x=x, y=y) for i, (x, y) in enumerate(printed)]
        assert not kiosk_hexes_covered(p)                                                          # the printed ones do not
        assert kiosk_hexes_covered(PlayerState(seat=0, map_id=map_id, buildings=p.buildings))      # (without a layout they do)


def test_a_state_saved_before_the_mode_existed_still_loads():
    s = new_game({"game_mode": "random-mirrored", "marine_worlds_flag": False}, ["1", "2"], 3)
    old = json.loads(json.dumps(s.to_dict()))
    del old["study"]
    for p in old["players"]:
        del p["bonus_layout"]
    back = GameState.from_dict(old)
    assert back.study is None and all(p.bonus_layout is None for p in back.players) and back.to_dict() == s.to_dict()
