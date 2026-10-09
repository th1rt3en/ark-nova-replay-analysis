# Known issues

## Endgame cards

`scripts/check_endgame_cards.py` (all card effects of all logs, 119 games with a final scoring).
- Large Animal Zoo (796192448, F001) and Research Zoo (797350569, F003) are base-game games (3 for 4 large animals, 4 for 6 science icons); the base /
  Marine Worlds flag will come from the index later, no fix needed.
- Sponsor disagreements Archeologist (S221), Geologist (S242), Side Entrance (S257), Free-Range New World Monkeys (S264): caused by a wrong map inferred from the
  log, ignored.
- Not explained yet (engine higher than the log): Empty Space Zoo F006 (673374517: log 2, engine 4; 718586913: log 2, engine 3), F016 (658990495: log 2,
  engine 3), S258 (673374517: log 1, engine 2), S259 (729691427: log 1, engine 3).
- Favorite Zoo (F007, 15 reputation = 4) agrees in all 38 cases.

## Final scores

`tests/test_endgame.py`: final scores match the logs in 104 of 119 games. The other 15 differ by the endgame cards above (map-dependent or unexplained ones) or
because the last action of the game is logged in the same move as the final scoring: 658990495, 673374517, 692356020, 714062511, 718586913, 724625887,
729691427, 780458510, 795240335, 796192448, 797350569, 800980926, 801016546, 801090816, 851610592.

## Other

- Conservation projects: all five kinds are implemented (see docs/engine_design.md); the supportable projects and slots agree with BGA's own lists in all
  16 lists the logs contain. The old 'P108 needs 3 but the log says 4' discrepancies were tokens of Breeding Cooperation / Program counted as an icon.
- Placement lists (the build options BGA logs, compared with the engine's): the aquarium differences were Build 4 (Terrain Build) games, fixed: an aquarium
  (the Marine Worlds small / large aquarium, not the sponsor Aquarium S245) needs an uncovered water hex next to it, a water hex covered by a building no longer
  counts, and an aquarium that covers a rock hex still needs that water hex (only covering a water hex exempts it). What remains: the base-game games
  796192448 and 797350569 (BGA offers no aquarium, the engine still does; the base / Marine Worlds flag comes from the index later), and sponsor building
  placements (kiosk, size-1, sea-turtle, entrance) of games whose map could not be inferred.
- Games with an unknown map give wrong map income.
- Conference on Europe marks use the Mark rules of `engine/marks.py` (rules given for the Mark ability); not checked separately in the logs.
- Basic Research: pairs are counted as the number of different continent / species kinds present, divided by 2.

## Animal abilities: unclear rulings

All 160 animals are implemented, on the assumptions below. `scripts/engine_problems.py` lists what still differs from the logs.

### Open questions about the rules that are now implemented
- **Multiplier (confirmed):** BGA logs every repetition as a turn marker of its own: a `chooseActionCard` followed by `discardTokens` ("uses a multiplier token")
  is the 2nd (3rd, 4th) performance of the action, the first one happened in the turn before (without the `actionCardCleanup` of the card, which comes after the last
  one). The differential test joins such turns with the previous one; the engine's repeat prompt (a new choice at the card's strength plus X tokens) is checked this way.
- **Hypnosis and tokens (confirmed):** the Constriction token on the hypnotised card applies (strength - 2, minimum 1); at the end of the hypnosis the Venom and
  Constriction tokens of that card are removed (the owner pays nothing then, it is not their turn; Venom is only paid at the end of the owner's own turn, and the hypnosis removal does not count as their own removal).
- **Marketing sponsors:** the extra Sponsors-card cleanup after a Marketing play belongs to the "marketing sponsors" variant (Marine Worlds); it is not
  implemented (turns with it are skipped or differ). The map ability of AI (12), the concealed strength numbers, is implemented (`map_rules.strength_bonus`).
- **Marks of Animals4:** BGA logs the mark of an Animals4 turn after the next action of the same player in some turns (791295095 turn 64, 763400083 turn 5);
  the differential test skips those turns ("mark logged in a later turn").

## Conservation projects: rulings found in the logs or assumed
- **Release projects:** the animal released must have the icon and the size of the slot (large 4-5 / medium 3 / small 1-2 for the slots worth 5 / 4 / 3;
  BGA's `animalIds`, 108 lists, one exception: an Indian Rock Python of size 2 in a reptile house was not offered for the small slot). The released animal's
  appeal is lost. Adding the card gives 1 reputation (the card data has no place bonus for it).
- **Management plans:** requirement 2 icons of the kind (all slots then free); slot 1 the keyword (Hunter per icon, Posturing 1, Sunbathing 2, Digging 2, Clever,
  Sea Animals: Reef), slot 2 reputation per 2 research icons, slot 3 a Tutor (the first card of the kind in the deck); the place bonus is the keyword of the card
  (checked against 4 logs). **Activate Reef** (P138 slot 1): every Reef Dweller effect of the animals of one aquarium (one log: 801082957 turn 37).
- **Breeding programs:** only the requirement and the slot gains of the data (conservation + reputation); the logs show nothing else.
- **Supports of discarded projects** still count for Conservation Zoo, Breeding Cooperation / Program (the tokens leave the board but the count stays).
- **Reputation track** corrected from the logs (the old table was shifted and lacked the worker at 8 and the cards at 10 / 13); players below 5 appeal are
  protected from Venom, Constriction, Pilfering and Hypnosis (was defined, now applied).
- **Map T1:** the 1st and the 2nd hired worker give 1 reputation each (logs); the hand-card discard for +1 strength is implemented (`map_rules.t1_discard_possible`).

## Action card variants: rulings assumed
Implemented for all five action cards, levels I and II (texts in `data/action_cards.json`). Printed appeal / reputation / conservation of every played animal
are pending effects of their own (any order). Open points:
- **Peaceful mode** (`GameConfig.peaceful`, inferred from the logs): replacements Venom X -> X X tokens, Constriction -> Clever, Pilfering 1 -> 3 money,
  Pilfering 2 -> Sprint 2, Hypnosis -> Mark. Only Venom's is confirmed by the user; the others are inferred from the logs.
- **Supply (Association 1):** 4 copies of each partner zoo and of each non-category university tile (the board copy counts); category universities exist once
  each (`association.supply_left`). Association 2 level II: each extra worker lowers the needed strength by 2; the needed strength is clamped at 0 (not
  confirmed; the logs do not distinguish 0 from 1).
- **Sponsors 2:** the bonus money comes once per action, with the first money gained (confirmed).
- **Sponsors 3 level II:** discard any card for 4 money, or to increase the action strength by 2 (the card text says "reduce the level by 2"; the user's
  ruling is the strength increase). **Sponsors 4 level II:** with the break option, discard a card to play a sponsor from the hand for money equal to its level.
- **Cards 4, level I (confirmed):** the Clever put-back costs 2 money.
- **Build 4 (Terrain Build, confirmed):** the player may cover 1 rock / water hex; level I pays 2 money more, level II gets 2 money back. There is no special
  aquarium rule (the aquarium placement rule below stays as the logs show it); a rock / water hex covered by a building no longer counts for the rock / water
  requirement of an enclosure next to it when animals are played.
- **Aquarium placement (from the logs):** an aquarium needs an uncovered water hex next to it unless it covers a water hex itself (BGA offers an aquarium on a
  water hex without other water; one that covers rock still needs water).
- **Animals 1 (confirmed):** when the strength allows 2 animals (level I: strength 5; level II: 3-5) the player may, before playing any animal, choose to play
  only 1 and ignore 1 of its conditions (`animals_single`); level II at strength 5 still gains the reputation. **Animals 2 (confirmed):** at the end of the action
  the player may reveal that their hand has no animals and then does Hunter 4 / 6; not revealing is allowed. **Animals 3 level II:** paying appeal is optional per
  animal. **Animals 4:** the mark is taken at the end of the action.
- **Reputation gains at the cap** log nothing in BGA; the engine still keeps them as a pending effect (the differential test resolves them silently).
- Remaining differential problems with Animals variants (904792899 turn 98 plays from the display with Animals 4; 799844775 turn 20 action card order; 801016546
  turn 17 and 903714215 turn 27 show no Pilfering 2 where the engine pilfers twice: a tie in appeal and conservation, see Pilfering below) are not explained yet.

### Implemented on an assumption
- **Pilfering 1 / 2:** the target is the opponent when their appeal (Pilfering 2: also conservation) is at least the actor's, before the animal's printed gains
  (a tie counts: log 791338307 turn 21 shows two payments with equal conservation). Turn 37 of 795621374 (Japanese Macaque, appeal 7 against 10) and turn 17 of 801016546
  (Pilfering 2, tie in appeal and conservation) show no Pilfering at all, which this does not explain (in the logs Pilfering 2 events appear with the
  opponent ahead in appeal, in conservation or in both). Victim (rulings given): with 5+ money and cards they choose a card or 5 money; with less than 5 money
  they give a card; without cards they pay 5; with less than 5 money and no cards they pay what is left; with nothing, nothing happens (per pilfer).
- **Determination / Action: X (confirmed):** a second action of the same player after the first card went to slot 1, at that card's new strength, X tokens
  allowed; Determination cannot repeat the Animals card, can be skipped as usual and any of its actions can be put back for an X token; Action: X can be skipped but not put back
  for an X token. Not checked against the logs beyond the turn structure.
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
- **Reputation:** gains beyond the cap of 9 (Cards action not upgraded) are lost without appeal (the 1 appeal per lost point only applies above 15: logs).
  A variant card does not raise the cap (confirmed: seat 1 of 800231247 upgraded its Cards action at move 366).
- **Sunbathing sells for 4 money a card, Petting Zoo Animal 3 appeal per pet icon, Pack counts the animal itself, Iconic Animal counts both zoos (max 8):** all
  checked against the logs, listed here because the card data does not say it.
- **Marine Worlds sponsors S266, S270, S277, S279 have a Wave icon**: the card data only has the flag on animals; found from display refills in the logs.
