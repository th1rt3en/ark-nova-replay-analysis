"""The HTTP side of the mini games and the manifest."""
import hashlib
import hmac
import json
import time

from fastapi.testclient import TestClient

from ark_nova.api.main import create_app
from ark_nova.api.minigames import valid_signature
from ark_nova.config import Settings
from ark_nova.minigames.platform.manifest import load_games, load_manifest
from conftest import make_service

ANON = {"X-Anon-Id": "anon-browser-0001"}


def client(secret="s3cret"):
    svc = make_service()
    return TestClient(create_app(Settings(internal_secret=secret), minigames=svc)), svc


def sign(secret, method, path, body=b"", ts=None):
    ts = str(int(time.time()) if ts is None else ts)
    return {"X-Timestamp": ts, "X-Signature": hmac.new(secret.encode(), f"{ts}.{method}.{path}.{hashlib.sha256(body).hexdigest()}".encode(), hashlib.sha256).hexdigest()}


def test_the_hub_the_puzzle_and_a_submission_over_http():
    c, svc = client()
    svc.rollover()
    hub = c.get("/api/minigames", headers=ANON).json()
    assert {g["key"] for g in hub["games"]} == {"example", "brier"} and hub["today"] == svc.today()
    today = c.get("/api/minigames/example/today", headers=ANON).json()
    assert today["played"] is False and "result" in today and today["public"]["cards"]
    r = c.post("/api/minigames/example/submit", headers=ANON, json={"payload": {"picks": ["c1", "c2"]}})
    assert r.status_code == 200 and "table_id" in r.json()
    assert c.post("/api/minigames/example/submit", headers=ANON, json={"payload": {"picks": ["c1", "c2"]}}).status_code == 409
    assert c.get("/api/minigames/example/today", headers=ANON).json()["played"] is True
    assert c.get("/api/minigames/example/leaderboard?period=month").json()["rows"] == []        # anonymous plays are not ranked


def test_errors_are_json_with_a_code():
    c, svc = client()
    assert c.get("/api/minigames/nope/today").json()["status"] == "no_game"
    assert c.post("/api/minigames/example/submit", json={"payload": {"picks": ["c1", "c2"]}}).json()["status"] == "no_player"    # no X-Anon-Id
    assert c.post("/api/minigames/example/submit", headers=ANON, content=b"not json").status_code == 422
    assert c.get("/api/minigames/example/puzzle/2026-10-09", headers=ANON).json()["status"] == "closed"
    assert c.get("/api/minigames/brier/days?month=2026-10").status_code == 200
    assert c.get("/api/minigames/brier/leaderboard?period=bad").status_code == 422


def test_rollover_needs_a_valid_signature():
    c, svc = client()
    assert c.post("/internal/minigames/rollover").status_code == 401
    assert c.post("/internal/minigames/rollover", headers=sign("wrong", "POST", "/internal/minigames/rollover")).status_code == 401
    assert c.post("/internal/minigames/rollover", headers=sign("s3cret", "POST", "/internal/minigames/rollover", ts=int(time.time()) - 3600)).status_code == 401
    ok = c.post("/internal/minigames/rollover", headers=sign("s3cret", "POST", "/internal/minigames/rollover"))
    assert ok.status_code == 200 and ok.json()["games"] == {"example": "created", "brier": "created"}
    assert not valid_signature("", "POST", "/x", b"", {"x-timestamp": str(int(time.time())), "x-signature": "00"})        # no secret configured: nothing is valid


def test_the_default_app_has_an_empty_hub():
    c = TestClient(create_app(Settings()))
    assert c.get("/api/minigames").json()["games"] == []


def test_the_manifest_skips_disabled_games_and_loads_by_module(tmp_path):
    path = tmp_path / "minigames.json"
    path.write_text(json.dumps([{"key": "example", "module": "example_game", "title": "Example", "blurb": "b"},
                                {"key": "off", "enabled": False, "module": "example_game"},
                                {"key": "gone", "module": "no_such_module_anywhere"},
                                {"key": "wrong", "module": "example_game"}]))
    entries = load_manifest(path)
    assert [e.key for e in entries] == ["example", "gone", "wrong"]
    games = load_games(entries)
    assert list(games) == ["example"]                    # a module that cannot be imported, or that holds another game, only drops itself


def test_the_manifest_refuses_a_key_listed_twice(tmp_path):
    path = tmp_path / "m.json"
    path.write_text(json.dumps([{"key": "a"}, {"key": "a"}]))
    try:
        load_manifest(path)
        assert False
    except ValueError:
        pass


def test_games_do_not_import_each_other():
    """A game package may import the platform, never another game (docs/accounts_plan.md, "Isolation rules")."""
    import re
    from pathlib import Path
    root = Path(__file__).resolve().parents[2] / "src" / "ark_nova" / "minigames"
    games = [p.name for p in root.iterdir() if p.is_dir() and p.name not in ("platform", "__pycache__")]
    for g in games:
        for f in (root / g).rglob("*.py"):
            for other in games:
                if other != g:
                    assert not re.search(rf"ark_nova\.minigames\.{other}\b", f.read_text(encoding="utf-8")), f"{f} imports the game {other}"
    for f in (root / "platform").rglob("*.py"):
        for g in games:
            assert not re.search(rf"ark_nova\.minigames\.{g}\b", f.read_text(encoding="utf-8")), f"the platform imports the game {g}"
