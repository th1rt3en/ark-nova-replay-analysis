"""The record of a game in GCS (docs/live_game_plan.md 9.1): one gzipped JSON file per finished or conceded table, `live/<yyyy>/<mm>/E12.json.gz`.

The file holds everything the stored game needs to be reproduced: the options, the seed (the game is over, so it is no longer a secret), the maps, the names, every accepted
action in order (undo and restart included: they are engine actions, and the viewer hides what they took back) and the step of each action. No seat token or its hash.
"""
import gzip
import json
from datetime import datetime, timezone
from typing import Protocol

RECORD_FORMAT = 1


def build_record(kept: dict, rec: dict, result=None) -> dict:
    """The file of a table from the keeper's `state` and `record` answers."""
    g = rec["game"]
    cfg = dict(g["config"])
    return {
        "format": RECORD_FORMAT, "game_id": cfg.get("game_id"), "engine_version": g["engine_version"], "code_hash": cfg.get("code_hash"), "data_hash": cfg.get("data_hash"),
        "schema_version": cfg.get("schema_version", 1), "options": cfg.get("options"), "tail_seed": cfg.get("tail_seed"), "player_ids": cfg.get("player_ids"), "maps": cfg.get("maps"),
        "names": g.get("names"), "viewer": cfg.get("viewer"), "viewer_schema_version": (cfg.get("viewer") or {}).get("viewer_schema_version"), "status": g["status"], "end_reason": g.get("end_reason"), "result": result,
        "created_at": g.get("created_at"), "ended_at": g.get("ended_at"), "n_actions": g["version"],
        "actions": [{"n": a["n"], "action": a["action"], "at": a.get("at")} for a in rec["actions"]],
        "steps": [{"n": s["n"], "step": s["step"]} for s in rec["steps"]],
    }


def path_for(game_id: str, when: datetime | None = None) -> str:
    d = when or datetime.now(timezone.utc)
    return f"live/{d:%Y}/{d:%m}/{game_id}.json.gz"


def encode(record: dict) -> bytes:
    return gzip.compress(json.dumps(record, separators=(",", ":"), ensure_ascii=False).encode("utf-8"), mtime=0)


def decode(data: bytes) -> dict:
    return json.loads(gzip.decompress(data))


def refold(record: dict):
    """The final state of a stored game: the options and the seed of the record, then every action (the engine is deterministic)."""
    from ark_nova.engine.actions import Action
    from ark_nova.engine.game import apply, new_game
    st = new_game(record["options"], record["player_ids"], record["tail_seed"])
    for item in record["actions"]:
        a = item["action"]
        st = apply(st, Action(int(a["player"]), a["kind"], dict(a.get("args") or {})))
    return st


class Archive(Protocol):
    def write(self, path: str, data: bytes) -> str: ...
    def read(self, path: str) -> bytes: ...


class FakeArchive:
    def __init__(self):
        self.files: dict[str, bytes] = {}
        self.down = False

    def write(self, path: str, data: bytes) -> str:
        if self.down:
            raise ConnectionError("GCS is down")
        self.files[path] = data
        return f"gs://fake-bucket/{path}"

    def read(self, path: str) -> bytes:
        return self.files[path.split("fake-bucket/")[-1]]


class GcsArchive:
    def __init__(self, bucket: str, client=None):
        from google.cloud import storage
        self.client = client or storage.Client()
        self.bucket = self.client.bucket(bucket)
        self.name = bucket

    def write(self, path: str, data: bytes) -> str:
        blob = self.bucket.blob(path)
        blob.upload_from_string(data, content_type="application/gzip")           # (the same path again overwrites with the same content: a retry is harmless)
        return f"gs://{self.name}/{path}"

    def read(self, path: str) -> bytes:
        return self.bucket.blob(path.split(self.name + "/", 1)[-1]).download_as_bytes()
