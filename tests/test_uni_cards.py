import json
from pathlib import Path

import pytest

from ark_nova.replay.view import build_replay_view
from ark_nova.storage.index import TableRecord

LOG = Path(__file__).resolve().parents[1] / "log_examples" / "941429583.json"


@pytest.mark.skipif(not LOG.exists(), reason="sample log missing")
def test_category_university_card_is_recorded():
    raw = json.loads(LOG.read_text(encoding="utf8"))
    v = build_replay_view(raw, TableRecord(table_id="941429583"))
    last = v["steps"][-1]["state"]["players"]
    assert last[0]["uni_cards"] == {"reptile": "A489"}
    assert last[1]["uni_cards"] == {"marine": "A542"}
