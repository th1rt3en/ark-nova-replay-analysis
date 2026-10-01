"""Conservation points of the zoo-map bonuses that depend on the map: the 4th partner zoo space, the 3rd university space and hiring the
last association worker. The map data does not have them; they are read off the logs (source 'partner zoo' / 'university' /
'last worker bonus') and written as a form to src/ark_nova/data/association_bonuses.json: {map: {partner4, university3, last_worker}}
with the majority value and the observed counts; edit by hand and set `verified` (verified maps are kept when the script is rerun).
"""
import collections
import glob
import json
from pathlib import Path

from ark_nova.parser import parse_log
from ark_nova.replay.config import game_from_log

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "ark_nova" / "data" / "association_bonuses.json"
KEYS = {"partner zoo": "partner4", "university": "university3", "last worker bonus": "last_worker"}


def main():
    obs = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
    for path in sorted(glob.glob(str(ROOT / "log_examples" / "*.json"))):
        parsed = parse_log(path)
        setup, cfg, _ = game_from_log(parsed)
        seat_of = {pid: i for i, pid in enumerate(setup.seats)}
        for m in parsed.moves:
            for e in m.events:
                if e.type == "getBonuses" and isinstance(e.args, dict) and e.args.get("source") in KEYS and "conservation" in e.args["bonuses"]:
                    seat = seat_of.get(str(e.args["player_id"]))
                    if seat is not None and cfg.map_known[seat]:
                        obs[cfg.maps[seat]][KEYS[e.args["source"]]][e.args["bonuses"]["conservation"]] += 1
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    out = {}
    for mp in sorted(set(obs) | set(old)):
        if old.get(mp, {}).get("verified"):
            out[mp] = old[mp]
            continue
        row = {"verified": False}
        for k in KEYS.values():
            c = obs[mp][k]
            row[k] = c.most_common(1)[0][0] if c else None
            row[k + "_observed"] = {str(v): n for v, n in c.items()}
        out[mp] = row
    OUT.write_text(json.dumps(out, indent=4) + "\n")
    for mp, row in out.items():
        print(mp, {k: row[k] for k in KEYS.values()}, {k: row[k + "_observed"] for k in KEYS.values() if len(row[k + "_observed"]) > 1})


if __name__ == "__main__":
    main()
