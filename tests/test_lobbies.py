"""The lobbies of the custom games (live/lobbies.py, api/lobbies.py): listing, creating, joining, removing, invitations and the start of the game.

The lobby state is kept in memory here (`MemoryLobbies`). The same tests run against the Worker's `Lobbies` Durable Object when `LOBBIES_WORKER_URL` and `LOBBIES_WORKER_SECRET` are set
(`cd cloudflare && npx wrangler dev --port 8790 --var INTERNAL_SECRET:s3cret`, then `LOBBIES_WORKER_URL=http://127.0.0.1:8790 LOBBIES_WORKER_SECRET=s3cret pytest tests/test_lobbies.py -k <one test>`):
the Durable Object keeps its lobbies between tests, and every test makes accounts P1, P2 ... again, so run one test per started Worker."""
import os

import pytest

import test_rated_games
from ark_nova.api.main import create_app
from ark_nova.config import Settings
from test_live_service import Idx, Logs

WORKER = os.environ.get("LOBBIES_WORKER_URL")


class World(test_rated_games.World):
    def __init__(self):
        super().__init__()
        if WORKER:                                                      # the lobbies of the Worker, the table keeper stays the fake one
            self.app = create_app(Settings(cache_dir="off", live_keeper_url=WORKER, internal_secret=os.environ["LOBBIES_WORKER_SECRET"]), Idx(), Logs(), live=self.service, accounts=self.accounts)


def _lobby(host, **settings):
    r = host.post("/api/lobbies", json=settings)
    assert r.status_code == 200, r.text
    return r.json()


def test_acting_needs_an_account_but_anybody_can_look():
    w = World()
    anon, alice = w.browser(), w.browser("Alice")
    for r in (anon.get("/api/lobbies/inbox"), anon.post("/api/lobbies", json={}), anon.post("/api/lobbies/L1/join", json={}), anon.post("/api/lobbies/L1/start", json={}),
              anon.post("/api/lobbies/invites/x/answer", json={"accept": True}), anon.get("/api/lobbies/online")):
        assert r.status_code == 401 and r.json()["status"] == "login_needed"
    assert anon.get("/api/lobbies").json()["lobbies"] == []                                           # (the list and a lobby are public)
    lob = _lobby(alice)
    seen = anon.get("/api/lobbies").json()
    assert [r["host"] for r in seen["lobbies"]] == ["Alice"] and seen["mine"] is None
    look = anon.get(f"/api/lobbies/{lob['id']}").json()
    assert (look["is_member"], look["is_host"], look["my_seat"], look["you"], look["can_start"]) == (False, False, None, None, False) and "invites" not in look
    assert anon.get("/api/lobbies/L999").status_code == 404
    assert anon.post(f"/api/lobbies/{lob['id']}/join", json={"seat": 1}).status_code == 401           # (taking a seat needs an account)


def test_the_games_in_progress_are_listed_for_everybody_and_a_player_gets_the_way_back():
    w = World()
    alice, bob, anon = w.browser("Alice"), w.browser("Bob"), w.browser()
    lob = _lobby(alice)
    bob.post(f"/api/lobbies/{lob['id']}/join", json={"seat": 1})
    started = alice.post(f"/api/lobbies/{lob['id']}/start", json={}).json()["game"]
    games = anon.get("/api/lobbies").json()["games"]
    assert len(games) == 1 and games[0]["game_id"] == started["game_id"] and sorted(games[0]["players"]) == ["Alice", "Bob"] and "token" not in games[0]
    mine = alice.get("/api/lobbies").json()["games"][0]
    assert mine["token"] == started["token"]                                                           # (a player can go back to their game)
    assert anon.get(f"/api/games/{started['game_id']}/state").status_code == 200                       # and anybody can watch it
    w.service.concede(started["game_id"], started["token"])                                            # the game ends: it leaves the list
    assert anon.get("/api/lobbies").json()["games"] == []


def test_a_lobby_is_listed_with_its_host_players_and_mode_and_only_ark360_can_be_made():
    w = World()
    alice, bob = w.browser("Alice"), w.browser("Bob")
    assert bob.get("/api/lobbies").json()["lobbies"] == []
    made = _lobby(alice, marine_worlds=True)
    assert made["is_host"] and made["players"] == 1 and made["mode"] == "ark360" and made["marine_worlds"] and not made["can_start"]
    row = bob.get("/api/lobbies").json()["lobbies"][0]
    assert (row["host"], row["players"], row["seats"], row["mode_label"], row["full"]) == ("Alice", 1, 2, "Ark360", False)
    assert alice.get("/api/lobbies").json()["mine"] == made["id"]
    assert alice.post("/api/lobbies", json={}).status_code == 409                                    # one lobby at a time
    assert w.browser("Carol").post("/api/lobbies", json={"game_mode": "original"}).status_code == 422
    assert w.browser("Dan").post("/api/lobbies", json={"rated": True}).status_code == 200            # (the account store is there: rated is allowed)


def test_join_start_and_the_game_is_made_with_both_accounts():
    w = World()
    alice, bob = w.browser("Alice"), w.browser("Bob")
    lob = _lobby(alice, rated=True)
    assert alice.post(f"/api/lobbies/{lob['id']}/start", json={}).status_code == 409                 # not full
    looked = bob.get(f"/api/lobbies/{lob['id']}").json()                                             # (a link to the lobby shows it: it does not seat the visitor)
    assert looked["is_member"] is False and looked["my_seat"] is None and looked["players"] == 1 and "invites" not in looked
    joined = bob.post(f"/api/lobbies/{lob['id']}/join", json={"seat": 1})
    assert joined.status_code == 200 and joined.json()["full"] and not joined.json()["is_host"] and not joined.json()["can_start"]
    assert alice.get(f"/api/lobbies/{lob['id']}").json()["can_start"]
    carol = w.browser("Carol")
    assert carol.post(f"/api/lobbies/{lob['id']}/join", json={"seat": 1}).status_code == 409                # taken
    assert bob.post(f"/api/lobbies/{lob['id']}/start", json={}).status_code == 403                   # only the host starts it
    started = alice.post(f"/api/lobbies/{lob['id']}/start", json={})
    assert started.status_code == 200, started.text
    ga = started.json()["game"]
    gb = bob.get(f"/api/lobbies/{lob['id']}").json()["game"]
    assert ga["game_id"] == gb["game_id"] and ga["token"] != gb["token"]
    table = alice.get(f"/api/games/{ga['game_id']}").json()
    assert table["status"] == "playing" and sorted(table["names"]) == ["Alice", "Bob"] and table["rated"] is True
    assert alice.get("/api/lobbies").json()["lobbies"] == []                                         # (a started lobby is not on the list)
    assert alice.get(f"/api/games/{ga['game_id']}/setup", headers={"X-Seat-Token": ga["token"]}).json()["seat"] in (0, 1)
    seen = carol.get(f"/api/lobbies/{lob['id']}").json()                                              # (a visitor of a started lobby may watch the table, without a token)
    assert seen["game"] == {"game_id": ga["game_id"]}


def test_the_host_removes_a_player_who_is_told_and_the_player_can_leave():
    w = World()
    alice, bob = w.browser("Alice"), w.browser("Bob")
    lob = _lobby(alice)
    bob_id = bob.post(f"/api/lobbies/{lob['id']}/join", json={}).json()["you"]
    assert bob.post(f"/api/lobbies/{lob['id']}/kick", json={"account_id": bob_id}).status_code == 403
    out = alice.post(f"/api/lobbies/{lob['id']}/kick", json={"account_id": bob_id})
    assert out.status_code == 200 and out.json()["players"] == 1
    assert [n["type"] for n in bob.get("/api/lobbies/inbox").json()["notices"]] == ["removed"]
    assert bob.get("/api/lobbies/inbox").json()["notices"] == []                                      # shown once
    bob.post(f"/api/lobbies/{lob['id']}/join", json={})
    assert bob.post("/api/lobbies/leave", json={}).json() == {"left": True}
    assert alice.get(f"/api/lobbies/{lob['id']}").json()["players"] == 1
    assert alice.post("/api/lobbies/leave", json={}).json()["left"] is True                          # the host leaving closes it
    assert alice.get("/api/lobbies").json()["lobbies"] == []


def test_an_invitation_reaches_an_online_player_who_accepts_and_is_in_the_lobby():
    w = World()
    alice, bob, carol = w.browser("Alice"), w.browser("Bob"), w.browser("Carol")
    lob = _lobby(alice)
    names = alice.get("/api/lobbies/online", params={"q": "b"}).json()["names"]
    assert names == []                                                                                # Bob has not asked for the inbox yet: not online
    bob.get("/api/lobbies/inbox")
    carol.get("/api/lobbies/inbox")
    assert alice.get("/api/lobbies/online", params={"q": "b"}).json()["names"] == ["Bob"]
    assert alice.get("/api/lobbies/online", params={"q": ""}).json()["names"] == ["Bob", "Carol"]
    assert alice.post(f"/api/lobbies/{lob['id']}/invite", json={"username": "Nobody"}).status_code == 404
    sent = alice.post(f"/api/lobbies/{lob['id']}/invite", json={"username": "bob"})
    assert sent.status_code == 200 and sent.json()["invites"][0]["status"] == "pending"
    assert alice.post(f"/api/lobbies/{lob['id']}/invite", json={"username": "Carol"}).status_code == 409      # the only empty seat has an invitation out
    box = bob.get("/api/lobbies/inbox").json()
    assert len(box["invites"]) == 1 and box["invites"][0]["host"] == "Alice" and box["invites"][0]["mode_label"] == "Ark360"
    assert carol.get("/api/lobbies/inbox").json()["invites"] == []
    inv = box["invites"][0]
    assert carol.post(f"/api/lobbies/invites/{inv['id']}/answer", json={"accept": True}).status_code == 404   # (not hers)
    got = bob.post(f"/api/lobbies/invites/{inv['id']}/answer", json={"accept": True})
    assert got.status_code == 200 and got.json() == {"lobby": lob["id"], "accepted": True}
    assert bob.get(f"/api/lobbies/{lob['id']}").json()["players"] == 2
    assert bob.get("/api/lobbies/inbox").json()["invites"] == []


def test_a_declined_invitation_tells_the_host_and_frees_the_seat():
    w = World()
    alice, bob, carol = w.browser("Alice"), w.browser("Bob"), w.browser("Carol")
    lob = _lobby(alice)
    bob.get("/api/lobbies/inbox")
    carol.get("/api/lobbies/inbox")
    alice.post(f"/api/lobbies/{lob['id']}/invite", json={"username": "Bob"})
    inv = bob.get("/api/lobbies/inbox").json()["invites"][0]
    assert bob.post(f"/api/lobbies/invites/{inv['id']}/answer", json={"accept": False}).json()["accepted"] is False
    notice = alice.get("/api/lobbies/inbox").json()["notices"]
    assert [(n["type"], n["by"]) for n in notice] == [("declined", "Bob")] and "declined" in notice[0]["message"]
    seat = alice.get(f"/api/lobbies/{lob['id']}").json()
    assert seat["invites"] == [{"id": inv["id"], "username": "Bob", "status": "declined", "seat": 1}]
    assert seat["seats_detail"][1] == {"index": 1, "account_id": None, "username": None, "host": False, "online": False, "pending": False}      # the seat looks empty again
    assert alice.post(f"/api/lobbies/{lob['id']}/invite", json={"username": "Carol"}).status_code == 200      # the seat can be offered to someone else
    assert bob.post(f"/api/lobbies/invites/{inv['id']}/answer", json={"accept": True}).status_code == 404     # (a declined one is gone)


@pytest.mark.skipif(bool(WORKER), reason="the clock of the Worker is its own (cloudflare/test/lobbies.test.ts moves it)")
def test_a_lobby_whose_host_left_goes_away(monkeypatch):
    w = World()
    clock = [1000.0]
    monkeypatch.setattr(w.app.state.lobbies.store, "clock", lambda: clock[0])
    alice, bob, carol = w.browser("Alice"), w.browser("Bob"), w.browser("Carol")
    lob = _lobby(alice)
    bob.get("/api/lobbies/inbox")
    carol.get("/api/lobbies/inbox")
    carol.post(f"/api/lobbies/{lob['id']}/join", json={"seat": 1})
    clock[0] += 200                                                                                   # nobody asks for 200 s: the host is gone
    told = carol.get("/api/lobbies/inbox").json()["notices"]                                          # (the page asks: Carol is seen, Alice is not)
    assert [n["type"] for n in told] == ["closed"]
    assert carol.get("/api/lobbies").json()["lobbies"] == []


def test_a_visitor_takes_an_empty_seat_by_choosing_it_and_a_seat_with_an_invitation_is_kept_for_the_invited_player():
    w = World()
    alice, bob, carol = w.browser("Alice"), w.browser("Bob"), w.browser("Carol")
    lob = _lobby(alice)
    url = f"/api/lobbies/{lob['id']}"
    assert carol.get(url).json()["is_member"] is False and carol.get("/api/lobbies").json()["mine"] is None      # (looking is not joining)
    assert carol.post(f"{url}/join", json={"seat": 0}).status_code == 409                             # the host's seat is taken
    bob.get("/api/lobbies/inbox")
    carol.get("/api/lobbies/inbox")
    sent = alice.post(f"{url}/invite", json={"username": "Bob", "seat": 1}).json()
    assert sent["seats_detail"][1] == {"index": 1, "account_id": None, "username": "Bob", "host": False, "online": False, "pending": True}      # the seat shows Bob, not yet seated
    assert sent["players"] == 1 and not sent["can_start"]                                             # (an invitation is not a player)
    shown = carol.get(url).json()["seats_detail"][1]
    assert shown["username"] == "Bob" and shown["pending"] is True                                    # (everybody sees the pending seat)
    taken = carol.post(f"{url}/join", json={"seat": 1})
    assert taken.status_code == 409 and taken.json()["status"] == "invited_seat"
    assert alice.post(f"{url}/invite", json={"username": "Carol", "seat": 1}).status_code == 409          # one invitation per seat
    inv = bob.get("/api/lobbies/inbox").json()["invites"][0]
    assert bob.post(f"/api/lobbies/invites/{inv['id']}/answer", json={"accept": True}).json() == {"lobby": lob["id"], "accepted": True}
    after = alice.get(url).json()
    assert after["players"] == 2 and after["can_start"] and after["seats_detail"][1]["pending"] is False and after["seats_detail"][1]["account_id"] is not None   # the filter is gone
    assert carol.post(f"{url}/join", json={"seat": 1}).status_code == 409                             # (taken now)
