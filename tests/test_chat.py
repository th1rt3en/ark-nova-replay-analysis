"""The chat of the tables and the lobbies (live/chat.py, api/chat.py): who may write, who may read, and that a spectator sees nothing but the public view of the game."""
from test_rated_games import World


def _table(world, friendly=True):
    """A started friendly table made by link: (game id, the two seat tokens)."""
    made = world.browser().post("/api/games", json={"rated": False}).json()
    gid = made["game_id"]
    for i, name in enumerate(("Ann", "Bob")):
        assert world.browser().post(f"/api/games/{gid}/join", headers={"X-Seat-Token": made["tokens"][i]}, json={"name": name}).status_code == 200
    return gid, made["tokens"]


def test_players_write_with_their_seat_token_and_everybody_reads():
    w = World()
    gid, tokens = _table(w)
    anon = w.browser()
    assert anon.get(f"/api/chat/tables/{gid}").json() == {"messages": [], "last": 0}
    ann = anon.post(f"/api/chat/tables/{gid}", headers={"X-Seat-Token": tokens[0]}, json={"text": "  hello <b>there</b>  "})
    assert ann.status_code == 200, ann.text
    msg = ann.json()["message"]
    assert (msg["name"], msg["kind"], msg["seat"], msg["text"]) == ("Ann", "player", 0, "hello <b>there</b>")
    bob = w.browser().post(f"/api/chat/tables/{gid}", headers={"X-Seat-Token": tokens[1]}, json={"text": "hi Ann"}).json()["message"]
    assert (bob["name"], bob["seat"], bob["seq"]) == ("Bob", 1, 2)
    got = anon.get(f"/api/chat/tables/{gid}").json()
    assert [m["text"] for m in got["messages"]] == ["hello <b>there</b>", "hi Ann"] and got["last"] == 2
    assert [m["seq"] for m in anon.get(f"/api/chat/tables/{gid}", params={"since": 1}).json()["messages"]] == [2]


def test_a_spectator_must_be_logged_in_to_write_and_is_shown_as_a_spectator():
    w = World()
    gid, tokens = _table(w)
    anon, carol = w.browser(), w.browser("Carol")
    r = anon.post(f"/api/chat/tables/{gid}", json={"text": "let me in"})
    assert r.status_code == 401 and r.json()["status"] == "login_needed"
    bad = anon.post(f"/api/chat/tables/{gid}", headers={"X-Seat-Token": "not-a-seat-token"}, json={"text": "x"})
    assert bad.status_code == 401                                                                  # (a wrong token is no seat: a spectator, who is not logged in)
    msg = carol.post(f"/api/chat/tables/{gid}", json={"text": "good luck!"}).json()["message"]
    assert (msg["name"], msg["kind"], msg["seat"]) == ("Carol", "spectator", None)
    seen = w.browser().get(f"/api/chat/tables/{gid}").json()["messages"]
    assert seen[0]["name"] == "Carol" and set(seen[0]) == {"seq", "at", "name", "kind", "seat", "text"}       # (no account id)


def test_the_text_is_checked_and_a_sender_cannot_flood():
    w = World()
    gid, tokens = _table(w)
    ann = w.browser()
    url, h = f"/api/chat/tables/{gid}", {"X-Seat-Token": tokens[0]}
    assert ann.post(url, headers=h, json={"text": "   "}).status_code == 422
    assert ann.post(url, headers=h, json={"text": "x" * 501}).status_code == 422
    assert ann.post(url, headers=h, json={"text": 5}).status_code == 422
    assert ann.post(url, headers=h, json={"text": "ok"}).status_code == 200
    again = ann.post(url, headers=h, json={"text": "again"})
    assert again.status_code == 429 and again.json()["status"] == "slow_down"
    assert ann.get("/api/chat/tables/E99999").status_code == 404                                    # no such table
    assert ann.get("/api/chat/tables/nonsense").status_code == 404


def test_a_spectator_sees_only_the_public_view_of_the_game():
    w = World()
    gid, tokens = _table(w)
    anon = w.browser()
    spectator = anon.get(f"/api/games/{gid}/state").json()["view"]
    mine = anon.get(f"/api/games/{gid}/state", headers={"X-Seat-Token": tokens[0]}).json()["view"]
    hand = lambda v, seat: v["players"][seat]["hand"]
    assert all(c == "?" for c in hand(spectator, 0) + hand(spectator, 1))                            # nobody's hand is shown to a spectator
    assert any(c != "?" for c in hand(mine, 0)) and all(c == "?" for c in hand(mine, 1))               # a player sees their own cards only
    assert spectator["main_deck"] == [] and spectator["endgame_deck"] == [] and mine["main_deck"] == []         # (the order of the piles is nobody's: only their sizes)


def test_a_lobby_chat_is_for_the_players_and_the_visitors_of_the_lobby():
    w = World()
    alice, bob, carol = w.browser("Alice"), w.browser("Bob"), w.browser("Carol")
    lobby = alice.post("/api/lobbies", json={}).json()["id"]
    url = f"/api/chat/lobbies/{lobby}"
    assert w.browser().get(url).json() == {"messages": [], "last": 0}                                  # (anybody reads the chat of a lobby)
    anon_post = w.browser().post(url, json={"text": "hi"})
    assert anon_post.status_code == 401 and anon_post.json()["status"] == "login_needed"                # (writing needs an account)
    assert alice.post(url, json={"text": "welcome"}).status_code == 200
    bob.post(f"/api/lobbies/{lobby}/join", json={"seat": 1})
    reply = bob.post(url, json={"text": "thanks"}).json()["message"]
    assert (reply["name"], reply["kind"], reply["seat"]) == ("Bob", "player", 1)
    visitor = carol.post(url, json={"text": "can I watch?"}).json()["message"]                         # (a visitor who has not taken a seat is a spectator)
    assert (visitor["name"], visitor["kind"], visitor["seat"]) == ("Carol", "spectator", None)
    assert [m["text"] for m in alice.get(url).json()["messages"]] == ["welcome", "thanks", "can I watch?"]
    assert alice.get("/api/chat/lobbies/L99999").status_code == 404
