"""The player chooses the order in which the effects of one action are resolved (the gains of a university, the bonus of a conservation threshold, the pouch of an animal ...); the engine offers every
pending effect, and the replay harness (`replay/differential.py`) has to resolve them in the order the log shows. Forty turns of real games that it got wrong, found by replaying a random sample of
games; each is checked as a whole game with the maps of its players (the harness skips association and build turns of a player whose map it cannot infer, so the plain fixed-logs test would pass them
without looking). The logs are the local ones (`log_examples/`, not in git)."""
from pathlib import Path

import pytest

from ark_nova.parser import parse_log
from ark_nova.replay.builder import build_replay
from ark_nova.replay.config import game_from_log
from ark_nova.replay.differential import run_differential

LOGS = Path(__file__).resolve().parents[1] / "log_examples"
# table -> (map of both players, Marine Worlds, turn, what the log does)
CASES = {
    "613850149": (("8", "8"), True, 46, "a university: the 2 reputation come first, its track bonus upgrades a card, then the conservation 2 choice hires a worker"),
    "634830005": (("1a", "1a"), False, 54, "a university: the reputation gain lifts the conservation to 8 (track bonus), the player then chooses 2 reputation at 8"),
    "646886236": (("7a", "7a"), False, 58, "an animal: the conservation 8 choice, the card of the reputation track, the appeal, and only then the pouch under the animal"),
    "657367963": (("5a", "5a"), True, 64, "Constriction was played and the victim was immune (an immunity message): not the peaceful variant, so the Puffer's Venom gives no X token"),
    "664950095": (("3a", "3a"), True, 69, "Mark Animals with every animal of the display already marked: BGA logs no mark (a markCard some turns later belongs to another action)"),
    "679739686": (("6a", "6a"), True, 19, "Cut Down: the log names BGA's building id 6, which the engine numbers differently (the empty size-2 enclosure at (7, 2))"),
    "700204563": (("1a", "1a"), True, 21, "Cut Down: the log names BGA's building id 9 (the empty size-2 enclosure at (5, 2))"),
    "714263104": (("1a", "1a"), True, 49, "Hypnosis of a Digging Cards card on an older table: its dig comes before the cards action"),
    "739415597": (("8a", "8a"), True, 76, "Pilfering by appeal: the Explorer's appeal of the same animal is logged after it and does not count for the comparison"),
    "752201952:52": (("1a", "1a"), True, 52, "Hypnosis of a level II +1 Build card on an older table: the extra building (a kiosk) is allowed"),
    "791967351": (("4a", "4a"), True, 0, "the second player's first turn starts with state 35 and no state 20: the turn marker is missing, the two first actions were one turn"),
    "800355711": (("13", "13"), True, 54, "Cut Down names BGA's building id (the break income and its reputation upgrade come first)"),
    "802552873": (("6a", "6a"), True, 63, "the Boost of an animal waits for the end of the extra action; BGA leaves empty turn markers between the two actions"),
    "810846540": (("1a", "1a"), True, 55, "Break income: the first player's unused optional Marketing is over when the other player's income starts, so the display is refilled before that player's draw"),
    "815209400": (("8a", "8a"), True, 61, "A placement bonus of reputation lifts the conservation to 8, the log's 3 X tokens are the reward at 8 (not a bonus of the building)"),
    "824172891": (("1a", "7a"), True, 55, "Build variant 1 with a Multiplier repeat: each of the two actions has its own additional pavilion"),
    "824618439": (("4a", "4a"), True, 61, "Waza Small Animal Program: the snap comes before the pouch of the snapped card"),
    "610008670": (("4a", "4a"), False, 66, "an extra action after empty turn markers: the engine's state (the Boost) carries on"),
    "614184809": (("7a", "7a"), False, 51, "Break income: the placement bonus' take in range closes the gap only; the display is refilled when the player's income is done"),
    "627743200": (("7a", "7a"), False, 61, "Hypnosis followed by another extra action in the same turn: the turn is one turn (the turn count)"),
    "717818868": (("4a", "4a"), True, 65, "Hypnosis put back for an X token: the Clever of the first action comes after it"),
    "792425915": (("4a", "4a"), True, 39, "Hypnosis put back for an X token: the Clever of the first action comes after it"),
    "640381487": (("6a", "6a"), False, 44, "Animals with an extra Build action (A515) and a Hypnosis animal: the Build comes first, the hypnosis after it, in one turn"),
    "813790919": (("3a", "3a"), True, 31, "skipTurnOfPlayer: a player out of time is kicked and the turn passes"),
    "749781422": (("6a", "6a"), True, 67, "skipTurnOfPlayer: the kicked player pays no Venom"),
    "665019532": (("8a", "8a"), True, 17, "Hydrologist: the water space that an earlier building of the same turn covered is gone, so a later building next to it pays nothing"),
    "746858756": (("8a", "8a"), True, 58, "Iconic Animal counts the icons when its effect is resolved: a sponsor played before it in the same action (Marketing) counts"),
    "776662847": (("2a", "2a"), True, 10, "A sponsor played in the sponsors action before the break: its income in the break is an effect of its own, paid before the appeal income"),
    "842806508": (("13", "6a"), True, 44, "A support that covers an instant AND income slot: the break pays that slot, but it was not used before the turn"),
    "818398015": (("11", "11"), True, 26, "Extra Shift: the worker that was taken back is the one whose place is empty at the end of the turn in the log"),
    "783434284": (("5a", "5a"), True, 47, "Extra Shift: the worker that was taken back is the one whose place is empty at the end of the turn in the log"),
    "806398535": (("T1", "T1"), True, 51, "Break income: the first player's mandatory placement bonus is paid when the other player's income starts, so the display refill comes before the other player's draw"),
    "820306349": (("T1", "T1"), True, 33, "A category university: the player drew the card of the reputation track first, the search for the category came after it"),
    "801879816": (("12", "12"), True, 67, "map 12: a project support with the Animal Magnet space that the player does not use (no animal in the hand afterwards): the magnet is optional"),
    "750476271": (("2a", "2a"), True, 45, "a hypnotised level I Association card of the other player: the display's projects can not be supported (that is level II), so BGA's project list does not have the Geological in the display"),
    "657367963": (("5a", "5a"), True, 45, "a sponsor played with a token before the card is chosen, followed by an empty turn marker: the free part belongs to the player's next action"),
    "665079039": (("6a", "6a"), True, 66, "the player who ends the game has two marks pending but BGA logs only one: the second would come with a next action that never happens"),
    "659912999": (("4a", "4a"), True, 58, "Animals II with the Commercial Harbor: an animal, a sale for 3 money, and the second animal (from the display) that the sale made affordable"),
    "719833428": (("7a", "7a"), False, 37, "the choice at conservation 5 that comes after a reputation gain"),
    "752201952": (("1a", "1a"), True, 32, "the choice at conservation 2 (hire) after the reputation gain and its track bonus"),
    "800395439": (("T1", "T1"), True, 49, "a snap that follows the effects the player chose to resolve first"),
    "800604420": (("1a", "1a"), True, 11, "the choice at conservation 2 (hire) after the reputation gain and its track bonus"),
}


@pytest.mark.skipif(not LOGS.exists(), reason="log_examples not available")
@pytest.mark.parametrize("table", sorted(CASES))
def test_effects_are_resolved_in_the_order_of_the_log(table):
    path = LOGS / f"{table.split(':')[0]}.json"
    if not path.exists():
        pytest.skip("log not available")
    maps, mw, turn, why = CASES[table]
    parsed = parse_log(str(path))
    setup, cfg, seed = game_from_log(parsed, maps=list(maps), marine_worlds=mw)
    rep = build_replay(parsed, setup, cfg, seed)
    diff = run_differential(parsed, rep, {pid: i for i, pid in enumerate(setup.seats)}, chain=True)
    assert diff.results[turn].status == "ok", (why, diff.results[turn].status, diff.results[turn].detail)
