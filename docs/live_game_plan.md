# Plan: live 2-player Ark Nova games

Status: **plan only, nothing implemented** (except the two planning sheets, section 4.1 and 5.4). Written against the code as of today (engine in `src/ark_nova/engine/`, replay in `src/ark_nova/replay/`, viewer in `web/js/replay.js`).

Decisions already taken (section 12): no time control at first, a simple real-time clock with several speed settings later; Firestore (free quota is enough); no accounts, only a seat link and a player name; only fully supported cards and maps can be played; every game is logged completely (section 9.1).

## 1. Goal and scope

Two people play a real game against each other in the browser, on the from-scratch engine, with the same board UI as the replay: a lobby/invite link, the action card draft, the whole game with the break/endgame/scoring, hidden information kept hidden, turn confirmation with undo, and reconnecting. Spectators and a finished-game replay come after.

Out of scope for the first version: accounts and ratings, matchmaking, chat, 3-4 players, AI opponents, tournaments, clocks (they come after the first playable version).

The landing page already has the two neighbouring modes as "coming soon": **sandbox** (one user plays both sides from any position) and **custom game** (new game with own options). They share most of the machinery, so the plan builds the server once and puts three front doors on it (section 8).

## 2. Where the code stands

What helps:
- The engine is pure and deterministic (`apply(state, action) -> state`, one seeded RNG in the state), `legal_actions(state)` answers the current prompt, and state round-trips through JSON (`engine/serialize.py`). This is exactly the core of an event-sourced game server.
- The engine already models the draft (`engine/draft.py`), breaks, end of game and scoring, and replays about 97% of the turns of the 190+ sample logs (`scripts/engine_coverage.py`).
- The replay viewer already renders every part of the board from a state plus a summary of the decision (`replay/options.py`).

What does not exist or does not fit:

| Area | Today | Needed for live play |
|---|---|---|
| Server state | none: Cloud Run is stateless and scales to zero; fork sessions were meant to live in the browser | durable, shared game state, one writer at a time |
| Realtime | none, only request/response | pushing the opponent's moves to the other browser |
| Identity | none, no auth | at least seat tokens: who may act as seat 0/1 |
| Hidden information | the state contains everything (both hands, deck order, seed); the replay shows it all | a per-viewer projection; the seed and deck order never leave the server |
| Decisions | `options.py` sends a *summary* of `legal_actions` (kinds and counts) to a viewer that only draws | the acting player's legal actions, compactly encoded: the UI groups them into buttons and clicks, and maps each click back to one of them (section 5.1) |
| Simultaneous decisions | the draft and some discards are logged one player after the other | engine states that take input from both seats and move on once both inputs are in (section 5.2) |
| Turn end | the engine ends the turn inside the last action (the replay hides this with "log timed" overlays) | an explicit confirm step, because the player may still undo |
| Undo / restart | not modelled | per-turn checkpoints and a notion of "irreversible" actions |
| Unfinished rules | `NotImplementedError` for about 2-3% of logged turns (unsupported events, some marks, monkey gang, ...) | none allowed to occur in a live game |
| Time | none | no clocks at first; resign and abandoned games; clocks with speed settings later |
| Viewer code | one 2,000 line `replay.js` that renders and also owns the replay stepping | a render layer that both the replay and the play page use |

## 3. Target architecture

```
Browser A ──┐                              ┌── Browser B
 (seat 0)   │  HTTPS: POST action          │   (seat 1)
            ├────────────────────► API (FastAPI, Cloud Run, N instances)
            │  stream: state updates       │         │ validate + apply with the engine
            ◄────────────────────  fan-out ◄─────────┤
                                                      ▼
                                       Game store (source of truth)
                                       games/{id}:  config, seed, seats, version, status
                                       games/{id}/actions/{n}: one engine Action each
                                       games/{id}/snapshots/{k}: state every N actions
```

### 3.1 Event sourcing on the engine's own action list
The source of truth of a game is `(config, seed, [action])`: exactly the shape the engine design already promised for fork sessions. The current state is a fold of the actions over `start_game`. A snapshot every ~25 actions bounds the rebuild time. This gives replay, undo, spectating, crash recovery and the finished-game replay for free, and it keeps every rule in the one place that is already tested against real logs.

Consequences:
- The action list is append only, with a monotonically increasing `version`. A submit carries the version it was made on; a stale one gets `409` and the client resynchronises (optimistic concurrency, no locks).
- The server validates every submitted action with `action in legal_actions(state)`. The client is never trusted; it only proposes.
- The engine must stay deterministic across deployments: pin the rules version in the game record (a new deploy must not change how an old game folds; see 9).

### 3.2 Storage
**Firestore** (decided: its free quota is enough for this): same Google project family as BigQuery/GCS, no server to run, snapshot listeners for fan-out, transactions for the version check. Cloud Run's local disk and memory are not storage. Keep an eye on the daily write quota: every action is one write, plus the game record writes (section 9.1), so batch where possible.

Per game: the record above plus a `players` map `{seat: token hash, display name, last seen}`. Finished games are exported once as a JSON action list to GCS (cheap, immutable) and the live documents are expired after a retention period.

### 3.3 Realtime transport
Options, in order of recommendation:
1. **Server-Sent Events** for server to client (`GET /api/games/{id}/stream`), plain `POST` for client to server. Works through Cloud Run, trivially reconnects with `Last-Event-ID = version`, no extra protocol. Cloud Run caps a request at 60 minutes: the client simply reconnects (needed anyway).
2. **WebSocket**: bidirectional, more moving parts (sticky routing, heartbeats), no real benefit for a turn-based game.
3. **Firestore listeners in the browser**: no realtime server at all, but then the browser reads documents directly, which defeats the hidden-information rule. Rejected unless every document is already a per-seat projection (see 4).

Because several Cloud Run instances may serve the two players, fan-out cannot be in-process memory: an instance that accepts a move must reach the SSE connections held by other instances. Use Firestore snapshot listeners (or Pub/Sub) per game on the instance holding the SSE connection, so an append to `actions/` wakes every instance that has a viewer. For a first version, `max-instances` could be 1 with `min-instances` 1 and in-memory fan-out, as a deliberate shortcut; the store stays the truth either way.

### 3.4 Identity
No accounts. Creating a game returns two secret **seat links** (`/play/{id}?s=<token>`): whoever holds a link is that seat. Only a hash of the token is stored. Each player types a **player name** when they join (shown to the opponent and kept in the game record). A third, tokenless link is the spectator view. Sign-in can bind a seat to an account later without changing the protocol.

## 4. Hidden information

The replay reveals everything because the log does. A live game must not.

### 4.1 The visibility sheet (you fill this in)
What is public and what is secret is a rules decision, so it is a **sheet**, not code: `data_manual/planning/visibility.json`, edited in `web/planning.html` (run `python scripts/dev_server.py`, open `/planning.html`; changes are saved to the file). It has one row for every part of the game state (55 rows: the game, each player, and every event that moves hidden cards: draws, reveals, searches, Pilfering, Monkey Gang, the draft, ...), with a suggestion and a reason on each row. For every row you choose:

| value | meaning |
|---|---|
| `public` | both players and spectators see it |
| `owner_count` | the owner sees the contents, everybody else only how many |
| `owner_only` | the owner sees it, nobody else sees even a count |
| `server_only` | never leaves the server (seed, deck order) |
| `until_revealed` | secret until an event reveals it; the note names the event |

`scripts/gen_planning.py` regenerates the sheets after the engine changes, keeps your decisions and flags state fields that have no row yet.

### 4.2 How the sheet is used
- **Projection function** `view_for(state, viewer)` (new `live/views.py`): the one place that turns a full state into what a viewer may see. It is *driven by the decided sheet* (a test fails if any state field has no decision, so a new field cannot leak by being forgotten). Everything the server sends to a browser, including the decision list and the log text, goes through it.
- The server never sends the full state. The seed, the RNG state and the deck order stay in the store; the counts are sent.
- The draw pile, endgame deck and "known/unknown order" popups of the replay are replay-only features; the play page shows counts.
- `until_revealed` rows need the engine to say *when* a secret becomes public (the draft: when both have chosen; endgame discards: at the end). That is one `revealed` marker per such event in the engine's event stream (section 5.9).
- The move log shown in the game is generated per viewer from the engine's events (`event.log_text` row): card names only where the viewer may see them.
- A test replays random games and asserts that nothing the opponent must not see is in anything sent to a seat (no card id from the other hand, no deck order, no seed).

## 5. Engine changes

These are the changes inside `src/ark_nova/engine/` (and the places that read it).

1. **Decisions: the UI is the mediator.** The engine keeps a single contract: `legal_actions(state, seat)` is the list of actions that seat may take right now. The server sends that list (compactly encoded, see below) to the acting seat only; the **browser turns it into digestible elements** (grouping actions into buttons, a placement overlay on the map, selectable cards, an X token stepper, ...) and **turns the player's input back into one of the legal actions**, which it posts. The server then checks `action in legal_actions(state)` before applying it. So there is no second, typed "decision" schema to design and keep in sync with the engine, and the replay's `options.py` summary stays what it is: a replay-only helper.
   What this needs from the engine: stable, serialisable action arguments (they are already JSON), and a compact encoding for the big lists (the Build placement list can have hundreds of `(x, y, rotation)` entries per building type; group by type and send positions as arrays). The UI grouping rules live in the browser, one mapping per action kind and per prompt kind.
2. **Simultaneous choices.** Some states accept input from **both seats** and move on only once both inputs are in: the draft, the initial discard, the endgame-card discard at conservation 10, the break hand-limit discards. The engine represents them as a prompt with a set of seats still to answer (`waiting_on`); `legal_actions(state, seat)` answers for each seat; `apply` records an answer without changing the shared state, and when `waiting_on` becomes empty it resolves everything at once. The draft (`draft_pick` / `choice`) already works this way; generalise that shape. Until the second input arrives the first player's answer stays hidden (the `until_revealed` rows) and may be changed (reversibility sheet).
3. **Explicit end of turn** (agreed). Stop ending the turn inside the last action. After the player's last effect the engine enters `awaiting_confirm`; `confirm_turn` runs what is now at the end of `_finish_turn` (display refill, break trigger, pass the turn). Until then the player can undo. This also removes the root cause of most "log timed" overrides in `replay/view.py`, which is a good reason to do it early and keep the replay passing.
4. **Reversibility, tagged per action and effect** (you fill this in). The second sheet, `data_manual/planning/reversibility.json` (same page, second tab), has a row for each of the 26 action kinds, the new `confirm_turn`, about 45 pending effect kinds and a few engine steps (74 rows). For each you choose `reversible`, `irreversible`, `depends` (say when in the note, e.g. display card vs deck card) or `not_applicable`. The engine reads the decided sheet to build the checkpoint rule: `undo_last` takes back the last action if it is reversible; `restart_turn` goes back to the start of the turn or to the last irreversible action, whichever comes later. `depends` rows get a small predicate in code (the note says which). With event sourcing, undo is "append an `undo` event that rewinds the state to the previous checkpoint", never deleting history (section 9.1). A test fails if an action or effect kind exists in the code but not in the sheet.
5. **Rules completeness gate.** A live game must never hit `NotImplementedError`. Work list = the "skipped" and "illegal" reasons of `engine_coverage.py` (marks from action card variants, monkey gang, unexplained X token changes, the break income of some maps, ...), plus every rule the logs cannot show because nobody played it. **Decided: only supported cards and maps can be played.** A per-card and per-map `supported` flag, computed from the data and the coverage run, filters what the lobby offers (random base projects and the deck are drawn only from supported cards; a map is offered only if its rules are done). A guard turns an unexpected `NotImplementedError` into "game paused, please report" rather than a corrupt state.
6. **End of game and result.** Make `Result` complete (scores, tie-breaks, resign/concede/abandon as a result kind), because the server stores and announces it.
7. **Rules version.** Add a `rules_version` to the game config (git hash or counter bumped on any rule change). Old games keep folding with the version they started with, or are migrated deliberately; at minimum an incompatible deploy refuses to continue a game instead of silently changing it.
8. **Performance.** `apply` deep-copies the state on every call (about 1 ms per action). That is fine for 100-300 actions per game plus a snapshot every 25; legal-action generation for Build/Animals can take much longer in bad positions, so budget it and cache `legal_actions` per `(game, version, seat)`.
9. **Structured game events.** `apply` also returns the list of **events** it caused, in full information: `{type, seat, cards, from, to, counts, revealed_to}` (card drawn, card revealed, card discarded, resource gained, building placed, break advanced, ...). Three consumers need them: the per-viewer log text (section 4.2), the `revealed` markers of the visibility sheet, and the complete game record (section 9.1). The replay's log-line labels stay separate; the engine events are the engine-native equivalent.

## 6. Server API

New package `src/ark_nova/live/` (store, sessions, projection, clocks) and routes in `api/main.py` or a router file.

| Route | Purpose |
|---|---|
| `POST /api/games` | create from a config (map(s), Marine Worlds, draft on/off, base projects or random, clocks); returns game id and the seat links |
| `GET /api/games/{id}` | lobby info: status (`waiting` / `playing` / `finished`), who has joined |
| `POST /api/games/{id}/join` | take a seat with its token (and a display name) |
| `GET /api/games/{id}/state?seat=` | the projection for the token's seat (or spectator) with `version`, the seat's compact legal-action list (only when it may act), clocks later |
| `GET /api/games/{id}/stream` | SSE: `state` events carrying `version` and the new projection or a diff; heartbeat |
| `POST /api/games/{id}/actions` | `{version, action, request_id}`: validate, append, return the new projection; `409` on a stale version; idempotent on `request_id` |
| `POST /api/games/{id}/undo`, `/restart`, `/confirm` | the turn controls (or fold them into `actions`) |
| `POST /api/games/{id}/resign`, `/draw` | end by agreement or concession |

Rate limiting (the stubbed hook) is switched on for these routes: per token and per IP. Request bodies are size limited, the action schema is validated before it reaches the engine, and an unknown action kind is a plain `422`.

## 7. Frontend

The viewer (`replay.js`) renders a state and a decision summary; the play page needs the same renderer with input handlers and a very different loop (server state in, one action out).

1. **Split `replay.js`** into modules: `render/board.js` (zoo maps, buildings, bonuses), `render/cards.js`, `render/trackers.js` (side panel, break/round), `render/shared.js` (display, projects, association board), `render/bar.js` (the decision bar), `animate.js` (the green/red change flashes, driven by comparing consecutive states), and `replay.js` / `play.js` as thin controllers. The current code uses closure-level state (`replay`, `step`); introduce an explicit `view model` so the same renderers take a state from either source. This is the largest frontend task and is done *first*, behind the unchanged replay UI.
2. **Interaction layer** for the play page (the mediator of section 5.1: it groups the legal actions of the seat into elements and maps input back to one of them):
   - the action bar buttons become real controls (choose an action card, spend X tokens, take/skip effects in any order, confirm/undo/restart);
   - map hexes become click targets for building placement: hover shows the footprint at the chosen rotation, illegal hexes are inert (the legal `(x, y, rotation)` list per building type comes from the server);
   - cards are selectable: click the hand/display to select with the check mark and green border, a confirm button appears (the discard and keep prompts described for the replay);
   - project slots, partner zoo/university choices, association tasks, the draft cards, X-token payment all get a click path;
   - the opponent's moves arrive over SSE and are shown with the existing change animations; a "waiting for X" state and a clock per player.
3. **Per-viewer POV**: the player sees their hand; the opponent's hand is card backs. The replay's "both hands visible" mode stays replay-only (a flag on the view model).
4. **Reconnect and recovery**: the page stores `(game id, seat token)` in `localStorage`; on load it fetches the state, then opens the stream from `version`. A dropped stream retries with backoff. A `409` re-fetches and drops the half-made choice.
5. **Mobile**: reuse the drawer layout; the play bar needs the large tap targets already used in the replay. Placing buildings on a phone is the hard case (pan/zoom the map).

## 8. The three modes on one server

| Mode | Who acts | State source | Differences |
|---|---|---|---|
| **Live game** | two people, one seat each | new game from config (draft first) | everything above |
| **Sandbox** | one person acts for both seats | a replay step (a fork) or an edited position | no hidden-info projection (the one user sees all), no clocks; needs a *position editor* and a state validator (card conservation: every card exactly once across decks, hands, zoos, discard) |
| **Custom game** | two people | new game with chosen map, expansions, options, base projects | the lobby/config screen; gating by what the engine supports |

**Fork from a replay** becomes: create a sandbox (or live) game whose initial state is the replay state at a step. That requires the replay state to be an *engine* state. Steps the engine replayed and matched already are; steps built from the log only (flagged in the viewer) must not be forkable until their turn is supported, or must be re-synced from the log with a warning. The unknown part of the deck order is filled with the seed finder's `tail_seed` as designed (`PROJECT_OUTLINE.md` section 6); for a *live* fork between two real players the server picks a fresh secret seed.

## 9. Lifecycle, fairness and the game record

- **No time control at first.** A game has no clock; a seat that is away for a long time marks the game "paused"; either player can resign. A game untouched for 30 days is archived as abandoned.
- **Clocks later**: a simple real-time clock with several speed settings (for example per-move time or a time bank per player, a few presets), enforced by the server (`deadline` stored with the game, checked on every read and write, plus a timer for active games). Nothing in the engine changes: time lives in the server and in the game record. Policy for timeouts (loss or pause) is decided when this step comes.
- **Deploys**: a deploy must not kill a game. Because the store is the truth, any instance can continue it; the `rules_version` rule (5.7) covers incompatible rule changes.
- **Cheating surface**: no secret ever reaches the client (section 4); moves are validated against the engine; the seed is server-only; seat tokens are long random strings shown once; spectators get the view of a player with hidden hands.

### 9.1 The game record: every game is logged completely
Each game keeps a complete, full-information record from the first player joining to the end, so that anything that happened can be reproduced, analysed or shown later. It is written as the game goes (append only, in a Firestore subcollection `games/{id}/record`) and exported when the game ends.

What it contains:
1. **Header**: game id, config (maps, expansions, base projects, draft on/off), the seed and deck prefix, `rules_version` and the code version (git hash), the supported-content flag set used, player names, hashed seat tokens (never the tokens), created / started / finished times, the result and how the game ended (scored, resigned, abandoned, paused).
2. **Every submitted action, accepted or not**: sequence number, seat, the action, server timestamp, the `version` it was made on, the client's `request_id`, the outcome (accepted / rejected with the reason / stale), and the milliseconds since the previous event of that seat (time spent per decision, useful for later clock presets).
3. **Every engine event** caused by an accepted action (section 5.9) with full information: who drew which card, what was revealed to whom, resources before and after, the shuffle that happened. Together with the seed this lets you re-run the game, but the events also make it readable without re-running.
4. **Control events**: undo and restart (what they took back), confirm, the draft choices and when both were in, resign, pause, join / leave / reconnect of each seat and of spectators.
5. **State checkpoints and per-action patches**: the full state at the start, at every confirmed turn and at the end (the snapshots of section 3.1 kept instead of deleted), and for every accepted action a compact JSON patch from the state before to the state after. With the patches a record can be replayed and analysed **without the engine that played it**: the replay (section 9.3) never depends on an old `rules_version` still being deployable. The patches are small (an action changes a few fields) and gzip well; the full states stay the integrity check.
6. **Decision context** (optional, off by default): how many legal actions the seat had at each decision, for analysis of difficulty.

What it deliberately does not contain: seat tokens, IP addresses, browser details.

Use:
- **Finished game export**: when the game ends, the whole record is written once as one gzipped JSON file in GCS (immutable) and the table registry row gets its path (section 9.2).
- **Replay**: the record is an engine-native log, so a finished live game can be opened in the replay viewer (step through, fork) without any BGA log: see section 9.3 for what changes in the replay code.
- **Bug reports**: a game that hit "paused, please report" or a rules error can be reproduced exactly from its record (seed + actions + rules_version).
- **Rules regression tests**: finished live games are added to a test folder like `log_examples/`: the engine must reproduce every recorded event.
- Size and cost: a game is about 100-300 actions; the record is roughly 0.5-2 MB with snapshots, well within the free quota for a handful of games per day; the retention of the live documents is shorter than that of the GCS export (which is kept).

### 9.2 Table ids and the table registry (BigQuery)

**Every table has a unique table id** from the moment it is created, and one row per table in a BigQuery registry, `live_tables`, that follows the table through its life and ends up pointing at the log file in GCS. Firestore stays the live source of truth while the game runs (it has the transactions the game needs); BigQuery is the index and the permanent catalogue. The volume (a handful of games a day) makes BigQuery's weak transaction story irrelevant.

**The id.** A string `E{n}` where `n` is an incrementing integer (`E1`, `E2`, `E3`, ...). BGA table ids are bare numbers, so the `E` prefix tells the two apart at a glance and everywhere: the lookup route, the replay route and the index send an id that starts with `E` to the live registry and a number to the BGA index, without a lookup first. A BGA id can never collide with a live one. Allocation must not depend on BigQuery (it has no counter and no uniqueness constraint): a Firestore transaction on a counter document hands out the next `n`, which also keeps the ids short and in creation order. If that document is ever lost, the next `n` is the highest `table_number` in the registry plus 1.

Code that assumes a table id is an integer has to change when this is built (a checklist for L4): `api/tableid.py` (`parse_table_id` returns `int | None` and accepts only digits; it must also accept `E<digits>`, case insensitive, and return the canonical `E{n}`); the routes in `api/main.py` that declare `table_id: int` (they become `str` validated against `^(E\d+|\d{1,12})$`, and the cache keys/ETags already use the value as text); `GameConfig.table_id: int` (the BGA table, used for the older-table rule quirks; a live game is `0` there and carries the `E` id in its own field); `web/js/replay.js` and `web/submit.html` (`/^\d+$/` checks on `?table=`); `TableRecord` and the index lookup (`storage/index.py`); the landing page hint ("Paste a BGA table id or `E12`"). Sorting and range queries use a separate integer column.

**The row** (`live_tables`, one row per table):

| column | meaning |
|---|---|
| `table_id` | the unique id, a string `E{n}` (STRING, primary key by convention) |
| `table_number` | the `n` of the id as INT64, for ordering and for finding the highest id |
| `status` | `waiting` (created, seats not full), `playing`, `paused`, `finished` (played to the end and scored), `resigned`, `abandoned` (nobody came back), `cancelled` (never started, or cancelled by a player), `error` (the engine could not continue) |
| `end_reason` | free text for the details (who resigned, which rule failed, ...) |
| `created_at`, `started_at`, `ended_at` | timestamps |
| `player_names` | the two typed names (array) |
| `maps`, `marine_worlds`, `config` | what was played (config as JSON) |
| `rules_version`, `code_version` | which engine played it |
| `n_actions` | number of accepted actions |
| `scores`, `winner` | final result when there is one |
| `gcs_path` | `gs://<bucket>/live/<yyyy>/<mm>/<table_id>.json.gz` (for example `.../E12.json.gz`) of the complete record, **set when the record was exported** (a finished game always has one; other endings export too when at least one action was played; `NULL` for a table that never started) |
| `exported_at`, `record_bytes` | when and how big |
| `schema_version` | version of the record format |

**The life cycle.** The server writes the row at each change of `status`:
1. table created -> insert `waiting`;
2. second seat joined and the draft starts -> `playing` (`started_at`);
3. long silence -> `paused`, back -> `playing`;
4. game ended, cancelled, resigned or abandoned -> the record is exported to GCS first, then the row is updated with the final `status`, `end_reason`, `ended_at`, the result and `gcs_path`. The order matters: the path is only written once the file exists.

**BigQuery details that matter** (checked against how BigQuery behaves, not yet against this project):
- Rows added through the *streaming* insert API cannot be updated for up to about 90 minutes. Use DML (`INSERT` / `UPDATE ... WHERE table_id = @id` / `MERGE`) or load jobs, so a row can be changed at once. DML on a table is limited to a few concurrent statements and takes a second or two; at this volume that is fine.
- A `MERGE` keyed on `table_id` makes every write idempotent, so a retry cannot create a duplicate row or lose an update.
- The alternative that avoids `UPDATE` completely is an append-only `live_table_events` table (one row per status change) with a view `live_tables` that returns the last row per `table_id`. It is more robust and keeps the history of status changes, at the cost of a view. Pick one; the `UPDATE` version is simpler and is what the plan assumes.
- BigQuery is not on the critical path of a move. A failed registry write must never block or fail a game: the Firestore game document gets a `registry_dirty` flag, a retry (with backoff) updates BigQuery, and a periodic job (Cloud Scheduler hitting an admin route) syncs every dirty or stuck table. The registry is therefore eventually consistent with Firestore; the GCS file is only written from Firestore, so it is complete whatever BigQuery did.
- Cost: DML on a small table bills the minimum (10 MB) per statement, a few statements per game: well inside the free tier.
- The existing BGA tables (`all_games_stat`, `logs_archive_mapping`) are not touched: the lookup tries the registry for ids that start with `E` and the existing index for the others. The GCS path is `live/<yyyy>/<mm>/E<n>.json.gz`.

**What uses it.** The landing page and `/api/lookup` accept a live table id and open the replay of a finished game from `gcs_path`; an unfinished or cancelled table says so. An admin view (later) lists tables by status; the stuck-table job finds `playing` tables untouched for N days and marks them `abandoned` (exporting what exists).

### 9.3 Replaying a recorded game

The replay today is built from a BGA log: `parser` turns the log into events, `replay/builder.py` builds a state per step from them, `replay/differential.py` plays the same turns on the engine and `replay/view.py` mixes the two and adds the "log timed" overrides. A recorded game needs none of that: the record already is an engine-native, full-information log. The replay code therefore gets a second **source** next to the BGA log, and the viewer does not care which one produced a step.

**What changes in `src/ark_nova/replay/`**
1. **A source interface.** `build_replay_view(source)` takes a `ReplaySource` (`kind`, `table_id`, players and maps, the list of raw steps). Today's code becomes `BgaLogSource` (the existing parse + build + differential path, unchanged). The new `RecordSource` reads the record of an `E{n}` table.
2. **`replay/from_record.py`.** Reads the record (gzipped JSON from `gcs_path`, found through the registry; the same cache layer as the BGA logs) and produces the steps directly:
   - one step per accepted action (a sub-step per engine event of that action where it helps: "draws 2 cards", "gains 5 appeal", so the move list reads as it does for a BGA game);
   - the state after each step comes from the record: the checkpoints plus the per-action patches (section 9.1.5), so no engine run is needed. When the record's `rules_version` equals the deployed engine, a test mode refolds the actions and checks that both agree;
   - undo and restart are steps of their own ("X took back: ..."), and the state rewinds to the checkpoint they went back to; the viewer's change flashes then show the rewind. A toggle in the viewer hides undone moves for a clean read (default: shown, greyed).
   - the confirm step and the draft are steps too, in the order they happened.
3. **No timing overrides.** The record has no log-timing problem: events and states are the engine's own, so none of the `TIMED_BY_LOG` fields, the log-timed player fields, the gain/jumping dropping or the draft look-ahead of `view.py` are used for this source.
4. **Labels from engine events.** The text of a step comes from the same event-to-text generator that the live game uses for its move log (section 4.2). Full information: a replay may name every card, since the game is over. (Whether a *running* game's record can be opened is a spectator-policy question, open decision 3.)
5. **Options and actor from the record.** `options` (the decision bar) for a step is computed from the recorded state by the existing `replay/options.py` (it is an engine function), `actor` is the recorded seat of the action, `engine.source` is always `engine` with status `ok`: a recorded game has no unsupported parts.
6. **Structured step data instead of label regexes.** The viewer currently reads some facts out of the label text (`pays N xtoken ...` for the spent X tokens, `draw ... for perception effect` for the reveal text, `End of the break` for the timeline and the round count). For a record there is no BGA wording to match. Steps get explicit fields for these (`spent_x`, `reveal_drawn`, `round_started`, ...) filled by both sources, and the viewer reads the fields; the BGA source fills them from its labels. This is a small refactor done once for both sources, covered by the existing replay tests.

**What the viewer gains from a record**
- the draw pile popup can show the **real** order of the cards (the seed is in the record), not "known part / random guess";
- every step is a real engine state, so **fork works at any step**, including inside a turn;
- no "not supported yet" flags.

**API and pages.** `GET /api/tables/{id}/replay` accepts `E{n}` ids: the registry row gives `status` and `gcs_path`; a table that is not finished (or has no path) answers with its status instead of a replay. The landing page and `replay.html?table=E12` need nothing else once `parse_table_id` accepts the new id (section 9.2). The ETag / cache layer already added for BGA replays applies unchanged (a record never changes after the export).

**Versions.** The record header has `schema_version` and `rules_version`. The reader handles every schema version it ever wrote (a small migration function per version). Because of the patches, an old `rules_version` is not a problem for viewing; it only matters for forking (the fork starts a new game on the *current* engine from the recorded state; if that state no longer validates on the current rules, the fork is refused with a message).

**Tests**
1. A self-play game produces a record; the record replays to the same final state and the same scores; every step state equals the engine's state after that action (refold check).
2. The step stream of a record that contains undo, restart, a rejected and a stale submission and a reconnect matches the expected sequence, and the rewind states are right.
3. The same viewer tests that run on BGA replays run on a record replay (steps numbered without gaps, timeline rounds, draw pile popup, draft bar, decision bar on every step).
4. Both sources produce the same step fields (the shared schema above); a field missing from either fails a test.
5. A record with an older `schema_version` (kept as a fixture) still opens.

## 10. Testing

1. **Determinism/replay**: for every sample log, fold the engine's actions from the log and check the final score (exists), and additionally check that `(config, seed, actions)` serialised through the store and back gives the same state.
2. **Fuzz / self-play**: random legal-move bots play thousands of full games per rules change; invariants checked after every action (card conservation, track limits, no `NotImplementedError`, game always terminates, `legal_actions` never empty unless over). This is the main protection for rules that no log exercised.
3. **Projection tests**: for random states, the projection for seat A contains no card id from B's hand, no deck order, no seed; and applying actions shown to A never needs hidden data.
4. **API tests**: two simulated clients over the real routes: concurrent moves (version conflicts), reconnect mid-turn, undo/restart rules (reversible vs irreversible), timeouts, resign, replayed `request_id`.
5. **UI tests** with a headless browser for the click paths (placement, card selection, draft), on desktop and phone width.
6. **Game record and registry**: play scripted games (including undo, restart, rejected and stale submissions, a reconnect) and check that the exported record reproduces the final state, contains every submitted action, and contains no seat token. Registry: ids are unique `E{n}` strings and strictly increasing under concurrent creation, and `parse_table_id` / the routes accept both forms; every ending (finished, resigned, abandoned, cancelled before the start, error) leaves the right `status` and a `gcs_path` that exists exactly when a record was exported; a BigQuery failure does not stop the game and is repaired by the retry / sync job; the update is idempotent (run twice, one row).
7. **Load**: a few dozen simultaneous games on a single instance, SSE connection counts, Firestore read/write cost per game.

## 11. Phases

| # | Deliverable | Exit criteria |
|---|---|---|
| L0 | The two planning sheets filled in (`web/planning.html`); supported-content flag (which cards/maps are fully implemented) | no undecided rows; flag computed from `engine_coverage` |
| L1 | Engine: explicit confirm step, both-seat input states, reversibility from the sheet + undo/restart, structured events, `rules_version`; replay kept green | engine and replay tests pass; replay no longer needs the "log timed" overrides for turn end |
| L2 | Rules completeness for the supported set + fuzz harness | 100k random games play to the end with invariants intact |
| L3 | Live package: Firestore store, sessions, the projection driven by the visibility sheet, API routes, seat links with player names | two scripted clients play a full game over the API; projection tests pass |
| L4 | **Game record and table registry**: unique table ids `E{n}` (Firestore counter), the BigQuery `live_tables` row updated through the life of the table, header, every action and engine event, control events, checkpoints, GCS export with the path written to the row; replay of a recorded game | every ending leaves the right status and path; a finished game's record reproduces its final state and is read back by the replay viewer; BigQuery outages do not affect a game; no tokens in the record |
| L5 | **Replay of recorded games** (section 9.3): the source interface, `from_record.py`, the structured step fields shared with the BGA source, `E{n}` ids in the replay API | a self-play record and a live game both open in the existing viewer, fork works at any step; the BGA replays are unchanged |
| L6 | Frontend split into render modules (replay unchanged) | replay pixel-identical, all existing tests pass |
| L7 | Play page: the mediator UI (grouping legal actions, mapping input back), SSE, reconnect, draft, confirm/undo/restart | two browsers finish a game |
| L8 | Hardening: rate limiting on, abandonment, retention, spectator view | load test and soak test pass |
| L9 | Clocks with speed settings | timed games with the presets decided then |
| L10 | Sandbox (position editor, fork from replay) and custom game lobby | landing page cards go live one at a time |

L1-L2 are the long ones; L3-L4, L5 and L6 can proceed in parallel once L1's action and event shapes are fixed (L5 only needs the record format of L4, and can start from a self-play record before the server exists). L4 comes right after L3 on purpose: the record exists from the first playable game, so no early game is lost.

## 12. Decisions

Taken:
1. **Time**: no time control at first; a simple real-time clock with several speed settings later (L9).
2. **Persistence**: Firestore; the free quota is enough to start.
3. **Identity**: no accounts for now; seat links plus a typed player name.
4. **Content**: only supported cards and maps are available.
5. **Logging**: every game is logged completely (section 9.1, phase L4).
6. **Decisions UI**: the browser is the mediator between the legal actions and the UI elements (section 5.1).
7. **Simultaneous choices**: engine states that accept input from both seats and continue when both are in (5.2).
8. **Confirm step** for the end of a turn (5.3).

Still open:
1. **Undo policy**: confirm step always on, or optional ("quick play" confirms automatically except after irreversible actions)? Does the opponent see an undone move?
2. **Timeout policy** (for L9): loss or pause; can the opponent wait or abort.
3. **Spectators and replays of live games**: allowed? live, delayed, or after the game only? Opening a record of a game in progress would show both hands; replays of recorded games are assumed to be for finished tables only.
9. **Record format**: store a state patch for every action (assumed, section 9.1.5, bigger record, replay independent of the engine version) or only checkpoints + events and refold with the engine (smaller, but an old `rules_version` could no longer be replayed without keeping that engine)?
10. **Undone moves in the replay**: shown greyed by default (assumed) or hidden?
4. **Draft and setup**: always the action card draft, or the choice of standard cards; who picks the 3 base projects and the maps in a custom game?
5. **Expected scale**: a handful of friends, or public? This decides the instance, rate-limit and abuse budgets.
6. **Record retention**: how long the live Firestore documents stay (the GCS export is kept) and whether player names are kept in the exported record.
7. **Registry shape**: `UPDATE` on one row per table (assumed) or append-only status events with a view (more robust, section 9.2)? Which bucket and prefix for the log files (the existing `temp-common-storage`, or a new bucket for live games)?
8. **Exports for unfinished tables**: export the record of a resigned / abandoned / cancelled table when it has actions (assumed), or only for finished games?

## 13. Main risks

- **Rules coverage** is the real gate: a crash or a wrong rule in a live game is worse than in a replay, where a mismatch just gets flagged. Fuzzing and the completeness list cost more than the networking.
- **Hidden information leaks** are easy to introduce (a debug field, a label in the log text). The projection is the only way out of the server and has its own tests.
- **Replay and live drifting apart**: the replay keeps log-timed overlays that the engine does not need. Doing the explicit confirm step early and reducing the overlays keeps one source of truth.
- **Frontend size**: the viewer is a single large file with global state; the split (L4) must be finished before interactions are added, or both will be rewritten twice.
- **Cloud Run behaviour** with long-lived streams and scale-to-zero (cold starts, 60 minute request cap, instance fan-out) needs a spike early in L3.
