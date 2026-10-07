"""An in-memory table keeper with the promises of the Table Durable Object (cloudflare/src/table.ts), for tests without the network.

The same rules: one writer per table through `expected_version`, a repeated `request_id` returns the stored result, a table that has ended takes no more moves,
`state` returns the latest snapshot and the actions since, views are kept per role. Sockets are not modelled: `pushed` lists what the Durable Object would push
(role, version, payload) so a test can check who was sent what.
"""
import copy
import threading
import time
from typing import Any

from ark_nova.live.keeper import AlreadyExists, Forbidden, NoSuchTable, StaleVersion, TableEnded

FINAL = ("finished", "conceded", "abandoned", "error")
ROLES = ("0", "1", "spectator")


class _Table:
    def __init__(self, config, engine_version, hashes):
        self.config, self.engine_version, self.hashes = config, engine_version, hashes
        self.names: list = [None, None]
        self.status, self.end_reason, self.version = "waiting", None, 0
        self.created_at, self.ended_at = int(time.time() * 1000), None
        self.actions: list = []              # (n, action, request_id)
        self.steps: list = []
        self.views: dict = {}
        self.snapshots: dict = {}
        self.requests: dict = {}
        self.registry: list = []             # [seq, event, acked]


class FakeKeeper:
    def __init__(self):
        self.tables: dict[str, _Table] = {}
        self.counter = 0
        self.pushed: list = []               # (table_id, role, payload), in order
        self._lock = threading.Lock()        # (the real object runs one thing at a time)

    # ---- the counter ----
    def next_number(self) -> int:
        with self._lock:
            self.counter += 1
            return self.counter

    def ensure_counter(self, n: int) -> int:
        with self._lock:
            self.counter = max(self.counter, n)
            return self.counter

    # ---- a table ----
    def _get(self, table_id: str) -> _Table:
        if table_id not in self.tables:
            raise NoSuchTable("no such table", 404)
        return self.tables[table_id]

    def init(self, table_id, config, engine_version, token_hashes, views=None, snapshot=None, registry_event=None) -> int:
        with self._lock:
            if table_id in self.tables:
                raise AlreadyExists("the table already exists", 409)
            t = self.tables[table_id] = _Table(copy.deepcopy(config), engine_version, list(token_hashes))
            self._store_views(t, views, 0)
            if snapshot is not None:
                t.snapshots[0] = copy.deepcopy(snapshot)
            if registry_event:
                t.registry.append([len(t.registry) + 1, copy.deepcopy(registry_event), False])
            return 0

    def _store_views(self, t: _Table, views, version: int) -> None:
        for role, payload in (views or {}).items():
            if role not in ROLES:
                raise ValueError(f"unknown view {role}")
            t.views[role] = (version, copy.deepcopy(payload))

    def update_config(self, table_id, patch) -> None:
        self._get(table_id).config.update(copy.deepcopy(patch))

    def state(self, table_id) -> dict:
        t = self._get(table_id)
        since = max(t.snapshots) if t.snapshots else 0
        return {"version": t.version, "status": t.status, "end_reason": t.end_reason, "engine_version": t.engine_version, "config": copy.deepcopy(t.config), "created_at": t.created_at, "ended_at": t.ended_at,
                "seats": [{"name": n, "token_hash": h} for n, h in zip(t.names, t.hashes)],
                "snapshot": {"version": since, "state": copy.deepcopy(t.snapshots[since])} if t.snapshots else None,
                "actions": [{"n": n, "action": copy.deepcopy(a)} for n, a, _ in t.actions if n > since]}

    def append(self, table_id, expected_version, request_id, action, step, views, snapshot=None, status=None, end_reason=None, registry_event=None) -> dict:
        with self._lock:
            t = self._get(table_id)
            if request_id in t.requests:
                return {"version": t.requests[request_id], "duplicate": True, "snapshot_due": False}
            if t.status in FINAL:
                raise TableEnded("the table has ended", t.status)
            if t.version != expected_version:
                raise StaleVersion("stale version", t.version)
            n = t.version + 1
            t.actions.append((n, copy.deepcopy(action), request_id))
            t.steps.append((n, copy.deepcopy(step)))
            self._store_views(t, views, n)
            if snapshot is not None:
                t.snapshots[n] = copy.deepcopy(snapshot)
            t.requests[request_id] = n
            t.version = n
            if status:
                t.status, t.end_reason = status, end_reason or t.end_reason
                if status in FINAL:
                    t.ended_at = int(time.time() * 1000)
            if registry_event:
                t.registry.append([len(t.registry) + 1, copy.deepcopy(registry_event), False])
            for role, (v, payload) in t.views.items():
                self.pushed.append((table_id, role, {"type": "state", "version": v, "status": t.status, **copy.deepcopy(payload)}))
            return {"version": n, "duplicate": False, "snapshot_due": n % 25 == 0}

    def view(self, table_id, role) -> dict:
        t = self._get(table_id)
        if role not in ROLES:
            raise ValueError("seat must be 0, 1 or spectator")
        if role not in t.views:
            raise NoSuchTable("no view yet", 404)
        v, payload = t.views[role]
        return {"version": v, **copy.deepcopy(payload)}

    def request_result(self, table_id, request_id):
        return self._get(table_id).requests.get(request_id)

    def seat(self, table_id, seat, name) -> list:
        with self._lock:
            t = self._get(table_id)
            t.names[seat] = name.strip()[:40]
            return list(t.names)

    def set_status(self, table_id, status, end_reason=None, registry_event=None) -> str:
        with self._lock:
            t = self._get(table_id)
            if t.status in FINAL:
                raise TableEnded("the table has ended", t.status)
            t.status, t.end_reason = status, end_reason or t.end_reason
            if status in FINAL:
                t.ended_at = int(time.time() * 1000)
            if registry_event:
                t.registry.append([len(t.registry) + 1, copy.deepcopy(registry_event), False])
            return status

    def record(self, table_id) -> dict:
        t = self._get(table_id)
        return {"game": {"config": copy.deepcopy(t.config), "engine_version": t.engine_version, "status": t.status, "end_reason": t.end_reason, "version": t.version, "names": list(t.names)},
                "actions": [{"n": n, "action": copy.deepcopy(a), "request_id": r} for n, a, r in t.actions],
                "steps": [{"n": n, "step": copy.deepcopy(s)} for n, s in t.steps]}

    def registry(self, table_id) -> list:
        return [{"seq": seq, "event": copy.deepcopy(e)} for seq, e, acked in self._get(table_id).registry if not acked]

    def ack_registry(self, table_id, up_to_seq) -> None:
        for row in self._get(table_id).registry:
            if row[0] <= up_to_seq:
                row[2] = True

    def finalize(self, table_id) -> None:
        self._get(table_id)
        del self.tables[table_id]


__all__ = ["FakeKeeper", "Forbidden"]
