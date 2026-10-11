from datetime import datetime, timezone

import pytest

from ark_nova.minigames.platform.contract import ManifestEntry
from ark_nova.minigames.platform.service import MiniGameService
from ark_nova.minigames.platform.sources import ListSourceIndex
from ark_nova.minigames.platform.store import MemoryStore, SqliteStore
import example_game as ex


class FakeClock:
    def __init__(self, text="2026-10-10T12:00:00+00:00"):
        self.now = datetime.fromisoformat(text)

    def __call__(self):
        return self.now

    def set(self, text):
        self.now = datetime.fromisoformat(text).astimezone(timezone.utc)


class FakeLogs:
    """read_log of the service: a dict table id -> GameLog (a missing table raises like a missing log)."""

    def __init__(self, logs):
        self.logs = logs

    def __call__(self, table_id):
        if table_id not in self.logs:
            raise LookupError(table_id)
        return self.logs[table_id]


def make_service(store=None, tables=range(1000, 1010), games=None, clock=None, logs=None, **kw):
    games = games if games is not None else {"example": ex.GAME, "brier": ex.Brier()}
    entries = [ManifestEntry(key=k, module="x", title=k.title(), blurb=f"the {k} game", allow_past=g.allow_past) for k, g in games.items()]
    logs = logs if logs is not None else FakeLogs({t: ex.fake_log(t) for t in tables})
    return MiniGameService(store or MemoryStore(), ListSourceIndex(list(tables)), logs, games, entries, clock=clock or FakeClock(), **kw)


@pytest.fixture(params=["memory", "sqlite"])
def store(request):
    return MemoryStore() if request.param == "memory" else SqliteStore(":memory:")


@pytest.fixture
def clock():
    return FakeClock()
