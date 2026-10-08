"""Build the full image of animal cards from the base art of the vendored card library, with the game elements drawn on it (sharper than the community sprite sheets).

    python scripts/build_animal_cards.py [--out DIR] [--webp] [KEY ... | all]      (`all --webp --out web/cards` replaces the animal cards of the site; run with the system `python`: needs Pillow + numpy)

Layout of a card (600 x 838): the art on the top 60 %; over it the species and continent icons (top right), the enclosure requirement, the price and the conditions (top left);
an orange bar with the name (10 %); below, on a white background with a little orange in it, a text box per ability; the reputation, conservation and appeal bonuses at the
bottom right. Sources: `vendor/Next-Ark-Nova-Cards/public/img/animals/<bga_id>.jpg` (the art), `web/icons/r<row>c<col>.webp` (enclosures, money, conditions),
`public/img/zoo-card-badges.webp` (species, continents, requirements), `public/img/zoo-card-bonuses.png` (the bonus tags), the texts of `public/locales/en/common.json`.
Without KEY the cards named in PREVIEW are built (to check the look before building them all).
"""
import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor" / "Next-Ark-Nova-Cards" / "public"
FONTS = VENDOR / "img" / "fonts"
W, H = 600, 838
U = W / 480                                     # the layout below is written for 480 wide
TAG_H = 96                                      # height of a bonus tag before its top 70 % is taken
PREVIEW = ["A433", "A416", "A521", "A537", "A554", "A505"]

BADGE_CELLS = {"Africa": (0, 2), "Americas": (1, 2), "Asia": (2, 2), "Australia": (3, 2), "Europe": (4, 2), "Appeal": (0, 3), "Partner_Zoo": (1, 3), "Reputation": (2, 3), "Science": (3, 3),
               "Upgrade": (4, 3), "Primate": (0, 4), "Bear": (1, 4), "Bear2": (2, 4), "Bird": (3, 4), "Predator": (4, 4), "Herbivore": (0, 5), "Reptile": (1, 5), "Pet": (2, 5),
               "Prehistoric": (3, 5), "ANIMAL_SIZE_4": (4, 5), "ANIMAL_SIZE_2": (0, 6), "Rock": (1, 6), "Water": (2, 6), "University": (3, 6), "SeaAnimal": (4, 6),
               "AnimalsI": (0, 0), "AnimalsII": (1, 0), "BuildI": (2, 0), "BuildII": (3, 0), "CardsI": (4, 0), "CardsII": (0, 1), "SponsorsI": (1, 1), "SponsorsII": (2, 1)}
TAG_BADGE = {"africa": "Africa", "americas": "Americas", "asia": "Asia", "australia": "Australia", "europe": "Europe", "primate": "Primate", "bear": "Bear2", "bird": "Bird", "predator": "Predator",
             "herbivore": "Herbivore", "reptile": "Reptile", "pet": "Pet", "prehistoric": "Prehistoric", "seaanimal": "SeaAnimal"}
REQ_BADGE = {**TAG_BADGE, "animalsi": "AnimalsI", "animalsii": "AnimalsII", "partner zoo": "Partner_Zoo", "university": "University", "science": "Science", "rock": "Rock", "water": "Water",
             "sponsorsi": "SponsorsI", "sponsorsii": "SponsorsII", "buildi": "BuildI", "buildii": "BuildII", "cardsi": "CardsI", "cardsii": "CardsII", "reputation": "Reputation"}
CONTINENTS = {"africa", "americas", "asia", "australia", "europe"}
ENCLOSURE = {(0, 0): "r9c3", (1, 0): "r9c4", (2, 0): "r9c5", (1, 1): "r9c6", (0, 1): "r9c7", (0, 2): "r9c8"}
SPECIAL = {"Large Bird Aviary": "r9c9", "Petting Zoo": "r9c10", "Reptile House": "r9c11", "Aquarium": "r8c14"}
TOKEN_TAG = {"HerbivoreTag": "Herbivore", "ReptileTag": "Reptile", "SeaAnimalTag": "SeaAnimal", "PrimateTag": "Primate", "ScienceTag": "Science"}
ICON_TOKENS = {"ActionCard": "r5c7", "AnimalActionCard": "r3c7", "SponsorsActionCard": "r3c12", "CardsActionCard": "r3c10", "BuildActionCard": "r3c9", "XToken": "r5c6", "Kiosk": "r7c3", "LargeBirdAviary": "r9c9", "Slot": "r5c5", "Size": "r6c17", "Appeal": "r3c13", "ConservationPoint": "r3c15", "Reputation": "r4c9", "MultiplierToken": "r6c8", "AssociationActionCard": "r3c8", "Money": "r11c8", "Xtoken": "r5c6"}

_cache: dict = {}
WARN: list = []


def font(name: str, size: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), int(round(size * U)))


def icon(rc: str) -> Image.Image:
    if rc not in _cache:
        _cache[rc] = Image.open(ROOT / "web" / "icons" / f"{rc}.webp").convert("RGBA")
    return _cache[rc]


def badge(name: str) -> Image.Image:
    if "badges" not in _cache:
        _cache["badges"] = Image.open(VENDOR / "img" / "zoo-card-badges.webp").convert("RGBA")
    sheet = _cache["badges"]
    col, row = BADGE_CELLS[name]
    cw, ch = sheet.width // 5, sheet.height // 7
    return sheet.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch))


def scaled(im: Image.Image, height: float) -> Image.Image:
    h = int(round(height * U))
    return im.resize((max(1, int(round(im.width * h / im.height))), h), Image.LANCZOS)


def paste(card: Image.Image, im: Image.Image, x: float, y: float) -> None:
    card.alpha_composite(im, (int(round(x)), int(round(y))))


def outlined(d: ImageDraw.ImageDraw, xy, text: str, fnt, fill, stroke=(0, 0, 0, 255), width=3, anchor="mm") -> None:
    d.text(xy, text, font=fnt, fill=fill, stroke_width=int(round(width * U / 1.25)), stroke_fill=stroke, anchor=anchor)


def circle_badge(name: str, diameter: float, ring: float = 3.0) -> Image.Image:
    """A species / continent / requirement badge as a circle with a white ring."""
    d = int(round(diameter * U))
    src = badge(name)
    side = min(src.size)
    src = src.crop(((src.width - side) // 2, (src.height - side) // 2, (src.width + side) // 2, (src.height + side) // 2)).resize((d, d), Image.LANCZOS)
    out = Image.new("RGBA", (d, d), (0, 0, 0, 0))
    mask = Image.new("L", (d * 4, d * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, d * 4 - 1, d * 4 - 1), fill=255)
    mask = mask.resize((d, d), Image.LANCZOS)
    out.paste(src, (0, 0), mask)
    r = int(round(ring * U))
    if r:
        big = Image.new("RGBA", (d * 4, d * 4), (0, 0, 0, 0))
        ImageDraw.Draw(big).ellipse((r * 2, r * 2, d * 4 - r * 2 - 1, d * 4 - r * 2 - 1), outline=(255, 255, 255, 255), width=r * 4)
        out.alpha_composite(big.resize((d, d), Image.LANCZOS))
    return out


def ink_text(d: ImageDraw.ImageDraw, cx: float, cy: float, text: str, fnt, fill, stroke=None, width=0) -> None:
    """Text whose digits (the ink, not the font's line box) are centred on (cx, cy)."""
    l, t, r, b = d.textbbox((0, 0), text, font=fnt, anchor="la")
    x, y = cx - (l + r) / 2, cy - (t + b) / 2
    if stroke is not None and width:
        d.text((x, y), text, font=fnt, fill=fill, anchor="la", stroke_width=int(round(width * U / 1.25)), stroke_fill=stroke)
    else:
        d.text((x, y), text, font=fnt, fill=fill, anchor="la")


def money_tile(card: Image.Image, d: ImageDraw.ImageDraw, x: float, y: float, size: float, value) -> None:
    """The money icon as it is drawn everywhere else on the site: a rounded square with a white border, the amount in white with a dark outline."""
    n = int(round(size * U))
    src = icon("r11c8").resize((n, n), Image.LANCZOS)
    r = int(n * 0.24)
    big = 4
    mask = Image.new("L", (n * big, n * big), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, n * big - 1, n * big - 1), radius=r * big, fill=255)
    tile = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    tile.paste(src, (0, 0), mask.resize((n, n), Image.LANCZOS))
    border = Image.new("RGBA", (n * big, n * big), (0, 0, 0, 0))
    bw = max(2, int(n * 0.075)) * big
    ImageDraw.Draw(border).rounded_rectangle((0, 0, n * big - 1, n * big - 1), radius=r * big, outline=(255, 255, 255, 255), width=bw)       # (its outer edge is the edge of the tile: no grey outside the border)
    tile.alpha_composite(border.resize((n, n), Image.LANCZOS))
    paste(card, tile, x, y)
    ref = min(n, 46 * U)                                                # (the digits of a tile bigger than 46 keep the size they have on a 46 one)
    f = ImageFont.truetype(str(FONTS / "MyriadPro-Bold.ttf"), int(ref * 0.62))
    d.text((x + n / 2, y + n / 2 + ref * 0.03), str(value), font=f, fill=(255, 255, 255, 255), stroke_width=max(1, int(ref * 0.09)), stroke_fill=(34, 34, 34, 255), anchor="mm")


def rounded_panel(card: Image.Image, box, fill, radius: float) -> None:
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    layer = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle((0, 0, x1 - x0 - 1, y1 - y0 - 1), radius=int(radius * U), fill=fill)
    card.alpha_composite(layer, (x0, y0)) if x0 >= 0 and y0 >= 0 else card.alpha_composite(layer.crop((max(0, -x0), max(0, -y0), layer.width, layer.height)), (max(0, x0), max(0, y0)))


def shape_panel(card: Image.Image, shapes, fill) -> None:
    """The union of rounded rectangles `("rect", x0, y0, x1, y1, radius)` and ellipses `("ellipse", x0, y0, x1, y1)`, drawn antialiased in `fill` (shapes may start outside the card)."""
    big = 4
    mask = Image.new("L", (W * big, H * big), 0)
    md = ImageDraw.Draw(mask)
    for sh in shapes:
        box = [v * big for v in sh[1:5]]
        if sh[0] == "rect":
            md.rounded_rectangle(box, radius=int(sh[5] * U * big), fill=255)
        else:
            md.ellipse(box, fill=255)
    mask = mask.resize((W, H), Image.LANCZOS)
    layer = Image.new("RGBA", (W, H), fill)
    layer.putalpha(mask.point(lambda v: v * fill[3] // 255))
    card.alpha_composite(layer)


def texts() -> dict:
    if "texts" not in _cache:
        _cache["texts"] = json.load(open(VENDOR / "locales" / "en" / "common.json", encoding="utf-8"))
    return _cache["texts"]


def description(ability: dict) -> list:
    """The text of an ability as a list of strings and icon tokens: the template of the library with `{}` replaced by the value, then `{Name-param}` read as icons."""
    kw = ability["keyword"]
    tpl = (texts().get("abilities") or {}).get(str(kw.get("descriptionTemplate", "")).split(".")[-1]) or ""
    value = ability.get("value")
    tpl = tpl.replace("{}", str(value if value not in (None, "") else ""))
    parts, last = [], 0
    for m in re.finditer(r"\{([^}]*)\}", tpl):
        parts.append(tpl[last:m.start()])
        parts.append(("icon", m.group(1), str(value if value not in (None, "") else "")))
        last = m.end()
    parts.append(tpl[last:])
    return [p for p in parts if p != ""]


def tag_sheet() -> list:
    if "tags" not in _cache:
        im = Image.open(VENDOR / "img" / "zoo-card-bonuses.png").convert("RGBA")
        a = np.array(im)[..., 3] > 235                           # (the body of the tag: its shadow on the right is not part of it)
        tags = []
        for i in range(3):
            lo, hi = i * 259, (i + 1) * 259
            ys, xs = np.nonzero(a[:, lo:hi])
            tags.append(im.crop((lo + xs.min(), ys.min(), lo + xs.max() + 1, ys.max() + 1)))
        _cache["tags"] = tags                                    # appeal, conservation, reputation
    return _cache["tags"]


def wrap_tokens(d, tokens, fnt, width_at, x0, y, line_h, icon_h):
    """Lay out strings and icon tokens in lines; `width_at(y)` is the width available at height y. Returns the drawing commands and the y below the text."""
    cmds, x, words = [], x0, []
    for t in tokens:
        if isinstance(t, tuple):
            words.append(t)
        else:
            for w in re.findall(r"\s*\S+\s*", t):
                words.append(w)
    for w in words:
        if isinstance(w, tuple):
            nm = w[1].split("-")[0]
            wid = (icon_h * 1.0 * U + 3 * U) if nm in ICON_TOKENS or nm in TOKEN_TAG or nm in ("Money", "SizeAnimal", "Size", "Appeal", "ConservationPoint", "Reputation", "MultiplierToken", "AssociationActionCard") else d.textlength(nm, font=fnt) + 3 * U
            fit = wid
        else:
            wid = d.textlength(w, font=fnt)
            fit = d.textlength(w.rstrip(), font=fnt)
        if x + fit > x0 + width_at(y) and x > x0:
            x, y = x0, y + line_h
        if not isinstance(w, tuple) and x == x0:
            w = w.lstrip()
            wid = d.textlength(w, font=fnt)
        cmds.append((w, x, y))
        x += wid
    return cmds, y + line_h


def build(key: str, out_dir: Path, fmt: str = "png") -> Path:
    cards = {c["key"]: c for c in json.load(open(ROOT / "src" / "ark_nova" / "data" / "animals.json", encoding="utf-8"))}
    c = cards[key]
    art = Image.open(VENDOR / "img" / "animals" / f"{c['bga_id']}.jpg").convert("RGBA")
    card = Image.new("RGBA", (W, H), (255, 250, 242, 255))
    d = ImageDraw.Draw(card)
    art_h = int(round(H * 0.60))
    k = max(W / art.width, art_h / art.height)
    art = art.resize((int(round(art.width * k)), int(round(art.height * k))), Image.LANCZOS)
    card.paste(art.crop(((art.width - W) // 2, (art.height - art_h) // 2, (art.width + W) // 2, (art.height + art_h) // 2)), (0, 0))

    # the name bar: an orange gradient, 10 % of the height
    bar_h = int(round(H * 0.10))
    grad = Image.new("RGBA", (W, bar_h))
    top, bot = np.array([255, 190, 80]), np.array([232, 124, 14])
    gp = grad.load()
    for yy in range(bar_h):
        col = tuple(int(v) for v in top + (bot - top) * yy / (bar_h - 1)) + (255,)
        for xx in range(W):
            gp[xx, yy] = col
    card.paste(grad, (0, art_h))
    d.line([(0, art_h), (W, art_h)], fill=(120, 60, 0, 255), width=2)
    d.line([(0, art_h + bar_h - 1), (W, art_h + bar_h - 1)], fill=(150, 80, 0, 255), width=2)
    name = c["name"].upper()
    nf = font("MyriadPro-Bold.ttf", 29)
    while d.textlength(name, font=nf) > W - 40 * U and nf.size > 14:
        nf = ImageFont.truetype(str(FONTS / "MyriadPro-Bold.ttf"), nf.size - 1)
    d.text((W / 2, art_h + bar_h * 0.36), name, font=nf, fill=(35, 16, 2, 255), anchor="mm")
    d.text((W / 2, art_h + bar_h * 0.76), c.get("latinName", ""), font=font("MyriadPro-CondIt.ttf", 17), fill=(70, 34, 4, 255), anchor="mm")

    # species, then continents: top right, 10 % from the right edge
    tags = [t.lower() for t in c.get("tags", [])]
    order = [t for t in tags if t not in CONTINENTS] + [t for t in tags if t in CONTINENTS]
    dia, gap = 54, 7
    icons_tags = [t for t in order if t in TAG_BADGE]
    right = W - 0.05 * W
    top_y = 12 * U
    x = right
    tabs, badges = [], []
    for t in reversed(icons_tags):
        b = circle_badge(TAG_BADGE[t], dia)
        x -= b.width
        # a light grey tab from the top edge of the card down to the middle of the icon, ending in the lower half of its circle
        tabs += [("rect", x, -30 * U, x + b.width, top_y + b.height / 2, 0), ("ellipse", x, top_y, x + b.width, top_y + b.height)]
        badges.append((b, x))
        x -= gap * U
    if tabs:
        shape_panel(card, tabs, (214, 217, 222, 238))
    for b, bx in badges:
        shadow = Image.new("RGBA", b.size, (0, 0, 0, 0))
        ImageDraw.Draw(shadow).ellipse((0, 0, b.width - 1, b.height - 1), fill=(0, 0, 0, 90))
        paste(card, shadow, bx + 2 * U, top_y + 2 * U)
        paste(card, b, bx, top_y)

    # enclosure requirements (top left): the standard enclosure, then the special one; the price under the first; all on a grey panel
    px, py, h_icon = 12 * U, 10 * U, 58
    numf = font("MyriadPro-Bold.ttf", 30)
    specials = c.get("specialEnclosures") or []
    standard = c.get("canBeInStandardEnclosure", True)
    pieces = []                                                              # (image, number or None, number centre x offset)
    if standard:
        rock, water = int(c.get("rock") or 0), int(c.get("water") or 0)
        im = scaled(icon(ENCLOSURE[(rock, water)]), h_icon)
        pieces.append((im, str(c["size"]), im.height * 115 / 100 / 2))        # (the brown hexagon is the left part of the picture)
    else:
        im = scaled(icon("r4c5" if int(c.get("rock") or 0) > 0 else "r4c4"), h_icon)
        pieces.append((im, str(c["size"]), im.height * 137 / 118 / 2))          # (the size of the animal in the red hexagon)
    for sp in specials:
        im = scaled(icon(SPECIAL[sp["type"]]), h_icon)
        pieces.append((im, str(sp["size"]), None))
    row_w = sum(im.width for im, _, _ in pieces) + 6 * U * (len(pieces) - 1)
    money_h = h_icon
    row1_b = py + h_icon * U + 6 * U
    money_y = py + h_icon * U + 8 * U
    money_b = money_y + money_h * U + 8 * U
    # the panel follows the contents: as wide as the enclosure row at the top, as wide as the price below it
    shape_panel(card, [("rect", -30 * U, -30 * U, px + row_w + 8 * U, row1_b, 10), ("rect", -30 * U, -30 * U, px + money_h * U + 8 * U, money_b, 10)], (140, 147, 156, 238))
    left = px
    for im, num, off in pieces:
        paste(card, im, left, py)
        if num is not None and off is not None:
            outlined(d, (left + off, py + im.height / 2), num, numf, (255, 255, 255, 255), (50, 30, 10, 255))
        elif num is not None:                                            # a special enclosure: the number is small and centred on the shape, inside its border
            al = np.array(im)[..., 3] > 200
            ys_, xs_ = np.nonzero(al)
            ink_text(d, left + xs_.mean(), py + ys_.mean(), num, font("MyriadPro-Bold.ttf", 19), (255, 255, 255, 255), (50, 30, 10, 255), 2)
        left += im.width + 6 * U
    money_tile(card, d, px, money_y, money_h, c.get("price"))
    cy = money_b + 8 * U
    # the conditions, each on the red background aligned to the left edge of the card, the icon on its circle
    for rq in c.get("requirements") or []:
        name_ = REQ_BADGE.get(str(rq).lower(), "Reputation" if str(rq).lower().startswith("reputation") else None)
        bg = scaled(icon("r10c9"), 56)
        paste(card, bg, 0, cy)
        if name_:
            sc = bg.height / 86                                              # the white circle of the background: x 34..117, y 0..85 of 118 x 86
            ic = circle_badge(name_, 85 * sc * 0.84 / U, ring=0)
            paste(card, ic, (34 + 85 / 2) * sc - ic.width / 2, cy + 85 * sc / 2 - ic.height / 2)
        cy += bg.height + 5 * U

    # the abilities: a text box each
    ty = art_h + bar_h + 10 * U
    bonus_h = 86 * U
    bonus_top = H - bonus_h - 12 * U
    shown_n = sum(1 for v in (c.get("reputation"), c.get("conservationPoint"), c.get("appeal")) if v)
    tag_w = [scaled(t, TAG_H).width for t in tag_sheet()]
    bonus_w = (sum(sorted(tag_w)[-shown_n:]) if shown_n else 0) + max(0, shown_n - 1) * 8 * U + 22 * U
    abilities = c.get("abilities") or []
    nfs = font("MyriadPro-Bold.ttf", 17)
    tfs = font("MyriadPro-Regular.ttf", 15)
    for ab in abilities:
        kw = ab["keyword"]
        label = kw["name"] + (f" {ab['value']}" if ab.get("value") not in (None, "") and not kw["name"].startswith("Multiplier") else "")
        box_x0, box_x1 = 12 * U, W - 12 * U
        body = description(ab)
        line_h = 19 * U
        lay_w = lambda yy: (box_x1 - box_x0 - 16 * U) - (bonus_w if yy + line_h > bonus_top - 8 * U else 0)
        cmds, ybot = wrap_tokens(d, body, tfs, lay_w, box_x0 + 8 * U, ty + 31 * U, line_h, 19)
        box_h = ybot - ty + 6 * U
        if ty + box_h > bonus_top - 8 * U:                            # a box that reaches the bonuses stops short of them
            box_x1 -= bonus_w - 12 * U
        d.rounded_rectangle((box_x0, ty, box_x1, ty + box_h), radius=int(9 * U), fill=(255, 255, 255, 255), outline=(240, 196, 140, 255), width=2)
        d.text((box_x0 + 8 * U, ty + 5 * U), label, font=nfs, fill=(150, 70, 0, 255))
        for w, xx, yy in cmds:
            if isinstance(w, tuple):
                tok, _, param = w[1].partition("-")
                numf_ = font("MyriadPro-Bold.ttf", 12)
                if tok == "Money":
                    money_tile(card, d, xx, yy - 1 * U, 19, param)
                elif tok in TOKEN_TAG:
                    paste(card, circle_badge(TOKEN_TAG[tok], 19, ring=1), xx, yy - 1 * U)
                elif tok == "Size":                                           # Size-X+ / X-: the empty size symbol with the value and the sign
                    im = scaled(icon("r6c17"), 19)
                    paste(card, im, xx, yy - 1 * U)
                    sign = param.replace("X", "").replace("Animal", "").replace("Enclosure", "")
                    outlined(d, (xx + im.width / 2, yy + 9 * U), (w[2] if len(w) > 2 else "") + sign, numf_, (255, 255, 255, 255), (20, 20, 20, 255), 2)
                elif tok == "SizeAnimal":
                    im = scaled(icon("r9c3"), 19)
                    paste(card, im, xx, yy - 1 * U)
                    outlined(d, (xx + im.width / 2, yy + 9 * U), param, numf_, (255, 255, 255, 255), (50, 30, 10, 255), 2)
                elif tok in ICON_TOKENS or tok in ("Appeal", "ConservationPoint", "Reputation", "MultiplierToken", "AssociationActionCard"):
                    rc = ICON_TOKENS[tok]
                    im = scaled(icon(rc), 19)
                    paste(card, im, xx, yy - 1 * U)
                    if param and tok in ("Appeal", "Reputation", "ConservationPoint", "Slot"):
                        outlined(d, (xx + im.width / 2, yy + 9 * U), param, numf_, (255, 255, 255, 255), (20, 20, 20, 255), 2)
                else:
                    WARN.append(f"{key}: no icon for {{{w[1]}}}")
                    d.text((xx, yy), w[1].split("-")[0], font=font("MyriadPro-Bold.ttf", 15), fill=(90, 60, 20, 255))
            else:
                d.text((xx, yy), w, font=tfs, fill=(40, 25, 10, 255))
        ty += box_h + 6 * U
        if ty > H - 4 * U:
            WARN.append(f"{key}: the ability text runs past the bottom of the card")

    # bonuses at the bottom right: reputation, conservation, appeal; only the top 70 % of each tag, on the bottom edge of the card
    appeal, cons, rep = c.get("appeal") or 0, c.get("conservationPoint") or 0, c.get("reputation") or 0
    shown = [(v, i) for v, i in [(rep, 2), (cons, 1), (appeal, 0)] if v]
    sheet = tag_sheet()
    CENTRE = {0: (107, 100), 1: (113, 97), 2: (105, 99)}                    # (y, x) in the picture of the tag where the number goes: between the lines / on the shield / on the rhombus
    x = W - 14 * U
    bf = font("MyriadPro-Bold.ttf", 30)
    for v, i in reversed(shown):
        full = scaled(sheet[i], TAG_H)
        t = full.crop((0, 0, full.width, int(round(full.height * 0.70))))
        x -= t.width
        yy = H - t.height
        paste(card, t, x, yy)
        cy_src, cx_src = CENTRE[i]
        k = full.height / sheet[i].height
        light = i != 0
        ink_text(d, x + cx_src * k, yy + cy_src * k, str(v), bf, (255, 255, 255, 255) if light else (40, 22, 8, 255), (20, 20, 20, 255) if light else (255, 255, 255, 255), 3)
        x -= 8 * U
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{key}.{fmt}"
    if fmt == "webp":
        card.convert("RGB").save(path, quality=88, method=6)
    else:
        card.convert("RGB").save(path)
    return path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("keys", nargs="*")
    ap.add_argument("--out", default=str(ROOT / "build" / "animal_preview"))
    ap.add_argument("--webp", action="store_true", help="write webp files (for web/cards) instead of png")
    a = ap.parse_args()
    keys = a.keys or PREVIEW
    if keys == ["all"]:
        keys = [c["key"] for c in json.load(open(ROOT / "src" / "ark_nova" / "data" / "animals.json", encoding="utf-8"))]
    for k in keys:
        build(k, Path(a.out), "webp" if a.webp else "png")
    print(f"{len(keys)} cards in {a.out}")
    for w in WARN:
        print("warning:", w)


if __name__ == "__main__":
    sys.exit(main())
