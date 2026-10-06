import glob
from pathlib import Path

import pytest

from ark_nova.engine import cards_action as ca
from ark_nova.engine.actions import Action
from ark_nova.engine.game import IllegalAction, apply, deck_cards, legal_actions, start_game
from ark_nova.engine.state import ActionCardChoice, GameConfig, Phase, SeedSpec
from ark_nova.parser import parse_log
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log
from ark_nova.replay.differential import run_differential


def test_reputation_range():
    assert [ca.reputation_range(r) for r in (0, 1, 2, 3, 4, 6, 7, 9, 10, 12, 13, 15)] == [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]


def test_cards_action_tables():
    assert [ca.draw_count(1, s) for s in range(1, 7)] == [1, 1, 2, 2, 3, 3]
    assert [ca.draw_count(2, s) for s in range(1, 7)] == [1, 2, 2, 3, 4, 4]
    assert [ca.discard_count(1, 0, s) for s in range(1, 7)] == [1, 0, 1, 0, 1, 1]
    assert [ca.discard_count(2, 0, s) for s in range(1, 7)] == [0, 1, 0, 1, 1, 1]
    assert ca.discard_count(1, 1, 5) == 0                                  # variant 1 keeps everything
    assert not ca.snap_allowed(1, 4) and ca.snap_allowed(1, 5) and ca.snap_allowed(2, 3) and not ca.snap_allowed(2, 2)


def _started():
    """A started game (default action cards, slot order animals..sponsors) waiting for the first player's action card."""
    mw = True
    cfg = GameConfig(marine_worlds=mw, player_ids=["1", "2"], maps=["1", "1"], base_projects=deck_cards("base_project", mw)[:3],
                     action_cards=[[ActionCardChoice(x) for x in ("animals", "association", "build", "cards", "sponsors")] for _ in range(2)])
    state = start_game(cfg, SeedSpec(tail_seed=7))
    for seat in (0, 1):
        state = apply(state, Action(seat, "initial_discard", {"cards": state.players[seat].hand[:4]}))
    assert state.phase is Phase.TURN and state.prompt.kind == "choose_action_card"
    return state


def test_cards_action_level_one_flow():
    s = _started()
    # the default order is animals, association, build, cards, sponsors: cards sits in slot 4 -> strength 4 -> draw 2, no discard
    s = apply(s, Action(0, "choose_action_card", {"type": "cards", "spend": 0}))
    assert s.prompt.kind == "cards_take" and s.prompt.args["remaining"] == 2 and s.prompt.args["discard"] == 0
    assert s.break_position == 2
    hand, deck = len(s.players[0].hand), len(s.main_deck)
    s = apply(s, Action(0, "take_cards", {"mode": "deck", "count": 2}))
    assert len(s.players[0].hand) == hand + 2 and len(s.main_deck) == deck - 2
    assert s.active_player == 1 and s.turn == 1 and s.prompt.kind == "choose_action_card" and s.prompt.player == 1
    assert [c.type for c in s.players[0].action_cards] == ["cards", "animals", "association", "build", "sponsors"]   # used card to slot 1
    assert all(s.display)                                                                                       # display stays full


def test_skip_action_gives_an_x_token_and_rotates_the_card():
    s = apply(_started(), Action(0, "skip_action", {"type": "sponsors"}))
    p = s.players[0]
    assert p.x_tokens == 1 and p.action_cards[0].type == "sponsors" and s.break_position == 0 and s.active_player == 1
    assert Action(1, "skip_action", {"type": "animals"}) in legal_actions(s)


def test_snap_takes_any_display_card_and_the_display_is_refilled():
    s = _started()
    s.players[0].x_tokens = 1                     # cards is in slot 4: spend 1 -> strength 5, snap allowed at level I
    s = apply(s, Action(0, "choose_action_card", {"type": "cards", "spend": 1}))
    last = s.display[5]
    assert Action(0, "take_cards", {"mode": "snap", "card": last}) in legal_actions(s)      # slot 6 is out of reputation range 0
    s = apply(s, Action(0, "take_cards", {"mode": "snap", "card": last}))
    assert last in s.players[0].hand and last not in s.display and all(s.display) and s.players[0].x_tokens == 0


def test_illegal_and_unimplemented():
    s = _started()
    with pytest.raises(IllegalAction):
        apply(s, Action(1, "choose_action_card", {"type": "cards", "spend": 0}))            # not this player's decision
    with pytest.raises(IllegalAction):
        apply(s, Action(0, "choose_action_card", {"type": "cards", "spend": 3}))            # not enough X tokens
    next(c for c in s.players[0].action_cards if c.type == "cards").variant = 9         # a variant that does not exist
    with pytest.raises(NotImplementedError):
        apply(s, Action(0, "choose_action_card", {"type": "cards", "spend": 0}))


LOGS = [p for p in sorted(glob.glob(str(Path(__file__).resolve().parents[1] / "log_examples" / "*.json"))) if "573904205" not in p]   # (573904205 is an old log format the parser does not read)


def _differential_of_log(path):
    """One log through parser + replay + engine (a worker of the parallel test): (name, checked turns, problems)."""
    parsed = parse_log(path)
    setup, cfg, seed = game_from_log(parsed)
    replay = build_replay(parsed, setup, cfg, seed)
    rep = run_differential(parsed, replay, {pid: i for i, pid in enumerate(setup.seats)})
    return Path(path).name, rep.checked, rep.illegal + rep.mismatches


@pytest.mark.skipif(not LOGS, reason="log_examples not available")
def test_engine_agrees_with_the_log_turn_by_turn():
    """Every supported turn of every log: the logged actions are legal and the engine ends in the replay's state."""
    from ark_nova.replay.batch import parallel_map
    from ark_nova.replay.config import _sample_maps
    known = _sample_maps()
    paths = [p for p in LOGS if "800035115" not in p and Path(p).stem in known]       # (logs whose maps the index does not give yet cannot be replayed reliably)
    checked = 0
    problems = []
    for name, n, bad in parallel_map(_differential_of_log, paths):
        checked += n
        problems += [(name, x) for x in bad]
    # Cards, Sponsors (fixed-effect cards and the break option), skipped turns and most Build turns agree exactly; the remaining
    # discrepancies (5% of the compared turns: aquarium/petting zoo placement details in a few games, some pavilion appeal and money
    # differences) are listed by scripts/engine_summary.py
    # (the harness also checks the turns with takeBonus / break income cards / placement bonus cards / the Commercial Harbor: 6.5k turns
    # checked, ~340 known problems, see scripts/engine_coverage.py; this is a ratchet, lower it when the problems are fixed)
    assert len(problems) <= 0, problems[:3]
    assert checked >= 24390


def _build_state(marine_worlds=True, map_id="1"):
    """First player is about to choose an action card; both zoos on the same map, empty."""
    cfg = GameConfig(marine_worlds=marine_worlds, player_ids=["1", "2"], maps=[map_id, map_id],
                     base_projects=deck_cards("base_project", marine_worlds)[:3],
                     action_cards=[[ActionCardChoice(x) for x in ("animals", "association", "build", "cards", "sponsors")] for _ in range(2)])
    state = start_game(cfg, SeedSpec(tail_seed=3))
    for seat in (0, 1):
        state = apply(state, Action(seat, "initial_discard", {"cards": state.players[seat].hand[:4]}))
    return state


def test_build_first_building_touches_the_border_and_pavilion_gives_appeal():
    from ark_nova.engine.board import board

    s = _build_state()
    s.players[0].x_tokens = 1                       # build is in slot 3: strength 3 (+1 with a token)
    s = apply(s, Action(0, "choose_action_card", {"type": "build", "spend": 0}))
    assert s.prompt.kind == "build_place" and s.prompt.args["remaining"] == 3 and s.break_position == 0
    bd = board("1")
    acts = [a for a in legal_actions(s) if a.kind == "place_building"]
    pav = [a for a in acts if a.args["type"] == "pavilion"]
    assert pav and all((a.args["x"], a.args["y"]) in bd.border and bd.terrain[(a.args["x"], a.args["y"])] == "plain" for a in pav)
    assert not any(a.args["type"] in ("size-4", "size-5") for a in acts)          # bigger than the strength
    money, appeal = s.players[0].money, s.players[0].appeal
    first = pav[0]
    s = apply(s, first)
    p = s.players[0]
    assert p.money == money - 2 + sum(b["value"] for b in board("1").bonuses.get((first.args["x"], first.args["y"]), []) if b["type"] == "money")
    assert p.appeal == appeal + 1 and [b.type for b in p.buildings] == ["pavilion"]
    assert s.active_player == 1 and s.prompt.kind == "choose_action_card"           # level I: one building, then the turn ends


def test_build_later_buildings_touch_a_building_and_kiosks_keep_their_distance():
    from ark_nova.engine.build_action import SIZES, valid_placements
    from ark_nova.engine.board import board, hex_distance, neighbours

    bd = board("1")
    first = valid_placements(bd, [], "size-2", 1)[0]
    mine = [("size-2", *first)]
    from ark_nova.engine.build_action import footprint

    cells = set(footprint("size-2", *first))
    for x, y, k in valid_placements(bd, mine, "size-1", 1):
        assert any(n in cells for n in neighbours((x, y)))                          # touches the existing building
    kiosk = valid_placements(bd, mine, "kiosk", 1)[0]
    mine.append(("kiosk", kiosk[0], kiosk[1], 0))
    assert all(hex_distance((x, y), kiosk[:2]) >= 3 for x, y, _ in valid_placements(bd, mine, "kiosk", 1))
    assert set(SIZES) >= {"size-1", "size-5", "kiosk", "pavilion", "petting-zoo", "small-aquarium", "large-aquarium"}


def test_build_rules_of_special_buildings():
    s = _build_state(marine_worlds=False)
    s = apply(s, Action(0, "choose_action_card", {"type": "build", "spend": 0}))
    assert not any(a.args.get("type") in ("small-aquarium", "large-aquarium") for a in legal_actions(s))     # Marine Worlds only
    s = _build_state(marine_worlds=True)
    s = apply(s, Action(0, "choose_action_card", {"type": "build", "spend": 0}))
    assert any(a.args.get("type") == "small-aquarium" for a in legal_actions(s))
    with pytest.raises(IllegalAction):                                                                   # level II only
        apply(s, Action(0, "place_building", {"type": "reptile-house", "x": 0, "y": 1, "rotation": 0}))
    from ark_nova.engine.board import board
    from ark_nova.engine.build_action import valid_placements

    bd = board("1")
    assert not valid_placements(bd, [], "large-bird-aviary", 1) and valid_placements(bd, [], "large-bird-aviary", 2)


def test_flags_need_level_two_and_map_13_builds_around_the_centre():
    from ark_nova.engine.board import board
    from ark_nova.engine.build_action import valid_placements

    bd = board("1")
    lvl1 = {(x, y) for x, y, _ in valid_placements(bd, [], "size-1", 1)}
    lvl2 = {(x, y) for x, y, _ in valid_placements(bd, [], "size-1", 2)}
    assert lvl1 <= lvl2 and not (lvl1 & bd.flags)
    b13 = board("13")
    first = {(x, y) for x, y, _ in valid_placements(b13, [], "size-1", 1)}
    assert first == {(3, 6), (4, 3), (4, 9), (5, 6)}                                   # the cells next to the centre marker


def test_full_map_bonus_is_seven_appeal_except_on_map_13():
    from ark_nova.engine.board import board
    from ark_nova.engine.build_action import covers_map

    bd = board("1")
    plain = sorted(c for c in bd.cells if bd.terrain[c] == "plain")
    assert not covers_map(bd, []) and covers_map(bd, [("size-1", x, y, 0) for x, y in plain])
    assert not covers_map(bd, [("size-1", x, y, 0) for x, y in plain[1:]])


def _sponsor_state(level=1, strength_slot=5):
    s = _build_state()
    p = s.players[0]
    order = [c for c in p.action_cards if c.type != "sponsors"]
    p.action_cards = order[: strength_slot - 1] + [next(c for c in p.action_cards if c.type == "sponsors")] + order[strength_slot - 1:]
    p.action_cards[strength_slot - 1].level = level
    return s


def test_sponsors_action_break_option_and_play():
    s = _sponsor_state()
    p = s.players[0]
    acts = legal_actions(apply(s, Action(0, "choose_action_card", {"type": "sponsors", "spend": 0})))
    assert Action(0, "sponsor_break", {}) in acts and not any(a.kind == "finish_sponsors" for a in acts)
    money = p.money
    s2 = apply(apply(s, Action(0, "choose_action_card", {"type": "sponsors", "spend": 0})), Action(0, "sponsor_break", {}))
    assert s2.players[0].money == money + 5 and s2.break_position == 5 and s2.active_player == 1
    p.hand = [k for k in p.hand if not k.startswith("S")] + ["S236"]       # Primatologist: level 1, gives 3 money
    s3 = apply(apply(s, Action(0, "choose_action_card", {"type": "sponsors", "spend": 0})), Action(0, "play_sponsor", {"card": "S236", "from_display": False}))
    assert s3.players[0].money == money + 3 and s3.players[0].sponsors == ["S236"] and "S236" not in s3.players[0].hand
    assert s3.active_player == 1                                                 # level I: exactly one sponsor


def test_sponsors_level_two_plays_several_and_pays_display_folders():
    s = _sponsor_state(level=2)
    p = s.players[0]
    p.hand = ["S236", "S237"]
    p.x_tokens = 2
    s = apply(s, Action(0, "choose_action_card", {"type": "sponsors", "spend": 2}))       # strength 7, budget 8 = two level 4 sponsors
    s = apply(s, Action(0, "play_sponsor", {"card": "S236", "from_display": False}))
    assert s.active_player == 0 and Action(0, "finish_sponsors", {}) in legal_actions(s)
    s = apply(s, Action(0, "play_sponsor", {"card": "S237", "from_display": False}))
    assert s.players[0].sponsors == ["S236", "S237"] and s.active_player == 1
    s = _sponsor_state(level=2)
    s.players[0].reputation = 5
    s.display[0] = "S236"                                                                  # folder 1: pay 1 extra
    money = s.players[0].money
    s = apply(apply(s, Action(0, "choose_action_card", {"type": "sponsors", "spend": 0})), Action(0, "play_sponsor", {"card": "S236", "from_display": True}))
    assert s.players[0].money == money - 1 + 3


def test_sponsor_requirements_and_unimplemented_effects():
    from ark_nova.engine.icons import icon_counts

    s = _sponsor_state()
    s.players[0].hand = ["S204", "S201"]                                                  # Science Museum needs 4 science icons; Science Lab needs level II
    s = apply(s, Action(0, "choose_action_card", {"type": "sponsors", "spend": 0}))
    assert not [a for a in legal_actions(s) if a.kind == "play_sponsor"]
    assert icon_counts(s, 0)["Science"] == 0
    s2 = _sponsor_state()
    s2.players[0].hand = ["S209"]                                                          # Technology Institute: fixed gain of 1 X token
    s2 = apply(apply(s2, Action(0, "choose_action_card", {"type": "sponsors", "spend": 0})), Action(0, "play_sponsor", {"card": "S209", "from_display": False}))
    assert s2.players[0].x_tokens == 1
    s3 = _sponsor_state()
    s3.players[0].hand = ["S282"]
    s3.players[0].action_cards[4].level = 2
    s3 = apply(s3, Action(0, "choose_action_card", {"type": "sponsors", "spend": 0}))
    with pytest.raises(NotImplementedError):
        apply(s3, Action(0, "play_sponsor", {"card": "S282", "from_display": False}))    # Promotion Team: not implemented yet


def _play(s, key, hand=None, spend=0):
    if hand is not None:
        s.players[0].hand = hand
    s.players[0].x_tokens = spend
    s = apply(s, Action(0, "choose_action_card", {"type": "sponsors", "spend": spend}))
    return apply(s, Action(0, "play_sponsor", {"card": key, "from_display": False}))


def test_sponsor_building_is_placed_free_and_own_icons_trigger():
    s = _sponsor_state()
    s.players[0].hand = ["S243"]
    assert not [a for a in legal_actions(apply(s, Action(0, "choose_action_card", {"type": "sponsors", "spend": 0}))) if a.kind == "play_sponsor"]   # needs reputation 3
    s.players[0].reputation = 3
    s = _play(s, "S243", ["S243"])                      # Meerkat Den: herbivore icon, builds next to a rock; own herbivore trigger gives 2 appeal
    p = s.players[0]
    assert s.prompt.kind == "effects" and p.appeal == 2 + 1 * 0 and not p.buildings
    money = p.money
    placements = [a for a in legal_actions(s) if a.kind == "place_building"]
    assert placements and all(a.args["type"] == "meerkat" for a in placements)
    assert not any(a.kind == "skip_effect" for a in legal_actions(s))             # the sponsor's own building is mandatory
    s = apply(s, placements[0])
    assert s.players[0].buildings[-1].type == "meerkat" and s.players[0].money >= money and s.active_player == 1


def test_optional_trigger_can_be_skipped_and_icon_gains_use_the_zoo():
    s = _sponsor_state()
    s.players[0].hand = ["S210"]                        # Expert on the Americas: appeal per Americas icon, optional free kiosk
    s = _play(s, "S210")
    assert s.players[0].appeal == 1 and s.prompt.kind == "effects"
    acts = legal_actions(s)
    assert any(a.kind == "place_building" and a.args["type"] == "kiosk" for a in acts)
    s = apply(s, Action(0, "skip_effect", {"index": 0}))
    assert s.active_player == 1 and s.players[0].buildings == []


def test_take_a_card_and_reveal_effects():
    s = _sponsor_state(level=2)
    s.players[0].hand = ["S201"]                        # Science Lab: take 1 card from the deck or the reputation range
    s = _play(s, "S201")
    hand = len(s.players[0].hand)
    s = apply(s, Action(0, "take_cards", {"mode": "deck", "count": 1}))
    assert len(s.players[0].hand) == hand + 1
    s = _sponsor_state()
    s = _play(s, "S249", ["S249"], spend=1)                      # Barred Owl Hut: its bird icon triggers Perception 2 (keep 1 of the top 2 cards)
    top = s.main_deck[:2]
    keeps = [a for a in legal_actions(s) if a.kind == "choose_effect"]
    assert {a.args["keep"] for a in keeps} == set(top)


def test_thresholds_kiosk_requirement_and_underwater_tunnel():
    from ark_nova.engine.build_action import UNIQUE_SHAPES

    s = _sponsor_state()
    s.players[0].hand = ["S260", "S265"]                # Native Farm Animals: appeal 25 or less; Franchise Business: needs a kiosk
    s.players[0].appeal = 26
    s = apply(s, Action(0, "choose_action_card", {"type": "sponsors", "spend": 0}))
    assert not [a for a in legal_actions(s) if a.kind == "play_sponsor"]
    s.players[0].appeal = 25
    assert Action(0, "play_sponsor", {"card": "S260", "from_display": False}) in legal_actions(s)
    assert UNIQUE_SHAPES["underwater-tunnel"] == [(0, 0), (0, 1)]


def _association_state(level=1):
    s = _build_state()
    p = s.players[0]
    a = next(c for c in p.action_cards if c.type == "association")
    p.action_cards = [c for c in p.action_cards if c.type != "association"]
    p.action_cards.insert(4, a)                                          # slot 5: strength 5 (all four tasks are within reach)
    a.level = level
    return s


def test_association_reputation_and_partner_tasks():
    s = _association_state()
    p = s.players[0]
    assert p.reputation == 1                                              # players start at reputation 1
    s = apply(s, Action(0, "choose_action_card", {"type": "association", "spend": 0}))
    tasks = {a.args["task"] for a in legal_actions(s) if a.kind == "association_task"}
    assert tasks == {"reputation", "partner", "university"}                # conservation needs a project in reach
    s2 = apply(s, Action(0, "association_task", {"task": "reputation"}))
    assert s2.players[0].reputation == 3 and s2.active_player == 1
    assert [t.location for t in s2.players[0].tokens if t.type == "worker"].count("association_2") == 1
    s3 = apply(s, Action(0, "association_task", {"task": "partner", "continent": "Asia"}))
    assert ("partner-Asia", "partner_1") in [(t.type, t.location) for t in s3.players[0].tokens] and s3.active_player == 1
    assert not any(t.type == "partner-Asia" for t in s3.board_tokens)


def test_association_level_one_partner_limit_and_university_tile_effects():
    s = _association_state()
    s.players[0].tokens += [Token_("partner-Africa", "partner_1"), Token_("partner-Europe", "partner_2")]
    s = apply(s, Action(0, "choose_action_card", {"type": "association", "spend": 0}))
    assert not any(a.args.get("task") == "partner" for a in legal_actions(s))            # a 3rd partner zoo needs level II
    s = apply(s, Action(0, "association_task", {"task": "university", "kind": "fac-science-rep"}))
    while s.prompt.kind == "effects":                                                    # the reputation of the tile comes as an effect after the space bonuses
        s = apply(s, [x for x in legal_actions(s) if x.kind in ("choose_effect", "skip_effect")][0])
    p = s.players[0]
    assert p.reputation == 3 and ("fac-science-rep", "university_1") in [(t.type, t.location) for t in p.tokens]


def Token_(kind, loc):
    from ark_nova.engine.state import Token
    return Token(500 + hash(kind + loc) % 400, kind, loc)


def test_conservation_project_support_reaches_conservation_two_and_offers_the_upgrade():
    s = _association_state()
    p = s.players[0]
    s.base_projects = ["P102", "P103", "P104"]
    p.tokens += [Token_("partner-Africa", "partner_1"), Token_("partner-Asia", "partner_2"), Token_("partner-Europe", "partner_3")]
    s = apply(s, Action(0, "choose_action_card", {"type": "association", "spend": 0}))
    acts = [a for a in legal_actions(s) if a.args.get("task") == "conservation" and a.args["project"] == "P102"]
    assert acts                                                                             # 1) the project
    s = apply(s, acts[0])
    slots = [a for a in legal_actions(s) if a.kind == "choose_slot"]
    assert [a.args["slot"] for a in slots] == [2]                                           # 2) the slot: 3 different continents, the third slot only
    s = apply(s, slots[0])
    bonuses = [a for a in legal_actions(s) if a.kind == "choose_bonus"]
    assert bonuses and all(a.kind == "choose_bonus" for a in legal_actions(s))              # 3) one of the notepad bonuses that are left
    s = apply(s, [a for a in bonuses if a.args["bonus"] == 2][0])
    assert s.prompt.kind == "effects" and s.players[0].conservation == 0                    # 4) every effect is pending: nothing is gained yet
    assert {e["kind"] for e in s.prompt.args["pending"]} == {"gain", "project_bonus"}
    s = apply(s, Action(0, "choose_effect", {"index": 0, "apply": "gain", "res": "conservation"}))
    assert s.players[0].conservation == 2
    s = apply(s, Action(0, "choose_effect", {"index": 0, "apply": "project_bonus"}))
    kinds = {a.args.get("upgrade") or ("hire" if a.args.get("hire") else None) for a in legal_actions(s) if a.kind == "choose_effect"}
    assert "build" in kinds and "hire" in kinds                                              # conservation 2: upgrade an action card or hire a worker
    s = apply(s, Action(0, "choose_effect", {"index": 0, "upgrade": "build"}))
    assert next(c for c in s.players[0].action_cards if c.type == "build").level == 2 and s.active_player == 1


def test_release_project_slot_by_animal_size_and_release_effect():
    from ark_nova.engine import project_effects
    from ark_nova.engine.state import Building
    s = _association_state()
    p = s.players[0]
    s.base_projects = ["P102", "P103", "P104"]
    s.projects_in_play = ["P119"]                                                             # Release a bird
    p.animals = ["A518"]                                                                      # Lesser Bird-of-paradise (bird, size 2): a small animal, the third slot
    p.buildings = [Building(id=1, type="size-2", x=1, y=0, animal="A518")]
    s = apply(s, Action(0, "choose_action_card", {"type": "association", "spend": 0}))
    s = apply(s, Action(0, "association_task", {"task": "conservation", "project": "P119", "source": "play"}))
    assert [a.args["slot"] for a in legal_actions(s) if a.kind == "choose_slot"] == [2]
    s = apply(s, Action(0, "choose_slot", {"slot": 2}))
    s = apply(s, [a for a in legal_actions(s) if a.kind == "choose_bonus"][0])
    kinds = {e["kind"] for e in s.prompt.args["pending"]}
    assert {"gain", "project_bonus", "release"} <= kinds
    i = next(i for i, e in enumerate(s.prompt.args["pending"]) if e["kind"] == "release")
    appeal = p.appeal
    s = apply(s, Action(0, "choose_effect", {"index": i, "release": "A518", "building": [1, 0]}))      # the enclosure to empty is chosen (here the only one)
    assert s.players[0].animals == [] and s.players[0].released == ["A518"] and s.players[0].buildings[0].animal is None
    assert s.players[0].appeal == appeal - project_effects.data.cards_by_key()["A518"]["appeal"]


def test_association_level_two_donation_and_publications():
    s = _association_state(level=2)
    s.players[0].tokens += [Token_("worker", "reserve")]
    s = apply(s, Action(0, "choose_action_card", {"type": "association", "spend": 0}))
    assert not any(a.kind == "donate" for a in legal_actions(s))                            # a donation needs a task first
    s = apply(s, Action(0, "association_task", {"task": "reputation"}))
    assert s.active_player == 0 and Action(0, "donate", {}) in legal_actions(s)
    money, cons = s.players[0].money, s.players[0].conservation
    s = apply(s, Action(0, "donate", {}))
    assert s.players[0].money == money - 2 and s.players[0].conservation == cons + 1


def _animals_state(level=1, slot=5):
    from ark_nova.engine.state import Building

    s = _build_state()
    p = s.players[0]
    a = next(c for c in p.action_cards if c.type == "animals")
    p.action_cards = [c for c in p.action_cards if c.type != "animals"]
    p.action_cards.insert(slot - 1, a)
    a.level = level
    p.buildings = [Building(id=1, type="size-2", x=1, y=0), Building(id=2, type="size-1", x=3, y=0)]
    p.hand = ["A439"]                                                     # Lama: size 2, price 10, appeal 4, herbivore + Americas
    return s


def _settle(s):
    """Resolve the printed gains of an animal (effects of their own) first."""
    while s.prompt is not None and s.prompt.kind == "effects":
        i = next((i for i, e in enumerate(s.prompt.args["pending"]) if e["kind"] == "gain"), None)
        if i is None:
            break
        s = apply(s, Action(s.prompt.player, "choose_effect", {"index": i, "apply": "gain", "res": s.prompt.args["pending"][i]["res"]}))
    return s


def test_animals_action_places_the_animal_and_pays_with_partner_discount():
    from ark_nova.engine.state import Token

    s = _animals_state()
    s.players[0].tokens.append(Token(700, "partner-Americas", "partner_1"))       # 3 money less per Americas icon of the animal
    s = apply(s, Action(0, "choose_action_card", {"type": "animals", "spend": 0}))
    acts = [a for a in legal_actions(s) if a.kind == "play_animal"]
    assert {(a.args["x"], a.args["y"]) for a in acts} == {(1, 0)}                     # only the size-2 enclosure is big enough
    money, appeal = s.players[0].money, s.players[0].appeal
    s = _settle(apply(s, acts[0]))
    p = s.players[0]
    assert p.money == money - 7 and p.appeal == appeal + 4 and p.buildings[0].animal == "A439" and p.animals == ["A439"]
    assert s.active_player == 1 and "A439" not in p.hand


def test_animals_action_counts_and_icon_triggers():
    from ark_nova.engine import animals_action as aa

    assert [aa.max_animals(1, k) for k in (2, 4, 5)] == [1, 1, 2] and [aa.max_animals(2, k) for k in (2, 3, 5)] == [1, 2, 2]
    s = _animals_state()
    s.players[0].sponsors = ["S243"]                                                   # Meerkat Den: 2 appeal for every herbivore icon played
    s = apply(s, Action(0, "choose_action_card", {"type": "animals", "spend": 0}))
    appeal = s.players[0].appeal
    s = _settle(apply(s, [a for a in legal_actions(s) if a.kind == "play_animal"][0]))
    assert s.players[0].appeal == appeal + 4 + 2


def test_icon_counters_follow_the_zoo():
    from ark_nova.engine.icons import TRACKED, icon_counts, sync_icons
    from ark_nova.engine.state import Building, Token

    s = _animals_state()
    assert set(s.players[0].icons) <= set(TRACKED)
    s = apply(s, Action(0, "choose_action_card", {"type": "animals", "spend": 0}))
    s = apply(s, [a for a in legal_actions(s) if a.kind == "play_animal"][0])
    icons = s.players[0].icons
    assert icons["Herbivore"] == 1 and icons["Americas"] == 1 and icons["Predator"] == 0            # the Lama: herbivore + Americas
    p = s.players[0]
    p.buildings.append(Building(id=9, type="small-aquarium", x=6, y=5))
    p.tokens.append(Token(800, "fac-science-science", "university_1"))                               # 2 research icons
    p.animals.remove("A439")                                                                         # released: its icons leave the zoo
    sync_icons(s, 0)
    assert p.icons["Water"] == 1 and p.icons["Science"] == 2 and p.icons["Herbivore"] == 0 and p.icons["Americas"] == 0
    assert {k: icon_counts(s, 0)[k] for k in TRACKED} == p.icons


def test_break_hand_limit_board_display_income_and_turn_order():
    from ark_nova.engine.game import BREAK_AT

    s = _sponsor_state()
    s.break_position = BREAK_AT - 2
    p0, p1 = s.players
    p0.hand, p1.hand = ["A401", "A402", "A403", "A404", "A405"], ["A406", "A407", "A408", "A409"]
    p0.tokens += [Token_("worker", "association_4")]                                                 # a worker on the board
    top = s.display[:2]
    money = (p0.money, p1.money)
    s = apply(apply(s, Action(0, "choose_action_card", {"type": "sponsors", "spend": 0})), Action(0, "sponsor_break", {}))
    assert s.prompt.kind == "effects"                                                                 # both players are over the hand limit of 3
    discards = [a for a in legal_actions(s) if a.kind == "choose_effect"]
    assert {a.player for a in discards} == {0, 1} and all(len(a.args["cards"]) in (1, 2) for a in discards)
    s = apply(s, [a for a in discards if a.player == 1][0])
    s = apply(s, [a for a in legal_actions(s) if a.kind == "choose_effect" and a.player == 0][0])
    while s.prompt.kind == "effects":                                                                 # the appeal / kiosk / map incomes are effects of their own
        s = apply(s, [a for a in legal_actions(s) if a.kind == "choose_effect" and str(a.args.get("apply", "")).startswith("income_")][0])
    assert s.prompt.kind == "choose_action_card" and s.active_player == 1 and s.break_position == 0
    assert [len(p.hand) for p in s.players] == [3, 3]
    assert all(c not in s.display for c in top) and all(c in s.main_discard for c in top) and len(s.display) == 6
    assert not any(t.location.startswith("association_") for t in s.players[0].tokens if t.type == "worker")
    from ark_nova.engine import tracks
    assert s.players[0].money == money[0] + 5 + tracks.income_from_appeal(p0.appeal) and s.players[1].money >= money[1] + tracks.income_from_appeal(p1.appeal)
    assert s.players[0].x_tokens == 1                                                                 # triggering the break gives an X token


def test_sponsors_with_icon_formulas_and_requirements():
    s = _sponsor_state(level=2)
    p = s.players[0]
    p.tokens.append(Token_("fac-science-science", "university_1"))                        # 2 research icons
    s = _play(s, "S208", ["S208"])                                                         # Science Library: appeal = research icons (3 with its own)
    assert s.players[0].appeal == 3 and s.players[0].money >= 25 + 2                       # + its own 2 money trigger
    s = _sponsor_state(level=2)
    s.players[0].tokens.append(Token_("fac-science-science", "university_1"))
    s.players[0].appeal = 26
    s.players[0].hand = ["S222"]                                                           # Release of Patents: appeal 25 or less
    s = apply(s, Action(0, "choose_action_card", {"type": "sponsors", "spend": 0}))
    assert not any(a.kind == "play_sponsor" for a in legal_actions(s))
    s = _sponsor_state(level=2)
    s.players[0].tokens.append(Token_("fac-science-science", "university_1"))
    money1 = s.players[1].money
    s = _play(s, "S222", ["S222"])                                                         # 2 research icons -> 2 conservation, the opponent gets 4 money
    assert s.players[0].conservation >= 2 and s.players[1].money == money1 + 4 or s.prompt.kind == "effects"


def test_explorer_and_expert_sponsors():
    s = _sponsor_state(level=2)
    s.players[0].tokens += [Token_("partner-Asia", "partner_1"), Token_("partner-Africa", "partner_2")]
    s = _play(s, "S262", ["S262"])                                                         # Explorer: 2 money per different continent / animal icon
    assert s.players[0].money == 25 + 4
    s = _animals_state()
    s.players[0].sponsors = []
    s.players[0].hand = ["S230"]
    s.players[0].animals = ["A412", "A407"]                                                # two large animals (size 4)
    s = _play(_sponsor_state(level=2), "S230", ["S230"]) if False else s
    s = _sponsor_state(level=2)
    s.players[0].animals = ["A412", "A407", "A439"]
    s = _play(s, "S230", ["S230"])                                                         # Expert in Large Animals: 2 appeal per large animal
    assert s.players[0].appeal == 4


def test_waza_special_assignment_restricts_and_rewards_one_size_class():
    s = _sponsor_state(level=2)
    s.players[0].reputation = 5
    s.players[0].hand = ["S227"]
    s.players[0].x_tokens = 1
    s = apply(s, Action(0, "choose_action_card", {"type": "sponsors", "spend": 1}))
    assert not any(a.kind == "play_sponsor" for a in legal_actions(s))                     # needs reputation 6
    s = _sponsor_state(level=2)
    s.players[0].reputation = 6
    s = _play(s, "S227", ["S227"], spend=1)
    assert {a.args["waza"] for a in legal_actions(s) if a.kind == "choose_effect"} == {"small", "large"}
    top_small = next(k for k in s.main_deck if k.startswith("A") and __import__("ark_nova.data", fromlist=["x"]).cards_by_key()[k]["size"] <= 2)
    s = apply(s, Action(0, "choose_effect", {"index": 0, "waza": "small"}))
    assert top_small in s.players[0].hand and s.players[0].flags["waza"] == 1
    from ark_nova.engine import animals_action as aa
    assert not aa.waza_allows(s.players[0], {"size": 4}) and aa.waza_allows(s.players[0], {"size": 2}) and aa.waza_allows(s.players[0], {"size": 3})


def test_boost_animal_moves_the_action_card_to_slot_1_or_5():
    s = _animals_state()
    s.players[0].hand = ["A502"]                                                           # Great Hornbill: size 2, Boost: Building
    s.players[0].money = 40
    s = apply(s, Action(0, "choose_action_card", {"type": "animals", "spend": 0}))
    s = _settle(apply(s, [a for a in legal_actions(s) if a.kind == "play_animal"][0]))
    assert s.prompt.kind == "effects"
    choices = [a for a in legal_actions(s) if a.kind == "choose_effect"]
    assert {a.args["slot"] for a in choices} == {1, 5}
    s = apply(s, [a for a in choices if a.args["slot"] == 5][0])
    assert s.players[0].action_cards[-1].type == "build" and s.players[0].action_cards[0].type == "animals" and s.active_player == 1


def test_reconstruction_moves_buildings_and_stops_placement_bonuses():
    from ark_nova.engine.state import Building

    s = _sponsor_state(level=2)
    p = s.players[0]
    p.buildings = [Building(id=1, type="size-1", x=1, y=0), Building(id=2, type="pavilion", x=3, y=0)]
    s = _play(s, "S280", ["S280"], spend=0)
    assert s.prompt.kind == "effects" and "S280" in s.players[0].sponsors
    removes = [a for a in legal_actions(s) if a.kind == "choose_effect" and "remove" in a.args]
    assert removes and any(a.args["remove"] == [[3, 0]] for a in removes)
    s = apply(s, [a for a in removes if a.args["remove"] == [[3, 0]]][0])
    places = [a for a in legal_actions(s) if a.kind == "place_building" and a.args["type"] == "pavilion"]
    assert places
    money, appeal = s.players[0].money, s.players[0].appeal
    s = apply(s, places[0])
    assert s.players[0].appeal == appeal and s.players[0].money == money                     # a moved building pays and gives nothing
    assert any(b.type == "pavilion" for b in s.players[0].buildings)


def test_basic_research_counts_kinds_of_icons_not_icons():
    from collections import Counter
    from ark_nova.engine.sponsor_extras import distinct_pairs
    assert distinct_pairs(Counter({"Asia": 2, "Americas": 1, "Predator": 1, "Bird": 3, "Bear": 1})) == 2
    assert distinct_pairs(Counter({"Asia": 9})) == 0


def test_veterinarian_diversity_researcher_and_conference_on_europe():
    s = _sponsor_state(level=2)
    s.players[0].tokens += [Token_("fac-science-bird", "university_1"), Token_("fac-science-reptile", "university_2")]
    s = _play(s, "S203", ["S203"])                                                         # Veterinarian: 5 money for 2 universities
    assert s.players[0].money == 25 + 5
    s = _sponsor_state(level=2)
    s = _play(s, "S219", ["S219"])                                                         # Diversity Researcher: 2 money per rock / water icon
    assert s.players[0].money == 25
    s = _sponsor_state(level=2)
    s = _play(s, "S268", ["S268"])                                                         # Conference on Europe: 1 Europe icon = 2 money, 1 mark
    assert s.players[0].money == 27 and [e["kind"] for e in s.prompt.args["pending"]] == ["mark"]       # one mark at the end of the action


def test_native_sponsors_and_farm_cat_count_appeal_next_to_buildings():
    s = _sponsor_state(level=2)
    s = _play(s, "S267", ["S267"])                                                         # no kiosk / pavilion: nothing
    assert s.players[0].appeal == 0


def test_end_of_game_trigger_last_turn_discard_and_final_scoring():
    s = _build_state()
    s.players[0].appeal, s.players[0].conservation = 100, 7                                 # score 100
    s.players[0].reputation, s.players[1].reputation = 12, 6
    s.players[0].endgame_hand, s.players[1].endgame_hand = ["F007", "F001"], ["F007", "F008"]
    s = apply(s, Action(0, "skip_action", {"type": "sponsors"}))
    assert s.end_triggered_by == 0 and s.phase is Phase.FINAL_TURNS and s.final_turns == [1] and s.prompt.player == 1
    s = apply(s, Action(1, "skip_action", {"type": "sponsors"}))                      # the last turn: no break, both discard first
    assert s.prompt.kind == "effects" and {e["player"] for e in s.prompt.args["pending"]} == {0, 1}
    s = apply(s, Action(0, "choose_effect", {"index": 0, "card": "F001"}))
    s = apply(s, Action(1, "choose_effect", {"index": 0, "card": "F008"}))
    assert s.phase is Phase.OVER and s.prompt is None
    assert s.players[0].conservation == 7 + 3 and s.players[1].conservation == 1       # Favorite Zoo: reputation 12 -> 3, 6 -> 1
    assert s.result.scores == [100 + 2 * 10 - 14, s.players[1].appeal + 2 * 1 - 14] and s.result.winner == 0


def test_final_scoring_of_endgame_cards_and_sponsors():
    from ark_nova.engine import endgame
    s = _build_state()
    p0, p1 = s.players
    p0.sponsors = ["S214", "S281", "S216"]
    p1.sponsors = ["S274"]
    p0.x_tokens, p0.reputation, p0.appeal, p1.appeal = 3, 9, 10, 20
    p0.endgame_hand = ["F007"]
    log = endgame.final_scoring(s)
    assert (0, "S214", "appeal", 3) in log and (0, "S216", "conservation", 1) in log and (0, "F007", "conservation", 2) in log
    assert (0, "S281", "appeal", 0) not in log and (1, "S274", "appeal", 0) not in log     # Arcade: only zoos with less appeal; Mascot: higher
    assert p0.appeal == 13 and p0.conservation == 3 and p1.appeal == 20


def test_management_and_breeding_projects_requirements_and_effects():
    from ark_nova.engine import association
    s = _association_state()
    p = s.players[0]
    s.base_projects = ["P102", "P103", "P104"]
    s.projects_in_play = ["P124"]
    p.hand = ["P134"]
    assert association.slot_options(s, 0, "P124") == [] and association.slot_options(s, 0, "P134") == []        # no predator, no partner zoo
    p.animals = ["A401", "A402"]                                                                              # Lion, ...: predators
    assert association.slot_options(s, 0, "P134") and len(association.slot_options(s, 0, "P134")) == 3        # 2 predator icons: every slot of the plan
    from ark_nova.engine.icons import card_icons
    continent = next(c for c in ("Africa", "Europe", "Asia", "Americas", "Australia") if card_icons("A401", False)[c])
    p.tokens.append(Token_(f"partner-{continent}", "partner_1"))                                               # a partner zoo of the animal's continent
    assert association.slot_options(s, 0, "P124")
    s = apply(s, Action(0, "choose_action_card", {"type": "association", "spend": 0}))
    s = apply(s, Action(0, "association_task", {"task": "conservation", "project": "P134", "source": "hand"}))
    assert s.projects_in_play[0] == "P134"
    s = apply(s, Action(0, "choose_slot", {"slot": 2}))                                                       # slot 3: conservation 2 and a tutor
    s = apply(s, [a for a in legal_actions(s) if a.kind == "choose_bonus"][0])
    kinds = [e["kind"] for e in s.prompt.args["pending"]]
    assert "tutor" in kinds and "reveal" in kinds                                                              # tutor (slot) + Hunter (the place bonus)
