"""The lightbox of Horse Whisperer (viewer: web/js/reveal.js): the step that draws the animal carries `horse` = the whole pile before the draw, the animals in it and the one taken."""
import json
from pathlib import Path

import pytest

from ark_nova.replay.view import build_replay_view
from ark_nova.storage.index import TableRecord

GAME = Path(__file__).resolve().parents[1] / "log_examples" / "920295323.json"


@pytest.mark.skipif(not GAME.exists(), reason="sample log missing")
def test_horse_whisperer_step_has_the_pile_and_the_animal_taken():
    view = build_replay_view(json.loads(GAME.read_text(encoding="utf8")), TableRecord(table_id="920295323"))
    steps = [s for s in view["steps"] if "horse" in s]
    assert len(steps) == 1
    s = steps[0]
    h = s["horse"]
    assert "draws Donkey from discard for Horse Whisperer effect" in s["label"]
    assert h["kept"] == "A522" and h["kept"] in h["pets"] and h["kept"] in h["pile"]
    assert len(h["pets"]) == 4 and len(h["pile"]) == 49
    assert h["kept"] not in s["state"]["main_discard"]
    assert len(s["state"]["main_discard"]) == 48
