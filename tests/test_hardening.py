"""Guards added after the review: the seed width, a stale 'waiting' cache, the retry of a failed export, the upload limit and the (opt-in) rate limit."""
import random
import time

from fastapi.testclient import TestClient

from ark_nova.api import ratelimit
from ark_nova.api.main import create_app
from ark_nova.config import Settings
from ark_nova.live import archive as arch
from ark_nova.live import registry as reg
from ark_nova.live.fake import FakeKeeper
from ark_nova.live.service import LiveService
from test_live_registry import _world
from test_live_service import Idx, Logs, _app, _join_both, _play, _start


def test_the_seed_of_a_new_game_is_wider_than_31_bits_and_fits_a_browser_number():
    client, keeper, _ = _app()
    seeds = []
    for _i in range(6):
        gid = client.post("/api/games", json={}).json()["game_id"]
        seeds.append(keeper.state(gid)["config"]["tail_seed"])
    assert max(seeds) >= 2 ** 31 and all(0 <= s < 2 ** 52 for s in seeds)


def test_a_cache_that_still_says_waiting_is_refreshed_before_a_move_is_refused():
    client, keeper, service = _app()
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    service._cache[game_id].status = "waiting"                                           # (the second player joined through another instance)
    r = players[0].move(0, {"player": 0, "kind": "no_such_move", "args": {}})
    assert r.status_code != 409, r.text                                                  # not "the game starts when both players have joined"
    assert service._cache[game_id].status == "playing"


def test_a_failed_export_is_tried_again_by_the_next_request_of_a_player():
    client, keeper, registry, archive, service = _world()
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    _play(players, 6, random.Random(4))
    archive.down = True
    assert players[0].c.post(f"/api/games/{game_id}/concede", headers=players[0].h, json={}).status_code == 200
    assert registry.latest(game_id)["status"] == "playing"
    archive.down = False
    players[1].state()                                                                   # the next request starts the repair
    for _i in range(50):
        if registry.latest(game_id).get("gcs_path"):
            break
        time.sleep(0.1)
    assert registry.latest(game_id)["gcs_path"] and registry.latest(game_id)["status"] == "conceded"


def test_a_huge_upload_is_refused_before_it_is_read():
    c = TestClient(create_app(Settings(cache_dir="off"), Idx(), Logs()))
    r = c.post("/api/tables/5/verify", content=b"x" * (ratelimit.MAX_UPLOAD_BYTES + 1))
    assert r.status_code == 413 and r.json()["status"] == "too_large"


def test_the_rate_limit_is_off_by_default_and_counts_api_calls_per_client_when_on():
    ratelimit._hits.clear()
    off = TestClient(create_app(Settings(cache_dir="off"), Idx(), Logs()))
    assert all(off.get("/api/lookup", params={"q": "x"}).status_code == 400 for _i in range(80))
    ratelimit._hits.clear()
    on = TestClient(create_app(Settings(cache_dir="off", rate_limit_enabled=True, rate_limit_per_minute=3), Idx(), Logs()))
    codes = [on.get("/api/lookup", params={"q": "x"}).status_code for _i in range(5)]
    assert codes == [400, 400, 400, 429, 429]
    assert on.get("/healthz").status_code == 200                                         # (only /api/ is limited)
    ratelimit._hits.clear()
