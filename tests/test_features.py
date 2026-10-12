"""Features switched off for the public (DISABLED_FEATURES): their routes answer "coming soon"; the replay, the fork and the internal routes keep working."""
from pathlib import Path

from fastapi.testclient import TestClient

from ark_nova.api.main import create_app
from ark_nova.config import Settings
from ark_nova.storage.index import TableRecord
from ark_nova.storage.logs import LogNotFound

LOG_DIR = Path(__file__).resolve().parents[1] / "log_examples"
TID = 607674960


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


def _client(disabled: frozenset):
    path = LOG_DIR / f"{TID}.json"
    if not path.exists():
        return None
    return TestClient(create_app(Settings(cache_dir="off", disabled_features=disabled), Idx(TableRecord(TID, "x.json")), Logs({"x.json": path.read_bytes()})))


def test_the_environment_switches_features_off(monkeypatch):
    monkeypatch.setenv("DISABLED_FEATURES", " Live, sandbox ,, minigames")
    assert Settings.from_env().disabled_features == frozenset({"live", "sandbox", "minigames"})
    monkeypatch.delenv("DISABLED_FEATURES")
    assert Settings.from_env().disabled_features == frozenset()


def test_disabled_features_answer_coming_soon_and_the_replay_stays():
    c = _client(frozenset({"live", "accounts", "minigames", "sandbox"}))
    if c is None:
        return
    for path in ("/api/games/E1", "/api/live/config", "/api/auth/me", "/api/players/1", "/api/leaderboard/ratings", "/api/minigames/whos_ahead/today", "/api/sandbox/maps"):
        r = c.get(path)
        assert r.status_code == 404 and r.json()["status"] == "coming_soon", path
    assert c.get(f"/api/tables/{TID}/replay").status_code == 200                       # the replay
    assert c.get(f"/api/lookup?q={TID}").json()["status"] == "ready"                   # the lookup of the start page
    internal = c.post("/internal/minigames/rollover")
    assert internal.json().get("status") != "coming_soon"                             # the daily rollover still answers (it is signed, so refused without the signature)


def test_nothing_is_switched_off_by_default():
    c = _client(frozenset())
    if c is None:
        return
    assert c.get("/api/sandbox/maps").status_code == 200
