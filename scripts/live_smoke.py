"""Smoke test of the deployed live game service: make a game, play it with two scripted players over the real routes and the real keeper, concede, then check what the end of a
game must leave behind: the registry row in BigQuery, the record in GCS, the replay of the record, and the keeper that has forgotten the table.

    python scripts/live_smoke.py [--base https://ark-nova-replay-analysis-725889947830.us-central1.run.app] [--moves 40] [--mode random-mirrored] [--mw]

It uses a table number of the real counter (the game is `E<n>` in the registry, with the note `smoke` nowhere: delete nothing, it is a normal conceded game). Needs credentials for
BigQuery and GCS (`gcloud auth application-default login`).
"""
import argparse
import json
import random
import sys
import time
import urllib.error
import urllib.request

BASE = "https://ark-nova-replay-analysis-725889947830.us-central1.run.app"


def call(base, method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"User-Agent": "ark-nova-smoke/1", "Content-Type": "application/json", **({"X-Seat-Token": token} if token else {})}
    req = urllib.request.Request(base + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, {"raw": raw[:200].decode("utf-8", "replace")}


def check(ok, text):
    print(("ok   " if ok else "FAIL ") + text)
    if not ok:
        raise SystemExit(1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=BASE)
    ap.add_argument("--moves", type=int, default=40)
    ap.add_argument("--mode", default="random-mirrored")
    ap.add_argument("--mw", action="store_true")
    a = ap.parse_args()
    rng = random.Random(7)

    s, opts = call(a.base, "GET", "/api/live/options")
    check(s == 200 and a.mode in [m["id"] for m in opts["game_modes"]], f"the engine offers the game mode {a.mode}")
    s, g = call(a.base, "POST", "/api/games", {"marine_worlds": a.mw, "game_mode": a.mode})
    check(s == 200 and g["game_id"].startswith("E"), f"game created: {g.get('game_id')}")
    gid, tokens = g["game_id"], g["tokens"]
    for i, t in enumerate(tokens):
        s, r = call(a.base, "POST", f"/api/games/{gid}/join", {"name": f"Smoke {i + 1}"}, t)
        check(s == 200, f"seat {i + 1} joined ({r.get('status')})")
    s, lob = call(a.base, "GET", f"/api/games/{gid}")
    check(lob["status"] == "playing", "the game is playing")

    moves = 0
    for _ in range(a.moves * 3):
        if moves >= a.moves:
            break
        views = [call(a.base, "GET", f"/api/games/{gid}/state", token=t)[1] for t in tokens]
        movers = [(t, v) for t, v in zip(tokens, views) if v.get("decision")]
        if not movers:
            check(False, "nobody has a move")
        t, v = rng.choice(movers)
        acts = [x for x in v["decision"]["actions"] if x["kind"] not in ("undo_last", "restart_turn")] or v["decision"]["actions"]
        act = rng.choice(acts)
        s, pv = call(a.base, "POST", f"/api/games/{gid}/preview", {"version": v["version"], "action": act}, t)
        check(s == 200, f"move {moves + 1}: preview ({act['kind']}, irreversible={pv.get('irreversible')})") if moves < 3 else None
        s, r = call(a.base, "POST", f"/api/games/{gid}/actions", {"version": v["version"], "action": act, "request_id": f"smoke-{moves}"}, t)
        if s != 200:
            check(False, f"move {moves + 1} refused: {s} {r}")
        moves += 1
    check(moves == a.moves, f"{moves} moves played over the real keeper")
    spectator = call(a.base, "GET", f"/api/games/{gid}/state")[1]
    check(spectator["view"]["viewer"] == "spectator" and "decision" not in spectator, "a spectator sees a view without a decision")
    check(all(c == "?" for p in spectator["view"]["players"] for c in p["hand"]), "the hands are hidden from the spectator")

    s, r = call(a.base, "POST", f"/api/games/{gid}/concede", {}, tokens[1])
    check(s == 200 and r["status"] == "conceded", "seat 2 conceded")
    time.sleep(4)
    s, r = call(a.base, "GET", f"/api/games/{gid}")
    check(s == 404, "the keeper no longer has the table (it was exported, then deleted)")

    from google.cloud import bigquery, storage
    bq = bigquery.Client(project="freestyle-190711")
    rows = list(bq.query(f"SELECT * FROM `freestyle-190711.ark_nova_engine.live_table_events` WHERE table_id = '{gid}' ORDER BY event_seq").result())
    check([r["status"] for r in rows] == ["waiting", "playing", "conceded"], f"registry events: {[r['status'] for r in rows]}")
    last = list(bq.query(f"SELECT * FROM `freestyle-190711.ark_nova_engine.live_tables` WHERE table_id = '{gid}'").result())[0]
    check(last["status"] == "conceded" and last["started_at"] and last["gcs_path"] and last["n_actions"] >= a.moves, f"the view: {last['status']}, path {last['gcs_path']}, {last['n_actions']} actions")
    bucket, path = last["gcs_path"][5:].split("/", 1)
    blob = storage.Client().bucket(bucket).blob(path)
    blob.reload() if blob.exists() else None
    check(blob.exists(), f"the record exists in GCS ({blob.size} bytes)")
    s, rep = call(a.base, "GET", f"/api/tables/{gid}/replay")
    check(s == 200 and len(rep["steps"]) > 3, f"the replay of the record opens ({len(rep.get('steps', []))} steps)")
    s, look = call(a.base, "GET", f"/api/lookup?q={gid}")
    check(look.get("status") == "ready", "the landing page lookup finds it")
    print(f"smoke test passed: {gid}  {a.base}/replay.html?table={gid}")


if __name__ == "__main__":
    sys.exit(main())
