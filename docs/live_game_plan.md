# Plan: live 2-player Ark Nova games

Status: **built** (phases L3 to L7 and L9 and the sandbox of L10 are done, L0 to L2 and L8 partly, see section 11; open: structured engine events, the engine-upgrade policy of 5.10, rate limiting and the retention / stuck-table jobs of 9, the custom game lobby, a card-level `supported` flag). The sections below were written as a plan; what is built is marked **built** or **implemented**, what is still only a plan says so. Code: engine in `src/ark_nova/engine/`, live service in `src/ark_nova/live/`, routes in `src/ark_nova/api/live.py`, Worker and Table DO in `cloudflare/src/`, replay in `src/ark_nova/replay/`, viewer in `web/js/` (`main.js` and modules, play page `play.js`).

Decisions already taken (section 12): a real-time clock per player with three presets or a custom start and increment (built, 9); **Cloudflare Durable Objects as the table keeper (one per game, with its own SQLite and the WebSockets), the Python engine staying on Cloud Run** (free plan up to roughly 30 games a day, then about $5 a month); no accounts, only a seat link and a player name; only fully supported cards and maps can be played; every game is logged completely (section 9.1).

## 1. Goal and scope

Two people play a real game against each other in the browser, on the from-scratch engine, with the same board UI as the replay: a lobby/invite link, the action card draft, the whole game with the break/endgame/scoring, hidden information kept hidden, turn confirmation with undo, and reconnecting. Spectators and a finished-game replay come after.

Out of scope for the first version: accounts and ratings, matchmaking, chat, 3-4 players, AI opponents, tournaments. (Clocks were out of scope at first and are built now, 9.)

The landing page has the two neighbouring modes: **sandbox** (built: `web/sandbox.html`, `/api/sandbox/*`; the user plays one seat against a bot that only passes, and can edit the position) and **custom game** (new game with own options; still "coming soon" on the landing page, not built). The live game itself is still hidden on the landing page behind an unlock word (`web/index.html`); seat links work without it. The modes share part of the machinery (section 8).

## 2. Where the code stands

This section describes the starting point when the plan was written; the right-hand column of the table is what was built since (section 11).

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
| Time | none | conceded and abandoned games, and a clock per player with presets (built: `live/clock.py`, 9) |
| Viewer code | one 2,000 line `replay.js` that renders and also owns the replay stepping | a render layer that both the replay and the play page use |

## 3. Target architecture

**Decided: Cloudflare Durable Objects keep the tables, Cloud Run keeps the engine.** The first draft of this plan used Firestore and server-sent events; the Durable Object design replaced it because one object per game gives a single writer, ordered appends and push to the browsers without any request held open on Cloud Run (cost and trade-offs: 3.5). Diagrams: [live_architecture_cloudflare.html](live_architecture_cloudflare.html).

```
 Browser A (seat 0)                                   Browser B (seat 1)
     │  WebSocket  /ws/E12?s=<seat token>  (updates are pushed)  │
     └───────────────────────┐                ┌──────────────────┘
                             ▼                ▼
                    Cloudflare Worker  (live.<domain>)
                    /ws/*  → Table DO       /api/*  → Cloud Run
                             │                           ▲
              ┌──────────────┴───────────┐               │ POST /api/games/E12/actions
              │  Table Durable Object E12 │               │   {version, action, request_id}
              │  SQLite: config + seed,   │◄── /append ───┤
              │  actions, record steps,   │──── /state ──►│  API (FastAPI, Cloud Run):
              │  latest view per seat,    │               │  validate + apply with the engine,
              │  version, seat hashes     │               │  projections, record step
              └───────────────────────────┘               └─ BigQuery registry, GCS export
   id counter DO: hands out E{n}
```

### 3.1 Event sourcing on the engine's own action list
The source of truth of a game is `(config, seed, [action])`: exactly the shape the engine design already promised for fork sessions. The current state is a fold of the actions over `start_game`. A snapshot every ~25 actions (kept in the table's SQLite) bounds the rebuild time. This gives replay, undo, spectating, crash recovery and the finished-game replay for free, and it keeps every rule in the one place that is already tested against real logs.

Consequences:
- The action list is append only, with a monotonically increasing `version`. A submit carries the version it was made on; a stale one gets `409` and the client resynchronises (optimistic concurrency, no locks).
- The server validates every submitted action with `action in legal_actions(state)`. The client is never trusted; it only proposes.
- The engine must stay deterministic across deployments: the rules version is written into the game record (a new deploy must not change how an old game folds; see 5.10). **Known limitation:** the version is recorded but not pinned. `LiveService._load` rebuilds a table (after a restart or a cache miss) by folding its stored actions with the *current* engine, whatever `engine_version` the table was created with, so a rule change deployed while a table is running can make its refold differ or fail.

### 3.2 Storage
**One Table Durable Object per game** (named `E12`, the table id of 9.2) with its own SQLite database is the live source of truth: `game` (config, seed and engine version, never sent to a browser; seat token hashes, display names, status, `version`), `actions` (one engine action per row, append only), `steps` (the record steps of 9.1, viewer part and engine patches), `views` (the latest projection of seat 0, seat 1 and spectators, so a reconnecting browser gets its view without any engine work), `snapshots` (state every ~25 actions), `requests` (request ids, for idempotent retries). A Durable Object runs one thing at a time, so an append is a single SQLite transaction with the version check and needs no locks. A small **id counter DO** hands out `E{n}`.

Cloud Run's local disk and memory are a cache only (an LRU of recent states per table); any instance can serve any table. Finished games are exported once as a JSON action list to GCS (cheap, immutable); the DO deletes its data as soon as the export is confirmed (`finalize`; decision 18). The registry of all tables is BigQuery (9.2).

Write budget: about 3,300 SQLite rows written per game (action, step and game rows, plus the latest view of each seat and of the spectators per action). The free plan allows 100,000 row writes a day: about 30 games a day; the $5 plan raises this far beyond the expected use.

### 3.3 Realtime transport
**WebSocket from each browser to its Table DO** (`/ws/E12?s=<seat token>`; the DO checks the token hash, tags the socket with the seat and uses the hibernation API, so an idle table costs nothing). Every accepted move is pushed to every socket of the table as `{version, view, decision}`: `view` is that seat's projection (4.2), `decision` the compact legal-action list for the seat whose turn it is (none for the others). A returning browser reconnects and is sent the latest stored view of its seat. Besides `state` the socket carries `lobby` (names, status), `status` (the table ended) and `abandon` (a proposal to abandon, 9) messages; the page sends `ping` to keep it alive. Moves go the other way over plain HTTPS `POST` to Cloud Run, not over the socket (3.5). Without a configured Worker (`GET /api/live/config` returns an empty `ws_base`) the play page polls `GET /api/games/{id}/state` every 2 seconds.

Rejected: server-sent events from Cloud Run (every open connection holds a Cloud Run request for up to 60 minutes and fan-out across instances needs Pub/Sub or listeners); Firestore listeners in the browser (the browser would read documents directly, which defeats the hidden-information rule unless every document is already a per-seat projection).

### 3.4 Identity
No accounts. Creating a game returns two secret **seat links** (`/play.html?game=E12&s=<token>`; the tokens are `secrets.token_urlsafe(24)`): whoever holds a link is that seat. Only a hash (SHA-256) of the token is stored, in the Table DO; the DO checks it when a socket connects, and Cloud Run checks it on every request (the hash comes with the DO's `/state`). Over the API a seat token travels in the `X-Seat-Token` header, or as `?s=` in the URL (the body field `token` is accepted too); the WebSocket takes `?s=`. The creator's seat (who plays first) is drawn by chance. Each player types a **player name** when they join (shown to the opponent and kept in the game record). A third, tokenless link (`play.html?game=E12`) is the spectator view. Sign-in can bind a seat to an account later without changing the protocol.

### 3.5 The Table Durable Object in detail (decided)

Diagrams: [live_architecture_cloudflare.html](live_architecture_cloudflare.html) (open it in a browser). Cost: about $0 up to roughly 30 to 50 games a day on Cloudflare's free plan (the row-write budget decides), then $5 a month; Cloud Run compute is about 0.3 cents a game because no request is held open.

**Roles.** Cloud Run keeps the Python engine and is the only place that decides whether a move is legal and what each viewer may see. A **Table Durable Object** (one per game, named `E12`) is the table's *keeper*: it orders the moves, stores them (its own SQLite), and pushes updates to the open WebSockets. A small **id counter DO** hands out `E{n}`. A **Worker** is the front door of `live.<domain>`: `/ws/E12` goes to the Table DO, `/api/*` is proxied to Cloud Run. The engine never runs on Cloudflare.

**Receiving moves.** Each browser opens one WebSocket to its Table DO (`/ws/E12?s=<seat token>`; the DO checks the token hash, tags the socket with the seat, and uses the hibernation API so an idle table costs nothing). Every accepted move is pushed to every socket of the table as `{version, view, decision}`, where `view` is that seat's projection (4.2) and `decision` is the compact legal-action list for the seat whose turn it is (none for the others). A returning browser reconnects and is sent the latest stored view of its seat; nothing is replayed.

**Making a move.** The browser posts `{version, action, request_id}` over HTTPS to Cloud Run (through the Worker). Cloud Run (1) checks the seat token, that it is that seat's turn and that the action is in `legal_actions(state at version)`; the state comes from its LRU cache, or, on a miss, from `GET /state` on the DO (latest snapshot plus the actions since); (2) applies the action and computes the engine events, the views of seat 0, seat 1 and spectators, the next decision and the record step (9.1.5); (3) calls `POST /append {expected_version, request_id, action, step, views}` on the DO. The DO runs one SQLite transaction (nothing else runs on a Durable Object at the same time): if `version == expected_version` it inserts the rows, sets `version + 1`, keeps the latest view of each seat, and pushes to the sockets; otherwise it answers `409 {current version}` and Cloud Run re-validates against the newer state (a different move got in first) or answers the browser `409 stale`. `request_id` makes the append idempotent: a retry after a lost response returns the stored result.

**Why this split.** The DO gives a single writer per table, ordered appends and push to the browsers without any held-open Cloud Run request (the job that a document store with transactions and listeners would have done). Cloud Run stays stateless apart from a cache, so any instance can handle any table.

**What lives where.** DO SQLite: config and seed (never sent to a browser), seat token hashes, the actions, record steps (viewer + engine patches), the latest view per seat, request ids, the version, the clock (kept in the stored `config`; there is no alarm: a timeout is claimed by the opponent, 9), the proposal to abandon and the registry events not yet acknowledged. Cloud Run: the engine, the projection rules, the registry events (BigQuery) and the finished export (GCS: `GET /record` from the DO, write the file, update the row, then `finalize` so the DO deletes its data at once). The DO's `/state`, `/append`, `/record`, `/finalize` and `/init` are internal: the Worker accepts them only with a signed header from Cloud Run.

**Costs of the split.** About 3,300 SQLite rows written per game (action, step and game rows plus the latest view of each of the two seats and spectators per action): the free plan's 100,000 rows a day is about 30 games a day. Round trip for a move: browser to edge to Cloud Run to DO and back, about 150 to 400 ms plus the engine time. Two clouds to operate, and a bug window if Cloud Run validates against version v and the DO is already at v+1 (closed by `expected_version`).

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
- **Projection function** `project(state, role)` and `views(state, labels)` (**built**, `live/projection.py`): the one place that turns a full state into what a viewer may see. It is hand-written to follow the decided sheet (its docstring lists the rows by value); it does not read `visibility.json` at run time, and a test that fails when a state field has no decision is not written (`scripts/gen_planning.py` flags such fields when the sheet is regenerated). Everything the server sends to a browser, including the decision list and the log text, goes through it.
- The server never sends the full state. The seed, the RNG state and the deck order stay in the store; the counts are sent.
- The draw pile, endgame deck and "known/unknown order" popups of the replay are replay-only features; the play page shows counts.
- `until_revealed` rows need the engine to say *when* a secret becomes public (the draft: when both have chosen; endgame discards: at the end). That would be one `revealed` marker per such event in the engine's event stream (section 5.9, not built); today the projection reads the stage of the draft / map selection / endgame discard from the state (`_project_draft`, `_project_map_select`).
- The move log shown in the game is generated per viewer (**built**, `live/bgalog.py`: one text for each seat and for the spectators, in BGA's wording): card names only where the viewer may see them.
- Tests assert that nothing the opponent must not see is in anything sent to a seat (`tests/test_live.py`: `test_nothing_secret_is_in_a_view`, the draft and the seed tests). A test over random full games is still to do (`scripts/selfplay.py` does not check views).

## 5. Engine changes

These are the changes inside `src/ark_nova/engine/` (and the places that read it).

1. **Decisions: the UI is the mediator.** The engine keeps a single contract: `legal_actions(state, seat)` is the list of actions that seat may take right now. The server sends that list (compactly encoded, see below) to the acting seat only; the **browser turns it into digestible elements** (grouping actions into buttons, a placement overlay on the map, selectable cards, an X token stepper, ...) and **turns the player's input back into one of the legal actions**, which it posts. The server then checks `action in legal_actions(state)` before applying it. So there is no second, typed "decision" schema to design and keep in sync with the engine, and the replay's `options.py` summary stays what it is: a replay-only helper.
   What this needs from the engine: stable, serialisable action arguments (they are already JSON), and a compact encoding for the big lists (the Build placement list can have hundreds of `(x, y, rotation)` entries per building type; group by type and send positions as arrays). The UI grouping rules live in the browser, one mapping per action kind and per prompt kind.
2. **Simultaneous choices** (**built**: the setup, the map pick, the draft, the break and endgame discards; `LiveService.simultaneous`). Some states accept input from **both seats** and move on only once both inputs are in: the draft, the initial discard, the endgame-card discard at conservation 10, the break hand-limit discards. The engine represents them as a prompt with a set of seats still to answer (`waiting_on`); `legal_actions(state, seat)` answers for each seat; `apply` records an answer without changing the shared state, and when `waiting_on` becomes empty it resolves everything at once. The draft (`draft_pick` / `choice`) already works this way; generalise that shape. Until the second input arrives the first player's answer stays hidden (the `until_revealed` rows) and may be changed (reversibility sheet).
3. **Explicit end of turn** (agreed; **implemented**, `GameConfig.confirm_turns`). After the player's last effect the engine enters the prompt `confirm_turn` (`_finish_turn`); the action `confirm_turn` runs what is now `_finish_turn_now` (display refill, break trigger, pass the turn). Until then the player can take the turn back. It is a flag, off for every replay and fork (they pass the turn inside the last action as before, so the differential tests are untouched); live games are created with it on. The "log timed" overrides of `replay/view.py` stay for the replay of BGA logs.
4. **Reversibility, tagged per action and effect** (you fill this in). The second sheet, `data_manual/planning/reversibility.json` (same page, second tab), has a row for each of the 26 action kinds, the new `confirm_turn`, about 45 pending effect kinds and a few engine steps (74 rows). For each you choose `reversible`, `irreversible`, `depends` (say when in the note, e.g. display card vs deck card) or `not_applicable`. The engine reads the decided sheet to build the checkpoint rule: `undo_last` takes back the last action if it is reversible; `restart_turn` goes back to the start of the turn or to the last irreversible action, whichever comes later. `depends` rows get a small predicate in code (the note says which). With event sourcing, undo is "append an `undo` event that rewinds the state to the previous checkpoint", never deleting history (section 9.1). A test fails if an action or effect kind exists in the code but not in the sheet.
   **Implemented** (`engine/turns.py`, tests `tests/test_turns.py`): `GameState.checkpoint` = the state when the turn started (or right after the last irreversible action) plus the actions since; `undo_last` = the checkpoint with all its actions but the last applied again, `restart_turn` = the checkpoint; both are ordinary actions in the stored action list, so a game folds through them with no special case. What is irreversible is decided by one function (`turns.irreversible`: a deck changed or the random state moved, or a secret effect such as pilfer, tutor, search discard, adapt, wave, Waza, scavenge) that follows the rules written in the reversibility sheet notes; the test that checks the sheet row by row against the action and effect kinds is still to do.
5. **Rules completeness gate.** A live game must never hit `NotImplementedError`. Work list = the "skipped" and "illegal" reasons of `engine_coverage.py` (marks from action card variants, monkey gang, unexplained X token changes, the break income of some maps, ...), plus every rule the logs cannot show because nobody played it. **Decided: only supported cards and maps can be played.** A per-card and per-map `supported` flag, computed from the data and the coverage run, filters what the lobby offers (random base projects and the deck are drawn only from supported cards; a map is offered only if its rules are done). Maps: **built** as `data/map_support.py` (`UNSUPPORTED_MAPS`, empty now, is left out of the map pool of `engine/map_select.py`); a card-level flag is not built. The guard is **built**: an unexpected `NotImplementedError` in `LiveService.move` sets the table to `error` and answers "game stopped, please report" (503) rather than leaving a corrupt state. The fuzz harness is `scripts/selfplay.py` (the 100k-game exit criterion of L2 is not claimed here).
6. **End of game and result** (**built** for scores and concession: `Result` has `scores`, `winner`, `conceded`; a concession is the engine action `concede`, and an overtime win is a concession with reason `overtime`). An abandoned table has no `Result`: it is a table status (9.2).
7. **Engine version, part of every table's config** (**built**). Each table records which engine plays it (`engine_version` with `code_hash`, `data_hash`, written into the table's config when it is created and never changed), so every game can be traced to the exact rules it was played with. Details and the limits in section 5.10.
8. **Performance.** (`LiveService` keeps a cache of 64 states; a snapshot is stored every 25 actions. A `legal_actions` cache per `(game, version, seat)` is not built.) `apply` deep-copies the state on every call (about 1 ms per action). That is fine for 100-300 actions per game plus a snapshot every 25; legal-action generation for Build/Animals can take much longer in bad positions, so budget it and cache `legal_actions` per `(game, version, seat)`.
9. **Structured game events** (**not built**: `apply` returns the state only; the step stored for a move has the label, the view patch and the decision bar instead, 9.1.5). `apply` would also return the list of **events** it caused, in full information: `{type, seat, cards, from, to, counts, revealed_to}` (card drawn, card revealed, card discarded, resource gained, building placed, break advanced, ...). Three consumers need them: the per-viewer log text (section 4.2), the `revealed` markers of the visibility sheet, and the complete game record (section 9.1). The replay's log-line labels stay separate; the engine events are the engine-native equivalent.

### 5.10 Engine versions and traceability

**What a version is.** `engine_version` is a short string declared in one place (`engine/version.py` (**implemented**), for example `1.4.0`: *major* = state or action format changed, *minor* = a rule changed, *patch* = a fix that does not change any game outcome). It is stored with three automatically computed fingerprints, so a declared version can never silently mean two different things:
- `code_hash`: a hash of the engine source files that decide rules (everything under `engine/`);
- `data_hash`: a hash of the card, map and manual data files (`src/ark_nova/data/*.json`, `data_manual/`) the engine reads;
- `schema_version`: the version of the state / action / event JSON formats.

**The release manifest.** `engine_versions.json` at the root of the repo (**implemented**; `scripts/release_engine.py --note "..."` appends a version after you drop the `-dev` suffix; the version being worked on is `x.y.z-dev` and needs no entry) lists every version ever released with its three fingerprints, the git commit, the date, and a short change note ("fixed Jumping timing", "added map 13"). It is append only.

**What is enforced.**
1. A test (`tests/test_engine_version.py`, **implemented**) computes the current fingerprints and compares them to the manifest: if the rules code or data changed and `engine_version` was not bumped (or was bumped but not added to the manifest), the test fails. Nobody can change a rule without producing a new version.
2. Every table stores `engine_version` in its config, in the Table DO's game row, in the record header and in the registry row (`live_tables.engine_version`, with `code_hash` and `data_hash` as extra columns). A query such as "all games played on 1.3.x" or "all games where a rule that changed in 1.4.0 was used" is then one SQL statement.
3. *Not built.* The server is meant to refuse to create a table on a version other than the current one, and to refuse to continue a table whose version it cannot run (abandoning it, see the policy below). Today `LiveService.create` always uses its own `ENGINE_VERSION` and `_load` never compares the stored version with it.
4. Replays (section 9.3) are meant to show the version of the game in a corner of the viewer, so a rules question about an old game always names the rules it was played with.

**A game runs on the version it started with, and an engine upgrade ends the running games (decision 15; policy only, not built: nothing abandons the running tables on a deploy, and no code compares versions, so see the known limitation in 3.1).** A deploy with a new `engine_version` makes every table that is `waiting` or `playing` `abandoned` with `end_reason = engine retired` (not exported, 9.1). Only the current engine is ever deployed: no old copies, no state converters, no draining. The server therefore never has a table on a version it cannot run; the check of 3. above only guards against a failed bookkeeping. Deploys that change no rule code or data are not engine upgrades and leave the tables alone. Because every rules change is a new version, upgrades are best batched while the rules are still being completed.

**Records outlive engine versions.** Because the record keeps per-action patches (9.1.5), a game played on `1.2.0` can still be replayed after `1.2.0` is gone. The version only matters for (a) refolding for verification (only for the versions still present) and (b) forking, where the fork starts a new table on the *current* version from the recorded state, and says so ("recorded on 1.2.0, continues on 1.5.0").

**Rule regressions across versions.** Finished records are kept as fixtures. When a new version is built, a script plays every kept fixture's actions on the new engine and reports where the new version disagrees with the recorded events. A disagreement is either a bug in the new version or an intended rule change; the change note of the version must list it. This is the practical meaning of full traceability: every behavioural difference between two versions is found, listed and justified before release.

## 6. Server API

**Built.** Package `src/ark_nova/live/` (the client of the Table DO, sessions, projection, clocks, registry, archive) and the routes in `src/ark_nova/api/live.py` (added to the app by `api/main.py` when `LIVE_KEEPER_URL` and the internal secret are set); a separate Cloudflare project (`cloudflare/`: the Worker, the Table DO and the id counter DO, in TypeScript) that never contains a rule. The DO's `/init`, `/state`, `/append`, `/record` and `/finalize` are internal: the Worker accepts them only with a signed header from Cloud Run.

| Route | Purpose |
|---|---|
| `GET /api/live/options` | the game modes (`original`, `random-mirrored` default, `free-select`) and the time control presets with the limits of the custom setting |
| `GET /api/live/config` | `{ws_base}`: the WebSocket base of the Worker (empty: the page polls) |
| `POST /api/games` | `{marine_worlds, game_mode, time_control}`; `time_control` is `{speed: slow \| normal \| fast}` or `{start, increment}` in seconds; returns the game id, the two seat tokens and `creator_seat` |
| `GET /api/games/{id}` | lobby info: status (`waiting` / `playing` / ...), version, names |
| `POST /api/games/{id}/join` | take the seat of the token with a name; the game starts (and the clocks) when both seats have one |
| `GET /api/games/{id}/setup` | what the play page needs besides the views: maps, card catalog, names, the seat of the token, the clock, the proposal to abandon |
| `GET /api/games/{id}/state` | the stored view of the token's seat (or the spectator view without a token): `version`, `view`, the seat's compact `decision` (only when it may act), `label`, the clock |
| `GET /ws/{id}?s=<token>` | WebSocket to the Table DO (through the Worker, not Cloud Run): the latest view on connect, then every accepted move pushed (`state`), plus `lobby`, `status` and `abandon` messages |
| `POST /api/games/{id}/preview` | `{version, action}`: is the move legal now, and is it irreversible (the page asks the player first); changes nothing |
| `POST /api/games/{id}/actions` | `{version, action, request_id}`: Cloud Run validates and applies, then appends to the DO with `expected_version`; returns the new view; `409` on a stale version (except a simultaneous choice that is still good, `simultaneous_match`); idempotent on `request_id`. The turn controls are actions: `confirm_turn`, `undo_last`, `restart_turn` |
| `POST /api/games/{id}/concede` | a player concedes (a move of the game: the other wins with the scores of the position); in a table that is still `waiting` it just closes the table |
| `POST /api/games/{id}/timeout` | the opponent claims the win on overtime while the other player's clock is at zero or below (a concession announced as overtime) |
| `GET /api/games/{id}/abandon`, `POST .../abandon`, `POST .../abandon/withdraw`, `POST .../abandon/answer` | abandon by agreement: one proposes, the other answers `{agree}`; a rejection starts a cooldown (10 minutes, `ABANDON_COOLDOWN_SECONDS`) for the proposer; if both propose the table is abandoned at once (9) |
| `GET /api/games/{id}/result` | the end page's data (names, result, statistics), from the registry, so it works after the DO has deleted the table |
| `GET /api/tables/E{n}/replay`, `GET /api/lookup?q=E12` | the replay of a recorded game (9.3) and the landing page lookup |

Table ids are `E` and up to 9 digits (`^E\d{1,9}$`); an id that does not match is a `404`. Errors are `{status, message}` with `409` (`stale`, `ended`, `not_started`, `not_replayable`, `abandon`, `exists`), `403` (`forbidden`), `404` (`no_game`), `422` (`illegal`, bad body), `503` (`engine_stopped`) and `502` (the keeper could not be reached).

Guards: request bodies are limited to 20,000 bytes (`MAX_BODY`), the body must be a JSON object, and a move that is not among `legal_actions` is a plain `422`. The rate limit middleware (`api/ratelimit.py`) is off unless `RATE_LIMIT_ENABLED` is set, and it deliberately skips `/api/games/*` (the polling of a live game is frequent and cheap), so the live routes have **no rate limit** today; the per-token limit and a cap on open tables per IP are not built.

## 7. Frontend

**Built (L7):** `web/play.html` and `web/js/play.js` (create a game with a game mode and a time control and get the seat links; join with a name; then the board) in `PLAY_MODE` (`web/js/state.js`): the viewer draws the view the server pushes (`{version, view, decision, label}` over the WebSocket of the Table DO, or every 2 seconds from `GET /api/games/{id}/state` when `/api/live/config` has no `ws_base`), the bar is made from the seat's `decision` exactly as in the fork (cards in the hand, display, placement, confirm / undo / restart as legal actions of the engine), a move is checked with `POST /api/games/{id}/preview` (the popup for a move that cannot be taken back) and then sent with `POST /api/games/{id}/actions`; the page waits with "Waiting for ...", a spectator link needs no token, and the seat token lives in the url and `localStorage` (`playToken.E12`). Also built: the clocks (counted down in the page from the server's time, 9), the game menu with concede, claiming overtime and the abandon vote, a sound / title / browser notification when it is your turn, the end page (`web/end.html`, `/api/games/{id}/result`), and the opponent's draft and map choice shown only as "has chosen" until both are in. Not verified here: a mobile pass of the play page.

The viewer (`main.js` and its modules, `web/js/`) renders a state and a decision summary; the play page needs the same renderer with input handlers and a very different loop (server state in, one action out).

1. **Split `replay.js`** (**done**, L6): the viewer is now native ES modules under `web/js/` (`board.js`, `cards.js`, `zoo.js`, `side-panel.js`, `shared.js`, `action-bar.js`, `fork.js`, `play.js`, ...) with the one mutable state object `S` in `state.js`; `main.js` is the controller for replay, fork, sandbox and play. The module list and rules are in `docs/frontend_architecture.md`.
2. **Interaction layer** for the play page (the mediator of section 5.1: it groups the legal actions of the seat into elements and maps input back to one of them):
   - the action bar buttons become real controls (choose an action card, spend X tokens, take/skip effects in any order, confirm/undo/restart);
   - map hexes become click targets for building placement: hover shows the footprint at the chosen rotation, illegal hexes are inert (the legal `(x, y, rotation)` list per building type comes from the server);
   - cards are selectable: click the hand/display to select with the check mark and green border, a confirm button appears (the discard and keep prompts described for the replay);
   - project slots, partner zoo/university choices, association tasks, the draft cards, X-token payment all get a click path;
   - the opponent's moves arrive over the WebSocket and are shown with the existing change animations; a "waiting for X" state and a clock per player (both built).
3. **Per-viewer POV**: the player sees their hand; the opponent's hand is card backs. The replay's "both hands visible" mode stays replay-only (a flag on the view model).
4. **Reconnect and recovery**: the page stores `(game id, seat token)` in `localStorage`; on load it opens the WebSocket, which sends the latest view of its seat. A dropped socket reconnects with backoff. A `409` re-fetches and drops the half-made choice.
5. **Mobile**: reuse the drawer layout; the play bar needs the large tap targets already used in the replay. Placing buildings on a phone is the hard case (pan/zoom the map).

## 8. The three modes on one server

| Mode | Who acts | State source | Differences |
|---|---|---|---|
| **Live game** (**built**) | two people, one seat each | new game from config (map selection and draft first) | everything above |
| **Sandbox** (**built**: `web/sandbox.html`, `replay/sandbox.py`, `/api/sandbox/*`) | one person acts for one seat; the other seat is a bot that only passes | a new game on two chosen maps; the engine state travels with every step, the server keeps nothing | no hidden-info projection (the one user sees all), no clocks; a position editor (`/api/sandbox/edit`) that sets money, tokens, conservation, reputation and adds partner zoos / universities. A state validator (card conservation) and the sandbox from a replay step are not built (the fork page `fork.html` forks a replay on its own) |
| **Custom game** (**not built**; "coming soon" on the landing page) | two people | new game with chosen map, expansions, options, base projects | the lobby/config screen; gating by what the engine supports. The live lobby already offers the game mode (map selection) and the time control |

**Fork from a replay** becomes: create a sandbox (or live) game whose initial state is the replay state at a step. That requires the replay state to be an *engine* state. Steps the engine replayed and matched already are; steps built from the log only (flagged in the viewer) must not be forkable until their turn is supported, or must be re-synced from the log with a warning. The unknown part of the deck order is filled with the seed finder's `tail_seed` as designed (`PROJECT_OUTLINE.md` section 6); for a *live* fork between two real players the server picks a fresh secret seed.

## 9. Lifecycle, fairness and the game record

- **Time control** (**built**, `live/clock.py`; `LiveService.timeout`). Each seat has a clock, set when the table is made: a preset (`slow` 6 min + 118 s, `normal` 4 min + 74 s, `fast` 3 min + 46 s per turn; default `normal`) or a custom starting clock (3 to 30 minutes, also the maximum) and increment (0 to 120 s). The clock of a player runs while they have something to decide (both run during the setup and the discards of a break or of the endgame); at the start of each of their turns they get the increment, up to the starting clock. It starts when both players have joined. The state lives in the table's config (`clock`, in milliseconds) and is only changed by the functions of `clock.py`; the page counts down by itself from the server's time. A clock may go below zero; while it is not above zero the opponent may end the game with `POST /timeout` and win on overtime (a concession announced as "ran out of time", `end_reason` "ran out of time (overtime)", status `conceded`, result reason `overtime`). Nothing is enforced by a timer: a game whose players both leave simply waits. Nothing in the engine changes: time lives in the server and in the game record.
- **Concede and abandon.** Either player can concede at any time (`POST /concede`; the engine action `concede`; the game is exported like a finished one). Both can agree to abandon: one proposes (`POST /abandon`), the other answers (`/abandon/answer` with `agree`); agreeing ends the table as `abandoned` ("abandoned by agreement", no winner, no record); a rejection gives the proposer a 10 minute cooldown; the proposer can withdraw (`/abandon/withdraw`); if both propose, the table is abandoned at once. The proposal and the cooldowns live in the table's config and are pushed to the sockets. *Not built:* archiving a table that nobody has touched for 30 days as abandoned, and a job for stuck tables (9.2).
- **Deploys**: a deploy must not kill a game. Because the store is the truth, any instance can continue it (**built**: `_load` rebuilds a table from the keeper). The engine version policy (5.10) for incompatible rule changes is not built: an old table is refolded with the current engine (known limitation, 3.1).
- **Cheating surface**: no secret ever reaches the client (section 4); moves are validated against the engine; the seed is server-only; seat tokens are long random strings shown once; spectators (allowed while the game runs, **built**: no token) get the view of a player with hidden hands.

### 9.1 The game record: every game is logged completely
Each game keeps a complete, full-information record from the first player joining to the end, so that anything that happened can be reproduced, analysed or shown later. It is written as the game goes (append only, the `steps` table of the Table DO's SQLite, in the same transaction as the action) and exported when the game ends.

What it contains:
1. **Header** (**built**, `live/archive.py: build_record`): game id, options (game mode, Marine Worlds, `confirm_turns`), the maps, the seed (`tail_seed`), `engine_version` with its `code_hash`, `data_hash` and `schema_version` (5.10), player names, created / ended times, the status, `end_reason` and the result. Not stored: the supported-content flag set, the started time (it is in the registry), and the seat token hashes (the record holds no token and no hash).
2. **Every submitted action, accepted or not** (**partly built**): the record has every *accepted* action (sequence number, the action with its seat, server timestamp; the DO also keeps the `request_id`). Rejected and stale submissions and the time spent per decision are not recorded.
3. **Every engine event** caused by an accepted action (section 5.9; **not built**, the engine returns no event list) with full information: who drew which card, what was revealed to whom, resources before and after, the shuffle that happened. Together with the seed this lets you re-run the game, but the events also make it readable without re-running.
4. **Control events** (**partly built**): undo and restart are engine actions in the list and their step names how many steps they took back (`control.took_back`; the replay uses this to hide them, 9.3); confirm, the draft choices, concede (also an overtime win) are actions too. Abandon by agreement ends a table that is not exported, and join / leave / reconnect are not recorded.
5. **The viewer steps: everything the replay shows, stored as the game was played.** The replay of a record must show the viewer exactly what happened, on any later engine version, so the record stores *what the viewer displays* and not only what the engine would need to recompute it. For every accepted action (the "effective" ones, see 9.3) one step with:
   - the **view state** after the step as a compact JSON patch against the previous effective step (each patch names its `base`, the step it applies to, so the chain stays valid when undone steps are dropped), with the full view state at the start, at every confirmed turn and at the end as checkpoints and integrity checks. The view state is what `replay/view.py:state_view` sends today: the engine state *plus every value the viewer used to get from engine functions*: the player's score, income, hand limit, the cells every building covers, the icon counters, the full draw pile order (the seed is in the header);
   - the **decision shown in the bar** (`options`: prompt, effect names such as "Perception 2", pieces that can be placed, what can be taken, sponsors that can be played, ...) computed at record time by the engine version that played the game;
   - the **text** of the step and of its sub-steps, already rendered ("MezzoMike plays Inland Taipan for 10 and places it in a size-2 enclosure"), plus the structured event list it came from (card ids, amounts) and the explicit step fields (`actor`, `spent_x`, `reveal_drawn`, `round_started`, ...);
   - the **flags** the viewer draws: `actor`, which cards moved zones, the draft data for draft steps.
   The consequence is a rule: **the code that replays a record never imports the engine** (tests enforce it, see 9.3). A record is therefore a self-contained document in a versioned *viewer format* (`viewer_schema_version`), readable by every future viewer through small migration functions. Only forking needs the engine.
   The engine state patches (for fork and for analysis) are not stored as such: the record holds the seed and the actions (`refold` re-runs them on the engine) and the table keeps a full engine snapshot every 25 actions while it runs (not exported).
6. **Decision context** (optional, off by default; not built): how many legal actions the seat had at each decision, for analysis of difficulty.

What it deliberately does not contain: seat tokens, IP addresses, browser details.

Use:
- **Finished game export** (**built**: `LiveService.wrap_up`): when a game is `finished` or `conceded`, the whole record is written once as one gzipped JSON file in GCS (immutable) and the table registry row gets its path (section 9.2). An `abandoned` table is not exported; a table in `error` is kept in the DO. A table whose export or registry write failed stays in the DO and is tried again by the players' next request: `LiveService._retry_wrap_up` (called from `view`, i.e. `GET /state`) starts a `wrap_up` in the background, at most once a minute per table; there is no scheduled job.
- **Replay**: the record holds exactly what the viewer shows, so a finished live game opens in the replay viewer on any later engine version, without any BGA log and without the engine, with undone moves hidden: see section 9.3.
- **Bug reports**: a game that hit "stopped, please report" or a rules error can be reproduced exactly from its record (seed + actions + engine_version).
- **Rules regression tests**: finished live games are added to a test folder like `log_examples/`: the engine must reproduce every recorded event.
- Size and cost: a game is about 100-300 actions; the record is roughly 0.5-2 MB with snapshots, well within the free quota for a handful of games per day; the Table DO's data is deleted once the export is confirmed; the GCS export is kept.

### 9.2 Table ids and the table registry (BigQuery)

**Built (L4):** the dataset is `freestyle-190711.ark_nova_engine` (US), created with `scripts/setup_live_registry.py`: the table `live_table_events` (clustered by `table_id`) and the view `live_tables`. Code: `live/registry.py` (schema, `build_row`, `BigQueryRegistry`, `FakeRegistry`), `live/archive.py` (the record file, `GcsArchive`, `refold`), `LiveService.sync_registry` / `wrap_up` / `_retry_wrap_up`. Settings: `LIVE_BQ_PROJECT`, `LIVE_BQ_DATASET`, `LIVE_GCS_BUCKET` (defaults `freestyle-190711`, `ark_nova_engine`, `temp-common-storage`; an empty bucket means nothing is exported and the keeper keeps the finished tables). The registry never holds the seed or a token; `started_at` is carried forward by the view; a row's `insertId` is `E12:3`. A sixth status, `cancelled`, exists for tables closed by hand (`scripts/cancel_live_tables.py`).

**Every table has a unique table id** from the moment it is created, and a place in a BigQuery registry that follows the table through its life and ends up pointing at the log file in GCS. The registry is **append-only** (decision 21): the table `live_table_events` receives one row at every change of status, and the view `live_tables` gives the latest row of each table, which is what everything reads. The Table DO stays the live source of truth while the game runs (its single-writer transactions are what the game needs); BigQuery is the index and the permanent catalogue. The volume (a handful of games a day) makes BigQuery's weak transaction story irrelevant.

**The id.** A string `E{n}` where `n` is an incrementing integer (`E1`, `E2`, `E3`, ...). BGA table ids are bare numbers, so the `E` prefix tells the two apart at a glance and everywhere: the lookup route, the replay route and the index send an id that starts with `E` to the live registry and a number to the BGA index, without a lookup first. A BGA id can never collide with a live one. Allocation must not depend on BigQuery (it has no counter and no uniqueness constraint): the id counter Durable Object hands out the next `n` (one object, so no two tables get the same number), which also keeps the ids short and in creation order. If the counter is ever lost, the next `n` is the highest `table_number` in the registry plus 1 (`ensureAtLeast` on the counter, `/internal/counter/ensure`).

**Built:** the live routes take ids matching `^E\d{1,9}$` (`api/live.py`); `/api/lookup` recognises `E<digits>` (any case) before it calls `parse_table_id`, which stays integer-only for BGA ids (`api/tableid.py`); `GET /api/tables/E{n}/replay` serves recorded games; a live game is `GameConfig.table_id = 0` and carries its `E` id in the table config (`game_id`).

**The row** (`live_table_events` holds one complete row per status change, with the columns below plus `event_seq` and `event_at`; the view `live_tables` returns the row with the highest `event_seq` of each `table_id`, so a reader sees one row per table):

| column | meaning |
|---|---|
| `table_id` | the unique id, a string `E{n}` (STRING) |
| `event_seq`, `event_at` | the number of this event within its table (1, 2, 3, ..., given by the Table DO, so a retried write repeats the same number) and when it happened |
| `table_number` | the `n` of the id as INT64, for ordering and for finding the highest id |
| `status` | `waiting` (created, seats not full), `playing`, `finished` (played to the end and scored), `conceded` (a player gave up), `abandoned` (both players agreed to abandon; nobody-came-back tables are not closed automatically yet), `error` (the engine could not continue), `cancelled` (closed by hand with the script) |
| `end_reason` | free text for the details (who conceded, which rule failed, ...) |
| `created_at`, `started_at`, `ended_at` | timestamps |
| `player_names` | the two typed names (array) |
| `maps`, `marine_worlds`, `config` | what was played (`config` is JSON of the game `options`: game mode, Marine Worlds, `confirm_turns`) |
| `engine_version`, `code_hash`, `data_hash` | which engine played it (section 5.10); also fixed in the table's `GameConfig` |
| `n_actions` | number of accepted actions |
| `result` | final result when there is one (JSON: scores, winner, conceded, and `reason` `overtime` for a win on the clock) |
| `gcs_path` | `gs://<bucket>/live/<yyyy>/<mm>/<table_id>.json.gz` (for example `.../E12.json.gz`) of the complete record, **set when the record was exported** (a `finished` or `conceded` game always has one; `NULL` for an `abandoned` table and for an `error`) |
| `exported_at`, `record_bytes` | when and how big |
| `schema_version` | version of the record format |

**The life cycle.** The server appends a complete row at each change of `status`:
1. table created -> event 1, `waiting`;
2. second seat joined and the draft starts -> event 2, `playing` (`started_at`);
3. game ended or conceded -> the record is exported to GCS first, then the final event is appended with the final `status`, `end_reason`, `ended_at`, the result and `gcs_path`, then the Table DO deletes its data. The order matters: the path is only written once the file exists. An abandoned table only gets its final event with `status` and `end_reason` (nothing to export).

**BigQuery details that matter** (checked against how BigQuery behaves):
- Only `INSERT`s: no `UPDATE`, `MERGE` or DML limits, and the streaming insert API (or small load jobs) can be used, because a row is never changed after it was written. Rows still in the streaming buffer are visible to queries and to the view.
- The view is `SELECT * EXCEPT(rn) FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY table_id ORDER BY event_seq DESC) AS rn FROM live_table_events) WHERE rn = 1`. Writes are idempotent by construction: a retry repeats the same `(table_id, event_seq)` and the view still returns one row per table (a duplicated row is identical, so which of the two is picked does not matter).
- The history stays: every status change of every table, with its time, which also shows how long tables waited or played.
- BigQuery is not on the critical path of a move. A failed registry write must never block or fail a game: the Table DO keeps the events that BigQuery has not acknowledged (its `registry_events` table, `acked` flag; `LiveService.sync_registry` appends them and acknowledges them, and never raises). The retry is the players' next request (`_retry_wrap_up`, at most once a minute); a periodic job (Cloud Scheduler hitting an admin route, or a DO alarm) that syncs every dirty or stuck table is **not built**. The registry is therefore eventually consistent with the Table DOs; the GCS file is only written from the DO's record, so it is complete whatever BigQuery did.
- Cost: a few small inserts per game and one tiny view query per lookup: well inside the free tier.
- The existing BGA tables (`all_games_stat`, `logs_archive_mapping`) are not touched: the lookup tries the registry for ids that start with `E` and the existing index for the others. The GCS path is `live/<yyyy>/<mm>/E<n>.json.gz`.

**What uses it.** The landing page and `/api/lookup` accept a live table id and open the replay of a finished game from `gcs_path`; an unfinished table says so, and an abandoned one too. An admin view (later) lists tables by status; the stuck-table job (not built) would find `playing` tables untouched for N days and mark them `abandoned` (nothing is exported, decision 18).

### 9.3 Replaying a recorded game

**Built (L5):** every accepted action is stored with its viewer step (`live/stepdata.py`): the text, the decision bar, the actor and the full-information view as a JSON patch (`live/jsonpatch.py`) against the effective step it follows, with a full view at every confirmed turn, every 25th step and the end; an `undo_last` / `restart_turn` stores only `control.took_back`. The record header carries the maps, the card catalog and the view before the first move. `replay/from_record.py` (no engine import, tested with the engine made unimportable) reduces the steps to the effective history, applies the patches, checks them against the checkpoints and returns the same JSON as a BGA replay; `GET /api/tables/E12/replay` and `/api/lookup?q=E12` serve it. Not built yet: the label / option / actor fields the viewer reads from BGA wording (`spent_x`, `reveal_drawn`, `round_started`), fork at a step of a record, and the viewer format migrations (there is only `viewer_schema_version` 1, with its fixture `tests/fixtures/record_v1.json.gz`). `scripts/live_demo.py` runs the site on in-memory twins with one recorded game.

The replay today is built from a BGA log: `parser` turns the log into events, `replay/builder.py` builds a state per step from them, `replay/differential.py` plays the same turns on the engine and `replay/view.py` mixes the two and adds the "log timed" overrides. A recorded game needs none of that: the record already holds exactly the steps the viewer shows (9.1.5). The replay code therefore gets a second **source** next to the BGA log, and the viewer does not care which one produced a step.

**What changes in `src/ark_nova/replay/`**
1. **A source interface.** `build_replay_view(source)` takes a `ReplaySource` (`kind`, `table_id`, players and maps, the list of steps). Today's code becomes `BgaLogSource` (the existing parse + build + differential path, unchanged). The new `RecordSource` reads the record of an `E{n}` table.
2. **`replay/from_record.py`: no engine.** Reads the record (gzipped JSON from `gcs_path`, found through the registry; the same cache layer as the BGA logs), resolves undo and restart, and returns the viewer steps as stored. Applying the patches is plain JSON patching. **The module and everything it imports must not import `ark_nova.engine`**: a test imports it with the engine package blocked and opens a record, so the promise "replays work on any engine version" cannot silently break.
3. **Undone moves are hidden.** The viewer never sees a move that was undone later. The record keeps every submitted action and the undo / restart control events (that is the complete history, 9.1), and `from_record.py` reduces it to the **effective history** before building steps:
   - walk the events in order keeping a stack of effective steps;
   - `undo` pops the step it took back (the record names it); `restart` pops back to the checkpoint it names (the start of the turn, or the last irreversible action); a rejected or stale submission adds nothing;
   - the steps that remain, in order, are the replay. Because every patch names its `base` (the step it applies to), the remaining steps still form a valid chain: the first action after an undo is based on the state of the last kept step, which is the state the undo restored.
   There are no "X took back" steps and no greyed moves, no toggle: step numbers run 0..N without gaps and the move list reads as the game the players ended up with. (Tools that want the full history, such as analysis or a debugging page, read the record directly.)
   Confirm steps and the draft are steps like any other, in the order they happened.
4. **Labels from the record.** The text of a step is stored in the step (9.1.5), so the viewer never depends on a text generator of a given version. Full information: a replay may name every card, since the game is over. (Whether a *running* game's record can be opened is a spectator-policy question, open decision 3.)
5. **Options and actor from the record.** The decision bar content (`options`), the `actor`, the score / income / hand limit / building cells are stored in the step, not computed by the viewer's server code. `engine.source` is always `engine` with status `ok`: a recorded game has no unsupported parts.
6. **Structured step data instead of label regexes.** The viewer currently reads some facts out of the label text (`pays N xtoken ...` for the spent X tokens, `draw ... for perception effect` for the reveal text, `End of the break` for the timeline and the round count). For a record there is no BGA wording to match. Steps get explicit fields for these (`spent_x`, `reveal_drawn`, `round_started`, ...) filled by both sources, and the viewer reads the fields; the BGA source fills them from its labels. This is a small refactor done once for both sources, covered by the existing replay tests.

**What the viewer gains from a record**
- the draw pile popup can show the **real** order of the cards (the seed is in the record), not "known part / random guess";
- fork works at any step of the effective history, including inside a turn (it needs the engine: see Versions);
- no "not supported yet" flags.

**API and pages.** `GET /api/tables/{id}/replay` accepts `E{n}` ids: the registry row gives `status` and `gcs_path`; a table that has not ended, or has no path (`abandoned`, `error`), answers with its status instead of a replay. The landing page and `replay.html?table=E12` need nothing else once `parse_table_id` accepts the new id (section 9.2). The ETag / cache layer already added for BGA replays applies unchanged (a record never changes after the export).

**Versions.** The record header has `schema_version`, `viewer_schema_version` and `engine_version`. The reader handles every `viewer_schema_version` it ever wrote (a small migration function per version, tested with one fixture record per version), so a record written today opens in a viewer of any later date. The engine version of the game is shown in the viewer for traceability and matters only for **forking**: the fork starts a new table on the *current* engine from the recorded engine state ("recorded on 1.2.0, continues on 1.5.0"); if that state no longer validates on the current rules, the fork is refused with a message. Viewing never depends on the engine.

**Tests**
1. **No engine import**: open a record with `ark_nova.engine` made unimportable; the steps come out.
2. **Effective history**: a record with undo, restart, a rejected and a stale submission and a reconnect gives exactly the expected steps; none of the undone moves appears; the patch chain still produces the right state at every step (compare to the stored checkpoints).
3. **Complete viewer data**: every step of a self-play record has all the fields the viewer reads (a schema check shared with the BGA source); the viewer tests that run on BGA replays also run on a record replay (steps numbered without gaps, timeline rounds, draw pile popup, draft bar, decision bar on every step).
4. **Same game, any engine**: a record is written by the current engine, then opened with a (stubbed) engine whose rules differ: the replay is identical, which proves the record is self-contained.
5. **Old viewer formats**: a record per past `viewer_schema_version` (kept as fixtures) still opens.
6. **Refold check** (only where the engine version is still present): refolding the recorded actions on that engine gives the recorded engine states.

## 10. Testing

1. **Determinism/replay**: for every sample log, fold the engine's actions from the log and check the final score (exists), and additionally check that `(config, seed, actions)` serialised through the store and back gives the same state.
2. **Fuzz / self-play** (`scripts/selfplay.py` exists): random legal-move bots play thousands of full games per rules change; invariants checked after every action (card conservation, track limits, no `NotImplementedError`, game always terminates, `legal_actions` never empty unless over). This is the main protection for rules that no log exercised.
3. **Projection tests**: for random states, the projection for seat A contains no card id from B's hand, no deck order, no seed; and applying actions shown to A never needs hidden data.
4. **API tests** (`tests/test_live_service.py`, `tests/test_hardening.py`): two simulated clients over the real routes: concurrent moves (version conflicts), undo/restart rules (reversible vs irreversible), the clock and the overtime win, concede, abandon by agreement and its cooldown, the draft hiding. Still to cover: reconnect mid-turn, replayed `request_id` over the routes.
5. **UI tests** with a headless browser for the click paths (placement, card selection, draft), on desktop and phone width.
6. **Game record and registry**: play scripted games (including undo, restart, rejected and stale submissions, a reconnect) and check that the exported record reproduces the final state, contains every submitted action, and contains no seat token. Registry: ids are unique `E{n}` strings and strictly increasing under concurrent creation, and `parse_table_id` / the routes accept both forms; every ending (finished, conceded, abandoned, including a table abandoned before the start, error) leaves the right `status` and a `gcs_path` that exists exactly when a record was exported; a BigQuery failure does not stop the game and is repaired by the retry / sync job; the event write is idempotent (run twice, the view still shows one row per table).
7. **Load**: a few dozen simultaneous games, WebSocket counts and hibernation, Durable Object row writes and requests per game against the plan limits, the Cloud Run LRU cache hit rate, and the append race (two moves submitted at once: one gets `409`).

## 11. Phases

| # | Deliverable | Exit criteria |
|---|---|---|
| L0 | **(sheets built, flag partly)** The two planning sheets filled in (`web/planning.html`); supported-content flag (which cards/maps are fully implemented; maps only, `UNSUPPORTED_MAPS`) | no undecided rows; flag computed from `engine_coverage` |
| L1 | **(built, except structured events)** Engine: explicit confirm step, both-seat input states, reversibility from the sheet + undo/restart, structured events, `engine_version` with the manifest and its test (5.10); replay kept green | engine and replay tests pass; replay no longer needs the "log timed" overrides for turn end |
| L2 | **(harness built, `scripts/selfplay.py`)** Rules completeness for the supported set + fuzz harness | 100k random games play to the end with invariants intact |
| L3 | **(built)** Live package: the Cloudflare project (Worker, Table DO, id counter DO) and its Python client, sessions, the projection driven by the visibility sheet, API routes, seat links with player names | two scripted clients play a full game over the API and the WebSocket; projection tests pass; a stale `expected_version` is refused |
| L4 | **(built)** **Game record and table registry**: unique table ids `E{n}` (id counter DO), the BigQuery registry (`live_table_events` plus the `live_tables` view) written through the life of the table, header, every action and engine event, control events, checkpoints, GCS export with the path written to the row; replay of a recorded game | every ending leaves the right status and path; a finished game's record reproduces its final state and is read back by the replay viewer; BigQuery outages do not affect a game; no tokens in the record |
| L5 | **(built)** **Replay of recorded games** (section 9.3): the source interface, `from_record.py` (no engine import, effective history with undone moves removed), the structured step fields shared with the BGA source, the viewer step format with its `viewer_schema_version`, `E{n}` ids in the replay API | a self-play record and a live game both open in the existing viewer, also with the engine made unimportable; undone moves never show; fork works at any step; the BGA replays are unchanged |
| L6 | **(built)** Frontend split into render modules (replay unchanged) | replay pixel-identical, all existing tests pass |
| L7 | **(built)** Play page: the mediator UI (grouping legal actions, mapping input back), WebSocket, reconnect, draft, confirm/undo/restart | two browsers finish a game |
| L8 | **(partly built: abandonment by agreement, spectator view, body limit, failed-export retry; not built: rate limiting for the live routes, retention / stuck-table jobs)** Hardening: rate limiting on, abandonment, retention, spectator view | load test and soak test pass |
| L9 | **(built)** Clocks with speed settings (`live/clock.py`: three presets and a custom start / increment, overtime win) | timed games with the presets |
| L10 | **(sandbox built; custom game lobby not built)** Sandbox (position editor, fork from replay) and custom game lobby | landing page cards go live one at a time |

L1-L2 are the long ones; L3-L4, L5 and L6 can proceed in parallel once L1's action and event shapes are fixed (L5 only needs the record format of L4 (the viewer step format is defined jointly with it), and can start from a self-play record before the server exists). L4 comes right after L3 on purpose: the record exists from the first playable game, so no early game is lost.

## 12. Decisions

Taken:
1. **Time** (**built**, L9): a real-time clock per player, three presets or a custom start and increment (9).
2. **Persistence and realtime** (built): Cloudflare Durable Objects (a Table DO per game with SQLite and WebSockets, an id counter DO, a Worker in front); the Python engine stays on Cloud Run and is the only place that validates moves and builds the views (3.5). The free plan covers roughly 30 games a day; the $5 plan after that. Firestore and server-sent events were the first draft and are rejected.
3. **Identity**: no accounts for now; seat links plus a typed player name.
4. **Content**: only supported cards and maps are available.
5. **Logging**: every game is logged completely (section 9.1, phase L4).
6. **Decisions UI**: the browser is the mediator between the legal actions and the UI elements (section 5.1).
7. **Simultaneous choices**: engine states that accept input from both seats and continue when both are in (5.2).
8. **Confirm step** for the end of a turn (5.3).
9. **The record is self-contained for viewing**: it stores what the viewer displays (view state patches, decision bar content, rendered text, derived values), so a replay works on any engine version and never imports the engine (9.1.5, 9.3).
10. **Undone moves are hidden** in the replay: the viewer sees only the effective history (9.3).
11. **Engine version in every table's config** (5.10).

12. **Undo policy**: the confirm step is always on (5.3). A move is final for the opponent only when the player confirms the turn, so the opponent never sees a move that is undone (the undone moves also stay out of the replay, decision 10).
13. **Timeout policy** (built, L9; this replaces the first idea of "wait or abort"): when a player's clock is at zero or below the opponent may end the game and win on overtime (`POST /timeout`): it is a concession of the player who ran out of time, the table ends as `conceded` with the record exported and `reason` `overtime` in the result. The opponent can also just wait; nothing is enforced by a timer.
14. **Spectators and replays**: spectators are allowed while the game runs and get the view of a player with hidden hands (4.2); a replay of a table opens only after the table has ended, for whatever reason (a `finished` or `conceded` table has a record to open, an `abandoned` one has none, decision 18).
15. **Engine version policy** (5.10; **decided, not built**, see the known limitation in 3.1): an engine upgrade makes every table that is still `waiting` or `playing` `abandoned` (`end_reason = engine retired`); there is no draining, no state migration and no old engine copy kept. Only a new `engine_version` counts: a deploy that changes neither rule code nor data (frontend, infrastructure) does not.
16. **Draft and setup**: the action card draft is played if and only if Marine Worlds is on (standard action cards otherwise); in a normal game the 3 base projects are drawn at random; a custom game has its own rules, to be specified when it is built.
17. **Expected scale**: a small community, at most 20 concurrent users: a single small Cloud Run instance range and the free Cloudflare plan are enough; the limits (rate limit, body sizes, a cap on open tables per IP) are there against accidents and abuse, not for load. Today only the body size limit is on for the live routes.
18. **Retention and exports**: the record is exported to GCS for `finished` and `conceded` tables; an `abandoned` table is not exported (its last event says `abandoned` and has no `gcs_path`). A Table DO deletes all its data once the export is confirmed (for an abandoned table: as soon as the row is updated). Player names are part of the exported record (it is what the replay shows).
19. **Resources**: the BigQuery dataset is `freestyle-190711.ark_nova_engine` and the default export bucket `temp-common-storage` (`src/ark_nova/config.py`, overridable by environment variables); the Cloudflare project is `ark-nova-live` (`cloudflare/wrangler.jsonc`, whose resource names are still marked as placeholders). The paths in this plan are examples.

20. **Rule changes are batched**: rule changes are collected and released together in one new `engine_version` (a minor bump per batch), never one version per fix, because every new version abandons the running tables (decision 15). Between batches the rules are developed and tested, not deployed; a batch is released when no live table is in a long game or on an agreed quiet time.

21. **Registry shape**: append-only status events (`live_table_events`) with a view `live_tables` that returns the latest event of each table (9.2); no `UPDATE`.

22. **Game modes** (built): the map selection is `random-mirrored` (default: both on the same random map), `original` (each dealt two maps, keeps one) or `free-select` (each picks any map); the action card draft is played if and only if Marine Worlds is on (decision 16). The list is `engine/map_select.MODES`, served by `GET /api/live/options`.
23. **Abandon by agreement** (built): one player proposes, the other answers; a rejection costs the proposer a 10 minute cooldown; an agreed abandon ends the table as `abandoned` without a record (9).
24. **Tail seed**: a new game's seed is 52 random bits (`secrets.randbits(52)`), the widest whole number a browser reads exactly; a 31 bit seed could be tried out one by one to learn the deck order (`tests/test_hardening.py`).

Nothing is left open in this section for now; new questions are added here as the implementation raises them.

## 13. Main risks

- **Rules coverage** is the real gate: a crash or a wrong rule in a live game is worse than in a replay, where a mismatch just gets flagged. Fuzzing and the completeness list cost more than the networking.
- **Hidden information leaks** are easy to introduce (a debug field, a label in the log text). The projection is the only way out of the server and has its own tests.
- **Replay and live drifting apart**: the replay keeps log-timed overlays that the engine does not need. Doing the explicit confirm step early and reducing the overlays keeps one source of truth.
- **Frontend size**: the viewer was a single large file with global state; the split into modules (L6) is done, the risk now is only to keep the replay pixel-identical (`docs/frontend_architecture.md`).
- **Cloud Run behaviour**: moot for streams (the Durable Object holds the WebSockets, 3.3); scale-to-zero cold starts only cost a rebuild of the state from the keeper (`_load`).
- **Engine upgrades under running tables** (5.10, 3.1): the version policy is not built, so a rules change deployed while tables run is a risk until it is.
