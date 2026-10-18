"""The endgame live count (`endgame.live_scoring`): what the sponsors' and the endgame cards' final scoring would give right now, without changing the state."""
import copy
import glob
from pathlib import Path

import pytest

from ark_nova.engine import endgame
from ark_nova.engine.state import Phase
from ark_nova.parser import parse_log
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log

LOGS = [p for p in sorted(glob.glob(str(Path(__file__).resolve().parents[1] / "log_examples" / "*.json"))) if "573904205" not in p][:4]
needs_logs = pytest.mark.skipif(not LOGS, reason="log_examples not available")


def _pre_final(path):
    parsed = parse_log(path)
    setup, cfg, seed = game_from_log(parsed)
    rep = build_replay(parsed, setup, cfg, seed)
    fm = next(m for m in parsed.moves if any(e.type == "finalScoring" for e in m.events))
    return rep, rep.states[fm.index - 1]


@needs_logs
@pytest.mark.parametrize("path", LOGS)
def test_live_count_equals_final_scoring_and_changes_nothing(path):
    try:
        rep, pre = _pre_final(path)
    except ValueError:
        pytest.skip("log without a replay")
    before = copy.deepcopy(pre)
    live = endgame.live_scoring(pre)
    assert pre.players[0].appeal == before.players[0].appeal and pre.players[0].conservation == before.players[0].conservation
    st = copy.deepcopy(pre)
    base = [(p.appeal, p.conservation) for p in st.players]
    if not any(live):
        pytest.skip("position the rules cannot read")
    endgame.final_scoring(st)
    for s, p in enumerate(st.players):
        gain_cards = sum(endgame.card_points(pre, s, c) for c in endgame.kept_endgame_cards(pre, s))
        assert p.appeal - base[s][0] == live[s]["appeal"]
        assert p.conservation - base[s][1] == live[s]["conservation"] + gain_cards == live[s]["conservation"] + live[s]["cards"]
    last = rep.states[-1]
    assert last.phase in (Phase.SCORING, Phase.OVER)
    assert all(v == {"appeal": 0, "conservation": 0, "cards": 0} for v in endgame.live_scoring(last))


def test_kept_endgame_cards_are_the_best_all_but_one():
    class P:
        def __init__(self, hand): self.endgame_hand = hand
    class S:
        endgame_discard_done = False
        players = [P(["F1", "F2", "F3"])]
    pts = {"F1": 1, "F2": 3, "F3": 2}
    orig = endgame.card_points
    endgame.card_points = lambda state, seat, c: pts[c]
    try:
        assert sorted(endgame.kept_endgame_cards(S, 0)) == ["F2", "F3"]
        S.endgame_discard_done = True
        assert sorted(endgame.kept_endgame_cards(S, 0)) == ["F1", "F2", "F3"]
    finally:
        endgame.card_points = orig
