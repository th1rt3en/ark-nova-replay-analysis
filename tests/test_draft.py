"""The action card variant draft at the start of a new game."""
import copy

import pytest

from ark_nova.engine import draft
from ark_nova.engine.actions import Action
from ark_nova.engine.game import IllegalAction, apply, deck_cards, legal_actions, start_game
from ark_nova.engine.state import GameConfig, Phase, SeedSpec


def _config():
    base = deck_cards("base_project", True)[:3]
    return GameConfig(marine_worlds=True, player_ids=["a", "b"], maps=["1", "1"], base_projects=base, draft_action_cards=True)


def _new(seed=1):
    return start_game(_config(), SeedSpec(tail_seed=seed))


def _pick_first(s):
    for seat in (0, 1):
        s = apply(s, next(a for a in legal_actions(s) if a.player == seat))
    return s


def test_the_game_starts_with_the_draft_and_nothing_is_dealt():
    s = _new()
    d = s.draft
    assert s.phase is Phase.SETUP and s.prompt.kind == "draft" and d["stage"] == "pick1"
    assert [len(o) for o in d["offers"]] == [3, 3] and len(d["pool"]) == 14
    assert len(set(d["offers"][0] + d["offers"][1] + d["pool"])) == 20            # every variant exists once
    assert all(not p.hand for p in s.players) and not s.display[0]
    assert {a.kind for a in legal_actions(s)} == {"draft_pick"} and len(legal_actions(s)) == 6    # both players choose at the same time


def test_a_pick_waits_for_the_other_player_and_cannot_be_repeated():
    s = _new()
    a = next(a for a in legal_actions(s) if a.player == 0)
    s = apply(s, a)
    assert s.draft["stage"] == "pick1" and s.draft["choice"][0] == a.args["variant"]
    assert all(x.player == 1 for x in legal_actions(s))
    with pytest.raises(IllegalAction):
        apply(s, a)
    with pytest.raises(IllegalAction):
        apply(s, Action(1, "draft_pick", {"variant": s.draft["offers"][0][0]}))       # not offered to this player


def test_picks_pass_the_rest_to_the_opponent_and_each_player_ends_with_three():
    s = _new()
    o0, o1 = s.draft["offers"]
    s = apply(s, Action(0, "draft_pick", {"variant": o0[0]}))
    s = apply(s, Action(1, "draft_pick", {"variant": o1[1]}))
    d = s.draft
    assert d["stage"] == "pick2" and d["picked"] == [[o0[0]], [o1[1]]]
    assert d["offers"] == [[o1[0], o1[2]], [o0[1], o0[2]]]                              # the 2 that the opponent passed
    s = apply(s, Action(0, "draft_pick", {"variant": d["offers"][0][0]}))
    s = apply(s, Action(1, "draft_pick", {"variant": d["offers"][1][1]}))
    d = s.draft
    assert d["stage"] == "keep" and [len(o) for o in d["offers"]] == [3, 3]
    assert d["offers"][0][:1] == [o0[0]] and d["offers"][1][:1] == [o1[1]]
    assert sorted(d["offers"][0] + d["offers"][1]) == sorted(o0 + o1)                    # the 6 dealt variants, nothing lost


def _to_keep(s):
    s = _pick_first(s)
    return _pick_first(s)


def test_keep_needs_two_different_actions_and_ends_the_draft_with_the_deal():
    s = _to_keep(_new(3))
    for a in legal_actions(s):
        assert a.kind == "draft_keep" and len({draft.variant_type(v) for v in a.args["keep"]}) == 2
    mine = s.draft["offers"][0]
    same = [list(c) for c in ((mine[0], mine[1]), (mine[0], mine[2]), (mine[1], mine[2])) if draft.variant_type(c[0]) == draft.variant_type(c[1])]
    for keep in same:
        with pytest.raises(IllegalAction):
            apply(s, Action(0, "draft_keep", {"keep": keep}))
    kept = []
    for seat in (0, 1):
        a = next(a for a in legal_actions(s) if a.player == seat)
        kept.append(a.args["keep"])
        s = apply(s, a)
    assert s.draft["stage"] == "done" and s.draft["kept"] == kept
    assert s.prompt.kind == "initial_discard" and all(len(p.hand) == 8 for p in s.players)            # the deal follows the draft
    for seat, p in enumerate(s.players):
        assert sorted(c.type for c in p.action_cards) == sorted(draft.ACTION_TYPES)
        assert p.action_cards[0].type == "animals"                                       # the Animals card always starts at strength 1
        got = {c.type: c.variant for c in p.action_cards if c.variant}
        assert got == {draft.variant_type(v): draft.variant_number(v) for v in kept[seat]}              # kept variants on their cards, the other 3 standard


def test_the_extra_variant_is_added_directly_when_a_hand_is_one_type():
    s = _new(2)
    d = s.draft
    d["stage"] = "keep"
    d["offers"] = [["build1", "build3", "build4"], ["animals1", "cards2", "sponsors3"]]
    d["pool"] = [v for v in draft.all_variants() if v not in d["offers"][0] + d["offers"][1]]
    draft._complete_single_type(s)
    assert len(d["offers"][0]) == 4 and d["auto"][0] is not None and not d["auto"][0].startswith("build")
    assert d["auto"][0] not in d["pool"] and d["auto"][1] is None and len(d["offers"][1]) == 3
    pairs = [a.args["keep"] for a in legal_actions(s) if a.player == 0]
    assert pairs and all(d["auto"][0] in k for k in pairs)                   # the only way to 2 different actions


def test_the_draft_is_deterministic():
    a, b = _new(9), _new(9)
    assert a.to_dict() == b.to_dict()
    assert _new(10).draft["offers"] != a.draft["offers"] or _new(11).draft["offers"] != a.draft["offers"]


def test_the_strength_order_is_only_drawn_when_the_draft_is_over():
    s = start_game(_config(), SeedSpec(tail_seed=5))
    assert [c.type for c in s.players[0].action_cards] == list(draft.ACTION_TYPES)        # not shuffled yet: the draft is running
    assert s.draft["stage"] != "done"


def test_the_draft_belongs_to_marine_worlds():
    import pytest
    cfg = _config()
    cfg.marine_worlds = False
    with pytest.raises(ValueError):
        start_game(cfg, SeedSpec(tail_seed=5))
