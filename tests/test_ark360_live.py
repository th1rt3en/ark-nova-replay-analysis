"""Ark360 on the live service: the map stays hidden until both players joined, one layout for both, the fixed time control, the study time (not on the clocks) and how it ends."""
import random

from ark_nova.engine import ark360
from tests.test_live_service import Player, _app, _join_both


def _table(client, **options):
    g = client.post("/api/games", json={"game_mode": "ark360", **options}).json()
    rng = random.Random(1)
    return g["game_id"], [Player(client, g["game_id"], t, rng) for t in g["tokens"]]


def test_the_mode_is_offered_with_its_time_control():
    client, _, _ = _app()
    opts = client.get("/api/live/options").json()
    mode = next(m for m in opts["game_modes"] if m["id"] == "ark360")
    assert mode["label"] == "Ark360" and mode["fixed_time_control"] == ark360.time_control() and "study" in mode["description"].lower()
    assert all("fixed_time_control" not in m for m in opts["game_modes"] if m["id"] != "ark360")


def test_nobody_sees_the_map_before_the_game_starts_and_both_do_after():
    client, keeper, _ = _app()
    game_id, players = _table(client)
    spectator = client.get(f"/api/games/{game_id}/state").json()["view"]
    for v in [players[0].state()["view"], players[1].state()["view"], spectator]:
        assert [p["map_id"] for p in v["players"]] == ["", ""] and [p["bonus_layout"] for p in v["players"]] == [None, None] and v["config"]["maps"] == []
    sk = client.get(f"/api/games/{game_id}/setup", headers=players[0].h).json()
    assert sk["maps"] == [] and sk["map_views"] == {} and sk["study"]["started_at"] is None and sk["study"]["seconds"] == ark360.study_seconds()
    _join_both(client, game_id, players)
    sk = client.get(f"/api/games/{game_id}/setup", headers=players[0].h).json()
    assert len(sk["maps"]) == 2 and sk["maps"][0]["id"] == sk["maps"][1]["id"] and sk["study"]["started_at"] is not None
    v0, v1 = players[0].state()["view"], players[1].state()["view"]
    layout = v0["players"][0]["bonus_layout"]
    assert layout and v0["players"][1]["bonus_layout"] == layout == v1["players"][0]["bonus_layout"]
    assert sk["maps"][0]["placement_bonuses"] == sk["maps"][1]["placement_bonuses"] == layout                    # the page draws the layout, not the printed bonuses
    assert v0["players"][0]["map_id"] == sk["maps"][0]["id"] and v0["prompt"]["kind"] == "study"


def test_the_time_control_is_the_modes_whatever_the_lobby_sent_and_the_study_is_not_on_the_clocks():
    client, keeper, _ = _app()
    game_id, players = _table(client, time_control={"speed": "fast"})
    _join_both(client, game_id, players)
    clock = client.get(f"/api/games/{game_id}/setup", headers=players[0].h).json()["clock"]
    tcs = ark360.time_control()
    assert clock["start"] == tcs["start"] * 1000 and clock["increment"] == tcs["increment"] * 1000 and clock["mode"] == "custom"
    assert clock["running"] == [False, False]                                                                  # (the study time is not on the clocks)
    v = players[0].state()
    assert [a["kind"] for a in v["decision"]["actions"]] == ["study_ready"]
    for p in players:
        r = p.move(p.state()["version"], next(a for a in p.state()["decision"]["actions"] if a["kind"] == "study_ready"))
        assert r.status_code == 200, r.text
    after = players[0].state()
    assert after["view"]["prompt"]["kind"] in ("initial_discard", "draft") and after["view"]["clock"]["running"] == [True, True]       # (the game's time runs from here)


def test_the_study_time_ends_by_the_servers_clock_and_a_page_that_left_is_made_ready():
    client, keeper, _ = _app()
    game_id, players = _table(client)
    _join_both(client, game_id, players)
    early = client.post(f"/api/games/{game_id}/study/expire")
    assert early.status_code == 409                                                                             # not over yet
    v = players[0].state()
    r = players[0].move(v["version"], next(a for a in v["decision"]["actions"] if a["kind"] == "study_ready"))
    assert r.status_code == 200
    keeper.update_config(game_id, {"study_started_at": 0})                                                      # (a long time ago)
    done = client.post(f"/api/games/{game_id}/study/expire")
    assert done.status_code == 200 and done.json()["ready"] == [True, True]
    assert players[1].state()["view"]["prompt"]["kind"] in ("initial_discard", "draft")
    again = client.post(f"/api/games/{game_id}/study/expire")                                                   # (a second page asking at the same time: nothing happens)
    assert again.status_code == 200
    assert client.post("/api/games/E99999/study/expire").status_code == 404


def test_the_game_goes_on_after_the_study_time_with_the_cards_known_before_the_draft():
    client, keeper, _ = _app()
    game_id, players = _table(client, marine_worlds=True)
    _join_both(client, game_id, players)
    hand = players[0].state()["view"]["players"][0]["hand"]
    assert hand and "?" not in hand                                                                             # the starting hand is known before the study time ends
    for p in players:
        v = p.state()
        assert p.move(v["version"], next(a for a in v["decision"]["actions"] if a["kind"] == "study_ready")).status_code == 200
    v = players[0].state()
    assert v["view"]["prompt"]["kind"] == "draft" and v["view"]["players"][0]["hand"] == hand
    label = keeper.view(game_id, "spectator").get("label", "")
    assert "ready" in label.lower()


def test_an_ark360_game_records_and_replays_with_its_layout():
    import json
    from ark_nova.engine.actions import Action
    from ark_nova.engine.game import apply, new_game
    from ark_nova.live import archive as arch
    from ark_nova.replay import from_record
    from ark_nova.replay.view import state_view
    from test_record_replay import _same, _world
    client, keeper, registry, archive, service = _world()
    game_id, players = _table(client)
    _join_both(client, game_id, players)
    for p in players:                                                                                           # both ready, then some random play
        v = p.state()
        p.move(v["version"], next(a for a in v["decision"]["actions"] if a["kind"] == "study_ready"))
    from test_live_service import _play
    assert _play(players, 40, random.Random(3)) == 40
    assert players[0].c.post(f"/api/games/{game_id}/concede", headers=players[0].h, json={}).status_code == 200
    record = arch.decode(archive.read(registry.latest(game_id)["gcs_path"]))
    body = from_record.replay_from_record(record)
    layout = body["steps"][0]["state"]["players"][0]["bonus_layout"]
    assert layout and body["maps"][0]["placement_bonuses"] == body["maps"][1]["placement_bonuses"] == layout       # the viewer draws the layout it was played with
    st = new_game(record["options"], record["player_ids"], record["tail_seed"])
    assert st.players[0].bonus_layout == layout                                                                 # (the seed makes it again)
    kept = from_record.effective_steps(record["steps"])
    for step, item in zip(body["steps"][1:], kept):
        a = item["step"]["action"]
        st = apply(st, Action(a["player"], a["kind"], a["args"]))
        assert _same(step["state"], state_view(st)), step["index"]


import pytest


@pytest.mark.parametrize("mw", [False, True])
@pytest.mark.parametrize("rated", [False, True])
def test_the_usual_lobby_settings_apply_to_ark360(rated, mw, monkeypatch):
    """Friendly or rated, base game or Marine Worlds: a custom mode is created and played like every other, and only a rated game moves the ratings."""
    from ark_nova.accounts import rating as elo
    from test_rated_games import World
    monkeypatch.setattr(elo, "MIN_RATED_TURNS", 0)
    w = World()
    alice, bob = w.browser("Alice"), w.browser("Bob")
    g = alice.post("/api/games", json={"game_mode": "ark360", "marine_worlds": mw, "rated": rated}).json()
    gid, tokens, seat_a = g["game_id"], g["tokens"], g["creator_seat"]
    browsers = [alice if i == seat_a else bob for i in range(2)]
    for i, c in enumerate(browsers):
        assert c.post(f"/api/games/{gid}/join", headers={"X-Seat-Token": tokens[i]}, json={"name": f"P{i}"}).status_code == 200
    rng = random.Random(1)
    players = [Player(browsers[i], gid, tokens[i], rng) for i in range(2)]
    assert alice.get(f"/api/games/{gid}").json()["rated"] is rated
    sk = alice.get(f"/api/games/{gid}/setup", headers={"X-Seat-Token": tokens[seat_a]}).json()
    assert sk["marine_worlds"] is mw and sk["maps"][0]["id"] == sk["maps"][1]["id"] and sk["clock"]["start"] == ark360.time_control()["start"] * 1000
    for p in players:
        v = p.state()
        assert p.move(v["version"], next(a for a in v["decision"]["actions"] if a["kind"] == "study_ready")).status_code == 200
    assert players[0].state()["view"]["prompt"]["kind"] == ("draft" if mw else "initial_discard")                # (the draft is the Marine Worlds game's)
    assert players[1].c.post(f"/api/games/{gid}/concede", headers=players[1].h, json={}).json()["status"] == "conceded"
    assert (w.ratings("Alice", "Bob") != [0.0, 0.0]) is rated                                                      # (two new accounts: the winner gains 20)


def test_a_player_can_take_ready_back_until_both_are_ready():
    client, keeper, _ = _app()
    game_id, players = _table(client)
    _join_both(client, game_id, players)

    def act(p, kind):
        v = p.state()
        return p.move(v["version"], next(a for a in v["decision"]["actions"] if a["kind"] == kind))
    assert act(players[0], "study_ready").status_code == 200
    assert [a["kind"] for a in players[0].state()["decision"]["actions"]] == ["study_unready"] and [a["kind"] for a in players[1].state()["decision"]["actions"]] == ["study_ready"]
    assert players[1].state()["view"]["study"]["ready"] == [True, False]                                      # (the other player sees it)
    assert act(players[0], "study_unready").status_code == 200
    assert players[1].state()["view"]["study"]["ready"] == [False, False]
    assert "not ready" in keeper.view(game_id, "spectator")["label"].lower()
    assert act(players[0], "study_ready").status_code == 200 and act(players[1], "study_ready").status_code == 200
    assert players[0].state()["view"]["prompt"]["kind"] in ("draft", "initial_discard")                         # both were ready: the game goes on


def test_a_ready_made_a_moment_after_the_other_players_is_previewed_and_played():
    """Both players press ready at nearly the same time: the page of the second one still has the older position. The preview and the move must both accept it."""
    client, keeper, _ = _app()
    game_id, players = _table(client)
    _join_both(client, game_id, players)
    old = players[1].state()                                                                                    # (what the second page knows)
    first = players[0].state()
    assert players[0].move(first["version"], next(a for a in first["decision"]["actions"] if a["kind"] == "study_ready")).status_code == 200
    act = next(a for a in old["decision"]["actions"] if a["kind"] == "study_ready")
    pre = client.post(f"/api/games/{game_id}/preview", headers=players[1].h, json={"version": old["version"], "action": act})
    assert pre.status_code == 200, pre.text                                                                     # (it was 409 "stale version": the page said "Another move got in first")
    assert players[1].move(old["version"], act).status_code == 200
    assert players[0].state()["view"]["prompt"]["kind"] in ("draft", "initial_discard")                         # both were ready: the game goes on
    stale = client.post(f"/api/games/{game_id}/preview", headers=players[1].h, json={"version": old["version"], "action": {"player": 1, "kind": "initial_discard", "args": {"cards": []}}})
    assert stale.status_code in (409, 422)                                                                      # (a move that is not the one still legal is refused as before)
