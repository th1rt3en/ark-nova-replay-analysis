"""Sandbox mode: a game against a bot that only passes, set up and edited freely."""
import pytest
from fastapi.testclient import TestClient

from ark_nova.api.main import create_app
from ark_nova.config import Settings
from ark_nova.engine.game import legal_actions
from ark_nova.engine.state import GameState
from ark_nova.replay import sandbox


class Idx:
    def find(self, table_id):
        return None


class Logs:
    def read(self, gcs_path, table_id):
        raise AssertionError("no logs in the sandbox")


@pytest.fixture(scope="module")
def client():
    return TestClient(create_app(Settings(cache_dir="off"), Idx(), Logs()))


def _new(client, mw=True, controller=1, maps=("1", "11")):
    r = client.post("/api/sandbox/new", json={"marine_worlds": mw, "maps": list(maps), "controller": controller})
    assert r.status_code == 200, r.text
    return r.json()


def _edit(client, step, op, args):
    r = client.post("/api/sandbox/edit", json={"state": step["engine_state"], "meta": step["sandbox"], "op": op, "args": args})
    assert r.status_code == 200, r.text
    return r.json()["steps"][0]


def _ready(client, body):
    step = body["steps"][-1]
    step = _edit(client, step, "set_projects", {"slots": [0, 1, 2], "keys": [None] * 3})
    for th, n in (("5", 2), ("8", 2), ("99", 1)):
        for i in range(n if "b" + th in step["sandbox"]["unset"] else 0):
            step = _edit(client, step, "set_bonus", {"threshold": th, "slot": i, "bonus": None})
    assert sandbox.ready(step["sandbox"])
    return step


def test_a_new_game_has_the_chosen_maps_and_a_bot_that_discards_by_itself(client):
    body = _new(client)
    assert [m["id"] for m in body["maps"]] == ["1", "11"] and body["marine_worlds"] and len(body["base_pool"]) >= 12
    assert [p["name"] for p in body["players"]] == ["Bot", "You"]                    # the controller plays seat 2
    first = body["steps"][-1]
    assert first["label"].startswith("Bot") and {a["player"] for a in first["actions"]} == {1}
    assert body["sandbox"]["unset"]["projects"] == [True] * 3 and "b99" in body["sandbox"]["unset"]


def test_nothing_can_be_played_before_the_empty_spaces_are_set(client):
    step = _new(client, mw=False, maps=("1", "5"))["steps"][-1]
    r = client.post("/api/sandbox/apply", json={"state": step["engine_state"], "meta": step["sandbox"], "action": step["actions"][0]})
    assert r.status_code == 422 and "base projects" in r.json()["message"]
    assert "b99" not in step["sandbox"]["unset"]
    step = _ready(client, {"steps": [step]})
    assert len(set(step["engine_state"]["base_projects"])) == 3
    assert all(len(v) == 2 for k, v in step["sandbox"]["initial"].items())


def test_the_bot_only_passes(client):
    step = _ready(client, _new(client, mw=False, controller=0, maps=("1", "5")))
    state = GameState.from_dict(step["engine_state"])
    seen = 0
    for _ in range(14):
        acts = step["actions"]
        if not acts:
            break
        act = next((a for a in acts if a["kind"] == "initial_discard"), None) or next((a for a in acts if a["kind"] == "choose_action_card"), acts[0])
        r = client.post("/api/sandbox/apply", json={"state": step["engine_state"], "meta": step["sandbox"], "action": act})
        assert r.status_code == 200, r.text
        steps = r.json()["steps"]
        assert steps[0]["label"].startswith("You")
        seen += sum(1 for s in steps[1:] if s["label"].startswith("Bot"))
        step = steps[-1]
        assert all(a["player"] == 0 for a in step["actions"])
        if step["engine_state"]["phase"] == "turn" and step["engine_state"]["players"][1]["x_tokens"] > 0:
            break
    assert seen >= 1 and step["engine_state"]["players"][1]["x_tokens"] >= 1               # the bot put an action card back and gained an X token


def test_the_edits(client):
    step = _ready(client, _new(client, controller=0))
    st = GameState.from_dict(step["engine_state"])
    card = st.main_deck[3]
    out = _edit(client, step, "set_value", {"seat": 0, "field": "money", "value": 77})
    assert out["engine_state"]["players"][0]["money"] == 77
    out = _edit(client, out, "add_hand", {"seat": 0, "card": card})
    assert card in out["engine_state"]["players"][0]["hand"] and card not in out["engine_state"]["main_deck"]
    discarded = st.main_discard[0] if st.main_discard else None
    deck_card = out["engine_state"]["main_deck"][0]
    out = _edit(client, out, "set_display", {"index": 0, "card": deck_card})
    shown = out["engine_state"]["display"]
    assert shown[0] == deck_card and len(set(c for c in shown if c)) == len([c for c in shown if c])
    out = _edit(client, out, "set_variant", {"seat": 0, "type": "build", "variant": 3})
    assert next(c for c in out["engine_state"]["players"][0]["action_cards"] if c["type"] == "build")["variant"] == 3
    order = ["build", "cards", "animals", "association", "sponsors"]
    out = _edit(client, out, "reorder", {"seat": 0, "order": order})
    assert [c["type"] for c in out["engine_state"]["players"][0]["action_cards"]] == order
    out = _edit(client, out, "add_tile", {"seat": 0, "tile": "partner", "name": "Africa"})
    assert any(t["type"] == "partner-Africa" for t in out["engine_state"]["players"][0]["tokens"])
    before = sum(1 for t in out["engine_state"]["players"][0]["tokens"] if t["type"] == "worker" and t["location"].startswith("supply_"))
    out = _edit(client, out, "workers", {"seat": 0, "what": "unlock"})
    assert sum(1 for t in out["engine_state"]["players"][0]["tokens"] if t["type"] == "worker" and t["location"].startswith("supply_")) == before - 1
    bad = client.post("/api/sandbox/edit", json={"state": out["engine_state"], "meta": out["sandbox"], "op": "set_value", "args": {"seat": 0, "field": "money", "value": -5}})
    assert bad.status_code == 422


def test_a_setup_game_starts_on_placeholder_maps_and_any_map_can_be_shown(client):
    r = client.post("/api/sandbox/new", json={"marine_worlds": True, "setup": True})
    assert r.status_code == 200 and r.json()["setup"] == {"stage": "seat"} and [m["id"] for m in r.json()["maps"]] == ["1", "1"]
    assert client.get("/api/sandbox/map/12").json()["id"] == "12" and client.get("/api/sandbox/map/nope").status_code == 404


def test_every_map_is_available_with_or_without_marine_worlds(client):
    base = {m["id"] for m in client.get("/api/sandbox/maps?marine_worlds=false").json()["maps"]}
    assert base == {m["id"] for m in client.get("/api/sandbox/maps?marine_worlds=true").json()["maps"]} and "12" in base
    r = client.post("/api/sandbox/new", json={"marine_worlds": False, "maps": ["12", "14"], "controller": 0})
    assert r.status_code == 200, r.text
