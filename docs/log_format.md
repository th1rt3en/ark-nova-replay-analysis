# BGA Ark Nova replay log format

Findings from the 114 logs in `log_examples/` (2026-09-30 analysis). Raw generated evidence (every event type with templates and arg keys, every state id, deck-exit checks) is in `docs/log_events.md`; regenerate it with `python scripts/analyze_logs.py`.

## Envelope
`{status, data: {logs: [packet...], players: [{id, color, name, avatar}]}}`.

Packet: `{channel, table_id, packet_id, packet_type ("resend" everywhere), move_id, time, data: [event...]}`.
- `channel`: `/table/t<id>` = public events; `/player/p<id>` = events private to that player. **Both players' private channels are in every log**, so every card a player sees is recoverable.
- Ordering: packets are in `packet_id` order and this is chronological order; within one `move_id` the private packets come first and the table packet last; events inside a packet keep their real order (e.g. `discardCardsOnDisplay` then `fillPool`).
- `move_id`: BGA's step counter (one per player request), never decreasing, but with gaps (a step with no notification) and 171 packets with `null` (e.g. `wakeupPlayers`). `packet_id` is not gap free either.
- Event: `{uid, type, log (template), args, [h, lock_uuid, synchro]}`. `args` is usually an object, sometimes `[]`.
- Cards: `{id, location, state, pId, extraDatas}`; ids are `<A|S|P|F><number>_<Name>[_MW]` (see `docs/data_sources.md`). Locations seen: `hand`, `scoringHand`, `pool-1..6` (display), `inPlay`, `discard`, `projects_0`, `board`, `notepad`, ...

## Games in the sample
113 of 114 have a 2-player `players` list; 100 finish with `finalScoring`, 13 end by `playerConcedeGame` (no `finalScoring`, result only in state 99). Special files:
- `791410854`: `players` is empty (a concede). Derive player ids from the `/player/p<id>` channels.
- `800035115`: aborted after 21 packets (`skipTurnOfPlayer`, `gameResultNeutralized`). Unusable, skip.
- `800629934`: `reconstructionRemove` / `reconstructionPlaceBack` are the sponsor card *Reconstruction* effect (buildings picked up and put back), not an anomaly.
- `newUndoableStep` ("Undo here", 15 files) marks BGA undo checkpoints. No undo events appear, so undone actions seem to be absent from the log (to confirm).
- 95 logs contain `_MW` card ids (Marine Worlds); 11 have no MW cards at all. The BigQuery flag is authoritative. Note `S274_VictoryColumn` (tagged Marine Worlds upstream) appears in 6 logs with no other MW card, so it is probably not MW-only.

## Turn structure (what a "move" is)
`move_id` = one player request; the sequence for a turn looks like this (public non-noise events, state ids in brackets):

```
20 choose action card    -> chooseActionCard [+ advanceBreak/getBonuses]        (state 30 Build | 32 Animals | 33 Association | 34 Cards | 35 Sponsors)
resolve effect(s)        -> buyBuilding / buyAnimal / playSponsor / slideMeeples / snapCard / drawCards+discardCards ...
                            with getBonuses / takeBonus / choices via state 91 (generic effect choice list) or specific states
88 end of action         -> actionCardCleanup (+ the last effect) then state 7 -> 20 for the next player
```

Statistics over the 45,434 move ids: 9,595 contain no public non-noise event. They are state-only (mostly `20 -> 20`, `7 -> 20`, or private selection updates such as `updateBreakDiscardSelection`). **Replay steps should be the move ids that contain at least one non-noise event**, and the private selection updates (initial selection, break discard) are the only private events that matter. 0-17 public events occur per move id; the most common are 1 (18.9k) and 2 (9.9k).

Noise (ignore): `gameStateChange`, `gameStateMultipleActiveUpdate`, `updateReflexionTime`, `midmessage`, `wakeupPlayers`, `simpleNote`, `simpleNode`, `newUndoableStep`. `midmessage` still carries `infos` (below).

## Setup sequence
`gameSetup` (state 2/3/4/5/8) -> optional `updateInitialMapSelection` / `setupPlayer` (map choice, 16 of 114 logs; the BigQuery index has the map for every game) -> `updateInitialActionCardSelection` / `updateInitialActionCardsKeep` / `setupActionCards` (each player's action card sides) -> each player gets 8 deck cards (`pDrawCards` "from the deck") + 2 scoring cards (`scoringCard: true`), then `updateInitialSelection`: discard 4 of the hand (8 cards; 9 with Map 14, whose person sponsor is found right after the deal) ("discards 4 cards (initial selection)"); the scoring cards are both kept -> `fillPool`: the first 6 display cards -> turns start (state 20).

## Deck exits (input for the seed strategy)
Everything below was checked over all 114 logs. **Counting every card that leaves the main deck (classified as below) plus every `fillPool` card gives 0 duplicates in all 114 games (max 136 exits per game): the deck was never reshuffled.**

- There are **three decks** (rules confirmed by the user): see "The three decks" below. The seed prefix applies to the *main* deck; the other two have their own logged draws.
- **Top-of-deck exits, fully logged** (`pDrawCards`, by `log` template): "from the deck", `hunter`, `perception`, `scuba dive`, `sprint` effects (draw n, keep some; the rest is discarded and logged with `pDiscardCards` "keep X and discard Y"), plus `fillPool` (`args.cards` = the *new* cards only, in the order they enter pool-6; `args.pool` = the whole display).
- **Search / tutor exits, only the found card is logged**: "gaining a new university with <SEARCH-type>", "monkey gang", "<type> card (source)" (e.g. management plan, Map 14, worker bonuses: person sponsors), "Map 8 effect" (first sponsor), "Waza Special Assignement" (animal). *Dominance* is not a deck exit: like *Assertion* it fetches a base project that is not in the deck. **Rule (confirmed): the engine takes the first card in deck order that satisfies the condition; all other cards keep their order (no shuffle, nothing discarded).** So a search removes one card from somewhere below the top and leaves the rest untouched: the skipped cards are simply still in the deck, and later top draws are unaffected. The deck order is therefore still one consistent permutation of which we observe a subsequence. See "Seed construction" below.
- **Not deck exits** (do not add to the order): `scavenging` / `Horse Whisperer` (drawn from the discard pile, random, all 218 cards had been seen earlier), `Pilfering` (from the opponent's hand), `Assertion` (a base project taken from the unused ones, see below) `Assertion` (a base project taken from the unused ones, see below) and every `scoringCard` draw (`adapt`, `resistance`, setup).
- Display removals (`discardCardsOnDisplay`: first two at a break, Wave icons, `digs`, rightmost project, Shark Attack, expedition) go to the discard pile and are logged with ids.
- Public `drawCards` duplicates the private draw with only a count (`n`) or `cards`; use the private one for identities. Counts match (public n vs private cards) except a few +1 differences (searches).

### Seed construction (how to build the engine deck from a log)
Walk the exit events in time order. Top-of-deck exits are the next cards of the deck. A searched card X (condition T, e.g. "animal with reptile icon", "sponsor", "conservation project") sits at an unknown depth: it must come before every card of type T that exits the deck later, and all cards above it are non-T. The maximally faithful deck therefore places X immediately before the first *later* exit of type T (or at the end of the observed sequence if there is none), instead of on top. Unobserved cards (never drawn in the log) follow in random order, shuffled by the tail seed. Self-check for the parser/seed finder: replay every logged draw and search on the constructed deck with the engine rules (top draw / first match) and require the exact logged cards.

## The three decks
| deck | cards | how cards leave it in the log |
|---|---|---|
| **main** | all animals, all sponsors, the non-base projects: release (P113-P122), breeding (P123-P127), P128-P132 (aquatic, geological, small animals, large animals, research) and, with Marine Worlds, the management plans P134-P139 | `pDrawCards` "from the deck" and the effect draws, `fillPool`, searches (see above) |
| **endgame** (final scoring) | 11 cards (F001-F011) in the base game, 17 (F001-F017, with the `_MW` versions of the six changed ones) with Marine Worlds. Each player gets 2 at the start and keeps 1. Two elephants have *resistance* (draw 1 more); *adapt X* (several sources) draws X and discards X | `pDrawCards` with `scoringCard: true` (setup, `adapt`, `resistance`); discards logged with "(scoring card)" |
| **base projects** | species diversity P101, habitat diversity P102, 5 continents (P103-P107), 5 animal projects (primates P108, reptiles P109, predators P110, herbivores P111, birds P112) and, with Marine Worlds, sea animals P133 (12, or 13 with MW) | at the start of a 2-player game **3 random ones are put in the playing area** (locations `base_0`, `base_1`, `base_2`). The rest are unused; the *Assertion* effect fetches one of them |

Log evidence for the base projects: in 58 of 114 logs exactly 3 distinct base projects are ever mentioned, in 12 only 2 (the setup selection is **not announced**: a board project first shows up when someone supports it, `slideMeeples` to `base_N`); in the 37 logs where Assertion was used the choice list mentions 11-13 (all unused ones), so the 3 board projects are recoverable as the complement. Base projects never come out of the main deck, and an Assertion pick never coincides with a project used in play (0 of 44 in 39 games). **Assertion cards join the normal card flow:** a base project fetched with Assertion sits in the player's hand like any card; if it is sold or discarded it goes to the *main discard pile*, from where *scavenging* (and Horse Whisperer) can pick it up again. So the main discard can contain base projects, and a scavenge draw of a base project is legitimate.

**Decision: the user enters the 3 base projects** when opening a replay (known issue: logs sometimes do not contain all of them). The UI pre-fills the ones the log does reveal (used projects, or the complement of the Assertion list) and the user completes/corrects the rest; the replay and the engine take the 3 ids as a required input, so nothing is inferred or randomised. Valid choices: P101-P112, plus P133 only if the game has Marine Worlds.

## Setup facts (implemented in `parser/setup.py`, replayed by `tests/test_setup_replay.py` on 113 logs)
- Deal order = the card `state` counter (first player first), not the packet order. Deal: 8 main-deck cards and 2 endgame cards per player; Map 14 then finds a person sponsor for its player (a search, seat order); each player discards 4 of the hand (`pDiscardCards`); then the display gets 6 cards; the first player starts with `choose_action_card`.
- Action cards: 5 per player, each `(type, variant)` with variant 0 = standard, 1-4 = alternative sides (`Cards1`, `Association4`). `setupActionCards` lists id -> slot (`strength`) when the log has it. Otherwise the initial slot order is rebuilt from the first `chooseActionCard` (its slot) and the next `actionCardCleanup`: **`actionCards` maps card id -> new slot**; the used card goes to slot 1 and the cards that were below it move up one. This rebuild agrees with `setupActionCards` in 188 of 194 cases (the rest is fixed by pairing the cleanup with the chosen card id).
- Both endgame cards are kept until one is discarded later (`DISCARD_SCORING`, conservation 10).
- The private `gameStateChange` id 20 carries `_private.statuses` for every hand card (playable, conditions, cost, enclosures): an oracle for `legal_actions` later.

## Conservation threshold bonuses
`takeBonus` events carry `args.conservationBonuses`: per threshold ('2','5','8','10','99') the options still on offer, each with `permanent` (5 money, worker/upgrade at 2, ...) or removable (the random ones, gone once a player took them). The first table appears when a player first reaches 2 conservation, so the union over the log gives the initial draw: complete in 110 of 113 logs (`parser/conservation.py`). In 3 logs (796266447, 797138724, 800709592) the first table was logged after a player had already taken a 5-conservation option, so one option is missing and the user must enter it. Threshold '99' also appears in most tables (`bonus-icon` / `bonus-scoring-cards`); its meaning is not known yet.

## Turns
- BGA enters state 20 ("choose an action card") at the start of every turn: `ParsedLog.turn_markers` (event order, active player) cut the log into turns; events before a marker in the same move belong to the previous turn (display refill). Repeated markers with nothing between them are state re-entries.
- **A turn can be skipped without performing an action**: no `chooseActionCard`, a `getBonuses` (+1 X token) and an `actionCardCleanup`. The card still moves to slot 1. In odd cases the logged cleanup names the other player's card (BGA quirk); the marker's active player is the actor.
- Some effects make the log's turn order differ from strict alternation (hypnosis: the opponent skips a turn) and change the logged strength of a card (Venom / Constriction / hypnosis tokens: `actionCard.strength` differs from the slot).
- The Cards action tables and the reputation range are in `engine/cards_action.py`; the oracles used by the replay builder now also cover X tokens (state-20 `xtokens`, the active player's count).

- BGA's state 30 (Build) carries the legal placements per building type (`buildings`: `{type: [{pos: {x, y}, rotations: [...]}]}`), the remaining size (`maxSize`), the level (`lvl`) and `canPass`. It is the oracle for the Build rules (see `docs/engine_design.md`).

## Checkpoints to validate an engine against
`args.infos` on many events (`getBonuses`, `buyAnimal`, `slideMeeples`, `drawCards`, `midmessage`, ...) carries authoritative per-player state:
`score` (the running BGA score; starts negative, e.g. -14), `income`, `icons` (Bird, Predator, ..., Science, Rock, Water, SeaAnimal, Partner-Zoo, AnimalsII, CardsII), `sizes` (small/medium/large), `handLimitStatus`, `mapStatus` (map bonuses), `projectStrength`. The golden tests can compare the engine to these after each event. Final results: `endOfGame` (`infos.score`, income), `finalScoring` (score, appeal, conservation, scoringHand), and the `gameStateChange` id 99 (`result[]`: rank, score, `concede`).

## Event and state catalogue
See `docs/log_events.md`. Highlights:
- 63 event types. Gameplay results: `chooseActionCard`, `buyAnimal`, `buyBuilding`, `playSponsor`, `slideMeeples`, `addMeeples`, `discardTokens`, `getBonuses`, `takeBonus`, `upgradeCard`, `actionCardCleanup`, `donation`, `moveProjects`, `releaseAnimal`, `moveAnimal`, `snapCard`, `markCard`/`markAssign`/`gainMarked`, `storeCard`/`unstoreCard` (Caves), `increaseSize`, `cutDown`, `enableMultiplier`, `pilfering*`, `hypnosis`, `sponsorMagnet`, `wazaSpecial`, break events (`startBreak`, `advanceBreak`, `finishBreak`, `updateBreakDiscardSelection`).
- 60+ `gameStateChange` ids; state 91 is the generic "resolve one of these effects" list (`choices`, `allChoices`, `anytimeActions`), 93 the automatic-action state. Effect-specific states (30 build, 32 animals, 33 association, 34 cards, 35 sponsors, 37 upgrade, ...) are mapped in `docs/log_events.md` by arg keys and the event that follows. Names are not in the log.

## Open items
1. Undo: confirm that undone steps never appear in the log.
2. Full state-id -> meaning table (only the main states are interpreted).
