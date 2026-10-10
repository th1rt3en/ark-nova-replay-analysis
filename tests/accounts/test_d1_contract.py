"""The Python D1 stores against a real Worker with a local D1 (skipped unless D1_STORE_URL is set). To run it:

    cd cloudflare && npx wrangler d1 migrations apply ark-nova-accounts --local --persist-to <dir>
    npx wrangler dev --port 8787 --persist-to <dir>            (INTERNAL_SECRET comes from .dev.vars)
    D1_STORE_URL=http://127.0.0.1:8787 D1_STORE_SECRET=<INTERNAL_SECRET> python -m pytest tests/accounts/test_d1_contract.py

It does not need a fresh database: every name and game key is unique to the run.
"""
import os
import uuid

import pytest

from ark_nova.accounts.d1 import D1AccountStore
from ark_nova.accounts.service import AccountError, AccountService
from ark_nova.accounts.seeds import BgaPlayer, ListSeedIndex
from ark_nova.accounts.store import Account, IdTaken, Session, UsernameTaken
from ark_nova.minigames.platform.d1 import D1MiniGameStore
from ark_nova.minigames.platform.store import PuzzleRow, SubmissionRow
from ark_nova.storeclient import StoreClient, StoreError

URL, SECRET = os.environ.get("D1_STORE_URL"), os.environ.get("D1_STORE_SECRET", "")
pytestmark = pytest.mark.skipif(not URL, reason="D1_STORE_URL is not set (a local Worker with a local D1 is needed)")


@pytest.fixture(scope="module")
def client():
    return StoreClient(URL, SECRET)


def draft(name, **kw):
    return Account("", "new", name, name.lower(), "hash", "rec", "2026-10-10T00:00:00+00:00", "", kw.get("seed"), kw.get("rating", 0.0))


def test_a_wrong_secret_is_an_error_not_data():
    with pytest.raises(StoreError):
        D1AccountStore(StoreClient(URL, "wrong")).by_id("P1")


def test_accounts_through_the_worker(client):
    store = D1AccountStore(client)
    name = "T" + uuid.uuid4().hex[:10]
    a = store.create_account(draft(name), None)
    assert a.id.startswith("P") and a.id_source == "new" and a.username == name
    b = store.create_account(draft(name + "b"), None)
    assert int(b.id[1:]) > int(a.id[1:])
    with pytest.raises(UsernameTaken):
        store.create_account(draft(name.upper()), None)
    assert store.by_username(name.lower()).id == a.id and store.by_id(a.id).username == name and store.by_id("nope") is None

    bga = str(10_000_000 + int(uuid.uuid4().int % 1_000_000))
    seeded = store.create_account(draft(name + "x", seed=447.53, rating=447.53), bga)
    assert seeded.id == bga and seeded.id_source == "bga" and seeded.rating == 447.53 and seeded.bga_elo_seed == 447.53
    with pytest.raises(IdTaken):
        store.create_account(draft(name + "y"), bga)
    assert store.held_ids([bga, a.id, "nope"]) == {bga, a.id} and store.held_ids([]) == set()
    assert store.usernames([bga, a.id, "nope"]) == {bga: name + "x", a.id: name} and store.usernames([]) == {}

    store.set_passwords(a.id, "h2", "r2")
    store.touch_login(a.id, "2026-10-11T00:00:00+00:00")
    got = store.by_id(a.id)
    assert (got.password_hash, got.recovery_hash, got.last_login_at) == ("h2", "r2", "2026-10-11T00:00:00+00:00")
    store.add_session(Session("th-" + name, a.id, "c", "e", "ua"))
    store.extend_session("th-" + name, "later")
    assert store.get_session("th-" + name).expires_at == "later"
    store.delete_sessions_of(a.id)
    assert store.get_session("th-" + name) is None


def test_the_account_service_runs_on_the_d1_store(client):
    import hashlib

    class Hasher:
        def hash(self, p):
            return hashlib.sha256(p.encode()).hexdigest()

        def verify(self, h, p):
            return h == self.hash(p)

        def needs_rehash(self, h):
            return False

    name = "S" + uuid.uuid4().hex[:10]
    bga = str(20_000_000 + int(uuid.uuid4().int % 1_000_000))
    svc = AccountService(D1AccountStore(client), ListSeedIndex([BgaPlayer(bga, name, 321.5, None, 4, "2026-10-01")]), Hasher())
    reg = svc.register(name, "correct horse battery", bga)
    assert reg.account.id == bga and reg.account.rating == 321.5
    assert svc.account_for(reg.token).id == bga
    assert svc.login(name.upper(), "correct horse battery")[0].id == bga
    with pytest.raises(AccountError) as e:
        svc.register(name, "correct horse battery")
    assert e.value.code == "username_taken"
    out = svc.recover(name, reg.recovery_code, "another long password")
    assert svc.account_for(reg.token) is None and svc.account_for(out.token).id == bga


def test_mini_games_through_the_worker(client):
    store = D1MiniGameStore(client)
    g, h = "g" + uuid.uuid4().hex[:8], "h" + uuid.uuid4().hex[:8]
    row = PuzzleRow(g, "2026-10-10", 111, {"seat": 1}, "1", {"cards": ["a"]}, "t", {"keep": ["a"]})
    assert store.create_puzzle(row) is True
    assert store.create_puzzle(PuzzleRow(g, "2026-10-10", 222, {"seat": 0}, "1", None, "t")) is False
    assert store.used_sources(g) == {111}
    assert store.create_puzzle(PuzzleRow(h, "2026-10-10", 111, {"seat": 0}, "1", None, "t")) is True
    assert store.get_puzzle(g, "2026-10-10") == row and store.get_puzzle(g, "2026-10-11") is None
    store.set_public_cache(g, "2026-10-10", {"v": 2}, "2")
    assert store.get_puzzle(g, "2026-10-10").public_cache == {"v": 2} and store.get_puzzle(g, "2026-10-10").builder_version == "2"
    assert store.get_puzzle(g, "2026-10-10").answer_cache is None                                  # a new payload clears the answer
    store.set_answer_cache(g, "2026-10-10", {"keep": ["b"]})
    assert store.get_puzzle(g, "2026-10-10").answer_cache == {"keep": ["b"]}
    store.create_puzzle(PuzzleRow(g, "2026-10-12", 333, {}, "1", None, "t"))
    assert store.puzzle_days(g, "2026-10") == ["2026-10-10", "2026-10-12"]

    def sub(day, account, anon, score, at="2026-10-10T10:00:00+00:00"):
        return SubmissionRow(g, day, account, anon, {"picks": ["a"]}, score, {"k": 1}, at)

    assert store.add_submission(sub("2026-10-10", "P1", None, 3)) is True
    assert store.add_submission(sub("2026-10-10", "P1", None, 4)) is False
    assert store.add_submission(sub("2026-10-10", None, "anon-1", 2)) is True
    assert store.add_submission(sub("2026-10-10", None, "anon-1", 2)) is False
    assert store.add_submission(sub("2026-10-11", "P1", None, 1, "2026-11-01T00:00:00+00:00")) is True
    assert store.get_submission(g, "2026-10-10", "P1", None).score == 3 and store.get_submission(g, "2026-10-10", None, "anon-1").detail == {"k": 1}
    assert store.get_submission(g, "2026-10-10", None, "anon-2") is None and store.get_submission(g, "2026-10-10", None, None) is None
    assert store.player_scores(g, "2026-10", "P1", None) == {"2026-10-10": 3, "2026-10-11": 1} and store.player_scores(g, "2026-10", None, "anon-1") == {"2026-10-10": 2} and store.player_scores(g, "2026-10", None, None) == {}
    assert len(store.submissions(g)) == 3 and len(store.submissions(g, day="2026-10-10")) == 2 and len(store.submissions(g, month="2026-11")) == 1
    assert all(s.account_id for s in store.submissions(g, ranked_only=True))
    store.purge(g)
    assert store.submissions(g) == [] and store.used_sources(g) == set() and store.get_puzzle(h, "2026-10-10") is not None
    store.purge(h)
