"""Every map has an ability text (replay/map_texts.py: one line, or a tuple of lines) and every icon mark in it is one that web/js/map_text.js draws; the library's index.json carries the same texts."""
import json
import re
from pathlib import Path

from ark_nova import data
from ark_nova.replay import map_texts

ROOT = Path(__file__).resolve().parents[1]
MARKS = set(re.findall(r"^  '?([A-Z][A-Z-]*)'?:", (ROOT / "web" / "js" / "map_text.js").read_text("utf-8"), re.M))


def lines(mid):
    t = map_texts.TEXTS[mid]
    return list(t) if isinstance(t, tuple) else [t]


def test_every_map_has_a_text_with_known_icons():
    ids = {m["id"] for m in data.maps()}
    assert ids <= set(map_texts.TEXTS)
    for mid in map_texts.TEXTS:
        for text in lines(mid):
            assert text.strip() and not text.endswith(" ")
            for mark in re.findall(r"<([A-Z][A-Z-]*)(?::\d+)?>", text):
                assert mark in MARKS, (mid, mark)


def test_the_library_shows_the_same_texts():
    for m in json.loads((ROOT / "web" / "wall_maps" / "index.json").read_text("utf-8"))["maps"]:
        assert m["ability"] == lines(m["id"]), m["id"]
