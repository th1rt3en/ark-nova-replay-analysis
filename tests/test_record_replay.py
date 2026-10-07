"""Replaying a recorded live game without the engine (docs/live_game_plan.md 9.3)."""
import gzip
import json
import random
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ark_nova.api.main import create_app
from ark_nova.config import Settings
from ark_nova.engine.actions import Action
from ark_nova.engine.game import apply
from ark_nova.engine.game import new_game
from ark_nova.live import archive as arch
from ark_nova.live import jsonpatch as jp
from ark_nova.live import registry as reg
from ark_nova.live.fake import FakeKeeper
from ark_nova.live.service import LiveService
from ark_nova.replay import from_record
from ark_nova.replay.view import state_view
from test_live_service import Idx, Logs, _join_both, _play, _start

FIXTURES = Path(__file__).parent / "fixtures"
SRC = Path(__file__).resolve().parents[1] / "src"


def _world():
    keeper, registry, archive = FakeKeeper(), reg.FakeRegistry(), arch.FakeArchive()
    service = LiveService(keeper, engine_version="test", registry=registry, archive=archive)
    return TestClient(create_app(Settings(cache_dir="off"), Idx(), Logs(), live=service)), keeper, registry, archive, service


def _recorded_game(moves=140, seed=2):
    """Play a game with scripted clients (their random choices include undo, restart and confirm), concede it, return (record, the engine's final state, ids)."""
    client, keeper, registry, archive, service = _world()
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    assert _play(players, moves, random.Random(seed)) == moves
    final = apply(service._cache[game_id].state, Action(0, "concede", {}))                 # (the concession is the last move of the game)
    assert players[0].c.post(f"/api/games/{game_id}/concede", headers=players[0].h, json={}).status_code == 200
    path = registry.latest(game_id)["gcs_path"]
    return arch.decode(archive.read(path)), final, (client, game_id, service)


def test_the_json_patch_reproduces_what_it_was_made_from():
    rng = random.Random(1)

    def rand(depth=0):
        k = rng.random()
        if depth > 3 or k < 0.4:
            return rng.choice([1, 2, "a", "b", None, True, 3.5])
        if k < 0.7:
            return {rng.choice("abcdef"): rand(depth + 1) for _ in range(rng.randint(0, 5))}
        return [rand(depth + 1) for _ in range(rng.randint(0, 5))]
    for _ in range(300):
        a, b = rand(), rand()
        assert jp.apply(a, jp.diff(a, b)) == b
    big = {"players": [{"hand": list("abcdefgh"), "money": 5} for _ in range(2)], "deck": list(range(200)), "x": {"y": 1}}
    other = json.loads(json.dumps(big))
    other["players"][1]["money"] = 9
    assert jp.diff(big, other) == {"[]": {}} or len(json.dumps(jp.diff(big, other))) < 120                  # a small change is a small patch


def test_the_replay_of_a_record_is_the_effective_history_and_matches_the_engine():
    record, final, _ = _recorded_game()
    controls = [s for s in record["steps"] if s["step"]["control"]]
    assert controls and any(s["step"]["control"]["type"] == "restart" for s in controls) or any(s["step"]["control"]["type"] == "undo" for s in controls)
    body = from_record.replay_from_record(record)
    kept = from_record.effective_steps(record["steps"])
    assert [st["index"] for st in body["steps"]] == list(range(len(kept) + 1))                  # numbered 0..N, no gaps
    assert not any(("took back" in st["label"] or "restarted" in st["label"]) for st in body["steps"])      # no step of an undo or a restart
    # refold only the effective actions with the engine: every step of the replay is the state the engine reaches
    st = new_game(record["options"], record["player_ids"], record["tail_seed"])
    assert _same(body["steps"][0]["state"], state_view(st))
    for step, item in zip(body["steps"][1:], kept):
        a = item["step"]["action"]
        st = apply(st, Action(a["player"], a["kind"], a["args"]))
        assert _same(step["state"], state_view(st)), step["index"]
    assert _same(body["steps"][-1]["state"], state_view(final))
    assert body["recorded"]["status"] == "conceded" and body["players"][0]["name"] == "Player 0" and body["engine"] is None
    assert body["setup_steps"] >= 1 and all(s["engine"]["status"] == "ok" for s in body["steps"])


def _same(shown: dict, view: dict) -> bool:
    shown = {k: v for k, v in shown.items() if k != "main_deck_known"}
    return json.loads(json.dumps(shown)) == json.loads(json.dumps(view))


def test_a_broken_record_is_refused_not_shown_wrong():
    record, _, _ = _recorded_game(40)
    bad = json.loads(json.dumps(record))
    full = next(s for s in bad["steps"] if s["step"].get("full") is not None)
    full["step"]["full"]["round"] = 99
    with pytest.raises(from_record.RecordError):
        from_record.replay_from_record(bad)
    old = json.loads(json.dumps(record))
    old["viewer"]["viewer_schema_version"] = 99
    with pytest.raises(from_record.RecordError):
        from_record.replay_from_record(old)


def test_the_reader_never_imports_the_engine(tmp_path):
    record, _, _ = _recorded_game(60)
    f = tmp_path / "record.json.gz"
    f.write_bytes(gzip.compress(json.dumps(record).encode()))
    code = (
        "import sys, gzip, json\n"
        "sys.modules['ark_nova.engine'] = None                   # an import of the engine now fails\n"
        "from ark_nova.replay.from_record import replay_from_record\n"
        f"body = replay_from_record(json.loads(gzip.decompress(open(r'{f}', 'rb').read())))\n"
        "assert len(body['steps']) > 3\n"
        "loaded = [m for m, v in sys.modules.items() if m.startswith('ark_nova.engine') and v is not None]\n"
        "assert not loaded, loaded\n"
        "print('ok', len(body['steps']))\n")
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env={"PYTHONPATH": str(SRC), "SYSTEMROOT": r"C:\Windows"})
    assert out.returncode == 0 and out.stdout.startswith("ok"), out.stderr[-800:]


def test_a_record_of_every_viewer_format_still_opens():
    for f in sorted(FIXTURES.glob("record_v*.json.gz")):
        body = from_record.replay_from_record(json.loads(gzip.decompress(f.read_bytes())))
        assert len(body["steps"]) > 5 and body["steps"][0]["state"]["phase"], f.name


def test_the_replay_route_and_the_lookup_of_a_live_table():
    record, final, (client, game_id, service) = _recorded_game(60)
    r = client.get(f"/api/tables/{game_id}/replay")
    assert r.status_code == 200 and len(r.json()["steps"]) > 10 and r.json()["steps"][0]["index"] == 0
    assert client.get(f"/api/lookup?q={game_id}").json() == {"status": "ready", "table_id": game_id, "next": f"/replay.html?table={game_id}"}
    assert client.get("/api/lookup?q=e" + game_id[1:]).json()["status"] == "ready"
    assert client.get("/api/tables/E4242/replay").status_code == 404 and client.get("/api/lookup?q=E4242").status_code == 404
    running_id, players = _start(client)
    _join_both(client, running_id, players)
    assert client.get(f"/api/tables/{running_id}/replay").status_code == 409
    assert client.get(f"/api/lookup?q={running_id}").json()["game_status"] == "playing"


def test_a_game_with_chosen_maps_records_and_replays_with_them():
    client, keeper, registry, archive, service = _world()
    g = client.post("/api/games", json={"game_mode": "original"}).json()
    from test_live_service import Player
    players = [Player(client, g["game_id"], t, random.Random(1)) for t in g["tokens"]]
    _join_both(client, g["game_id"], players)
    for p in players:
        v = p.state()
        assert p.move(v["version"], v["decision"]["actions"][0]).status_code == 200
    assert _play(players, 25, random.Random(3)) == 25
    assert players[0].c.post(f"/api/games/{g['game_id']}/concede", headers=players[0].h, json={}).status_code == 200
    record = arch.decode(archive.read(registry.latest(g["game_id"])["gcs_path"]))
    assert len(record["maps"]) == 2 and len(record["viewer"]["maps"]) == 2 and record["options"]["game_mode"] == "original"
    body = from_record.replay_from_record(record)
    assert len(body["maps"]) == 2 and body["steps"][0]["state"]["players"][0]["map_id"] == "" and body["steps"][-1]["state"]["players"][0]["map_id"]
    assert registry.latest(g["game_id"])["maps"] == record["maps"]
