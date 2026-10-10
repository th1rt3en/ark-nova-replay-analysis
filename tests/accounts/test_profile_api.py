"""Profiles, the ratings board, deleting an account and the signup check (Turnstile)."""
from fastapi.testclient import TestClient

from ark_nova.accounts import rating as elo
from ark_nova.accounts.rating import RatingChange
from ark_nova.accounts.service import AccountService
from ark_nova.accounts.store import MemoryStore
from ark_nova.api.main import create_app
from ark_nova.config import Settings
from test_accounts_service import FastHasher, GOOD


def app_with(store=None, **kw):
    svc = AccountService(store or MemoryStore(), hasher=FastHasher())
    return TestClient(create_app(Settings(), accounts=svc, **kw)), svc


def rated(store, game, a, b, score_a=1.0):
    ra, rb = store.ratings_of([a, b])[a][0], store.ratings_of([a, b])[b][0]
    na, nb = elo.updated(ra, rb, score_a)
    at = f"2026-10-{10 + int(game[1:]) % 10:02d}T00:00:00+00:00"
    assert store.commit_ratings(game, [RatingChange(game, a, 0, b, score_a, ra, na, at), RatingChange(game, b, 1, a, 1 - score_a, rb, nb, at)]) == "applied"


def test_a_profile_shows_the_rating_and_the_last_rated_games():
    c, svc = app_with()
    a = c.post("/api/auth/register", json={"username": "Alice", "password": GOOD}).json()["account"]["id"]
    b = TestClient(c.app).post("/api/auth/register", json={"username": "Bob", "password": GOOD}).json()["account"]["id"]
    for n in range(6):
        rated(svc.store, f"E{n}", a, b, 1.0 if n % 3 else 0.0)
    p = c.get(f"/api/players/{a}").json()
    assert p["username"] == "Alice" and p["rated_games"] == 6 and p["rated_wins"] == 4 and p["listed"] is True and p["id"] == a
    assert len(p["history"]) == 6 and p["history"][0]["opponent"] == "Bob" and p["history"][0]["game_id"] == "E5" and "hash" not in str(p)       # newest first, no secrets
    assert c.get("/api/players/P999").status_code == 404 and c.get("/api/players/not-an-id").status_code == 404
    assert c.get(f"/api/players/{a}").headers["cache-control"] == "public, max-age=60"


def test_the_ratings_board_lists_players_with_enough_rated_games():
    c, svc = app_with()
    ids = [TestClient(c.app).post("/api/auth/register", json={"username": n, "password": GOOD}).json()["account"]["id"] for n in ("Ann", "Ben", "Cid")]
    for n in range(elo.MIN_LISTED_GAMES):
        rated(svc.store, f"E{n}", ids[0], ids[1])
    rated(svc.store, "E9", ids[2], ids[1])                                                          # Cid has played once: not listed
    r = c.get("/api/leaderboard/ratings")
    rows = r.json()["rows"]
    assert [(x["rank"], x["username"]) for x in rows] == [(1, "Ann"), (2, "Ben")] and rows[0]["rated_games"] == 5 and rows[0]["rating"] > 0 == rows[1]["rating"]
    assert r.json()["min_games"] == elo.MIN_LISTED_GAMES and r.headers["cache-control"] == "public, max-age=60"
    assert c.get("/api/leaderboard/ratings?_=1").headers["cache-control"] == "no-store"


def test_deleting_an_account_keeps_the_games_and_frees_the_name():
    c, svc = app_with()
    a = c.post("/api/auth/register", json={"username": "Alice", "password": GOOD}).json()["account"]["id"]
    b = TestClient(c.app).post("/api/auth/register", json={"username": "Bob", "password": GOOD}).json()["account"]["id"]
    for n in range(5):
        rated(svc.store, f"E{n}", a, b)
    assert c.post("/api/auth/delete", json={"password": "not the password"}).status_code == 401
    assert c.get("/api/auth/me").json()["account"]["id"] == a                                       # a wrong password deletes nothing
    assert c.post("/api/auth/delete", json={"password": GOOD}).status_code == 200
    assert c.get("/api/auth/me").json()["account"] is None
    assert c.post("/api/auth/login", json={"username": "alice", "password": GOOD}).status_code == 401
    assert c.get(f"/api/players/{a}").status_code == 404
    assert [r["username"] for r in c.get("/api/leaderboard/ratings").json()["rows"]] == ["Bob"]
    assert svc.store.usernames([a]) == {a: "Deleted player"} and len(svc.store.rating_changes("E0")) == 2      # the games stay, under that name
    again = TestClient(c.app).post("/api/auth/register", json={"username": "Alice", "password": GOOD})
    assert again.status_code == 200 and again.json()["account"]["id"] != a
    assert TestClient(c.app).post("/api/auth/delete", json={"password": GOOD}).status_code == 401           # nobody is logged in


def test_the_signup_check_of_turnstile_when_it_is_configured():
    seen = []

    def verify(token, ip):
        seen.append(token)
        return token == "good"

    svc = AccountService(MemoryStore(), hasher=FastHasher())
    from ark_nova.api.accounts import add_routes
    from fastapi import FastAPI
    app = FastAPI()
    add_routes(app, svc, [], "site-key-123", verify)
    c = TestClient(app)
    assert c.get("/api/auth/config").json() == {"turnstile_site_key": "site-key-123"}
    assert c.post("/api/auth/register", json={"username": "Alice", "password": GOOD}).json()["status"] == "captcha_failed"
    assert c.post("/api/auth/register", json={"username": "Alice", "password": GOOD, "turnstile_token": "bad"}).status_code == 403
    assert c.post("/api/auth/register", json={"username": "Alice", "password": GOOD, "turnstile_token": "good"}).status_code == 200
    assert c.post("/api/auth/login", json={"username": "alice", "password": GOOD}).status_code == 200      # only the signup is checked
    plain, _ = app_with()
    assert plain.get("/api/auth/config").json() == {"turnstile_site_key": ""}
    assert plain.post("/api/auth/register", json={"username": "Zed", "password": GOOD}).status_code == 200
