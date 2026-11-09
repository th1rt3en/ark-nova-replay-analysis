"""The placement bonuses that have a type of their own: Extra Shift (the hex of map 11, custom maps), Digging (plain) and Digging with rescue (map 10)."""
import pytest

from ark_nova import data
from ark_nova.engine import custom_map, game
from tests.test_animal_abilities import _play, _start, _zoo
from tests.test_custom_map import editor_export


def _open_prompt():
    """A state with an open effects prompt (the placement bonuses join it)."""
    s = _play(_start(_zoo("A435", hand=["A402"])), "A435")
    s.prompt.args["pending"].clear()
    return s


def _gain(map_id, b):
    s = _open_prompt()
    s.players[0].map_id = map_id
    game.apply_placement_bonus(s, 0, b)
    return s, s.prompt.args["pending"]


def test_map_11_hex_is_extra_shift_and_the_other_worker_entries_are_not():
    bonuses = {(e["x"], e["y"]): e["bonus"] for e in data.map_by_id("11")["geometry"]["placement_bonuses"]}
    assert bonuses[(4, 3)] == {"type": "extra-shift", "value": 1}
    assert [e["bonus"]["type"] for e in data.map_by_id("11")["geometry"]["bonus_slots"] if e["bonus"]["type"] == "Worker"]      # the notepad still hires
    assert not [b for b in bonuses.values() if b["type"] == "Worker"]


def test_extra_shift_takes_a_worker_back_on_any_map():
    for map_id in ("11", "5"):
        _, pending = _gain(map_id, {"type": "extra-shift", "value": 1})
        assert [e["kind"] for e in pending] == ["extra_shift"] and not pending[0]["optional"]


def test_worker_hires_except_for_the_old_name_of_the_map_11_hex():
    _, pending = _gain("5", {"type": "Worker", "value": 1})
    assert pending == []                                                         # (hired at once, nothing to choose)
    _, pending = _gain("11", {"type": "Worker", "value": 1})
    assert [e["kind"] for e in pending] == ["extra_shift"]                       # (states and maps that still say Worker for the Caves hex)


def test_plain_digging_has_no_rescue_and_the_rescue_one_has():
    _, pending = _gain("5", {"type": "digging-plain", "value": 2})
    assert [(e["kind"], e["n"], e.get("rescue", False), e["optional"]) for e in pending] == [("digging", 2, False, False)]
    _, pending = _gain("10", {"type": "Digging", "value": 1})
    assert [(e["kind"], e.get("rescue")) for e in pending] == [("digging", True)]


def test_a_plain_digging_never_offers_a_rescue():
    s, _ = _gain("5", {"type": "digging-plain", "value": 1})
    assert [a for a in game.legal_actions(s) if a.kind == "choose_effect" and a.args.get("rescue")] == []


def test_custom_maps_keep_the_three_apart():
    rec = custom_map.normalize(editor_export(bonuses=[("digging", 2), ("rescue", 1), ("extra-shift", 1), ("Worker", 1)]), "x")
    assert [e["bonus"] for e in rec["geometry"]["placement_bonuses"]] == [
        {"type": "digging-plain", "value": 2}, {"type": "Digging", "value": 1}, {"type": "extra-shift", "value": 1}, {"type": "Worker", "value": 1}]
    with pytest.raises(custom_map.CustomMapError, match="Perception X"):
        custom_map.normalize(editor_export(bonuses=[("perception", 1)]), "x")
