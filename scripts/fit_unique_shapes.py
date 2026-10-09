"""Fit the shapes of the unique (sponsor) buildings from BGA's own placement lists (state 30 with descSuffix "unique", the `build` checks).

For every unique building type the lists BGA gives while a card effect places it are compared with the placements produced by each
candidate polyhex of the right size (all rotations about each candidate anchor). Only the geometry is used (on the map, plain,
free, not on a flag unless level II); adjacency and water/rock requirements are card rules, so a candidate must contain every
listed placement geometrically and is then ranked by how many of the geometrically valid placements are listed.
Prints the best candidates per type, and the types that cannot be resolved (to be filled in by hand in src/ark_nova/data/unique_shapes.json: `cells` as board cells [x, y] (x + y odd, all positive) with the
anchor cell drawn at `anchor` (rotation k turns 60 degrees clockwise about it); set `verified` to true; the script keeps verified entries).
"""
import collections
import glob
import sys
from pathlib import Path

from ark_nova.engine import build_action as ba
from ark_nova.engine.board import board, footprint_cells, neighbours
from ark_nova.parser import parse_log
from ark_nova.replay.config import game_from_log

ROOT = Path(__file__).resolve().parents[1]


def _nbr(c):
    q, r = c
    return [(q + 1, r), (q - 1, r), (q, r + 1), (q, r - 1), (q + 1, r - 1), (q - 1, r + 1)]


def polyhexes(n):
    shapes = {frozenset([(0, 0)])}
    for _ in range(n - 1):
        shapes = {frozenset(list(s) + [m]) for s in shapes for c in s for m in _nbr(c) if m not in s}
    def norm(s):
        mq, mr = min(q for q, r in s), min(r for q, r in s)
        return frozenset((q - mq, r - mr) for q, r in s)
    return {norm(s) for s in shapes}


def collect(limit=None):
    """{type: [(board, [(type, x, y, rot)] already on the map, listed placements, size)]}"""
    out = collections.defaultdict(list)
    sizes = {}
    sources = collections.defaultdict(set)
    for path in sorted(glob.glob(str(ROOT / "log_examples" / "*.json")))[:limit]:
        if "800035115" in path:
            continue
        parsed = parse_log(path)
        setup, cfg, _ = game_from_log(parsed)
        seat_of = {pid: i for i, pid in enumerate(setup.seats)}
        placed = collections.defaultdict(list)                          # player id -> [(index, type, x, y, rotation)]
        for m in parsed.moves:
            for e in m.events:
                if e.type == "buyBuilding":
                    b = e.args["building"]
                    placed[str(b["pId"])].append((m.index, b["type"], b["x"], b["y"], b.get("rotation", 0)))
                    if b["type"] not in ba.SIZES:
                        sizes[b["type"]] = b["size"]
        for m in parsed.moves:
            for c in m.checks:
                if "build" not in c or c["player"] != c["active"] or not cfg.map_known[seat_of[c["player"]]]:
                    continue
                mine = [(t, x, y, r) for i, t, x, y, r in placed[c["player"]] if i < m.index]
                for t, lst in c["build"]["options"].items():
                    if t not in ba.SIZES and c["build"].get("source_id"):
                        sources[t].add(c["build"]["source_id"].split("_")[0])
                    if t not in ba.SIZES and lst:
                        out[t].append((board(cfg.maps[seat_of[c["player"]]]), mine, lst))
    return out, sizes, sources


def main():
    samples, sizes, sources = collect()
    known = dict(ba.SHAPES)
    resolved = {}
    for rounds in range(3):
        for t, lst in sorted(samples.items()):
            if t in resolved:
                continue
            usable = [(bd, mine, opts) for bd, mine, opts in lst if all(b[0] in known for b in mine)]
            if not usable or t not in sizes:
                continue
            best = []
            for shp in polyhexes(sizes[t]):
                for anchor in shp:
                    cells = sorted((q - anchor[0], r - anchor[1]) for q, r in shp)
                    ok, bad, adj_ok, listed, valid = True, 0, 0, 0, 0
                    for bd, mine, opts in usable:
                        occ = {c for bt, bx, by, br in mine for c in footprint_cells(known[bt], (bx, by), br)}
                        want = set(map(tuple, opts))
                        got, adj = set(), set()
                        for (x, y) in bd.cells:
                            for k in (range(6) if len(cells) > 1 else [0]):
                                fp = footprint_cells(cells, (x, y), k)
                                if all(c in bd.cells and bd.terrain[c] == "plain" and c not in occ and c not in bd.blocked for c in fp):
                                    got.add((x, y, k))
                                    if (any(n in occ for c in fp for n in neighbours(c)) if occ or bd.start_cells else any(c in bd.border for c in fp)):
                                        adj.add((x, y, k))
                        if not want <= got:
                            bad += 1
                            continue
                        adj_ok += want <= adj
                        listed += len(want)
                        valid += len(got)
                    if ok:
                        best.append((-bad, adj_ok, listed / max(valid, 1), cells))
            best.sort(key=lambda b: (-b[0], -b[1], -b[2]))
            if best:
                top = [b for b in best if b[:2] == best[0][:2] and abs(b[2] - best[0][2]) < 1e-9]
                print(f"{t} (size {sizes[t]}, {len(usable)} lists): {len(top)} best candidates, contained {len(usable) + best[0][0]}/{len(usable)}, adjacency ok {best[0][1]}, fill {best[0][2]:.3f}: {top[0][3]}")
                if len(top) == 1:
                    resolved[t] = top[0][3]
                    known[t] = top[0][3]
            else:
                print(f"{t}: no candidate contains every listed placement")
    import json
    table = {}
    for t in sorted(samples):
        if t in sizes and sources.get(t):
            table[t] = {"cards": sorted(sources[t]), "size": sizes[t], "anchor": list(ba.UNIQUE_ANCHOR),
                        "cells": ba.shape_to_cells(resolved[t]) if t in resolved else None, "verified": False}
    path = ROOT / "src" / "ark_nova" / "data" / "unique_shapes.json"
    if path.exists():                                                  # verified entries (checked by hand) are never overwritten
        with open(path) as fh:
            old = json.load(fh)
        for t, entry in old.items():
            if entry.get("verified"):
                table[t] = entry
        table = dict(sorted(table.items()))
    with open(path, "w") as fh:
        json.dump(table, fh, indent=4)
        fh.write("\n")
    print("resolved", sorted(resolved), "unresolved", sorted(set(samples) - set(resolved)))


if __name__ == "__main__":
    main()
