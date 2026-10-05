import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ark_nova.api.main import create_app
from ark_nova.api.tableid import parse_table_id
from ark_nova.config import Settings
from ark_nova.parser.verify import verify_log
from ark_nova.storage.index import TableRecord
from ark_nova.storage.logs import LogNotFound

LOG_DIR = Path(__file__).resolve().parents[1] / "log_examples"


class Idx:
    def __init__(self, *records):
        self.records = {r.table_id: r for r in records}

    def find(self, table_id):
        return self.records.get(table_id)


class Logs:
    def __init__(self, files=None):
        self.files = files or {}

    def read(self, gcs_path, table_id):
        if gcs_path not in self.files:
            raise LogNotFound(gcs_path)
        return self.files[gcs_path]


def client(*records, files=None):
    return TestClient(create_app(Settings(), Idx(*records), Logs(files)))


def sample_log():
    path = next((p for p in sorted(LOG_DIR.glob("*.json")) if p.stat().st_size < 12_000_000 and p.stem != "573904205"), None)
    if path is None:
        pytest.skip("no log examples")
    return path, json.loads(path.read_text("utf8"))


@pytest.mark.parametrize("text,expected", [
    ("924000095", 924000095),
    ("  924000095 ", 924000095),
    ("https://boardgamearena.com/table?table=924000095", 924000095),
    ("https://en.boardgamearena.com/table?table=924000095&foo=1", 924000095),
    ("boardgamearena.com/table?table=924000095", 924000095),
    ("https://boardgamearena.com/gamereview?table=924000095", 924000095),
    ("https://boardgamearena.com/#!table?table=924000095", 924000095),
    ("https://example.com/table?table=924000095", None),
    ("https://boardgamearena.com/table", None),
    ("abc", None),
    ("", None),
])
def test_parse_table_id(text, expected):
    assert parse_table_id(text) == expected


def test_healthz():
    assert client().get("/healthz").json() == {"status": "ok"}


def test_lookup_invalid():
    r = client().get("/api/lookup", params={"q": "nonsense"})
    assert r.status_code == 400 and r.json()["status"] == "invalid"


def test_lookup_not_indexed_requests_indexing(caplog):
    with caplog.at_level("INFO"):
        r = client().get("/api/lookup", params={"q": "123"})
    assert r.status_code == 404 and r.json()["status"] == "not_indexed"
    assert "indexed yet" in r.json()["message"] and "123" in caplog.text


def test_lookup_indexed_not_logged_goes_to_submit_page():
    r = client(TableRecord(5)).get("/api/lookup", params={"q": "https://boardgamearena.com/table?table=5"})
    assert r.json() == {"status": "needs_log", "table_id": 5, "next": "/submit.html?table=5"}


def test_lookup_logged_goes_to_replay():
    r = client(TableRecord(5, "gs://b/x.json")).get("/api/lookup", params={"q": "5"})
    assert r.json() == {"status": "ready", "table_id": 5, "next": "/replay.html?table=5"}


def test_lookup_rejects_non_2p():
    rec = TableRecord(5, "gs://b/x.json", {"1": "1", "2": "2", "3": "3"})
    r = client(rec).get("/api/lookup", params={"q": "5"})
    assert r.status_code == 422 and r.json()["status"] == "unsupported"


def test_table_config():
    r = client(TableRecord(5, "gs://b/x.json", {"1": "3a", "2": "1"}, True)).get("/api/tables/5")
    assert r.status_code == 200
    assert r.json() == {"status": "logged", "table_id": 5, "logged": True, "player_maps": {"1": "3a", "2": "1"}, "marine_worlds": True}
    assert client().get("/api/tables/5").status_code == 404


def test_log_download_from_gcs():
    c = client(TableRecord(5, "gs://b/x.json"), TableRecord(6, "gs://b/gone.json"), TableRecord(7), files={"gs://b/x.json": b'{"a": 1}'})
    assert c.get("/api/tables/5/log").json() == {"a": 1}
    assert c.get("/api/tables/6/log").status_code == 502
    assert c.get("/api/tables/7/log").status_code == 404
    assert c.get("/api/tables/8/log").status_code == 404


def test_verify_accepts_real_log():
    path, raw = sample_log()
    table_id = int(path.stem)
    assert verify_log(raw, table_id) == []
    r = client(TableRecord(table_id)).post(f"/api/tables/{table_id}/verify", content=path.read_bytes())
    assert r.status_code == 200 and r.json() == {"ok": True, "errors": []}


def test_verify_rejects_wrong_table_and_garbage():
    path, raw = sample_log()
    table_id = int(path.stem)
    assert any("not table" in e for e in verify_log(raw, table_id + 1))
    c = client(TableRecord(table_id + 1))
    r = c.post(f"/api/tables/{table_id + 1}/verify", content=path.read_bytes())
    assert r.status_code == 422 and not r.json()["ok"]
    assert c.post(f"/api/tables/{table_id + 1}/verify", content=b"not json").json()["errors"] == ["The file is not valid JSON."]
    assert c.post("/api/tables/999/verify", content=b"{}").status_code == 404


def test_verify_rejects_other_games_and_unfinished():
    assert verify_log([1, 2]) and verify_log({"data": {"logs": []}})
    other = {"data": {"players": [{"id": 1}, {"id": 2}], "logs": [
        {"channel": "/table/t1", "table_id": 1, "packet_id": 1, "move_id": 1, "time": 1, "data": [{"type": "somethingElse", "args": {}}]}]}}
    assert any("Ark Nova" in e for e in verify_log(other))
    _, raw = sample_log()
    cut = {"data": {**raw["data"], "logs": [p for p in raw["data"]["logs"]
                                            if not any(e["type"] == "finalScoring" or (e["type"] == "gameStateChange" and isinstance(e["args"], dict)
                                                                                      and e["args"].get("id") == 99) for e in p["data"])]}}
    assert any("not finished" in e for e in verify_log(cut))
    three = {"data": {**raw["data"], "players": raw["data"]["players"] + [{"id": 1, "name": "x"}]}}
    assert any("2-player" in e for e in verify_log(three))


def test_pages_served():
    c = client()
    assert "Ark Nova Replay" in c.get("/").text
    for page in ("submit.html", "guide.html", "replay.html", "style.css", "js/logstore.js"):
        assert c.get("/" + page).status_code == 200


def test_map_id_from_bigquery_name():
    from ark_nova.storage.index import map_id
    assert [map_id(x) for x in ["Map T1: Tournament 1", "Map 0", "Map A", "Map 3a: Silver Lake", "Map 10: Rescue Station"]] == ["T1", "0", "A", "3a", "10"]


def test_find_table_line_scans_archive_lines():
    from ark_nova.storage.logs import find_table_line

    def line(tid, extra=""):
        doc = {"status": 1, "data": {"logs": [{"channel": f"/table/t{tid}", "table_id": str(tid), "packet_id": "1"}], "x": extra}}
        return (json.dumps(doc) + "\n").encode()

    lines = [line(11), line(1234), line(123, 'x "table_id": "999"'), line(5)]
    assert find_table_line(iter(lines), 123) == lines[2]
    assert find_table_line(iter(lines), 5) == lines[3]
    assert find_table_line(iter(lines), 12) is None      # no prefix matching
    assert json.loads(find_table_line(iter(lines), 11))["status"] == 1


def test_ttl_cache_expiry_and_eviction():
    from ark_nova.storage.cache import TTLCache

    now = [0.0]
    cache, calls = TTLCache(max_size=2, clock=lambda: now[0]), []

    def load(v):
        calls.append(v)
        return v

    ttl = lambda v: 10 if v else 1  # noqa: E731
    assert cache.get_or_load("a", lambda: load([1]), ttl) == [1] and cache.get_or_load("a", lambda: load([2]), ttl) == [1]
    assert cache.get_or_load("e", lambda: load([]), ttl) == []
    now[0] = 2                                  # the empty result expired, the non-empty one did not
    assert cache.get_or_load("e", lambda: load([3]), ttl) == [3] and cache.get_or_load("a", lambda: load([4]), ttl) == [1]
    cache.get_or_load("x", lambda: load([5]), ttl)   # max_size 2: the least recently used key ("e") is evicted
    assert cache.get_or_load("e", lambda: load([6]), ttl) == [6]
    assert calls == [[1], [], [3], [5], [6]]


def test_bigquery_index_caches_each_query():
    from ark_nova.storage.index import BigQueryIndex

    idx = BigQueryIndex("stats", "logs")
    calls = []

    def run(sql, table_id):
        calls.append((sql.split("FROM")[1].split()[0], table_id))
        return [{"table_id": 5, "player_id": 1, "map": "Map 3a: Silver Lake", "is_mw": 1}] if "stats" in sql else []

    idx._run = run
    for _ in range(3):
        rec = idx.find(5)
    assert rec == TableRecord(5, None, {"1": "3a"}, True)
    assert calls == [("`stats`", 5), ("`logs`", "5")]


def test_replay_endpoints_build_steps_from_a_log():
    path, raw = sample_log()
    table_id = int(path.stem)
    c = client(TableRecord(table_id, "x.json"), files={"x.json": path.read_bytes()})
    for r in (c.get(f"/api/tables/{table_id}/replay"), c.post(f"/api/tables/{table_id}/replay", content=path.read_bytes())):
        assert r.status_code == 200
        body = r.json()
        assert len(body["players"]) == 2 and len(body["maps"]) == 2 and body["steps"]
        state = body["steps"][-1]["state"]
        assert "main_deck" not in state and state["main_deck_size"] >= 0
        assert all(k in body["cards"] for k in state["display"] if k)
        assert all("cells" in b for p in state["players"] for b in p["buildings"])
    assert c.post(f"/api/tables/{table_id}/replay", content=b"[]").status_code == 422
    assert c.get("/api/tables/1/replay").status_code == 404


def test_setup_steps_show_the_deal_before_the_initial_discard():
    path, raw = sample_log()
    body = client(TableRecord(int(path.stem), "x.json"), files={"x.json": path.read_bytes()}).get(f"/api/tables/{path.stem}/replay").json()
    hands = [[len(p["hand"]) for p in s["state"]["players"]] for s in body["steps"][:body["setup_steps"] + 1]]
    assert hands[0] == [0, 0]                                   # nothing has been dealt at the literal start
    assert max(h[0] for h in hands) >= 8                        # the 8 dealt cards (9 with Map 14's sponsor) are visible
    assert hands[-1][0] <= 5                                    # after the initial discard of 4
