"""Accounts: names, passwords, the BGA id and Elo seed, sessions, recovery and the attempt limit, on both stores."""
import hashlib
from datetime import datetime, timedelta, timezone

import pytest

from ark_nova.accounts.seeds import BgaPlayer, ListSeedIndex
from ark_nova.accounts.service import AccountError, AccountService, Argon2Hasher, normalise_username
from ark_nova.accounts.store import MemoryStore, SqliteStore

GOOD = "correct horse battery"


class FastHasher:
    """Stands in for argon2 so the tests are quick."""

    def hash(self, password):
        return "h:" + hashlib.sha256(password.encode()).hexdigest()

    def verify(self, hashed, password):
        return hashed == self.hash(password)

    def needs_rehash(self, hashed):
        return False


class Clock:
    def __init__(self):
        self.now = datetime(2026, 10, 10, 12, tzinfo=timezone.utc)

    def __call__(self):
        return self.now


SEEDS = ListSeedIndex([
    BgaPlayer("89107474", "Xiao93", 447.53, 1683, 410, "2026-10-08T17:54:00+00:00"),
    BgaPlayer("111", "Eagles Gaming", 300.2, 1500, 20, "2025-01-01T00:00:00+00:00"),
    BgaPlayer("222", "Eagles Gaming", 512.9, 1600, 90, "2026-09-01T00:00:00+00:00"),
    BgaPlayer("333", "Eagles Gaming", 150.0, 1400, 3, "2024-01-01T00:00:00+00:00"),
])


@pytest.fixture(params=["memory", "sqlite"])
def svc(request):
    store = MemoryStore() if request.param == "memory" else SqliteStore(":memory:")
    return AccountService(store, SEEDS, FastHasher(), Clock())


def test_usernames_are_cleaned_and_limited():
    assert normalise_username("  Xiao  93 ") == ("Xiao 93", "xiao 93")
    assert normalise_username("Ｘiao93")[0] == "Xiao93"                                      # NFKC: full-width letters become plain ones
    for bad in ("ab", "x" * 25, "_abc", "abc_", "a<b>c", "", None, 5):
        with pytest.raises(AccountError):
            normalise_username(bad)
    with pytest.raises(AccountError) as e:
        normalise_username("Admin")
    assert e.value.code == "reserved_username"


def test_new_names_get_the_next_p_id(svc):
    a = svc.register("Alice", GOOD)
    b = svc.register("Bob", GOOD)
    assert (a.account.id, b.account.id) == ("P1", "P2")
    assert a.account.id_source == "new" and a.account.rating == 0 and a.account.bga_elo_seed is None
    with pytest.raises(AccountError) as e:
        svc.register("alice", GOOD)                                                       # the same name, any case
    assert e.value.code == "username_taken"
    assert svc.register("Carol", GOOD).account.id == "P3"                                  # a refused signup did not use a number


def test_a_bga_name_offers_its_ids_and_the_chosen_one_seeds_the_elo(svc):
    c = svc.check("xiao93")
    assert c["available"] and [m["bga_player_id"] for m in c["matches"]] == ["89107474"] and c["matches"][0]["elo"] == 448
    r = svc.register("Xiao93", GOOD, "89107474")
    assert r.account.id == "89107474" and r.account.id_source == "bga" and r.account.rating == 447.53 and r.account.bga_elo_seed == 447.53
    assert svc.public(r.account)["seeded_from_bga"] is True
    again = svc.check("Xiao93")
    assert again["available"] is False and again["reason"] == "taken"


def test_a_name_with_several_bga_ids_lists_all_of_them_newest_first(svc):
    m = svc.check("Eagles Gaming")["matches"]
    assert [x["bga_player_id"] for x in m] == ["222", "111", "333"]
    assert all(x["available"] for x in m)
    r = svc.register("Eagles Gaming", GOOD, "111")
    assert r.account.id == "111" and r.account.rating == 300.2


def test_the_server_checks_the_chosen_bga_id_itself(svc):
    with pytest.raises(AccountError) as e:
        svc.register("Xiao93", GOOD, "999")                                               # not an id of that name
    assert e.value.code == "bga_id_not_listed"
    with pytest.raises(AccountError):
        svc.register("Alice", GOOD, "89107474")                                           # an id of another name
    svc.register("Eagles Gaming", GOOD, "222")
    svc.store.by_username("eagles gaming")                                                # the name is now taken
    with pytest.raises(AccountError) as e:
        svc.register("EAGLES GAMING", GOOD, "111")
    assert e.value.code == "username_taken"


def test_an_id_that_already_has_an_account_is_not_available_again():
    store = MemoryStore()
    seeds = ListSeedIndex([BgaPlayer("500", "Old Name", 200, None, 5, "2020"), BgaPlayer("500", "New Name", 200, None, 5, "2021")])      # one player, renamed
    svc = AccountService(store, seeds, FastHasher(), Clock())
    svc.register("Old Name", GOOD, "500")
    m = svc.check("New Name")["matches"]
    assert m[0]["bga_player_id"] == "500" and m[0]["available"] is False
    with pytest.raises(AccountError) as e:
        svc.register("New Name", GOOD, "500")
    assert e.value.code == "bga_id_taken"
    assert svc.register("New Name", GOOD).account.id == "P1"                               # a new player instead: no seed
    assert store.by_username("new name").rating == 0


def test_passwords_must_be_long_and_not_trivial(svc):
    for bad in ("short", "a" * 129, "aaaaaaaaaaaa", "password123", None):
        with pytest.raises(AccountError):
            svc.register("Alice", bad)
    with pytest.raises(AccountError):
        svc.register("Alice Wonder", "alice wonder")                                       # the name itself
    assert svc.store.by_username("alice") is None


def test_login_logout_and_the_cookie_token(svc):
    reg = svc.register("Alice", GOOD)
    assert svc.account_for(reg.token).id == "P1"
    svc.logout(reg.token)
    assert svc.account_for(reg.token) is None
    acc, token = svc.login("ALICE", GOOD)
    assert acc.id == "P1" and svc.account_for(token).username == "Alice"
    for name, pw in (("alice", "wrong password!"), ("nobody", GOOD)):
        with pytest.raises(AccountError) as e:
            svc.login(name, pw)
        assert e.value.status == 401 and e.value.code == "bad_login"                       # one message for a wrong name and a wrong password
    assert svc.account_for(None) is None and svc.account_for("garbage") is None


def test_a_session_expires_after_30_days_and_slides_when_used(svc):
    reg = svc.register("Alice", GOOD)
    clock = svc.clock
    clock.now += timedelta(days=20)
    assert svc.account_for(reg.token)                                                      # used: pushed forward
    clock.now += timedelta(days=20)
    assert svc.account_for(reg.token)                                                      # 40 days after login, but used 20 days ago
    clock.now += timedelta(days=31)
    assert svc.account_for(reg.token) is None


def test_too_many_failed_logins_lock_the_name_for_a_while(svc):
    svc.register("Alice", GOOD)
    for _ in range(8):
        with pytest.raises(AccountError):
            svc.login("alice", "wrong password!", ip="1.2.3.4")
    with pytest.raises(AccountError) as e:
        svc.login("alice", GOOD, ip="1.2.3.4")                                             # even the right password is refused now
    assert e.value.status == 429
    svc.clock.now += timedelta(minutes=16)
    assert svc.login("alice", GOOD, ip="1.2.3.4")[0].id == "P1"


def test_recovery_sets_a_new_password_a_new_code_and_closes_every_session(svc):
    reg = svc.register("Alice", GOOD)
    _, other = svc.login("alice", GOOD)
    with pytest.raises(AccountError) as e:
        svc.recover("alice", "0000-0000-0000-0000-0000", "another long password")
    assert e.value.code == "bad_recovery"
    out = svc.recover("ALICE", reg.recovery_code.upper().replace("-", " "), "another long password")
    assert out.recovery_code != reg.recovery_code
    assert svc.account_for(reg.token) is None and svc.account_for(other) is None and svc.account_for(out.token)
    with pytest.raises(AccountError):
        svc.login("alice", GOOD)
    assert svc.login("alice", "another long password")[0].id == "P1"
    with pytest.raises(AccountError):
        svc.recover("alice", reg.recovery_code, "yet another password")                    # the old code is dead


def test_public_view_has_no_hash(svc):
    pub = svc.public(svc.register("Alice", GOOD).account)
    assert "hash" not in str(pub) and pub["id"] == "P1" and pub["rating"] == 0


def test_the_real_argon2_hasher_round_trips_and_rejects():
    h = Argon2Hasher()
    hashed = h.hash(GOOD)
    assert hashed.startswith("$argon2id$") and h.verify(hashed, GOOD) and not h.verify(hashed, "nope nope nope") and not h.verify("garbage", GOOD)
