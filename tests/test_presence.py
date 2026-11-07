"""Who is on the site: the pages beat to the Worker, Cloud Run only reads the count (`/api/admin/online`, `X-Admin-Secret`). The Worker's side is tested in cloudflare/test/presence.test.ts."""
import pytest
from fastapi.testclient import TestClient

from ark_nova.api.main import create_app
from ark_nova.config import Settings
from ark_nova.live.keeper import LiveError


class Idx:
    def find(self, table_id):
        return None


class Logs:
    def read(self, gcs_path, table_id):
        raise AssertionError("no log is read here")


class Stub:
    def __init__(self):
        self.asked = []

    def online(self, hours=48):
        self.asked.append(hours)
        if hours == 24 * 14:                              # (the cap: only a request for the longest history reaches the "down" Worker)
            raise LiveError("down", 502)
        return {"online": 4, "by_page": {"replay": 3, "play": 1}, "peak_24h": 9, "hourly_peaks": [], "window_s": 180}


@pytest.fixture()
def client():
    app = create_app(Settings(cache_dir="off", internal_secret="s3cret"), Idx(), Logs())
    app.state.presence = Stub()
    return TestClient(app)


def test_the_pages_get_no_worker_without_a_keeper(client):
    assert client.get("/api/presence/config").json() == {"base": ""}              # (the dev server and the tests have no Worker: the pages send no heartbeat)


def test_the_count_needs_the_admin_secret(client):
    assert client.get("/api/admin/online").status_code == 403
    assert client.get("/api/admin/online", headers={"X-Admin-Secret": "wrong"}).status_code == 403
    r = client.get("/api/admin/online?hours=72", headers={"X-Admin-Secret": "s3cret"})
    assert r.status_code == 200 and r.json()["online"] == 4 and r.headers["cache-control"] == "no-store"
    assert client.app.state.presence.asked == [72]


def test_the_hours_are_capped_and_a_down_worker_is_a_502(client):
    r = client.get("/api/admin/online?hours=100000", headers={"X-Admin-Secret": "s3cret"})
    assert client.app.state.presence.asked == [24 * 14]
    assert r.status_code == 502 and r.json()["status"] == "presence_unavailable"


def test_without_a_secret_configured_nobody_gets_in():
    app = create_app(Settings(cache_dir="off", internal_secret=""), Idx(), Logs())
    assert TestClient(app).get("/api/admin/online", headers={"X-Admin-Secret": ""}).status_code == 403
