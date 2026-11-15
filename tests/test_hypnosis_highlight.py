"""A hypnotised action card lies in the other player's row: the viewer highlights it there, not the card of the same slot in the acting player's row (948139378: MonkeyinAround
hypnotises DrAlexK's Association at strength 3 while their own slot 3 is a Build card)."""
import json
from pathlib import Path

import pytest

from ark_nova.replay.view import build_replay_view
from ark_nova.storage.index import TableRecord

LOG = Path(__file__).resolve().parents[1] / "log_examples" / "948139378.json"


@pytest.mark.skipif(not LOG.exists(), reason="log not available")
def test_the_chosen_card_of_a_hypnosis_has_its_owner():
    view = build_replay_view(json.loads(LOG.read_text(encoding="utf-8")), TableRecord(948139378))
    chosen = [s for s in view["steps"] if "chooses action card" in s.get("label", "") and s["state"].get("current_action")]
    hypnosis = [s for s in chosen if s["state"]["current_action"].get("owner") != s["state"]["current_action"]["seat"]]
    assert hypnosis, "the log has a hypnosis"
    s = next(x for x in hypnosis if x["label"].startswith("MonkeyinAround chooses action card AssociationI with strength 3"))
    assert s["state"]["current_action"]["seat"] == 0 and s["state"]["current_action"]["owner"] == 1 and s["state"]["current_action"]["slot"] == 3
    # an ordinary action: the card is the player's own
    own = next(x for x in chosen if x["label"].startswith("MonkeyinAround chooses action card BuildI with strength 4"))
    assert own["state"]["current_action"]["owner"] == own["state"]["current_action"]["seat"] == 0
