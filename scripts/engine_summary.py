"""Group the illegal actions / mismatches of the differential test by kind (debugging aid).

Run: python scripts/engine_summary.py
"""
import collections
import glob
import re

from ark_nova.parser import parse_log
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log
from ark_nova.replay.differential import run_differential

cls = collections.Counter()
ex = {}
tot = collections.Counter()
for f in sorted(glob.glob("log_examples/*.json")):
    if "800035115" in f:
        continue
    parsed = parse_log(f)
    setup, cfg, seed = game_from_log(parsed)
    replay = build_replay(parsed, setup, cfg, seed)
    rep = run_differential(parsed, replay, {pid: i for i, pid in enumerate(setup.seats)})
    tot["checked"] += rep.checked
    tot["placement lists"] += rep.placement_lists
    for m in rep.mismatches + rep.illegal:
        types = sorted(set(re.findall(r"(size-\d|pavilion|kiosk|petting-zoo|small-aquarium|large-aquarium)(?=: engine-only)", m)))
        k = ("MISMATCH" if m in rep.mismatches else "ILLEGAL", tuple(types) if types else re.sub(r"turn \d+: ", "", m)[:50])
        cls[k] += 1
        ex.setdefault(k, (f[-14:-5], m[:330]))
print(dict(tot), "problems:", sum(cls.values()))
import sys
for k, n in cls.most_common(int(sys.argv[1]) if len(sys.argv) > 1 else 12):
    print(n, k, "\n    ", ex[k])
