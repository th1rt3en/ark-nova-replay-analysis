"""Map T1: BGA logs the discard for +1 strength as a move of its own before the action card is chosen, the engine makes it part of
`choose_action_card`. The replay shows that move from the engine (the start of the turn with the card discarded), not the log-built state
with the flag "before the first engine action of the turn" (954844390 move 318, reported by a user)."""
import json
from pathlib import Path

import pytest

from ark_nova.replay.view import build_replay_view
from ark_nova.storage.index import TableRecord

LOG = Path(__file__).resolve().parents[1] / "log_examples" / "954844390.json"


@pytest.mark.skipif(not LOG.exists(), reason="log not available")
def test_t1_discard_move_is_an_engine_step():
    raw = json.loads(LOG.read_text(encoding="utf-8"))
    steps = build_replay_view(raw, TableRecord(954844390, "954844390.json"))["steps"]
    i = next(j for j, s in enumerate(steps) if "discards Bamboo Forest for Map T1 effect" in s["label"])
    step, before, after = steps[i], steps[i - 1], steps[i + 1]
    assert step["engine"]["source"] == "engine" and step["engine"]["status"] == "ok", step["engine"]
    assert "choose" in after["label"] and after["engine"]["source"] == "engine"
    seat = next(k for k, p in enumerate(step["state"]["players"]) if len(p["hand"]) != len(before["state"]["players"][k]["hand"]))
    assert len(step["state"]["players"][seat]["hand"]) == len(before["state"]["players"][seat]["hand"]) - 1           # the card has left the hand
    assert step["fork"] and step["options"]["prompt"] == "choose_action_card"                                         # a fork starts at the start of the turn
