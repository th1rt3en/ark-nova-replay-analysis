"""The log-driven replay must agree with every oracle the log offers, for every game."""
import glob
from pathlib import Path

import pytest

from ark_nova.parser import parse_log
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log

LOGS = [p for p in sorted(glob.glob(str(Path(__file__).resolve().parents[1] / "log_examples" / "*.json"))) if "800035115" not in p and "573904205" not in p]   # (800035115 is aborted before the deal, 573904205 is an old log format)
pytestmark = pytest.mark.skipif(not LOGS, reason="log_examples not available")


def _replay(path):
    parsed = parse_log(path)
    setup, cfg, seed = game_from_log(parsed)
    return parsed, build_replay(parsed, setup, cfg, seed)


def test_replay_of_one_game_has_a_state_per_move():
    parsed, rep = _replay(LOGS[0])
    assert len(rep.states) == len(parsed.moves) and rep.setup_moves > 0
    first_turn = rep.states[rep.setup_moves]
    assert first_turn.turn == 0 or first_turn.turn == 1
    assert rep.states[-1].turn > 20
    assert rep.states[0] is not rep.states[-1] and rep.states[0].main_deck != rep.states[-1].main_deck


def test_setup_steps_follow_the_log_deal_then_discard_then_display():
    parsed, rep = _replay(LOGS[0])
    hands = [[len(p.hand) for p in st.players] for st in rep.states[:rep.setup_moves]]
    assert hands[0] == [0, 0] and all(not st.display[0] for st in rep.states[:1])      # nothing is dealt at the literal start
    assert max(h[0] for h in hands) in (8, 9)                                          # the deal (9 with Map 14's sponsor)
    last = rep.states[rep.setup_moves - 1]
    assert [len(p.hand) for p in last.players] in ([4, 4], [5, 5], [4, 5], [5, 4]) and all(last.display)   # discarded 4 each, display filled
    for st in rep.states[:rep.setup_moves]:                                            # every card is in exactly one place
        cards = st.main_deck + st.main_discard + [c for c in st.display if c] + [c for p in st.players for c in p.hand]
        assert len(cards) == len(set(cards))


def test_all_events_handled_and_all_oracles_agree():
    """Hand + display + endgame snapshots (state 20), money after purchases (`total`) and the running score (`score`)."""
    problems = []
    for path in LOGS:
        _, rep = _replay(path)
        if rep.unhandled:
            problems.append((Path(path).name, "unhandled", dict(rep.unhandled)))
        if rep.mismatches:
            problems.append((Path(path).name, "mismatch", rep.mismatches[:2]))
    assert not problems, problems[:3]
