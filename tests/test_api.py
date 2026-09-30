from fastapi.testclient import TestClient

from ark_nova.api.main import create_app
from ark_nova.config import Settings
from ark_nova.storage.index import LoggedTable


def test_healthz():
    assert TestClient(create_app(Settings())).get("/healthz").json() == {"status": "ok"}


def test_table_not_logged():
    r = TestClient(create_app(Settings())).get("/api/tables/123")
    assert r.status_code == 404
    assert r.json()["error"] == "not_logged"


def test_table_logged():
    class Idx:
        def find(self, table_id):
            return LoggedTable(table_id, "gs://b/x.json", {"1": "3a"}, True)

    r = TestClient(create_app(Settings(), Idx())).get("/api/tables/5")
    assert r.status_code == 200 and r.json()["marine_worlds"] is True


def test_index_page_served():
    assert "Ark Nova Replay" in TestClient(create_app(Settings())).get("/").text
