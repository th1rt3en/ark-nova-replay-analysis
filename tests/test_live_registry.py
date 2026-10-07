"""The game record and the table registry (docs/live_game_plan.md 9.1 and 9.2), with in-memory twins of the keeper, BigQuery and GCS."""
import json
import random

from fastapi.testclient import TestClient

from ark_nova.api.main import create_app
from ark_nova.config import Settings
from ark_nova.live import archive as arch
from ark_nova.live import registry as reg
from ark_nova.live.fake import FakeKeeper
from ark_nova.live.keeper import NoSuchTable
from ark_nova.live.service import LiveService
from test_live_service import Idx, Logs, _join_both, _play, _start


def _world():
    keeper, registry, archive = FakeKeeper(), reg.FakeRegistry(), arch.FakeArchive()
    service = LiveService(keeper, engine_version="test", registry=registry, archive=archive)
    client = TestClient(create_app(Settings(cache_dir="off"), Idx(), Logs(), live=service))
    return client, keeper, registry, archive, service


def test_a_row_never_holds_the_seed_or_a_token():
    client, keeper, registry, archive, service = _world()
    game_id, players = _start(client)
    row = registry.latest(game_id)
    assert row["status"] == "waiting" and row["table_number"] == int(game_id[1:]) and row["event_seq"] == 1
    assert row["engine_version"] == "test" and len(row["code_hash"]) == 64 and row["maps"] and row["marine_worlds"] is False
    text = json.dumps(row)
    assert "tail_seed" not in text and "seed" not in json.loads(row["config"])
    assert all(p.token not in text for p in players)


def test_the_life_of_a_table_is_a_row_per_change_and_the_last_one_has_the_path():
    client, keeper, registry, archive, service = _world()
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    row = registry.latest(game_id)
    assert row["status"] == "playing" and row["player_names"] == ["Player 0", "Player 1"] and row["started_at"]
    assert _play(players, 30, random.Random(2)) == 30
    from ark_nova.engine.actions import Action
    from ark_nova.engine.game import apply
    final_state = apply(service._cache[game_id].state, Action(1, "concede", {})).to_dict()      # (the game ends with the concession, a move of its own)
    r = players[1].c.post(f"/api/games/{game_id}/concede", headers=players[1].h, json={})
    assert r.status_code == 200
    last = registry.latest(game_id)
    assert last["status"] == "conceded" and last["event_seq"] == 3 and last["started_at"] == row["started_at"]
    assert last["n_actions"] == 31 and last["gcs_path"].startswith("gs://") and last["gcs_path"].endswith(f"/{game_id}.json.gz") and last["record_bytes"] > 100
    assert last["gcs_path"].split("/live/")[1].count("/") == 2                           # live/<yyyy>/<mm>/E<n>.json.gz
    record = arch.decode(archive.read(last["gcs_path"]))
    assert record["status"] == "conceded" and record["n_actions"] == 31 and len(record["actions"]) == 31 and record["actions"][-1]["action"]["kind"] == "concede" and record["names"] == ["Player 0", "Player 1"]
    assert arch.refold(record).to_dict() == final_state                                  # the stored game reproduces its final state
    blob = json.dumps(record)
    assert all(p.token not in blob for p in players)
    from ark_nova.live.service import token_hash
    assert all(token_hash(p.token) not in blob for p in players)                         # not even a hash of a seat token
    try:
        keeper.state(game_id)
    except NoSuchTable:
        pass
    else:
        raise AssertionError("the keeper kept the table after the export")


def test_a_game_goes_on_when_bigquery_is_down_and_the_rows_follow_later():
    client, keeper, registry, archive, service = _world()
    registry.down = True
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    assert _play(players, 10, random.Random(3)) == 10                                    # nothing failed for the players
    assert registry.latest(game_id) is None
    pending = keeper.registry(game_id)
    assert [e["event"]["status"] for e in pending] == ["waiting", "playing"]             # the events wait in the keeper
    registry.down = False
    assert service.sync_registry(game_id) is True
    assert registry.latest(game_id)["status"] == "playing" and keeper.registry(game_id) == []
    assert service.sync_registry(game_id) is True                                        # (again: nothing to do, nothing doubled)
    assert len(registry.rows) == 2


def test_an_export_that_failed_is_repaired_by_running_the_wrap_up_again():
    client, keeper, registry, archive, service = _world()
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    _play(players, 6, random.Random(4))
    archive.down = True
    assert players[0].c.post(f"/api/games/{game_id}/concede", headers=players[0].h, json={}).status_code == 200      # the player's answer does not depend on GCS
    assert registry.latest(game_id)["status"] == "playing"                               # no final row without the file
    assert keeper.state(game_id)["status"] == "conceded"                                 # the table is closed for moves, but not deleted
    archive.down = False
    assert service.wrap_up(game_id) is True
    assert registry.latest(game_id)["gcs_path"] and registry.latest(game_id)["status"] == "conceded"
    assert service.wrap_up(game_id) is False                                             # a second run finds nothing left


def test_abandoned_tables_are_not_exported_and_a_table_in_error_is_kept():
    client, keeper, registry, archive, service = _world()
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    keeper.set_status(game_id, "abandoned", "nobody came back", registry_event={"status": "abandoned", "n_actions": 0})
    assert service.wrap_up(game_id) is True
    last = registry.latest(game_id)
    assert last["status"] == "abandoned" and "gcs_path" not in last and archive.files == {}
    try:
        keeper.state(game_id)
    except NoSuchTable:
        pass
    else:
        raise AssertionError("an abandoned table is deleted")
    other, _ = _start(client)
    keeper.set_status(other, "error", "rule not implemented", registry_event={"status": "error", "n_actions": 0})
    assert service.wrap_up(other) is True
    assert registry.latest(other)["status"] == "error" and keeper.state(other)["status"] == "error"


def test_the_schema_and_the_view_agree_with_the_rows():
    names = {n for n, _, _ in reg.SCHEMA}
    row = reg.build_row("E7", 2, {"status": "playing", "version": 3, "seats": [{"name": "A"}, {"name": "B"}], "engine_version": "1", "created_at": 1700000000000,
                                  "config": {"options": {"marine_worlds_flag": True}, "maps": ["1", "2"], "code_hash": "c", "data_hash": "d"}}, {"status": "playing", "started_at": 1700000100000})
    assert set(row) <= names and row["maps"] == ["1", "2"] and row["marine_worlds"] is True and row["started_at"].startswith("2023-")
    required = {n for n, _, mode in reg.SCHEMA if mode == "REQUIRED"}
    assert required <= set(row)
    sql = reg.view_sql()
    assert "ROW_NUMBER() OVER (PARTITION BY table_id ORDER BY event_seq DESC)" in sql and "ark_nova_engine.live_table_events" in sql


def test_the_end_page_data_after_a_concession_comes_from_the_registry():
    """`GET /api/games/{id}/result`: names, who conceded and the scores of the position, read after the keeper has deleted the table."""
    client, keeper, registry, archive, service = _world()
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    assert client.get(f"/api/games/{game_id}/result").status_code == 409                    # not over yet
    assert _play(players, 12, random.Random(2)) == 12
    assert players[1].c.post(f"/api/games/{game_id}/concede", headers=players[1].h, json={}).status_code == 200
    r = client.get(f"/api/games/{game_id}/result")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "conceded" and body["names"] == ["Player 0", "Player 1"] and body["replayable"] is True
    assert body["result"]["winner"] == 0 and body["result"]["conceded"] == 1 and len(body["result"]["scores"]) == 2
    assert client.get("/api/games/E999/result").status_code == 404


def test_an_abandoned_game_is_in_the_registry_without_a_record():
    client, keeper, registry, archive, service = _world()
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    assert players[0].c.post(f"/api/games/{game_id}/abandon", headers=players[0].h, json={}).status_code == 200
    assert players[1].c.post(f"/api/games/{game_id}/abandon/answer", headers=players[1].h, json={"agree": True}).json()["status"] == "abandoned"
    last = registry.latest(game_id)
    assert last["status"] == "abandoned" and last["end_reason"] == "abandoned by agreement" and not last.get("gcs_path")
    body = client.get(f"/api/games/{game_id}/result").json()
    assert body["status"] == "abandoned" and body["replayable"] is False and body["result"] is None


def test_the_statistics_come_from_the_engine_and_the_end_is_announced_in_the_log():
    """The end page's numbers are the engine's own (they add up to the score); the last step of both players' logs says who won."""
    from ark_nova.engine import gamestats
    client, keeper, registry, archive, service = _world()
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    assert _play(players, 400, random.Random(5)) == 400
    r = players[1].c.post(f"/api/games/{game_id}/concede", headers=players[1].h, json={})
    assert r.status_code == 200
    body = client.get(f"/api/games/{game_id}/result").json()
    st = body["stats"]
    assert st["schema"] == 1 and len(st["players"]) == 2
    for s_, p in enumerate(st["players"]):
        assert set(p["actions"]) == {"build", "animals", "association", "sponsors", "cards"} and set(p["points"]) == {"animals", "sponsors", "projects", "others"}
        assert sum(p["points"].values()) == body["result"]["scores"][s_] - p["start"]      # the sources add up to the score (less the score the game started with)
        assert p["money_gained"] >= 0 and p["money_spent"] >= 0
    assert body["result"]["winner"] == 0 and body["result"]["conceded"] == 1
    record = arch.decode(archive.read(registry.latest(game_id)["gcs_path"]))
    assert record["stats"] == st
    assert "conceded the game. Game over: Player 0 wins" in json.dumps(record)
