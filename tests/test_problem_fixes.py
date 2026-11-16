"""The problems of docs/problem_report.md that were fixed stay fixed: each log below was a mismatch or an illegal move of the differential test (the engine against BGA's log)."""
from pathlib import Path

import pytest

from ark_nova.engine import animal_abilities
from ark_nova.parser import parse_log
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log
from ark_nova.replay.differential import run_differential

LOGS = Path(__file__).resolve().parents[1] / "log_examples"
# table -> what was wrong
FIXED = {
    "865382491": "per-icon reputation of a project counted the sponsor that the log plays later",
    "814842703": "Dominance gave a base project that BGA did not give",
    "820206282": "Dominance (same)",
    "811076698": "a sponsor played before the break started was paid its income twice",
    "806276023": "the appeal of an overflowing reputation comes before the appeal income",
    "832292660": "kiosk income of a player without kiosks, and the Sea Animal Magnet takes sponsors with the sea animal icon",
    "804988782": "Sea Animal Magnet takes the Marine Biologist",
    "886820039": "Sea Animal Magnet takes the Sea Turtle Tank (Marine Worlds)",
    "888792457": "a take-in-range bonus closes the gap in the display but adds no new card",
    "906045803": "the display is refilled when the first player's effects are done",
    "837033009": "tokens of two Breeding sponsors used as icons",
    "844027463": "Venom: an extra action that removes a token takes the early payment back",
    "854263310": "Diversity Researcher builds over water without the Terrain Build price",
    "874269610": "enlarging an enclosure that fills the map pays the 7 appeal",
    "826568675": "the replay's appeal track ends at 113",
    "814075010": "a Clever of the other player in the break",
    "858199959": "Constriction counts the appeal before the animal's own gains",
    "820534913": "a release names an empty enclosure",
    "846710292": "a category university's search comes before the hunter effect it follows in the log",
    "842580036": "Scuba Dive 3 of the sponsor and the animal's own Scuba Dive X",
    "881630407": "the display was refilled between two snaps",
    "877649220": "a project supported in this turn covers the income slot that the break pays",
    "819962687": "a Symbiosis that nothing in the log uses is skipped",
    "894764261": "peaceful Pilfering 1: 3 money or a card",
    "805339373": "a Constriction ignores the appeal that the triggers of the animal gave",
    "920295323": "Symbiosis does not copy a Reef Dweller effect (turn 71: the Anemone's Mark is its reef effect, the log shows one Mark)",
    "627776608": "map 4 Commercial Harbor: a card sold before the action card is chosen is a free action of its own turn (moves 107, 483)",
    "688371482": "the same sale before an action card that is skipped (turn 51): the sale is kept in front of the skip",
    "941429583": "an enlarged enclosure (Conference on Australia) that completes an area of map 13 pays the area's bonus (turn 60)",
    "937181556": "the Polar Bear Exhibit played in the break by the player whose turn it is not: its own bear is an effect of the owner (turn 46)",
    "823017370": "Kiosk Build: the first kiosk was taken for the additional one though it used strength (BGA's list after the next building shows it, turn 40)",
}


def test_the_card_icons_that_a_magnet_looks_for():
    assert animal_abilities._sea_animal("S266", False, any_card=True)               # the Marine Biologist
    assert animal_abilities._sea_animal("S250", True, any_card=True)                # the Sea Turtle Tank has the icon in Marine Worlds only
    assert not animal_abilities._sea_animal("S250", False, any_card=True)
    assert animal_abilities._sea_animal("S278", False, any_card=True)               # the Amazon House
    assert not animal_abilities._sea_animal("S266", False)                          # (an animal is what the symbiosis looks for)


@pytest.mark.skipif(not LOGS.exists(), reason="log_examples not available")
@pytest.mark.parametrize("table", sorted(FIXED))
def test_a_fixed_problem_stays_fixed(table):
    path = LOGS / f"{table}.json"
    if not path.exists():
        pytest.skip("log not available")
    parsed = parse_log(str(path))
    setup, cfg, seed = game_from_log(parsed)
    replay = build_replay(parsed, setup, cfg, seed)
    rep = run_differential(parsed, replay, {pid: i for i, pid in enumerate(setup.seats)})
    assert not rep.illegal and not rep.mismatches, (FIXED[table], rep.illegal + rep.mismatches)


@pytest.mark.skipif(not (LOGS / "814290712.json").exists(), reason="log not available")
def test_a_constricted_action_card_is_replayed_not_skipped():
    """Faerch's Animals card in slot 5 under a Constriction token is chosen with strength 3 (814290712, step 287): nothing was paid, so the harness must not skip the turn."""
    parsed = parse_log(str(LOGS / "814290712.json"))
    setup, cfg, seed = game_from_log(parsed)
    replay = build_replay(parsed, setup, cfg, seed)
    rep = run_differential(parsed, replay, {pid: i for i, pid in enumerate(setup.seats)})
    assert not rep.illegal and not rep.mismatches
    assert "strength above the slot that the engine does not explain" not in rep.skipped

@pytest.mark.skipif(not (LOGS / "937181556.json").exists(), reason="log not available")
def test_the_mark_hex_of_map_12_is_replayed_not_skipped():
    """Map 12, hex (6, 3) is a Mark (BGA marks a display card every time it is covered: 937181556 moves 106 / 178, 791369985 moves 207 / 253); it was a take in range, so the engine stopped at the Mark."""
    parsed = parse_log(str(LOGS / "937181556.json"))
    setup, cfg, seed = game_from_log(parsed)
    replay = build_replay(parsed, setup, cfg, seed)
    rep = run_differential(parsed, replay, {pid: i for i, pid in enumerate(setup.seats)})
    assert not rep.illegal and not rep.mismatches
    assert not any("Mark" in reason for reason in rep.skipped), dict(rep.skipped)

# turns the differential test used to skip or reject, now replayed (2026-10-29): fixes A-G of the problem review
REPLAYED = {
    "791369985": [42, 51, 53, 62],          # map 12: concealed strength is no X token (A); an instant map slot is no income slot (F)
    "937181556": [49, 61],                  # map 12: concealed strength (A)
    "930781276": [39],                      # map T1: the discard's +1 strength is no X token (A)
    "833146203": [71, 72, 73],              # map 11: a stored card taken back before the card is chosen (B)
    "927743770": [35],                      # map 11 (B)
    "930258897": [54],                      # a Sponsor token used before the card is chosen (B)
    "920295323": [52],                      # map T1 discard before a Multiplier repetition (B)
    "927683584": [64, 70],                  # a Mark with no animal in the display (C); the other player's Clever in the break (D)
    "920319154": [23],                      # Activate Reef without a reef dweller (C)
    "795215166": [78],                      # an endgame card discard is no sponsor play (E)
    "843469060": [46, 66],                  # map T1: the snaps of a conservation-5 reward are no notepad bonus, so the card bonus (slot 0) is still free; turn 66: the log ends before BGA refills the display
    "901779082": [48],                      # a Marketing token plays the Amazon House before the card is chosen: its building covers a Clever hex, the Clever comes after the Association II (turns 48 + 49)
    # 2026-11-16: the differential list of the 86 tables
    "816239058": [50, 74, 75],              # an extra action after a token or a sale; the draw of a hand rescue is no second draw
    "840980354": [53],                      # map 10: an animal rescued from the hand draws its card with the rescue
    "820998468": [70, 83],                  # a released aquarium animal empties as many spaces as it takes; the Hawkfish still triggers as a reef dweller
    "855359344": [55],                      # the Adapt comes before the discard at 10 conservation
    "862612675": [40],                      # Waza: the snap of a card that the Digging then digs from the hand stays in front of it
    "887318108": [76],                      # map 13: the capped reputation of the other player is done before this player's income (the display is refilled)
    "889879141": [58],                      # the Side Entrance played in the break pays its income before the entrance is built
    "771466733": [56],                      # a second Venom of a turn goes on the next card, not on the same one
    "772160454": [21],                      # a player who quits in the middle of a turn
    "840929840": [59],                      # (same)
    "795715523": [58],                      # map 12: a hypnotised card gets the concealed numbers of the player who owns it
    "864552379": [49, 51],                  # a project's Hunter counts its icons when the cards are revealed (a university of the same project adds one)
    "664979088": [36],                      # the Explorer's gains come after the Constriction of the same animal
    "666650119": [63],                      # a Trade for reputation at 9 with the Cards action not upgraded leaves the marker at 9
    "672123762": [63],                      # the hypnotised card that is put back is the next turn of the same player
    "688573593": [43],                      # the turn numbers differ by one after an extra action: not a rule
    "856281778": [51],                      # a Shark Attack that hits a marked card in the break: the card goes to the player who marked it
    "869352683": [69],                      # map 10: the draw before a rescue from the display is the placement bonus's, not the rescue's
    "847820417": [68],                      # the other player's declined optional effect: their income is done, the display is refilled
    "795707447": [32],                      # (same as 869352683)
    "789679971": [26],                      # the Sea Turtle Tank pays the Explorer for one new icon
    "656606572": [27],                      # (same)
    "862028007": [79],                      # an animals action that does not use its Multiplier: the cleanup is the next marker
}


@pytest.mark.skipif(not LOGS.exists(), reason="log_examples not available")
@pytest.mark.parametrize("table", sorted(REPLAYED))
def test_a_turn_that_used_to_be_skipped_is_replayed(table):
    path = LOGS / f"{table}.json"
    if not path.exists():
        pytest.skip("log not available")
    parsed = parse_log(str(path))
    setup, cfg, seed = game_from_log(parsed)
    replay = build_replay(parsed, setup, cfg, seed)
    rep = run_differential(parsed, replay, {pid: i for i, pid in enumerate(setup.seats)}, chain=True)
    bad = {k: (rep.results[k].status, rep.results[k].detail[:120]) for k in REPLAYED[table] if k in rep.results and rep.results[k].status != "ok"}
    assert not bad, bad

@pytest.mark.skipif(not (LOGS / "715758234.json").exists(), reason="log not available")
def test_a_release_that_frees_no_enclosure_is_replayed():
    # 715758234 (map 5a, Marine Worlds): BGA lists {"type": "empty"} as the building of the 4th release ("frees no enclosure")
    parsed = parse_log(str(LOGS / "715758234.json"))
    seats = [str(p.id) for p in parsed.players]
    setup, cfg, seed = game_from_log(parsed, maps=["5a", "5a"], marine_worlds=True)
    replay = build_replay(parsed, setup, cfg, seed)
    rep = run_differential(parsed, replay, {pid: i for i, pid in enumerate(setup.seats)})
    assert not rep.illegal and not rep.mismatches, rep.illegal + rep.mismatches
    assert all(r.status == "ok" for r in rep.results.values()), {k: r.detail for k, r in rep.results.items() if r.status != "ok"}
