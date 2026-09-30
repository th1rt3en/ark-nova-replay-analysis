# BGA Ark Nova replay log format

Findings from the 29 samples in `log_examples/` (first-pass analysis; verify against more samples before locking the parser). Sample sizes are 5-17 MB, 785-1583 packets.

## Envelope
`{status, data: {logs: [packet...], players: [{id, color, name, avatar}]}}` (exactly 2 players in every sample).

Packet: `{channel, table_id, packet_id, packet_type ("resend"), move_id, time, data: [event...]}`.
- `channel`: `/table/t<id>` = public events; `/player/p<id>` = private events for that player. Both players' private channels are in the log, so all hidden info is recoverable.
- `move_id` is BGA's notification step counter (1..~460+), one per player decision/step; several packets (one per channel) share a `move_id`. Some packets have `move_id: null` (e.g. `wakeupPlayers`). This is the natural replay "move" (sub-decision) index. **TODO:** confirm that one move_id = one engine action in all cases.
- Event: `{uid, type, log (template), args, [h, lock_uuid, synchro]}`.

## Event types (count across 29 files; files containing it)
Noise, ignore: updateReflexionTime, gameStateMultipleActiveUpdate, midmessage, wakeupPlayers, simpleNote, simpleNode, newUndoableStep.

State machine: `gameStateChange` (41k, all files). `args.id` = BGA state id (e.g. 91, 20, 93, 33, 35 dominant), `args.active_player`, `args.args` = the options offered (`choices`, `allChoices`, `anytimeActions`, `_private.slots`, ...). Contains the legal choices at each decision, which is useful for validating engine `legal_actions`. The first one is `name: "gameSetup"`. The state-id -> meaning table is a TODO.

Setup: updateInitialSelection, updateInitialActionCardSelection, updateInitialActionCardsKeep, setupActionCards, updateInitialMapSelection, setupPlayer (only present in 6/29 files: `args.mapId` e.g. "3a", "9", "14", plus initial `meeples`/bonus tokens). **Do not rely on the log for maps: the BigQuery log index stores each player's map**, and the replay builder takes maps from there.

Gameplay: chooseActionCard, buyAnimal, buyBuilding, playSponsor, slideMeeples, addMeeples, discardTokens, getBonuses, takeBonus, gainMarked, markCard, markAssign, upgradeCard, actionCardCleanup, donation, moveProjects (new conservation project onto board), releaseAnimal, moveAnimal, enableMultiplier, cutDown, increaseSize, hypnosis, pilfering/pilferingMoney/pilferingCard, sponsorMagnet, wazaSpecial (card-specific effects).

Cards / deck movement: drawCards (public, count only) + pDrawCards (private, card ids), discardCards + pDiscardCards, fillPool (display refill, ids public), snapCard, discardCardsOnDisplay.

Break: startBreak, advanceBreak, finishBreak, updateBreakDiscardSelection.

End: endOfGame (game-end triggered, `infos.score`), finalScoring (per player: score, appeal, conservation, scoringHand), playerConcedeGame (5/29 games ended by concede: **no finalScoring**).

## Card ids
Format `<Letter><number>_<Name>[_MW]`: `A` animal, `S` sponsor, `P` conservation project (the "release into the wild" ones can be held in hand and drawn from the main deck), `F` final scoring card; `_MW` suffix = Marine Worlds. Card objects: `{id, location, state, pId, extraDatas}`; locations seen: `hand`, `scoringHand`, `pool-1..6` (display), `inPlay`, `discard`, `projects_N`, `board`.

## Deck order reconstruction (for the seed finder)
- Main deck draws: `pDrawCards` (`args.cards`, ids in draw order) and `fillPool` (display refills, ids in order). Interleave chronologically by packet order.
- Scoring deck: `pDrawCards` with `args.scoringCard: true` (2 per player at setup; F cards).
- Display starts with 6 cards via the first `fillPool`. Cards removed by `discardCardsOnDisplay` and by breaks are known.
- Some card effects draw from the *shuffled discard* ("Draw ${n} from shuffled discard, keep 1"): these are outside the original deck order. Reshuffles of the deck itself are not explicit events; detect them by tracking deck size (the deck runs out, then the discard pile becomes the deck).
- The public `drawCards` event duplicates the private `pDrawCards` with only a count: use the private one for identities, and the public one to validate counts.

## Open items
1. state-id (gameStateChange) catalogue.
2. Maps come from BigQuery (per-player map). Cross-check against `setupPlayer.mapId` where present. The Marine Worlds flag also comes from BigQuery (`marine_worlds`); cross-check against `_MW` card ids in the log.
3. Whether all hidden draws for both players are always present (spot-check `pDrawCards` count vs `drawCards` n per game).
4. Confirm move_id -> engine-action mapping.
