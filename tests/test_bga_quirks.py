"""BGA quirks that the replay shows as BGA played them while the engine keeps the rule (docs/bga_quirks.md)."""
from pathlib import Path

import pytest

from ark_nova.parser import parse_log
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log
from ark_nova.replay.differential import run_differential

LOG = Path(__file__).resolve().parents[1] / "log_examples" / "859034675.json"


@pytest.mark.skipif(not LOG.exists(), reason="log not available")
def test_explorer_paid_for_an_icon_that_is_gained_again_replays_as_bga_paid_it():
    parsed = parse_log(LOG)
    setup, cfg, seed = game_from_log(parsed)
    rep = run_differential(parsed, build_replay(parsed, setup, cfg, seed), {pid: i for i, pid in enumerate(setup.seats)})
    assert not [p for p in rep.illegal + rep.mismatches if "turn 23:" in p]          # the turn matches BGA's numbers (5 money less 2, 1 appeal less)
    assert any(q.startswith("turn 23:") and "Explorer paid 1 of 2" in q for q in rep.quirks)
