"""Daily starting hand on real logs of log_examples (about 6 s per table: the replay view is built once per table and kept)."""
import json
import random
from pathlib import Path

import pytest

from ark_nova.minigames.daily_hand import GAME
from ark_nova.minigames.platform import guard
from ark_nova.minigames.platform.contract import GameLog, SubmissionError

LOGS = Path(__file__).resolve().parents[2] / "log_examples"
NORMAL, MAP14 = 603637393, 750256237
pytestmark = pytest.mark.skipif(not (LOGS / f"{NORMAL}.json").exists(), reason="log_examples not available")
_logs: dict = {}


def log_of(table):
    if table not in _logs:
        if not (LOGS / f"{table}.json").exists():
            pytest.skip("log not available")
        _logs[table] = GameLog(json.loads((LOGS / f"{table}.json").read_text(encoding="utf-8")), table, elos={})
    return _logs[table]


@pytest.mark.parametrize("seat", [0, 1])
def test_the_public_payload_shows_the_pov_hand_and_hides_the_rest(seat):
    log = log_of(NORMAL)
    log.elos = {pid: 400 + i * 10 for i, (pid, _) in enumerate(log.players)}
    pub = GAME.build_public({"seat": seat}, log)
    guard.check_public(pub, log)                                              # no table id, no player id, no name
    st = pub["replay"]["steps"][0]["state"]
    me, other = st["players"][seat], st["players"][1 - seat]
    assert pub["hand"] == sorted(pub["hand"]) and me["initial_offer"] == me["hand"]               # (sorted: the draw order of the log says nothing)
    assert len(me["hand"]) == 8 and pub["hand"] == me["hand"] and pub["keep"] == 4 and len(me["endgame_hand"]) == 2
    assert set(other["hand"]) == {"?"} and set(other["endgame_hand"]) == {"?"} and len(other["hand"]) == 8
    assert st["main_deck"] == [] and st["endgame_deck"] == [] and st["main_discard"] == [] and st["prompt"] is None and st["stats"] == {}
    assert [p["name"] for p in pub["replay"]["players"]] == ["Player 1 (Elo 400)", "Player 2 (Elo 410)"]
    text = json.dumps(pub)
    assert "NgDrago" not in text and "duckmammal" not in text and "92156157" not in text and str(NORMAL) not in text
    assert pub["replay"]["table_id"] is None and pub["replay"]["result"] == [] and pub["replay"]["steps"][0]["label"] == ""
    assert all(c in pub["replay"]["cards"] for c in me["hand"] + me["endgame_hand"])
    assert "?" not in pub["replay"]["cards"]                                   # the hidden cards are not in the catalog


def test_the_answer_is_what_the_original_kept_and_is_in_the_hand():
    log = log_of(NORMAL)
    ans = GAME.answer({"seat": 0}, log)
    pub = GAME.build_public({"seat": 0}, log)
    assert len(ans["keep"]) == pub["keep"] == 4 and set(ans["keep"]) <= set(pub["hand"])
    assert ans["keep"] == ["A459", "S205", "A481", "A483"]                    # NgDrago kept these (log of table 603637393)


def test_the_player_scores_one_point_per_matching_card():
    log = log_of(NORMAL)
    pub = GAME.build_public({"seat": 0}, log)
    ans = GAME.answer({"seat": 0}, log)
    hand = pub["hand"]
    miss = [c for c in hand if c not in ans["keep"]]
    for picks, points in ((ans["keep"], 4), (miss, 0), (ans["keep"][:2] + miss[:2], 2)):
        clean = GAME.validate(pub, {"picks": picks})
        s = GAME.score(ans, clean)
        assert s.value == points and len(s.detail["matches"]) == points


def test_a_submission_must_be_exactly_the_right_number_of_cards_of_the_hand():
    pub = GAME.build_public({"seat": 1}, log_of(NORMAL))
    h = pub["hand"]
    for bad in (None, {}, {"picks": h[:3]}, {"picks": h[:5]}, {"picks": [h[0]] * 4}, {"picks": h[:3] + ["A999"]}, {"picks": h[:3] + [5]}):
        with pytest.raises(SubmissionError):
            GAME.validate(pub, bad)
    assert GAME.validate(pub, {"picks": list(reversed(h[:4]))})["picks"] == h[:4]            # the order of the hand


def test_pick_stats_count_the_cards_of_everyone():
    pub = GAME.build_public({"seat": 0}, log_of(NORMAL))
    h = pub["hand"]
    stats = GAME.day_stats([{"picks": h[:4]}, {"picks": h[2:6]}], pub)
    assert stats["players"] == 2 and stats["pick_counts"][h[0]] == 1 and stats["pick_counts"][h[2]] == 2 and stats["pick_rates"][h[2]] == 1.0 and stats["pick_rates"][h[7]] == 0.0
    assert GAME.day_stats([], pub)["pick_rates"][h[0]] == 0.0


def test_map_14_keeps_five_cards():
    log = log_of(MAP14)
    for seat in (0, 1):
        pub = GAME.build_public({"seat": seat}, log)
        ans = GAME.answer({"seat": seat}, log)
        expected = 5 if pub["replay"]["maps"][seat]["id"] == "14" else 4
        assert pub["keep"] == len(ans["keep"]) == expected and len(pub["hand"]) == expected + 4


def test_the_same_moment_always_builds_the_same_payload():
    log = log_of(NORMAL)
    assert json.dumps(GAME.build_public({"seat": 1}, log), sort_keys=True) == json.dumps(GAME.build_public({"seat": 1}, log), sort_keys=True)


def test_a_log_without_a_selection_makes_no_puzzle():
    broken = GameLog({"data": {"players": [], "logs": []}}, 1, players=[])
    with pytest.raises(Exception):
        GAME.build_public({"seat": 0}, broken)


def test_the_platform_runs_the_game_end_to_end():
    from conftest import FakeClock, FakeLogs
    from ark_nova.minigames.platform.contract import Caller, ManifestEntry
    from ark_nova.minigames.platform.service import MiniGameService
    from ark_nova.minigames.platform.sources import ListSourceIndex
    from ark_nova.minigames.platform.store import MemoryStore
    store = MemoryStore()
    svc = MiniGameService(store, ListSourceIndex([NORMAL]), FakeLogs({NORMAL: log_of(NORMAL)}), {"daily_hand": GAME}, [ManifestEntry("daily_hand", True, "x", "Daily starting hand", "b")],
                          clock=FakeClock(), rng=random.Random(5))
    assert svc.rollover() == {"daily_hand": "created"}
    me = Caller(anon_id="anon-browser-0001")
    puzzle = svc.puzzle("daily_hand", svc.today(), me)
    assert puzzle["played"] is False and str(NORMAL) not in json.dumps(puzzle) and "NgDrago" not in json.dumps(puzzle)
    out = svc.submit("daily_hand", svc.today(), {"picks": puzzle["public"]["hand"][:4]}, me)
    assert out["table_id"] == NORMAL and len(out["original"]) == 4 and 0 <= out["score"] <= 4 and out["stats"]["players"] == 1
