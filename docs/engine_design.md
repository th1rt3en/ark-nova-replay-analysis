# Engine design: state, actions, determinism

Code: `src/ark_nova/engine/` (`state.py`, `actions.py`, `rng.py`, `serialize.py`, `game.py`). Only the foundation exists; rules are phases 2-4 of `PROJECT_OUTLINE.md`.

## Principles
1. **Pure and deterministic.** `apply(state, action) -> new state`; no I/O, no wall clock, no `random`. All randomness is `Rng` (SplitMix64, one 64-bit int stored in `GameState.rng`), so a game is reproducible from `(config, seed, actions)` on any platform.
2. **One `Action` = one log move.** A replay move is one effect resolution / sub-decision (`move_id`). **Replay states are built from the log events, not by running the rules engine** (`replay/builder.py`): the viewer therefore works for every card and effect in the log, stepping back is an index change, and a fork simply loads the state of the chosen step. The engine is validated **transition by transition** against these states (differential test: `apply(state_i, action_i) == state_{i+1}`), so unimplemented rules never block the replay and each rule can be checked in isolation. `ACTION_SPECS` lists the action kinds with the log events they are parsed from.
3. **Effects are data.** Card and map abilities push `Effect`s on `state.pending`; the engine asks the active player for the next decision through `state.prompt` (BGA's state 91 "resolve one of these effects" / 93 "automatic"). `legal_actions(state)` answers the current prompt only.
4. **State is data, rules are code.** `GameState` is dataclasses only, JSON round-trippable via `to_dict` / `from_dict` (generic, driven by type hints in `serialize.py`). Fork sessions live in the browser as `(config, seed, actions)` or a serialized state.
5. **Derived values are not stored.** Icons, sizes, income, score, hand limit and reputation range are computed from the state (`engine/derive.py`, later) and checked against the log's `args.infos` after every event.
6. **Mirror BGA where it costs nothing.** Tokens/meeples keep the BGA location strings (`bonus_N`, `supply_N`, `reserve`, `association_N`, `partner_N`, `university_N`, `actionCard_N`, `notepad`, `PN_<Project>_N`, ...), so the parser copies them; typed views (e.g. "partner zoos") are computed from them.

## State (see `state.py`)
- `GameConfig` (fixed): `marine_worlds`, `player_ids`, `maps` per seat, the 3 `base_projects` (entered by the user). Seat 0 = first player; 2 players only.
- `SeedSpec`: `tail_seed`, `main_order` and `endgame_order` (known deck prefixes from the log, top first; see "Seed construction" in `docs/log_format.md`).
- Global: `phase`, `turn`, `active_player`, `break_position`, the three decks (`main_deck`/`main_discard`, `endgame_deck`/`endgame_discard`, `base_projects` in play + `base_projects_unused`), `display` (6 slots, slot 0 = `pool-1`), `projects_in_play`, `pending` effects, `prompt`, `end_triggered_by`, `result`.
- `PlayerState`: money (25 at start), appeal, conservation, reputation, X tokens, `action_cards` in strength-slot order, `hand`, `endgame_hand`, played `animals` / `sponsors`, `released`, `stored` (Caves), `pouched`, `buildings` (id, type, x, y, rotation, animal), `tokens`, `flags` (once-per-turn markers and map/card counters).
- Deck membership (`game.deck_cards`): main = animals + sponsors + non-base projects (214 cards; 267 with Marine Worlds); endgame = 11 (17); base projects = 12 (13). Cards with `active: false` (`A341` Capybara and `S282` Promotion Team, not in the BGA game) are in no deck; `S274` Victory Column and `S281` Arcade are base-game cards. The main discard pile can also hold base projects: a base project fetched with Assertion goes there when sold or discarded, and scavenging can take it back.

## Determinism and seeds
`initial_state(config, seed)` builds each deck with `build_deck(all_cards, known_order, rng)`: known prefix first, the rest shuffled by `Rng(tail_seed)`. The seed finder (phase 7) only has to produce `main_order` / `endgame_order` from the log, following the search rule (first match in deck order, everything else keeps its order).

## Action kinds (initial vocabulary, `actions.py`)
setup: `initial_discard` (4 of the 8 dealt cards; `choose_map` / `choose_action_cards` exist for a future full setup) / turn: `choose_action_card` / effects: `play_animal`, `place_building`, `take_card`, `discard_cards`, `play_sponsor`, `association_task`, `donate`, `upgrade_action_card` / generic: `choose_effect`, `skip`. Kinds and argument names are added as the rules are implemented; each comes with the log event(s) it is parsed from.

## Turn flow (from the log state machine, `docs/log_events.md`)
`20` choose action card -> `chooseActionCard` -> action-specific state (`30` build, `32` animals, `33` association, `34` cards, `35` sponsors) -> effects (`91` list, specific states) -> `88` end of action (`actionCardCleanup`, break check) -> next player. Breaks: `10` start, `11` discard selection, `12`/`13` income and refill, `14` finish. End game: `endOfGame` marks the trigger, the other player gets a last turn, then `finalScoring`.

## Parser (`src/ark_nova/parser/`, phase 5, first part)
- `parse_log(raw|path) -> ParsedLog`: players (derived from the private channels when the list is empty), `moves` (one per non-state-only `move_id`, events in chronological order, public twins of private events dropped), result rows (state 99), conceded player, `finalScoring` scores.
- `deck.extract_exits(parsed)` lists every exit of the main and endgame decks; `known_order(exits, deck, from_seq)` builds the `SeedSpec` prefix for a fork at any point (search rule included); `simulate(...)` replays the exits on that deck. Checked on all 114 logs, also from a mid-game fork point (`tests/test_parser.py`).
- Not done yet: turning each move's events into `Action`s. That needs the rules of each action (they define what one action is), so it is built together with phases 2-4, action by action, always checked by replaying the logs.

## Tracks and thresholds (rules from the user, `engine/tracks.py`, tests in `tests/test_tracks.py`)
- Appeal 0..113 (first / second player start at 0 / 1), conservation 0..41 (start 0, only ever grows). A gain above a limit is lost. Appeal can be lost (releasing an animal), conservation never.
- **Score** = appeal + conservation points; the conservation track gives -14 at 0, +2 per step up to 10 (6), then +3 per step (99 at 41). Checked on all 200 `finalScoring` events.
- **End of game** is triggered when a player's score reaches 100 (the two markers meet); the smallest logged trigger score is exactly 100 (checked on 96 `endOfGame` events).
- **Break income** from appeal: 5 at 0, +1 per appeal up to 5 (10), +1 per 2 up to 17 (16), per 3 up to 32 (21), per 4 up to 56 (27), per 5 up to 96 (35), then per 6 (37 at 113). These are also the badge numbers printed on the track.
- **Protection:** below 5 appeal a player is protected from venom, pilfer, constrict and hypnosis.
- **Thresholds:** at 2 conservation: unlock a worker or upgrade an action card; at 5 and 8: choose one of 2 random bonuses (removed for the other player once taken) or 5 money (always available, never removed); at 10 (first player to get there): both players discard one of their two endgame cards, once (also just before final scoring if nobody got there).
- The 2 random bonuses for 5 and 8 are drawn at the start: `GameConfig.conservation_bonuses` (extracted from the log by `parser/conservation.py`, which is complete in 110 of 113 logs; in 3 a player skipped past a threshold before the first table was logged, so one 5-conservation option must be entered by the user). `GameState.conservation_options` holds what is still on offer.

## Setup (implemented)
`start_game(config, seed)`: decks from the seed, the first player gets the top 8 main cards and 2 endgame cards, the second player the next ones, Map 14 players find a person sponsor (`search_deck`, first match), the whole hand is offered for the `initial_discard` (4 cards, either player first); when both are done the display gets 6 cards and the first player is prompted `choose_action_card`. `GameConfig.action_cards` carries each seat's action cards (type, variant, initial slot order). Replayed on 113 logs against the deal, endgame cards, discards, display and action cards (`tests/test_setup_replay.py`).

## Log-driven replay (implemented, `src/ark_nova/replay/`)
`build_replay(parsed, setup, config, seed)` starts from the engine setup and applies each move's events with small handlers (`HANDLERS` in `builder.py`): action card choice/cleanup/upgrade, break advance, bonuses (money, appeal, reputation, conservation, X tokens), draws (top / search / scoring / discard pile / opponent / unused project), discards (sell, pouch, store, endgame), display (snap, refill, removal, mark), purchases (animal, building, sponsor, project), release, cut down, increase size, move animal, reconstruction, tokens/meeples, donation, pilfering money, end of game. It returns one deep-copied `GameState` per move plus `unhandled` event types and `mismatches` against the log's own oracles:
- **hand + display + endgame (+ stored) snapshots** from the private state-20 `statuses` (16,084 checked),
- **money after every purchase** (`total` minus the price, 5,480 checked),
- **the running score** on bonus / release / donation events (`score` = appeal + conservation points, 16,286 checked),
- **deck order** (every top draw and display card must be the top of the deck).
Result on the 113 usable logs: no unhandled event type and 0 mismatches (`tests/test_replay_builder.py`, `scripts/replay_coverage.py`). Map/base project inputs are inferred in tests (`replay/config.py`) and come from BigQuery / the user in production.

## Turn loop (implemented so far: `engine/game.py`, `engine/cards_action.py`)
`choose_action_card {type, spend}` (strength = slot + X tokens spent) or `skip_action {type}` (nothing is performed, the card still goes to slot 1 and the player gains 1 X token, at most 5) -> the Cards action (`cards_take` -> `cards_discard`) -> end of turn: the used card goes to slot 1 (the cards below it move up), the display is refilled (gaps close towards slot 1, new cards at the end), the turn passes, the break token has moved by 2 for the Cards action. Breaks (token at 9), reshuffling the discard pile and every other action card are `NotImplementedError` for now; variants 0 (base) and 1 (keep cards) of the Cards action are done.
Rules found while checking against the logs (all documented in `engine/cards_action.py`): reputation range (0-1: 1 slot, 2-3: 2, 4-6: 3, 7-9: 4, 10-12: 5, 13-15: 6, the stretches of the track under the display) applies to *drawing* from the display, **snapping takes any display card** (the upstream card text says "within range", the logs say otherwise), skipping an action gives an X token.

**Differential test** (`replay/differential.py`, `scripts/engine_coverage.py`, `tests/test_engine_turn.py`): for every turn of every log the events are turned into engine actions (`replay/actions.py`); a turn is supported when all its events map to implemented actions. Result on 113 logs: 7,347 turns, **588 replayed by the engine, all actions legal, all end states equal to the replay** (hand, money, tracks, X tokens, action card order and levels, display, deck, discard, break position, active player). The rest are skipped by reason (association 1,655, build 1,254, sponsors 878, reputation bonuses 700, animals 596, breaks ~360, ...): that list is the to-do list for the next rules.

## Build action (`engine/build_action.py`, `engine/board.py`)
Variant 0, level I and II: strength = maximum total size, cost 2 per space, level II builds several buildings of different types and may stop early (`finish_build`). BGA publishes its own list of legal placements at every Build step (gameStateChange 30, `Move.checks["build"]`), and the engine reproduces it: 224 lists compared, 216 identical (the remaining 8 are aquarium / petting zoo details still open). What the list taught us (all reverse-engineered, nothing assumed):
- **Coordinates and shapes**: `x, y` is the anchor cell, `rotation` 0..5 turns the shape 60 degrees clockwise; size-1 has one rotation, all other shapes list every rotation. Shapes in axial coordinates around the anchor: size-2 `(0,0)(0,1)`, size-3 `(0,0)(0,1)(1,0)`, size-4 `(0,-1)(0,0)(1,-1)(1,0)`, size-5 `(-1,0)(-1,1)(0,-1)(0,0)(0,1)`, petting zoo `(0,0)(0,1)(1,-1)`, small aquarium = domino, large aquarium `(0,0)(1,-2)(1,-1)(1,0)(1,1)`.
- **Placement**: plain free cells only (rock/water only with Build variant 4, not implemented); upgrade-flag cells need level II; the first building touches the map border, every later one touches an existing building; on map 13 the centre marker (cells (4,5),(4,7), not buildable) counts as a neighbour for every building instead of the border rule; kiosks must be at least 3 hexes from any other kiosk; aquariums (Marine Worlds only) must touch a water hex; at most one petting zoo / small aquarium / large aquarium per player; a pavilion gives 1 appeal.
- The list lags one step in the log: BGA's private state event of a move shows the state *after* that move (private packets come before the public one).
- Reptile house and large bird aviary: size 5, level II only, one each, shapes fitted to BGA's placement lists (rulebook p.10/12: standard enclosures have no piece limit; moving animals into them belongs to the Animals action). Covering every plain space gives +7 appeal once, except on map 13 (0).
- Not implemented: the four alternative Build cards, most placement bonuses (only money and X tokens), the shapes of the sponsor buildings (zoo school, penguin pool, ...; turns with such buildings on the map are skipped), reputation gains.
- Test setup: the map of each player is not in the log (BigQuery has it); `replay/config.py` infers it from BGA's placement list before the player's first building (unique match with the boards) and Marine Worlds from the cards or from aquariums being offered. Players whose map cannot be inferred are skipped for Build.

Reputation is implemented too (`_gain` in `engine/game.py`): track 0..15, bonuses when a step is reached (10: +1 conservation, 11: +1 X token, 13: +1 conservation, 14: +1 X token, checked on single-step gains in the logs), gains above 15 become appeal (1 per point, to be confirmed). Conservation gains that cross 2/5/8/10 raise `NotImplementedError` (the choice prompts are not written).

Differential result on the 113 logs: 7,347 turns, **752 replayed by the engine (skip, Cards, Build), 21 discrepancies**, the rest skipped by reason (association 1,677, sponsors 906, money bonuses 636, animals 597, breaks 324, card effects outside the Cards action ~440, ...). BGA placement lists compared: 251.

## Validation strategy
1. Parser: every `move_id` of the 114 logs becomes one `Action`; unknown events fail loudly.
2. Seed: rebuild the main deck from a log and replay all logged draws/searches on it (top draw / first match): the exact logged cards must come out.
3. Engine: replay each log; after each event compare `derive(state)` with `args.infos` (score, income, icons, sizes, hand limit); at the end compare with `finalScoring` and the result in state 99.

## Open items
- Exact once-per-turn flags and map-specific state (harbor/institute connection, continent markers, Caves store, area bonuses of map 13): define with each map/card implementation.
- Association board slot numbering (`association_N`, `association_N_N`) and `supply_N` semantics: to decode from the logs when implementing the association action.
- Initial values (money 25 is confirmed by a log; appeal/conservation start values, the negative initial `score`) to confirm against `infos.score`.

## Sponsors action (foundation)
Rules from the rulebook p.17 (`engine/sponsors_action.py`): level I plays exactly one sponsor with level <= strength; level II plays several
with the levels adding up to at most strength + 1, from the hand or from the display within the reputation range (extra money = folder
number). Alternative: advance the Break by the strength and take that much money (twice at level II). Sponsors cost no money.
Prompt `sponsors_play`; actions `play_sponsor`, `sponsor_break`, `finish_sponsors`.
- Requirements: icon requirements come from `engine/icons.py` (checked against BGA's `infos.icons` by `scripts/check_icons.py`: all
  icons match except Water, see below). `appeal` / `reputation` requirements have no number in the card data: the form
  `data/sponsor_thresholds.json` (from `scripts/infer_sponsor_thresholds.py`) holds the observed hints; only verified values are enforced.
- On-play effects: `data/sponsor_play_effects.json` (from `scripts/infer_sponsor_effects.py`) classifies every sponsor by what the logs show:
  `fixed` (15 cards: plain gains, implemented), `variable` (formula over the zoo, 24), `complex` (cards, buildings, choices, 42),
  `unseen`. Only `fixed` cards can be played by the engine; the others raise NotImplementedError until their effect is written.
- Sponsor buildings: shapes fitted to BGA's placement lists by `scripts/fit_unique_shapes.py` into `data/unique_shapes.json` (19 of 21
  types found; `underwater-tunnel` (on water) is empty and needs manual input; `verified` flags are false).
- Passive effects of cards already in play (other player's Science Library income, Hydrologist, ...) are not implemented: the
  differential skips turns where BGA logs such a trigger.
- Icons: Water is not fully explained (sea animals and some cards seem to add water icons not in the card data); Rock, all animal /
  continent icons, Science (universities count) match.
- Also new: +7 appeal for covering every plain space (none on map 13), reptile house / large bird aviary (level II Build).
- Differential: 989 turns compared (83 sponsor plays and 55 break options among them), 533 BGA placement lists, 47 discrepancies (mostly
  aquarium placement lists of one game and unexplained appeal/money differences).

## Sponsor effects (`engine/effects.py`, `engine/card_programs.py`)
Playing a sponsor puts it into the zoo and its icons are "played into the zoo": every card in play fires its passive triggers once per
matching icon (`card_programs.TRIGGERS`; scope `any` also fires for the other player's zoo). Plain gains apply at once; decisions become
pending effects of the prompt `effects` (`prompt.args["pending"]`, `resume` = the sponsors prompt to continue with):
- `build` (free building: the sponsor's own unique building is mandatory, Expert on Americas / Europe / Asia offer a kiosk / size-1 /
  pavilion), resolved with `place_building`; `take` (Science Lab, Zoo School: deck or reputation range) with `take_cards`;
  `reveal` (Perception 2, Hunter X, Scuba dive 3: keep one), `sell` (Sunbathing 2), `pouch` (Expert on Australia, pouched cards are
  kept in `PlayerState.under`), `slot1` (Expert on Africa, resolved after the action card went to slot 1) and `search_discard` (Horse
  Whisperer) with `choose_effect`; optional effects can be declined with `skip_effect`.
- Own gains: printed values (`PRINTED_OVERRIDE` where the card data is wrong), `GAIN_PER_ICON` (Expert on X and Sponsorship cards:
  appeal per icon; Science Museum: 2 money per science icon), Landscape Gardener (appeal per pavilion). Building rules of the sponsor
  buildings: the card's rock / water requirement icons, border and water conditions (`UNIQUE_BUILD`); flagged spaces need the level II
  Build action also for free buildings; Diversity Researcher (S219) builds over water and rock and ignores their requirements.
- Building triggers: Hydrologist / Geologist (money per covered space next to water / rock), Landscape Gardener (1 X token per action
  for a pavilion), placement bonuses twice for the Excavation Site.
- Differential (`replay/differential.py`): triggers that the player declined leave no trace in the log, so the harness declines the
  optional effects that the next logged action does not use. 173 sponsor plays and 25 effect choices are compared with the logs
  (1106 turns, 48 discrepancies, of which the sponsor-related ones are map specific placement lists).
- Not implemented (raise NotImplementedError): Waza Special Assignment (marker), Reconstruction, Conference on Australia / Europe triggers (increase enclosure / mark a card), Okapi Stable's
  trigger (play a sponsor for money), Marine Research Expedition's "send a person away" option, Engineer during a Build action, (the Underwater Tunnel is now implemented).
- Sunbathing sells a card for 4 money (the 3 money seen in the logs is Commercial Harbor's own ability).
- Requirements confirmed by the user: Meerkat Den / Penguin Pool / Aquarium need reputation 3; the Native sponsors (Farm Animals, Seabirds,
  Lizards, Free-Range New World Monkeys, Farm Cat) need appeal 25 or less; Franchise Business needs a kiosk (its kiosk is optional; the
  kiosk income from other zoos is a break income, not paid on play). Underwater Tunnel is a size-2 shape that goes on 2 water spaces.
  (Players start at reputation 1, which explains the plays that looked like reputation 2; the replay also gives +2 for the reputation task.)

## Association action (`engine/association.py`, `engine/bonuses.py`)
Rulebook p.14-16. Prompt `association_tasks`; actions `association_task {task: reputation | partner | university | conservation, ...}`,
`donate`, `finish_association`. Tasks cost the action strength (2 / 3 / 4 / 5) and 1 worker (2 when one of yours is already on the task).
The upgraded action does several different tasks up to the strength and one donation (2, 5, 7, 10, then 12 money: shared track
`association_0_k`; Publications reduces the cost by 1 per research icon; also a sponsor effect `donation`).
- State: workers / partner zoos / universities / project tokens are player tokens with BGA's locations (`reserve`, `supply_k`,
  `association_<task>`, `partner_k`, `university_k`, `<project>_<slot>`), the tiles on offer are `board_tokens` (ids as BGA's first tile of
  each kind, so a replay and the engine agree); placeholder workers (ids 9000+) stand for BGA's workers until the replay sees them.
- Zoo-map spaces (confirmed by the user): the 2nd partner zoo and the 2nd university each upgrade an action card, except on map 11 (Caves), 12 (AI) and
  T1 (`association.space_bonuses`): T1 and 12 give one upgrade for the first *set* (a partner zoo and a university) and one for the second
  set, map 11 one for the first set and one when the third worker is unlocked and 1 conservation for the third set.
  Partner 3 = hire a worker; 4th worker / 4th partner zoo / 3rd university = conservation points per map (`data/association_bonuses.json`,
  entered by the user for every map). The logs agree with this rule (the earlier mismatches on maps 10-12 came from swapping Caves and AI), university tiles: reputation 1 / 2, research
  icons, category universities search the deck for an animal of the category (a random tile is drawn from the bag). Tiles and partner zoos
  are 'played into the zoo': their icons fire the triggers of the cards in play (e.g. Expert on Africa).
- Conservation projects (`association.py`, `project_effects.py`; rules given by the user). Supporting a project is a sequence of choices:
  1. `association_task {task: conservation, project, source}`: the project (the ones in play incl. the base projects, in the hand, or - upgraded
     Association - in the display within the reputation range, for the folder cost) that the zoo satisfies; workers and strength are spent, a card from
     the hand / display joins the two projects in play (the rightmost one is discarded with its tokens, which still count as supports at the end);
  2. `choose_slot {slot[, icon | token]}`: a free slot whose requirement the zoo meets (Base / Normal: the icon count of the slot; Release: an animal with
     the icon of the project whose size fits the slot, large / medium / small for the 1st / 2nd / 3rd slot; Breeding: an animal with the icon and a
     partner zoo of one of its continents; Management plan: 2 icons of its kind); a bonus-icon token or a token of Breeding Cooperation / Program
     (base projects) counts as one more icon;
  3. `choose_bonus {bonus}`: one of the notepad bonuses that are left;
  4. every effect is a pending effect, resolved in any order: conservation points (always), the reputation of the slot, the notepad bonus
     (`project_bonus`), the effect of the type (`release`: release an animal of the slot's size, losing its appeal; management plans: Hunter / Posturing /
     Sunbathing / Digging / Clever, the Tutor of slot 3, `reef`: every Reef Dweller effect of the animals of one aquarium), the place bonus of a card
     that was just added (Release: 1 reputation; management plans: their keyword), Migration Recording (S224: +1 conservation per Release project, and
     Release projects may be supported more than once);
  5. then, with an upgraded Association action, more tasks while strength and workers are left, and at the end one donation.
  Two players: base project card k has its slot k covered; two project cards above the board. BGA's own list of the supportable projects and slots
  (the private state of the move, `slots['5']`) is compared with the engine's in the differential test.
- Conservation thresholds (`bonuses.py`): 2 = upgrade an action card or hire a worker, 5 / 8 = one of the two random bonuses or 5 money
  (also: Posturing 3 = 3 free kiosks / pavilions, each skippable; Adapt 3 = draw 3 final scoring cards, then discard 3), 10 = every player discards an endgame card. Reputation track (checked on the logs): 5 upgrade an action card, 8 hire a worker, 10 and 13 take a card (deck or reputation range), 11 and 14 one conservation, 12 and 15 one X token; reputation stops at 9
  until the Cards action is upgraded. Threshold effects wait in `current_action["threshold"]` and open the prompt `effects` when the step ends.
- Differential: 153 association tasks, 66 effect choices and 6 donations are compared with the logs (1273 turns, 70 discrepancies).

## Animals action (`engine/animals_action.py`)
Rulebook p.11-13, standard action card only. Prompt `animals_play`; actions `play_animal {card, from_display, x, y}` (x, y = the anchor of the
enclosure building, so a replay and the engine agree) and `finish_animals`. Level I plays 1 animal (2 at strength >= 5) from the hand; level II 1
(2 at strength >= 3), also from the display within the reputation range for the folder cost, and +1 reputation first at strength >= 5.
- Conditions: icons, `animalsII`, `university`, `Partner Zoo` (any partner zoo or university, checked on the logs). Cost: price - 3 per continent
  icon of the animal covered by a partner zoo, Expert in Small / Large Animals (S229 / S230), + folder number.
- Enclosures: an empty standard enclosure of at least the animal's size (Expansion Area S272: a 3-space enclosure on the border counts as 5) with
  enough water / rock spaces around it (ignored with Diversity Researcher S219), or room in a special enclosure (`Building.animals`, capacities
  petting zoo 3, reptile house 5, aviary 5, small / large aquarium 2 / 5). Map 13 starts with a size-2 enclosure on the centre spaces.
- On play: printed appeal / reputation / conservation, own gains (fixed ones from `data/animal_play_effects.json`, `scripts/infer_animal_effects.py`),
  the ability effects that are implemented (Hunter X, Perception 4, Sun Bathing X, Snapping 1 / 2, Clever) and the triggers of the animal's icons.
  74 of 160 animals are playable (no ability, an implemented ability, or a fixed gain in the logs); the rest raise NotImplementedError.
- Replay: `increaseSize` replaces the building by the bigger one, special enclosures hold several animals, the map 13 start building exists,
  the base projects are inferred from the log (the user enters them in production), players start at reputation 1.
- Differential: 53 animal plays are compared with the logs (1478 turns, 97 discrepancies overall).

## Icon counters (`engine/icons.py`)
`PlayerState.icons` holds the counters of the icons that projects and cards count: the 5 continents, Bird / Predator / Herbivore / Primate /
Reptile, SeaAnimal (Marine Worlds), Pet (petting zoo), Bear, Science, Rock, Water (`icons.TRACKED`). `icons.sync_icons` recounts them from the
played animals and sponsors (their tags), partner zoos, universities and aquariums; `apply()` syncs after every action and the replay builder
after every move, so a released animal (removed from `PlayerState.animals`) takes its icons with it. Checked against BGA's own `infos.icons` on
3011 samples: all match except 5 at the moment an animal is played. Findings: every small / large aquarium is a Water icon, sea animals and
sea-animal sponsors are not; rock / water requirement numbers that the card data lacks (S251, A482) are in `icons.REQUIREMENT_FIX`; a
`bonus-icon` token (conservation bonus) adds one icon of any kind to one project support and is then spent.

## Break (`engine/breaks.py`)
Triggered when the break token reaches the last space (9) at the end of a turn: the triggering player gets an X token; every player discards
down to the hand limit (3, or 5 with a hand-size university; a decision per player, `break_discard`); Multiplier / Venom / Constriction tokens go;
workers return to the notepad; the partner zoos and universities on offer are replenished (one of each, not those both players have);
the two leftmost display cards are discarded and the display refilled (Marine Worlds: each revealed Wave card removes the leftmost display
card, then it is refilled again); income per player starting with the trigger: appeal income, kiosk income (per unique building, special
enclosure, occupied standard enclosure and pavilion next to each kiosk), the map income of the tokens already used, map abilities (Park Restaurant,
Caves), sponsor incomes (S201 take a card, S206, S209, S220, S231-235, S257, S265, S274, S281). Then the break token resets and the next player
starts. Not implemented: income of Ice Cream Parlors (7) and Drawing Board (13), end of game triggered by a break.
Compared with the logs: 554 break turns, 552 agree (the 2 others are players whose map could not be inferred).

## Sponsors with their own rules (`engine/sponsor_extras.py`, rules given by the user)
- Basic Research S207 (upgraded action, appeal <= 25): 1 conservation per 2 KINDS of continent / species icons present (counts do not matter), opponents get twice that in
  money. Release of Patents S222 (appeal <= 25): up to 3 conservation, 1 per research icon, opponents get twice that. Explorer S262: 2 money per
  different continent / animal icon, then 2 money + 1 appeal whenever an icon goes from 0 to 1. Science Library S208: appeal = research icons, its
  2 money trigger fires for its own icon. Hydrologist S241: appeal per water icon; Geologist S242: 3 appeal per pair of rock icons; both give 1 money
  for every covered space next to water / rock. Expert in Small / Large Animals S229 / S230: appeal for each small animal / 2 for each large one.
- Waza Special Assignment S227 (reputation 6): choose small (size 1-2, petting zoo included) or large (4-5): the first animal of that kind is taken
  from the deck, the other kind can never be played again, the chosen kind gives 2 / 4 appeal each time; size 3 is not affected (`flags["waza"]`).
- Waza Small Animal Program S228 (reputation 3): after only small animals, one more small animal from the hand may be played, and one small animal
  may be snapped from the display at the end of the action.
- Reconstruction S280 (upgraded action): optionally a free kiosk and pavilion, and pick up to 3 buildings and place them again (pending effects
  `reposition` and `build` with `placeback`; a moved building keeps its animals and gives nothing); afterwards no placement bonuses.
- Boost: X (9 animals): the X action card goes to slot 1 or slot 5 at the end of the action, the player's choice (effect `boost`).
Medical Breakthrough S206 (4 science icons; 2 appeal per supported project; 1 conservation per break), Veterinarian S203 (0/2/5/10 money for 0-3 universities; supporting a project needs strength 4), Diversity Researcher S219 (2 money per rock+water icon; later overbuild and no terrain requirements), Natives S258/259/260/264 (appeal per uncovered water / rock / border plain / bonus space next to a building, appeal <= 25), Farm Cat S267 (1/3/5 appeal for 1/4/7 kiosks+pavilions), Conference on Europe S268 (2/5/10 money; `flags["europe_marks"]` counts the marks, their value is unknown), Conference on Australia S269 (optional `enlarge` effect: a size-n enclosure becomes n+1 over the same hexes, +2 appeal if occupied; newly covered spaces give their placement bonus).
Still not implemented: Promotion Team S282.

## End of the game (`engine/endgame.py`)
- **Trigger:** score (appeal + conservation points) >= 100, checked when a turn ends and after the income of a break. Reached in a turn: the other
  player gets one more turn (a break caused by the triggering turn is played first). Reached in the income of a break: the break is finished, then
  every player gets one last turn, starting with the player after the break. No break after the last turn. `GameState.final_turns` = seats still to play;
  `end_triggered_by`, phase `final_turns` -> `scoring` -> `over`. (Checked against the order of events in all logs.)
- **Before scoring:** if nobody reached 10 conservation, every player with 2 endgame cards discards one (prompt `effects`, kind `endgame_discard`).
- **Order:** Arcade S281 first (2 appeal per zoo with less appeal, before any other gain), then per player starting with the one who triggered:
  the endgame effects of the sponsors in the zoo, then the endgame cards; Mascot Statue S274 last (2 appeal per zoo with higher appeal).
  Gains are plain additions (no thresholds). Final score = `tracks.score(appeal, conservation)`; tie = `Result.winner` None.
- **Endgame cards:** `scoring[base|marine_worlds]` tiers (highest tier reached). Metrics fitted to the logs: F001/F002 sizes (Marine Worlds variants),
  F003/F010/F011 icons, F004 = water / rock connected, border spaces covered, whole map covered (1 each), F005 supports, F006 empty plain spaces, F007
  reputation, F008 sponsors, F009 animal categories (Bird, Predator, Herbivore, Primate, Reptile, Bear, Pet, SeaAnimal) with more icons than the opponent (max 4),
  F012 different shapes (kiosk = pavilion = size-1, small aquarium = size-2), F013/F014 best continent / category icon not used for a base project,
  F015 min(kiosks, pavilions), F016 number of requirements on the cards in the zoo (not counting rock / water), F017 continents with more icons than the
  opponent (own partner zoos twice, max 4).
- **"Connected"** = covered by or next to a building. **Sponsor endgame effects** (`endgame.sponsor_points`): the card data only has some of them, the others were
  fitted to the logs (`HIDDEN_ICON_TIERS` etc.): S201 1/2 conservation for 3/6 science; S208/S261 5 animal categories; S225/S226 5 continents; S215/S218 5 supports;
  S241/S242 water / rock connected; S258/S259 per 2 unconnected water / rock spaces; S260 per 6 empty spaces in a group; S264 per 2 unconnected bonus spaces;
  S265 5 kiosks; S267 kiosks with 3 empty spaces around (max 3); S268 3 donations; S269 appeal per pouched card (max 5); S271 all bonus spaces covered;
  S272 border covered; S257/S217/S280 5 appeal when the map is covered; S279 3/5 appeal for 1/2 aquariums next to the tunnel; S203/S209 3 universities;
  S210 5 kiosks; S216/S220 reputation 9; S221 border covered; S243-S247 6/6/6/7/6 icons of their kind; S251 3 bears; S214 1 appeal per X token; S219 2 appeal per
  rock+water pair (max 3). `scripts/check_endgame_cards.py` compares all of it with the logs; `tests/test_endgame.py`: final scores match 91 of 100 games
  (the rest miss the last action of the game, logged in the same move as the final scoring).

## Animal abilities (`engine/animal_abilities.py`, `engine/animals_action.py`)
All 160 animals can be played (was 74). Abilities are pending effects of the prompt `effects` (kinds `digging`, `scavenge`, `glide`, `glide_gain`,
`shark`, `symbiosis`, `cut_down`, `trade`, `extra_shift`, `assertion`, `pilfer`, plus the existing `build`, `pouch`, `reveal`, `sell`, `take`, `adapt`).
- **Direct gains:** Pack (1 appeal per predator icon, the animal itself included), Petting Zoo Animal (3 per pet icon), Iconic Animal (1 per icon of that kind
  in both zoos, max 8), Sprint X (draw X), Jumping X (break token X spaces + X money), Inventive (1 X token; Bear: per bear icon in both zoos, max 3;
  Primary: 1/2/3 for 1/3/5 primates), Full-throated (hire a worker), Dominance (Primates base project if unused), Sea Animal / Sponsor Magnet (all such cards
  of the display), Monkey Gang (first primate of the deck, the others go under the deck).
- **Decisions:** Posturing X (X optional free kiosks or pavilions), Peacocking (free large bird aviary), Pouch, Digging X (discard a display card or a hand card
  + draw, X times), Scavenging X (shuffle the discard pile with the game's RNG, draw X, keep 1), Glide X (discard up to X cards; per sea animal icon 1 reputation /
  2 appeal / a free kiosk), Shark Attack X (discard up to X animals of the display in the reputation range: half their appeal each), Symbiosis (use an ability
  of another sea animal), Cut Down (remove an empty standard enclosure, refund 2 per space), Trade (X token <-> 5 money), Extra Shift (a worker back from the
  association board), Assertion, Resistance / Adapt (draw endgame cards, discard), Scuba Dive X (reveal X = sea + reptile icons, take a sponsor),
  Pilfering 1 / 2 (the opponent decides: give a card or pay 5 money; target = the player with at least as much appeal / conservation).
- **Second actions:** Determination (another action card) and Action: X (the named card, optional) open a second `choose_action_card` of the same player after
  the first action's cleanup (`prompt.args["only"]`, `skip_extra`); X tokens can be spent on it. In the logs it is a separate turn marker of the same player.
- **Camouflage:** an animal played after it in the same action may ignore one missing condition. **Flock Animal X:** may share the standard enclosure of a
  herbivore (enclosure size >= X) that has no sharer yet.
- **Reef Dwellers (Marine Worlds):** a sea animal with a `reefDwellerEffect` also does that effect when it is played into an aquarium (unless it is identical
  to its ability), and placing it makes every other animal in that aquarium do its Reef Dweller effect again. Sea animals with an empty list (only an
  ability) neither trigger nor are triggered. Found in the logs (`scripts/engine_problems.py` shows what still differs).
- **Venom / Constriction** (`engine/venom.py`, rules given by the user): Venom X: if the other player has more appeal than the activating player they get a
  token on their action cards at strength 1 (and 2). The printed appeal / conservation of such an animal is a pending `gain` effect, so the order with
  the Venom effect matters. Performing (or putting back) a card removes its Venom tokens; a player who removed none pays 2 money before the turn ends
  if any token is left (at any time; drawing cards from the deck is not allowed until it is paid, with less than 2 money not at all). Constriction: the
  cards at strength 5 / 4 of a player ahead on appeal and on conservation (one card when only on one) get a token, -2 strength until it goes; tokens go
  when the card is used and at the break (all tokens, Multiplier too: BGA says so). Sprint, Monkey Gang and Scavenging are `ability` effects the player
  activates, for this reason.
- **Multiplier X** places a token on the named own action card. After an action, a card with tokens may be done once more per token (a token is used each
  time, the card moves to slot 1 after the last one; `choose_action_card` with `repeat`, `skip_extra` declines), or put back for an X token once more per token
  (`skip_action` with `repeat`).
- **Hypnosis**: if the other player has at least as much appeal, after the action one of their first 3 action cards is performed by the player (strength = slot
  + own X tokens, `hypnosis` in `choose_action_card`), and goes back to slot 1 of its owner.
- **Marks** (`engine/marks.py`): at the end of the action a cube goes on an animal of the display without one (none left: skipped). A marked animal that
  leaves the display (break, Wave, Digging, Shark Attack) goes to the owner's hand; one that is taken or played from the display pays 2 money to the owner.
  Conference on Europe marks once per Europe icon.
- **Marketing**: pay the strength of a sponsor of the hand to play it (all requirements).
- Marine Worlds sponsors S266, S270, S277, S279 have a Wave icon (the card data has it on animals only); a display refill that reveals them removes the leftmost card.

## Action card variants and peaceful mode

- Every played animal's printed appeal / reputation / conservation is a pending `gain` effect (not optional) next to the ability effects; the player
  resolves them in any order. Reputation at the cap resolves without effect.
- All five action cards and their variants 1-4 are implemented (`cards_action`, `sponsor_variants`, `association`, `build_action`, `animals_action`);
  variant side actions are prompts of the open action (`sponsor_side`, `self_clever`, `take_instead`, `finish_*`). Animals 4 appends a `mark` after-effect;
  Animals 2 appends the Hunter reveal; Animals 3 level II adds optional `pay_appeal` effects.
- `GameConfig.peaceful` (inferred from the logs, `replay/config.py`) swaps the hostile abilities for `animal_abilities.peaceful_effects`.
- Not implemented: marketing sponsors variant, map abilities (AI 12 gives +1 free strength).

- Updates: Animals 1 has an explicit `animals_single` choice before the first animal (play 1, ignore a condition); the Multiplier repetition is a new
  `choose_action_card` before the card's cleanup (the logs show each repetition as its own turn marker, the differential test joins them); a hypnotised card
  keeps its Constriction penalty and loses its Venom / Constriction tokens at the end; covered rock / water hexes do not count for animal requirements.


## Effects added in the takeBonus / break-income pass
- **Placement bonuses**: `take-in-range-or-deck` (pending `take`) and `Clever` (an `after` slot-1 effect) are implemented; `store`, `wave`, `shark-attack`, `adapt`, `conceal`, `bonus-sponsor`, `appeal`, `Digging`, `Multiplier`, `Worker`, `Partner-Zoo` still raise NotImplementedError (the harness skips those turns). A Build action opens its effects after every building, not only at the end.
- **Conservation bonuses (5 / 8)**: `bonus-increased-hand` (a token, +1 in `breaks.hand_limit`), `size-3` (free enclosure), `Fac` / `Partner-Zoo` (pending `take_tile`, `association.tile_options` / `take_tile`) are implemented; `bonus-sponsor(-gray)`, `bonus-ignore-conditions`, `bonus-extra-shift`, `Multiplier` are not.
- **Break income**: cards snapped / taken as income and free enclosures are effects of either player (the display refills after each snap); the income enclosure may be declined; the break's pending effects no longer get lost when the hand-limit discard comes first.
- **Commercial Harbor (maps 4 / 4a)**: free action `harbor_sell {card}` (3 money, once per turn, harbor connected = a building covers (0, 11)); it is also offered until the next player acts (`flags['harbor_window']`), because BGA logs it after the action ended.
- **Map 6a**: BGA put the take-a-card placement bonus on (8, 7) in older tables and on (8, 5) after a fix: `data/map_quirks.py` (`MAP_6A_FIXED_FROM_TABLE_ID`, the cutoff is a guess) turns old tables into the map id `6a-legacy`.
- **Sponsors**: Primatologist, Herpetologist, Ornithologist, Expert in Predators / Herbivores and Marine Biologist (`S236`-`S240`, `S266`) trigger on any zoo's icons (`card_programs.TRIGGERS`).
- Offline harness: `data_manual/sample_maps.json` (from `scripts/fetch_sample_maps.py`) gives the real maps of the sample tables.

## Bonus tokens, AI map, Discount Animals
- **Tokens of the conservation / notepad / placement bonuses** (`bonuses.TOKEN_BONUSES`): `bonus-sponsor` = an optional Marketing effect at once; `bonus-sponsor-gray` = a token that turns into a Marketing effect (free action `use_token`); `bonus-extra-shift` = a token that recalls one of the player's workers from the association board (`use_token`, the Extra Shift effect); `bonus-ignore-conditions` = a token that lets one animal be played without meeting its conditions (rock / water of the enclosure still count), used up automatically by `animals_action.play`. Tokens can be used during the player's action and in the moment after the turn (before choosing the action card, and `flags['turn_window']` after the turn, as with the harbor).
- **Placement bonuses** `bonus-sponsor`, `Worker`, `upgrade-card`, `Partner-Zoo`, `appeal` go through `bonuses.apply_bonus` (`game.PLACEMENT_VIA_BONUSES`). Map 13's two appeal hexes give 1 appeal (logs).
- **Map 12 (AI)** `engine/map_rules.py`: black squares (covered square hexes + second university + third worker) cover the strengths 1, 2, 4, 5 in that order; a covered number becomes the next visible one (all four: spaces 1-3 strength 3, spaces 4-5 strength 6).
- **Animals 3 (Discount Animals)**: level I: the first animal costs 2 less; level II: pay 2 money for 1 appeal for each animal played (`pay_appeal`).

## Enclosures, flocks and releases (rules given by the user)
- An animal is not tied to an enclosure: flipping an enclosure of a suitable size is part of the cost, `Building.animal` only says "occupied". The differential test compares the occupancy of every building, not which animal is in it.
- **Flock Animal X**: the animal needs no enclosure when the zoo has a herbivore of at least size X (`animals_action.flock_free`, the play action carries `flock: True`).
- **Release**: the player empties one occupied enclosure, chosen from the best non-empty group: a special enclosure that meets the water / rock needs, the smallest standard enclosure that does, a special one that does not, the smallest standard one that does not, else none (`project_effects.release_enclosures`; the action carries `building: [x, y]`, which is the enclosure the log names).
- **Maps 2 / 2a**: a standard enclosure next to the gate has +2 capacity. **Maps 6 / 6a**: with the Research Institute connected (a building on (0, 11)) each animal ignores 1 condition. **Map 7 / 7a**: all 3 kiosk placement bonuses covered = +1 income per kiosk. **Map 13**: the four areas (`map_rules.quarters`) pay when completely covered and in every break: top 3 money, right 2 appeal, bottom 1 reputation, left Hunter 4.
- Break income cards: the display refills when a player's income is done (not after every snap), before the other player's cards are taken.
- **Archeologist (S221)**: every border hex with a placement bonus that a building covers gives one more placement bonus of the player's choice, from any hex with a bonus that no building covers (`bonuses.archaeologist_cells`, pending effect `archaeologist`). The log does not say which hex: it names the bonus with a `takeBonus` that has no source, the differential test picks a hex with that bonus.
- **Sponsors with cubes**: Breeding Cooperation / Program (S215, S218) enter play with 2 cubes (one is removed per use as an icon for a base project), Okapi Stable (S253) with 3: each herbivore icon played into the zoo may remove a cube to activate a Marketing effect (`card_programs.TRIGGERS`, effect `marketing` with `cube`).
- **End-of-game sponsors**: all 29 sponsors with an end-game effect in the card data (S201, S208, S215, S218, S225, S226, S241-S247, S257-S261, S264, S265, S267-S269, S271, S272, S274, S279-S281) are scored in `engine/endgame.py`; `tests/test_endgame.py` checks the final scores of every finished sample game against BGA's.
- **Maps 8 / 8a (Hollywood)**: covering an H reveals cards until the first sponsor, which joins the hand (`map_rules.hollywood_hexes`); with every H covered each sponsor card has strength -1 when played (`sponsors_action.level_for`).

### Rules confirmed by the user (latest round)
- **Snapping 2**: after the first snap the player may refill the display before the second (`choose_effect {refill: true}` on the pending snap).
- **Partner zoo discount**: 3 money per partner zoo for each icon of its continent on the animal.
- **University**: the space's upgrade and the tile's reputation are separate pending effects in any order; reputation gained at 9 before the Cards upgrade is lost.
- **Reputation 16 bonus** (Marine Worlds, `conservation_options["99"]`, from the same pool as the 5/8 bonuses): a reputation point gained at 15 may be traded for it (`rep_bonus`); declined, it pays 1 appeal. Other points beyond 15 pay appeal.
- **Reef Dweller** effects trigger across all aquariums of the zoo, not only the one the new animal goes into.

### Mismatch root causes found (harness side)
- Hypnosis: the cleanup event belongs to the owner of the used card; `builder.h_action_card_cleanup` now takes the turn change from the acting player (13 turn-order mismatches).
- Boost: X is optional (declined when the card is neither on slot 1 nor 5); the harness skips it.
- Placement oracle compared lists with duplicates (one entry per pending build effect): now sets. Final-scoring turns no longer compare appeal / conservation / X / money (the engine adds the scoring, the log-built state does not).
- Blank (generic) university: the player chooses one of the species nobody has taken (`association.with_categories`, no RNG); there is one university per species for the whole game.
- Marked cards dug from the display go to the mark's owner (the harness reads the `markAssign` that follows an empty "digs" event).
- BGA's project lists count a Breeding Cooperation / Program token as an icon (not the notepad bonus-icon token); BGA never shows 16 reputation.
- Unseen base projects are chosen by `config.refine_base_projects`: the candidate whose slots agree with BGA's lists at every Association action (cards fetched with Assertion / Dominance are excluded).
- **Aquariums share their spaces** (small 2, large 6, tunnel 2): an aquarium animal of size N fits when the free spaces of all aquariums add up to N, and BGA lists every aquarium it takes spaces in (the first is the anchor, the animal is kept there). Reef Dweller effects trigger across all aquariums.
- **Boost / Clever** are optional; a Boost that the new reef dweller triggers shows up as "(Boost effect)" in the log.
- **Pilfering 2** hits for appeal when the opponent is level or ahead, for conservation when level or ahead and above 0. **Peaceful** games are told by the replacement effects in the log (X tokens as Inventive, Clever for Constriction, Sprint for Pilfering 2, Mark for Hypnosis), not by the lack of hostile events.
- **Placement bonus Worker**: hire a worker; with all four hired a worker comes back from the association board.
- Sponsors played outside the action (Marketing, discard-to-play) put the cubes of S215 / S218 / S253 too; the printed values of Franchise Business are none (`PRINTED_OVERRIDE` `{}`).
- Shark Attack: half of the *sum* of the discarded animals' appeal, rounded down. Digging a rescued animal fires the sponsors' icon triggers.
- **Special enclosure moves** (reptile house, large bird aviary, first aquarium): building one opens an optional `move_in` effect; each animal that fits may move in from a standard enclosure (emptied by the release priority, never the new building) or from another special enclosure (spaces free again). The log's `moveAnimal` is `choose_effect {move, from}`; the harness skips the effect when nothing moves.
- **Map 11 (Caves)**: the `store` placement hex / income slot lets the player put a hand card into the hidden storage (`store` effect, optional); stored cards do not count for the hand limit, an animal can be played from the storage (`play_animal {stored: true}`, normal price), each stored card pays 2 money in the break (counted when the appeal income is resolved, after the income's own store). The placement `Worker` hex takes a worker back from the association board (13 of 13 in the logs); the notepad `Worker` bonus hires.
- **Conservation bonuses taken before the first table is logged** are read from the taken bonus itself (`remove: "<threshold>-<index>"`), so jumping from 0 to 5 conservation resolves the 2 and 5 bonuses in any order.
- The release / move of the starting enclosure is matched by coordinates (its id differs from BGA's).
- **Map effects added**: map 1 / 1a Observation Tower (+2 appeal when an animal fills a standard enclosure next to the tower; only for maps the index gave, `config.map_known`); map 9 continent markers (`continent` effect when an animal enters an enclosure with a space in its continent's area; bonuses: 1 reputation, 2 appeal, 4 money, Clever, a free kiosk/pavilion; +1 conservation for the fifth marker; one marker per continent); map 8 / 8a: no third partner zoo before the Association card is upgraded; map 14: `wave` placement bonus (remove the first display card and replenish, an effect of its own so it keeps the log's order), `shark-attack` (Shark Attack 1, optional), the income slot `sponsor-person-card` (a person sponsor of the hand is played for free); map 12 `adapt`; map 4 `Multiplier` (a token on an action card of the player's choice, also the bonus on 16 reputation).
- Not done yet: T1 (discard a hand card for +1 action strength once the top-left bonus is unlocked), maps 0 / A (no geometry), the unidentified icons (maps 6, 7, 9 slot, 12 slot, T1), the left bonus slot of map 9 (remove any marker).
- Logs whose maps are not in `data_manual/sample_maps.json` (63 of the 198 samples) cannot be replayed reliably; `test_engine_agrees_with_the_log_turn_by_turn` and `scripts/dump_problems.py OUT known` skip them.
- The bonus-icon token counts as an icon only for the 3 base projects of the setup (not one drawn with Assertion / Dominance); BGA's project lists count it. Multiplier tokens put on the card of the running action are not usable in that action (`enableMultiplier` marks them ready).
- **Geological (P129)** asks 3 rock icons for its second slot; BGA may have asked 4 before table `GEOLOGICAL_FIXED_FROM_TABLE_ID` (`data/map_quirks.py`), but no sample log shows it (tables 626827519 / 647641584 already use 3), so it is 0. `GameConfig.table_id` carries the table. Project slot lists are compared at the moment the project is supported (earlier tasks of the same Association action may change the zoo).
- **Break income effects**: the map income (restaurant spaces of maps 5/5a, stored cards of map 11, kiosks of maps 7/7a) is an effect of its own (`income_map`), resolved in the player's order, so a free size-2 enclosure or a store placed first counts. A sponsor played during the break (a placement bonus) pays its income at once. Hypnosis: the variant effect of the hypnotised card is part of the action; older BGA tables left it out (`HYPNOSIS_VARIANT_FIXED_FROM_TABLE_ID`, guess 757800000 between 732463562 and 783118944, `data/map_quirks.py`).
- **Sea Turtle Tank (S250)** needs 1 water space next to it in the base game and 2 in Marine Worlds (`icons.requirement(key, name, marine_worlds)` applies the card's `variants.marine_worlds`); the Spotted Hyena Compound (S252) needs 1 rock space in both.
- A rock / water space covered by a building (Terrain Build) no longer counts as rock / water for the rock / water adjacency of a placement (sponsor buildings, animal enclosures).
- **Break start**: `breaks.start` clears the effects prompt of the last action, so the income effects of the break (appeal income, map income ...) never join it (an action that ends the game of the turn with a pending prompt lost the whole break).
- **Extra actions (Determination / Action: X) and Clever / Boost**: the player chooses the order. After the first action the Clever / Boost effects are pending as usual; if only those are pending and an extra action follows, `go_extra` starts the extra action first and the Clever / Boost wait for its end (`carry` of the next choose_action_card prompt). Several animals with an extra action queue them (`extra["more"]`, `game.add_extra`). Clever of a sponsor played in the break (Expert on Africa) is a free `slot1` effect at once.
- **Map T1**: once a turn a hand card can be discarded for +1 strength of the action (bonus space 0 unlocked): `choose_action_card {"t1": card}`; BGA logs the discard in a turn of its own before the card is chosen (merged by the harness).
- **Waza Large Animal Program (S263)**: a large animal ignores 1 condition. **Flock Animal X** is satisfied by an enclosure of size >= X with a herbivore (and, found in the logs, by a herbivore icon that does not come from an animal while an occupied enclosure of that size exists).
- **Placement bonus take-in-range-or-deck** is optional (some logs show no card). **Reef Dweller effects** also fire for the Underwater Tunnel; an animal in the tunnel counts the water it is built on. Sea animals in the tunnel need the rock next to the tunnel only.
- **Maps 7 / 7a** bonus space 3 is `Pouch 2` (found in the logs; up to 2 cards of the hand go under the map for 2 appeal each).
- **Sponsors played in the break** (Marketing of a bonus token, placement bonus of the free enclosure) belong to the player whose income it is: their pending effects carry `player`. Notepad tokens may be used by either player in the break.
- **Association Supply (variant 1, level II)** also offers the category universities. **Breeding programs** need the icon and a partner zoo of the animal's continent on the same animal (a rescued animal counts); an icon from a university or a sponsor does not count (checked against BGA's project lists).
- **Reconstruction (S280)**: a building put back keeps its animal; an area (map 13) that is covered again pays its bonus again. After the last building of a Build action the effects of its placement bonus are resolved before the engine decides whether another building is possible (the money may pay for it).
- **Sponsors4 level II** may discard the card without a sponsor played for it (`sponsor_side discard_play` with `play: None`).
- **Placement bonuses (user-confirmed)**: 6 / 6a (7,2) = a university (`Fac`); T1 (3,4) = Scavenging 3; T1 (4,11) = Mark; maps 7 / 7a kiosk hexes = a free kiosk (optional, the placement rules apply). **Notepad spaces**: map 12 slot 3 = Animal Magnet (every animal of the display goes to the hand, refill at the end of the turn); map 9 slot 3 = unlocks one of the remaining continent cubes (the `continent` effect, nothing when all are gone); the Pouch 2 space of maps 7 / 7a is an income space and optional.
- **Break income**: the kiosk income is an effect of its own (`income_kiosk`) like the appeal and map incomes, resolved in the player's order (a building placed in the income may raise it); an income that BGA does not log (0) is resolved by the harness when the other player's income goes on.

- **Rules fitted in the last pass**: Inventive (all three kinds) is an effect of its own (a Trade of the same Reef activation may spend the token first; at 5 X tokens BGA logs nothing); a Symbiosis that copies Pouch pouches under the animal that has the Symbiosis; (a person sent on an expedition leaves the zoo with its icons, as BGA does; the replay builder now removes it too); the "Partner Zoo" condition of an animal needs the partner zoo of one of the animal's own continents (user; the plays in the logs without it use Animals variant 1 "ignore a condition", the Research Institute of map 6 / 6a, the ignore-conditions token, Camouflage ...); an aquarium may touch water that an underwater tunnel covers; the notepad Clever (map bonus) waits for the end of the action like the other Clever effects; tokens may be used while the Clever / Boost / mark effects after an action are pending; `Sea Turtle Tank` is a sea animal for tutor searches (Marine Worlds variant tags); Breeding Cooperation / Program tokens and the bonus-icon token only work for the 3 base projects of the setup.
- **Harness**: a Build/Animals turn that BGA splits in two (the cleanup alone in the next "turn", or the X token of a skipped action before its cleanup) is merged (`_is_tail`); a conceding player's unlogged break income is not compared; BGA's project list is dropped when a later private state has no project list.

- **Action card draft** (`engine/draft.py`, `GameConfig.draft_action_cards`, rules given by the user; a new game only, a log's cards come with the config): the 20 variants (5 actions x variants 1-4, one copy each) are shuffled, each player is dealt 3; both players pick at the same time (`draft_pick {variant}`), the 2 left go to the opponent, who picks again from them (the last one goes back too); each player then has 3 and keeps 2 of two different actions (`draft_keep {keep: [v, v]}`); with 3 variants of one action a random variant of another action is added from the rest of the pile (`draft["auto"]`, 4 to choose from). The kept variants sit on their action cards, the other three stay standard, the Animals card always goes to strength 1 and the other four cards go in a random order into the strength slots 2-5, then the cards are dealt (`initial_discard` follows). `GameState.draft` (`stage`, `offers`, `picked`, `choice`, `kept`, `auto`, `pool`; variants named `build1`) stays after the draft. The map pick is not implemented yet. The replay shows the logged draft: `replay/builder.draft_states` fills `draft` of the setup steps from `updateInitialActionCardSelection` / `...Keep` (there `offers` = what the player chose from in that round, `picked` / `kept` what they took, `choice` a pick whose simultaneous partner is still missing), the action cards are standard until it is over, and `view.step_label` words the steps ("X picks Build 1 from ... (action card draft, first pick)").

- **Engineer (S217) after the additional kiosk / pavilion of Build variant 1 / 2** (user-confirmed; seen in 830223319 turn 5): the additional kiosk / pavilion counts as a built kind, so Engineer may repeat it, and the copy costs what the additional building cost (3 at level I, 2 at level II), not the printed 2. `current_action["extra_type"]` remembers the kind, `game._engineer_cost` prices it. In that log Akimoon (Engineer in play) built a size-5, then two kiosks that each paid 3 at level I.

- **Association token use**: the bonus-icon token and a Breeding Cooperation / Program token may be used for the same project (`choose_slot {slot, icon, token}`; BGA logs both in one `discardTokens`). **Base project positions**: a base project that BGA offered but never showed at `base_N` has an unknown position (the slot of its own position is covered); `config.refine_base_projects` assigns the unknown positions to the candidates that make the engine's slot lists agree with BGA's.

- **Rules fitted on the 200 added tables (user-confirmed or checked against BGA's lists)**: Monkey Gang / any search: the first card that satisfies the search leaves the deck, the rest keeps its order (nothing is tucked under the deck; the primate tag includes the Primatologist sponsor). Animals from the display: the folder number is added to the price *before* the discounts (a 4-money Stoat in folder 4 with 6 of discounts costs 2). Venom never blocks drawing: it is paid at the end of the action when the player has 2 money, otherwise at the end of the turn (after a Commercial Harbor sale: `venom.pay_late`). Pilfering by appeal does not count the appeal that the icon triggers of the same animal give (BGA logs them after the Pilfering). Hypnosis on old tables (before `HYPNOSIS_VARIANT_FIXED_FROM_TABLE_ID`) still runs the Animals variant 3 payment and the Association variants. Expansion Area (S272) can be played with no room for its size-3 building. A Build action with only the additional kiosk / pavilion is complete. Glide's free build may be a kiosk or a pavilion; a Glide reputation gain at 15 is the bonus on 16.

- **BGA bug, Explorer and the Sea Turtle Tank (user-confirmed, 656606572 turn 27)**: the engine's rule is right (a Sea Animal icon that is new to the zoo pays Explorer), but BGA does not pay it for the Tank's own Sea Animal icon. `effects.EXPLORER_BUG` ({"S250": {"SeaAnimal"}}) reproduces that for logged games.

- **Landscape Gardener (S276, user-confirmed)**: playing it gives two instant effects in any order: a free pavilion (optional) and appeal equal to the number of pavilions (mandatory, counted when it is resolved: `gain` with `per_pavilion`); the X token for a built pavilion (1 per action) is a separate automatic effect. **Sponsor played by Marketing in the break (716693223 turn 63)**: its break income joins the pending income effects (`income_sponsor`); the harness takes a sponsor card of the hand for Marketing, not for a Pouch of the same card. **Symbiosis** copying a Sea Animal / Sponsor Magnet is chosen from the logged magnet event (`magnet_note`).

- **More rules fitted on the added tables**: at Build level I the price paid says whether a kiosk / pavilion was the additional one (3) or an ordinary one (2). A pouched card goes under the card the log names (`pouch` of the event). The Mark Animals (variant 4, level II) reputation for a marked animal is not paid at the top of the track. Expert in Small / Large Animals count the rescued animals. The display refill waits for a sponsor played with a notepad token after the action (`flush_refill`, `refill_pending`). The search of a category university is an effect of its own (`search_category`), resolved after the trigger effects of the new icons. Consecutive turns of one player (BGA skipped the other player's turn) are not compared on `turn` / `active_player`.

- **Choosing an action card (user rule)**: a card whose action would leave the player no legal move cannot be chosen at the "must choose an action card" step (`game._has_moves` applies the choice and looks at the prompt it opens; Cards always has a move, Sponsors can always break). Such a card can still be put back for an X token (`skip_action`). Example: no Association worker left, no Association card.

- **Action card order at the start of a new game (user rules)**: in the base game Animals always starts at strength 1 and the other four action cards are shuffled for each player (`game._standard_action_cards`, its own random stream so the decks keep their order); a logged game takes its order from the log. The action card draft belongs to Marine Worlds only (`start_game` refuses it otherwise), and the strength order is not drawn until the draft is over, i.e. both players have confirmed their two variants (`draft._finish`): Animals first, the other four shuffled.

- **Several placement bonuses under one building (user rule)**: when a building covers more than one placement bonus, each bonus is an effect of its own (`pbonus`, resolved with `choose_effect {apply: "pbonus", bonus: <type>}`) and the player chooses the order (a reputation gain before a take-in-range raises the range, money before a purchase ...). A building with one bonus pays it at once as before. The harness resolves them in the order after which the next logged action is legal (`_skip_unneeded`).

- **Effects of one building and of the log's order (user rules, this pass)**: the first sponsor found by a Hollywood H (maps 8 / 8a) is an effect of its own (`search_sponsor`, with the log's `(Map 8 effect)` draw as its marker action), so a draw from the top of the deck may come first. A notepad bonus that leaves no trace in the log is Cut Down on map 13 (optional, declined): the player unlocked it and skipped it. A release can name several enclosures as emptied (`also` of the release action): each loses an animal. The reputation gain of an icon trigger (Spokesperson) is an effect of its own, so an upgrade of the Cards action can lift the cap of 9 before it. A Multiplier-repeat prompt that is not used (`skip_extra`) comes before the effects that waited for the end of the action. The harness decides the order of simultaneous effects (placement bonuses of a building, searches, Marketing sources) by what the log shows next.

- **Map selection and the start of a new game** (`engine/map_select.py`, `game.new_game`, user rules): `new_game({"game_mode": "original" | "random-mirrored" | "free-select" (default random-mirrored), "marine_worlds_flag": bool (default true), "maps_to_exclude": [3, "3a", 11, "T1"] (default [])}, player_ids, tail_seed)`. `GameConfig` without `maps` starts with the map selection (`GameState.map_select`: `mode`, `pool`, `offers`, `chosen`, `stage`). The pool: every map with a geometry (not the beginner maps 0 / A), the Marine Worlds maps 10-14 only with Marine Worlds, minus `maps_to_exclude`. *original*: each player is dealt 2 maps (4 different ones) and picks one, both at the same time (`choose_map {map}`); *random-mirrored*: one random map for both, nothing to choose; *free-select*: both pick any map of the pool (the same map is allowed). Order of the setup: map selection, then (Marine Worlds, `draft_action_cards`) the action card draft, then the initial deal (`game.continue_setup`). The 3 base projects of `new_game` are drawn at random. A config that has `maps` (a log, a test) skips the selection.
