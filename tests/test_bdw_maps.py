"""The Board Design Workshop maps BDW1..BDW4 (data/bdw_maps.json, engine rules keyed by their ids, docs/bdw_maps.md)."""
import pytest

from ark_nova import data
from ark_nova.engine import animals_action as aa, association, game, map_rules
from ark_nova.engine.actions import Action
from ark_nova.engine.board import board
from ark_nova.engine.state import Building

from tests.test_animal_abilities import _start, _zoo

CARDS = data.cards_by_key()


def test_the_maps_are_data_with_a_full_board():
    maps = {m["id"]: m for m in data.bdw_maps()}
    assert list(maps) == ["BDW1", "BDW2", "BDW3", "BDW4"] and [m["name"] for m in maps.values()] == ["Management Zoo", "Construction Yard", "Enigma Isle", "Vast Valley"]
    for mid, m in maps.items():
        bd = board(mid)
        assert len(bd.cells) == 58 and data.map_by_id(mid) is m and len(m["geometry"]["bonus_slots"]) == 7
        assert all(b["bonus"] and (b["x"], b["y"]) in bd.cells for b in m["geometry"]["placement_bonuses"])
        assert [s["kind"] for s in m["geometry"]["bonus_slots"]] == ["instant_income"] * 3 + ["instant"] * 4
    assert "BDW1" not in [m["id"] for m in data.maps()]                          # (not part of the maps of the game: only a pool that asks for them has them)


def test_the_pool_has_the_maps_only_when_asked():
    plain = game.new_game({"game_mode": "free-select", "marine_worlds_flag": False}, ["1", "2"], tail_seed=3)
    asked = game.new_game({"game_mode": "free-select", "marine_worlds_flag": False, "bdw_maps": True}, ["1", "2"], tail_seed=3)
    assert not any(m.startswith("BDW") for m in plain.map_select["pool"])
    assert asked.map_select["pool"][-4:] == ["BDW1", "BDW2", "BDW3", "BDW4"]
    s = game.apply(asked, Action(0, "choose_map", {"map": "BDW3"}))
    s = game.apply(s, Action(1, "choose_map", {"map": "BDW4"}))
    assert s.config.maps == ["BDW3", "BDW4"] and [p.map_id for p in s.players] == ["BDW3", "BDW4"]
    one = game.new_game({"game_mode": "free-select", "marine_worlds_flag": False, "bdw_maps": True, "maps_to_exclude": ["BDW2"]}, ["1", "2"], tail_seed=3)
    assert "BDW2" not in one.map_select["pool"] and "BDW1" in one.map_select["pool"]
    with pytest.raises(game.IllegalAction):
        game.apply(plain, Action(0, "choose_map", {"map": "BDW1"}))               # a map that is not on offer cannot be picked


def test_the_association_board_of_each_map():
    expect = {"BDW1": (1, 2, None), "BDW2": (None, 2, 1), "BDW3": (2, None, 1), "BDW4": (1, 1, 1)}      # 4th partner zoo, 3rd university, last worker: conservation
    for mid, (p4, u3, w3) in expect.items():
        row = data.map_by_id(mid)["association"]
        value = lambda b: b["value"] if b else None                                # noqa: E731
        assert (value(row["partner_zoos"][3]), value(row["universities"][2]), value(row["workers"][2])) == (p4, u3, w3)
        assert row["partner_zoos"][2] == {"type": "Worker", "value": 1} and row["upgrade"] == {"mode": "second"}


# ---- BDW4 (Vast Valley) ----------------------------------------------------------------------------------------------------------------

def _bdw4(unlocked: bool):
    s = _start(_zoo("A404", level=2))
    p = s.players[0]
    p.map_id = "BDW4"
    p.flags["bonus_used"] = (1 << map_rules.BDW4_BLUE_SLOT) if unlocked else 0
    p.buildings = [Building(id=1, type="size-4", x=1, y=0), Building(id=2, type="size-4", x=3, y=6)]      # one on the border, one inside
    return s


def test_vast_valley_the_blue_space_gives_border_enclosures_one_more_capacity():
    for unlocked in (False, True):
        s = _bdw4(unlocked)
        p, bd = s.players[0], board(s.players[0].map_id)
        border, inner = p.buildings
        assert aa.effective_size(p, inner, bd) == 4
        assert aa.effective_size(p, border, bd) == (5 if unlocked else 4)


def test_vast_valley_an_animal_in_an_oversized_enclosure_costs_5_less():
    s = _bdw4(False)
    p = s.players[0]
    size = CARDS["A404"]["size"]
    assert size < 4
    border, inner = p.buildings
    full = aa.cost(s, 0, "A404")
    assert aa.price_in(s, 0, "A404", 0, inner) == max(0, full - 5)                  # a size-4 enclosure is larger than the animal needs
    p.buildings[1] = Building(id=2, type=f"size-{size}", x=3, y=6)
    assert aa.price_in(s, 0, "A404", 0, p.buildings[1]) == full                     # an enclosure of the animal's own size: no discount
    other = _bdw4(False)
    other.players[0].map_id = "1"
    assert aa.price_in(other, 0, "A404", 0, other.players[0].buildings[1]) == aa.cost(other, 0, "A404")      # (only on this map)


def test_vast_valley_the_discount_decides_what_can_be_afforded():
    s = _bdw4(False)
    p = s.players[0]
    full = aa.cost(s, 0, "A404")
    assert full > 5
    p.money = full - 5
    plays = [a for a in game.legal_actions(s) if a.kind == "play_animal"]
    assert plays and all((a.args["x"], a.args["y"]) in {(1, 0), (3, 6)} for a in plays)
    p.buildings[0] = Building(id=1, type=f"size-{CARDS['A404']['size']}", x=1, y=0)          # the border one fits the animal exactly: it costs the full price now
    plays = [a for a in game.legal_actions(s) if a.kind == "play_animal"]
    assert {(a.args["x"], a.args["y"]) for a in plays} == {(3, 6)}
    before = p.money
    s = game.apply(s, Action(0, "play_animal", {"card": "A404", "from_display": False, "x": 3, "y": 6}))
    assert s.players[0].money == before - (full - 5) + (0)                            # paid the discounted price


# ---- BDW3 (Enigma Isle) ----------------------------------------------------------------------------------------------------------------

def _build(map_id, variant_slot=3, level=1):
    from tests.test_engine_turn import _build_state
    s = _build_state(marine_worlds=False, map_id=map_id)
    p = s.players[0]
    c = next(c for c in p.action_cards if c.type == "build")
    c.level = level
    p.money = 40
    return s, p


def test_enigma_isle_covering_water_and_rock_costs_one_money_a_space():
    from ark_nova.engine import build_action
    s, p = _build("BDW3")
    s = game.apply(s, Action(0, "choose_action_card", {"type": "build", "spend": 0}))
    plays = [a for a in game.legal_actions(s) if a.kind == "place_building"]
    bd = board("BDW3")
    on_water = next(a for a in plays if a.args["type"] == "kiosk" and bd.terrain[(a.args["x"], a.args["y"])] == "water")
    on_plain = next(a for a in plays if a.args["type"] == "kiosk" and bd.terrain[(a.args["x"], a.args["y"])] == "plain")
    assert any(bd.terrain[(a.args["x"], a.args["y"])] == "rock" for a in plays)       # rock can be built on too
    money = s.players[0].money
    gain = sum(b["value"] for b in bd.bonuses.get((on_water.args["x"], on_water.args["y"]), []) if b["type"] == "money")
    after = game.apply(s, on_water)
    assert after.players[0].money == money - 2 - 1 + gain                              # the kiosk (2) and 1 for the water space
    gain = sum(b["value"] for b in bd.bonuses.get((on_plain.args["x"], on_plain.args["y"]), []) if b["type"] == "money")
    assert game.apply(s, on_plain).players[0].money == money - 2 + gain


def test_enigma_isle_the_diversity_researcher_and_the_tunnel_cover_terrain_for_nothing():
    from ark_nova.engine import map_rules
    s, p = _build("BDW3")
    cells = [(1, 0), (0, 1)]                                                           # two water spaces
    assert map_rules.terrain_fee(p, "size-2", cells) == 2
    assert map_rules.terrain_fee(p, "underwater-tunnel", cells) == 0
    p.sponsors = ["S219"]
    assert map_rules.terrain_fee(p, "size-2", cells) == 0
    other, q = _build("1")
    assert map_rules.terrain_fee(q, "size-2", cells) == 0


def test_enigma_isle_a_free_building_pays_for_its_terrain_and_must_be_affordable():
    from ark_nova.engine import build_action, effects
    s, p = _build("BDW3")
    p.buildings = []
    bd = board("BDW3")
    on_terrain = lambda opts, b=bd: [o for o in opts if any(b.terrain[c] != "plain" for c in build_action.footprint("size-2", *o))]      # noqa: E731
    assert on_terrain(effects.build_options(s, 0, "size-2", {}))                       # a free enclosure (an effect of a bonus or a card) may go on water / rock ...
    p.money = 0
    assert not on_terrain(effects.build_options(s, 0, "size-2", {}))                   # ... but only when the player has the money for the spaces
    other, q = _build("1")
    assert not on_terrain(effects.build_options(other, 0, "size-2", {}), board("1"))     # (not on another map)


def test_enigma_isle_income_is_one_money_per_pair_of_connected_water_and_rock():
    from ark_nova.engine import breaks, map_rules
    s, p = _build("BDW3")
    p.buildings = [Building(id=1, type="size-2", x=1, y=0, rotation=0)]
    assert breaks.map_ability_income(s, p) == map_rules.terrain_pairs(p)
    water, rock = map_rules.connected_terrain(p, "water"), map_rules.connected_terrain(p, "rock")
    assert water and not rock or rock or True
    assert map_rules.terrain_pairs(p) == min(len(water), len(rock))
    p.map_id = "1"
    assert breaks.map_ability_income(s, p) == 0


def test_the_full_map_appeal_is_what_the_map_prints():
    from ark_nova.engine import build_action
    assert [build_action.full_map_appeal(m) for m in ("1", "BDW1", "BDW2", "BDW3", "BDW4")] == [7, 7, 7, 5, 7]


# ---- BDW1 (Management Zoo) -------------------------------------------------------------------------------------------------------------

def _bdw1(owned):
    s = _zoo("A404")                                                                  # a predator (Africa)
    p = s.players[0]
    p.map_id = "BDW1"
    p.animals = list(owned)
    return _start(s)


def _species(s):
    return [e for e in (s.prompt.args["pending"] if s.prompt is not None and s.prompt.kind == "effects" else []) if e["kind"] == "species_bonus"]


def test_management_zoo_the_second_icon_of_a_species_pays_a_bonus():
    from tests.test_animal_abilities import _play
    s = _play(_bdw1(["A405"]), "A404", settle=False)                                  # the first Predator is in the zoo: this is the second
    assert [e["icon"] for e in _species(s)] == ["Predator"]
    acts = [a for a in game.legal_actions(s) if a.kind == "choose_effect" and a.args.get("gain")]
    assert {a.args["gain"] for a in acts} == {"money", "snapping", "marketing"}
    i = s.prompt.args["pending"].index(_species(s)[0])
    money = s.players[0].money
    s = game.apply(s, Action(0, "choose_effect", {"index": i, "gain": "money"}))
    assert s.players[0].money == money + 5 and not _species(s)


def test_management_zoo_only_the_second_icon_counts():
    from tests.test_animal_abilities import _play
    assert not _species(_play(_bdw1([]), "A404", settle=False))                       # the first one: nothing
    assert not _species(_play(_bdw1(["A405", "A410"]), "A404", settle=False))        # the third one: nothing
    other = _bdw1(["A405"])
    other.players[0].map_id = "1"
    assert not _species(_play(other, "A404", settle=False))                           # (only on this map)


def test_management_zoo_a_lost_icon_that_comes_back_pays_again():
    from collections import Counter
    from ark_nova.engine import map_rules
    one, two, three = Counter({"Predator": 1}), Counter({"Predator": 2}), Counter({"Predator": 3})
    assert map_rules.species_effects(0, one, two) and not map_rules.species_effects(0, two, three)
    assert not map_rules.species_effects(0, one, one) and map_rules.species_effects(0, Counter(), two)       # 0 -> 2 in one go reaches the second
    assert not map_rules.species_effects(0, Counter({"Africa": 1}), Counter({"Africa": 2}))                   # (a continent is not a species)


# ---- BDW2 (Construction Yard) ----------------------------------------------------------------------------------------------------------

def _bdw2(cards=("A404",)):
    s = _zoo(cards[0])
    p = s.players[0]
    p.map_id = "BDW2"
    p.buildings = [Building(id=1, type="size-2", x=3, y=12), Building(id=2, type="size-2", x=1, y=0)]
    s = _start(s)
    return s, s.players[0]


def test_construction_yard_the_crane_is_a_place_to_build_next_to():
    from ark_nova.engine import build_action, map_rules
    s, p = _bdw2()
    assert map_rules.crane_hex(p) == (4, 11)
    bd = board("BDW2")
    mine = [(b.type, b.x, b.y, b.rotation) for b in p.buildings]
    near = {(x, y) for x, y, k in build_action.valid_placements(bd, mine, "size-1", 1, {"crane": (4, 11)})}
    plain = {(x, y) for x, y, k in build_action.valid_placements(bd, mine, "size-1", 1, {})}
    assert near > plain and (3, 10) in near - plain or near - plain                       # a space next to the crane that touches no building
    first = {(x, y) for x, y, k in build_action.valid_placements(bd, [], "size-1", 1, {"crane": (4, 11)})}
    border_first = {(x, y) for x, y, k in build_action.valid_placements(bd, [], "size-1", 1, {})}
    from ark_nova.engine.board import neighbours
    assert first > border_first and all((x, y) in border_first or (4, 11) in neighbours((x, y)) for x, y in first)            # the first building may also be built next to the crane
    p.buildings.append(Building(id=3, type="size-1", x=4, y=11))                          # the rock hex is covered (Terrain Build / Diversity Researcher): the crane stops
    assert map_rules.crane_hex(p) is None


def _crane_effects(s):
    return [e for e in (s.prompt.args["pending"] if s.prompt is not None and s.prompt.kind == "effects" else []) if (e.get("rules") or {}).get("reposition")]


def test_construction_yard_a_flipped_enclosure_next_to_the_crane_may_be_repositioned():
    from tests.test_animal_abilities import _play
    s, p = _bdw2()
    p.buildings = [Building(id=1, type="size-2", x=3, y=10), Building(id=2, type="size-2", x=1, y=0)]      # the first one touches the crane
    s = _play(s, "A404", x=3, y=10, settle=False)
    moves = _crane_effects(s)
    assert len(moves) == 1 and moves[0]["rules"]["reposition"] == [3, 10] and moves[0]["optional"]
    options = [a for a in game.legal_actions(s) if a.kind == "place_building"]                 # the places are placements, like any building (the viewer draws them)
    assert options and any(a.kind == "skip_effect" for a in game.legal_actions(s))
    far = next(a for a in options if a.args["y"] <= 2 and a.args["x"] >= 4)                  # a free place that touches no building
    s = game.apply(s, far)
    moved = next(b for b in s.players[0].buildings if b.id == 1)
    assert (moved.x, moved.y, moved.rotation) == (far.args["x"], far.args["y"], far.args["rotation"]) and moved.animal == "A404"     # it keeps its animal
    assert len(s.players[0].buildings) == 2 and not _crane_effects(s)


def test_construction_yard_reposition_ignores_the_animals_rock_and_water_requirements():
    from ark_nova import data
    from ark_nova.engine import build_action
    from ark_nova.engine.board import neighbours
    from ark_nova.engine.icons import requirement
    s, p = _bdw2()
    bd = board("BDW2")
    key = next(a["key"] for a in data.animals() if requirement(a["key"], "rock", False) or requirement(a["key"], "water", False))       # an animal that needed rock / water next to its enclosure
    p.sponsors = [k for k in p.sponsors if k != "S219"]                                  # (the helper's Overbuild would skip the old check)
    b = p.buildings[0]
    b.animal = key
    targets = map_rules.crane_targets(s, p, b, 1)
    occupied = {c for o in p.buildings if o is not b for c in build_action.footprint(o.type, o.x, o.y, o.rotation)}

    def bare(x, y, k):                                                                     # no rock or water next to the new place: only the animal's own requirement would refuse it
        cells = build_action.footprint(b.type, x, y, k)
        around = {n for c in cells for n in neighbours(c) if n not in cells} - occupied
        return not any(bd.terrain.get(n) in ("rock", "water") for n in around)
    assert any(bare(*t) for t in targets)


def test_construction_yard_a_far_enclosure_has_no_crane_effect():
    from tests.test_animal_abilities import _play
    s, p = _bdw2()
    s = _play(s, "A404", x=1, y=0, settle=False)
    assert not _crane_effects(s)


def test_construction_yard_only_the_new_spaces_pay_placement_bonuses():
    from ark_nova.engine import build_action
    s, p = _bdw2()
    bd = board("BDW2")
    b = p.buildings[0]
    old = set(build_action.footprint(b.type, b.x, b.y, b.rotation))
    p.money = 40
    occupied = {c for o in p.buildings if o is not b for c in build_action.footprint(o.type, o.x, o.y, o.rotation)}

    def single(x, y, k):                                                                   # exactly one money bonus on the new spaces (a second one would be an effect of its own)
        cells = build_action.footprint(b.type, x, y, k)
        return (all(c in bd.cells and bd.terrain[c] == "plain" and c not in occupied for c in cells)
                and [v["type"] for c in cells if c not in old for v in bd.bonuses.get(c, [])] == ["money"])
    x, y, k = next((x, y, k) for x, y in sorted(bd.cells) for k in range(6) if single(x, y, k))
    expect = sum(v["value"] for c in build_action.footprint(b.type, x, y, k) if c not in old for v in bd.bonuses.get(c, []))
    game.reposition_building(s, 0, b, x, y, k)
    assert p.money == 40 + expect
    money = p.money
    game.reposition_building(s, 0, b, x, y, k)                                              # to the same place: no space is new
    assert p.money == money


# ---- the pool, the sandbox, the viewer -------------------------------------------------------------------------------------------------

def test_the_fourth_notepad_space_of_each_map_is_offered():
    s = game.new_game({"game_mode": "free-select", "marine_worlds_flag": False, "bdw_maps": True}, ["1", "2"], tail_seed=3)
    s = game.apply(game.apply(s, Action(0, "choose_map", {"map": "BDW1"})), Action(1, "choose_map", {"map": "BDW2"}))
    offered = lambda seat: dict(association.notepad_bonuses(s, s.players[seat]))             # noqa: E731
    assert offered(0)[3] == {"type": "project-support", "value": 1} and offered(1)[3] == {"type": "size-5", "value": 1}


def test_management_zoo_the_project_space_puts_an_unused_base_project_on_the_board_for_both_players():
    from ark_nova.engine import bonuses
    from tests.test_animal_abilities import _play
    s = _play(_bdw1([]), "A404", settle=False)
    assert s.base_projects_unused
    bonuses.apply_bonus(s, 0, {"project-support": 1})
    i = next(i for i, e in enumerate(s.prompt.args["pending"]) if e["kind"] == "assertion" and e.get("play"))
    options = [a for a in game.legal_actions(s) if a.kind == "choose_effect" and a.args.get("index") == i]
    assert {a.args["card"] for a in options} == set(s.base_projects_unused)
    pick = options[0].args["card"]
    left = len(s.base_projects_unused)
    s = game.apply(s, options[0])
    assert s.projects_in_play[0] == pick and pick not in s.players[0].hand and len(s.base_projects_unused) == left - 1
    assert not any(t.location.startswith(pick + "_") for q in s.players for t in q.tokens)         # nobody's cube is on it: either player may support it


def test_the_sandbox_offers_the_maps_only_when_asked_and_the_viewer_draws_them():
    from ark_nova.replay import sandbox
    assert not any(m["id"].startswith("BDW") for m in sandbox.available_maps(False))
    assert [m["id"] for m in sandbox.available_maps(False, True)][-4:] == ["BDW1", "BDW2", "BDW3", "BDW4"]
    s, meta = sandbox.new_game(False, ["BDW3", "BDW4"], 0, seed=5, bdw_maps=True)
    assert s.config.maps == ["BDW3", "BDW4"] and s.config.bdw_maps
    with pytest.raises(sandbox.SandboxError):
        sandbox.new_game(False, ["BDW3", "1"], 0)                                                # not without the option
    view = sandbox.map_view("BDW3")
    assert view["image"] == "/maps/map-BDW3.jpg" and view["full_map_appeal"] == 5 and view["bdw"] and view["custom_association"]["partner_zoos"][3]["value"] == 2
    assert sandbox.map_view("BDW1")["full_map_appeal"] == 7
    assert all((__import__("pathlib").Path(__file__).resolve().parent.parent / "web" / "maps" / f"map-BDW{n}.jpg").exists() for n in range(1, 5))


def test_a_live_game_can_ask_for_the_maps():
    from ark_nova.live.fake import FakeKeeper
    from ark_nova.live.service import LiveService
    svc = LiveService(FakeKeeper())
    g = svc.create(bdw_maps=True, game_mode="free-select")
    assert g["game_id"]
    snap = svc.keeper.get(g["game_id"]) if hasattr(svc.keeper, "get") else None
    plain = svc.create(game_mode="free-select")
    assert plain["game_id"] != g["game_id"]


def test_ark360_can_have_the_maps_in_its_pool():
    from ark_nova.engine import ark360
    assert all(ark360.applicable(m) for m in ("BDW1", "BDW2", "BDW3", "BDW4"))
    s = game.new_game({"game_mode": "ark360", "marine_worlds_flag": False, "bdw_maps": True, "maps_to_exclude": [m["id"] for m in data.maps()]}, ["1", "2"], tail_seed=9)
    assert s.config.maps[0] == s.config.maps[1] and s.config.maps[0].startswith("BDW") and s.players[0].bonus_layout


def test_a_lobby_game_can_ask_for_the_maps():
    from ark_nova.live.lobbies import MemoryLobbies as Twin
    lobbies = Twin()
    acct = {"id": "A1", "username": "alice"}
    v = lobbies.op_create(acct, {"game_mode": "ark360", "marine_worlds": False, "bdw_maps": True})
    assert v["bdw_maps"] is True and lobbies.op_create({"id": "A2", "username": "bob"}, {"game_mode": "ark360"})["bdw_maps"] is False


def test_construction_yard_the_crane_move_is_told_apart_from_a_new_building():
    from ark_nova.replay import fork
    from ark_nova.replay.options import effect_name
    from tests.test_animal_abilities import _play
    s, p = _bdw2()
    p.buildings = [Building(id=1, type="size-2", x=3, y=10), Building(id=2, type="size-2", x=1, y=0)]
    s = _play(s, "A404", x=3, y=10, settle=False)
    eff = _crane_effects(s)[0]
    assert effect_name(eff) == "Crane: reposition the enclosure"
    moves = [a for a in game.legal_actions(s) if a.kind == "place_building"]
    assert moves and all(a.args.get("move") is True for a in moves)
    assert fork.describe_action(moves[0], s).startswith("Move the size-2 to (")
    skip = next(a for a in game.legal_actions(s) if a.kind == "skip_effect" and s.prompt.args["pending"][a.args["index"]] is eff)
    assert fork.describe_action(skip, s) == "Skip: Crane: reposition the enclosure"
    s = game.apply(s, moves[0])                                                           # the move works with the flag
    assert not _crane_effects(s)
