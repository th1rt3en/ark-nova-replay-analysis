"""Maps made in the map editor: the checks of `engine/custom_map.py`, a game on one, and the saved maps of an account (`accounts/maps.py`)."""
import copy
import random

import pytest

from ark_nova import data
from ark_nova.accounts.maps import MAX_MAPS, MapService
from ark_nova.accounts.service import AccountError
from ark_nova.accounts.store import MemoryStore, SqliteStore
from ark_nova.engine import custom_map
from ark_nova.engine.game import apply, legal_actions, new_game
from ark_nova.engine.state import GameState


def editor_export(terrain=None, bonuses=None):
    """What the map editor exports for a map: map 1's hexes with its own terrain, a few bonuses, the panel of map 2."""
    geo1, geo2 = data.map_by_id("1")["geometry"], data.map_by_id("2")["geometry"]
    hexes = [{"x": h["x"], "y": h["y"], "terrain": (terrain or {}).get((h["x"], h["y"]), h["terrain"])} for h in geo1["hexes"]]
    plain = [(h["x"], h["y"]) for h in hexes if h["terrain"] == "plain"]
    bonuses = bonuses if bonuses is not None else [("money", 5), ("reputation", 1), ("xtoken", 1), ("take-in-range-or-deck", 1)]
    return {"map_id": "custom", "verified": False, "hexes": hexes,
            "placement_bonuses": [{"x": plain[3 * i][0], "y": plain[3 * i][1], "bonus": {"type": t, "value": v}} for i, (t, v) in enumerate(bonuses)],
            "special_hexes": [{"x": plain[-1][0], "y": plain[-1][1], "kind": "upgrade_flag", "off_board": False, "note": ""}],
            "bonus_slots": [{"index": s["index"], "kind": s["kind"], "bonus": s["bonus"], "note": ""} for s in geo2["bonus_slots"]],
            "association": {"workers": [None, {"type": "reputation", "value": 1}, None], "partner_zoos": [None, None, {"type": "Worker", "value": 1}, {"type": "conservation", "value": 2}],
                            "universities": [None, None, {"type": "conservation", "value": 1}], "upgrade": {"mode": "pairs", "sets": [1, 2]}},
            "map_rules": []}


def test_normalize_gives_a_record_with_a_stable_id():
    rec = custom_map.normalize(editor_export(), "My zoo")
    assert rec["id"].startswith(data.CUSTOM_PREFIX) and rec["name"] == "My zoo"
    assert custom_map.normalize(editor_export(), "My zoo")["id"] == rec["id"]                      # the same map, the same id
    assert custom_map.normalize(editor_export(), "Other")["id"] != rec["id"]
    assert len(rec["geometry"]["hexes"]) == 58 and rec["association"]["upgrade"] == {"mode": "pairs", "sets": [1, 2]}


@pytest.mark.parametrize("change, message", [
    (lambda m: m["hexes"].pop(), "58 hexes"),
    (lambda m: m["placement_bonuses"].append(dict(m["placement_bonuses"][0])), "two placement bonuses"),
    (lambda m: m["placement_bonuses"][0].update(bonus={"type": "perception", "value": 1}), "Perception X"),
    (lambda m: m["bonus_slots"].pop(), "7 spaces"),
    (lambda m: m["special_hexes"].append({"x": 1, "y": 0, "kind": "tower"}), "upgrade requirement"),
])
def test_normalize_refuses_what_cannot_be_played(change, message):
    m = editor_export()
    change(m)
    with pytest.raises(custom_map.CustomMapError, match=message):
        custom_map.normalize(m, "x")


def test_a_bonus_on_rock_is_refused_and_rescue_is_the_digging_of_map_10():
    m = editor_export()
    rock = next(h for h in m["hexes"] if h["terrain"] == "rock")
    m["placement_bonuses"][0].update(x=rock["x"], y=rock["y"])
    with pytest.raises(custom_map.CustomMapError, match="rock or water"):
        custom_map.normalize(m, "x")
    m = editor_export(bonuses=[("rescue", 2)])
    assert custom_map.normalize(m, "x")["geometry"]["placement_bonuses"][0]["bonus"] == {"type": "Digging", "value": 2}


def test_a_game_on_a_custom_map_plays_and_survives_a_reload():
    rec = custom_map.normalize(editor_export(), "My zoo")
    s = new_game({"game_mode": "custom-map", "marine_worlds_flag": False, "custom_map": rec}, ["1", "2"], 5)
    assert [p.map_id for p in s.players] == [rec["id"]] * 2 and s.config.maps == [rec["id"]] * 2
    rng = random.Random(3)
    for n in range(260):
        acts = legal_actions(s)
        if not acts:
            break
        s = apply(s, rng.choice(acts))
        if n % 40 == 0:                                            # (a state that is saved and loaded again: the map is registered again)
            data._CUSTOM.clear()
            s = GameState.from_dict(copy.deepcopy(s.to_dict()))
            assert data.map_by_id(rec["id"])["name"] == "My zoo"
    assert s.turn >= 1 or s.phase.name != "SETUP"


def test_a_game_without_a_map_is_refused():
    with pytest.raises(ValueError, match="needs a map"):
        new_game({"game_mode": "custom-map", "marine_worlds_flag": False}, ["1", "2"], 1)


@pytest.mark.parametrize("make_store", [MemoryStore, SqliteStore])
def test_saved_maps_are_limited_named_and_private(make_store):
    maps = MapService(make_store())
    ann, bob = type("A", (), {"id": "P1"})(), type("A", (), {"id": "P2"})()
    made = [maps.create(ann, f"Map {i}", editor_export()) for i in range(MAX_MAPS)]
    assert [m["id"] for m in made] == ["M1", "M2", "M3"] and all(m["name"].startswith("Map") for m in made)
    with pytest.raises(AccountError) as e:
        maps.create(ann, "One too many", editor_export())
    assert e.value.code == "map_limit"
    assert [m["name"] for m in maps.list(ann)] == ["Map 2", "Map 1", "Map 0"] and maps.list(bob) == []
    with pytest.raises(AccountError):                                # another account's map is not found, not changed, not deleted
        maps.get(bob, "M1")
    with pytest.raises(AccountError):
        maps.update(bob, "M1", "Mine now", editor_export())
    with pytest.raises(AccountError):
        maps.delete(bob, "M1")
    assert maps.rename(ann, "M1", "Renamed")["name"] == "Renamed" and maps.get(ann, "M1")["data"]["hexes"]
    maps.delete(ann, "M2")
    assert maps.create(ann, "Again", editor_export())["id"] == "M4"        # (ids are not used twice)
    with pytest.raises(AccountError) as e:
        maps.create(bob, "", editor_export())
    assert e.value.code == "bad_map"
    assert maps.record_for_game("P1", "M1")["name"] == "Renamed"
    with pytest.raises(AccountError):
        maps.record_for_game("P2", "M1")
