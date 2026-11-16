"""The table info of the extension gives the same Elo as the index (checked on table 607674960, indexed: `all_games_stat.elo`)."""
import json
from pathlib import Path

from ark_nova.storage.tableinfo import elo_changes_from_tableinfo, elos_after_from_tableinfo, elos_from_tableinfo, table_id_of

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "tableinfos_607674960.json"


def test_the_elo_before_the_game_is_the_index_elo():
    info = json.loads(FIXTURE.read_text(encoding="utf-8"))["data"]
    assert table_id_of(info) == "607674960"
    assert elos_from_tableinfo(info) == {"95347471": 358, "89641657": 391}          # the index: tonyfire02 358, SylAce10 391


def test_the_elo_after_the_game_and_its_change():
    info = json.loads(FIXTURE.read_text(encoding="utf-8"))["data"]
    after, change = elos_after_from_tableinfo(info), elo_changes_from_tableinfo(info)
    assert set(after) == set(change) == {"95347471", "89641657"}
    before = elos_from_tableinfo(info)
    for pid in after:
        assert abs(after[pid] - before[pid] - change[pid]) <= 1                       # (the index Elo is truncated: the change agrees within a point)


def test_a_friendly_game_has_no_rating_and_is_not_an_error():
    """BGA sends null for `rank_after_game` / `point_win` in a friendly game (a TypeError on float(None) was a 500 on the upload)."""
    info = json.loads(FIXTURE.read_text(encoding="utf-8"))["data"]
    for p in info["result"]["player"]:
        p["rank_after_game"] = None
        p["point_win"] = None
    assert elos_from_tableinfo(info) == elos_after_from_tableinfo(info) == elo_changes_from_tableinfo(info) == {}
    info["result"]["player"][0].update(rank_after_game="", point_win="n/a")        # (an empty or unreadable value is no rating either)
    info["result"]["player"][1].update(rank_after_game=1700, point_win="20")      # one player with a rating keeps it
    rated = str(info["result"]["player"][1]["player_id"])
    assert elos_from_tableinfo(info) == {rated: 380}                                # 1700 - 20 - 1300
    assert elos_after_from_tableinfo(info) == {rated: 400}
    assert elo_changes_from_tableinfo(info) == {rated: 20}
    for broken in ({}, {"result": None}, {"result": {"player": None}}, {"result": {"player": [{"player_id": 5}]}}):
        assert elos_from_tableinfo(broken) == elos_after_from_tableinfo(broken) == elo_changes_from_tableinfo(broken) == {}


def test_bgas_peaceful_option_is_read_from_the_table_info():
    from ark_nova.storage.tableinfo import peaceful_of, record_from_tableinfo

    def info(value):
        return {"options": {"103": {"name": "Peaceful mode", "value": value, "values": [{"name": "Disabled"}, {"name": "Enabled"}]}}}

    assert peaceful_of(info("1")) is True and peaceful_of(info(1)) is True
    assert peaceful_of(info("0")) is False and peaceful_of(info(0)) is False
    assert peaceful_of(info("2")) is None and peaceful_of(info(None)) is None         # (BigQuery has one table with 2: not an answer)
    assert peaceful_of({}) is None and peaceful_of({"options": {"102": {"value": "5"}}}) is None
    assert record_from_tableinfo(info("1"), 5).peaceful is True and record_from_tableinfo({}, 5).peaceful is None
