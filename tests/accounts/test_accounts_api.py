"""The /api/auth routes: cookie sessions, the origin check, and an account playing a mini game."""
from fastapi.testclient import TestClient

from ark_nova.accounts.seeds import BgaPlayer, ListSeedIndex
from ark_nova.accounts.service import AccountService
from ark_nova.accounts.store import MemoryStore
from ark_nova.api.main import create_app
from ark_nova.config import Settings

from test_accounts_service import FastHasher, GOOD

SEEDS = ListSeedIndex([BgaPlayer("89107474", "Xiao93", 447.53, 1683, 410, "2026-10-08"), BgaPlayer("7", "Twin", 100, None, 1, "2020"), BgaPlayer("8", "Twin", 200, None, 1, "2021")])


def client(**kw):
    svc = AccountService(MemoryStore(), SEEDS, FastHasher())
    return TestClient(create_app(Settings(), accounts=svc, **kw)), svc


def test_the_accounts_are_off_unless_a_store_is_configured():
    c = TestClient(create_app(Settings()))
    assert c.get("/api/auth/me").status_code in (404, 405)


def test_register_sets_the_cookie_and_me_returns_the_account():
    c, _ = client()
    assert c.get("/api/auth/me").json() == {"enabled": True, "account": None}
    r = c.post("/api/auth/register", json={"username": "Xiao93", "password": GOOD, "bga_player_id": "89107474"})
    assert r.status_code == 200
    body = r.json()
    assert body["account"]["id"] == "89107474" and body["account"]["rating"] == 448 and len(body["recovery_code"]) == 24
    cookie = r.headers["set-cookie"]
    assert "ark_session=" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie and "Secure" not in cookie
    assert c.get("/api/auth/me").json()["account"]["username"] == "Xiao93"
    assert "hash" not in r.text


def test_secure_cookie_behind_https():
    c, _ = client()
    r = c.post("/api/auth/register", json={"username": "Alice", "password": GOOD}, headers={"X-Forwarded-Proto": "https"})
    assert "Secure" in r.headers["set-cookie"] and r.json()["account"]["id"] == "P1"


def test_check_then_register_with_a_choice():
    c, _ = client()
    chk = c.post("/api/auth/check", json={"username": "twin"}).json()
    assert [m["bga_player_id"] for m in chk["matches"]] == ["8", "7"] and chk["available"]
    assert c.post("/api/auth/register", json={"username": "twin", "password": GOOD, "bga_player_id": "7"}).json()["account"]["rating"] == 100
    assert c.post("/api/auth/check", json={"username": "TWIN"}).json()["available"] is False


def test_login_logout_and_errors_are_json():
    c, svc = client()
    c.post("/api/auth/register", json={"username": "Alice", "password": GOOD})
    c.post("/api/auth/logout", json={})
    assert c.get("/api/auth/me").json()["account"] is None
    bad = c.post("/api/auth/login", json={"username": "alice", "password": "wrong password!"})
    assert bad.status_code == 401 and bad.json()["status"] == "bad_login"
    assert c.post("/api/auth/login", json={"username": "alice", "password": GOOD}).status_code == 200
    assert c.get("/api/auth/me").json()["account"]["id"] == "P1"
    assert c.post("/api/auth/register", content=b"nope").json()["status"] == "bad_json"
    assert c.post("/api/auth/register", json={"username": "x", "password": GOOD}).json()["status"] == "bad_username"


def test_a_post_from_another_site_is_refused():
    c, _ = client()
    r = c.post("/api/auth/register", json={"username": "Mallory", "password": GOOD}, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403 and r.json()["status"] == "bad_origin"
    ok = c.post("/api/auth/register", json={"username": "Mallory", "password": GOOD}, headers={"Origin": "https://ark-nova.pages.dev", "Host": "run.app.example"})
    assert ok.status_code == 200                                                          # the Pages site, through its /api proxy
    same = c.post("/api/auth/login", json={"username": "mallory", "password": GOOD}, headers={"Origin": "http://testserver"})
    assert same.status_code == 200


def test_recover_over_http():
    c, _ = client()
    code = c.post("/api/auth/register", json={"username": "Alice", "password": GOOD}).json()["recovery_code"]
    r = c.post("/api/auth/recover", json={"username": "alice", "recovery_code": code, "password": "a brand new password"})
    assert r.status_code == 200 and r.json()["recovery_code"] != code
    assert c.post("/api/auth/login", json={"username": "alice", "password": "a brand new password"}).status_code == 200


def test_an_unknown_api_path_is_a_404_answer_never_a_redirect(monkeypatch):
    monkeypatch.setenv("PAGES_URL", "https://site.example")
    c = TestClient(create_app(Settings()), follow_redirects=False)
    assert c.get("/api/does/not/exist").status_code == 404
    assert c.get("/replay.html").status_code == 307
