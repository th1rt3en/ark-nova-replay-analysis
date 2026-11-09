"""The live game log in BGA's words, and what each viewer may read of it (src/ark_nova/live/bgalog.py)."""
import random

from ark_nova.engine.game import apply, legal_actions, new_game
from ark_nova.live import bgalog

NAMES = ["Alice", "Bob"]


def _game(seed, steps):
    rng = random.Random(seed)
    st = new_game({"game_mode": "random-mirrored", "marine_worlds_flag": False, "confirm_turns": True}, ["1", "2"], seed)
    for _ in range(steps):
        acts = legal_actions(st)
        if not acts:
            return
        a = rng.choice([x for x in acts if x.kind not in ("undo_last", "restart_turn")] or acts)
        new = apply(st, a)
        yield st, a, new, bgalog.texts(st, a, new, NAMES)
        st = new


def test_sentences_follow_the_bga_templates():
    seen = set()
    for _, a, _, t in _game(3, 500):
        full = t["full"]
        if a.kind == "choose_action_card":
            assert " chooses action card " in full and " with strength " in full
        if a.kind == "play_animal":
            assert " for " in full and " and places it in " in full
        if a.kind == "take_cards" and a.args.get("mode") == "deck":
            assert " from the deck" in full
        seen.add(a.kind)
    assert {"choose_action_card", "take_cards"} <= seen


def test_cards_of_a_private_draw_or_discard_are_only_read_by_their_owner():
    checked = 0
    for old, a, new, t in _game(7, 900):
        mine, theirs = str(a.player), str(1 - a.player)
        if a.kind == "take_cards" and a.args.get("mode") == "deck":
            drawn = set(new.players[a.player].hand) - set(old.players[a.player].hand)
            for c in drawn:
                assert bgalog.card(c) in t[mine] and bgalog.card(c) not in t[theirs] and bgalog.card(c) not in t["spectator"]
                checked += 1
            assert t[theirs].startswith(f"{NAMES[a.player]} draws ") and "card(s) from the deck" in t[theirs]
        if a.kind == "initial_discard":                   # (short for everyone: "X discards 4 cards")
            assert all(t[v].split(chr(10))[0] == f"{NAMES[a.player]} discards {len(a.args['cards'])} cards" for v in (mine, theirs, "spectator"))       # (the display refill that follows the second discard has a line of its own)
        if a.kind == "discard_cards":
            for c in a.args["cards"]:
                assert bgalog.card(c) in t[mine] and bgalog.card(c) not in t[theirs] and bgalog.card(c) not in t["spectator"]
                checked += 1
    assert checked > 10


def test_a_card_that_is_played_or_taken_from_the_display_is_public():
    for old, a, new, t in _game(11, 900):
        if a.kind in ("play_animal", "play_sponsor"):
            assert bgalog.card(a.args["card"]) in t[str(1 - a.player)] and bgalog.card(a.args["card"]) in t["spectator"]
        if a.kind == "take_cards" and a.args.get("mode") in ("snap", "range"):
            assert bgalog.card(a.args["card"]) in t[str(1 - a.player)]


def test_a_played_sponsor_logs_every_gain_it_brings_even_when_money_is_gained():
    """Federal Grants gives money on play: the line must not net the gain against a payment that was never made."""
    checked = 0
    for seed in range(1, 40):
        for old, a, new, t in _game(seed, 600):
            if a.kind != "play_sponsor":
                continue
            seat = a.player
            paid = old.display.index(a.args["card"]) + 1 if a.args.get("from_display") else 0
            gained = new.players[seat].money - old.players[seat].money + paid
            if gained > 0:
                assert f"gains {gained} money" in t["full"] or f"{gained} money" in t["full"], (seed, t["full"])
                checked += 1
    assert checked, "no sponsor with a money gain was played in the sample games"


def test_a_building_over_a_placement_bonus_logs_the_gain_and_the_real_price():
    seen = 0
    for seed in range(1, 40):
        for old, a, new, t in _game(seed, 600):
            if a.kind != "place_building":
                continue
            gain = bgalog._placement_gains(old, a.player, a.args)
            for res, n in gain.items():
                word = "xtoken" if res == "x_tokens" else res
                assert f"gains {n} {word} (placement bonus)" in t["full"], (seed, t["full"])
                seen += 1
            if a.args["type"] == "pavilion":
                assert "gains 1 appeal (pavilion)" in t["full"]
    assert seen, "no building covered a simple placement bonus in the sample games"


def test_a_wave_card_among_the_replenished_cards_triggers_its_own_wave_with_its_own_lines():
    from types import SimpleNamespace
    from ark_nova import data
    from ark_nova.live.bgalog import Lines, _display_refill
    plain = [k for k, c in data.cards_by_key().items() if k.startswith("A") and not c.get("wave")][:8]
    wave = next(k for k, c in data.cards_by_key().items() if k.startswith("A") and c.get("wave"))
    old = SimpleNamespace(display=plain[:3] + [None] * 3, main_deck=[plain[3], wave, plain[4], plain[5], plain[6]])
    new = SimpleNamespace(display=[plain[2], plain[3], wave, plain[4], plain[5], plain[6]], main_deck=[])
    L = Lines(0, 'X')
    _display_refill(old, new, L, start=plain[1:3])
    text = " | ".join(i[2] for i in L.items)
    assert "has a Wave icon" in text and text.count("replenished with") == 2
