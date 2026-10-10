"""The bonuses of the partner zoo spaces on the association board of the zoo map: the 3rd partner zoo hires a worker on every map, the 4th gives the map's conservation points."""
import glob
from pathlib import Path

import pytest

from ark_nova.engine import association
from ark_nova.engine.actions import Action
from ark_nova.engine.game import apply
from ark_nova.engine.state import Token
from test_engine_turn import _association_state

MAPS = sorted(Path(f).stem for f in glob.glob(str(Path(__file__).resolve().parents[1] / "data_manual" / "maps_geometry" / "*.json")))


def in_action():
    """A state in the middle of the player's Association action: the space bonuses become pending effects there."""
    return apply(_association_state(), Action(0, "choose_action_card", {"type": "association", "spend": 0}))


def partner(n: int, continent: str) -> Token:
    return Token(700 + n, f"partner-{continent}", "association_3")


def workers(p, prefix: str) -> int:
    return len([t for t in p.tokens if t.type == "worker" and t.location.startswith(prefix)])


@pytest.mark.parametrize("map_id", MAPS)
def test_the_third_partner_zoo_hires_a_worker_and_the_fourth_scores_conservation(map_id):
    s = in_action()
    p = s.players[0]
    p.map_id = map_id
    lying, active = workers(p, "supply_"), workers(p, "reserve") + workers(p, "association_")
    for n, continent in enumerate(("Africa", "Asia"), 1):
        association.place_partner(s, p, partner(n, continent))
    assert (workers(p, "supply_"), workers(p, "reserve") + workers(p, "association_")) == (lying, active)          # the 1st and 2nd partner zoo hire nobody
    association.place_partner(s, p, partner(3, "Europe"))
    assert workers(p, "supply_") == lying - 1 and workers(p, "reserve") + workers(p, "association_") == active + 1       # the 3rd one: a lying worker joins the active ones
    before = p.conservation
    association.place_partner(s, p, partner(4, "Americas"))
    assert p.conservation - before == association.map_bonus(map_id, "partner4")                                        # the 4th one: the map's conservation points
    assert workers(p, "supply_") == lying - 1                                                                        # and no further worker


def test_a_third_partner_zoo_with_no_worker_left_to_hire_still_places():
    s = in_action()
    p = s.players[0]
    for t in p.tokens:
        if t.type == "worker" and t.location.startswith("supply_"):
            t.location = "reserve"                                                                               # every worker is already active
    for n, continent in enumerate(("Africa", "Asia", "Europe"), 1):
        association.place_partner(s, p, partner(n, continent))
    assert len([t for t in p.tokens if t.location.startswith("partner_")]) == 3


def _pairs(map_id, order):
    """The conservation each placement gives on `map_id`, placing partner zoos / universities in `order` (a string of p and u)."""
    s = in_action()
    p = s.players[0]
    p.map_id = map_id
    seen, out = {"p": 0, "u": 0}, []
    for what in order:
        before = p.conservation
        seen[what] += 1
        if what == "p":
            association.place_partner(s, p, partner(seen["p"], ("Africa", "Asia", "Europe", "Americas")[seen["p"] - 1]))
        else:
            association.place_university(s, p, Token(800 + seen["u"], ("fac-science-rep", "fac-science-money", "fac-science-xtoken")[seen["u"] - 1], "association_4"))
        out.append(p.conservation - before)
    return out


@pytest.mark.parametrize("order", ["pppuuu", "uuuppp", "pupupu", "ppuupu"])
def test_on_map_11_the_third_partner_zoo_university_pair_gives_one_conservation(order):
    got = _pairs("11", order)
    uni3 = association.map_bonus("11", "university3")
    # the third pair completes with the last placement of the two kinds that reaches 3 of both; the 3rd university also pays its own conservation of the map
    completing = max(i for i, ch in enumerate(order) if ch in "pu" and order[: i + 1].count("p") >= 3 and order[: i + 1].count("u") >= 3 and (order[: i].count("p") < 3 or order[: i].count("u") < 3))
    expected = [0] * len(order)
    expected[completing] += 1
    expected[[i for i, ch in enumerate(order) if ch == "u"][2]] += uni3
    assert got == expected


@pytest.mark.parametrize("map_id", [m for m in MAPS if m != "11"])
def test_no_other_map_gives_a_conservation_for_the_third_pair(map_id):
    got = _pairs(map_id, "pppuuu")
    assert got == [0, 0, 0, 0, 0, association.map_bonus(map_id, "university3")]                 # (only the 3rd university's own bonus of the map)


def _extra_shifts(map_id, order):
    """After each placement of `order` (p / u), how many Extra Shift effects are pending."""
    s = in_action()
    p = s.players[0]
    p.map_id = map_id
    seen, out = {"p": 0, "u": 0}, []
    for what in order:
        seen[what] += 1
        if what == "p":
            association.place_partner(s, p, partner(seen["p"], ("Africa", "Asia", "Europe", "Americas")[seen["p"] - 1]))
        else:
            association.place_university(s, p, Token(800 + seen["u"], ("fac-science-rep", "fac-science-money", "fac-science-xtoken")[seen["u"] - 1], "association_4"))
        out.append(len([e for e in s.current_action.get("threshold", []) if e["kind"] == "extra_shift"]))
    return out


@pytest.mark.parametrize("order,at", [("ppuuu", 4), ("uuppp", 4), ("pupu", 4), ("puup", 4), ("ppp", None), ("uuu", None), ("pppuu", 5), ("uupp", 4)])
def test_on_map_11_the_second_pair_gives_one_extra_shift_when_it_is_complete(order, at):
    got = _extra_shifts("11", order)
    want = [0] * len(order) if at is None else [0] * (at - 1) + [1] * (len(order) - at + 1)         # (pending effects stay in the list: it is 1 from the placement that completes the pair on)
    assert got == want


@pytest.mark.parametrize("map_id", [m for m in MAPS if m != "11"])
def test_no_other_map_gives_an_extra_shift_for_the_partner_zoo_university_pairs(map_id):
    assert set(_extra_shifts(map_id, "ppuuu")) == {0}
