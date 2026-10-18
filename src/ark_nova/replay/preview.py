"""Placement preview ("where would this fit?"): a sponsor building of a card in a hand, or any enclosure of the Build action. the placements of the building of a sponsor card that is in a hand, worked out from what the viewer shows
(the map, the buildings of the zoo, the level of the Build action, Diversity Researcher): no engine state is needed, so the replay, the fork, the sandbox and a live game all use it.
Nothing is placed and nothing is kept. The rules are the ones of the card when it is played (`engine.effects.build_rules` + `engine.build_action.valid_placements`).
The three Experts place their building later (when an icon is played): the same placement rules without any extra condition.
An enclosure is previewed for its geometry only: every type, whatever the Build action's level, the money or the enclosures already built (the upgraded level, so flagged spaces count; with Terrain Build, the Build action card side 4, one rock / water space may be covered; sponsor buildings never get it: they come from the Sponsors action);
the aquariums only in a Marine Worlds game."""
from ark_nova.engine import card_programs as prog
from ark_nova.engine import effects
from ark_nova.engine.board import board
from ark_nova.engine import build_action

EXPERTS = {"S210": "kiosk", "S211": "size-1", "S213": "pavilion"}                     # Expert on the Americas / Europe / Asia
ENCLOSURES = ["size-1", "size-2", "size-3", "size-4", "size-5", "large-bird-aviary", "reptile-house", "petting-zoo", "small-aquarium", "large-aquarium"]
PREVIEW_CARDS = sorted(set(prog.UNIQUE_BUILD) | set(EXPERTS))                           # the 27 sponsor buildings (with the Mascot Statue / Victory Column S274)


def card_building(card_key: str, marine_worlds: bool = False):
    """(building type, placement rules) of a sponsor card, or None when the card has no building."""
    if card_key in EXPERTS:
        return EXPERTS[card_key], {}
    if card_key in prog.UNIQUE_BUILD:
        return effects.build_rules(card_key, marine_worlds)
    return None


def placements(card_key: str, map_id: str, buildings: list, build_level: int = 1, overbuild: bool = False, marine_worlds: bool = False) -> dict:
    """{type, shape (axial cells of rotation 0 around the anchor), options: [[x, y, rotation], ...]} for the card; `buildings` are the zoo's [(type, x, y, rotation)]."""
    got = card_building(card_key, marine_worlds)
    if got is None:
        raise ValueError(f"{card_key} is not a sponsor building")
    t, rules = got
    if not build_action.knows_shape(t):
        raise ValueError(f"the shape of the {t} building is unknown")
    if overbuild:                                                                       # Diversity Researcher: water and rock spaces can be built on
        rules = {**rules, "overbuild": True}
    options = build_action.valid_placements(board(map_id), [tuple(b) for b in buildings], t, build_level, rules)
    return {"type": t, "shape": [list(o) for o in build_action.shape_of(t)], "options": [list(o) for o in options]}


def enclosure_placements(t: str, map_id: str, buildings: list, overbuild: bool = False, marine_worlds: bool = False, terrain_build: bool = False) -> dict:
    """The same for an enclosure type of the Build action, geometry only (the upgraded Build action: every space may be used, the special enclosures are allowed)."""
    if t not in ENCLOSURES:
        raise ValueError(f"{t} is not an enclosure")
    if t in build_action.AQUARIUMS and not marine_worlds:
        raise ValueError("the aquariums belong to Marine Worlds")
    rules = {"overbuild": True} if overbuild else {}
    if terrain_build:                                                                   # Build action card side 4 (Terrain Build): one building may cover 1 rock / water space
        rules["terrain_hexes"] = 1
    options = build_action.valid_placements(board(map_id), [tuple(b) for b in buildings], t, 2, {**rules, "any_level": True})
    return {"type": t, "shape": [list(o) for o in build_action.shape_of(t)], "options": [list(o) for o in options]}


def from_view(body: dict) -> dict:
    """The same from the request of the viewer: {card | enclosure, map_id, marine_worlds, buildings: [{type, x, y, rotation}], build_level, overbuild, terrain_build}."""
    buildings = [(str(b["type"]), int(b["x"]), int(b["y"]), int(b["rotation"])) for b in body.get("buildings") or []]
    if body.get("enclosure"):
        return enclosure_placements(str(body["enclosure"]), str(body["map_id"]), buildings, bool(body.get("overbuild")), bool(body.get("marine_worlds")), bool(body.get("terrain_build")))
    return placements(str(body["card"]), str(body["map_id"]), buildings, int(body.get("build_level") or 1), bool(body.get("overbuild")), bool(body.get("marine_worlds")))
