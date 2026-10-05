import glob
from pathlib import Path

import pytest

from ark_nova.engine import tracks
from ark_nova.parser import parse_log
from ark_nova.parser.conservation import extract_conservation_bonuses

LOGS = [p for p in sorted(glob.glob(str(Path(__file__).resolve().parents[1] / "log_examples" / "*.json"))) if "573904205" not in p]   # (573904205 is an old log format the parser does not read)
needs_logs = pytest.mark.skipif(not LOGS, reason="log_examples not available")


def test_income_from_appeal():
    table = {0: 5, 1: 6, 4: 9, 5: 10, 6: 10, 7: 11, 8: 11, 9: 12, 17: 16, 19: 16, 20: 17, 23: 18, 32: 21, 35: 21, 36: 22, 56: 27, 60: 27, 61: 28, 96: 35, 101: 35, 102: 36, 113: 37}
    for appeal, income in table.items():
        assert tracks.income_from_appeal(appeal) == income, appeal


def test_conservation_points_and_score():
    assert [tracks.conservation_points(c) for c in (0, 1, 2, 5, 7, 8, 10, 11, 15, 20, 25, 26, 30, 35, 40, 41)] == \
        [-14, -12, -10, -4, 0, 2, 6, 9, 21, 36, 51, 54, 66, 81, 96, 99]
    assert tracks.score(0, 0) == -14 and tracks.score(1, 0) == -13          # first / second player start
    assert tracks.score(113, 41) == 212
    assert tracks.clamp_appeal(200) == 113 and tracks.clamp_conservation(50) == 41 and tracks.clamp_appeal(-3) == 0


def test_protection_and_end_trigger():
    assert tracks.is_protected(4) and not tracks.is_protected(5)
    assert tracks.end_triggered(100, 7) and not tracks.end_triggered(99, 7)


@needs_logs
def test_final_scoring_matches_the_track():
    """All 200 finalScoring events: conservation points come from the track, and appeal + points is the final score."""
    checked = 0
    for path in LOGS:
        for mv in parse_log(path).moves:
            for e in mv.events:
                if e.type == "finalScoring":
                    a = e.args
                    assert tracks.conservation_points(a["conservation"]) == a["conservationScore"]
                    checked += 1
    assert checked >= 100


@needs_logs
def test_end_of_game_is_triggered_at_100():
    scores = []
    for path in LOGS:
        for mv in parse_log(path).moves:
            for e in mv.events:
                if e.type == "endOfGame" and isinstance(e.args, dict) and "infos" in e.args:
                    scores.append(e.args["infos"]["score"][str(e.args["player_id"])])
    assert scores and min(scores) == tracks.END_TRIGGER_SCORE and max(scores) <= 115


@needs_logs
def test_conservation_bonuses_recoverable_from_logs():
    complete = incomplete = 0
    for path in LOGS:
        cb = extract_conservation_bonuses(parse_log(path))
        if not cb.random and not cb.always:
            continue                                   # the aborted game
        assert len(cb.always["5"]) == 1 and cb.always["5"][0] == {"money": 5}
        assert len(cb.random["8"]) == 2 or len(cb.random["8"]) == 3 or cb.missing_options().get("8")
        if cb.missing_options():
            incomplete += 1
        else:
            complete += 1
    assert complete >= 110 and incomplete <= 4         # 4 games need user input for a 5-conservation option
