"""A random bonus of the conservation track (5 / 8) or the bonus on 16 reputation that a player took never comes back, in any step of the replay.

The steps that the log builds (not the engine: e.g. the "pays X xtoken for increasing card strength" step before an action card) kept the bonuses of the setup, so a
taken bonus showed again on the track for one step (table 943170782, move 207). The builder now takes it off at its takeBonus event, as the engine does."""
import json
from pathlib import Path

import pytest

from ark_nova.replay.view import build_replay_view
from ark_nova.storage.index import TableRecord

GAME = Path(__file__).resolve().parents[1] / "log_examples" / "927683584.json"


@pytest.mark.skipif(not GAME.exists(), reason="sample log not present")
def test_taken_bonuses_never_come_back():
    view = build_replay_view(json.loads(GAME.read_text(encoding="utf8")), TableRecord(table_id="927683584"))
    seen: dict = {}
    for i, step in enumerate(view["steps"]):
        for th, opts in (step["state"].get("conservation_options") or {}).items():
            if th in seen:
                assert len(opts) <= seen[th], f"step {i}: a taken bonus at {th} is back ({opts})"
            seen[th] = len(opts)
    assert seen["99"] == 0                                         # (the bonus on 16 reputation was taken in this game)
