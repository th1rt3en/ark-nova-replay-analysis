"""Caches for the logs read from GCS and the replays built from them: a finished game never changes, so a refresh must not read or build again."""
from pathlib import Path

from fastapi.testclient import TestClient

from ark_nova.api.main import create_app
from ark_nova.config import Settings
from ark_nova.storage.index import TableRecord
from ark_nova.storage.logs import ByteLru, CachedLogStore, LogNotFound

LOG_DIR = Path(__file__).resolve().parents[1] / "log_examples"


class CountingStore:
    def __init__(self, files):
        self.files, self.reads = files, 0

    def read(self, gcs_path, table_id):
        self.reads += 1
        if gcs_path not in self.files:
            raise LogNotFound(gcs_path)
        return self.files[gcs_path]


def test_byte_lru_evicts_the_least_recently_used_from_memory():
    c = ByteLru(10)
    c.put("a", b"1234")
    c.put("b", b"5678")
    assert c.get("a") == b"1234"                   # a is now the most recent
    c.put("c", b"abcd")                            # 12 bytes > 10: b goes
    assert c.get("b") is None and c.get("a") == b"1234" and c.get("c") == b"abcd"
    c.put("big", b"x" * 11)                        # larger than the whole cache: not kept
    assert c.get("big") is None


def test_entries_that_do_not_fit_in_memory_spill_to_files(tmp_path):
    c = ByteLru(10, spill=tmp_path, namespace="t")
    c.put("a", b"1234")
    c.put("b", b"5678")
    c.put("c", b"abcd")                            # a leaves memory (in a new cache it is read from its file)
    fresh = ByteLru(10, spill=tmp_path, namespace="t")
    assert fresh.get("a") == b"1234" and fresh.get("b") == b"5678" and fresh.get("c") == b"abcd"
    c.put("huge", b"x" * 50)                       # too big for memory: it still lives in its file
    assert ByteLru(10, spill=tmp_path, namespace="t").get("huge") == b"x" * 50


def test_the_files_are_bounded_and_the_oldest_go_first(tmp_path):
    import os
    c = ByteLru(4, spill=tmp_path, spill_bytes=9, namespace="t")
    for i, key in enumerate("ab"):
        c.put(key, key.upper().encode() * 4)
        os.utime(c._file(key), (1000 + i, 1000 + i))             # (file times a second apart, so "oldest" is certain)
    c.put("c", b"CCCC")                                            # 12 bytes of files > 9: the oldest, a, is removed
    fresh = ByteLru(4, spill=tmp_path, spill_bytes=9, namespace="t")
    assert fresh.get("a") is None
    assert fresh.get("b") == b"BBBB" and fresh.get("c") == b"CCCC"


def test_cached_log_store_reads_each_log_once(tmp_path):
    inner = CountingStore({"x.json": b'{"a": 1}'})
    store = CachedLogStore(inner, 1024, str(tmp_path))
    assert [store.read("x.json", 7) for _ in range(3)] == [b'{"a": 1}'] * 3
    assert inner.reads == 1 and store.hits == 2
    again = CachedLogStore(inner, 1024, str(tmp_path))          # a new process: the file is still there
    assert again.read("x.json", 7) == b'{"a": 1}' and inner.reads == 1


def test_a_log_that_is_not_found_is_not_cached(tmp_path):
    inner = CountingStore({})
    store = CachedLogStore(inner, 1024, str(tmp_path))
    for _ in range(2):
        try:
            store.read("missing.json", 1)
        except LogNotFound:
            pass
    assert inner.reads == 2


class Idx:
    def __init__(self, *records):
        self.records = {r.table_id: r for r in records}

    def find(self, table_id):
        return self.records.get(table_id)


def _sample():
    path = next(p for p in sorted(LOG_DIR.glob("*.json")) if p.stat().st_size < 12_000_000 and p.stem != "573904205")
    return path, int(path.stem)


def test_a_refresh_reads_and_builds_nothing_more(tmp_path):
    path, table_id = _sample()
    logs = CountingStore({"x.json": path.read_bytes()})
    app = create_app(Settings(cache_dir=str(tmp_path)), Idx(TableRecord(table_id, "x.json")), logs)
    c = TestClient(app)
    first = c.get(f"/api/tables/{table_id}/replay")
    assert first.status_code == 200 and logs.reads == 1
    tag = first.headers["etag"]
    second = c.get(f"/api/tables/{table_id}/replay")                         # no tag: served from the server's cache
    assert second.status_code == 200 and second.content == first.content and logs.reads == 1
    third = c.get(f"/api/tables/{table_id}/replay", headers={"If-None-Match": tag})        # the browser's refresh
    assert third.status_code == 304 and not third.content and logs.reads == 1
    assert c.get(f"/api/tables/{table_id}/replay", headers={"If-None-Match": '"other"'}).status_code == 200


def test_the_replay_survives_a_restart_through_the_files(tmp_path):
    path, table_id = _sample()
    logs = CountingStore({"x.json": path.read_bytes()})
    rec = Idx(TableRecord(table_id, "x.json"))
    body = TestClient(create_app(Settings(cache_dir=str(tmp_path)), rec, logs)).get(f"/api/tables/{table_id}/replay").content
    after = TestClient(create_app(Settings(cache_dir=str(tmp_path)), rec, logs)).get(f"/api/tables/{table_id}/replay")
    assert after.content == body and logs.reads == 1


def test_a_failed_build_is_not_cached(tmp_path):
    logs = CountingStore({"x.json": b"{}"})
    c = TestClient(create_app(Settings(cache_dir=str(tmp_path)), Idx(TableRecord(9, "x.json")), logs))
    assert c.get("/api/tables/9/replay").status_code == 500 and c.get("/api/tables/9/replay").status_code == 500
    assert logs.reads == 2


def test_the_raw_log_endpoint_has_a_tag_too(tmp_path):
    logs = CountingStore({"x.json": b'{"k": 1}'})
    c = TestClient(create_app(Settings(cache_dir=str(tmp_path)), Idx(TableRecord(3, "x.json")), logs))
    r = c.get("/api/tables/3/log")
    assert r.status_code == 200 and c.get("/api/tables/3/log", headers={"If-None-Match": r.headers["etag"]}).status_code == 304
    assert logs.reads == 1
