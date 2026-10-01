"""Derive what each sponsor gives when it is played, from the logs (BGA logs it as `getBonuses` with the card's id).

Per sponsor, over all Sponsors turns: the gains logged for the card minus the printed appeal / reputation / conservation (the engine
applies the printed values itself) is the card's own effect. A card is
  * "fixed"    when every play gives the same own effect (possibly nothing) and nothing else happens (no draw, discard, building, ...),
  * "variable" when it differs between plays (a formula over the zoo: to be written per card),
  * "complex"  when other events follow the play (choices, cards, buildings),
  * "unseen"   when the card was never played in a log.
Written to src/ark_nova/data/sponsor_play_effects.json (generated: rerun after adding logs). The engine plays "fixed" cards only.
"""
import collections
import glob
import json
from pathlib import Path

from ark_nova import data
from ark_nova.parser import parse_log
from ark_nova.replay.actions import turn_events

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "ark_nova" / "data" / "sponsor_play_effects.json"
_QUIET = {"getBonuses", "fillPool", "actionCardCleanup", "chooseActionCard", "takeBonus", "upgradeCard", "slideMeeples", "addMeeples"}   # + conservation / reputation threshold consequences


def main():
    cards = data.cards_by_key()
    per_play = collections.defaultdict(list)             # card -> [(gains, other events)]
    for path in sorted(glob.glob(str(ROOT / "log_examples" / "*.json"))):
        parsed = parse_log(path)
        for ev in turn_events(parsed):
            ch = [e for e in ev if e.type == "chooseActionCard"]
            if not ch or "sponsors" not in ch[0].args["actionCard"]["type"].lower():
                continue
            cur = None
            for e in ev:
                if e.type == "actionCardCleanup":
                    break                       # what follows (break, display refill, income) is not the card's effect
                if e.type == "playSponsor":
                    cur = data.parse_bga_card_id(e.args["card"]["id"])[0]
                    per_play[cur].append(({}, []))
                elif e.type == "getBonuses" and cur and isinstance(e.args, dict) and e.args.get("card_id")                         and data.parse_bga_card_id(e.args["card_id"])[0] == cur:
                    for r, v in e.args["bonuses"].items():
                        per_play[cur][-1][0][r] = per_play[cur][-1][0].get(r, 0) + v
                elif e.type not in _QUIET and cur:
                    per_play[cur][-1][1].append(e.type)
    out = {}
    printed = lambda c: {"appeal": c.get("appeal") or 0, "reputation": c.get("reputation") or 0, "conservation": c.get("conservationPoint") or 0}
    for k, c in sorted(cards.items()):
        if c["card_type"] != "sponsor" or not c.get("active", True):
            continue
        rows = per_play[k]
        if not rows:
            out[k] = {"name": c["name"], "kind": "unseen", "plays": 0}
            continue
        clean = [g for g, other in rows if not other]
        if len(clean) < 0.8 * len(rows):
            evs = collections.Counter(t for _, other in rows for t in other)
            out[k] = {"name": c["name"], "kind": "complex", "plays": len(rows), "events": dict(evs)}
            continue
        own = set()
        for g in clean:
            g = dict(g)
            for r, v in printed(c).items():
                if v:
                    g[r] = g.get(r, 0) - v
            own.add(json.dumps({r: v for r, v in g.items() if v}, sort_keys=True))
        if len(own) == 1:
            out[k] = {"name": c["name"], "kind": "fixed", "plays": len(rows), "gain": json.loads(next(iter(own)))}
        else:
            out[k] = {"name": c["name"], "kind": "variable", "plays": len(rows), "examples": sorted(own)[:4]}
    OUT.write_text(json.dumps(out, indent=4) + "\n")
    print(collections.Counter(v["kind"] for v in out.values()))
    for k, v in out.items():
        print(k, v["name"][:24], v["kind"], v["plays"], v.get("gain") or v.get("events") or v.get("examples") or "")


if __name__ == "__main__":
    main()
