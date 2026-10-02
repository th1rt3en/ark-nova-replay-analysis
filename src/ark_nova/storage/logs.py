"""Raw BGA log storage (GCS).

A stored file is a (usually gzipped) JSON-lines archive holding many tables, one table's whole log per line.
"""
import gzip
import re
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
