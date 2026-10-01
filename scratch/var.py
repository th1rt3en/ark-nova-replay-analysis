import glob, json, sys, collections
from ark_nova.parser import parse_log
from ark_nova.replay.actions import turn_events
want = sys.argv[1]; maxn = int(sys.argv[2])
n = 0
for path in sorted(glob.glob("log_examples/*.json")):
    parsed = parse_log(path)
    for k, ev in enumerate(turn_events(parsed)):
        ch = [e for e in ev if e.type == "chooseActionCard"]
        if not ch or ch[0].args["actionCard"]["type"] != want: continue
        n += 1
        if n > maxn: sys.exit()
        print("== ", path[-14:-5], k, "level", ch[0].args["actionCard"]["level"], "strength", ch[0].args["strength"])
        for e in ev:
            a = e.args if isinstance(e.args, dict) else {}
            if e.type in ("fillPool",): continue
            print("   ", e.type, "|", e.log[:70], "|", json.dumps({x: y for x, y in a.items() if x in ("bonuses", "card_id", "source", "cards", "card", "meeples", "break", "n")})[:170])
