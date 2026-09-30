"""Import cards and maps from the vendored upstream repo into src/ark_nova/data/*.json.

Upstream (https://github.com/Ender-Wiggin2019/Next-Ark-Nova-Cards) keeps its data as TypeScript. We bundle a tiny
entry point with esbuild (upstream type files are aliased through scripts/ts_extract/tsconfig.json, zod is stubbed)
and run it under node to dump JSON, then normalize it here.

Setup:  git clone --depth 1 https://github.com/Ender-Wiggin2019/Next-Ark-Nova-Cards vendor/Next-Ark-Nova-Cards
Env:    ESBUILD_BIN (path to esbuild executable), NODE_BIN (default: node)
Run:    python scripts/import_data.py
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UPSTREAM = ROOT / "vendor" / "Next-Ark-Nova-Cards"
OUT = ROOT / "src" / "ark_nova" / "data"
ESBUILD = os.environ.get("ESBUILD_BIN", "esbuild")
NODE = os.environ.get("NODE_BIN", "node")

SOURCE_NORMAL = {"Base": "base", "Marine World": "marine_worlds", "Promo": "promo"}


def extract() -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        bundle = Path(tmp) / "bundle.js"
        subprocess.run(
            [ESBUILD, "scripts/ts_extract/entry.ts", "--bundle", "--platform=node",
             "--tsconfig=scripts/ts_extract/tsconfig.json", f"--outfile={bundle}", "--log-level=warning"],
            cwd=ROOT, check=True)
        res = subprocess.run([NODE, str(bundle)], check=True, capture_output=True, cwd=tmp)
    return json.loads(res.stdout.decode("utf8"))


def source(card: dict, key: str = "source") -> str:
    return SOURCE_NORMAL.get(card.get(key), str(card.get(key)).lower())


def resolve(text: str, en: dict) -> str:
    """Resolve an upstream i18n key like 'sponsors.s201_desc1' against the English locale."""
    node = en
    for part in text.split("."):
        if isinstance(node, dict) and part in node:
            node = node[part]
        else:
            return text
    return node if isinstance(node, str) else text


def main() -> None:
    raw = extract()
    en = json.loads((UPSTREAM / "public/locales/en/common.json").read_text("utf8"))
    OUT.mkdir(parents=True, exist_ok=True)

    def dump(name: str, obj) -> None:
        (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, indent=4), "utf8")

    bga_names = raw["cardNames"]  # upstream id -> BGA id string (incomplete upstream)

    def cards(kind: str, prefix: str, items: list) -> list:
        out = []
        for c in items:
            c = dict(c)
            c["source"] = source(c)
            c["card_type"] = kind
            c["key"] = f"{prefix}{int(c['id']):03d}"  # join key: matches the letter+number part of BGA ids, e.g. A414
            c["bga_id"] = bga_names.get(c["id"])
            out.append(c)
        return out

    animals = cards("animal", "A", raw["animals"])
    sponsors = cards("sponsor", "S", raw["sponsors"])
    projects = cards("project", "P", raw["projects"])
    # Upstream lacks the Marine Worlds projects P133-P139; merge our hand-made entries (see docs/data_sources.md).
    manual = json.loads((ROOT / "data_manual" / "projects_mw.json").read_text("utf8"))
    projects += [c for c in cards("project", "P", manual) if c["key"] not in {p["key"] for p in projects}]
    endgames = cards("endgame", "F", raw["endgames"])
    for c in sponsors + projects + endgames:
        _resolve_desc(c, en)
    for c in endgames:
        # Upstream `scoreArray` is the Marine Worlds-era scoring, `originalArray` the base-game one (when they differ).
        # `scoring[variant]` is what the engine should use: "marine_worlds" only when that expansion is enabled.
        c["scoring"] = {"base": c.get("originalArray", c["scoreArray"]), "marine_worlds": c["scoreArray"]}

    # Marine Worlds reprint variants and upstream fixes (data_manual/variants_mw.json).
    vm = json.loads((ROOT / "data_manual" / "variants_mw.json").read_text("utf8"))
    by_key = {c["key"]: c for c in animals + sponsors + projects + endgames}
    for key, fields in vm["patches"].items():
        by_key[key].update(fields)
    for key, variants in vm["variants"].items():
        by_key[key]["variants"] = variants

    dump("animals.json", animals)
    dump("sponsors.json", sponsors)
    dump("projects.json", projects)
    dump("endgames.json", endgames)
    dump("project_bonuses.json", raw["projectBonuses"])

    maps = []
    for m in raw["maps"]:
        mid = m["id"][1:].upper() if m["id"] == "mt1" else m["id"][1:]  # 'm1a' -> '1a', 'mt1' -> 'T1' (BGA map ids)
        maps.append({
            "id": mid,
            "alternative": mid.endswith("a") and mid != "A",
            "beginner": m["cardSource"] == "Beginner",  # '0' and 'A' are beginner boards, not selectable BGA maps
            "name": resolve(m["name"], en),
            "image": m["image"],
            "description": [resolve(d, en) for d in m["description"]],
            # Board geometry is not in upstream: see docs/map_geometry.md
            "geometry": _geometry(mid),
        })
    dump("maps.json", maps)
    print({k: len(v) for k, v in dict(animals=animals, sponsors=sponsors, projects=projects,
                                       endgames=endgames, maps=maps).items()})


def _geometry(map_id: str):
    """Hand-filled board geometry (data_manual/maps_geometry/<id>.json); None until the file is marked verified."""
    f = ROOT / "data_manual" / "maps_geometry" / f"{map_id}.json"
    if not f.exists():
        return None
    g = json.loads(f.read_text("utf8"))
    return g if g.get("verified") else None


def _resolve_desc(card: dict, en: dict) -> None:
    for eff in ([card["description"]] if isinstance(card.get("description"), dict) else []) + card.get("effects", []):
        if "effectDesc" in eff:
            eff["text"] = resolve(eff["effectDesc"], en)


if __name__ == "__main__":
    sys.exit(main())
