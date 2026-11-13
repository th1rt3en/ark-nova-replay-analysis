"""The two BGA lines that move the break token are shown in plainer words in every replay text (`replay/view.py` `_break_words`)."""
import json
import re
from pathlib import Path

import pytest

from ark_nova.replay.view import _break_words, build_replay_view, render_log
from ark_nova.storage.index import TableRecord

LOGS = Path(__file__).resolve().parents[1] / "log_examples"


def test_the_two_templates():
    a = render_log("${player_name} advances break token of ${n} space(s), now at ${break}/${maxBreak}", {"player_name": "Xiao Tsong", "n": 5, "break": 7, "maxBreak": 9})
    assert a == "Xiao Tsong advances break token by 5, now at 7/9"
    b = render_log("${player_name} advances break token of ${n} space(s) and reach the last space of the Break track. At the end of the turn, all players must take a break", {"player_name": "Xiao Tsong", "n": 5})
    assert b == "Xiao Tsong advances break token by 5 and reaches the last space of the Break track"
    assert _break_words("A advances break token of 1 space(s) and reach the last space of the Break track") == "A advances break token by 1 and reaches the last space of the Break track"
    assert _break_words("A gains 3 money") == "A gains 3 money"


@pytest.mark.skipif(not (LOGS / "927683584.json").exists(), reason="sample log missing")
def test_a_whole_replay_has_no_old_wording():
    view = build_replay_view(json.loads((LOGS / "927683584.json").read_text(encoding="utf8")), TableRecord(table_id="927683584"))
    text = json.dumps([[s.get("label"), s.get("lines"), s.get("log")] for s in view["steps"]])
    assert "space(s)" not in text and "and reach the last" not in text
    assert re.search(r"advances break token by \d+", text)
