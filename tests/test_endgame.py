import copy
import glob
from pathlib import Path

import pytest

from ark_nova.engine import endgame
from ark_nova.parser import parse_log
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log

from tests._logsel import FULL, sweep  # noqa: E402
from ark_nova.replay.config import _sample_maps as _maps_index  # noqa: E402
# (the subset is chosen among the logs whose maps the index gives, data_manual/sample_maps.json: a log without them is replayed on guessed maps and cannot
# be compared. Chosen from every log before 2026-11-25, the subset drifted onto unmapped games as log_examples/ grew: 3,264 turns instead of ~6,400)
LOGS = sweep([p for p in sorted(glob.glob(str(Path(__file__).resolve().parents[1] / "log_examples" / "*.json"))) if "573904205" not in p and Path(p).stem in _maps_index()])   # (573904205 is an old log format the parser does not read)
needs_logs = pytest.mark.skipif(not LOGS, reason="log_examples not available")


def _final_scores_agree(path):
    """One log (a worker of the parallel test): None when it has no final scores, else whether the engine's final scoring matches them."""
    parsed = parse_log(path)
    if not parsed.final_scores:
        return None
    setup, cfg, seed = game_from_log(parsed)
    try:
        rep = build_replay(parsed, setup, cfg, seed)
    except ValueError:
        return None
    fm = next(m for m in parsed.moves if any(e.type == "finalScoring" for e in m.events))
    pre = copy.deepcopy(rep.states[fm.index - 1])
    endgame.final_scoring(pre)
    return endgame.scores(pre) == [parsed.final_scores[pid] for pid in setup.seats]


@needs_logs
def test_final_scores_match_the_logs():
    """Final scoring on the state before the `finalScoring` move. Not exact in 9 of 100 games: when the last action of the game is
    logged in the same move as the final scoring it is missing from that state (one conservation or animal of the last turn)."""
    from ark_nova.replay.batch import parallel_map
    results = [r for r in parallel_map(_final_scores_agree, LOGS) if r is not None]
    total, ok = len(results), sum(results)
    if FULL:
        assert total >= 95 and ok >= 88
    else:                                                  # the fixed subset of tests/_logsel.py: the same ratios on fewer games
        assert total >= int(0.85 * len(LOGS)) and ok >= int(0.9 * total)


def test_tie_breaker_is_supported_projects():
    """Equal points: the player who supported more conservation projects wins (supports of discarded projects count); still equal: a tie."""
    from types import SimpleNamespace

    from ark_nova.engine.state import Token

    def player(supports, gone=0):
        toks = [Token(id=i, type="token", location=f"P10{i}_left_{i + 1}") for i in range(supports)]
        return SimpleNamespace(tokens=toks, flags={"supports_gone": gone} if gone else {})

    st = SimpleNamespace(players=[player(3), player(2)])
    assert endgame.winner(st, [90, 95]) == 1                        # points decide first
    assert endgame.winner(st, [100, 100]) == 0                      # 3 supports beat 2
    st = SimpleNamespace(players=[player(2), player(1, gone=2)])
    assert endgame.winner(st, [100, 100]) == 1                      # 1 + 2 supports of discarded projects
    st = SimpleNamespace(players=[player(2), player(2)])
    assert endgame.winner(st, [100, 100]) is None                   # a true tie
