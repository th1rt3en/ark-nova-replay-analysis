"""Raw BGA log storage (GCS).

A stored file is a (usually gzipped) JSON-lines archive holding many tables, one table's whole log per line.
"""
import gzip
import hashlib
import os
import re
import tempfile
import threading
from collections import OrderedDict
from pathlib import Path
from typing import Iterable, Protocol

# every line starts with the first packet, which carries the table id
_TABLE_ID = re.compile(rb'"table_id":\s*"?(\d+)')
_PREFIX = 8192


class LogNotFound(Exception):
    pass


class LogStore(Protocol):
    def read(self, gcs_path: str, table_id: int) -> bytes:
        """The log (one JSON document) of `table_id` from the archive at `gcs_path`."""
        ...


class NotConfiguredLogStore:
    def read(self, gcs_path: str, table_id: int) -> bytes:
        raise LogNotFound(gcs_path)


def find_table_line(lines: Iterable[bytes], table_id: int) -> bytes | None:
    """First line whose first packet is for `table_id`; other lines are skipped without parsing them."""
    wanted = str(table_id).encode()
    for line in lines:
        m = _TABLE_ID.search(line[:_PREFIX])
        if m and m.group(1) == wanted:
            return line
    return None


class ByteLru:
    """A thread-safe least-recently-used cache of byte strings, bounded by their total size. With a `spill` directory the entries that do not fit any more
    (or are too big for the memory budget) stay as files there, bounded by `spill_bytes`: nothing here is time sensitive, so reading a file is always
    better than reading the source again."""

    def __init__(self, max_bytes: int, spill: str | Path | None = None, spill_bytes: int = 2 * 1024 ** 3, namespace: str = ""):
        self.max_bytes = max_bytes
        self._items: OrderedDict = OrderedDict()
        self._size = 0
        self._lock = threading.Lock()
        self._dir = Path(spill) if spill else None
        self._spill_bytes = spill_bytes
        self._ns = namespace

    def _file(self, key) -> Path:
        return self._dir / f"{self._ns}-{hashlib.sha1(repr(key).encode()).hexdigest()[:24]}.bin"

    def get(self, key):
        with self._lock:
            value = self._items.get(key)
            if value is not None:
                self._items.move_to_end(key)
                return value
        if self._dir is not None:
            try:
                f = self._file(key)
                value = f.read_bytes()
                os.utime(f)                                              # (used just now: the last one to be thrown out)
            except OSError:
                return None
            self._remember(key, value)
            return value
        return None

    def _remember(self, key, value: bytes) -> None:
        if len(value) > self.max_bytes:
            return
        with self._lock:
            if key in self._items:
                self._size -= len(self._items.pop(key))
            self._items[key] = value
            self._size += len(value)
            while self._size > self.max_bytes:
                _, old = self._items.popitem(last=False)
                self._size -= len(old)

    def put(self, key, value: bytes) -> None:
        self._remember(key, value)
        if self._dir is None:
            return
        try:
            self._dir.mkdir(parents=True, exist_ok=True)
            f = self._file(key)
            tmp = f.with_suffix(".tmp")
            tmp.write_bytes(value)
            tmp.replace(f)                                                # (atomic: a reader never sees half a file)
            self._trim_disk()
        except OSError:
            pass                                                          # a full or read-only disk only costs the next read

    def _trim_disk(self) -> None:
        files = sorted((f for f in self._dir.glob(f"{self._ns}-*.bin")), key=lambda f: f.stat().st_mtime)
        total = sum(f.stat().st_size for f in files)
        while files and total > self._spill_bytes:
            old = files.pop(0)
            total -= old.stat().st_size
            old.unlink(missing_ok=True)

    def __len__(self) -> int:
        return len(self._items)


def default_cache_dir() -> str:
    return str(Path(tempfile.gettempdir()) / "ark_nova_cache")


class CachedLogStore:
    """Keeps the logs it has read: a log never changes once the game is finished, so a refresh must not cost another GCS read (which streams the whole
    archive file up to the table's line). Memory first, then files on disk (`ByteLru` with a spill directory)."""

    def __init__(self, inner: LogStore, max_bytes: int = 256 * 1024 * 1024, cache_dir: str | None = None, disk_bytes: int = 2 * 1024 ** 3):
        self._inner = inner
        self._cache = ByteLru(max_bytes, cache_dir, disk_bytes, namespace="log")
        self.hits = self.misses = 0

    def read(self, gcs_path: str, table_id: int) -> bytes:
        key = (gcs_path, int(table_id))
        body = self._cache.get(key)
        if body is not None:
            self.hits += 1
            return body
        self.misses += 1
        body = self._inner.read(gcs_path, table_id)
        self._cache.put(key, body)
        return body


class GcsLogStore:
    """`gcs_path` is `gs://bucket/object` or an object name inside the default bucket."""

    def __init__(self, default_bucket: str = ""):
        self._client = None  # created on first use
        self._default_bucket = default_bucket

    def read(self, gcs_path: str, table_id: int) -> bytes:
        from google.api_core.exceptions import NotFound
        from google.cloud import storage  # the `gcp` extra

        self._client = self._client or storage.Client()
        if gcs_path.startswith("gs://"):
            bucket, _, name = gcs_path[5:].partition("/")
        else:
            bucket, name = self._default_bucket, gcs_path
        try:
            with self._client.bucket(bucket).blob(name).open("rb") as stream:  # streamed: stops reading at the matching line
                line = find_table_line(gzip.GzipFile(fileobj=stream) if name.endswith(".gz") else stream, table_id)
        except NotFound as e:
            raise LogNotFound(gcs_path) from e
        if line is None:
            raise LogNotFound(f"table {table_id} not in {gcs_path}")
        return line
