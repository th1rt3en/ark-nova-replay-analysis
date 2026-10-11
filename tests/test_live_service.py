"""Two scripted clients play over the live game routes (the table keeper is its in-memory twin)."""
import json
import random
import re
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from ark_nova.api.main import create_app
from ark_nova.config import Settings
from ark_nova.live.fake import FakeKeeper
from ark_nova.live.service import LiveService


class Idx:
    def find(self, table_id):
        return None


class Logs:
    def read(self, gcs_path, table_id):
        raise AssertionError("no logs here")


def _app(keeper=None):
    keeper = keeper or FakeKeeper()
    service = LiveService(keeper, engine_version="test")
    return TestClient(create_app(Settings(cache_dir="off"), Idx(), Logs(), live=service)), keeper, service


class Player:
    """A scripted browser: holds a seat token, reads its view and plays a legal move."""

    def __init__(self, client, game_id, token, rng):
        self.c, self.id, self.token, self.rng = client, game_id, token, rng
        self.h = {"X-Seat-Token": token}

    def state(self):
        r = self.c.get(f"/api/games/{self.id}/state", headers=self.h)
        assert r.status_code == 200, r.text
        return r.json()

    def move(self, version, action, request_id=None):
        return self.c.post(f"/api/games/{self.id}/actions", headers=self.h, json={"version": version, "action": action, "request_id": request_id})


def _start(client, mw=False):
    made = client.post("/api/games", json={"marine_worlds": mw})
    assert made.status_code == 200, made.text
    g = made.json()
    rng = random.Random(1)
    players = [Player(client, g["game_id"], t, rng) for t in g["tokens"]]
    return g["game_id"], players


def _join_both(client, game_id, players):
    for i, p in enumerate(players):
        r = client.post(f"/api/games/{game_id}/join", headers=p.h, json={"name": f"Player {i}"})
        assert r.status_code == 200, r.text


def _play(players, moves, rng):
    """Whoever has a decision plays a random legal action; returns how many moves went in."""
    done = 0
    for _ in range(moves):
        views = [p.state() for p in players]
        movers = [(p, v) for p, v in zip(players, views) if v.get("decision")]
        if not movers:
            break
        p, v = rng.choice(movers)
        r = p.move(v["version"], rng.choice(v["decision"]["actions"]))
        assert r.status_code == 200, r.text
        done += 1
    return done


def test_a_game_cannot_be_played_before_both_players_joined():
    client, keeper, _ = _app()
    game_id, players = _start(client)
    assert client.get(f"/api/games/{game_id}").json()["status"] == "waiting"
    v = players[0].state()
    assert players[0].move(v["version"], {"player": 0, "kind": "initial_discard", "args": {"cards": []}}).status_code == 409
    _join_both(client, game_id, players)
    assert client.get(f"/api/games/{game_id}").json() | {} == {"game_id": game_id, "status": "playing", "version": 0, "names": ["Player 0", "Player 1"], "rated": False}
    assert client.get(f"/api/games/E99999/state").status_code == 404
    assert client.get("/api/games/nope").status_code == 404


def test_two_clients_play_and_each_only_sees_their_own_hand():
    client, keeper, _ = _app()
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    n = _play(players, 160, random.Random(5))
    assert n > 100
    assert client.get(f"/api/games/{game_id}").json()["version"] == n
    st = players[0].state()
    assert st["view"]["viewer"] == "0" and "?" in st["view"]["players"][1]["hand"] and "?" not in st["view"]["players"][0]["hand"]
    spec = client.get(f"/api/games/{game_id}/state").json()
    assert spec["view"]["viewer"] == "spectator" and "decision" not in spec
    # nothing pushed to a role ever showed the other seat's hand, a deck or a seed
    final = keeper.state(game_id)
    pushes = [(r, p) for (t, r, p) in keeper.pushed if t == game_id]
    assert len(pushes) > 300
    for role, payload in pushes:
        view = payload["view"]
        assert view["main_deck"] == [] and view["endgame_deck"] == [] and view["main_discard"] == []
        assert "seed" not in view and "rng" not in view
        for pv in view["players"]:
            if role == "spectator" or str(pv["seat"]) != role:
                assert all(c == "?" for c in pv["hand"] + pv["endgame_hand"]) and pv["initial_offer"] == []
        assert ("decision" in payload) <= (role != "spectator")
    assert final["version"] == n


def test_wrong_seat_illegal_and_stale_moves_are_refused():
    client, keeper, _ = _app()
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    views = [p.state() for p in players]
    mover = next(i for i, v in enumerate(views) if v.get("decision"))
    other = 1 - mover
    act = views[mover]["decision"]["actions"][0]
    assert players[other].move(0, act).status_code == 403                       # the other seat's token cannot play it
    assert players[mover].move(0, {**act, "args": {"cards": ["A001"]}}).status_code == 422
    bad = client.post(f"/api/games/{game_id}/actions", headers={"X-Seat-Token": "wrong"}, json={"version": 0, "action": act})
    assert bad.status_code == 403
    ok = players[mover].move(0, act, request_id="r-1")
    assert ok.status_code == 200 and ok.json()["version"] == 1
    again = players[mover].move(0, act, request_id="r-1")                       # a retry of the same request: the stored answer
    assert again.status_code == 200 and again.json()["duplicate"] is True
    stale = players[mover].move(0, views[mover]["decision"]["actions"][-1], request_id="r-2")
    assert stale.status_code == 409 and stale.json()["current_version"] == 1


def test_two_moves_on_the_same_version_let_exactly_one_in():
    client, keeper, _ = _app()
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    views = [p.state() for p in players]
    mover = next(i for i, v in enumerate(views) if v.get("decision"))
    act = views[mover]["decision"]["actions"][0]
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda rid: players[mover].move(0, act, request_id=rid), ["a", "b"]))
    assert sorted(r.status_code for r in results) == [200, 409]
    assert keeper.state(game_id)["version"] == 1


def test_a_cold_server_continues_the_game_from_the_keeper():
    client, keeper, _ = _app()
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    n = _play(players, 60, random.Random(2))
    assert n > 20
    client2, _, _ = _app(keeper)                                                  # another instance: an empty cache, the same keeper
    p2 = [Player(client2, game_id, p.token, random.Random(3)) for p in players]
    assert _play(p2, 20, random.Random(4)) > 5
    assert keeper.state(game_id)["version"] == n + 20 or keeper.state(game_id)["version"] > n


def test_conceding_ends_the_game_for_everyone():
    client, keeper, _ = _app()
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    assert _play(players, 5, random.Random(1)) == 5
    assert players[1].c.post(f"/api/games/{game_id}/concede", headers=players[1].h, json={}).json()["status"] == "conceded"
    assert client.get(f"/api/games/{game_id}").json()["status"] == "conceded"
    v = players[0].state()
    r = players[0].move(v["version"], v["decision"]["actions"][0]) if v.get("decision") else None
    assert r is None or r.status_code == 409
    assert keeper.registry(game_id)[-1]["event"]["status"] == "conceded"


def test_marine_worlds_starts_with_the_draft_and_the_other_seats_offers_stay_hidden():
    client, keeper, _ = _app()
    game_id, players = _start(client, mw=True)
    _join_both(client, game_id, players)
    v0, v1 = players[0].state(), players[1].state()
    d0, d1 = v0["view"]["draft"], v1["view"]["draft"]
    assert d0["offers"][0] and not d0["offers"][1] and d1["offers"][1] and not d1["offers"][0]
    assert {a["player"] for a in v0["decision"]["actions"]} == {0}
    assert 0 < _play(players, 12, random.Random(3))


def test_a_turn_waits_for_the_confirm_and_can_be_taken_back_over_the_routes():
    client, keeper, _ = _app()
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    rng = random.Random(6)
    saw_undo = saw_confirm = False
    for _ in range(400):
        views = [p.state() for p in players]
        movers = [(p, v) for p, v in zip(players, views) if v.get("decision")]
        if not movers:
            break
        p, v = movers[0]
        kinds = {a["kind"] for a in v["decision"]["actions"]}
        if "undo_last" in kinds and not saw_undo:
            act = next(a for a in v["decision"]["actions"] if a["kind"] == "undo_last")
            before = v["version"]
            r = p.move(before, act)
            assert r.status_code == 200 and r.json()["version"] == before + 1         # the undo is a move of its own in the list (history is never deleted)
            saw_undo = True
            continue
        if "confirm_turn" in kinds:
            assert v["view"]["prompt"]["kind"] == "confirm_turn"
            act = next(a for a in v["decision"]["actions"] if a["kind"] == "confirm_turn")
            r = p.move(v["version"], act)
            assert r.status_code == 200
            saw_confirm = True
            continue
        plain = [a for a in v["decision"]["actions"] if a["kind"] not in ("undo_last", "restart_turn")]
        pick = rng.choice(plain) if plain else v["decision"]["actions"][-1]            # (a position the engine cannot go on from: taking the turn back is the way out)
        assert p.move(v["version"], pick).status_code == 200
        if saw_undo and saw_confirm:
            break
    assert saw_undo and saw_confirm
    cold, _, _ = _app(keeper)                                                         # the stored list, undo and confirm included, folds back to the same game
    q = Player(cold, game_id, players[0].token, rng)
    assert q.state()["version"] == keeper.state(game_id)["version"]


def test_the_play_page_gets_its_setup_and_a_preview_that_changes_nothing():
    client, keeper, _ = _app()
    game_id, players = _start(client)
    sk = client.get(f"/api/games/{game_id}/setup", headers=players[1].h).json()
    assert sk["seat"] == 1 and sk["named"] == [False, False] and len(sk["maps"]) == 2 and len(sk["cards"]) > 200 and sk["shapes"] and sk["players"][0]["color"]
    assert client.get(f"/api/games/{game_id}/setup").json()["seat"] is None                  # a spectator has no seat
    assert client.get("/api/live/config").json() == {"ws_base": ""}
    _join_both(client, game_id, players)
    rng = random.Random(9)
    seen = {True: 0, False: 0}
    for _ in range(300):
        views = [p.state() for p in players]
        movers = [(p, v) for p, v in zip(players, views) if v.get("decision")]
        if not movers:
            break
        p, v = movers[0]
        for act in v["decision"]["actions"][:3]:
            r = client.post(f"/api/games/{game_id}/preview", headers=p.h, json={"version": v["version"], "action": act})
            assert r.status_code == 200, r.text
            seen[r.json()["irreversible"]] += 1
        assert keeper.state(game_id)["version"] == v["version"]                            # a preview played nothing
        plain = [a for a in v["decision"]["actions"] if a["kind"] not in ("undo_last", "restart_turn")] or v["decision"]["actions"]
        assert p.move(v["version"], rng.choice(plain)).status_code == 200
        if seen[True] and seen[False] > 5:
            break
    assert seen[True] >= 1 and seen[False] >= 5
    bad = client.post(f"/api/games/{game_id}/preview", headers=players[0].h, json={"version": 0, "action": {"player": 0, "kind": "x", "args": {}}})
    assert bad.status_code in (409, 422)


def test_the_text_of_a_hidden_choice_is_not_shown_to_the_opponent_or_the_spectators():
    client, keeper, _ = _app()
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    views = [p.state() for p in players]
    mover = next(i for i, v in enumerate(views) if v.get("decision"))
    act = next(a for a in views[mover]["decision"]["actions"] if a["kind"] == "initial_discard")
    assert players[mover].move(0, act).status_code == 200
    mine = keeper.view(game_id, str(mover))["label"]
    theirs = keeper.view(game_id, str(1 - mover))["label"]
    spectator = keeper.view(game_id, "spectator")["label"]
    assert "discard" in mine.lower() and theirs == spectator == f"Player {mover} discards 4 cards (initial selection)"
    names = [c for c in act["args"]["cards"]]
    from ark_nova import data as card_data
    assert not any(card_data.cards_by_key()[k]["name"].lower() in theirs.lower() for k in names)


def test_the_game_modes_come_from_the_engine_and_a_bad_one_is_refused():
    from ark_nova.engine import map_select
    client, keeper, _ = _app()
    opts = client.get("/api/live/options").json()
    assert [m["id"] for m in opts["game_modes"]] == list(map_select.MODES) and opts["default"] == map_select.DEFAULT_MODE and all(m["label"] for m in opts["game_modes"])
    bad = client.post("/api/games", json={"game_mode": "nope"})
    assert bad.status_code == 422
    assert client.post("/api/games", json={"game_mode": "original"}).status_code == 200


def _choose_maps(client, game_id, players):
    views = [p.state() for p in players]
    for p, v in zip(players, views):
        picks = [a for a in v["decision"]["actions"] if a["kind"] == "choose_map"]
        assert picks and all(a["player"] == players.index(p) for a in picks)
        r = p.move(p.state()["version"], picks[0])
        assert r.status_code == 200, r.text


def test_original_mode_deals_two_maps_each_and_the_page_gets_the_maps_once_both_chose():
    client, keeper, _ = _app()
    g = client.post("/api/games", json={"game_mode": "original"}).json()
    players = [Player(client, g["game_id"], t, random.Random(1)) for t in g["tokens"]]
    _join_both(client, g["game_id"], players)
    sk = client.get(f"/api/games/{g['game_id']}/setup", headers=players[0].h).json()
    assert sk["maps"] == [] and sk["map_names"]["3"] == "Silver Lake"                   # the maps are not known yet
    v0 = players[0].state()
    offers = [a["args"]["map"] for a in v0["decision"]["actions"]]
    assert len(offers) == 2 and v0["view"]["map_select"]["offers"][1] == []              # the other seat's two maps stay hidden
    assert players[0].state()["view"]["players"][0]["map_id"] == ""
    _choose_maps(client, g["game_id"], players)
    sk = client.get(f"/api/games/{g['game_id']}/setup", headers=players[0].h).json()
    assert len(sk["maps"]) == 2 and keeper.state(g["game_id"])["config"]["maps"] == [m["id"] for m in sk["maps"]]
    assert players[0].state()["view"]["players"][0]["map_id"] and players[0].state()["decision"]


def test_free_select_offers_every_map():
    client, keeper, _ = _app()
    g = client.post("/api/games", json={"game_mode": "free-select"}).json()
    players = [Player(client, g["game_id"], t, random.Random(1)) for t in g["tokens"]]
    _join_both(client, g["game_id"], players)
    from ark_nova.engine import map_select
    assert len(players[0].state()["decision"]["actions"]) == len(map_select.pool(type("C", (), {"maps_to_exclude": [], "marine_worlds": False})()))



def test_abandon_by_agreement_and_the_cooldown_after_a_rejection():
    client, keeper, service = _app()
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    a, b = players
    post = lambda p, path, body=None: p.c.post(f"/api/games/{game_id}/{path}", headers=p.h, json=body or {})       # noqa: E731
    assert post(a, "abandon/answer", {"agree": True}).status_code == 409                    # nothing to answer yet
    r = post(a, "abandon")
    assert r.status_code == 200 and r.json()["proposal"]["by"] == 0
    assert post(a, "abandon").status_code == 409                                             # one proposal at a time
    assert client.get(f"/api/games/{game_id}/abandon").json()["proposal"]["by"] == 0         # (what a polling page reads)
    assert post(a, "abandon/answer", {"agree": True}).status_code == 403                     # the proposer cannot answer their own
    assert client.get(f"/api/games/{game_id}/setup").json()["abandon"]["proposal"]["by"] == 0
    r = post(b, "abandon/answer", {"agree": False})
    assert r.status_code == 200 and r.json()["proposal"] is None
    again = post(a, "abandon")
    assert again.status_code == 429 and again.json()["retry_after"] > 590                    # ten minutes
    assert post(b, "abandon").status_code == 200                                             # the other player is not held back
    assert post(b, "abandon/withdraw").status_code == 200
    keeper.update_config(game_id, {"abandon": {"proposal": None, "cooldown": {"0": 1}}})     # the cooldown has run out
    assert post(a, "abandon").status_code == 200
    r = post(b, "abandon/answer", {"agree": True})
    assert r.status_code == 200 and r.json()["status"] == "abandoned"
    assert client.get(f"/api/games/{game_id}").status_code == 404                           # (an abandoned table has no record: the keeper deleted it)


def test_creator_seat_is_drawn_and_the_skeleton_names_the_first_player():
    from ark_nova.live.fake import FakeKeeper
    svc = LiveService(FakeKeeper())
    seats = {svc.create()["creator_seat"] for _ in range(40)}
    assert seats == {0, 1}                                   # either player can be the first one
    g = svc.create()
    sk = svc.skeleton(g["game_id"], g["tokens"][0])
    assert sk["first_player"] == 0 and sk["map_images"]["1"].startswith("/maps/map-")


def test_both_players_proposing_abandons_the_table_at_once():
    client, keeper, service = _app()
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    a, b = players
    post = lambda p, path, body=None: p.c.post(f"/api/games/{game_id}/{path}", headers=p.h, json=body or {})       # noqa: E731
    assert post(a, "abandon").status_code == 200
    r = post(b, "abandon")                                                                    # b proposes while a's proposal is open
    assert r.status_code == 200 and r.json()["status"] == "abandoned"
    assert client.get(f"/api/games/{game_id}").status_code == 404


def test_time_control_presets_custom_limits_and_the_increment(monkeypatch):
    from ark_nova.live import clock as tc
    assert tc.create(None)["start"] == 240_000 and tc.create(None)["increment"] == 74_000
    assert (tc.create({"speed": "slow"})["start"], tc.create({"speed": "slow"})["increment"]) == (360_000, 118_000)
    assert (tc.create({"speed": "fast"})["start"], tc.create({"speed": "fast"})["increment"]) == (180_000, 46_000)
    assert tc.create({"start": 1800, "increment": 0})["mode"] == "custom"
    for bad in ({"speed": "warp"}, {"start": 170, "increment": 10}, {"start": 1801, "increment": 10}, {"start": 300, "increment": 121}, {"start": 300}):
        with pytest.raises(tc.ClockError):
            tc.create(bad)
    c = tc.create({"speed": "fast"})
    c = tc.advance(c, 1000, [0, 1], None, False)                          # the setup: both clocks run
    c = tc.advance(c, 11_000, [0], [0, 0], False)                          # 10 s later; seat 0's turn begins: +46 s but capped at the start
    assert c["remaining"] == [180_000, 170_000] and c["running"] == [True, False]
    c = tc.advance(c, 21_000, [1], [1, 1], False)
    assert c["remaining"] == [170_000, 180_000] and c["turn_key"] == [1, 1]
    c = tc.advance(c, 31_000, [1], [1, 1], False)                          # same turn: no second increment
    assert c["remaining"][1] == 170_000
    assert tc.overtime(c, 31_000 + 171_000, 1) and not tc.overtime(c, 31_000 + 171_000, 0) and not tc.overtime(c, 31_000 + 100_000, 1)
    c = tc.advance(c, 31_000 + 200_000, [1], [1, 1], False)                  # 200 s on a 170 s clock: -30 s, and it runs on
    assert c["remaining"][1] == -30_000
    c = tc.advance(c, 31_000 + 200_000, [0], [2, 0], False)                  # seat 0's turn: its increment; seat 1's clock stays negative
    assert c["remaining"] == [180_000, -30_000]
    c = tc.advance(c, 31_000 + 200_000, [1], [3, 1], False)                  # seat 1's turn: the increment brings the negative clock back up
    assert c["remaining"][1] == 16_000 and not tc.overtime(c, 31_000 + 200_000, 1)


def test_a_game_with_a_clock_flags_the_player_who_runs_out_of_time():
    from ark_nova.live import archive as arch, registry as reg
    keeper = FakeKeeper()
    service = LiveService(keeper, engine_version="test", registry=reg.FakeRegistry(), archive=arch.FakeArchive())
    client = TestClient(create_app(Settings(cache_dir="off"), Idx(), Logs(), live=service))
    r = client.post("/api/games", json={"time_control": {"start": 300, "increment": 10}})
    g = r.json()
    players = [Player(client, g["game_id"], t, random.Random(1)) for t in g["tokens"]]
    gid = g["game_id"]
    assert client.post(f"/api/games/{gid}/join", headers=players[0].h, json={"name": "A"}).status_code == 200
    waiting = client.get(f"/api/games/{gid}/setup", headers=players[0].h).json()["clock"]
    assert waiting["running"] == [False, False] and waiting["remaining"] == [300_000, 300_000]          # (nothing runs until both players are in)
    assert client.post(f"/api/games/{gid}/join", headers=players[1].h, json={"name": "B"}).status_code == 200
    setup = client.get(f"/api/games/{gid}/setup", headers=players[0].h).json()
    assert setup["clock"]["start"] == 300_000 and setup["clock"]["running"] == [True, True]       # the map pick: both clocks run
    assert client.post(f"/api/games/{gid}/timeout", headers=players[1].h, json={}).status_code == 422      # nobody is out of time yet
    st = keeper.state(gid)["config"]["clock"]
    st["remaining"] = [300_000, -5]                                                                  # the second player's clock has run out
    st["at"] = int(__import__("time").time() * 1000) - 1
    keeper.update_config(gid, {"clock": st})
    service._cache.clear()
    assert client.post(f"/api/games/{gid}/timeout", headers=players[1].h, json={}).status_code == 422      # (the one out of time cannot claim anything)
    r = client.post(f"/api/games/{gid}/timeout", headers=players[0].h, json={})
    assert r.status_code == 200 and r.json()["seat"] == 1 and r.json()["timeout"]
    res = client.get(f"/api/games/{gid}/result")
    assert res.status_code == 200, res.text
    assert res.json()["result"]["reason"] == "overtime" and "overtime" in res.json()["end_reason"]
    assert any("ran out of time" in (m.get("label") or "") for m in [r.json().get("view", {}) or {}]) or r.json()["status"] == "conceded"
    assert client.post("/api/games", json={"time_control": {"speed": "bogus"}}).status_code == 422
