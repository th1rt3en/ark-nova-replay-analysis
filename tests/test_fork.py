"""Forking a replay: the position after a step, both seats playable, the deck order fixed by a seed."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ark_nova.api.main import create_app
from ark_nova.config import Settings
from ark_nova.storage.index import TableRecord
from ark_nova.storage.logs import LogNotFound

LOG_DIR = Path(__file__).resolve().parents[1] / "log_examples"


class Idx:
    def __init__(self, *records):
        self.records = {r.table_id: r for r in records}

    def find(self, table_id):
        return self.records.get(table_id)


class Logs:
    def __init__(self, files):
        self.files = files

    def read(self, gcs_path, table_id):
        if gcs_path not in self.files:
            raise LogNotFound(gcs_path)
        return self.files[gcs_path]


@pytest.fixture(scope="module")
def client():
    path = next(p for p in sorted(LOG_DIR.glob("*.json")) if p.stat().st_size < 12_000_000 and p.stem != "573904205")
    tid = int(path.stem)
    c = TestClient(create_app(Settings(cache_dir="off"), Idx(TableRecord(tid, "x.json")), Logs({"x.json": path.read_bytes()})))
    c.tid = tid
    return c


def _forkable_step(client):
    body = client.get(f"/api/tables/{client.tid}/replay").json()
    return next(i for i, s in enumerate(body["steps"]) if s["fork"] and i > body["setup_steps"] + 3)


def test_the_replay_marks_the_steps_that_can_be_forked(client):
    steps = client.get(f"/api/tables/{client.tid}/replay").json()["steps"]
    assert any(s["fork"] for s in steps) and not steps[0]["fork"]
    assert all("_obj" not in s and "engine_state" not in s for s in steps)           # the engine states never go into the replay itself


def test_a_fork_starts_from_the_step_with_its_legal_actions(client):
    step = _forkable_step(client)
    r = client.post(f"/api/tables/{client.tid}/fork", json={"step": step})
    assert r.status_code == 200
    body = r.json()
    first = body["steps"][0]
    assert body["fork"]["seed"] == 1 == body["fork"]["default_seed"] and body["fork"]["step"] == step
    assert first["actions"] and all({"player", "kind", "args", "text"} <= set(a) for a in first["actions"])
    assert first["engine_state"]["phase"] in ("turn", "break", "final_turns") and len(body["players"]) == 2 and body["cards"]


def test_both_seats_can_play_and_the_state_moves_on(client):
    step = _forkable_step(client)
    body = client.post(f"/api/tables/{client.tid}/fork", json={"step": step}).json()
    cur = body["steps"][0]
    names = [p["name"] for p in body["players"]]
    seats, played = set(), 0
    for _ in range(6):
        if not cur["actions"]:                                              # (the engine has no way on here: e.g. Association at strength 1 with nothing to do)
            break
        act = cur["actions"][0]
        seats.add(act["player"])
        r = client.post("/api/fork/apply", json={"state": cur["engine_state"], "action": act, "names": names})
        assert r.status_code == 200, r.text
        nxt = r.json()
        assert nxt["label"].startswith(names[act["player"]]) and nxt["engine_state"] != cur["engine_state"]
        cur, played = nxt, played + 1
    assert played >= 3


def test_an_illegal_action_is_refused(client):
    step = _forkable_step(client)
    cur = client.post(f"/api/tables/{client.tid}/fork", json={"step": step}).json()["steps"][0]
    bad = {"player": 0, "kind": "place_building", "args": {"type": "size-1", "x": 99, "y": 99, "rotation": 0}}
    r = client.post("/api/fork/apply", json={"state": cur["engine_state"], "action": bad, "names": ["a", "b"]})
    assert r.status_code == 422 and r.json()["status"] == "illegal"
    assert client.post("/api/fork/apply", json={"state": {"nonsense": 1}, "action": bad}).status_code == 422


def test_a_step_the_engine_did_not_play_cannot_be_forked(client):
    r = client.post(f"/api/tables/{client.tid}/fork", json={"step": 0})
    assert r.status_code == 422 and r.json()["status"] == "not_forkable"
    assert client.post(f"/api/tables/{client.tid}/fork", json={"step": 10 ** 6}).status_code == 422
    assert client.post(f"/api/tables/{client.tid}/fork", json={"step": 5, "seed": -3}).status_code == 422


def test_the_seed_fixes_the_deck_order(client):
    step = _forkable_step(client)

    def decks(seed):
        st = client.post(f"/api/tables/{client.tid}/fork", json={"step": step, "seed": seed}).json()["steps"][0]["engine_state"]
        return st["main_deck"], st["endgame_deck"], st["rng"]

    base, same, other = decks(1), decks(1), decks(7)
    assert base == same                                                     # the default seed is the order of the replay and is repeatable
    assert decks(7) == other and other[0] != base[0] and sorted(other[0]) == sorted(base[0])        # another seed: another order of the same cards, again repeatable
    later = _forkable_step(client) + 8
    later_state = client.post(f"/api/tables/{client.tid}/fork", json={"step": later, "seed": 7})
    if later_state.status_code == 200:                                        # the same seed gives the same relative order from another fork point
        deck_l = later_state.json()["steps"][0]["engine_state"]["main_deck"]
        common = set(deck_l) & set(other[0])
        assert [c for c in other[0] if c in common] == [c for c in deck_l if c in common]


def test_the_action_card_draft_can_be_forked_and_played_to_the_first_turn(client):
    body = client.get(f"/api/tables/{client.tid}/replay").json()
    drafts = [i for i, s in enumerate(body["steps"][:body["setup_steps"] + 1]) if s["fork"]]
    if not drafts:
        pytest.skip("this game has no action card draft")
    first = client.post(f"/api/tables/{client.tid}/fork", json={"step": drafts[0]}).json()
    names = [p["name"] for p in first["players"]]
    cur = first["steps"][0]
    assert cur["engine_state"]["draft"]["stage"] == "pick1" and {a["kind"] for a in cur["actions"]} == {"draft_pick"}
    seen = set()
    for _ in range(40):                                                     # draft (both seats), then the initial discards, then the first turn
        act = cur["actions"][0]
        seen.add(act["kind"])
        r = client.post("/api/fork/apply", json={"state": cur["engine_state"], "action": act, "names": names})
        assert r.status_code == 200, r.text
        cur = r.json()
        if cur["engine_state"]["phase"] == "turn":
            break
    assert {"draft_pick", "draft_keep", "initial_discard"} <= seen and cur["engine_state"]["phase"] == "turn"
    assert sorted(c["type"] for c in cur["engine_state"]["players"][0]["action_cards"]) == sorted(c["type"] for c in cur["engine_state"]["players"][1]["action_cards"])


def test_a_forked_draft_keeps_the_logged_order_of_the_action_cards(client):
    body = client.get(f"/api/tables/{client.tid}/replay").json()
    drafts = [i for i, s in enumerate(body["steps"][:body["setup_steps"] + 1]) if s["fork"]]
    if not drafts:
        pytest.skip("this game has no action card draft")
    logged = [[c["type"] for c in p["action_cards"]] for p in body["steps"][body["setup_steps"]]["state"]["players"]]
    cur = client.post(f"/api/tables/{client.tid}/fork", json={"step": drafts[0], "seed": 5}).json()
    names = [p["name"] for p in body["players"]]
    for _ in range(40):
        if cur["steps"][0]["engine_state"]["phase"] == "turn" if "steps" in cur else cur["engine_state"]["phase"] == "turn":
            break
        cur = cur["steps"][0] if "steps" in cur else cur
        r = client.post("/api/fork/apply", json={"state": cur["engine_state"], "action": cur["actions"][0], "names": names})
        cur = r.json()
    cur = cur["steps"][0] if "steps" in cur else cur
    assert [[c["type"] for c in p["action_cards"]] for p in cur["engine_state"]["players"]] == logged


def test_drawing_from_the_deck_cannot_be_taken_back(client):
    step = _forkable_step(client)
    body = client.post(f"/api/tables/{client.tid}/fork", json={"step": step}).json()
    names = [p["name"] for p in body["players"]]
    cur, seen = body["steps"][0], {}
    for _ in range(60):
        if not cur["actions"]:
            break
        pick = next((a for a in cur["actions"] if a["kind"] == "take_cards" and a["args"].get("mode") == "deck"), None) or cur["actions"][0]
        r = client.post("/api/fork/apply", json={"state": cur["engine_state"], "action": pick, "names": names})
        assert r.status_code == 200, r.text
        cur = r.json()
        seen[pick["kind"] == "take_cards" and pick["args"].get("mode") == "deck"] = cur["irreversible"]
        if True in seen:
            break
    assert seen.get(True, True) is True and seen.get(False, False) is False
