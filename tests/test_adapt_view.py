"""The Adapt lightbox data (`step["adapt"]`, replay/view.py, viewer: web/js/reveal.js): the draw step holds the held + drawn endgame cards, the discard step the same pool with the discarded ones."""
import json
from pathlib import Path

import pytest

from ark_nova.replay.view import build_replay_view
from ark_nova.storage.index import TableRecord

GAME = Path(__file__).resolve().parents[1] / "log_examples" / "770429314.json"


@pytest.mark.skipif(not GAME.exists(), reason="sample log missing")
def test_adapt_draw_and_discard_steps_share_the_pool():
    view = build_replay_view(json.loads(GAME.read_text(encoding="utf8")), TableRecord(table_id="770429314"))
    ads = [s["adapt"] for s in view["steps"] if s.get("adapt")]
    draws = [a for a in ads if "discarded" not in a]
    discs = [a for a in ads if "discarded" in a]
    assert draws and discs
    d, x = draws[0], discs[0]
    assert len(d["drawn"]) == 3 and set(d["drawn"]) <= set(d["cards"]) and len(d["cards"]) == 5
    assert x["cards"] == d["cards"] and len(x["discarded"]) == 3 and set(x["discarded"]) <= set(x["cards"])
