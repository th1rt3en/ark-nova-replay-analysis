"""Map 10 (Rescue Station): the digging of the map may rescue an animal into the Rescued zone, three at most; after that it is a normal digging."""
import pytest

from ark_nova.engine.actions import Action
from ark_nova.engine.game import IllegalAction, apply, legal_actions
from tests.test_animal_abilities import _play, _start, _zoo

ANIMALS = ["A401", "A403", "A404", "A405"]                  # none of them is a petting zoo animal


def _digging(rescued: int):
    """A state with a pending map 10 digging effect of a player who has already rescued `rescued` animals."""
    s = _start(_zoo("A435", hand=["A402"]))                  # (a digging ability to get an open effects prompt)
    s = _play(s, "A435")
    p = s.players[0]
    p.map_id = "10"
    p.rescued = ANIMALS[:rescued]
    e = s.prompt.args["pending"][0]
    assert e["kind"] == "digging"
    e["rescue"] = True                                       # as the Digging hex of map 10 defers it (an effect that has to be done)
    e["optional"] = False
    e["n"] = 1
    return s


def _rescues(s):
    return [a for a in legal_actions(s) if a.kind == "choose_effect" and a.args.get("rescue")]


def _normal(s):
    return [a for a in legal_actions(s) if a.kind == "choose_effect" and a.args.get("index") == 0 and ("display" in a.args or "hand" in a.args) and not a.args.get("rescue")]


@pytest.mark.parametrize("rescued", [0, 1, 2])
def test_while_the_zone_has_room_the_digging_may_rescue(rescued):
    s = _digging(rescued)
    assert _rescues(s) and _normal(s)                         # both: a rescue, or the normal digging
    pick = next(a for a in _rescues(s) if "display" in a.args)
    s = apply(s, pick)
    assert len(s.players[0].rescued) == rescued + 1 and pick.args["display"] in s.players[0].rescued


@pytest.mark.parametrize("rescued", [3, 4])
def test_with_three_rescued_animals_the_digging_is_a_normal_digging(rescued):
    s = _digging(rescued)
    assert _rescues(s) == [] and _normal(s)                   # no rescue is offered any more, the normal digging still is (and must be done: the effect is not optional)
    assert not any(a.kind == "skip_effect" for a in legal_actions(s))
    forced = Action(0, "choose_effect", {"index": 0, "display": next(c for c in s.display if c), "rescue": True})
    with pytest.raises(IllegalAction):
        apply(s, forced)                                      # a rescue that is sent anyway is refused
    card = next(c for c in s.display if c)
    done = apply(s, Action(0, "choose_effect", {"index": 0, "display": card}))
    assert len(done.players[0].rescued) == rescued and card in done.main_discard       # the card was discarded, nothing was rescued
