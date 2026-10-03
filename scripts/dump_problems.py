"""Run the differential test on every sample log and pickle the problems: python scripts/dump_problems.py OUT.pkl"""
import glob, pickle, sys
from ark_nova.parser import parse_log
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log
from ark_nova.replay.differential import run_differential
out=[]
for f in sorted(glob.glob("log_examples/*.json")):
    if "800035115" in f: continue
    p = parse_log(f); s, cfg, seed = game_from_log(p)
    r = build_replay(p, s, cfg, seed)
    rep = run_differential(p, r, {pid: i for i, pid in enumerate(s.seats)})
    out += [(f[-14:-5], 'I', x) for x in rep.illegal] + [(f[-14:-5], 'M', x) for x in rep.mismatches]
pickle.dump(out, open(sys.argv[1], 'wb'))
