"""Observed appeal / reputation of the player at the moment each sponsor with such a requirement was played.

The card data only says that a sponsor needs 'appeal' or 'reputation' (not how much). The minimum observed over all logs is an upper
bound of the printed threshold (the values look too low for some cards, e.g. appeal 0, so the requirement may not be a track
threshold at all); it is written as a form to src/ark_nova/data/sponsor_thresholds.json (hand-edited afterwards: set `value` and
`verified`; the engine only enforces verified values). Existing entries with verified=true are kept.
"""
import glob
import json
from pathlib import Path

from ark_nova import data
from ark_nova.parser import parse_log
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "ark_nova" / "data" / "sponsor_thresholds.json"


def main():
    cards = data.cards_by_key()
    watch = {k: [r for r in c.get("requirements", []) if r in ("appeal", "reputation")] for k, c in cards.items() if c["card_type"] == "sponsor"}
    watch = {k: v for k, v in watch.items() if v}
    observed: dict = {k: {r: [] for r in v} for k, v in watch.items()}
    for path in sorted(glob.glob(str(ROOT / "log_examples" / "*.json"))):
        parsed = parse_log(path)
        setup, cfg, seed = game_from_log(parsed)
        try:
            rep = build_replay(parsed, setup, cfg, seed)
        except ValueError:                  # not a 2 player game
            continue
        seat_of = {pid: i for i, pid in enumerate(setup.seats)}
        for m in parsed.moves:
            for e in m.events:
                if e.type != "playSponsor":
                    continue
                k = data.parse_bga_card_id(e.args["card"]["id"])[0]
                if k in watch and m.index > 0:
                    p = rep.states[m.index - 1].players[seat_of[str(e.args["player_id"])]]
                    for r in watch[k]:
                        observed[k][r].append(p.appeal if r == "appeal" else p.reputation)
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    out = {}
    for k in sorted(watch):
        out[k] = {"name": cards[k]["name"]}
        for r, obs in observed[k].items():
            prev = old.get(k, {}).get(r)
            if prev and prev.get("verified"):
                out[k][r] = prev
            else:
                lo = min(obs) if obs else None
                out[k][r] = {"value": None, "observed_min": lo, "plays": len(obs), "verified": False}
    OUT.write_text(json.dumps(out, indent=4) + "\n")
    for k, v in out.items():
        print(k, v["name"], {r: (x["observed_min"], x["plays"]) for r, x in v.items() if r != "name"})


if __name__ == "__main__":
    main()
