"""Placement preview: where the building of a sponsor card in a hand, or an enclosure of the Build action, would fit (replay/preview.py, POST /api/preview/placements)."""
import pytest
from fastapi.testclient import TestClient

from ark_nova.api.main import create_app
from ark_nova.config import Settings
from ark_nova.engine.board import board
from ark_nova.replay import preview


class Idx:
    def find(self, table_id):
        return None


class Logs:
    def read(self, gcs_path, table_id):
        raise AssertionError("no logs")


@pytest.fixture(scope="module")
def client():
    return TestClient(create_app(Settings(cache_dir="off"), Idx(), Logs()))


def test_the_27_sponsor_buildings_have_a_building():
    assert len(preview.PREVIEW_CARDS) == 27
    for card in preview.PREVIEW_CARDS:
        t, rules = preview.card_building(card, True)
        assert t and isinstance(rules, dict)
    assert preview.card_building("S201") is None                       # (Science Lab places nothing)


def test_the_first_building_of_an_empty_zoo_touches_the_border():
    out = preview.placements("S274", "T1", [], marine_worlds=True)       # Mascot Statue / Victory Column: one space
    bd = board("T1")
    assert out["type"] == "victory" and out["shape"] == [[0, 0]]
    assert out["options"] and all((x, y) in bd.border and k == 0 for x, y, k in out["options"])


def test_a_big_building_has_turns_and_follows_the_rules_of_its_card():
    out = preview.placements("S254", "T1", [], marine_worlds=True)       # Zoo School: 3 spaces, 2 of them on the border
    assert out["type"] == "zoo-school" and len(out["shape"]) == 3
    assert out["options"] and {k for _, _, k in out["options"]} <= set(range(6))
    bd = board("T1")
    assert all(sum(c in bd.border for c in preview.build_action.footprint("zoo-school", x, y, k)) >= 2 for x, y, k in out["options"])


def test_the_experts_use_the_plain_placement_rules():
    assert preview.placements("S210", "T1", [], marine_worlds=True)["type"] == "kiosk"
    assert preview.placements("S211", "T1", [], marine_worlds=True)["type"] == "size-1"
    assert preview.placements("S213", "T1", [], marine_worlds=True)["type"] == "pavilion"


def test_a_card_without_a_building_is_refused():
    with pytest.raises(ValueError):
        preview.placements("S201", "T1", [])


def test_the_route(client):
    body = {"card": "S265", "map_id": "T1", "marine_worlds": False, "buildings": [], "build_level": 1, "overbuild": False}
    r = client.post("/api/preview/placements", json=body)
    assert r.status_code == 200 and r.json()["type"] == "kiosk" and r.json()["options"]
    assert client.post("/api/preview/placements", json={**body, "card": "S201"}).status_code == 422
    assert client.post("/api/preview/placements", json={"card": "S265"}).status_code == 422


def test_every_enclosure_can_be_previewed_for_its_geometry():
    for t in preview.ENCLOSURES:
        out = preview.enclosure_placements(t, "T1", [], marine_worlds=True)
        assert out["type"] == t and out["shape"] and out["options"], t
        assert len(out["shape"]) == preview.build_action.SIZES[t]
    out = preview.enclosure_placements("size-3", "T1", [])
    assert {k for _, _, k in out["options"]} <= set(range(6))


def test_the_aquariums_only_in_marine_worlds():
    for t in ("small-aquarium", "large-aquarium"):
        with pytest.raises(ValueError):
            preview.enclosure_placements(t, "T1", [], marine_worlds=False)
    assert preview.enclosure_placements("size-1", "T1", [], marine_worlds=False)["options"]
    with pytest.raises(ValueError):
        preview.enclosure_placements("kiosk", "T1", [])                 # (not an enclosure)


def test_the_route_takes_an_enclosure(client):
    body = {"enclosure": "reptile-house", "map_id": "T1", "marine_worlds": False, "buildings": []}
    r = client.post("/api/preview/placements", json=body)
    assert r.status_code == 200 and r.json()["type"] == "reptile-house" and r.json()["options"]   # (level II only in the game: the preview shows the geometry anyway)
    assert client.post("/api/preview/placements", json={**body, "enclosure": "large-aquarium"}).status_code == 422


def test_diversity_researcher_lets_buildings_and_enclosures_cover_water_and_rock():
    for card in ("S249", "S245"):
        plain = preview.placements(card, "T1", [], 2, False, True)["options"]
        over = preview.placements(card, "T1", [], 2, True, True)["options"]
        assert set(map(tuple, plain)) < set(map(tuple, over))
    for t in ("size-3", "small-aquarium", "large-bird-aviary"):
        plain = preview.enclosure_placements(t, "T1", [], False, True)["options"]
        over = preview.enclosure_placements(t, "T1", [], True, True)["options"]
        assert set(map(tuple, plain)) < set(map(tuple, over))
    assert preview.from_view({"card": "S249", "map_id": "T1", "marine_worlds": True, "buildings": [], "overbuild": True})["options"]


def test_terrain_build_lets_an_enclosure_cover_one_rock_or_water_space():
    for t in ("size-2", "size-3", "reptile-house"):
        plain = {tuple(o) for o in preview.enclosure_placements(t, "T1", [], False, True)["options"]}
        terr = {tuple(o) for o in preview.enclosure_placements(t, "T1", [], False, True, True)["options"]}
        assert plain < terr, t
        over = {tuple(o) for o in preview.enclosure_placements(t, "T1", [], True, True)["options"]}
        assert terr < over, t                                                                     # (only one space: the Diversity Researcher covers any number)
    b = preview.from_view({"enclosure": "size-3", "map_id": "T1", "marine_worlds": True, "buildings": [], "terrain_build": True})
    assert len(b["options"]) > len(preview.from_view({"enclosure": "size-3", "map_id": "T1", "marine_worlds": True, "buildings": []})["options"])
    c = preview.placements("S249", "T1", [], 2, False, True)["options"]                             # (a sponsor building is not a Build action: the flag changes nothing)
    assert preview.from_view({"card": "S249", "map_id": "T1", "marine_worlds": True, "buildings": [], "build_level": 2, "terrain_build": True})["options"] == c
