"""Exact search for an Ark360 layout: finds one that meets every rule of src/ark_nova/data/ark360.json, or proves that there is none (the search of the game, `engine/ark360.py`, is a
heuristic: when it fails, this says whether a layout exists at all).

    pip install ortools        (a tool only: the game does not need it)
    python scripts/solve_ark360.py [--map 7] [--set layout.one_hex_apart=any] [--minimise-pairs] [--json examples.json]

Per map: FEASIBLE with an example (hex coordinates), or INFEASIBLE. With `--minimise-pairs` an infeasible map also says how many pairs "one hex apart" it needs at least when every
other rule stays as it is (the number to put in `max_one_hex_apart_pairs`, or in `map_overrides` for that map). `--set path=value` tries a number without editing the file.
"""
import argparse
import copy
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ark_nova import data  # noqa: E402
from ark_nova.engine import ark360  # noqa: E402
from ark_nova.engine.board import board, hex_distance, neighbours  # noqa: E402

try:
    from ortools.sat.python import cp_model
except ImportError:                                           # pragma: no cover
    raise SystemExit("this tool needs OR-Tools: pip install ortools")


def solve(map_id: str, cfg: dict, minimise_pairs: bool = False, seed: int = 0, limit: float = 120.0):
    """(status, cells, fewest pairs). `cells` is a sorted list of hexes, None when the map has no layout under the rules (with `minimise_pairs`: the layout with the fewest pairs
    one hex apart, whatever the limit of the rules says)."""
    lay = ark360.rules(map_id, cfg)
    bd = board(map_id)
    cand = ark360.candidates(map_id, cfg)
    n = len(data.map_by_id(map_id)["geometry"]["placement_bonuses"])
    m = cp_model.CpModel()
    x = {c: m.NewBoolVar(f"x{c}") for c in cand}
    m.Add(sum(x.values()) == n)

    def distinct(axis: int, need: int) -> None:                # (at least `need` different columns / rows hold a bonus)
        flags = []
        for v in sorted({c[axis] for c in cand}):
            u = m.NewBoolVar(f"u{axis}_{v}")
            m.Add(u <= sum(x[c] for c in cand if c[axis] == v))
            flags.append(u)
        m.Add(sum(flags) >= need)

    distinct(0, lay["min_distinct_x"])
    distinct(1, lay["min_distinct_y"])
    adjacent, apart = [], []
    for i, a in enumerate(cand):
        for b in cand[i + 1:]:
            d = hex_distance(a, b)
            if d == 1 or (d == 2 and (lay["one_hex_apart"] == "any" or (abs(a[0] - b[0]), abs(a[1] - b[1])) in ark360.STRAIGHT_GAPS)):
                both = m.NewBoolVar(f"both{a}{b}")
                m.Add(both >= x[a] + x[b] - 1)
                (adjacent if d == 1 else apart).append(both)
    m.Add(sum(adjacent) <= lay["max_adjacent_pairs"])
    if not minimise_pairs and lay["max_one_hex_apart_pairs"] is not None:
        m.Add(sum(apart) <= lay["max_one_hex_apart_pairs"])
    border = sum(x[c] for c in cand if c in bd.border)
    m.Add(border >= lay["min_border"])
    m.Add(border <= lay["max_border"])
    for kind, share in (("rock", lay["min_next_to_rock_share"]), ("water", lay["min_next_to_water_share"])):
        m.Add(sum(x[c] for c in cand if any(bd.terrain.get(k) == kind for k in neighbours(c))) >= ark360._share(share, n))
    if minimise_pairs:
        m.Minimize(sum(apart))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = limit
    solver.parameters.random_seed = seed
    status = solver.Solve(m)
    name = solver.StatusName(status)
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return name, sorted(c for c in cand if solver.Value(x[c])), (int(solver.ObjectiveValue()) if minimise_pairs else None)
    return name, None, None


def main() -> int:
    from check_ark360 import with_overrides
    ap = argparse.ArgumentParser()
    ap.add_argument("--map")
    ap.add_argument("--set", action="append", default=[])
    ap.add_argument("--minimise-pairs", action="store_true", help="for a map without a layout: the fewest pairs one hex apart it needs")
    ap.add_argument("--seed", type=int, default=0, help="another seed gives another example")
    ap.add_argument("--json", help="write the examples ({map: [[x, y], ...]}) to this file")
    args = ap.parse_args()
    cfg = with_overrides(ark360.config(), args.set)
    print(f"rules: {json.dumps(cfg['layout'])}  overrides: {json.dumps(cfg.get('map_overrides'))}")
    found, missing = {}, 0
    for mp in data.maps():
        mid = mp["id"]
        if not mp.get("geometry") or (args.map and mid != args.map) or not ark360.applicable(mid, cfg):
            continue
        t0 = time.time()
        status, cells, _ = solve(mid, cfg, seed=args.seed)
        line = f"{mid:>4}  {len(mp['geometry']['placement_bonuses']):>2} bonuses  {status:10s} {time.time() - t0:5.1f}s"
        if cells is not None:
            found[mid] = cells
            print(line + "  " + " ".join(f"({x},{y})" for x, y in cells))
        else:
            missing += 1
            extra = ""
            if args.minimise_pairs:
                _, closest, fewest = solve(mid, cfg, minimise_pairs=True, seed=args.seed)
                extra = f"  needs at least {fewest} pairs one hex apart (the rules allow {ark360.rules(mid, cfg)['max_one_hex_apart_pairs']})" if closest else ""
            print(line + "  no layout meets the rules" + extra)
    if args.json:
        Path(args.json).write_text(json.dumps(found, indent=4), encoding="utf-8")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
