"""Create the puzzles of earlier days of a mini game (so the calendar of a game with `allow_past` is not empty).

    python scripts/minigames_backfill.py whos_ahead --from 2026-09-01 --to 2026-10-09 [--dry-run]

It does what the daily rollover does, for each day that has no puzzle yet: the game's picker query (`src/ark_nova/minigames/sql/<key>.sql`), the log from GCS, the puzzle and its answer,
stored in D1 through the Worker (needs `INTERNAL_SECRET`, from the environment or cloudflare/.dev.vars, and BigQuery / GCS credentials). A day that already has a puzzle is left alone, and a table
a game used before is never picked again. About 15 s a day.
"""
import argparse
import json
import os
import sys
import time
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
WORKER = "https://ark-nova-live.tobiko11.workers.dev"


def secret() -> str:
    if os.environ.get("INTERNAL_SECRET"):
        return os.environ["INTERNAL_SECRET"]
    for line in (ROOT / "cloudflare" / ".dev.vars").read_text().splitlines():
        if line.startswith("INTERNAL_SECRET"):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("INTERNAL_SECRET is not set")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("game")
    ap.add_argument("--from", dest="start", required=True)
    ap.add_argument("--to", dest="end", required=True)
    ap.add_argument("--dry-run", action="store_true", help="only list the days that have no puzzle")
    a = ap.parse_args()

    from ark_nova.config import Settings
    from ark_nova.minigames.platform.contract import GameLog
    from ark_nova.minigames.platform.d1 import D1MiniGameStore
    from ark_nova.minigames.platform.manifest import load_games, load_manifest
    from ark_nova.minigames.platform.service import MiniGameService
    from ark_nova.minigames.platform.sources import BigQuerySourceIndex
    from ark_nova.storage.elos import BigQueryElos
    from ark_nova.storage.index import BigQueryIndex
    from ark_nova.storage.logs import GcsLogStore
    from ark_nova.storeclient import StoreClient

    st = Settings()
    index, logs, elos = BigQueryIndex(st.bq_table, st.bq_logs_table), GcsLogStore(st.gcs_bucket), BigQueryElos(st.bq_table)

    def read_log(table_id: int) -> GameLog:
        rec = index.find(table_id)
        if rec is None or not rec.logged:
            raise LookupError(f"no log for table {table_id}")
        return GameLog(json.loads(logs.read(rec.gcs_path, table_id)), table_id, record=rec, elos=elos.get(table_id))

    entries = [e for e in load_manifest() if e.key == a.game]
    games = load_games(entries)
    if a.game not in games:
        raise SystemExit(f"{a.game} is not an enabled mini game")
    store = D1MiniGameStore(StoreClient(WORKER, secret()))
    svc = MiniGameService(store, BigQuerySourceIndex(), read_log, games, entries)
    first, last = date.fromisoformat(a.start), date.fromisoformat(a.end)
    if last >= date.fromisoformat(svc.today()):
        raise SystemExit("--to must be before today (today's puzzle is made by the daily rollover)")
    days = [(first + timedelta(n)).isoformat() for n in range((last - first).days + 1)]
    todo = [d for d in days if store.get_puzzle(a.game, d) is None]
    print(f"{a.game}: {len(days)} days, {len(days) - len(todo)} already have a puzzle, {len(todo)} to make", flush=True)
    if a.dry_run:
        print("missing:", ", ".join(todo))
        return
    made = failed = 0
    for d in todo:
        t = time.time()
        res = svc.rollover(d)[a.game]
        row = store.get_puzzle(a.game, d)
        print(f"{d}: {res}" + (f" (table {row.source_ref}, {time.time() - t:.0f} s)" if row else ""), flush=True)
        made += res == "created"
        failed += res == "failed"
    print(f"done: {made} created, {failed} failed", flush=True)


if __name__ == "__main__":
    main()
