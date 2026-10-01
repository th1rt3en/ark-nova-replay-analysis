"""Dump every problem of the differential test with the animals played in that turn (debugging aid): python scripts/engine_problems.py [out.json]"""
import glob
import json
import re
import sys

from ark_nova import data
from ark_nova.parser import parse_log
from ark_nova.replay.actions import turn_events
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log
from ark_nova.replay.differential import run_differential

out = []
for f in sorted(glob.glob("log_examples/*.json")):
    if "800035115" in f:
        continue
    parsed = parse_log(f)
    setup, cfg, seed = game_from_log(parsed)
    replay = build_replay(parsed, setup, cfg, seed)
    rep = run_differential(parsed, replay, {pid: i for i, pid in enumerate(setup.seats)})
    turns = turn_events(parsed)
    for m in rep.mismatches + rep.illegal:
        n = int(re.match(r"turn (\d+)", m).group(1))
        animals = []
        if n < len(turns):
            for e in turns[n]:
                if e.type == "buyAnimal":
                    animals.append(data.parse_bga_card_id(e.args["card"]["id"])[0])
        chosen = [e.args["actionCard"]["type"] for e in turns[n] if e.type == "chooseActionCard"] if n < len(turns) else []
        out.append({"game": f[-14:-5], "turn": n, "msg": m[:300], "animals": animals, "chosen": chosen})
json.dump(out, open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/problems.json", "w"), indent=1)
print(len(out))
