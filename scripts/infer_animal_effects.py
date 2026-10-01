"""Derive what each animal gives when it is played, from the logs (BGA logs the gains of the card as `getBonuses` with the card's id).

Per animal, over all Animals turns: the gains logged for the card minus the printed appeal / reputation / conservation (the engine applies
the printed values itself) is the card's own effect. A card is
  * "fixed"    when (nearly) every play gives the same own effect (possibly nothing) and nothing else happens (no draw, discard, ...),
  * "variable" when it differs between plays (a formula over the zoo: to be written per card),
  * "complex"  when other events follow the play (choices, cards, tokens, ...),
  * "unseen"   when the card was never played in a log.
Written to src/ark_nova/data/animal_play_effects.json (generated: rerun after adding logs). The engine plays "fixed" animals only.
"""
import collections
import glob
import json
from pathlib import Path

from ark_nova import data
from ark_nova.parser import parse_log
from ark_nova.replay.actions import turn_events

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "ark_nova" / "data" / "animal_play_effects.json"
_QUIET = {"getBonuses", "fillPool", "actionCardCleanup", "chooseActionCard", "takeBonus", "upgradeCard", "slideMeeples", "addMeeples",
          "buyBuilding", "discardTokens"}          # + consequences of thresholds and of the triggers of sponsors


def main():
    cards = data.cards_by_key()
    per_play = collections.defaultdict(list)          # card -> [(gains, other events)]
    for path in sorted(glob.glob(str(ROOT / "log_examples" / "*.json"))):
        parsed = parse_log(path)
        for ev in turn_events(parsed):
            ch = [e for e in ev if e.type == "chooseActionCard"]
            if not ch or "animals" not in ch[0].args["actionCard"]["type"].lower():
                continue
            cur = None
            done = False
            for e in ev:
                if e.type == "actionCardCleanup" and not done and "action card" in e.log:
                    done = True                     # what follows is the break etc., except a card that an effect puts on slot 1
                    continue
                if done:
                    if e.type == "actionCardCleanup" and cur:
                        per_play[cur][-1][1].append("shift")
                    if e.type == "startBreak":
                        break
                    continue
                if e.type == "buyAnimal":
                    cur = data.parse_bga_card_id(e.args["card"]["id"])[0]
                    per_play[cur].append(({}, []))
                elif e.type == "getBonuses" and cur and isinstance(e.args, dict) and e.args.get("card_id") \
                        and data.parse_bga_card_id(e.args["card_id"])[0] == cur:
                    for r, v in e.args["bonuses"].items():
                        per_play[cur][-1][0][r] = per_play[cur][-1][0].get(r, 0) + v
                elif e.type not in _QUIET and cur:
                    per_play[cur][-1][1].append(e.type)
    out = {}

    def printed(c):
        return {"appeal": c.get("appeal") or 0, "reputation": c.get("reputation") or 0, "conservation": c.get("conservationPoint") or 0}

    for k, c in sorted(cards.items()):
        if c["card_type"] != "animal" or not c.get("active", True):
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
        own = collections.Counter()
        for g in clean:
            g = dict(g)
            for r, v in printed(c).items():
                if v:
                    g[r] = g.get(r, 0) - v
            own[json.dumps({r: v for r, v in g.items() if v}, sort_keys=True)] += 1
        top, n = own.most_common(1)[0]
        if n >= 0.8 * len(clean):                      # the rest is the triggers of other cards and thresholds
            out[k] = {"name": c["name"], "kind": "fixed", "plays": len(rows), "gain": json.loads(top)}
        else:
            out[k] = {"name": c["name"], "kind": "variable", "plays": len(rows), "examples": [json.loads(x) for x in list(own)[:4]]}
    OUT.write_text(json.dumps(out, indent=4) + "\n")
    print(collections.Counter(v["kind"] for v in out.values()))
    for k, v in out.items():
        if v["kind"] in ("variable", "complex"):
            print(k, v["name"][:24], v["kind"], v["plays"], v.get("events") or v.get("examples"))


if __name__ == "__main__":
    main()
