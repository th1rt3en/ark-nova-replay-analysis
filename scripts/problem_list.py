"""The problems of the differential test, in parallel (about 6 minutes): python scripts/problem_list.py [out.json] [game ...]

Prints `table turn kind: text` for every illegal move and state mismatch of the sample logs (the same logs and filter as tests/test_engine_turn.py) and writes them to
out.json when given. With game ids, only those logs are run.
"""
import glob
import json
import re
import sys
from pathlib import Path

from ark_nova.parser import parse_log
from ark_nova.replay.batch import parallel_map
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import _sample_maps, game_from_log
from ark_nova.replay.differential import run_differential


def one(path):
    parsed = parse_log(path)
    setup, cfg, seed = game_from_log(parsed)
    replay = build_replay(parsed, setup, cfg, seed)
    rep = run_differential(parsed, replay, {pid: i for i, pid in enumerate(setup.seats)})
    return Path(path).stem, rep.checked, [("illegal", x) for x in rep.illegal] + [("mismatch", x) for x in rep.mismatches]


def main() -> None:
    args = [a for a in sys.argv[1:]]
    out = args.pop(0) if args and args[0].endswith(".json") else None
    only = set(args)
    known = _sample_maps()
    paths = [p for p in sorted(glob.glob("log_examples/*.json")) if "800035115" not in p and "573904205" not in p and Path(p).stem in known and (not only or Path(p).stem in only)]
    rows = []
    for name, checked, bad in parallel_map(one, paths):
        for kind, text in bad:
            m = re.match(r"turn (\d+)", text)
            rows.append({"table": name, "turn": int(m.group(1)) if m else -1, "kind": kind, "text": text})
    rows.sort(key=lambda r: (r["table"], r["turn"]))
    for r in rows:
        print(f"{r['table']} {r['turn']} {r['kind']}: {r['text'][:200]}")
    print(f"{len(rows)} problems in {len({r['table'] for r in rows})} games")
    if out:
        Path(out).write_text(json.dumps(rows, indent=4), encoding="utf-8")


if __name__ == "__main__":
    main()
