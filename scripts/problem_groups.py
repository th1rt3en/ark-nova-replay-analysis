"""Group the engine / log disagreements of a differential run with sample tables, turns and BGA move ids:
python scripts/problem_groups.py PICKLE   (the pickle is written by scripts/dump_problems.py)"""
import ast
import collections
import pickle
import re
import sys

from ark_nova.parser import parse_log
from ark_nova.replay.actions import turn_events

problems = pickle.load(open(sys.argv[1], "rb"))
groups = collections.defaultdict(list)
for game, kind, text in problems:
    if kind == "M":
        key = "M " + re.sub(r"\[\d\]", "[i]", text.split(": ", 1)[1].split(":")[0])[:30]
        groups[key].append((game, int(text.split()[1].rstrip(":"))))
        continue
    m = re.match(r"turn (\d+): (\w+) (\{.*?\}) not in legal", text)
    if not m:
        groups["I other: " + re.sub(r"\d+", "N", text[:50])].append((game, int(text.split()[1].rstrip(":"))))
        continue
    args = ast.literal_eval(m.group(3))
    sig = "I " + m.group(2)
    if m.group(2) == "choose_effect":
        sig += " " + ",".join(sorted(k for k in args if k not in ("index",)))[:34]
    groups[sig].append((game, int(m.group(1))))
cache = {}


def move(game, turn):
    if game not in cache:
        p = parse_log(f"log_examples/{game}.json")
        cache[game] = turn_events(p), {e.order: m.index for m in p.moves for e in m.events}
    events, order = cache[game]
    return next((order[e.order] for e in events[turn] if e.order in order), None)


for sig, items in sorted(groups.items(), key=lambda kv: -len(kv[1]))[:int(sys.argv[2]) if len(sys.argv) > 2 else 25]:
    print(f"{len(items):3} {sig:46}", [(g, t, move(g, t)) for g, t in items[:3]])
