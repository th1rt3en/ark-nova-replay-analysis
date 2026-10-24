"""A replay of a log the browser brings, with the table info of the extension: a table that is not indexed can be replayed, and its players get their Elo."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ark_nova.api.main import create_app
from ark_nova.config import Settings

ROOT = Path(__file__).resolve().parents[1]
LOG = ROOT / "log_examples" / "607674960.json"
INFO = ROOT / "tests" / "fixtures" / "tableinfos_607674960.json"


class Idx:
    def find(self, table_id):
        return None                                      # nothing is indexed


class Logs:
    def read(self, gcs_path, table_id):
        raise AssertionError("no stored log is read here")


@pytest.fixture(scope="module")
def client():
    if not LOG.exists():
        pytest.skip("log not available")
    return TestClient(create_app(Settings(cache_dir="off"), Idx(), Logs()))


def _body(log_text: str, index) -> bytes:
    return ('{"log":' + log_text + ',"index":' + (json.dumps(index) if index is not None else "null") + "}").encode()


def test_an_unindexed_table_replays_with_the_elo_of_its_players(client):
    info = json.loads(INFO.read_text(encoding="utf-8"))["data"]
    r = client.post("/api/tables/607674960/upload", content=_body(LOG.read_text(encoding="utf-8"), info))
    assert r.status_code == 200
    got = {p["id"]: p["elo"] for p in r.json()["players"]}
    assert got == {"95347471": 358, "89641657": 391}
    assert r.json()["steps"]


def test_the_table_info_must_be_about_the_same_table(client):
    info = json.loads(INFO.read_text(encoding="utf-8"))["data"]
    info["id"] = "123456789"
    r = client.post("/api/tables/607674960/upload", content=_body(LOG.read_text(encoding="utf-8"), info))
    assert r.status_code == 422


def test_without_table_info_the_replay_still_works(client):
    r = client.post("/api/tables/607674960/upload", content=_body(LOG.read_text(encoding="utf-8"), None))
    assert r.status_code == 200 and all(p["elo"] is None for p in r.json()["players"])


def test_an_unindexed_log_is_verified(client):
    r = client.post("/api/tables/607674960/verify", content=LOG.read_bytes())
    assert r.status_code == 200 and r.json() == {"ok": True, "errors": []}
    assert client.post("/api/tables/123456789/verify", content=LOG.read_bytes()).status_code == 422       # another table's log


def test_same_map_for_all_players_gives_both_players_one_map(client):
    """Table 930655556 was played with "Same map for all players" (option 102 = 5): both seats are on the map that the log shows (3a: Silver Lake there)."""
    info = json.loads(INFO.read_text(encoding="utf-8"))["data"]
    info["options"]["102"]["value"] = "5"
    del info["result"]["stats"]["player"]["map"]           # (without the maps of the table info: the log has to tell)
    r = client.post("/api/tables/607674960/upload", content=_body(LOG.read_text(encoding="utf-8"), info))
    assert r.status_code == 200
    ids = [m["id"] for m in r.json()["maps"]]
    assert len(ids) == 2 and ids[0] == ids[1]


def test_both_maps_come_from_the_table_info(client):
    """The table info gives each player's map (stats.player.map): the replay uses them, and the Marine Worlds flag of the table info (option 111)."""
    info = json.loads(INFO.read_text(encoding="utf-8"))["data"]
    r = client.post("/api/tables/607674960/upload", content=_body(LOG.read_text(encoding="utf-8"), info))
    assert [m["id"] for m in r.json()["maps"]] == ["10", "9"]              # (seat order: SylAce10 is seat 0, on map 10)
    info["result"]["stats"]["player"]["map"]["values"] = {"95347471": "3a", "89641657": "3a"}
    info["result"]["stats"]["player"]["map"]["valuelabels"] = {"95347471": "Map 3a: Silver Lake", "89641657": "Map 3a: Silver Lake"}
    r = client.post("/api/tables/607674960/upload", content=_body(LOG.read_text(encoding="utf-8"), info))
    assert [m["id"] for m in r.json()["maps"]] == ["3a", "3a"]


def _projects_body(log_text: str, projects) -> bytes:
    return ('{"log":' + log_text + ',"index":null,"base_projects":' + json.dumps(projects) + "}").encode()


def test_the_extension_sends_the_base_projects_the_log_never_shows(client):
    """Table 603637393 shows two of the three base projects (P106 on base_0, P110 on base_1): the extension reads the third off BGA's replay."""
    log = ROOT / "log_examples" / "603637393.json"
    if not log.exists():
        pytest.skip("log not available")
    text = log.read_text(encoding="utf-8")
    r = client.post("/api/tables/603637393/upload", content=_projects_body(text, ["P106", "P110", "P111"]))
    assert r.status_code == 200 and r.json()["base_projects"] == ["P106", "P110", "P111"]
    r = client.post("/api/tables/603637393/upload", content=_projects_body(text, ["P111", "P106", "P110"]))      # (the order is the board's: the position of each project)
    assert r.json()["base_projects"] == ["P111", "P106", "P110"]


def test_base_projects_that_are_not_three_different_ones_are_ignored(client):
    log = ROOT / "log_examples" / "603637393.json"
    if not log.exists():
        pytest.skip("log not available")
    text = log.read_text(encoding="utf-8")
    inferred = client.post("/api/tables/603637393/upload", content=_projects_body(text, None)).json()["base_projects"]
    for bad in (["P106", "P106", "P110"], ["P106", "P110"], ["P106", "P110", "S201"], ["P106", "P110", "P999"], "P106,P110,P111"):
        r = client.post("/api/tables/603637393/upload", content=_projects_body(text, bad))
        assert r.status_code == 200 and r.json()["base_projects"] == inferred
