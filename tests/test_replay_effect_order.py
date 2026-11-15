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
    "665716566": (("5a", "5a"), True, 45, "a sponsor played with a token before the card is chosen, whose reputation gain reaches the track bonus that takes a card from the range: part of the free action, not a card effect outside the Cards action"),
    "679739686:35": (("6a", "6a"), True, 35, "a sponsor played with a token after an Association action: its reputation reaches the track bonus that hires a worker (slideMeeples 'gains a new Association worker')"),
    "686637105": (("5a", "5a"), True, 62, "a sponsor played with a token whose reputation puts a Multiplier on a card, then an Association action, an Extra Shift of the worker and the repetition with the Multiplier: one chain"),
    "771855619": (("1a", "1a"), True, 55, "Publications played in the break: its donation is an effect of the sponsor, not of the Cards action of the turn"),
    "900757015": (("5a", "5a"), True, 51, "Animals with two animals: one gives an extra Cards action, the other a Clever effect; the player resolves the Cards action first, so the card goes to slot 1 after it (one turn)"),
    "868399197": (("2a", "2a"), True, 32, "Conference on Europe: the break's map bonus (a size-2 enclosure on the Partner Zoo hex of map 2a) puts a Europe partner zoo into the zoo, and the mark comes at once (there is no end of action in the break)"),
    "741147906": (("3a", "3a"), True, 54, "Conference on Europe: a Europe icon played in the break (a partner zoo): the mark comes at once"),
    "864896379": (("9", "9"), True, 64, "Conference on Europe: a Europe icon played in the break (a partner zoo): the mark comes at once"),
    "783434284:22": (("5a", "5a"), True, 22, "Mark Animals II: an animal with Venom and no Constriction event in a game that is not peaceful (a Clever effect later in the log is the Clever of another animal, so it does not make the game peaceful); the mark of the card comes at the end"),
    "772379557": (("8a", "8a"), True, 6, "Conference on Europe: an animal with two Europe icons puts two marks pending, and BGA logs both cards in one markCard event"),
    "594103300": (("A", "A"), False, 19, "Archaeologist: the extra placement bonus is the Worker hex of the map, taken at once (not a hire choice)"),
    "622711105": (("2a", "2a"), False, 70, "a support whose notepad bonus is a Worker with all four workers hired: nothing happens, no worker comes back from the board"),
    "638649830": (("4a", "4a"), False, 41, "the free size-2 enclosure of the break comes after an Animals action that ended in the break"),
    "647695434": (("2a", "2a"), False, 44, "Archaeologist: the partner zoo bonus (an upgrade of Cards) comes before the 1 reputation bonus of the same enclosure, which then passes 9 and takes the card of the 10 reputation space"),
    "647824362": (("5a", "5a"), True, 74, "Scuba Dive: a Marketing token plays one of the revealed sponsors before the card to keep is chosen"),
    "651806280": (("4", "4"), True, 46, "Mark Animals with no unmarked animal left in the display: BGA logs no mark, and the break goes on (the mark is skipped)"),
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


# turns that only say something happened (a player quit, the display was refilled): nothing to replay, and nothing may be reported for them
EVENT_ONLY = {"774645171": (("2a", "2a"), True, 30, "'X has quit the game and is going to lose'"),
              "795694395": (("11", "11"), True, 74, "only the replenishment of the display"),
              "749781422": (("6a", "6a"), True, 69, "the end of the game: the points of the scoring cards and the final score, no action")}


@pytest.mark.skipif(not LOGS.exists(), reason="log_examples not available")
@pytest.mark.parametrize("table", sorted(EVENT_ONLY))
def test_a_turn_of_notices_only_is_not_reported(table):
    path = LOGS / f"{table}.json"
    if not path.exists():
        pytest.skip("log not available")
    maps, mw, turn, why = EVENT_ONLY[table]
    parsed = parse_log(str(path))
    setup, cfg, seed = game_from_log(parsed, maps=list(maps), marine_worlds=mw)
    rep = build_replay(parsed, setup, cfg, seed)
    diff = run_differential(parsed, rep, {pid: i for i, pid in enumerate(setup.seats)}, chain=True)
    assert turn not in diff.results, (why, diff.results.get(turn))

# turns the log cuts short or fills with a notice: no problem may be reported for them
NOT_A_PROBLEM = {"665785121": (("10", "10"), True, 65, "a player conceded in the middle of an action: the game ends at once, no cleanup is expected and every logged action was accepted"),
                 "667852938": (("8a", "8a"), True, 61, "a player conceded in the middle of an action: the game ends at once, no cleanup is expected and every logged action was accepted"),
                 "649469558": (("5a", "5a"), False, 14, "switchToTurnbased: BGA converted a real-time table to turn-based, no effect on the game"),
                 "654208935": (("6a", "6a"), True, 69, "switchToTurnbased: BGA converted a real-time table to turn-based, no effect on the game"),
                 "618160389": (("5a", "5a"), False, 23, "a player ran out of time right after choosing the card: the game ends at once, no cleanup"),
                 "627757905": (("5a", "5a"), True, 23, "a player quit in the middle of an action: the game ends at once, no cleanup"),
                 "643539930": (("3a", "3a"), False, 66, "the last turn holds only the display refill, the scoring bonuses and the final score"),
                 "662607546": (("3a", "3a"), True, 41, "a turn that only says that a time joker was used"),
                 "854333361": (("4a", "4a"), True, 63, "an action whose Harbor sale and cleanup are logged under later markers"),
                 "796946880": (("11", "11"), True, 47, "a sponsor played with the Marketing token before the player's action, with a card stored by map 11"),
                 "827940536": (("T1", "T1"), True, 79, "map T1: a discard for +1 strength and an Extra Shift of the same player, logged before the card is chosen"),
                 "669605987": (("7a", "7a"), True, 59, "Publications played through a Marketing in a Build action: its donation"),
                 "859308287": (("7a", "7a"), True, 45, "a sponsor played with a token whose effects include an upgrade and the other player's mark gain"),
                 "840558355": (("5a", "5a"), True, 74, "the log ends in the middle of the last turn: no cleanup follows"),
                 "642463938": (("10", "10"), True, 44, "Waza Small Animal Program: 2 money per small animal, the small animals of the Rescue Station included"),
                 "837448258": (("10", "10"), True, 49, "Waza Small Animal Program: a small animal in the Rescue Station counts"),
                 "845259923": (("10", "10"), True, 73, "Waza Small Animal Program: a small animal in the Rescue Station counts"),
                 "862761275": (("10", "10"), True, 75, "Waza Small Animal Program: a small animal in the Rescue Station counts"),
                 "673161628": (("5a", "5a"), True, 60, "Hypnosis put back for an X token on a Mark Animals card: the mark is the hypnotiser's and is logged right after the cleanup"),
                 "801059195": (("11", "11"), True, 41, "Hypnosis put back for an X token on a Mark Animals card: the mark is the hypnotiser's and is logged right after the cleanup"),
                 "677396972": (("6a", "6a"), True, 63, "a hypnotised Mark Animals card on an older table: its mark happens"),
                 "677682492": (("7a", "7a"), True, 37, "a hypnotised Mark Animals card on an older table: its mark happens"),
                 "667768996": (("3a", "3a"), True, 61, "the game ends by a concession with the Mark Animals mark still pending: it is never reached"),
                 "748721369": (("1a", "1a"), True, 24, "hypnosis: the variant effect of a hypnotised card already runs on tables from 735000000 (the Sponsors 3 effect of 739307302, the Money Sponsors bonus of 756726232)"),
                 "750877829": (("4a", "4a"), True, 56, "hypnosis: the variant effect of a hypnotised card runs on this table"),
                 "754900512": (("5a", "5a"), True, 37, "hypnosis: the variant effect of a hypnotised card runs on this table"),
                 "756726232": (("4a", "4a"), True, 44, "hypnosis: the Money Sponsors bonus of a hypnotised Sponsors II card is paid on this table"),
                 "729229221": (("2a", "2a"), True, 9, "Sponsors 4 (level I): a sponsor discarded to snap one when the display has none: BGA lets the card go"),
                 "660113790": (("5a", "5a"), True, 61, "a Venom effect that the opponent's Quarantine Lab makes void is not used later by the break's income"),
                 "782921035": (("1a", "1a"), True, 64, "a player kicked for time in a break does not discard: the break goes on without it"),
                 "668290113": (("8a", "8a"), True, 49, "a hypnotised card of an older table runs its variant (+1 Build); only the Money Sponsors bonus was left out"),
                 "669771146": (("7a", "7a"), True, 36, "a hypnotised card of an older table runs its variant (Cards)"),
                 "715786486": (("4a", "4a"), True, 40, "a hypnotised card of an older table runs its variant (Cards)"),
                 "716484804": (("3a", "3a"), True, 48, "a hypnotised card of an older table runs its variant (+1 Build)"),
                 "719561092": (("8a", "8a"), True, 90, "a hypnotised card of an older table runs its variant (Sponsors 3 side action)"),
                 "729387250": (("10", "4a"), True, 76, "a hypnotised card of an older table runs its variant (Sponsors 4 side action)"),
                 "732463562": (("2a", "2a"), True, 41, "a hypnotised Sponsors II card of an older table pays no Money Sponsors bonus"),
                 "659445505": (("8a", "8a"), True, 40, "Archaeologist: an enlargement (Conference on Australia) that covers a new border hex with a bonus gives one more free placement bonus (the 5 money of another hex)"),
                 "801014048": (("13", "13"), True, 54, "the Mark of a placement bonus (map 13) is resolved at once: it is an effect of its own, not an end-of-action mark"),
                 "731047318": (("7a", "7a"), True, 85, "a mark of the first action of a chain (a reef effect) is logged after the extra action's cleanup: the engine's pending mark is offered once the second action is finished"),
                 "881841416": (("12", "12"), True, 58, "reputation reaches 16 through a placement bonus: the player takes the reward at 16 (a snap and a hand size token) instead of 1 appeal"),
                 "805030443": (("4a", "4a"), True, 74, "the 3 X tokens of a notepad bonus when the player is at 5: the log only says that they cannot have more than 5"),
                 "667801017": (("3a", "3a"), True, 50, "the upgrade of the reputation track bonus comes after the university's 2 reputation, not after the tiger's 1 (identical pending gains are told apart by the amount)"),
                 "672851171": (("3a", "3a"), True, 79, "BGA names the other aquarium when a Release project frees one: the animal leaves the one it sits in and the Octopus stays for its reef effect"),
                 "691447217": (("4a", "7a"), True, 17, "peaceful: a Venom + Reef Dweller Inventive animal (Devil Firefish) pays the X token twice; the second one proves the peaceful variant"),
                 "711316402": (("4a", "4a"), True, 49, "the player conceded while a project was being supported: BGA still paid the slot (5 conservation) and the endgame card choice, with no notepad bonus"),
                 "719268728": (("8a", "8a"), True, 59, "a Release project's animal is released while the aquarium bookkeeping differs: the turn is accepted until the concession")}


@pytest.mark.skipif(not LOGS.exists(), reason="log_examples not available")
@pytest.mark.parametrize("table", sorted(NOT_A_PROBLEM))
def test_a_turn_that_ends_with_the_game_or_a_notice_is_not_a_problem(table):
    path = LOGS / f"{table}.json"
    if not path.exists():
        pytest.skip("log not available")
    maps, mw, turn, why = NOT_A_PROBLEM[table]
    parsed = parse_log(str(path))
    setup, cfg, seed = game_from_log(parsed, maps=list(maps), marine_worlds=mw)
    rep = build_replay(parsed, setup, cfg, seed)
    diff = run_differential(parsed, rep, {pid: i for i, pid in enumerate(setup.seats)}, chain=True)
    assert turn not in diff.results or diff.results[turn].status == "ok", (why, diff.results[turn].status, diff.results[turn].detail)
