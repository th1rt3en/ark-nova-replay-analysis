"""The signed calls to the Worker's store routes (`cloudflare/src/store.ts`): the accounts and the mini games live in Cloudflare D1.

`StoreClient.call("acct.by_id", {"id": "P1"})` returns the operation's result. A 409 with an `error` code raises `StoreConflict(code)` (a taken username, a taken BGA id);
any other failure raises `StoreError`. Only reads and idempotent writes are retried: a retried insert could answer "taken" for the account it has just made.
"""
import json
import time
import urllib.error
import urllib.request
from typing import Any

from ark_nova.live.keeper import USER_AGENT, sign

RETRIES = 3


class StoreError(Exception):
    pass


class StoreConflict(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class StoreClient:
    def __init__(self, base_url: str, secret: str, timeout: float = 15.0, sleep=time.sleep):
        self.base, self.secret, self.timeout, self.sleep = base_url.rstrip("/"), secret, timeout, sleep

    def call(self, op: str, args: dict, retry: bool = False) -> Any:
        path = f"/internal/store/{op}"
        data = json.dumps(args, separators=(",", ":")).encode()
        last: Exception | None = None
        for attempt in range(RETRIES if retry else 1):
            req = urllib.request.Request(self.base + path, data=data, method="POST", headers={**sign(self.secret, "POST", path, data), "Content-Type": "application/json", "User-Agent": USER_AGENT})
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    return json.loads(r.read() or b"{}").get("result")
            except urllib.error.HTTPError as e:
                try:
                    body = json.loads(e.read())
                except ValueError:
                    body = {}
                if e.code == 409 and body.get("error"):
                    raise StoreConflict(body["error"])
                if e.code in (502, 503, 504) and attempt + 1 < (RETRIES if retry else 1):
                    last = e
                else:
                    raise StoreError(f"{op}: {e.code} {body.get('message', '')}")
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                last = e
            self.sleep(0.2 * 2 ** attempt)
        raise StoreError(f"{op}: the store did not answer ({last})")
