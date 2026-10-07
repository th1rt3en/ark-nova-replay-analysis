"""Run the site locally with the live games on in-memory twins of the keeper, BigQuery and GCS (nothing leaves the machine), and one recorded game ready to replay.

    python scripts/live_demo.py [--port 8766] [--moves 160]

Open http://localhost:8766/replay.html?table=E1 : a game that two scripted players played (with undo, restart and confirm) and one of them conceded.
A second game (E2) is running: the script prints the two seat links for play.html (the page asks the server every 2 seconds: there is no socket server here).
New games can be made with POST /api/games (see docs/live_game_plan.md section 6).
"""
import argparse
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))

import uvicorn  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from ark_nova.api.main import create_app  # noqa: E402
from ark_nova.config import Settings  # noqa: E402
from ark_nova.live import archive as arch, registry as reg  # noqa: E402
from ark_nova.live.fake import FakeKeeper  # noqa: E402
from ark_nova.live.service import LiveService  # noqa: E402
from test_live_service import Idx, Logs, _join_both, _play, _start  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8766)
    ap.add_argument("--moves", type=int, default=160)
    args = ap.parse_args()
    service = LiveService(FakeKeeper(), engine_version="demo", registry=reg.FakeRegistry(), archive=arch.FakeArchive())
    app = create_app(Settings(cache_dir="off"), Idx(), Logs(), live=service)
    client = TestClient(app)
    game_id, players = _start(client)
    _join_both(client, game_id, players)
    _play(players, args.moves, random.Random(2))
    client.post(f"/api/games/{game_id}/concede", headers=players[0].h, json={})
    print(f"recorded game {game_id}: http://localhost:{args.port}/replay.html?table={game_id}")
    live_id, live_players = _start(client)                                       # a second game, still running: play it in the browser
    for i, p in enumerate(live_players):
        client.post(f"/api/games/{live_id}/join", headers=p.h, json={"name": ["Ann", "Bob"][i]})
    _play(live_players, 6, random.Random(5))
    for i, p in enumerate(live_players):
        print(f"running game {live_id}, seat {i + 1}: http://localhost:{args.port}/play.html?game={live_id}&s={p.token}")
    print(f"spectator: http://localhost:{args.port}/play.html?game={live_id}")
    pick = client.post("/api/games", json={"game_mode": "original"}).json()                # a game whose players still have to choose their maps
    from test_live_service import Player
    pick_players = [Player(client, pick["game_id"], t, random.Random(1)) for t in pick["tokens"]]
    for i, p in enumerate(pick_players):
        client.post(f"/api/games/{pick['game_id']}/join", headers=p.h, json={"name": ["Cy", "Di"][i]})
        print(f"map choice {pick['game_id']}, seat {i + 1}: http://localhost:{args.port}/play.html?game={pick['game_id']}&s={p.token}")
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
