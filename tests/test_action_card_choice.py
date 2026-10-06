"""An action card without any legal move cannot be chosen at the start of a turn (it can still be put back with `skip_action`)."""
import copy

from ark_nova.engine.game import legal_actions
from ark_nova.parser import parse_log
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log


def _state():
    parsed = parse_log("log_examples/801016546.json")
    setup, cfg, seed = game_from_log(parsed)
    st = copy.deepcopy(build_replay(parsed, setup, cfg, seed).turn_snapshots[10])
    st.prompt.player = st.active_player
    return st


def _types(state) -> set:
    return {a.args["type"] for a in legal_actions(state) if a.kind == "choose_action_card"}


def test_association_cannot_be_chosen_without_a_worker():
    st = _state()
    p = st.players[st.active_player]
    assert "association" in _types(st)
    p.tokens = [t for t in p.tokens if t.type != "worker"]
    assert "association" not in _types(st)
    assert any(a.kind == "skip_action" and a.args["type"] == "association" for a in legal_actions(st))      # (it can still be put back for an X token)


def test_build_and_animals_cannot_be_chosen_without_money_or_cards():
    st = _state()
    p = st.players[st.active_player]
    p.hand, p.money = [], 0
    assert _types(st) <= {"cards", "sponsors", "association"}


def test_several_placement_bonuses_of_one_building_are_effects_of_their_own():
    """A building that covers 2 placement bonuses leaves them pending (any order) instead of paying them at once."""
    from ark_nova.engine import game
    from ark_nova.engine.game import board
    from ark_nova.engine import build_action
    st = _state()
    p = st.players[0]
    p.map_id = "3"
    bd = board("3")
    t, (x, y, k) = "size-2", next(c for c in build_action.valid_placements(bd, [], "size-2", 2)
                                  if len(build_action.placement_bonuses(bd, build_action.footprint("size-2", *c))) > 1)
    p.buildings = []
    money, rep = p.money, p.reputation
    st.current_action = {"seat": 0, "type": "build"}
    game._put_building(st, 0, t, x, y, k)
    pend = [e for e in st.current_action["threshold"] if e["kind"] == "pbonus"]
    assert sorted(e["bonus"]["type"] for e in pend) == ["money", "reputation"]
    assert (p.money, p.reputation) == (money, rep)                       # nothing is paid until the player resolves them
