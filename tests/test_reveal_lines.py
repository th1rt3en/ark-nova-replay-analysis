"""What the other player does not read: the cards that a Hunter / Scuba Dive / Scavenging / Perception reveal draws and keeps; and the two buttons of Marine Research Expedition."""
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from ark_nova import data
from ark_nova.replay.options import _expedition_buttons
from ark_nova.replay.view import build_replay_view
from ark_nova.storage.index import TableRecord

LOGS = Path(__file__).resolve().parents[1] / "log_examples"


@pytest.mark.skipif(not (LOGS / "607674960.json").exists(), reason="log not available")
def test_the_other_player_does_not_read_the_hunter_cards():
    v = build_replay_view(json.loads((LOGS / "607674960.json").read_text(encoding="utf-8")), TableRecord(607674960))
    s = v["steps"][335]                                      # tonyfire02 draws 2 cards for the hunter effect (seat 1)
    assert s["label_pov"][0] == "tonyfire02 draws 2 cards for the hunter effect"
    assert "Yosemite" not in s["label_pov"][0]
    s = v["steps"][336]                                      # ... keeps one of them
    assert s["label_pov"][0] == "tonyfire02 keeps Guinea Pig for the hunter effect"


@pytest.mark.skipif(not (LOGS / "613566554.json").exists(), reason="log not available")
def test_scavenging_keeps_a_count_for_the_other_player():
    v = build_replay_view(json.loads((LOGS / "613566554.json").read_text(encoding="utf-8")), TableRecord(613566554))
    draw = next(s for s in v["steps"] if s["label"].startswith("Duci9 draw ") and "for scavenging effect" in s["label"])
    keep = next(s for s in v["steps"] if s["label"].startswith("Duci9 keep ") and "for scavenging effect" in s["label"])
    assert draw["label_pov"][1] == "Duci9 draws 3 cards for the scavenging effect"
    assert keep["label_pov"][1] == "Duci9 keeps 1 card for the scavenging effect"


def _state(sponsors):
    return SimpleNamespace(players=[SimpleNamespace(sponsors=sponsors), SimpleNamespace(sponsors=[])])


def _person():
    return next(k for k, c in data.cards_by_key().items() if c.get("type") == "HUMAN" and k.startswith("S"))


def test_expedition_is_two_buttons_and_needs_a_person_for_the_first():
    pending = [{"kind": "expedition", "source": "S270", "optional": True, "player": 0}]
    entry = {"kind": "expedition", "index": 0}
    no_person = _expedition_buttons(_state(["S201"]), pending, entry)
    assert [(b["name"], b["option"], b["enabled"]) for b in no_person] == [("Expedition", "send", False), ("Scuba Dive 3", "scuba", True)]
    with_person = _expedition_buttons(_state([_person()]), pending, entry)
    assert with_person[0]["enabled"] is True


def test_other_effects_keep_their_one_button():
    pending = [{"kind": "gain", "source": "A404", "res": "appeal", "n": 4, "player": 0}]
    entry = {"kind": "gain", "index": 0}
    assert _expedition_buttons(_state([]), pending, entry) == [entry]
