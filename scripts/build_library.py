"""Writes web/library_data.json, the data of the card library page (web/library.html): one entry per card with the fields the filters read and the text the search looks through.

Usage: python scripts/build_library.py [path to the fan site's locales/en/common.json]
The locale file is in the git-ignored vendor/ folder (default: vendor/Next-Ark-Nova-Cards/public/locales/en/common.json of this repository); it gives the printed text of the abilities.
The output is committed, so a deploy does not need the vendor folder.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from ark_nova import data  # noqa: E402

LOCALE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "vendor" / "Next-Ark-Nova-Cards" / "public" / "locales" / "en" / "common.json"
OUT = ROOT / "web" / "library_data.json"

SPECIES = {"bird": "Bird", "herbivore": "Herbivore", "predator": "Predator", "primate": "Primate", "reptile": "Reptile", "seaAnimal": "SeaAnimal", "bear": "Bear", "pet": "Pet"}
CONTINENTS = {"africa": "Africa", "americas": "Americas", "asia": "Asia", "australia": "Australia", "europe": "Europe"}
OTHERS = {"science": "Science", "rock": "Rock", "water": "Water"}
ICONS = {**SPECIES, **CONTINENTS, **OTHERS}               # tag -> the badge file name (web/badges/<name>.webp)


def plain(text: str) -> str:
    """The printed text without its markup: **bold**, {Appeal-2} icons become words."""
    text = re.sub(r"\*\*", "", text or "")
    text = re.sub(r"\{([A-Za-z]+)[-\w]*\}", lambda m: re.sub(r"(?<!^)(?=[A-Z])", " ", m.group(1)).lower(), text)
    return re.sub(r"\s+", " ", text).strip()


def main() -> None:
    locale = json.loads(LOCALE.read_text(encoding="utf-8"))
    abilities = locale.get("abilities", {})

    def ability_text(a: dict) -> str:
        name = a["keyword"]["name"]
        template = str(a["keyword"].get("descriptionTemplate", "")).split(".")[-1]
        body = str(abilities.get(template, ""))
        value = a.get("value", "")
        return plain(f"{name} {body.replace('{}', str(value))}")

    def describe(key: str, c: dict) -> dict:
        kind = c["card_type"]
        icons = [t for t in dict.fromkeys(c.get("tags") or []) if t in ICONS]
        if kind == "project" and c.get("tag") in ICONS and c["tag"] not in icons:
            icons.append(c["tag"])
        if (c.get("rock") or 0) > 0 and "rock" not in icons:
            icons.append("rock")
        if (c.get("water") or 0) > 0 and "water" not in icons:
            icons.append("water")
        entry = {"key": key, "name": str(c.get("name", key)).title(), "type": kind, "source": c.get("source", "base"), "icons": icons}
        words = [entry["name"], key, c.get("latinName", ""), c.get("endangeredCategory", ""), c.get("description") if isinstance(c.get("description"), str) else ""]
        if kind == "animal":
            ab = c.get("abilities") or []
            entry["abilities"] = sorted({a["keyword"]["name"] for a in ab})
            entry["normal"] = c.get("size") if c.get("canBeInStandardEnclosure", True) else None
            aqua = [s["size"] for s in c.get("specialEnclosures") or [] if s["type"] == "Aquarium"]
            entry["aqua"] = aqua[0] if aqua else None
            entry["reef"] = bool(c.get("reefDwellerEffect"))                     # (a Reef Dweller: its effect is used again whenever its aquarium is activated)
            entry["reputation"] =(c.get("reputation") or 0) > 0
            entry["conservation"] = (c.get("conservationPoint") or 0) > 0
            reqs = [str(r) for r in c.get("requirements") or []]
            entry["partner"] = "Partner Zoo" in reqs
            entry["university"] = "university" in reqs
            entry["size"], entry["price"], entry["appeal"] = c.get("size"), c.get("price"), c.get("appeal")
            words += [ability_text(a) for a in ab] + [ability_text(a) for a in c.get("reefDwellerEffect") or []] + [s["type"] for s in c.get("specialEnclosures") or []] + reqs
        elif kind == "sponsor":
            words += [e.get("text", "") for e in c.get("effects") or []]
            entry["strength"] = c.get("strength")
        elif kind == "project":
            d = c.get("description") or {}
            words += [d.get("text", ""), str(c.get("type", ""))] + [b.get("bonusType", "") for s in c.get("slots") or [] for b in s.get("bonuses") or []]
        elif kind == "endgame":
            words += [(c.get("description") or {}).get("text", "")]
        if c.get("source") == "marine_worlds":
            words.append("marine worlds")
        entry["text"] = plain(" ".join(str(w) for w in words if w)).lower()
        return entry

    variants = json.loads((ROOT / "data_manual" / "variants_mw.json").read_text(encoding="utf-8")).get("variants", {})
    cards = []
    for key, c in sorted(data.cards_by_key().items()):
        if not c.get("active", True):                     # (cards that are not in the game: the promo Capybara and Promotion Team)
            continue
        entry = describe(key, c)
        mw = (variants.get(key) or {}).get("marine_worlds")
        if (ROOT / "web" / "cards" / f"{key}_MW.webp").exists():                     # a card that was reprinted for Marine Worlds (its own picture): the page can switch between the two
            other = describe(key, {**c, **(mw or {})})                               # (the endgame cards whose scores changed differ in the picture only)
            entry["mw"] = {"icons": other["icons"], "text": other["text"]}
        cards.append(entry)
    abilities_all = sorted({a for e in cards for a in e.get("abilities", [])}, key=str.lower)
    OUT.write_text(json.dumps({"cards": cards, "abilities": abilities_all}, indent=4, ensure_ascii=False) + "\n", encoding="utf-8")
    print(len(cards), "cards,", len(abilities_all), "abilities ->", OUT)


main()
