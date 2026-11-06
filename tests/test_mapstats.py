"""The map-specific rows of the results table (`replay/mapstats.py`): synthetic logs for the rules, the sample logs for the numbers."""
import json
from pathlib import Path

import pytest

from ark_nova.replay.mapstats import map_stats, sponsor_points, waza_large_events

LOGS = Path(__file__).resolve().parents[1] / "log_examples"
A, B = "111", "222"


def packets(*groups):
    """groups: (move, channel, [events]) -> a raw log of table `t1`."""
    return {"data": {"logs": [{"move_id": m, "channel": c, "data": ev} for m, c, ev in groups], "players": [{"id": int(A)}, {"id": int(B)}]}}


def ev(ty, pid=None, log="", **args):
    if pid is not None:
        args["player_id"] = int(pid)
    return {"type": ty, "log": log, "args": args}


def state(gid, pid, **inner):
    return {"type": "gameStateChange", "log": "", "args": {"id": gid, "active_player": str(pid), "args": inner}}


def statuses(pid, **ignored):
    return state(20, pid, _private={"statuses": {k: {"conditions": {"ignored": v, "valid": False}} for k, v in ignored.items()}})


def stats(raw, maps=("1", "1")):
    return map_stats(raw, [A, B], list(maps))


def test_variants_share_the_keys_of_their_map():
    out = stats(packets((1, "/table/t1", [])), ("4a", "5a"))
    assert out[0] == {"map": "4a", "harbor_money": 0} and out[1] == {"map": "5a", "income_map": 0}


def test_tower_appeal_and_marketing_with_the_map_bonus():
    raw = packets((1, "/table/t1", [ev("getBonuses", A, source="Map 1 bonus", bonuses={"appeal": 2}), ev("getBonuses", A, source="Map 1a bonus", bonuses={"appeal": 2}),
                                    state(82, A, source="map bonus space"), ev("playSponsor", A, card_id="S213_ExpertOnAsia"),
                                    state(82, B, source="placement bonus"), ev("playSponsor", B, card_id="S229_X")]))
    a, b = stats(raw)
    assert (a["tower_appeal"], a["tower_marketed"], b["tower_marketed"]) == (4, 1, 0)
    assert map_stats(raw, [A, B], ["1", "1"], sponsor_stats={"S213": {"appeal": 3, "appeal_final": 2, "conservation": 1, "money": 9}})[0]["tower_marketed_points"] == 6


def test_sponsor_points_count_appeal_and_conservation_only():
    assert sponsor_points({"appeal": 1, "appeal_income": 2, "conservation": 3, "money": 8, "pouch": 4}) == 6


def test_commercial_harbor_money_needs_the_map_state():
    sale = ev("discardCards", A, "${player_name} sells ${n} card(s) for ${bonuses_desc}", n=1, bonuses={"money": 3})
    raw = packets((1, "/table/t1", [state(84, A), sale]), (2, "/table/t1", [sale]), (3, "/table/t1", [state(84, A), sale]))
    assert stats(raw, ("4", "4"))[0]["harbor_money"] == 6                       # the second sale (Sponsors 3) has no id=84 before it


def test_map_income_pouch_cube_and_t1_are_counted_once():
    pouch = ev("discardCards", A, "${player_name} pouches ${n} card(s) for ${bonuses_desc}", n=2, pouch="mapPouched")
    other = ev("discardCards", A, "${player_name} pouches ${n} card(s) for ${bonuses_desc}", n=1, pouch="A425_TasmanianDevil")
    income = ev("getBonuses", A, source="map income", bonuses={"money": 3})
    income["uid"] = "u1"
    t1 = ev("discardCards", A, "${player_name} discards 1 card for Map T1 effect", n=1)
    cube = ev("discardTokens", A, continent="<EUROPE>", meeples=[])
    raw = packets((1, "/table/t1", [pouch, other, income, income]))
    assert stats(raw, ("7", "7"))[0] == {"map": "7", "income_map": 3, "pouched": 2}
    assert stats(packets((1, "/table/t1", [t1, t1])), ("T1", "T1"))[0]["t1_discards"] == 2
    assert stats(packets((1, "/table/t1", [cube])), ("9", "9"))[0]["cubes"] == 1


def test_shark_attack_points_only_from_placement_bonus_and_archaeologist():
    hit = lambda n: ev("getBonuses", A, source="Shark Attack", bonuses={"appeal": n})
    take = ev("takeBonus", A, source="Archaeologist", bonus_desc={"args": {"bonus_type": "SharkAttack", "bonus_n": 1}})
    raw = packets((1, "/table/t1", [state(111, A, n=1, source="placement bonus"), hit(4)]),
                  (2, "/table/t1", [state(111, A, n=1, source="Caribbean Reef Shark"), hit(3)]),
                  (3, "/table/t1", [take, state(111, A, n=1), hit(2)]),                     # the Archaeologist's selector lost its source
                  (4, "/table/t1", [state(111, A, n=1), hit(5)]))                           # no known source: not counted
    assert stats(raw, ("14", "14"))[0]["shark_points"] == 6


def test_person_sponsor_played_free_with_the_map_bonus():
    raw = packets((1, "/table/t1", [state(125, A, source="map bonus space"), ev("playSponsor", A, card_id="S213_X"), ev("playSponsor", A, card_id="S214_X")]))
    assert stats(raw, ("14", "14"))[0]["person_free"] == 1


def test_clever_from_the_map_bonus_space():
    clever = ev("actionCardCleanup", A, "${player_name} places ${action_card_name} (Clever effect)")
    raw = packets((1, "/table/t1", [state(65, A, source="map bonus space"), clever, state(65, A, source="placement bonus"), clever]))
    assert stats(raw, ("6", "6"))[0]["clever_map"] == 1


def test_quadrants_count_instant_and_income_triggers_once():
    fill = lambda q, filled: ev("slideMeeples", A, infos={"mapStatus": {A: [i == q and filled or False for i in range(4)]}})
    income = ev("takeBonus", A, source="map bonus space", bonus_desc={"args": {"bonus_type": "MAP_13_INCOME", "bonus_n": 3}})
    quarter = ev("getBonuses", A, source="Map 13 quarter bonus", bonuses={"appeal": 2})
    raw = packets((1, "/table/t1", [fill(1, True), quarter]),                               # a transition and its explicit event: one trigger
                  (2, "/table/t1", [fill(1, False)]), (3, "/table/t1", [fill(1, True)]),    # unfilled and filled again: another instant trigger
                  (4, "/table/t1", [income]))
    out = stats(raw, ("13", "13"))[0]
    assert (out["quad_appeal"], out["quad_hunters"], out["quad_money"], out["quad_reputation"]) == (2, 1, 0, 0)


def _research_steps(move):
    cell = [[0, 11]]
    return [{"move_id": 1, "state": {"players": [{"buildings": []}, {"buildings": []}]}},
            {"move_id": move, "state": {"players": [{"buildings": [{"cells": cell}]}, {"buildings": []}]}}]


def test_ignored_animals_of_the_research_institute():
    buy = lambda card: ev("buyAnimal", A, card_id=card)
    raw = packets((1, "/player/p" + A, [statuses(A, A400_X=2, A401_Y=0, A402_Z=1)]),
                  (3, "/table/t1", [buy("A400_X")]),      # the institute is not connected yet (hex 0:11 empty)
                  (6, "/table/t1", [buy("A400_X"), buy("A401_Y"), buy("A402_Z")]))
    out = map_stats(raw, [A, B], ["6", "6a"], _research_steps(5))
    assert out[0]["ignore_animals"] == 2                  # A400_X and A402_Z need an ignore, A401_Y does not
    assert out[1]["ignore_animals"] == 0


def test_an_ignore_token_is_not_an_ability_use():
    raw = packets((1, "/player/p" + A, [statuses(A, A400_X=2)]),
                  (6, "/table/t1", [ev("discardTokens", A, meeples=[{"type": "bonus-ignore-conditions"}]), ev("buyAnimal", A, card_id="A400_X")]))
    assert map_stats(raw, [A, B], ["6", "6"], _research_steps(5))[0]["ignore_animals"] == 0


def _sizes(**n):
    return {"sizes": {A: {"small": 0, "medium": 0, "large": 0, **n}}}


def test_waza_large_counts_large_animals_played_with_an_ignored_condition():
    waza = ev("playSponsor", A, card_id="S263_WazaLargeAnimalProgram")
    buy = lambda card, **n: {"type": "buyAnimal", "log": "", "args": {"player_id": int(A), "card_id": card, "infos": _sizes(**n)}}
    token = ev("discardTokens", A, meeples=[{"type": "bonus-ignore-conditions"}])
    raw = packets((1, "/player/p" + A, [statuses(A, A400_L=1, A401_S=1, A402_L=1, A403_L=0)]),
                  (2, "/table/t1", [buy("A401_S", small=1)]),                       # small: no
                  (3, "/table/t1", [waza]),
                  (4, "/table/t1", [buy("A400_L", small=1, large=1)]),              # large, ignored: yes
                  (5, "/table/t1", [token, buy("A402_L", small=1, large=2)]),       # a token play: never
                  (6, "/table/t1", [buy("A403_L", small=1, large=3)]))              # large but nothing to ignore
    events = waza_large_events(raw, [A, B], ["1", "1"])
    assert [seat for _o, seat in events] == [0]


@pytest.mark.skipif(not (LOGS / "941298700.json").exists(), reason="sample logs")
@pytest.mark.parametrize("table, maps, expected", [
    ("941298700", ("4a", "4a"), [{"harbor_money": 27}, {"harbor_money": 15}]),
    ("939838777", ("5a", "5a"), [{"income_map": 30}, {"income_map": 28}]),
    ("800966139", ("7a", "7a"), [{"income_map": 11, "pouched": 2}, {"income_map": 8, "pouched": 4}]),
    ("930781276", ("T1", "T1"), [{"t1_discards": 6}, {"t1_discards": 4}]),
    ("760993552", ("1a", "1a"), [{"tower_appeal": 10}, {"tower_appeal": 12}]),
    ("800999064", ("14", "14"), [{"shark_points": 6, "person_free": 0}, {"shark_points": 6, "person_free": 4}]),
])
def test_sample_logs(table, maps, expected):
    raw = json.loads((LOGS / f"{table}.json").read_text(encoding="utf-8"))
    pids = [p["id"] for p in raw.get("data", raw)["players"]]
    got = map_stats(raw, pids, list(maps))
    for want, have in zip(expected, got):
        assert {k: have[k] for k in want} == want


def test_archaeologist_offer_lists_only_its_own_bonuses_and_prefers_choices():
    from ark_nova.replay.sponsor_stats import _archaeologist_offer
    opt = lambda typ, n, src="S221_Archeologist": {"description": {"args": {"bonus_type": typ, "bonus_n": n}}, "args": {"sourceId": src}}
    state_args = {"choices": {"0": opt("reputation", 1), "1": opt("xtoken", 1), "2": opt("xtoken", 1), "3": opt("upgrade-card", 1, "other"), "4": {"description": "Pass"}},
                  "allChoices": {"0": opt("money", 9)}}
    offer = _archaeologist_offer(state_args)
    assert offer == {("reputation", 1): 1, ("xtoken", 1): 2}
    assert _archaeologist_offer({"allChoices": {"0": opt("money", 5)}}) == {("money", 5): 1}


def test_base_map_strips_variant_and_legacy_suffix():
    from ark_nova.replay.mapstats import _base_map
    assert [_base_map(m) for m in ('6', '6a', '6a-legacy', '1a', 'T1', '13')] == ['6', '6', '6', '1', 'T1', '13']
