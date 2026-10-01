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
Rules found while checking against the logs (all documented in `engine/cards_action.py`): reputation range (0: 1 slot, 1-2: 2, 3-5: 3, 6-8: 4, 9-11: 5, 12+: 6) applies to *drawing* from the display, **snapping takes any display card** (the upstream card text says "within range", the logs say otherwise), skipping an action gives an X token.

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
- Conservation projects (icon based Base / Normal projects; release, breed and management projects raise NotImplementedError): a project in
  play, from the hand or (upgraded) from the display for the folder cost; the slot's conservation points and the notepad bonus of the map
  (`bonus_slots`, token chosen by the player). Two players: base project card k has its slot k covered; two project cards above the board.
- Conservation thresholds (`bonuses.py`): 2 = upgrade an action card or hire a worker, 5 / 8 = one of the two random bonuses or 5 money
  (also: Posturing 3 = 3 free kiosks / pavilions, each skippable; Adapt 3 = draw 3 final scoring cards, then discard 3), 10 = every player discards an endgame card. Reputation 5 upgrades an action card; reputation stops at 9
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
