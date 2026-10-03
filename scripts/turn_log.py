"""Print the events of one turn of a log: python scripts/turn_log.py GAME TURN"""
import json
import sys

from ark_nova.parser import parse_log
from ark_nova.replay.actions import turn_events
from ark_nova.replay.view import render_log

p = parse_log(f"log_examples/{sys.argv[1]}.json")
for e in turn_events(p)[int(sys.argv[2])]:
    if e.type in ("gameStateChangePrivateArg", "fillPool"):
        continue
    a = e.args if isinstance(e.args, dict) else {}
    extra = {k: a[k] for k in ("bonuses", "card", "cards", "building", "buildings", "meeples", "source", "meeple") if k in a}
    print(f"{e.type:22} p={a.get('player_id') or e.player} {render_log(e.log, e.args)[:70]!r} {json.dumps(extra)[:170]}")
