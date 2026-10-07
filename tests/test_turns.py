"""Live play: the turn waits for a confirm and can be taken back (engine/turns.py)."""
import random

from ark_nova.engine.actions import Action
from ark_nova.engine.game import IllegalAction, apply, legal_actions, new_game
from ark_nova.engine.state import Phase

REWIND = ("undo_last", "restart_turn")


def _game(seed=1, confirm=True, mw=False):
    return new_game({"game_mode": "random-mirrored", "marine_worlds_flag": mw, "confirm_turns": confirm}, ["1", "2"], seed)


def _step(st, rng, kinds=None, avoid=REWIND):
    """One random legal move that is not one of `avoid` (None when the engine has nothing or hits an unwritten rule)."""
    acts = [a for a in legal_actions(st) if a.kind not in avoid and (kinds is None or a.kind in kinds)]
    if not acts:
        return None
    a = rng.choice(acts)
    try:
        return a, apply(st, a)
    except NotImplementedError:
        return None


def test_the_turn_waits_for_the_confirm_and_then_passes():
    rng = random.Random(3)
    st = _game()
    seen_confirm = 0
    for _ in range(600):
        was = (st.active_player, st.turn)
        r = _step(st, rng)
        if r is None:
            break
        a, st = r
        if st.prompt is not None and st.prompt.kind == "confirm_turn":
            seen_confirm += 1
            assert (st.active_player, st.turn) == was or a.kind == "confirm_turn"     # nothing has passed: the same player, the same turn
            assert st.phase in (Phase.TURN, Phase.FINAL_TURNS)
            assert any(x.kind == "confirm_turn" and x.player == st.prompt.player for x in legal_actions(st))
            nxt = apply(st, next(x for x in legal_actions(st) if x.kind == "confirm_turn"))
            assert nxt.turn == st.turn + 1 and nxt.active_player == 1 - st.active_player and nxt.checkpoint is None or nxt.checkpoint["actions"] == []
            st = nxt
    assert seen_confirm >= 5


def test_undo_gives_back_exactly_the_state_before_the_last_move_and_restart_the_turn_start():
    rng = random.Random(4)
    st = _game(seed=2)
    history = [st]                                                                       # the states since the turn's checkpoint (the last one is the current state)
    undone = restarted = 0
    for _ in range(900):
        offered = {a.kind: a for a in legal_actions(st) if a.kind in REWIND}
        roll = rng.random()
        if offered and roll < 0.25:
            if "undo_last" in offered and (roll < 0.15 or "restart_turn" not in offered):
                back = apply(st, offered["undo_last"])
                history.pop()
                assert back.to_dict() == history[-1].to_dict()
                st = back
                undone += 1
            else:
                back = apply(st, offered["restart_turn"])
                assert back.to_dict() == history[0].to_dict()
                st = back
                history = [st]
                restarted += 1
            continue
        r = _step(st, rng)
        if r is None:
            break
        st = r[1]
        if st.checkpoint is not None and st.checkpoint["actions"] == []:           # a checkpoint was just made: the turn start or an irreversible move
            history = [st]
        else:
            history.append(st)
    assert undone >= 3 and restarted >= 2


def test_taking_back_twice_goes_back_two_moves():
    rng = random.Random(7)
    st = _game(seed=3)
    states = [st]
    for _ in range(400):
        offered = [a for a in legal_actions(st) if a.kind == "undo_last"]
        if offered and len(st.checkpoint["actions"]) >= 2:
            first = apply(st, offered[0])
            second = apply(first, next(a for a in legal_actions(first) if a.kind == "undo_last")) if first.checkpoint["actions"] else first
            assert first.to_dict() == states[-2].to_dict()
            assert second.to_dict() == states[-3].to_dict() or not first.checkpoint["actions"]
            return
        r = _step(st, rng)
        if r is None:
            break
        st = r[1]
        states.append(st)
    raise AssertionError("no turn with two reversible moves was found")


def test_a_move_that_draws_cards_cannot_be_taken_back():
    rng = random.Random(5)
    st = _game(seed=6)
    for _ in range(900):
        r = _step(st, rng, kinds=None)
        if r is None:
            break
        a, nxt = r
        if len(nxt.main_deck) != len(st.main_deck):
            assert nxt.checkpoint["actions"] == []                                # the draw is the new checkpoint
            assert not [x for x in legal_actions(nxt) if x.kind in REWIND]
            return
        st = nxt
    raise AssertionError("no move drew a card")


def test_a_replay_game_is_unchanged():
    rng = random.Random(8)
    st = _game(confirm=False)
    for _ in range(300):
        assert not [a for a in legal_actions(st) if a.kind in REWIND + ("confirm_turn",)]
        r = _step(st, rng)
        if r is None:
            break
        st = r[1]
        assert st.checkpoint is None and (st.prompt is None or st.prompt.kind != "confirm_turn")


def test_only_the_player_whose_turn_it_is_can_take_it_back_and_only_when_there_is_something_to_take_back():
    st = _game(seed=9)
    rng = random.Random(1)
    while not st.checkpoint or not st.checkpoint["actions"]:
        r = _step(st, rng)
        assert r is not None
        st = r[1]
    offered = [a for a in legal_actions(st) if a.kind in REWIND]
    assert {a.player for a in offered} == {st.active_player}
    bogus = type(offered[0])(1 - st.active_player, "undo_last", {})
    try:
        apply(st, bogus)
    except IllegalAction:
        pass
    else:
        raise AssertionError("the other player could take the turn back")


def test_a_state_never_shares_its_prompt_with_the_dict_it_was_built_from():
    """The bug self-play found: `from_dict` handed the prompt's lists to the state, so a later move changed the checkpoint it came from and an undo failed."""
    from ark_nova.engine.state import GameState
    st = _game(seed=1)
    d = st.to_dict()
    snapshot = json_copy(d)
    rebuilt = GameState.from_dict(d)
    rebuilt.prompt.args["probe"] = ["x"]
    rebuilt.checkpoint = {"state": d, "actions": []} if rebuilt.checkpoint is None else rebuilt.checkpoint
    assert d == snapshot


def json_copy(x):
    import json
    return json.loads(json.dumps(x))


def test_undo_survives_moves_that_change_the_prompt_in_place():
    """Level II animals: the prompt lists the animals played so far and is changed in place by every animal; taking the turn back must not keep them."""
    rng = random.Random(36)
    st = _game(seed=36)
    for _ in range(2600):
        acts = legal_actions(st)
        if not acts:
            break
        plain = [a for a in acts if a.kind not in REWIND]
        rewind = [a for a in acts if a.kind in REWIND]
        a = rng.choice(rewind if rewind and (rng.random() < 0.04 or not plain) else plain)
        st = apply(st, a)                                                                   # (the seed that used to end in an IllegalAction at an undo)
    assert True


def test_random_games_never_end_in_a_position_without_a_move():
    """The dead ends self-play found: no place for a bonus building, an empty draw pile with cards in the discard pile, an animals action with nothing to play,
    a Hire Association task without a worker left (seeds 129, 192, 128, 928 and 540)."""
    for seed, mw, mode in ((129, False, "random-mirrored"), (192, False, "random-mirrored"), (128, False, "random-mirrored"), (928, True, "free-select"), (540, True, "random-mirrored")):
        rng = random.Random(seed)
        st = new_game({"game_mode": mode, "marine_worlds_flag": mw, "confirm_turns": True}, ["1", "2"], seed)
        for _ in range(4000):
            acts = legal_actions(st)
            if st.phase is Phase.OVER:
                break
            assert acts, f"seed {seed}: no move at prompt {st.prompt.kind if st.prompt else None}"
            plain = [a for a in acts if a.kind not in REWIND]
            rewind = [a for a in acts if a.kind in REWIND]
            st = apply(st, rng.choice(rewind if rewind and (rng.random() < 0.04 or not plain) else plain))


def _until_both_discard(seed=1, kinds=("break_discard",)):
    """A random game up to the first position in which both players have a discard to make."""
    rng = random.Random(seed)
    st = _game(seed=seed)
    for _ in range(3000):
        pr = st.prompt
        if pr is not None and pr.kind == "effects":
            who = {e.get("player") for e in pr.args["pending"] if e["kind"] in kinds}
            if who == {0, 1}:
                return st
        acts = legal_actions(st)
        plain = [a for a in acts if a.kind not in REWIND]
        st = apply(st, rng.choice(plain or acts))
    raise AssertionError("no position with two discards")


def test_both_players_discard_at_once_and_each_sees_their_own_discard():
    from ark_nova.live import projection
    st = _until_both_discard()
    views = projection.views(st)
    assert views["0"]["view"]["to_act"] == views["1"]["view"]["to_act"] == [0, 1]
    for seat in (0, 1):
        d = views[str(seat)]["decision"]
        assert d["options"]["seat"] == seat and d["options"]["discard"]["count"] == st.players[seat].hand.__len__() - __import__("ark_nova.engine.breaks", fromlist=["x"]).hand_limit(st.players[seat])
        assert {a["player"] for a in d["actions"]} == {seat}
    # one player discards: the other one is waited for, and a move made on the older position is still taken
    first = next(a for a in legal_actions(st) if a.player == 1 and a.kind == "choose_effect")
    second = next(a for a in legal_actions(st) if a.player == 0 and a.kind == "choose_effect")
    after = apply(st, first)
    from ark_nova.live.service import simultaneous_match
    again = simultaneous_match(after, second)
    assert again is not None and again.player == 0 and again.args["cards"] == second.args["cards"]
    assert any(a == again for a in legal_actions(after))
    done = apply(after, again)
    assert done.prompt is None or done.prompt.kind != "effects" or not [e for e in done.prompt.args["pending"] if e["kind"] == "break_discard"]


def test_a_move_on_an_old_position_is_refused_outside_the_simultaneous_prompts():
    from ark_nova.live.service import simultaneous_match
    rng = random.Random(3)
    st = _game(seed=3)
    while st.phase is Phase.SETUP:
        st = apply(st, rng.choice(legal_actions(st)))
    act = next(a for a in legal_actions(st) if a.kind == "choose_action_card")
    assert simultaneous_match(st, act) is None


def test_the_engines_own_statistics_add_up_and_a_taken_back_move_leaves_none():
    """`GameState.stats` (engine/gamestats.py): the points of the sources are the score; undo and restart take the numbers back with the state; a concession ends the game."""
    from ark_nova.engine import gamestats
    rng = random.Random(11)
    st = _game(seed=11)
    for _ in range(1500):
        acts = legal_actions(st)
        if st.phase is Phase.OVER or not acts:
            break
        plain = [a for a in acts if a.kind not in REWIND]
        rewind = [a for a in acts if a.kind in REWIND]
        if rewind and rng.random() < 0.1:
            st = apply(st, rewind[0])                                  # (the checkpoint state holds its own stats: a move taken back leaves none)
            assert [sum(s["points"].values()) for s in st.stats] == [x - s["start"] for x, s in zip(gamestats.scores(st), st.stats)]
            continue
        st = apply(st, rng.choice(plain or acts))
        assert [sum(s["points"].values()) for s in st.stats] == [x - s["start"] for x, s in zip(gamestats.scores(st), st.stats)]
    assert sum(s["turns"] for s in st.stats) > 5 and sum(sum(s["actions"].values()) for s in st.stats) > 5
    over = apply(st, Action(st.active_player, "concede", {})) if st.phase is not Phase.OVER else st
    assert over.phase is Phase.OVER and over.prompt is None
    if st.phase is not Phase.OVER:
        assert over.result.conceded == st.active_player and over.result.winner == 1 - st.active_player and over.result.scores == gamestats.scores(st)
    try:
        apply(over, Action(0, "concede", {}))
    except IllegalAction:
        pass
    else:
        raise AssertionError("a finished game cannot be conceded")


def test_the_player_who_concedes_loses_even_with_the_higher_score():
    import copy
    rng = random.Random(2)
    st = _game(seed=2)
    while st.phase is Phase.SETUP:
        st = apply(st, rng.choice(legal_actions(st)))
    st = copy.deepcopy(st)
    st.players[0].appeal, st.players[1].appeal = 40, 5
    over = apply(st, Action(0, "concede", {}))                       # seat 0 leads by far and gives up
    assert over.result.scores[0] > over.result.scores[1]
    assert over.result.winner == 1 and over.result.conceded == 0
    st.players[0].appeal = st.players[1].appeal = 7                    # equal scores: still no tie
    assert apply(st, Action(1, "concede", {})).result.winner == 0
