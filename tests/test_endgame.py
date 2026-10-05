import copy
import glob
from pathlib import Path

import pytest

from ark_nova.engine import endgame
from ark_nova.parser import parse_log
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log

LOGS = [p for p in sorted(glob.glob(str(Path(__file__).resolve().parents[1] / "log_examples" / "*.json"))) if "573904205" not in p]   # (573904205 is an old log format the parser does not read)
needs_logs = pytest.mark.skipif(not LOGS, reason="log_examples not available")


@needs_logs
def test_final_scores_match_the_logs():
    """Final scoring on the state before the `finalScoring` move. Not exact in 9 of 100 games: when the last action of the game is
    logged in the same move as the final scoring it is missing from that state (one conservation or animal of the last turn)."""
    ok = total = 0
    for path in LOGS:
        parsed = parse_log(path)
        if not parsed.final_scores:
            continue
        setup, cfg, seed = game_from_log(parsed)
        try:
            rep = build_replay(parsed, setup, cfg, seed)
        except ValueError:
            continue
        fm = next(m for m in parsed.moves if any(e.type == "finalScoring" for e in m.events))
        pre = copy.deepcopy(rep.states[fm.index - 1])
        endgame.final_scoring(pre)
        total += 1
        ok += endgame.scores(pre) == [parsed.final_scores[pid] for pid in setup.seats]
    assert total >= 95 and ok >= 88
