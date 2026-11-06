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


def test_merge_runs_unit():
    """replay/merge.py: draws / digs / snaps of one player in a row are one step for the other player's point of view."""
    from ark_nova.replay.merge import mark_merges

    def step(label, pov=None, mid=1):
        return {"label": label, "label_pov": pov, "move_id": mid, "state": {"turn_context": 1, "phase": "turn"}}

    steps = [step("A draws X from the deck", [None, "A draws 1 card from the deck"], 5), step("A draws Y, Z from the deck", [None, "A draws 2 cards from the deck"], 6),
             step("A discards X", [None, "A discards 1 card"], 7)]
    assert mark_merges(steps, ["A", "B"]) == 1
    assert steps[1]["merge"]["last"] and steps[1]["merge"]["from"] == 5 and not steps[0]["merge"]["last"] and "merge" not in steps[2]
    assert steps[1]["label_pov"][1] == "A draws 3 cards from the deck" and steps[1]["label_pov"][0] is None
    # digs are never merged; the draw that belongs to a dig from the hand (Digging Cards, same move) is not part of the run of draws after it
    dd = [step("A digs X from your hand", [None, "A digs 1 card from their hand"], 1), step("A draws Y from the deck", [None, "A draws 1 card from the deck"], 1),
          step("A draws Z from the deck", [None, "A draws 1 card from the deck"], 2), step("A draws W from the deck", [None, "A draws 1 card from the deck"], 3)]
    assert mark_merges(dd, ["A", "B"]) == 1
    assert "merge" not in dd[0] and "merge" not in dd[1] and dd[3]["merge"]["from"] == 2 and dd[3]["label_pov"][1] == "A draws 2 cards from the deck"
    digs = [step("A digs P from the display", None, 1), step("The display is replenished with Q", None, 1), step("A digs Q from the display", None, 2)]
    assert mark_merges(digs, ["A", "B"]) == 0
    snaps = [step("A snaps P from the display", None, 1), step("A snaps Q from the display", None, 2)]
    takes = [step("A takes P in reputation range from the display", None, 1), step("A takes Q in reputation range from the display", None, 2)]
    assert mark_merges(snaps, ["A", "B"]) == 0 and mark_merges(takes, ["A", "B"]) == 0          # (only draws are merged)
    assert mark_merges([step("A draws X from the deck", [None, "A draws 1 card from the deck"])], ["A", "B"]) == 0
