"""A game where the players choose their maps (946790823): every choice is its own step, in the log's order, and no step is left without text."""
import json
from pathlib import Path

import pytest

from ark_nova.replay.view import build_replay_view
from ark_nova.storage.index import TableRecord

GAME = Path(__file__).resolve().parents[1] / "log_examples" / "946790823.json"


@pytest.mark.skipif(not GAME.exists(), reason="sample log missing")
def test_each_map_choice_is_a_step_and_the_first_step_has_text():
    view = build_replay_view(json.loads(GAME.read_text(encoding="utf8")), TableRecord(table_id="946790823"), first_moves=12)
    labels = [s["label"] for s in view["steps"]]
    assert labels[:2] == ["zixak will play Map 5a", "sorryimlikethis will play Map 6a"]
    assert all(s["label"].strip() for s in view["steps"])
    assert view["setup_steps"] >= 2
