# Known issues

## Sponsor endgame scoring disagreements with the logs

Checked with `scripts/check_endgame_cards.py`: about 400 sponsor endgame effects, 4 disagreements in 3 games (seats are 0-based engine seats).
Reconstruction (S280) is correct: its endgame is "map completely covered", like Side Entrance.

| Game (BGA table id) | Seat | Sponsor | Log | Engine | Notes |
|---|---|---|---|---|---|
| 801090816 | 1 | Side Entrance (S257) | +5 appeal | 0 | Map 1, replay state still has 13 uncovered plain hexes |
| 801090816 | 1 | Archeologist (S221) | +1 conservation | 0 | Same game, border not covered in the replay state |
| 851610592 | 0 | Side Entrance (S257) | +5 appeal | 0 | Map 1, 9 uncovered plain hexes in the replay state |
| 851610592 | 1 | Geologist (S242) | 0 | +1 conservation | Engine thinks all rock spaces are connected, BGA does not |
| 795240335 | 1 | Free-Range New World Monkeys (S264) | +1 conservation | 0 | Unconnected placement-bonus spaces, not investigated |

Likely causes: buildings the replay does not place (unknown shape), or a different meaning of "connected" for Geologist. No building or bonus
events sit in the final-scoring move of these games, so a missing last action is not the cause.

## Endgame cards

- Large Animal Zoo (796192448, seat 0): log 3, engine 4.
- Research Zoo (797350569, seat 0): log 4, engine 3.
- Favorite Zoo (801039788, seat 0): log 3, engine 4.

## Final scores

`tests/test_endgame.py`: final scores match the logs in 91 of 100 games. The other 9 (780458510, 795240335, 796192448, 797350569, 800980926,
801016546, 801039788, 801090816, 851610592) miss the last action of the game where it is logged in the same move as the final scoring (a conservation,
an animal), or hit one of the disagreements above.

## Other

- Conservation projects: about 10 discrepancies in the differential (for example P108 Primates needs 3 but the log says 4).
- Aquarium and petting zoo placement lists differ from BGA's in a few games (seats of 796192448 and others).
- Games with an unknown map give wrong map income.
- Break income of maps 7 / 7a / 13 is not implemented (raises NotImplementedError).
- Conference on Europe marks are only counted (`flags["europe_marks"]`); what a mark is worth is unknown.
- Basic Research: pairs are counted as the number of different continent / species kinds present, divided by 2.

## Animal abilities: unclear rulings

All 160 animals are implemented, on the assumptions below. `scripts/engine_problems.py` lists what still differs from the logs.

### Open questions about the rules that are now implemented
- **Multiplier:** in 100 log turns a token is used right after `chooseActionCard` (`discardTokens`: "uses a multiplier token") with no second
  `chooseActionCard`, and the action looks as if it was done once (for example the Sponsors break option pays the level II amount once). Only one turn
  shows a second `chooseActionCard`, at strength 7 (+2 X tokens). The engine follows the rules given (a repetition is a new choice, at the card's strength
  plus X tokens); the differential test skips the turns where the log shows only the token use.
- **Venom:** in 5 plays (796192448 turns 11, 52, 60, 800524938 turn 36) the log shows "Inventive" X tokens (as many as the Venom value) and no tokens placed, with
  the other player ahead on appeal. Is there an alternative to placing tokens (gain X tokens when ...)?
- **Constriction / Venom / Multiplier tokens and the Hypnosis action:** the strength of a hypnotised action is the slot of the opponent's card plus the player's
  X tokens; the Venom / Constriction tokens on that card are ignored. Whether the owner's Venom on it is removed is not modelled.
- **Marketing:** the logs show a second `actionCardCleanup` of the Sponsors card after the sponsor was played (in 768795366 turn: Hydrologist); is the Sponsors
  action card put back (slot 1) when Marketing plays a sponsor?
- **Marks:** the marks of the action card variants (Animals4 marks after every action, 148 turns) are not implemented; the differential test skips turns whose mark
  comes from a source the engine does not have. In 791295095 turn 64 the mark of an Animals4 turn is placed after the second action (Action: Cards).
- **A strength bonus of +1 without an X token** (the log shows a chosen strength one above the card's slot and no payment, 60 times): not explained, not implemented.

### Implemented on an assumption
- **Pilfering 1 / 2:** the target is the opponent when their appeal (Pilfering 2: also conservation) is at least the actor's, before the animal's printed gains
  (a tie counts: log 791338307 turn 21 shows two payments with equal conservation). Turn 37 of 795621374 (Japanese Macaque, appeal 7 against 10) shows no
  Pilfering at all, which this does not explain. The victim must give a card (of their choice) or pay 5 money; what happens with an empty hand and less than
  5 money is not modelled (the effect is skipped).
- **Determination / Action: X:** a second action of the same player after the first card went to slot 1, at that card's new strength, X tokens allowed;
  Determination cannot repeat the Animals card. Not checked against the logs beyond the turn structure (the second action is its own turn marker).
- **Reef Dwellers:** see docs/engine_design.md; in particular that an animal without a Reef Dweller effect does not trigger the others (logs 795240335 turn 30,
  899758900 turn 62) and that the effect is done again for every animal placed in the same aquarium.
- **Camouflage:** only animals played after it, one missing condition per Camouflage, not a waza or a size condition.
- **Flock Animal:** the shared enclosure must hold a herbivore and no sharer; its size is taken as the enclosure size >= X. The sharer's own rock / water conditions
  still apply. Releasing one of two animals that share an enclosure is not modelled.
- **Digging X:** "discard 1 card from your hand and draw 1 other from the deck" is the top card of the deck; a dig from the display refills it at once.
- **Scavenging X / Monkey Gang:** the discard pile is shuffled with the game RNG (the logs only show the result), Monkey Gang tucks the revealed cards under the
  deck in the order they were revealed. The differential test cannot check either (Scavenging replaces the draw by the logged cards, Monkey Gang turns are skipped).
- **Shark Attack X:** any number from 0 to X animals in the reputation range, half their appeal rounded down each. **Glide X:** any number of cards up to X, each sea
  animal icon on them gives one of reputation / 2 appeal / a free kiosk. **Symbiosis:** not another Symbiosis animal, only sea animals with an ability.
  **Extra Shift:** any worker on the association board returns to the notepad.
- **Reputation:** gains beyond the cap of 9 (Cards action not upgraded) are lost without appeal (the 1 appeal per lost point only applies above 15: logs). Seat 1 of
  800231247 has reputation 11 with an un-upgraded Cards variant 3 card: does a variant card raise the cap?
- **Sunbathing sells for 4 money a card, Petting Zoo Animal 3 appeal per pet icon, Pack counts the animal itself, Iconic Animal counts both zoos (max 8):** all
  checked against the logs, listed here because the card data does not say it.
- **Marine Worlds sponsors S266, S270, S277, S279 have a Wave icon**: the card data only has the flag on animals; found from display refills in the logs.
