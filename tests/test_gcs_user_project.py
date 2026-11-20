"""GCS_USER_PROJECT: off = the calls are unchanged; on = every bucket is opened with the billing project (Requester Pays)."""
from ark_nova.storage import gcs


class FakeClient:
    def __init__(self):
        self.calls = []

    def bucket(self, name, **kw):
        self.calls.append(("bucket", name, kw))
        return self

    def list_blobs(self, name, **kw):
        self.calls.append(("list_blobs", name, kw))
        return []


def test_off_sends_nothing(monkeypatch):
    monkeypatch.delenv("GCS_USER_PROJECT", raising=False)
    c = FakeClient()
    gcs.bucket(c, "b")
    gcs.list_blobs(c, "b", prefix="p/")
    assert c.calls == [("bucket", "b", {}), ("list_blobs", "b", {"prefix": "p/"})]


def test_on_sends_the_billing_project(monkeypatch):
    monkeypatch.setenv("GCS_USER_PROJECT", "my-project")
    c = FakeClient()
    gcs.bucket(c, "b")
    gcs.list_blobs(c, "b", prefix="p/")
    assert c.calls == [("bucket", "b", {"user_project": "my-project"}), ("list_blobs", "b", {"prefix": "p/", "user_project": "my-project"})]
