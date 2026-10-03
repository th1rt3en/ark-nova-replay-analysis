"""Compare the placement bonuses of the map data with what the logs give for every building: python scripts/check_placement_bonuses.py [map ids]
For each map: the buildings whose logged 'placement bonus' gains differ from the data, and the cells that explain the difference (cells
covered by every wrong placement and by no right one)."""
import collections
import glob
import json
import sys
from pathlib import Path

from ark_nova import data
from ark_nova.engine import build_action
from ark_nova.engine.board import board
from ark_nova.parser import parse_log

ROOT = Path(__file__).resolve().parents[1]
sm = json.load(open(ROOT / "data_manual" / "sample_maps.json"))
want = set(sys.argv[1:])
right = collections.defaultdict(list)
wrong = collections.defaultdict(list)
for f in sorted(glob.glob(str(ROOT / "log_examples" / "*.json"))):
    g = Path(f).stem
    if g not in sm:
        continue
    parsed = parse_log(f)
    maps = sm[g]["maps"]
    moves = parsed.moves
    for mi, m in enumerate(moves):
        evs = [e for e in m.events if isinstance(e.args, dict)]
        for i, e in enumerate(evs):
            if e.type != "buyBuilding" or "building" not in e.args:
                continue
            b = e.args["building"]
            pid = str(e.args["player_id"])
            mp = maps.get(pid)
            if mp is None or mp in ("0", "A") or (want and mp not in want) or b["type"] not in build_action.SIZES and b["type"] not in ("kiosk", "pavilion"):
                continue
            if b["type"] in ("kiosk", "pavilion"):
                continue
            cells = build_action.footprint(b["type"], b["x"], b["y"], b.get("rotation", 0))
            got = collections.Counter()
            for e2 in evs[i + 1:]:
                if e2.type == "buyBuilding":
                    break
                if e2.type == "getBonuses" and e2.args.get("source") == "placement bonus":
                    for r, v in e2.args["bonuses"].items():
                        got[r] += v
            bd = board(mp.replace("-legacy", ""))
            pred = collections.Counter()
            for c in cells:
                for bon in bd.bonuses.get(c, []):
                    if bon and bon["type"] in ("money", "xtoken", "reputation", "appeal"):
                        pred[{"xtoken": "xtoken"}.get(bon["type"], bon["type"])] += bon["value"]
            (right if got == pred else wrong)[mp].append((g, m.index, cells, dict(got), dict(pred)))
for mp in sorted(set(right) | set(wrong)):
    w = wrong[mp]
    print(f"map {mp}: {len(right[mp])} right, {len(w)} wrong")
    ok_cells = collections.Counter(c for _, _, cells, _, _ in right[mp] for c in cells)
    for g, mi, cells, got, pred in w[:6]:
        extra = [c for c in cells if not ok_cells[c]]
        print(f"   {g} move {mi}: cells {cells} logged {got} data {pred} cells never seen in a right placement: {extra}")
