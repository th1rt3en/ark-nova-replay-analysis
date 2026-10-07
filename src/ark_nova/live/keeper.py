"""The table keeper: what Cloud Run needs from the Table Durable Object and the id counter (docs/live_game_plan.md, 3.5).

`Keeper` is the interface; `HttpKeeper` talks to the deployed Worker (`cloudflare/`) with the signed internal calls, `FakeKeeper` (live/fake.py) keeps the same promises in
memory for the tests. Both raise the errors below, so the game service never looks at HTTP.
"""
import hashlib
import hmac
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Protocol

USER_AGENT = "ark-nova-live/1"            # Cloudflare answers the default python-urllib agent with an HTML block page
RETRIES = 3


class LiveError(Exception):
    """The keeper refused or failed; `status` is the HTTP status of the answer (0: no answer)."""
    def __init__(self, message: str, status: int = 0, body: dict | None = None):
        super().__init__(message)
        self.status, self.body = status, body or {}


class NoSuchTable(LiveError):
    pass


class AlreadyExists(LiveError):
    pass


class StaleVersion(LiveError):
    def __init__(self, message: str, current_version: int, body: dict | None = None):
        super().__init__(message, 409, body)
        self.current_version = current_version


class TableEnded(LiveError):
    def __init__(self, message: str, status_now: str, body: dict | None = None):
        super().__init__(message, 409, body)
        self.status_now = status_now


class Forbidden(LiveError):
    pass


class Keeper(Protocol):
    def next_number(self) -> int: ...
    def ensure_counter(self, n: int) -> int: ...
    def init(self, table_id: str, config: dict, engine_version: str, token_hashes: list[str], views: dict | None = None, snapshot: Any = None,
             registry_event: dict | None = None) -> int: ...
    def state(self, table_id: str) -> dict: ...
    def update_config(self, table_id: str, patch: dict) -> None: ...
    def append(self, table_id: str, expected_version: int, request_id: str, action: Any, step: Any, views: dict, snapshot: Any = None, status: str | None = None,
               end_reason: str | None = None, registry_event: dict | None = None) -> dict: ...
    def view(self, table_id: str, role: str) -> dict: ...
    def request_result(self, table_id: str, request_id: str) -> int | None: ...
    def seat(self, table_id: str, seat: int, name: str) -> list: ...
    def set_status(self, table_id: str, status: str, end_reason: str | None = None, registry_event: dict | None = None) -> str: ...
    def record(self, table_id: str) -> dict: ...
    def registry(self, table_id: str) -> list: ...
    def ack_registry(self, table_id: str, up_to_seq: int) -> None: ...
    def finalize(self, table_id: str) -> None: ...


def sign(secret: str, method: str, path: str, body: bytes, now: int | None = None) -> dict:
    """The headers of an internal call: HMAC-SHA256 over `timestamp.method.path.sha256(body)` (cloudflare/src/auth.ts)."""
    ts = str(int(time.time()) if now is None else now)
    msg = f"{ts}.{method}.{path}.{hashlib.sha256(body).hexdigest()}"
    return {"X-Timestamp": ts, "X-Signature": hmac.new(secret.encode(), msg.encode(), hashlib.sha256).hexdigest()}


def raise_for(status: int, body: dict) -> None:
    msg = str(body.get("message") or f"HTTP {status}")
    if status == 404:
        raise NoSuchTable(msg, status, body)
    if status == 403:
        raise Forbidden(msg, status, body)
    if status == 409:
        if "current_version" in body:
            raise StaleVersion(msg, int(body["current_version"]), body)
        if "status_now" in body:
            raise TableEnded(msg, str(body["status_now"]), body)
        raise AlreadyExists(msg, status, body)
    raise LiveError(msg, status, body)


class HttpKeeper:
    def __init__(self, base_url: str, secret: str, timeout: float = 15.0, sleep=time.sleep):
        self.base, self.secret, self.timeout, self.sleep = base_url.rstrip("/"), secret, timeout, sleep

    def _call(self, method: str, path: str, body: Any = None, retry: bool = False) -> dict:
        data = json.dumps(body, separators=(",", ":")).encode() if body is not None else b""
        last: Exception | None = None
        for attempt in range(RETRIES if retry else 1):
            signed = sign(self.secret, method, path.split("?")[0], data)            # (the Worker signs the path without the query)
            headers = {**signed, "Content-Type": "application/json", "User-Agent": USER_AGENT}
            req = urllib.request.Request(self.base + path, data=data or None, method=method, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    return json.loads(r.read() or b"{}")
            except urllib.error.HTTPError as e:
                raw = e.read()
                try:
                    parsed = json.loads(raw)
                except ValueError:
                    parsed = {"message": raw[:200].decode("utf-8", "replace")}
                if e.code in (502, 503, 504) and attempt + 1 < (RETRIES if retry else 1):
                    last = e
                else:
                    raise_for(e.code, parsed)
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                last = e
            self.sleep(0.2 * 2 ** attempt)
        raise LiveError(f"the keeper did not answer: {last}")

    def _t(self, table_id: str, route: str) -> str:
        return f"/internal/table/{table_id}{route}"

    # ---- the counter ----
    def next_number(self) -> int:
        return int(self._call("POST", "/internal/counter/next", {})["n"])

    def ensure_counter(self, n: int) -> int:
        return int(self._call("POST", "/internal/counter/ensure", {"n": n})["n"])

    # ---- a table ----
    def init(self, table_id, config, engine_version, token_hashes, views=None, snapshot=None, registry_event=None) -> int:
        body = {"config": config, "engine_version": engine_version, "seats": [{"token_hash": h} for h in token_hashes], "views": views,
                "snapshot": {"state": snapshot} if snapshot is not None else None, "registry_event": registry_event}
        return int(self._call("POST", self._t(table_id, "/init"), {k: v for k, v in body.items() if v is not None})["version"])

    def update_config(self, table_id, patch) -> None:
        self._call("POST", self._t(table_id, "/config"), {"patch": patch})

    def state(self, table_id) -> dict:
        return self._call("GET", self._t(table_id, "/state"), retry=True)

    def append(self, table_id, expected_version, request_id, action, step, views, snapshot=None, status=None, end_reason=None, registry_event=None) -> dict:
        body = {"expected_version": expected_version, "request_id": request_id, "action": action, "step": step, "views": views,
                "snapshot": {"state": snapshot} if snapshot is not None else None, "status": status, "end_reason": end_reason, "registry_event": registry_event}
        return self._call("POST", self._t(table_id, "/append"), {k: v for k, v in body.items() if v is not None}, retry=True)       # (the request id makes a retry safe)

    def view(self, table_id, role) -> dict:
        return self._call("GET", self._t(table_id, f"/view?seat={role}"), retry=True)

    def request_result(self, table_id, request_id) -> int | None:
        try:
            return int(self._call("GET", self._t(table_id, f"/request?id={urllib.parse.quote(request_id)}"), retry=True)["version"])
        except NoSuchTable as e:
            if "request" in str(e):
                return None
            raise

    def seat(self, table_id, seat, name) -> list:
        return self._call("POST", self._t(table_id, "/seat"), {"seat": seat, "name": name})["names"]

    def set_status(self, table_id, status, end_reason=None, registry_event=None) -> str:
        body = {"status": status, "end_reason": end_reason, "registry_event": registry_event}
        return self._call("POST", self._t(table_id, "/status"), {k: v for k, v in body.items() if v is not None})["status"]

    def record(self, table_id) -> dict:
        return self._call("GET", self._t(table_id, "/record"), retry=True)

    def registry(self, table_id) -> list:
        return self._call("GET", self._t(table_id, "/registry"), retry=True)["events"]

    def ack_registry(self, table_id, up_to_seq) -> None:
        self._call("POST", self._t(table_id, "/registry/ack"), {"up_to_seq": up_to_seq})

    def finalize(self, table_id) -> None:
        self._call("POST", self._t(table_id, "/finalize"), {})
