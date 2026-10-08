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
        if a.kind in ("initial_discard", "discard_cards"):
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
