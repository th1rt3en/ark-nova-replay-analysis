import glob
import re
from pathlib import Path

import pytest

from ark_nova import data


def test_counts():
    assert len(data.animals()) == 161
    assert len(data.sponsors()) == 82
    assert len(data.projects()) == 39
    assert len(data.endgames()) == 17


def test_parse_bga_card_id():
    assert data.parse_bga_card_id("A414_SouthAmericanCoati") == ("A414", False)
    assert data.parse_bga_card_id("F001_LargeAnimalZoo_MW") == ("F001", True)


def test_marine_worlds_scoring_differs():
    f1 = data.cards_by_key()["F001"]["scoring"]
    assert [s["requirement"] for s in f1["base"]] == [1, 2, 4, 5]
    assert [s["requirement"] for s in f1["marine_worlds"]] == [1, 2, 3, 4]


def test_all_selectable_maps_have_geometry():
    for m in data.maps():                      # (the beginner maps 0 and A too)
        assert m["geometry"] and len(m["geometry"]["hexes"]) == 58, m["id"]
        assert len(m["geometry"]["bonus_slots"]) == 7, m["id"]


def test_every_log_card_is_known():
    logs = glob.glob(str(Path(__file__).resolve().parents[1] / "log_examples" / "*.json"))
    if not logs:
        pytest.skip("log_examples not available")
    seen = set()
    pat = re.compile(r'"id": "([ASPF]\d+_[A-Za-z0-9_]+)"')
    for g in logs:
        seen |= set(pat.findall(Path(g).read_text("utf8")))
    unknown = {i for i in seen if data.parse_bga_card_id(i)[0] not in data.cards_by_key()}
    assert not unknown


def test_inactive_cards():
    inactive = sorted(k for k, c in data.cards_by_key().items() if not c["active"])
    assert inactive == ["A341", "S282"]
    assert data.cards_by_key()["S274"]["source"] == "base" and data.cards_by_key()["S281"]["source"] == "base"


def test_three_decks():
    from collections import Counter

    c = Counter((x["deck"], x["source"] == "marine_worlds") for x in data.cards_by_key().values())
    assert c[("base_project", False)] == 12 and c[("base_project", True)] == 1
    assert c[("endgame", False)] == 11 and c[("endgame", True)] == 6
    base = sorted(k for k, x in data.cards_by_key().items() if x["deck"] == "base_project")
    assert base == [f"P{n}" for n in list(range(101, 113)) + [133]]
