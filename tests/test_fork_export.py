"""A fork exported as a replay of its own: the engine's format, a number per table, the statistics of the engine even when the fork stops before the end."""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ark_nova.api.main import create_app
from ark_nova.config import Settings
from ark_nova.storage.forks import FileForkStore, MemoryForkStore
from ark_nova.storage.index import TableRecord

sys.path.insert(0, str(Path(__file__).parent))
from test_fork import Idx, LOG_DIR, Logs  # noqa: E402


@pytest.fixture(scope="module")
def world():
    path = next(p for p in sorted(LOG_DIR.glob("*.json")) if p.stat().st_size < 12_000_000 and p.stem != "573904205")
    tid = int(path.stem)
    store = MemoryForkStore()
    c = TestClient(create_app(Settings(cache_dir="off"), Idx(TableRecord(tid, "x.json")), Logs({"x.json": path.read_bytes()}), fork_store=store))
    c.tid, c.store = tid, store
    return c


def _fork(client, moves=6):
    body = client.get(f"/api/tables/{client.tid}/replay").json()
    step = next(i for i, s in enumerate(body["steps"]) if s["fork"] and i > body["setup_steps"] + 3)
    fk = client.post(f"/api/tables/{client.tid}/fork", json={"step": step}).json()
    names = [p["name"] for p in fk["players"]]
    start = cur = fk["steps"][0]
    actions = []
    for _ in range(moves):
        if not cur["actions"]:
            break
        act = {k: cur["actions"][0][k] for k in ("player", "kind", "args")}
        cur = client.post("/api/fork/apply", json={"state": cur["engine_state"], "action": act, "names": names}).json()
        actions.append(act)
    return fk, start, actions


def _export(client, fk, start, actions):
    return client.post(f"/api/tables/{client.tid}/forks", json={"start_state": start["engine_state"], "actions": actions,
                                                                 "players": [{"id": p["id"], "name": p["name"], "color": p["color"]} for p in fk["players"]],
                                                                 "origin": {"step": fk["fork"]["step"], "seed": fk["fork"]["seed"], "label": fk["fork"]["label"]}})


def test_an_exported_fork_opens_as_a_replay_with_a_number_per_table(world):
    fk, start, actions = _fork(world)
    assert actions
    first, second = _export(world, fk, start, actions), _export(world, fk, start, actions[:2])
    assert first.status_code == 200 and first.json()["id"] == 1 and second.json()["id"] == 2
    assert first.json()["url"] == f"/replay.html?table={world.tid}&fork=1"
    body = world.get(f"/api/tables/{world.tid}/forks/1/replay").json()
    step = fk["fork"]["step"]
    assert len(body["steps"]) == step + 1 + len(actions) and body["table_id"] == str(world.tid)           # (the game from its start up to the fork point, then the moves of the fork)
    assert body["steps"][0]["state"]["phase"] == "setup" and body["setup_steps"] > 0
    original = world.get(f"/api/tables/{world.tid}/replay").json()["steps"]
    assert [st["label"] for st in body["steps"][:step]] == [st["label"] for st in original[:step]]
    assert body["steps"][step]["fork"] is True and body["steps"][step + 1]["label"] == body["steps"][step + 1]["label"].strip()
    assert body["fork_replay"]["id"] == 1 and body["fork_replay"]["step"] == fk["fork"]["step"] and body["fork_replay"]["stopped"] is True
    assert [p["name"] for p in body["players"]] == [p["name"] for p in fk["players"]]
    assert all(st["state"]["players"][0]["score"] is not None for st in body["steps"]) and [st["index"] for st in body["steps"]] == list(range(len(body["steps"])))


def test_a_fork_that_stops_early_still_has_its_statistics_and_a_result(world):
    fk, start, actions = _fork(world, 8)
    n = _export(world, fk, start, actions).json()["id"]
    body = world.get(f"/api/tables/{world.tid}/forks/{n}/replay").json()
    ps = body["post_stats"]
    assert len(ps["players"]) == 2 and ps["synthetic"] is True and "act" in ps["available"]
    assert sum(sum(p["act"].values()) for p in ps["players"]) >= 1
    last = body["steps"][-1]["state"]["players"]
    scores = [p["score"] for p in last]
    assert body["result"][0]["score"] == scores[0] and body["result"][1]["score"] == scores[1]
    if scores[0] != scores[1]:
        assert ps["conceded"] == (0 if scores[0] < scores[1] else 1)                    # (the player who is behind counts as having quit)
    else:
        assert ps["conceded"] is None


def test_the_log_of_a_fork_is_worded_like_a_game_of_bga(world):
    fk, start, actions = _fork(world)
    n = _export(world, fk, start, actions).json()["id"]
    labels = [s["label"] for s in world.get(f"/api/tables/{world.tid}/forks/{n}/replay").json()["steps"][1:]]
    assert any(" chooses action card " in label or " plays " in label or " draws " in label for label in labels)
    assert not any(label.startswith("Fork") for label in labels)


def test_an_illegal_move_is_not_stored(world):
    fk, start, actions = _fork(world, 2)
    bad = actions + [{"player": 0, "kind": "place_building", "args": {"type": "size-1", "x": 99, "y": 99, "rotation": 0}}]
    r = _export(world, fk, start, bad)
    assert r.status_code == 422 and r.json()["status"] == "illegal"
    assert world.get(f"/api/tables/{world.tid}/forks/9999/replay").status_code == 404
    assert world.post(f"/api/tables/{world.tid}/forks", json={"nonsense": 1}).status_code == 422


def test_an_exported_fork_can_be_forked_again_at_any_step(world):
    fk, start, actions = _fork(world, 6)
    n = _export(world, fk, start, actions).json()["id"]
    replay = world.get(f"/api/tables/{world.tid}/forks/{n}/replay").json()
    start_at = fk["fork"]["step"]
    forkable = [i for i, s in enumerate(replay["steps"]) if s["fork"] and i >= start_at]
    assert forkable and forkable[0] == start_at                                    # (the point the fork began at is a position too)
    step = forkable[len(forkable) // 2]
    r = world.post(f"/api/tables/{world.tid}/fork", json={"step": step, "fork_id": n})
    assert r.status_code == 200, r.text
    again = r.json()
    first = again["steps"][0]
    assert again["fork"]["parent_fork"] == n and again["fork"]["step"] == step and first["actions"] and len(again["players"]) == 2
    assert first["state"]["players"][0]["score"] == replay["steps"][step]["state"]["players"][0]["score"]       # (the same position the replay shows at that step)
    cur, moves = first, []
    for _ in range(3):
        if not cur["actions"]:
            break
        act = {k: cur["actions"][0][k] for k in ("player", "kind", "args")}
        cur = world.post("/api/fork/apply", json={"state": cur["engine_state"], "action": act, "names": [p["name"] for p in again["players"]]}).json()
        moves.append(act)
    out = world.post(f"/api/tables/{world.tid}/forks", json={"start_state": first["engine_state"], "actions": moves, "players": [{"id": p["id"], "name": p["name"], "color": p["color"]} for p in again["players"]],
                                                              "origin": {"step": step, "seed": again["fork"]["seed"], "label": again["fork"]["label"], "parent_fork": n}})
    assert out.status_code == 200 and out.json()["id"] > n
    child = world.get(f"/api/tables/{world.tid}/forks/{out.json()['id']}/replay").json()
    assert child["fork_replay"]["parent_fork"] == n and len(child["steps"]) == step + 1 + len(moves)
    assert [st["label"] for st in child["steps"][:step + 1]] == [st["label"] for st in replay["steps"][:step + 1]]       # (the child shows the same game up to its fork point, the moves of the parent included)
    assert world.post(f"/api/tables/{world.tid}/fork", json={"step": max(start_at - 1, 0), "fork_id": n}).status_code == 422       # (before the fork point: fork the table itself)
    assert world.post(f"/api/tables/{world.tid}/fork", json={"step": 999, "fork_id": n}).status_code == 422
    assert world.post(f"/api/tables/{world.tid}/fork", json={"step": 0, "fork_id": 9999}).status_code == 404


def test_exporting_is_off_without_a_store():
    c = TestClient(create_app(Settings(cache_dir="off"), Idx(), Logs({})))
    assert c.post("/api/tables/1/forks", json={}).status_code == 404 and c.get("/api/tables/1/forks/1/replay").status_code == 404


def test_thinking_time_is_estimated_from_the_times_of_the_log():
    from ark_nova.replay.view import thinking_times_from_log

    def packet(t, *players):
        return {"time": str(t), "data": [{"type": "updateReflexionTime", "args": {"player_id": p, "delta": "58", "max": "180"}} for p in players]}
    raw = {"data": {"logs": [{"time": "1000", "data": []}, packet(1030, 7), packet(1100, 8), packet(1190, 7)]}}
    assert thinking_times_from_log(raw) == {"7": 30 + 90, "8": 70}              # (the time since the previous end of a turn belongs to the player whose turn ended)
    assert thinking_times_from_log({}) == {} and thinking_times_from_log({"data": {"logs": []}}) == {}


def test_the_file_store_counts_per_table(tmp_path):
    s = FileForkStore(tmp_path)
    assert [s.save("5", {"a": 1}), s.save("5", {"a": 2}), s.save("6", {"a": 3})] == [1, 2, 1]
    assert s.load("5", 2)["a"] == 2 and s.load("5", 3) is None
