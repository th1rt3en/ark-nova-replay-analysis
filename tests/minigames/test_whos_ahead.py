"""Who's ahead on real logs of log_examples."""
import json
import random
from pathlib import Path

import pytest

from ark_nova.minigames.platform import guard
from ark_nova.minigames.platform.contract import Caller, GameLog, ManifestEntry, SubmissionError
from ark_nova.minigames.whos_ahead import GAME

LOGS = Path(__file__).resolve().parents[2] / "log_examples"
GOOD, CONCEDED = 616635962, 603637393                      # table 616635962: seat 1 won 138 to 127
pytestmark = pytest.mark.skipif(not (LOGS / f"{GOOD}.json").exists(), reason="log_examples not available")
_logs: dict = {}


def log_of(table):
    if table not in _logs:
        _logs[table] = GameLog(json.loads((LOGS / f"{table}.json").read_text(encoding="utf-8")), table, elos={})
    return _logs[table]


def moment(table=GOOD, seed=1):
    return GAME.pick_moment(table, log_of(table), random.Random(seed))


def test_the_position_is_in_the_middle_of_the_game_and_shows_both_players_fully():
    log = log_of(GOOD)
    log.elos = {pid: 500 + i for i, (pid, _) in enumerate(log.players)}
    m = moment()
    n = len(log.parsed.turn_markers)
    assert int(n * 0.35) <= m["turn"] <= int(n * 0.85)
    pub = GAME.build_public(m, log)
    guard.check_public(pub, log)
    st = pub["replay"]["steps"][0]["state"]
    assert pub["pov"] is None and pub["to_act"] in (0, 1)
    for p in st["players"]:                                                 # every card of both players is shown
        assert "?" not in p["hand"] + p["endgame_hand"] + p["stored"] + p["pouched"]
    assert any(p["hand"] for p in st["players"]) and all(p["endgame_hand"] for p in st["players"])
    assert st["main_deck"] == [] and st["main_discard"] == [] and st["endgame_deck"] == [] and st["prompt"] is None and st["stats"] == {}
    assert [p["name"] for p in pub["replay"]["players"]] == ["Player 1 (Elo 500)", "Player 2 (Elo 501)"]
    text = json.dumps(pub)
    assert str(GOOD) not in text and all(name not in text for _, name in log.players) and all(pid not in text for pid, _ in log.players)
    assert pub["replay"]["result"] == [] and pub["replay"]["table_id"] is None


def test_the_answer_is_the_real_result():
    assert GAME.answer(moment(), log_of(GOOD)) == {"winner": 1, "scores": [127, 138]}


def test_a_conceded_game_makes_no_puzzle():
    with pytest.raises(ValueError):
        moment(CONCEDED) if (LOGS / f"{CONCEDED}.json").exists() else pytest.skip("log not available")


def test_the_same_moment_always_builds_the_same_payload():
    m = moment(seed=7)
    assert json.dumps(GAME.build_public(m, log_of(GOOD)), sort_keys=True) == json.dumps(GAME.build_public(m, log_of(GOOD)), sort_keys=True)
    assert moment(seed=7) == m


def test_the_chances_must_be_whole_numbers_adding_up_to_100():
    pub = {}
    assert GAME.validate(pub, {"p1": 60, "p2": 40}) == {"p1": 60, "p2": 40, "tie": 0}
    assert GAME.validate(pub, {"p1": 45, "p2": 45, "tie": 10}) == {"p1": 45, "p2": 45, "tie": 10}
    assert GAME.validate(pub, {"p1": 50.0, "p2": 50}) == {"p1": 50, "p2": 50, "tie": 0}
    for bad in (None, [], {}, {"p1": 50}, {"p1": 60, "p2": 50}, {"p1": 49, "p2": 50}, {"p1": -10, "p2": 110}, {"p1": 50.5, "p2": 49.5}, {"p1": "60", "p2": 40}, {"p1": True, "p2": 99}, {"p1": 50, "p2": 50, "tie": 5}):
        with pytest.raises(SubmissionError):
            GAME.validate(pub, bad)


def test_the_brier_score_of_three_outcomes():
    win2 = {"winner": 1, "scores": [127, 138]}
    assert GAME.score(win2, {"p1": 0, "p2": 100, "tie": 0}).value == 0.0                      # perfect
    assert GAME.score(win2, {"p1": 100, "p2": 0, "tie": 0}).value == 2.0                      # as wrong as it gets
    assert GAME.score(win2, {"p1": 50, "p2": 50, "tie": 0}).value == 0.5                      # the coin flip
    assert GAME.score(win2, {"p1": 30, "p2": 60, "tie": 10}).value == round(0.09 + 0.16 + 0.01, 4)
    tie = {"winner": None, "scores": [100, 100]}
    assert GAME.score(tie, {"p1": 0, "p2": 0, "tie": 100}).value == 0.0
    assert GAME.score(tie, {"p1": 50, "p2": 50, "tie": 0}).value == 1.5
    assert GAME.score(win2, {"p1": 50, "p2": 50, "tie": 0}).detail == {"outcome": "p2"}


def test_the_average_prediction_of_the_puzzle():
    stats = GAME.day_stats([{"p1": 60, "p2": 40, "tie": 0}, {"p1": 40, "p2": 50, "tie": 10}], {})
    assert stats == {"players": 2, "mean_p1": 50.0, "mean_p2": 45.0, "mean_tie": 5.0}
    assert GAME.day_stats([], {})["mean_p1"] is None


def test_the_platform_runs_the_game_with_a_calendar():
    from conftest import FakeClock, FakeLogs
    from ark_nova.minigames.platform.service import MiniGameService
    from ark_nova.minigames.platform.sources import ListSourceIndex
    from ark_nova.minigames.platform.store import MemoryStore
    clock = FakeClock("2026-10-08T10:00:00+00:00")
    svc = MiniGameService(MemoryStore(), ListSourceIndex([GOOD, 621974238]), FakeLogs({GOOD: log_of(GOOD), 621974238: log_of(621974238) if 621974238 in _logs else GameLog(json.loads((LOGS / "621974238.json").read_text(encoding="utf-8")), 621974238, elos={})}),
                          {"whos_ahead": GAME}, [ManifestEntry("whos_ahead", True, "x", "Who's ahead", "b", allow_past=True)], clock=clock, rng=random.Random(2))
    svc.rollover()
    clock.set("2026-10-10T10:00:00+00:00")
    svc.rollover()
    me = Caller(anon_id="anon-browser-0001")
    cal = svc.days("whos_ahead", "2026-10", me)
    assert [d["day"] for d in cal["days"]] == ["2026-10-08", "2026-10-10"]
    old = svc.puzzle("whos_ahead", "2026-10-08", me)                         # a past issue
    assert old["played"] is False and "table" not in json.dumps(old["public"]).lower().replace("table_id\": null", "")
    out = svc.submit("whos_ahead", "2026-10-08", {"p1": 40, "p2": 60}, me)
    assert out["winner"] in (0, 1, None) and 0 <= out["score"] <= 2 and out["table_id"] in (GOOD, 621974238) and out["stats"]["players"] == 1
    assert [d["played"] for d in svc.days("whos_ahead", "2026-10", me)["days"]] == [True, False]
