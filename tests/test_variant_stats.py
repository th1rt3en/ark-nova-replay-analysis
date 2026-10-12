"""The statistics of the action card variants and of the sponsors (replay only), read off the engine's effects and the log (replay/variant_stats.py, view.py)."""
import json
from pathlib import Path

import pytest

from ark_nova.replay.view import build_replay_view
from ark_nova.storage.index import TableRecord

LOGS = Path(__file__).resolve().parents[1] / "log_examples"


def _final(table: str) -> dict:
    raw = json.loads((LOGS / f"{table}.json").read_text(encoding="utf-8"))
    return build_replay_view(raw, TableRecord(table, f"{table}.json"))["steps"][-1]["state"]


@pytest.mark.skipif(not (LOGS / "607674960.json").exists(), reason="log not available")
def test_variant_statistics_of_a_marine_worlds_game():
    st = _final("607674960")
    stats = st["variant_stats"]
    assert stats["0"]["animals"]["marks"] >= 1                 # Mark Animals: a mark after the action
    assert stats["0"]["cards"]["dig_display"] >= 1             # Digging Cards: digging from the display
    assert stats["1"]["build"]["extra3"] >= 1 and stats["1"]["build"]["extra2"] >= 1      # Kiosk Build: the additional kiosk at 3 (side I) and at 2 (side II)
    assert stats["1"]["animals"]["appeal"] >= 1                # Discount Animals, side II: the paid appeal


@pytest.mark.skipif(not (LOGS / "607674960.json").exists(), reason="log not available")
def test_statistics_only_grow_from_step_to_step():
    raw = json.loads((LOGS / "607674960.json").read_text(encoding="utf-8"))
    steps = build_replay_view(raw, TableRecord("607674960", "607674960.json"))["steps"]
    last: dict = {}
    for s in steps:
        for seat, acts in s["state"]["variant_stats"].items():
            for act, d in acts.items():
                for stat, n in d.items():
                    assert n >= last.get((seat, act, stat), 0)
                    last[(seat, act, stat)] = n
