"""Rated live games: who may create and join, and the ratings that a finished or conceded game moves (docs/accounts_plan.md, "Rated and friendly games")."""
import hashlib
import random

import pytest
from fastapi.testclient import TestClient

from ark_nova.accounts import rating as elo
from ark_nova.accounts.service import AccountService
from ark_nova.accounts.store import MemoryStore
from ark_nova.api.main import create_app
from ark_nova.config import Settings
from ark_nova.live import archive as arch
from ark_nova.live import registry as reg
from ark_nova.live.fake import FakeKeeper
from ark_nova.live.service import LiveService
from test_live_service import Idx, Logs, Player, _play

PASSWORD = "correct horse battery"


class Hasher:
    def hash(self, p):
        return hashlib.sha256(p.encode()).hexdigest()

    def verify(self, h, p):
        return h == self.hash(p)

    def needs_rehash(self, h):
        return False


class World:
    """One app (accounts, live games) and as many browsers as needed, each with its own cookies."""

    def __init__(self):
        self.store = MemoryStore()
        self.accounts = AccountService(self.store, hasher=Hasher())
        self.keeper, self.registry, self.archive = FakeKeeper(), reg.FakeRegistry(), arch.FakeArchive()
        self.service = LiveService(self.keeper, engine_version="test", registry=self.registry, archive=self.archive, ratings=self.store)
        self.app = create_app(Settings(cache_dir="off"), Idx(), Logs(), live=self.service, accounts=self.accounts)

    def browser(self, name=None):
        c = TestClient(self.app)
        if name:
            r = c.post("/api/auth/register", json={"username": name, "password": PASSWORD})
            assert r.status_code == 200, r.text
        return c

    def ratings(self, *names):
        return [self.store.by_username(n.lower()).rating for n in names]


def rated_table(world, a, b):
    """A creates a rated game, both join: returns (game id, the two Player objects by seat, the account of each seat)."""
    made = a.post("/api/games", json={"rated": True})
    assert made.status_code == 200, made.text
    g = made.json()
    gid, tokens = g["game_id"], g["tokens"]
    seat_a = g["creator_seat"]
    ja = a.post(f"/api/games/{gid}/join", headers={"X-Seat-Token": tokens[seat_a]}, json={"name": "ignored"})
    assert ja.status_code == 200, ja.text
    jb = b.post(f"/api/games/{gid}/join", headers={"X-Seat-Token": tokens[1 - seat_a]}, json={"name": "also ignored"})
    assert jb.status_code == 200, jb.text
    rng = random.Random(1)
    players = [Player(a if i == seat_a else b, gid, tokens[i], rng) for i in range(2)]
    return gid, players, seat_a


def test_a_rated_game_needs_a_logged_in_creator_and_players():
    w = World()
    anon = w.browser()
    r = anon.post("/api/games", json={"rated": True})
    assert r.status_code == 401 and "log in" in r.json()["message"]
    assert anon.post("/api/games", json={"rated": False}).status_code == 200                       # a friendly game needs no account
    alice, bob = w.browser("Alice"), w.browser("Bob")
    g = alice.post("/api/games", json={"rated": True}).json()
    gid = g["game_id"]
    assert anon.get(f"/api/games/{gid}").json()["rated"] is True
    assert anon.post(f"/api/games/{gid}/join", headers={"X-Seat-Token": g["tokens"][0]}, json={"name": "Nobody"}).status_code == 401
    assert alice.post(f"/api/games/{gid}/join", headers={"X-Seat-Token": g["tokens"][0]}, json={"name": "ignored"}).status_code == 200
    assert alice.post(f"/api/games/{gid}/join", headers={"X-Seat-Token": g["tokens"][1]}, json={"name": "x"}).status_code == 409        # not against oneself
    carol = w.browser("Carol")
    assert carol.post(f"/api/games/{gid}/join", headers={"X-Seat-Token": g["tokens"][0]}, json={}).status_code == 409                    # seat 0 is Alice's
    assert bob.post(f"/api/games/{gid}/join", headers={"X-Seat-Token": g["tokens"][1]}, json={"name": "typed name"}).status_code == 200
    lobby = anon.get(f"/api/games/{gid}").json()
    assert lobby["status"] == "playing" and sorted(lobby["names"]) == ["Alice", "Bob"]                                                   # the names are the accounts'


def test_rated_games_are_off_without_an_account_store():
    service = LiveService(FakeKeeper(), engine_version="test")
    client = TestClient(create_app(Settings(cache_dir="off"), Idx(), Logs(), live=service))
    assert client.post("/api/games", json={"rated": True}).status_code == 503


def test_a_concession_moves_both_ratings_once_and_the_end_page_tells(monkeypatch):
    monkeypatch.setattr(elo, "MIN_RATED_TURNS", 0)
    w = World()
    alice, bob = w.browser("Alice"), w.browser("Bob")
    gid, players, seat_a = rated_table(w, alice, bob)
    assert _play(players, 5, random.Random(1)) == 5
    loser = players[1 - seat_a]                                                                     # Bob gives up
    assert loser.c.post(f"/api/games/{gid}/concede", headers=loser.h, json={}).json()["status"] == "conceded"
    assert w.ratings("Alice", "Bob") == [10.0, -10.0]                                               # two new players: +10 and -10
    out = TestClient(w.app).get(f"/api/games/{gid}/result").json()
    assert out["rated"] is True
    assert sorted((r["name"], r["before"], r["after"]) for r in out["ratings"]) == [("Alice", 0, 10), ("Bob", 0, -10)]
    assert w.store.ratings_of([w.store.by_username("alice").id])[w.store.by_username("alice").id][1:] == (1, 1)
    w.service.wrap_up(gid)                                                                          # (again: nothing is written twice)
    assert w.ratings("Alice", "Bob") == [10.0, -10.0]


def test_a_concession_in_the_first_turns_is_not_rated():
    w = World()
    alice, bob = w.browser("Alice"), w.browser("Bob")
    gid, players, seat_a = rated_table(w, alice, bob)
    players[1 - seat_a].c.post(f"/api/games/{gid}/concede", headers=players[1 - seat_a].h, json={})
    assert w.ratings("Alice", "Bob") == [0.0, 0.0] and w.store.rating_changes(gid) == []
    assert TestClient(w.app).get(f"/api/games/{gid}/result").json()["ratings"] == []


def test_a_friendly_game_never_changes_a_rating(monkeypatch):
    monkeypatch.setattr(elo, "MIN_RATED_TURNS", 0)
    w = World()
    alice, bob = w.browser("Alice"), w.browser("Bob")
    made = alice.post("/api/games", json={"rated": False}).json()
    gid, tokens = made["game_id"], made["tokens"]
    for i, c in enumerate((alice, bob)):
        assert c.post(f"/api/games/{gid}/join", headers={"X-Seat-Token": tokens[i]}, json={"name": f"P{i}"}).status_code == 200
    assert alice.post(f"/api/games/{gid}/concede", headers={"X-Seat-Token": tokens[0]}, json={}).json()["status"] == "conceded"
    assert w.ratings("Alice", "Bob") == [0.0, 0.0] and TestClient(w.app).get(f"/api/games/{gid}/result").json()["rated"] is False


def test_a_wrap_up_that_fails_after_rating_does_not_rate_twice(monkeypatch):
    monkeypatch.setattr(elo, "MIN_RATED_TURNS", 0)
    w = World()
    alice, bob = w.browser("Alice"), w.browser("Bob")
    gid, players, seat_a = rated_table(w, alice, bob)
    _play(players, 4, random.Random(2))
    w.registry.down = True                                                                          # BigQuery is down: the wrap-up stops after the ratings
    players[1 - seat_a].c.post(f"/api/games/{gid}/concede", headers=players[1 - seat_a].h, json={})
    assert w.ratings("Alice", "Bob") == [10.0, -10.0]
    w.registry.down = False
    assert w.service.wrap_up(gid) is True                                                           # tried again: the record is exported, the ratings stay
    assert w.ratings("Alice", "Bob") == [10.0, -10.0] and len(w.store.rating_changes(gid)) == 2


def test_the_winner_of_a_played_out_game_and_a_draw_by_the_scores():
    from ark_nova.engine.state import Result

    for result, want in ((Result(scores=[100, 90], winner=0), (10.0, -10.0)), (Result(scores=[90, 90], winner=None), (0.0, 0.0)), (Result(scores=[80, 95], winner=1), (-10.0, 10.0))):
        w2 = World()
        a2, b2 = w2.browser("Alice"), w2.browser("Bob")
        gid, players, seat_a = rated_table(w2, a2, b2)
        c = w2.service._load(gid)
        c.state.result = result                                                                     # the game as the engine ends it
        w2.service._load = lambda game_id, fresh=False: c
        kept = w2.keeper.state(gid)
        kept["status"] = "finished"
        w2.service._rate(gid, kept)
        accounts = [kept["config"]["account_0"], kept["config"]["account_1"]]
        got = tuple(w2.store.ratings_of(accounts)[i][0] for i in accounts)
        assert got == want
