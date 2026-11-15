"""A worker gained at 2 conservation while a project is supported is the conservation reward, not the notepad's Worker space (948139378, reported from production: the
replay marked the Worker space as used for MonkeyinAround's first support; the support took the size-2 space; fixed by ab6bdc4, which looks the space up from BGA's prompts)."""
import json
from pathlib import Path

import pytest

from ark_nova.replay.view import build_replay_view
from ark_nova.storage.index import TableRecord

LOG = Path(__file__).resolve().parents[1] / "log_examples" / "948139378.json"


@pytest.mark.skipif(not LOG.exists(), reason="log not available")
def test_the_worker_at_two_conservation_is_not_the_notepad_worker_space():
    view = build_replay_view(json.loads(LOG.read_text(encoding="utf-8")), TableRecord(948139378))
    steps = view["steps"]
    first = next(i for i, s in enumerate(steps) if s["label"].startswith("MonkeyinAround supports a conservation project"))
    for s in steps[first + 1:first + 14]:                       # the support, its worker, the free size-2 building, the next turns
        used = s["state"]["players"][0]["flags"].get("bonus_used", 0)
        assert used & 2 and not used & 16, (s["label"], used)      # size-2 space used, the Worker space (slot 4 of map 6a) not
