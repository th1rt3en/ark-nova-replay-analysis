"""A logged-in account is ranked in a mini game; an anonymous browser is not (the accounts and the mini games together)."""
import hashlib

from fastapi.testclient import TestClient

from ark_nova.accounts.service import AccountService
from ark_nova.accounts.store import MemoryStore
from ark_nova.api.main import create_app
from ark_nova.config import Settings
from conftest import make_service


class Hasher:
    def hash(self, p):
        return hashlib.sha256(p.encode()).hexdigest()

    def verify(self, h, p):
        return h == self.hash(p)

    def needs_rehash(self, h):
        return False


def browser(mini):
    return TestClient(create_app(Settings(), accounts=AccountService(MemoryStore(), hasher=Hasher()), minigames=mini))


def test_an_account_is_ranked_and_an_anonymous_browser_is_not():
    mini = make_service()
    mini.rollover()
    anon = browser(mini)
    h = {"X-Anon-Id": "anon-browser-0001"}
    assert anon.post("/api/minigames/example/submit", headers=h, json={"payload": {"picks": ["c1", "c2"]}}).status_code == 200
    assert anon.get("/api/minigames/example/leaderboard").json()["rows"] == []
    member = browser(mini)
    member.post("/api/auth/register", json={"username": "Alice", "password": "correct horse battery"})
    assert member.post("/api/minigames/example/submit", json={"payload": {"picks": ["c1", "c2"]}}).status_code == 200          # no anonymous id needed
    assert member.post("/api/minigames/example/submit", json={"payload": {"picks": ["c1", "c2"]}}).status_code == 409
    rows = member.get("/api/minigames/example/leaderboard").json()["rows"]
    assert [(r["account_id"], r["plays"]) for r in rows] == [("P1", 1)]
    assert member.get("/api/minigames/example/today").json()["played"] is True
