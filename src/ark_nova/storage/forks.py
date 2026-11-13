"""Where the exported forks are kept: one gzipped JSON file per fork, `forks/<table id>/<n>.json.gz`, `n` = 1, 2, 3 ... counted per table.

`save` gives the record the next number of its table and returns it. The numbers never repeat: the Google Cloud Storage store creates a file only if it does not exist yet and
tries the next number when another export took the one it wanted at the same moment.
"""
import gzip
import json
import re
import threading
from pathlib import Path
from typing import Protocol


class ForkStore(Protocol):
    def save(self, table_id: str, record: dict) -> int: ...
    def load(self, table_id: str, n: int) -> dict | None: ...


def encode(record: dict) -> bytes:
    return gzip.compress(json.dumps(record, separators=(",", ":"), ensure_ascii=False).encode("utf-8"), mtime=0)


def decode(data: bytes) -> dict:
    return json.loads(gzip.decompress(data))


def path_for(table_id: str, n: int) -> str:
    return f"forks/{table_id}/{n}.json.gz"


class MemoryForkStore:
    def __init__(self):
        self.files: dict[str, bytes] = {}
        self._lock = threading.Lock()

    def save(self, table_id: str, record: dict) -> int:
        with self._lock:
            n = 1 + max([int(p.rsplit("/", 1)[1].split(".")[0]) for p in self.files if p.startswith(f"forks/{table_id}/")], default=0)
            record["fork_id"] = n
            self.files[path_for(table_id, n)] = encode(record)
            return n

    def load(self, table_id: str, n: int) -> dict | None:
        data = self.files.get(path_for(table_id, n))
        return decode(data) if data is not None else None


class FileForkStore:
    """The development server: the files live in a folder (build/forks)."""
    def __init__(self, root):
        self.root = Path(root)
        self._lock = threading.Lock()

    def save(self, table_id: str, record: dict) -> int:
        folder = self.root / table_id
        folder.mkdir(parents=True, exist_ok=True)
        with self._lock:
            n = 1 + max([int(p.name.split(".")[0]) for p in folder.glob("*.json.gz") if p.name.split(".")[0].isdigit()], default=0)
            record["fork_id"] = n
            (folder / f"{n}.json.gz").write_bytes(encode(record))
            return n

    def load(self, table_id: str, n: int) -> dict | None:
        p = self.root / table_id / f"{n}.json.gz"
        return decode(p.read_bytes()) if p.is_file() else None


class GcsForkStore:
    def __init__(self, bucket: str, client=None):
        from google.cloud import storage
        self.client = client or storage.Client()
        self.bucket = self.client.bucket(bucket)
        self.name = bucket

    def _taken(self, table_id: str) -> int:
        prefix = f"forks/{table_id}/"
        best = 0
        for blob in self.client.list_blobs(self.name, prefix=prefix):
            m = re.fullmatch(r"(\d+)\.json\.gz", blob.name[len(prefix):])
            if m:
                best = max(best, int(m.group(1)))
        return best

    def save(self, table_id: str, record: dict) -> int:
        from google.api_core.exceptions import PreconditionFailed
        n = self._taken(table_id) + 1
        for _ in range(25):
            record["fork_id"] = n
            try:
                self.bucket.blob(path_for(table_id, n)).upload_from_string(encode(record), content_type="application/gzip", if_generation_match=0)       # (only if the number is still free)
                return n
            except PreconditionFailed:
                n += 1
        raise RuntimeError("no free fork number")

    def load(self, table_id: str, n: int) -> dict | None:
        from google.api_core.exceptions import NotFound
        try:
            return decode(self.bucket.blob(path_for(table_id, n)).download_as_bytes())
        except NotFound:
            return None
