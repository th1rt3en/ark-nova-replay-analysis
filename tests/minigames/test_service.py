"""The mini game platform with a tiny example game: rollover, puzzles, submissions, calendar and leaderboards, on both stores."""
import json

import pytest

import example_game as ex
from conftest import FakeLogs, make_service
from ark_nova.minigames.platform.contract import Caller, GameLog, MiniGameError

ANNA, BEN = Caller(anon_id="anon-anna-0001"), Caller(anon_id="anon-ben-00002")


def acct(n):
    return Caller(account_id=f"P{n}")


def good(svc, key="example", day=None):
    return {"picks": svc.puzzle(key, day or svc.today(), ANNA)["public"]["cards"][:2]}


def test_rollover_creates_one_puzzle_per_game_and_is_idempotent(store):
    svc = make_service(store)
    assert svc.rollover() == {"example": "created", "brier": "created"}
    first = store.get_puzzle("example", "2026-10-10").source_ref
    assert svc.rollover() == {"example": "exists", "brier": "exists"}
    assert store.get_puzzle("example", "2026-10-10").source_ref == first


def test_a_table_is_never_picked_twice_by_a_game(store, clock):
    svc = make_service(store, tables=range(1000, 1004), clock=clock)
    seen = set()
    for d in ("10", "11", "12", "13"):
        clock.set(f"2026-10-{d}T00:00:00+00:00")
        svc.rollover()
        seen.add(store.get_puzzle("example", f"2026-10-{d}").source_ref)
    assert len(seen) == 4
    clock.set("2026-10-14T00:00:00+00:00")
    assert svc.rollover()["example"] == "failed"                  # nothing left: the game fails, it does not repeat


def test_a_table_without_a_log_is_skipped(store):
    logs = FakeLogs({1001: ex.fake_log(1001)})
    svc = make_service(store, tables=[1000, 1001, 1002], logs=logs)
    svc.rollover()
    assert store.get_puzzle("example", "2026-10-10").source_ref == 1001


def test_a_failing_game_does_not_stop_the_others(store):
    class Broken(ex.Example):
        key = "broken"

        def build_public(self, moment, log):
            raise RuntimeError("boom")

    svc = make_service(store, games={"broken": Broken(), "example": ex.GAME})
    assert svc.rollover() == {"broken": "failed", "example": "created"}


def test_the_leak_guard_refuses_a_payload_that_names_the_table_or_a_player(store):
    class Leaky(ex.Example):
        key = "leaky"

        def build_public(self, moment, log):
            return {"cards": log.raw["cards"], "keep": 2, "title": f"Alice at table {log.table_id}"}

    svc = make_service(store, games={"leaky": Leaky()})
    assert svc.rollover() == {"leaky": "failed"}


def test_nothing_that_gives_the_answer_leaves_before_the_submission(store):
    svc = make_service(store)
    svc.rollover()
    text = json.dumps(svc.puzzle("example", svc.today(), ANNA))
    table = str(store.get_puzzle("example", svc.today()).source_ref)
    assert table not in text and "original" not in text and "Alice" not in text


def test_a_submission_is_scored_and_the_reveal_names_the_table(store):
    svc = make_service(store)
    svc.rollover()
    moment = store.get_puzzle("example", svc.today()).moment
    keep = ex.fake_log().raw["keep"][moment["seat"]]
    out = svc.submit("example", svc.today(), {"picks": keep}, ANNA)
    assert out["score"] == 2 and out["original"] == keep
    row = store.get_puzzle("example", svc.today())
    assert out["table_id"] == row.source_ref and out["links"]["replay"] == f"/replay.html?table={row.source_ref}"
    again = svc.puzzle("example", svc.today(), ANNA)
    assert again["played"] and again["result"]["score"] == 2
    assert not svc.puzzle("example", svc.today(), BEN)["played"]


def test_one_submission_per_player_per_day(store):
    svc = make_service(store)
    svc.rollover()
    svc.submit("example", svc.today(), good(svc), ANNA)
    with pytest.raises(MiniGameError) as e:
        svc.submit("example", svc.today(), good(svc), ANNA)
    assert e.value.status == 409
    svc.submit("example", svc.today(), good(svc), BEN)                    # another browser may play
    svc.submit("example", svc.today(), good(svc), acct(1))                # an account may play: separate from the anonymous ones
    with pytest.raises(MiniGameError):
        svc.submit("example", svc.today(), good(svc), acct(1))


def test_bad_submissions_and_missing_identity(store):
    svc = make_service(store)
    svc.rollover()
    for bad in (None, {"picks": ["c1"]}, {"picks": ["c1", "c1"]}, {"picks": ["c1", "zz"]}):
        with pytest.raises(MiniGameError) as e:
            svc.submit("example", svc.today(), bad, ANNA)
        assert e.value.status == 422
    with pytest.raises(MiniGameError) as e:
        svc.submit("example", svc.today(), good(svc), Caller())
    assert e.value.status == 400
    assert svc.store.submissions("example") == []


def test_the_cron_missing_a_day_is_covered_by_the_first_request(store):
    svc = make_service(store)
    assert store.get_puzzle("example", svc.today()) is None
    assert svc.puzzle("example", svc.today(), ANNA)["public"]["cards"]
    assert store.get_puzzle("example", svc.today()) is not None


def test_days_other_than_today_follow_allow_past(store, clock):
    svc = make_service(store, clock=clock)
    clock.set("2026-10-08T00:00:00+00:00")
    svc.rollover()
    clock.set("2026-10-10T12:00:00+00:00")
    svc.rollover()
    with pytest.raises(MiniGameError) as e:
        svc.puzzle("example", "2026-10-08", ANNA)                          # no allow_past: closed
    assert e.value.code == "closed"
    assert svc.puzzle("brier", "2026-10-08", ANNA)["public"]               # allow_past: open
    svc.submit("brier", "2026-10-08", good(svc, "brier", "2026-10-08"), ANNA)
    with pytest.raises(MiniGameError) as e:
        svc.puzzle("brier", "2026-10-11", ANNA)                            # the future
    assert e.value.status == 404
    with pytest.raises(MiniGameError) as e:
        svc.puzzle("brier", "2026-10-09", ANNA)                            # a day without a puzzle
    assert e.value.status == 404
    cal = svc.days("brier", "2026-10", ANNA)
    assert [(d["day"], d["played"]) for d in cal["days"]] == [("2026-10-08", True), ("2026-10-10", False)]
    with pytest.raises(MiniGameError):
        svc.days("example", "2026-10", ANNA)                               # no calendar for a game without allow_past
    with pytest.raises(MiniGameError):
        svc.puzzle("example", "10-10-2026", ANNA)


def test_a_new_builder_version_rebuilds_the_cached_payload(store):
    svc = make_service(store)
    svc.rollover()
    before = store.get_puzzle("example", svc.today())
    assert before.public_cache and before.builder_version == "1"
    svc.games["example"].builder_version = "2"
    try:
        svc.puzzle("example", svc.today(), ANNA)
        assert store.get_puzzle("example", svc.today()).builder_version == "2"
    finally:
        svc.games["example"].builder_version = "1"


def test_the_same_moment_always_builds_the_same_payload():
    log = ex.fake_log()
    moment = ex.GAME.pick_moment(1, log, __import__("random").Random(3))
    assert ex.GAME.build_public(moment, log) == ex.GAME.build_public(moment, log)


def test_pick_stats_count_every_player_of_the_puzzle(store):
    svc = make_service(store)
    svc.rollover()
    svc.submit("example", svc.today(), {"picks": ["c1", "c2"]}, ANNA)
    out = svc.submit("example", svc.today(), {"picks": ["c1", "c3"]}, BEN)
    assert out["stats"]["players"] == 2 and out["stats"]["pick_counts"]["c1"] == 2


def test_leaderboards_rank_accounts_only_by_the_games_own_metric(store, clock):
    svc = make_service(store, clock=clock, tables=range(1000, 1020))
    for d, who in (("2026-09-30", [1, 2]), ("2026-10-01", [1, 3]), ("2026-10-02", [1])):
        clock.set(f"{d}T10:00:00+00:00")
        svc.rollover()
        keep = ex.fake_log().raw["keep"][store.get_puzzle("example", d).moment["seat"]]
        for n in who:
            svc.submit("example", d, {"picks": keep if n == 1 else ["c5", "c6"]}, acct(n))
        svc.submit("example", d, {"picks": keep}, ANNA)                    # anonymous: scored, never listed
    all_time = svc.leaderboard("example", "all")["rows"]
    assert [(r["account_id"], r["value"], r["plays"], r["rank"]) for r in all_time] == [("P1", 6.0, 3, 1), ("P2", 0.0, 1, 2), ("P3", 0.0, 1, 2)]
    month = svc.leaderboard("example", "month")["rows"]
    assert [(r["account_id"], r["value"]) for r in month] == [("P1", 4.0), ("P3", 0.0)]
    assert svc.leaderboard("example", "2026-09")["rows"][0]["account_id"] == "P1"
    with pytest.raises(MiniGameError):
        svc.leaderboard("example", "last")


def test_a_mean_lower_is_better_board_needs_the_minimum_plays(store, clock):
    svc = make_service(store, clock=clock)
    for d in ("2026-10-01", "2026-10-02"):
        clock.set(f"{d}T10:00:00+00:00")
        svc.rollover()
        svc.submit("brier", d, {"picks": ["c1", "c2"]}, acct(1))
        svc.submit("brier", d, {"picks": ["c5", "c6"]}, acct(2) if d == "2026-10-01" else acct(3))
    rows = svc.leaderboard("brier", "all")
    assert rows["higher_is_better"] is False and rows["min_plays"] == 2
    assert [r["account_id"] for r in rows["rows"]] == ["P1"]               # P2 and P3 played once


def test_the_hub_lists_the_enabled_games_and_todays_status(store):
    svc = make_service(store)
    svc.rollover()
    svc.submit("example", svc.today(), good(svc), ANNA)
    games = {g["key"]: g for g in svc.hub(ANNA)}
    assert set(games) == {"example", "brier"} and games["example"]["today"]["played"] and not games["brier"]["today"]["played"]
    assert games["example"]["title"] == "Example" and games["brier"]["allow_past"]
    assert make_service(store, games={}).hub(ANNA) == []                    # no game: the hub shows only its coming-soon tile


def test_removing_a_game_leaves_the_others_working(store):
    svc = make_service(store)
    svc.rollover()
    svc.submit("example", svc.today(), good(svc), ANNA)
    svc.submit("brier", svc.today(), good(svc, "brier"), ANNA)
    rest = make_service(store, games={"example": ex.GAME})                 # the manifest line of "brier" is gone
    assert [g["key"] for g in rest.hub(ANNA)] == ["example"]
    assert rest.puzzle("example", rest.today(), ANNA)["played"]
    with pytest.raises(MiniGameError) as e:
        rest.puzzle("brier", rest.today(), ANNA)
    assert e.value.status == 404
    store.purge("brier")
    assert store.submissions("brier") == [] and store.get_puzzle("brier", rest.today()) is None and store.used_sources("brier") == set()
    assert store.submissions("example") != []


def test_anonymous_ids_and_accounts_are_separate_players(store):
    svc = make_service(store)
    svc.rollover()
    svc.submit("example", svc.today(), good(svc), Caller(account_id="P7", anon_id="anon-anna-0001"))
    assert not svc.puzzle("example", svc.today(), ANNA)["played"]
    assert svc.puzzle("example", svc.today(), Caller(account_id="P7"))["played"]
