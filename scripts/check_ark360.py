"""Try the rules of Ark360 (src/ark_nova/data/ark360.json) on every map: can a layout of the placement bonuses be found, how often, how fast.

    python scripts/check_ark360.py [--seeds 50] [--set layout.max_one_hex_apart_pairs=4 --set layout.one_hex_apart=any] [--map 7]

`--set path=value` tries a number without editing the file (the value is JSON: 4, 0.3, ["plain"]; a plain word like any is taken as text). A map that the mode cannot be played on says why; a map where the
search fails for some seeds needs looser rules (or a bigger `search_steps` / `search_restarts`).
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
from ark_nova.engine.rng import Rng  # noqa: E402


def with_overrides(cfg: dict, sets: list) -> dict:
    cfg = copy.deepcopy(cfg)
    for item in sets:
        path, _, raw = item.partition("=")
        node = cfg
        keys = path.split(".")
        for k in keys[:-1]:
            node = node[k]
        try:
            node[keys[-1]] = json.loads(raw)
        except ValueError:
            node[keys[-1]] = raw                                  # (a word without quotes: any, straight)
    ark360.check_config(cfg)
    return cfg


def why_not(map_id: str, cfg: dict) -> str:
    lay = cfg["layout"]
    if str(map_id) in {str(m) for m in cfg["excluded_maps"]}:
        return "excluded in the config"
    n = len(data.map_by_id(map_id)["geometry"]["placement_bonuses"])
    need = max(lay["min_distinct_x"], lay["min_distinct_y"], lay["min_border"])
    if n < need:
        return f"{n} bonuses, fewer than the {need} the rules ask for (columns / rows / border)"
    return f"{n} bonuses but only {len(ark360.candidates(map_id, cfg))} hexes may hold one"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=50)
    ap.add_argument("--set", action="append", default=[], help="override a number, e.g. layout.max_adjacent_pairs=2")
    ap.add_argument("--map", help="only this map")
    args = ap.parse_args()
    cfg = with_overrides(ark360.config(), args.set)
    print(f"rules: {json.dumps(cfg['layout'])}")
    bad = 0
    for m in data.maps():
        if not m.get("geometry") or (args.map and m["id"] != args.map):
            continue
        mid = m["id"]
        n = len(m["geometry"]["placement_bonuses"])
        if not ark360.applicable(mid, cfg):
            print(f"{mid:>4}  not playable: {why_not(mid, cfg)}")
            continue
        found, worst, t0 = 0, 0.0, time.time()
        for seed in range(args.seeds):
            t = time.time()
            try:
                layout = ark360.generate(mid, Rng(seed), cfg)
            except ark360.Ark360Error:
                continue
            worst = max(worst, time.time() - t)
            assert ark360.check_layout(mid, layout, cfg) == [], (mid, seed)
            found += 1
        bad += found < args.seeds
        print(f"{mid:>4}  {n:>2} bonuses  layouts found for {found}/{args.seeds} seeds  {1000 * (time.time() - t0) / args.seeds:6.1f} ms each, worst {1000 * worst:5.0f} ms")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
