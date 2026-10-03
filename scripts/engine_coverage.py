"""Differential coverage of the rules engine against the log-driven replays (turn by turn).

Run: python scripts/engine_coverage.py [max_games]
"""
import collections
import glob
import sys

from ark_nova.parser import parse_log
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log
from ark_nova.replay.differential import run_differential

limit = int(sys.argv[1]) if len(sys.argv) > 1 else 10 ** 9
turns = checked = plists = 0
kinds = collections.Counter()
skipped = collections.Counter()
illegal, mism = [], []
for f in sorted(glob.glob("log_examples/*.json"))[:limit]:
    if "800035115" in f:
        continue
    parsed = parse_log(f)
    setup, cfg, seed = game_from_log(parsed)
    replay = build_replay(parsed, setup, cfg, seed)
    rep = run_differential(parsed, replay, {pid: i for i, pid in enumerate(setup.seats)})
    turns += rep.turns
    checked += rep.checked
    plists += rep.placement_lists
    kinds.update(rep.checked_kinds)
    skipped.update(rep.skipped)
    illegal += [f[-14:] + " " + x for x in rep.illegal]
    mism += [f[-14:] + " " + x for x in rep.mismatches]
print(f"turns {turns}, checked by the engine {checked}, illegal {len(illegal)}, mismatches {len(mism)}, BGA placement lists compared {plists}")
print("actions compared:", dict(kinds))
print("skipped:", skipped.most_common(30))
for x in illegal[:6]:
    print("ILLEGAL", x)
for x in mism[:6]:
    print("MISMATCH", x)
