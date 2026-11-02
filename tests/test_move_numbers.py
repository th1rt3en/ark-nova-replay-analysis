"""The replay's move numbers are BGA's move ids: every step carries its first / last BGA move (`move_from`, `move_id`), the numbers never go back, and every BGA move that has a
log line is held by a step (the ones that are not shown on purpose: the setup notes of move 1 and a few warnings of the engine)."""
import json
from collections import defaultdict
from pathlib import Path

import pytest

from ark_nova.replay.view import build_replay_view
from ark_nova.storage.index import TableRecord

LOGS = Path(__file__).resolve().parents[1] / "log_examples"
GAME = LOGS / "902906029.json"
NOT_SHOWN = ("Starting the first round", "has been chosen according", "cannot exceed", "cannot have more than", "selects ${card_name} to gain one effect")
HIDDEN = {"${player_name} gets ${bonus_desc}"}      # (exactly this text, no source: the "X gets 1 x upgrade-card" of a conservation bonus choice is hidden on purpose, the upgrade itself is shown)


def _packets(o):
    if isinstance(o, list) and o and isinstance(o[0], dict) and "move_id" in o[0]:
        return o
    if isinstance(o, dict):
        for v in o.values():
            r = _packets(v)
            if r:
                return r
    return None


@pytest.mark.skipif(not GAME.exists(), reason="sample log missing")
def test_every_logged_bga_move_is_held_by_a_step_in_order():
    raw = json.loads(GAME.read_text(encoding="utf-8"))
    steps = build_replay_view(raw, TableRecord(int(GAME.stem)))["steps"]
    top, held = -1, set()
    for s in steps:
        lo = s.get("move_from") if s.get("move_from") is not None else s["move_id"]
        assert lo <= s["move_id"]
        assert s["move_id"] >= top                       # never back
        top = s["move_id"]
        held.update(range(lo, s["move_id"] + 1))
    logged = defaultdict(list)
    for p in _packets(raw):
        if p.get("move_id") is None or str(p.get("channel", "")).startswith("/player"):
            continue
        for e in p["data"]:
            if e.get("log") and e["log"] not in HIDDEN and not any(t in e["log"] for t in NOT_SHOWN):
                logged[int(p["move_id"])].append(e["log"])
    assert [m for m in logged if m not in held and m > 1] == []
