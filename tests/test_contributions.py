"""The log an extension brings is kept (GCS all_games_logs/<table>.txt + a BigQuery row with the base projects) on a thread, without making the player wait."""
import json
import threading
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ark_nova.api.main import create_app
from ark_nova.config import Settings
from ark_nova.storage.contributions import Contributions

ROOT = Path(__file__).resolve().parents[1]
LOG = ROOT / "log_examples" / "607674960.json"


class FakeBlob:
    def __init__(self, store, name):
        self.store, self.name = store, name

    def exists(self):
        return self.name in self.store

    def upload_from_string(self, data, content_type=None, if_generation_match=None):
        assert if_generation_match == 0                         # (never overwrites)
        self.store[self.name] = data

    def download_as_bytes(self):
        return self.store[self.name]

    def delete(self):
        del self.store[self.name]


class FakeGcs:
    def __init__(self):
        self.objects, self.buckets = {}, []

    def bucket(self, name):
        self.buckets.append(name)
        return self

    def blob(self, name):
        return FakeBlob(self.objects, name)


class FakeBq:
    def __init__(self, errors=None):
        self.rows, self.errors = [], errors or []

    def query(self, sql, job_config=None):                      # (the newest row of the table that has the maps)
        mine = [r for _, r in self.rows if r.get('maps') is not None]
        outer = self

        class Job:
            def result(self):
                return mine[-1:] if outer.rows else []
        return Job()

    def insert_rows_json(self, table, rows):
        self.rows += [(table, r) for r in rows]
        return self.errors


def _kept(bq_errors=None):
    c = Contributions("bucket", "p.d.t")
    c._gcs, c._bq = FakeGcs(), FakeBq(bq_errors)
    return c


def test_the_log_and_the_base_projects_are_kept_once():
    c = _kept()
    assert c.keep(7, {"data": {"logs": []}}, ["P101", "P102", "P103"]) is True
    assert json.loads(c._gcs.objects["all_games_logs/7.txt"]) == {"data": {"logs": []}}
    (table, row), = c._bq.rows
    assert table == "p.d.t" and (row["table_id"], row["base_0"], row["base_1"], row["base_2"]) == (7, "P101", "P102", "P103") and row["created_at"]
    assert c.keep(7, {"data": {"logs": []}}, ["P101", "P102", "P103"]) is False         # (a reload brings the same log again: nothing is written twice)
    assert len(c._bq.rows) == 1


def test_a_refused_row_takes_the_log_back_so_both_are_tried_again():
    c = _kept(bq_errors=[{"index": 0}])
    with pytest.raises(RuntimeError):
        c.keep(7, {}, ["P101", "P102", "P103"])
    assert c._gcs.objects == {}


def test_nothing_is_kept_without_a_bucket():
    c = Contributions()
    c.submit(7, {}, (["P101", "P102", "P103"], {}))
    assert not c._busy


def test_the_upload_does_not_wait_for_it():
    if not LOG.exists():
        pytest.skip("log not available")
    seen, release = [], threading.Event()

    class Slow(Contributions):
        def keep(self, table_id, raw, projects, extras=None):
            release.wait(30)                                    # (as slow as it likes: the answer must not wait)
            seen.append((table_id, projects))
            return True

    class Idx:
        def find(self, table_id):
            return None

    class Logs:
        def read(self, *a):
            raise AssertionError

    client = TestClient(create_app(Settings(cache_dir="off"), Idx(), Logs(), contributions=Slow("b")))
    body = '{"log":' + LOG.read_text(encoding="utf-8") + ',"index":null'
    assert client.post("/api/tables/607674960/upload", content=(body + ',"quick":true}').encode()).status_code == 200
    assert not seen and not release.is_set()                    # (the quick answer keeps nothing)
    r = client.post("/api/tables/607674960/upload", content=(body + "}").encode())
    assert r.status_code == 200 and not seen                    # (the answer is here while the keeping still waits)
    release.set()
    for _ in range(100):
        if seen:
            break
        time.sleep(0.1)
    assert seen and seen[0][0] == 607674960 and len(seen[0][1]) == 3


def _client(contributions):
    class Idx:
        def find(self, table_id):
            return None

    class Logs:
        def read(self, *a):
            raise AssertionError

    return TestClient(create_app(Settings(cache_dir="off"), Idx(), Logs(), contributions=contributions))


def test_a_kept_log_opens_without_the_upload():
    if not LOG.exists():
        pytest.skip("log not available")
    c = _kept()
    client = _client(c)
    assert client.get("/api/tables/607674960/kept").json() == {"kept": False, "complete": False}
    body = b'{"log":null,"kept":true,"index":null,"quick":true}'
    r = client.post("/api/tables/607674960/upload", content=body)
    assert r.status_code == 409 and r.json()["status"] == "not_kept"                # (nothing kept: the page sends the log)
    c._gcs.objects["all_games_logs/607674960.txt"] = LOG.read_bytes()
    assert client.get("/api/tables/607674960/kept").json() == {"kept": True, "complete": False}
    r = client.post("/api/tables/607674960/upload", content=body)
    assert r.status_code == 200 and r.json()["steps"]
    r = client.post("/api/tables/607674960/fork", content=b'{"kept":true,"step":0}')
    assert r.status_code != 409                                                    # (the fork reads the kept log as well)


def test_nothing_is_kept_when_storage_is_off():
    client = _client(Contributions())
    assert client.get("/api/tables/7/kept").json() == {"kept": False, "complete": False}
    assert client.post("/api/tables/7/upload", content=b'{"log":null,"kept":true}').status_code == 409

INFO = ROOT / "tests" / "fixtures" / "tableinfos_607674960.json"


def _extras():
    from ark_nova.storage.tableinfo import elos_from_tableinfo, maps_from_tableinfo, marine_worlds_of, same_map_of

    info = json.loads(INFO.read_text(encoding="utf-8"))["data"]
    return {"maps": maps_from_tableinfo(info), "elos": elos_from_tableinfo(info), "same_map": same_map_of(info), "marine_worlds": marine_worlds_of(info)}


def test_the_row_carries_the_maps_and_the_elo():
    c = _kept()
    extras = _extras()
    assert c.keep(7, {"data": {"logs": []}}, ["P101", "P102", "P103"], extras) is True
    (_, row), = c._bq.rows
    assert json.loads(row["maps"]) == extras["maps"] and json.loads(row["elos"]) == extras["elos"] and row["elos_after"] is None and row["marine_worlds"] == extras["marine_worlds"]


def test_a_log_kept_without_the_maps_gets_a_row_with_them_once():
    c = _kept()
    c.keep(7, {"data": {"logs": []}}, ["P101", "P102", "P103"])                           # (kept before the maps were: no maps in its row)
    assert len(c._bq.rows) == 1 and c.record(7) is None
    extras = _extras()
    assert c.keep(7, None, ["P101", "P102", "P103"], extras) is True                      # (a later open brings them: a newer row)
    assert len(c._bq.rows) == 2 and c.record(7)["maps"] == extras["maps"]
    c._rows.clear()
    assert c.keep(7, None, ["P101", "P102", "P103"], extras) is False                      # (and not again)
    assert len(c._bq.rows) == 2


def test_a_kept_table_opens_like_a_logged_one_and_is_cached():
    if not LOG.exists():
        pytest.skip("log not available")
    c = _kept()
    client = _client(c)
    assert client.get("/api/tables/607674960/replay").status_code == 404                  # (nothing kept)
    c._gcs.objects["all_games_logs/607674960.txt"] = LOG.read_bytes()
    c._bq.rows.append(("t", {"table_id": 607674960, "base_0": "P101", "base_1": "P102", "base_2": "P103", "maps": json.dumps(_extras()["maps"]), "elos": json.dumps(_extras()["elos"]),
                             "elos_after": None, "elo_changes": None, "same_map": False, "marine_worlds": _extras()["marine_worlds"]}))
    assert client.get("/api/tables/607674960/kept").json() == {"kept": True, "complete": True}
    r = client.get("/api/tables/607674960/replay")
    assert r.status_code == 200 and r.headers["etag"]
    view = r.json()
    assert [p["elo"] for p in view["players"]] == [_extras()["elos"][p["id"]] for p in view["players"]]
    assert view["elo_estimated"] is True and sorted(p["elo_change"] for p in view["players"])[0] == -sorted(p["elo_change"] for p in view["players"])[1]
    assert client.get("/api/tables/607674960/replay", headers={"If-None-Match": r.headers["etag"]}).status_code == 304