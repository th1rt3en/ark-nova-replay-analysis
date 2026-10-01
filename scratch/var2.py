import glob, json, sys
from ark_nova.parser import parse_log
from ark_nova.replay.actions import turn_events
want = sys.argv[1]; maxn = int(sys.argv[2]); n = 0
for path in sorted(glob.glob("log_examples/*.json")):
    parsed = parse_log(path)
    for k, ev in enumerate(turn_events(parsed)):
        ch = [e for e in ev if e.type == "chooseActionCard"]
        if not ch or ch[0].args["actionCard"]["type"] != want: continue
        sl = [e for e in ev if e.type in ("slideMeeples",) and isinstance(e.args, dict)]
        if not any((len(e.args.get("meeples") or []) > 1) or "gains a new" in e.log for e in sl) and "--all" not in sys.argv: continue
        n += 1
        if n > maxn: sys.exit()
        print("== ", path[-14:-5], k, "level", ch[0].args["actionCard"]["level"], "strength", ch[0].args["strength"])
        for e in ev:
            a = e.args if isinstance(e.args, dict) else {}
            if e.type in ("fillPool", "gameStateChangePrivateArg", "startBreak") : continue
            if e.type in ("discardTokens", "updateBreakDiscardSelection", "discardCardsOnDisplay", "finishBreak") and "break" not in e.log.lower() and False: continue
            print("   ", e.type, "|", e.log[:60], "|", json.dumps({x: y for x, y in a.items() if x in ("bonuses", "card_id", "source", "cards", "meeples", "n")})[:260])
            if e.type == "actionCardCleanup": break
