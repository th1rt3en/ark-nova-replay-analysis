"""Animal abilities (engine/animal_abilities.py), each one on a constructed zoo. The logs check the same rules in test_engine_turn."""
from ark_nova import data
from ark_nova.engine import animal_abilities as ab, animals_action as aa
from ark_nova.engine.actions import Action
from ark_nova.engine.game import apply, legal_actions
from ark_nova.engine.state import Building, Phase, Token

from tests.test_engine_turn import _animals_state

CARDS = data.cards_by_key()


def _zoo(card, hand=(), level=2, slot=5, **buildings):
    """Animals action at strength `slot`; `card` (and `hand`) in hand, a size-5 enclosure ready, plenty of money."""
    s = _animals_state(level=level, slot=slot)
    p = s.players[0]
    p.hand = [card] + list(hand)
    p.buildings = [Building(id=1, type="size-5", x=1, y=0), Building(id=2, type="size-5", x=3, y=0)]
    p.money = 60
    p.sponsors = ["S219"]                                                              # Diversity Researcher: no rock / water conditions (and a research icon)
    p.tokens.append(Token(700, "partner-Asia", "partner_1"))                          # a partner zoo
    return s


def _start(s):
    return apply(s, Action(0, "choose_action_card", {"type": "animals", "spend": 0}))


def _play(s, card, x=1, y=0, settle=True):
    s = apply(s, Action(0, "play_animal", {"card": card, "from_display": False, "x": x, "y": y}))
    while settle and s.prompt is not None and s.prompt.kind == "effects":          # the printed gains are effects of their own: take them first
        i = next((i for i, e in enumerate(s.prompt.args["pending"]) if e["kind"] == "gain"), None)
        if i is None:
            break
        e = s.prompt.args["pending"][i]
        s = apply(s, Action(0, "choose_effect", {"index": i, "apply": "gain", "res": e["res"]}))
    return s


def _resolve(s, **args):
    pending = s.prompt.args["pending"]
    e = next((i for i, x in enumerate(pending) if args.get("apply") == x["kind"]), 0) if "apply" in args else 0
    return apply(s, Action(s.prompt.player, "choose_effect", {"index": e, **args}))


def test_direct_gains_pack_petting_zoo_iconic_sprint_jumping_inventive():
    # Pack: 1 appeal per predator icon (the Lion itself counts)
    s0 = _zoo("A402")
    s0.players[0].animals = ["A401", "A407"]                                          # 3 predator icons: the Lion's condition
    s0 = _start(s0)
    a0 = s0.players[0].appeal
    s = _play(s0, "A402")
    assert s.players[0].icons["Predator"] >= 4 and s.players[0].appeal == a0 + CARDS["A402"]["appeal"] + s.players[0].icons["Predator"]
    # Sprint X: draw X cards
    want = dict(aa.abilities("A401"))["Sprint"]
    s0 = _start(_zoo("A401"))
    hand = len(s0.players[0].hand)
    s = _play(s0, "A401")
    s = _resolve(s, activate=True)                                                    # an effect of its own: drawing from the deck is irreversible
    assert len(s.players[0].hand) == hand - 1 + want
    # Jumping X: break token X spaces and X money
    n = dict(aa.abilities("A413"))["Jumping"]
    s0 = _start(_zoo("A413"))
    money, brk = s0.players[0].money, s0.break_position
    s = _play(s0, "A413")
    assert s.break_position == brk + n and s.players[0].money == money - aa.cost(s0, 0, "A413") + n
    # Inventive: 1 X token
    s0 = _start(_zoo("A414"))
    x = s0.players[0].x_tokens
    s = _play(s0, "A414")
    assert s.players[0].x_tokens == min(5, x + 1)


def test_posturing_and_peacocking_offer_free_buildings():
    s = _play(_start(_zoo("A497")), "A497")                                        # Lesser Flamingo: Posturing 1 (+ Perception 4)
    kinds = {(e["kind"], tuple(e.get("types", ()))) for e in s.prompt.args["pending"]}
    assert ("build", ("kiosk", "pavilion")) in kinds


def test_digging_discards_from_display_or_hand_and_draws():
    s0 = _start(_zoo("A435", hand=["A402"]))
    s = _play(s0, "A435")
    assert s.prompt.kind == "effects" and s.prompt.args["pending"][0]["kind"] == "digging"
    top = s.main_deck[0]
    s = _resolve(s, hand="A402")
    assert "A402" not in s.players[0].hand and top in s.players[0].hand and s.prompt.args["pending"][0]["n"] == dict(aa.abilities("A435"))["Digging"] - 1
    card = s.display[0]
    s = _resolve(s, display=card)
    assert card not in s.display[:1] or s.display[0] != card                        # the display moved up and was refilled
    assert len([c for c in s.display if c]) == 6 and card in s.main_discard


def test_scavenging_shuffles_the_discard_and_keeps_one():
    s0 = _start(_zoo("A490"))
    s0.main_discard = ["A402", "A403", "A404", "A405"]
    s = _play(s0, "A490")
    s = _resolve(s, activate=True)
    e = s.prompt.args["pending"][0]
    assert e["kind"] == "scavenge" and len(e["cards"]) == dict(aa.abilities("A490"))["Scavenging"]
    keep = e["cards"][0]
    s = _resolve(s, keep=keep)
    assert keep in s.players[0].hand and sorted(s.main_discard + [keep]) == sorted(["A402", "A403", "A404", "A405"] + [])


def test_flock_animal_shares_the_enclosure_of_a_herbivore():
    s = _zoo("A438")                                                                  # Reindeer: Flock Animal 3
    p = s.players[0]
    p.buildings[0].animal = "A439"                                                     # a herbivore in a size-5 enclosure
    p.animals = ["A439"]
    s = _start(s)
    xy = {(a.args["x"], a.args["y"]) for a in legal_actions(s) if a.kind == "play_animal"}
    assert (1, 0) in xy                                                                # the occupied enclosure
    s = _play(s, "A438")
    assert s.players[0].buildings[0].animals == ["A438"] and s.players[0].buildings[0].animal == "A439"


def test_camouflage_ignores_one_condition_of_the_next_animal():
    s = _zoo("A548", hand=["A412"])                                                   # Lined Seahorse, then Jaguar (needs an Americas icon)
    s.players[0].buildings.append(Building(id=3, type="small-aquarium", x=6, y=5))
    s = _start(s)
    assert not any(a.args["card"] == "A412" for a in legal_actions(s) if a.kind == "play_animal")
    s = _play(s, "A548", 6, 5)
    s = apply(s, Action(0, "skip_effect", {"index": 0})) if s.prompt.kind == "effects" else s
    while s.prompt.kind == "effects":
        s = apply(s, Action(0, "skip_effect", {"index": 0}))
    assert s.current_action["camouflage"] is True
    assert any(a.args["card"] == "A412" for a in legal_actions(s) if a.kind == "play_animal")


def test_trade_extra_shift_cut_down_and_assertion():
    s = _zoo("A531")                                                                   # Palette Surgeonfish: Trade (in an aquarium)
    s.players[0].buildings.append(Building(id=3, type="small-aquarium", x=6, y=5))
    s.players[0].x_tokens = 2
    s = _start(s)
    s = _play(s, "A531", 6, 5)
    money, x = s.players[0].money, s.players[0].x_tokens
    s = _resolve(s, trade="money")
    assert s.players[0].money == money + 5 and s.players[0].x_tokens == x - 1
    s = _zoo("A545")                                                                   # Longcomb Sawfish: Cut Down (needs a sea animal icon)
    p = s.players[0]
    p.animals = ["A530"]
    p.buildings.append(Building(id=3, type="large-aquarium", x=6, y=5))
    p.buildings.append(Building(id=4, type="size-2", x=0, y=8))
    s = _start(s)
    s = _play(s, "A545", 6, 5)
    money = s.players[0].money
    s = _resolve(s, building=[0, 8])
    assert s.players[0].money == money + 4 and all((b.x, b.y) != (0, 8) for b in s.players[0].buildings)
    s = _start(_zoo("A427"))                                                            # White Rhinoceros: Assertion
    s.base_projects_unused = ["P101", "P102"]
    s = _play(s, "A427")
    s = _resolve(s, card="P102")
    assert "P102" in s.players[0].hand and s.base_projects_unused == ["P101"]


def test_determination_and_action_x_give_a_second_action():
    s = _start(_zoo("A505"))                                                           # Bald Eagle: Determination
    s = _play(s, "A505")
    while s.prompt.kind == "effects":
        s = apply(s, Action(0, "skip_effect", {"index": 0}))
    s = apply(s, Action(0, "finish_animals", {})) if s.prompt.kind == "animals_play" else s
    assert s.prompt.kind == "choose_action_card" and s.prompt.player == 0 and "animals" not in s.prompt.args["only"]
    acts = legal_actions(s)                                                             # Determination: can be skipped, and any action can be put back for an X token
    assert any(a.kind == "skip_extra" for a in acts) and any(a.kind == "skip_action" for a in acts)
    x = s.players[0].x_tokens
    t = apply(s, Action(0, "skip_action", {"type": "sponsors"}))
    assert t.players[0].x_tokens == min(5, x + 1) and t.active_player == 1
    s = _start(_zoo("A430"))                                                           # Pygmy Hippopotamus: Action: Sponsors (optional)
    s = _play(s, "A430")
    s = apply(s, Action(0, "finish_animals", {})) if s.prompt.kind == "animals_play" else s
    assert s.prompt.args["only"] == ["sponsors"] and Action(0, "skip_extra", {}) in legal_actions(s)
    assert not any(a.kind == "skip_action" for a in legal_actions(s))                   # Action: X cannot be put back for an X token
    s = apply(s, Action(0, "skip_extra", {}))
    assert s.active_player == 1 and s.prompt.kind == "choose_action_card" and "only" not in s.prompt.args


def test_reef_dwellers_trigger_when_another_animal_enters_the_aquarium():
    s = _zoo("A530")                                                                   # Orange Clownfish: Reef Dweller: 2 appeal
    s.players[0].hand = ["A530", "A539"]
    s.players[0].buildings.append(Building(id=3, type="large-aquarium", x=6, y=5))
    s = _start(s)
    a0 = s.players[0].appeal
    s = _play(s, "A530", 6, 5)
    assert s.players[0].appeal == a0 + CARDS["A530"]["appeal"] + 2                     # its own Reef Dweller effect when it is played
    while s.prompt.kind == "effects":
        s = apply(s, Action(0, "skip_effect", {"index": 0}))
    a1 = s.players[0].appeal
    s = _play(s, "A539", 6, 5)                                                         # Filefish (a Reef Dweller) enters: the Clownfish triggers again
    assert s.players[0].appeal == a1 + CARDS["A539"]["appeal"] + 2


def test_glide_shark_attack_and_symbiosis_pending_effects():
    s = _zoo("A543", hand=["A535", "A402"])                                            # Coastal Manta Ray: Glide 3
    s.players[0].buildings.append(Building(id=3, type="large-aquarium", x=6, y=5))
    s = _start(s)
    s = _play(s, "A543", 6, 5)
    kinds = [e["kind"] for e in s.prompt.args["pending"]]
    assert "glide" in kinds
    i = kinds.index("glide")
    s = apply(s, Action(0, "choose_effect", {"index": i, "cards": ["A535"]}))            # one sea animal icon: one gain
    assert any(e["kind"] == "glide_gain" for e in s.prompt.args["pending"])
    i = next(i for i, e in enumerate(s.prompt.args["pending"]) if e["kind"] == "glide_gain")
    a0 = s.players[0].appeal
    s = apply(s, Action(0, "choose_effect", {"index": i, "gain": "appeal"}))
    assert s.players[0].appeal == a0 + 2


def test_pilfering_lets_the_opponent_choose_card_or_money():
    s = _zoo("A456")                                                                   # Barbary Macaque: Pilfering 1 (the opponent has more appeal)
    s.players[1].appeal = 50
    s.players[1].hand = ["A402"]
    s = _start(s)
    s = _play(s, "A456")
    e = s.prompt.args["pending"][0]
    assert e["kind"] == "pilfer" and e["player"] == 1
    acts = legal_actions(s)
    assert {a.player for a in acts if a.kind == "choose_effect"} == {1}
    s = apply(s, Action(1, "choose_effect", {"index": 0, "give": "A402"}))
    assert "A402" in s.players[0].hand and not s.players[1].hand


def test_pilfering_with_little_money_or_no_cards():
    def victim(money, hand):
        s = _zoo("A456")
        s.players[1].appeal, s.players[1].money, s.players[1].hand = 50, money, list(hand)
        s = _play(_start(s), "A456")
        return s, {tuple(sorted((a.args.get("give") or ("pay" if a.args.get("pay") else "nothing") for a in legal_actions(s) if a.kind == "choose_effect")))}
    assert victim(9, ["A402"])[1] == {("A402", "pay")}                                  # a choice
    assert victim(3, ["A402"])[1] == {("A402",)}                                        # short of money: a card
    assert victim(9, [])[1] == {("pay",)}                                               # no cards: 5 money
    s, _ = victim(3, [])                                                                # no cards, 3 money: the rest
    mine = s.players[0].money
    s = apply(s, Action(1, "choose_effect", {"index": 0, "pay": True}))
    assert s.players[1].money == 0 and s.players[0].money == mine + 3
    assert victim(0, [])[1] == {("nothing",)}


def test_all_animals_are_implemented():
    an = [k for k, c in CARDS.items() if k.startswith("A") and c.get("active", True)]
    assert all(aa.implemented(k) for k in an)


def _opponent_ahead(s, appeal=50, conservation=0):
    s.players[1].appeal, s.players[1].conservation = appeal, conservation
    return s


def test_venom_puts_tokens_on_the_cards_at_strength_1_and_2_when_the_opponent_is_ahead():
    s = _opponent_ahead(_zoo("A449"))                                                  # Platypus: Venom 1 -> the card at strength 1
    s = _play(_start(s), "A449", settle=False)
    kinds = [e["kind"] for e in s.prompt.args["pending"]]
    assert "gain" in kinds and "venom" in kinds                                         # two effects, in any order
    s = _resolve(s, **{"apply": "venom"})
    assert [c.tokens for c in s.players[1].action_cards] == [["Venom"], [], [], [], []]
    s2 = _opponent_ahead(_zoo("A449"), appeal=0)                                       # not ahead: nothing happens
    s2 = _play(_start(s2), "A449")
    s2 = _resolve(s2, **{"apply": "venom"})
    assert all(not c.tokens for c in s2.players[1].action_cards)
    s3 = _opponent_ahead(_zoo("A449"), appeal=5)                                       # the order matters: the printed appeal first can make the actor lead
    s3.players[0].appeal = 2
    s3 = _play(_start(s3), "A449", settle=False)
    s3 = _resolve(s3, **{"apply": "gain"})
    s3 = _resolve(s3, **{"apply": "venom"})
    assert all(not c.tokens for c in s3.players[1].action_cards)


def test_venom_is_paid_at_the_end_of_the_turn_unless_a_token_was_removed():
    s = _sponsor_state_for_venom()
    s.players[1].action_cards[0].tokens = ["Venom"]                                    # the card at strength 1 of the player to move
    s.players[1].action_cards[1].tokens = ["Venom"]
    money = s.players[1].money
    s = apply(s, Action(1, "skip_action", {"type": s.players[1].action_cards[3].type}))   # an action without a Venom card: 2 money
    assert s.players[1].money == money - 2 and [c.tokens for c in s.players[1].action_cards if c.tokens] == [["Venom"], ["Venom"]]
    s = _sponsor_state_for_venom()
    s.players[1].action_cards[0].tokens = ["Venom"]
    s.players[1].action_cards[1].tokens = ["Venom"]
    s = apply(s, Action(1, "skip_action", {"type": s.players[1].action_cards[0].type}))   # putting back a Venom card removes its token: nothing to pay
    assert s.players[1].money == 25 and sum(c.tokens.count("Venom") for c in s.players[1].action_cards) == 1


def _sponsor_state_for_venom():
    s = _zoo("A401")
    s.active_player = 1
    s.prompt.player = 1
    return s


def test_venom_blocks_drawing_cards_until_it_is_paid():
    s = _zoo("A401", level=1)
    s.players[0].action_cards[0].tokens = ["Venom"]
    s.players[0].money = 18                                                            # the Cheetah costs 17: 1 money left, Venom due
    s = _start(s)
    s = _play(s, "A401")
    assert s.players[0].money == 1
    assert not [a for a in legal_actions(s) if a.kind == "choose_effect" and a.args.get("activate")]      # Sprint draws cards: not allowed
    s = apply(s, Action(0, "skip_effect", {"index": 0}))
    s2 = _zoo("A401", level=1)
    s2.players[0].action_cards[0].tokens = ["Venom"]
    s2.players[0].money = 20                                                           # 3 left: Venom is paid first, then the cards are drawn
    s2 = _play(_start(s2), "A401")
    s2 = _resolve(s2, activate=True)
    assert s2.players[0].money == 1


def test_constriction_makes_cards_at_strength_5_and_4_weaker_by_2():
    s = _opponent_ahead(_python(), appeal=30, conservation=10)                         # Anaconda: Constriction
    s = _play(_start(s), "A482", 6, 5, settle=False)
    s = _resolve(s, **{"apply": "constrict"})
    assert [c.tokens for c in s.players[1].action_cards] == [[], [], [], ["Constriction"], ["Constriction"]]
    s1 = _opponent_ahead(_python(), appeal=30, conservation=0)                         # only one track: the card at strength 5
    s1 = _play(_start(s1), "A482", 6, 5, settle=False)
    s1 = _resolve(s1, **{"apply": "constrict"})
    assert [c.tokens for c in s1.players[1].action_cards] == [[], [], [], [], ["Constriction"]]
    s = _resolve(s, **{"apply": "gain"})
    s = apply(s, Action(0, "finish_animals", {})) if s.prompt.kind == "animals_play" else s
    while s.prompt.kind == "effects":
        s = apply(s, Action(0, "skip_effect", {"index": 0}))
    last = s.players[1].action_cards[4].type
    s = apply(s, Action(1, "choose_action_card", {"type": last, "spend": 0}))
    assert s.current_action["strength"] == 3 and not s.players[1].action_cards[4].tokens        # 5 - 2, the token is gone


def _python():
    s = _zoo("A482")
    s.players[0].buildings.append(Building(id=3, type="reptile-house", x=6, y=5))
    return s


def test_multiplier_token_repeats_the_action_and_is_used_up():
    from tests.test_engine_turn import _sponsor_state
    s = _sponsor_state(level=1, strength_slot=1)
    s.players[0].action_cards[0].tokens = ["Multiplier", "Multiplier"]
    money = s.players[0].money
    s = apply(s, Action(0, "choose_action_card", {"type": "sponsors", "spend": 0}))
    s = apply(s, Action(0, "sponsor_break", {}))
    assert s.prompt.args["repeat"] and s.prompt.args["only"] == ["sponsors"]            # once more, or decline
    assert Action(0, "skip_extra", {}) in legal_actions(s)
    s = apply(s, Action(0, "choose_action_card", {"type": "sponsors", "spend": 0}))
    assert s.players[0].action_cards[0].tokens == ["Multiplier"]                         # one token used up
    s = apply(s, Action(0, "sponsor_break", {}))
    s = apply(s, Action(0, "skip_extra", {}))                                           # the second token stays
    assert s.players[0].money == money + 2 and s.players[0].action_cards[0].type == "sponsors" and s.players[0].action_cards[0].tokens == ["Multiplier"]
    assert s.active_player == 1


def test_multiplier_can_put_the_card_back_several_times_for_x_tokens():
    from tests.test_engine_turn import _sponsor_state
    s = _sponsor_state(level=1)
    s.players[0].action_cards[4].tokens = ["Multiplier", "Multiplier"]
    s.players[0].x_tokens = 0
    s = apply(s, Action(0, "skip_action", {"type": "sponsors", "repeat": 2}))
    assert s.players[0].x_tokens == 3 and s.players[0].action_cards[0].tokens == []


def test_multiplier_abilities_place_the_token_on_the_named_action_card():
    s = _zoo("A434")                                                                    # Red Panda: Multiplier: Sponsors (needs 2 research icons)
    s.players[0].tokens.append(Token(801, "fac-science-science", "university_1"))
    s = _play(_start(s), "A434")
    assert next(c for c in s.players[0].action_cards if c.type == "sponsors").tokens == ["Multiplier"]


def test_hypnosis_lets_the_player_take_a_card_of_the_opponent_at_strength_1_to_3():
    s = _zoo("A485")                                                                    # Common European Adder: Hypnosis 3 (needs a partner zoo)
    s.players[0].buildings.append(Building(id=3, type="reptile-house", x=6, y=5))
    s.players[1].appeal = 5
    s.players[0].x_tokens = 2
    s = _play(_start(s), "A485", 6, 5)
    s = _resolve(s, **{"apply": "hypnosis"})
    while s.prompt.kind == "effects":
        s = apply(s, Action(0, "skip_effect", {"index": 0}))
    s = apply(s, Action(0, "finish_animals", {})) if s.prompt.kind == "animals_play" else s
    assert s.prompt.args["hypnosis"] and s.prompt.player == 0
    cards = [c.type for c in s.players[1].action_cards]
    acts = [a for a in legal_actions(s) if a.kind == "choose_action_card"]
    assert {a.args["type"] for a in acts} == set(cards[:3]) and max(a.args["spend"] for a in acts) == 2
    first = cards[0]
    s = apply(s, Action(0, "choose_action_card", {"type": first, "spend": 1, "hypnosis": True}))
    assert s.current_action["strength"] == 2 and s.current_action["seat"] == 0 and s.players[0].x_tokens == 1   # slot 1 + 1 X token
    if first == "cards":
        s = apply(s, Action(0, "take_cards", {"mode": "deck", "count": 1}))
    # the card of the other player goes back to slot 1 afterwards, and the other player moves on
    s2 = _zoo("A485")
    s2.players[0].buildings.append(Building(id=3, type="reptile-house", x=6, y=5))
    s2.players[1].appeal = 0                                                            # the opponent is behind: nothing happens
    s2 = _play(_start(s2), "A485", 6, 5)
    s2 = _resolve(s2, **{"apply": "hypnosis"})
    assert "extra" not in s2.current_action or not s2.current_action.get("extra")


def test_mark_puts_a_cube_on_a_display_animal_with_payment_and_handover():
    from ark_nova.engine import marks
    s = _zoo("A529")                                                                    # Magnificent Sea Anemone: Mark
    s.players[0].buildings.append(Building(id=3, type="small-aquarium", x=6, y=5))
    s = _play(_start(s), "A529", 6, 5)
    while s.prompt.kind == "effects":
        s = apply(s, Action(0, "skip_effect", {"index": 0}))
    s = apply(s, Action(0, "finish_animals", {})) if s.prompt.kind == "animals_play" else s
    assert s.prompt.kind == "effects" and s.prompt.args["pending"][0]["kind"] == "mark"
    target = next(c for c in s.display if c and c.startswith("A"))
    s = apply(s, Action(0, "choose_effect", {"index": 0, "card": target}))
    assert marks.owner(s, target) == 0 and target not in marks.markable(s)
    money = s.players[0].money
    s2 = copy_state(s)
    marks.taken(s2, target)                                                             # somebody takes it: 2 money for the owner
    assert s2.players[0].money == money + 2 and marks.owner(s2, target) is None
    s3 = copy_state(s)
    s3.display[s3.display.index(target)] = None
    marks.discard(s3, target)                                                           # it would be discarded: the owner gets it
    assert target in s3.players[0].hand and target not in s3.main_discard


def copy_state(s):
    import copy
    return copy.deepcopy(s)


def test_marketing_plays_a_sponsor_from_the_hand_for_its_strength():
    s = _zoo("A551", hand=["S241"])                                                    # Loggerhead Sea Turtle: Scuba Dive X + Marketing
    s.players[0].buildings.append(Building(id=3, type="large-aquarium", x=6, y=5))
    s.players[0].animals = ["A530"]
    s = _start(s)
    s = _play(s, "A551", 6, 5)
    kinds = [e["kind"] for e in s.prompt.args["pending"]]
    assert "marketing" in kinds
    i = kinds.index("marketing")
    money = s.players[0].money
    opts = [a.args["card"] for a in legal_actions(s) if a.kind == "choose_effect" and a.args.get("index") == i and "card" in a.args]
    assert "S241" in opts                                                              # strength 5, money enough, no requirements
    s = apply(s, Action(0, "choose_effect", {"index": i, "card": "S241"}))
    assert "S241" in s.players[0].sponsors and s.players[0].money == money - 5


def test_printed_gains_are_effects_resolvable_in_any_order():
    s = _play(_start(_zoo("A439")), "A439", settle=False)                               # Lama: printed appeal 4
    pending = s.prompt.args["pending"]
    gains = [i for i, e in enumerate(pending) if e["kind"] == "gain"]
    assert gains and all(not pending[i]["optional"] for i in gains)
    before = s.players[0].appeal
    s = apply(s, Action(0, "choose_effect", {"index": gains[-1], "apply": "gain", "res": pending[gains[-1]]["res"]}))
    assert s.players[0].appeal >= before


def test_animals4_places_a_mark_at_the_end_of_the_action():
    s = _zoo("A439")
    next(c for c in s.players[0].action_cards if c.type == "animals").variant = 4
    s = _play(_start(s), "A439")
    while s.prompt.kind == "effects" and not any(e["kind"] == "mark" for e in s.prompt.args["pending"]):
        s = apply(s, Action(0, "skip_effect", {"index": 0}))
    if s.prompt.kind == "animals_play":
        s = apply(s, Action(0, "finish_animals", {}))
    assert any(e["kind"] == "mark" for e in s.prompt.args["pending"])


def test_peaceful_mode_replaces_hostile_effects():
    assert {"Venom", "Constriction", "Pilfering 1", "Pilfering 2", "Hypnosis"} == ab.PEACEFUL
    s = _start(_zoo("A414"))
    eff = ab.peaceful_effects(s, 0, "A414", "Venom", 2)
    assert eff == [{"kind": "gain", "source": "A414", "res": "xtoken", "n": 2, "optional": False}]


def test_hypnosis_applies_constriction_and_clears_tokens_at_the_end():
    s = _zoo("A485")
    s.players[0].buildings.append(Building(id=3, type="reptile-house", x=6, y=5))
    s.players[1].appeal = 5
    s = _play(_start(s), "A485", 6, 5)
    s = _resolve(s, **{"apply": "hypnosis"})
    while s.prompt.kind == "effects":
        s = apply(s, Action(0, "skip_effect", {"index": 0}))
    s = apply(s, Action(0, "finish_animals", {})) if s.prompt.kind == "animals_play" else s
    card = s.players[1].action_cards[2]
    card.tokens = ["Constriction", "Venom"]
    s = apply(s, Action(0, "choose_action_card", {"type": card.type, "spend": 0, "hypnosis": True}))
    assert s.current_action["strength"] == 1                                            # slot 3 - 2 (min 1)
    t = s.players[1].action_cards
    assert "Constriction" in next(c for c in t if c.type == card.type).tokens
    from ark_nova.engine import venom
    c2 = next(c for c in s.players[1].action_cards if c.type == card.type)
    money = s.players[1].money
    venom.remove_tokens(s.players[1], c2, owner_paid=False)
    assert c2.tokens == [] and not s.players[1].flags.get("venom_removed") and s.players[1].money == money      # the owner pays nothing: not their turn


def test_animals1_single_animal_choice_before_playing_ignores_a_condition():
    s = _zoo("A439", level=1, slot=5)
    next(c for c in s.players[0].action_cards if c.type == "animals").variant = 1
    s = _start(s)
    assert Action(0, "animals_single", {}) in legal_actions(s)
    s = apply(s, Action(0, "animals_single", {}))
    assert not any(a.kind == "animals_single" for a in legal_actions(s))
    s = _play(s, "A439")
    while s.prompt.kind == "effects":
        s = apply(s, Action(0, "skip_effect", {"index": 0}))
    assert s.prompt.kind != "animals_play" or not any(a.kind == "play_animal" for a in legal_actions(s))      # only one animal
