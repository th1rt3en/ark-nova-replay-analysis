# Plan: live 2-player Ark Nova games

Status: **plan only, nothing implemented** (except the two planning sheets, section 4.1 and 5.4). Written against the code as of today (engine in `src/ark_nova/engine/`, replay in `src/ark_nova/replay/`, viewer in `web/js/replay.js`).

Decisions already taken (section 12): no time control at first, a simple real-time clock with several speed settings later; **Cloudflare Durable Objects as the table keeper (one per game, with its own SQLite and the WebSockets), the Python engine staying on Cloud Run** (free plan up to roughly 30 games a day, then about $5 a month); no accounts, only a seat link and a player name; only fully supported cards and maps can be played; every game is logged completely (section 9.1).

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
| Time | none | no clocks at first; conceded and abandoned games; clocks with speed settings later |
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
- The engine must stay deterministic across deployments: pin the rules version in the game record (a new deploy must not change how an old game folds; see 9).

### 3.2 Storage
**One Table Durable Object per game** (named `E12`, the table id of 9.2) with its own SQLite database is the live source of truth: `game` (config, seed and engine version, never sent to a browser; seat token hashes, display names, status, `version`), `actions` (one engine action per row, append only), `steps` (the record steps of 9.1, viewer part and engine patches), `views` (the latest projection of seat 0, seat 1 and spectators, so a reconnecting browser gets its view without any engine work), `snapshots` (state every ~25 actions), `requests` (request ids, for idempotent retries). A Durable Object runs one thing at a time, so an append is a single SQLite transaction with the version check and needs no locks. A small **id counter DO** hands out `E{n}`.

Cloud Run's local disk and memory are a cache only (an LRU of recent states per table); any instance can serve any table. Finished games are exported once as a JSON action list to GCS (cheap, immutable); the DO deletes its data as soon as the export is confirmed (`finalize`; decision 18). The registry of all tables is BigQuery (9.2).

Write budget: about 3,300 SQLite rows written per game (action, step and game rows, plus the latest view of each seat and of the spectators per action). The free plan allows 100,000 row writes a day: about 30 games a day; the $5 plan raises this far beyond the expected use.

### 3.3 Realtime transport
**WebSocket from each browser to its Table DO** (`/ws/E12?s=<seat token>`; the DO checks the token hash, tags the socket with the seat and uses the hibernation API, so an idle table costs nothing). Every accepted move is pushed to every socket of the table as `{version, view, decision}`: `view` is that seat's projection (4.2), `decision` the compact legal-action list for the seat whose turn it is (none for the others). A returning browser reconnects and is sent the latest stored view of its seat. Moves go the other way over plain HTTPS `POST` to Cloud Run, not over the socket (3.5).

Rejected: server-sent events from Cloud Run (every open connection holds a Cloud Run request for up to 60 minutes and fan-out across instances needs Pub/Sub or listeners); Firestore listeners in the browser (the browser would read documents directly, which defeats the hidden-information rule unless every document is already a per-seat projection).

### 3.4 Identity
No accounts. Creating a game returns two secret **seat links** (`/play/E12?s=<token>`): whoever holds a link is that seat. Only a hash of the token is stored, in the Table DO; the DO checks it when a socket connects, and Cloud Run checks it on every move (the hash comes with the DO's `/state`). Each player types a **player name** when they join (shown to the opponent and kept in the game record). A third, tokenless link is the spectator view. Sign-in can bind a seat to an account later without changing the protocol.

### 3.5 The Table Durable Object in detail (decided)

Diagrams: [live_architecture_cloudflare.html](live_architecture_cloudflare.html) (open it in a browser). Cost: about $0 up to roughly 30 to 50 games a day on Cloudflare's free plan (the row-write budget decides), then $5 a month; Cloud Run compute is about 0.3 cents a game because no request is held open.

**Roles.** Cloud Run keeps the Python engine and is the only place that decides whether a move is legal and what each viewer may see. A **Table Durable Object** (one per game, named `E12`) is the table's *keeper*: it orders the moves, stores them (its own SQLite), and pushes updates to the open WebSockets. A small **id counter DO** hands out `E{n}`. A **Worker** is the front door of `live.<domain>`: `/ws/E12` goes to the Table DO, `/api/*` is proxied to Cloud Run. The engine never runs on Cloudflare.

**Receiving moves.** Each browser opens one WebSocket to its Table DO (`/ws/E12?s=<seat token>`; the DO checks the token hash, tags the socket with the seat, and uses the hibernation API so an idle table costs nothing). Every accepted move is pushed to every socket of the table as `{version, view, decision}`, where `view` is that seat's projection (4.2) and `decision` is the compact legal-action list for the seat whose turn it is (none for the others). A returning browser reconnects and is sent the latest stored view of its seat; nothing is replayed.

**Making a move.** The browser posts `{version, action, request_id}` over HTTPS to Cloud Run (through the Worker). Cloud Run (1) checks the seat token, that it is that seat's turn and that the action is in `legal_actions(state at version)`; the state comes from its LRU cache, or, on a miss, from `GET /state` on the DO (latest snapshot plus the actions since); (2) applies the action and computes the engine events, the views of seat 0, seat 1 and spectators, the next decision and the record step (9.1.5); (3) calls `POST /append {expected_version, request_id, action, step, views}` on the DO. The DO runs one SQLite transaction (nothing else runs on a Durable Object at the same time): if `version == expected_version` it inserts the rows, sets `version + 1`, keeps the latest view of each seat, and pushes to the sockets; otherwise it answers `409 {current version}` and Cloud Run re-validates against the newer state (a different move got in first) or answers the browser `409 stale`. `request_id` makes the append idempotent: a retry after a lost response returns the stored result.

**Why this split.** The DO gives a single writer per table, ordered appends and push to the browsers without any held-open Cloud Run request (the job that a document store with transactions and listeners would have done). Cloud Run stays stateless apart from a cache, so any instance can handle any table.

**What lives where.** DO SQLite: config and seed (never sent to a browser), seat token hashes, the actions, record steps (viewer + engine patches), the latest view per seat, request ids, the version, later the clock (`setAlarm` fires the timeout). Cloud Run: the engine, the projection rules, the registry events (BigQuery) and the finished export (GCS: `GET /record` from the DO, write the file, update the row, then `finalize` so the DO deletes its data after the retention time). The DO's `/state`, `/append`, `/record`, `/finalize` and `/init` are internal: the Worker accepts them only with a signed header from Cloud Run.

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
3. **Explicit end of turn** (agreed; **implemented**, `GameConfig.confirm_turns`). After the player's last effect the engine enters the prompt `confirm_turn` (`_finish_turn`); the action `confirm_turn` runs what is now `_finish_turn_now` (display refill, break trigger, pass the turn). Until then the player can take the turn back. It is a flag, off for every replay and fork (they pass the turn inside the last action as before, so the differential tests are untouched); live games are created with it on. The "log timed" overrides of `replay/view.py` stay for the replay of BGA logs.
4. **Reversibility, tagged per action and effect** (you fill this in). The second sheet, `data_manual/planning/reversibility.json` (same page, second tab), has a row for each of the 26 action kinds, the new `confirm_turn`, about 45 pending effect kinds and a few engine steps (74 rows). For each you choose `reversible`, `irreversible`, `depends` (say when in the note, e.g. display card vs deck card) or `not_applicable`. The engine reads the decided sheet to build the checkpoint rule: `undo_last` takes back the last action if it is reversible; `restart_turn` goes back to the start of the turn or to the last irreversible action, whichever comes later. `depends` rows get a small predicate in code (the note says which). With event sourcing, undo is "append an `undo` event that rewinds the state to the previous checkpoint", never deleting history (section 9.1). A test fails if an action or effect kind exists in the code but not in the sheet.
   **Implemented** (`engine/turns.py`, tests `tests/test_turns.py`): `GameState.checkpoint` = the state when the turn started (or right after the last irreversible action) plus the actions since; `undo_last` = the checkpoint with all its actions but the last applied again, `restart_turn` = the checkpoint; both are ordinary actions in the stored action list, so a game folds through them with no special case. What is irreversible is decided by one function (`turns.irreversible`: a deck changed or the random state moved, or a secret effect such as pilfer, tutor, search discard, adapt, wave, Waza, scavenge) that follows the rules written in the reversibility sheet notes; the test that checks the sheet row by row against the action and effect kinds is still to do.
5. **Rules completeness gate.** A live game must never hit `NotImplementedError`. Work list = the "skipped" and "illegal" reasons of `engine_coverage.py` (marks from action card variants, monkey gang, unexplained X token changes, the break income of some maps, ...), plus every rule the logs cannot show because nobody played it. **Decided: only supported cards and maps can be played.** A per-card and per-map `supported` flag, computed from the data and the coverage run, filters what the lobby offers (random base projects and the deck are drawn only from supported cards; a map is offered only if its rules are done). A guard turns an unexpected `NotImplementedError` into "game stopped, please report" rather than a corrupt state.
6. **End of game and result.** Make `Result` complete (scores, tie-breaks, concede/abandon as a result kind), because the server stores and announces it.
7. **Engine version, part of every table's config.** Each table records which engine plays it in its `GameConfig` (`engine_version`, written when the table is created and never changed), so every game can be traced to the exact rules it was played with. Details in section 5.10.
8. **Performance.** `apply` deep-copies the state on every call (about 1 ms per action). That is fine for 100-300 actions per game plus a snapshot every 25; legal-action generation for Build/Animals can take much longer in bad positions, so budget it and cache `legal_actions` per `(game, version, seat)`.
9. **Structured game events.** `apply` also returns the list of **events** it caused, in full information: `{type, seat, cards, from, to, counts, revealed_to}` (card drawn, card revealed, card discarded, resource gained, building placed, break advanced, ...). Three consumers need them: the per-viewer log text (section 4.2), the `revealed` markers of the visibility sheet, and the complete game record (section 9.1). The replay's log-line labels stay separate; the engine events are the engine-native equivalent.

### 5.10 Engine versions and traceability

**What a version is.** `engine_version` is a short string declared in one place (`engine/version.py` (**implemented**), for example `1.4.0`: *major* = state or action format changed, *minor* = a rule changed, *patch* = a fix that does not change any game outcome). It is stored with three automatically computed fingerprints, so a declared version can never silently mean two different things:
- `code_hash`: a hash of the engine source files that decide rules (everything under `engine/`);
- `data_hash`: a hash of the card, map and manual data files (`src/ark_nova/data/*.json`, `data_manual/`) the engine reads;
- `schema_version`: the version of the state / action / event JSON formats.

**The release manifest.** `engine_versions.json` at the root of the repo (**implemented**; `scripts/release_engine.py --note "..."` appends a version after you drop the `-dev` suffix; the version being worked on is `x.y.z-dev` and needs no entry) lists every version ever released with its three fingerprints, the git commit, the date, and a short change note ("fixed Jumping timing", "added map 13"). It is append only.

**What is enforced.**
1. A test (`tests/test_engine_version.py`, **implemented**) computes the current fingerprints and compares them to the manifest: if the rules code or data changed and `engine_version` was not bumped (or was bumped but not added to the manifest), the test fails. Nobody can change a rule without producing a new version.
2. Every table stores `engine_version` in its config, in the Table DO's game row, in the record header and in the registry row (`live_tables.engine_version`, with `code_hash` and `data_hash` as extra columns). A query such as "all games played on 1.3.x" or "all games where a rule that changed in 1.4.0 was used" is then one SQL statement.
3. The server refuses to create a table on a version other than the current one, and refuses to continue a table whose version it cannot run (it abandons it, see the policy below), instead of playing it on different rules.
4. Replays (section 9.3) show the version of the game in a corner of the viewer, so a rules question about an old game always names the rules it was played with.

**A game runs on the version it started with, and an engine upgrade ends the running games (decision 15).** A deploy with a new `engine_version` makes every table that is `waiting` or `playing` `abandoned` with `end_reason = engine retired` (not exported, 9.1). Only the current engine is ever deployed: no old copies, no state converters, no draining. The server therefore never has a table on a version it cannot run; the check of 3. above only guards against a failed bookkeeping. Deploys that change no rule code or data are not engine upgrades and leave the tables alone. Because every rules change is a new version, upgrades are best batched while the rules are still being completed.

**Records outlive engine versions.** Because the record keeps per-action patches (9.1.5), a game played on `1.2.0` can still be replayed after `1.2.0` is gone. The version only matters for (a) refolding for verification (only for the versions still present) and (b) forking, where the fork starts a new table on the *current* version from the recorded state, and says so ("recorded on 1.2.0, continues on 1.5.0").

**Rule regressions across versions.** Finished records are kept as fixtures. When a new version is built, a script plays every kept fixture's actions on the new engine and reports where the new version disagrees with the recorded events. A disagreement is either a bug in the new version or an intended rule change; the change note of the version must list it. This is the practical meaning of full traceability: every behavioural difference between two versions is found, listed and justified before release.

## 6. Server API

New package `src/ark_nova/live/` (the client of the Table DO, sessions, projection, clocks) and routes in `api/main.py` or a router file; a separate Cloudflare project (`cloudflare/`: the Worker, the Table DO and the id counter DO, in TypeScript) that never contains a rule. The DO's `/init`, `/state`, `/append`, `/record` and `/finalize` are internal: the Worker accepts them only with a signed header from Cloud Run.

| Route | Purpose |
|---|---|
| `POST /api/games` | create from a config (map(s), Marine Worlds, draft on/off, base projects or random, clocks); returns game id and the seat links |
| `GET /api/games/{id}` | lobby info: status (`waiting` / `playing` / `finished`), who has joined |
| `POST /api/games/{id}/join` | take a seat with its token (and a display name) |
| `GET /api/games/{id}/state?seat=` | the projection for the token's seat (or spectator) with `version`, the seat's compact legal-action list (only when it may act), clocks later; read from the DO's stored view |
| `GET /ws/{id}?s=<token>` | WebSocket to the Table DO (through the Worker, not Cloud Run): `{version, view, decision}` pushed after every accepted move, the latest view on connect |
| `POST /api/games/{id}/actions` | `{version, action, request_id}`: Cloud Run validates and applies, then appends to the DO with `expected_version`; returns the new projection; `409` on a stale version; idempotent on `request_id` |
| `POST /api/games/{id}/undo`, `/restart`, `/confirm` | the turn controls (or fold them into `actions`) |
| `POST /api/games/{id}/concede`, `/abandon` | a player concedes; `abandon` ends the table when both seats have sent it (mutual abandon) |

Rate limiting (the stubbed hook) is switched on for these routes: per token and per IP. Request bodies are size limited, the action schema is validated before it reaches the engine, and an unknown action kind is a plain `422`.

## 7. Frontend

**Built (L7):** `web/play.html` (create a game and get the seat links; join with a name; then the board) with `window.PLAY_MODE` in `web/js/replay.js`: the viewer draws the view the server pushes (`{version, view, decision, label}` over the WebSocket of the Table DO, or every 2 seconds from `GET /api/games/{id}/state` when `LIVE_KEEPER_URL` is not set), the bar is made from the seat's `decision` exactly as in the fork (cards in the hand, display, placement, confirm / undo / restart as legal actions of the engine), a move is checked with `POST /api/games/{id}/preview` (the popup for a move that cannot be taken back) and then sent with `POST /api/games/{id}/actions`; the page waits with "Waiting for …", a spectator link needs no token, and the seat token lives in the url and `localStorage`. Not built: the draft cards of the other seat, the clocks, the abandon vote, sound / notification when it is your turn, and a mobile pass of the play page.

The viewer (`replay.js`) renders a state and a decision summary; the play page needs the same renderer with input handlers and a very different loop (server state in, one action out).

1. **Split `replay.js`** into modules: `render/board.js` (zoo maps, buildings, bonuses), `render/cards.js`, `render/trackers.js` (side panel, break/round), `render/shared.js` (display, projects, association board), `render/bar.js` (the decision bar), `animate.js` (the green/red change flashes, driven by comparing consecutive states), and `replay.js` / `play.js` as thin controllers. The current code uses closure-level state (`replay`, `step`); introduce an explicit `view model` so the same renderers take a state from either source. This is the largest frontend task and is done *first*, behind the unchanged replay UI.
2. **Interaction layer** for the play page (the mediator of section 5.1: it groups the legal actions of the seat into elements and maps input back to one of them):
   - the action bar buttons become real controls (choose an action card, spend X tokens, take/skip effects in any order, confirm/undo/restart);
   - map hexes become click targets for building placement: hover shows the footprint at the chosen rotation, illegal hexes are inert (the legal `(x, y, rotation)` list per building type comes from the server);
   - cards are selectable: click the hand/display to select with the check mark and green border, a confirm button appears (the discard and keep prompts described for the replay);
   - project slots, partner zoo/university choices, association tasks, the draft cards, X-token payment all get a click path;
   - the opponent's moves arrive over the WebSocket and are shown with the existing change animations; a "waiting for X" state and a clock per player.
3. **Per-viewer POV**: the player sees their hand; the opponent's hand is card backs. The replay's "both hands visible" mode stays replay-only (a flag on the view model).
4. **Reconnect and recovery**: the page stores `(game id, seat token)` in `localStorage`; on load it opens the WebSocket, which sends the latest view of its seat. A dropped socket reconnects with backoff. A `409` re-fetches and drops the half-made choice.
5. **Mobile**: reuse the drawer layout; the play bar needs the large tap targets already used in the replay. Placing buildings on a phone is the hard case (pan/zoom the map).

## 8. The three modes on one server

| Mode | Who acts | State source | Differences |
|---|---|---|---|
| **Live game** | two people, one seat each | new game from config (draft first) | everything above |
| **Sandbox** | one person acts for both seats | a replay step (a fork) or an edited position | no hidden-info projection (the one user sees all), no clocks; needs a *position editor* and a state validator (card conservation: every card exactly once across decks, hands, zoos, discard) |
| **Custom game** | two people | new game with chosen map, expansions, options, base projects | the lobby/config screen; gating by what the engine supports |

**Fork from a replay** becomes: create a sandbox (or live) game whose initial state is the replay state at a step. That requires the replay state to be an *engine* state. Steps the engine replayed and matched already are; steps built from the log only (flagged in the viewer) must not be forkable until their turn is supported, or must be re-synced from the log with a warning. The unknown part of the deck order is filled with the seed finder's `tail_seed` as designed (`PROJECT_OUTLINE.md` section 6); for a *live* fork between two real players the server picks a fresh secret seed.

## 9. Lifecycle, fairness and the game record

- **No time control at first.** A game has no clock; there is no paused state: the game simply waits for a seat that is away. Either player can concede, or both agree to abandon. A game untouched for 30 days is archived as abandoned.
- **Clocks later**: a simple real-time clock with several speed settings (for example per-move time or a time bank per player, a few presets), enforced by the server (`deadline` stored with the game, checked on every read and write, plus a timer for active games). Nothing in the engine changes: time lives in the server and in the game record. Policy for timeouts (loss or pause) is decided when this step comes.
- **Deploys**: a deploy must not kill a game. Because the store is the truth, any instance can continue it; the engine version policy (5.10) covers incompatible rule changes.
- **Cheating surface**: no secret ever reaches the client (section 4); moves are validated against the engine; the seed is server-only; seat tokens are long random strings shown once; spectators (allowed while the game runs) get the view of a player with hidden hands.

### 9.1 The game record: every game is logged completely
Each game keeps a complete, full-information record from the first player joining to the end, so that anything that happened can be reproduced, analysed or shown later. It is written as the game goes (append only, the `steps` table of the Table DO's SQLite, in the same transaction as the action) and exported when the game ends.

What it contains:
1. **Header**: game id, config (maps, expansions, base projects, draft on/off), the seed and deck prefix, `engine_version` with its `code_hash`, `data_hash` and `schema_version` (5.10), the supported-content flag set used, player names, hashed seat tokens (never the tokens), created / started / finished times, the result and how the game ended (scored, conceded, abandoned).
2. **Every submitted action, accepted or not**: sequence number, seat, the action, server timestamp, the `version` it was made on, the client's `request_id`, the outcome (accepted / rejected with the reason / stale), and the milliseconds since the previous event of that seat (time spent per decision, useful for later clock presets).
3. **Every engine event** caused by an accepted action (section 5.9) with full information: who drew which card, what was revealed to whom, resources before and after, the shuffle that happened. Together with the seed this lets you re-run the game, but the events also make it readable without re-running.
4. **Control events**: undo and restart (naming exactly which steps they took back: the replay uses this to hide them, 9.3), confirm, the draft choices and when both were in, concede, abandon (each seat's agreement), join / leave / reconnect of each seat and of spectators.
5. **The viewer steps: everything the replay shows, stored as the game was played.** The replay of a record must show the viewer exactly what happened, on any later engine version, so the record stores *what the viewer displays* and not only what the engine would need to recompute it. For every accepted action (the "effective" ones, see 9.3) one step with:
   - the **view state** after the step as a compact JSON patch against the previous effective step (each patch names its `base`, the step it applies to, so the chain stays valid when undone steps are dropped), with the full view state at the start, at every confirmed turn and at the end as checkpoints and integrity checks. The view state is what `replay/view.py:state_view` sends today: the engine state *plus every value the viewer used to get from engine functions*: the player's score, income, hand limit, the cells every building covers, the icon counters, the full draw pile order (the seed is in the header);
   - the **decision shown in the bar** (`options`: prompt, effect names such as "Perception 2", pieces that can be placed, what can be taken, sponsors that can be played, ...) computed at record time by the engine version that played the game;
   - the **text** of the step and of its sub-steps, already rendered ("MezzoMike plays Inland Taipan for 10 and places it in a size-2 enclosure"), plus the structured event list it came from (card ids, amounts) and the explicit step fields (`actor`, `spent_x`, `reveal_drawn`, `round_started`, ...);
   - the **flags** the viewer draws: `actor`, which cards moved zones, the draft data for draft steps.
   The consequence is a rule: **the code that replays a record never imports the engine** (tests enforce it, see 9.3). A record is therefore a self-contained document in a versioned *viewer format* (`viewer_schema_version`), readable by every future viewer through small migration functions. Only forking needs the engine.
   The engine state patches (for fork and for analysis) are stored too, separately: the viewer stream and the engine stream are two views of the same steps, linked by sequence number.
6. **Decision context** (optional, off by default): how many legal actions the seat had at each decision, for analysis of difficulty.

What it deliberately does not contain: seat tokens, IP addresses, browser details.

Use:
- **Finished game export**: when a game is `finished` or `conceded`, the whole record is written once as one gzipped JSON file in GCS (immutable) and the table registry row gets its path (section 9.2). An `abandoned` table is not exported.
- **Replay**: the record holds exactly what the viewer shows, so a finished live game opens in the replay viewer on any later engine version, without any BGA log and without the engine, with undone moves hidden: see section 9.3.
- **Bug reports**: a game that hit "stopped, please report" or a rules error can be reproduced exactly from its record (seed + actions + engine_version).
- **Rules regression tests**: finished live games are added to a test folder like `log_examples/`: the engine must reproduce every recorded event.
- Size and cost: a game is about 100-300 actions; the record is roughly 0.5-2 MB with snapshots, well within the free quota for a handful of games per day; the Table DO's data is deleted once the export is confirmed; the GCS export is kept.

### 9.2 Table ids and the table registry (BigQuery)

**Built (L4):** the dataset is `freestyle-190711.ark_nova_engine` (US), created with `scripts/setup_live_registry.py`: the table `live_table_events` (clustered by `table_id`) and the view `live_tables`. Code: `live/registry.py` (schema, `build_row`, `BigQueryRegistry`, `FakeRegistry`), `live/archive.py` (the record file, `GcsArchive`, `refold`), `LiveService.sync_registry` / `wrap_up`. Settings: `LIVE_BQ_PROJECT`, `LIVE_BQ_DATASET`, `LIVE_GCS_BUCKET` (empty until the bucket exists: nothing is exported and the keeper keeps the finished tables). The registry never holds the seed or a token; `started_at` is carried forward by the view; a row's `insertId` is `E12:3`.

**Every table has a unique table id** from the moment it is created, and a place in a BigQuery registry that follows the table through its life and ends up pointing at the log file in GCS. The registry is **append-only** (decision 21): the table `live_table_events` receives one row at every change of status, and the view `live_tables` gives the latest row of each table, which is what everything reads. The Table DO stays the live source of truth while the game runs (its single-writer transactions are what the game needs); BigQuery is the index and the permanent catalogue. The volume (a handful of games a day) makes BigQuery's weak transaction story irrelevant.

**The id.** A string `E{n}` where `n` is an incrementing integer (`E1`, `E2`, `E3`, ...). BGA table ids are bare numbers, so the `E` prefix tells the two apart at a glance and everywhere: the lookup route, the replay route and the index send an id that starts with `E` to the live registry and a number to the BGA index, without a lookup first. A BGA id can never collide with a live one. Allocation must not depend on BigQuery (it has no counter and no uniqueness constraint): the id counter Durable Object hands out the next `n` (one object, so no two tables get the same number), which also keeps the ids short and in creation order. If the counter is ever lost, the next `n` is the highest `table_number` in the registry plus 1.

Code that assumes a table id is an integer has to change when this is built (a checklist for L4): `api/tableid.py` (`parse_table_id` returns `int | None` and accepts only digits; it must also accept `E<digits>`, case insensitive, and return the canonical `E{n}`); the routes in `api/main.py` that declare `table_id: int` (they become `str` validated against `^(E\d+|\d{1,12})$`, and the cache keys/ETags already use the value as text); `GameConfig.table_id: int` (the BGA table, used for the older-table rule quirks; a live game is `0` there and carries the `E` id in its own field); `web/js/replay.js` and `web/submit.html` (`/^\d+$/` checks on `?table=`); `TableRecord` and the index lookup (`storage/index.py`); the landing page hint ("Paste a BGA table id or `E12`"). Sorting and range queries use a separate integer column.

**The row** (`live_table_events` holds one complete row per status change, with the columns below plus `event_seq` and `event_at`; the view `live_tables` returns the row with the highest `event_seq` of each `table_id`, so a reader sees one row per table):

| column | meaning |
|---|---|
| `table_id` | the unique id, a string `E{n}` (STRING) |
| `event_seq`, `event_at` | the number of this event within its table (1, 2, 3, ..., given by the Table DO, so a retried write repeats the same number) and when it happened |
| `table_number` | the `n` of the id as INT64, for ordering and for finding the highest id |
| `status` | `waiting` (created, seats not full), `playing`, `finished` (played to the end and scored), `conceded` (a player gave up), `abandoned` (nobody came back, or both players agreed to abandon: this also covers a table that never started), `error` (the engine could not continue) |
| `end_reason` | free text for the details (who conceded, which rule failed, ...) |
| `created_at`, `started_at`, `ended_at` | timestamps |
| `player_names` | the two typed names (array) |
| `maps`, `marine_worlds`, `config` | what was played (config as JSON) |
| `engine_version`, `code_hash`, `data_hash` | which engine played it (section 5.10); also fixed in the table's `GameConfig` |
| `n_actions` | number of accepted actions |
| `scores`, `winner` | final result when there is one |
| `gcs_path` | `gs://<bucket>/live/<yyyy>/<mm>/<table_id>.json.gz` (for example `.../E12.json.gz`) of the complete record, **set when the record was exported** (a `finished` or `conceded` game always has one; `NULL` for an `abandoned` table and for an `error`) |
| `exported_at`, `record_bytes` | when and how big |
| `schema_version` | version of the record format |

**The life cycle.** The server appends a complete row at each change of `status`:
1. table created -> event 1, `waiting`;
2. second seat joined and the draft starts -> event 2, `playing` (`started_at`);
3. game ended or conceded -> the record is exported to GCS first, then the final event is appended with the final `status`, `end_reason`, `ended_at`, the result and `gcs_path`, then the Table DO deletes its data. The order matters: the path is only written once the file exists. An abandoned table only gets its final event with `status` and `end_reason` (nothing to export).

**BigQuery details that matter** (checked against how BigQuery behaves, not yet against this project):
- Only `INSERT`s: no `UPDATE`, `MERGE` or DML limits, and the streaming insert API (or small load jobs) can be used, because a row is never changed after it was written. Rows still in the streaming buffer are visible to queries and to the view.
- The view is `SELECT * EXCEPT(rn) FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY table_id ORDER BY event_seq DESC) AS rn FROM live_table_events) WHERE rn = 1`. Writes are idempotent by construction: a retry repeats the same `(table_id, event_seq)` and the view still returns one row per table (a duplicated row is identical, so which of the two is picked does not matter).
- The history stays: every status change of every table, with its time, which also shows how long tables waited or played.
- BigQuery is not on the critical path of a move. A failed registry write must never block or fail a game: the Table DO keeps the events that BigQuery has not acknowledged (`registry_dirty`), a retry (with backoff) appends them, and a periodic job (Cloud Scheduler hitting an admin route, or a DO alarm) syncs every dirty or stuck table. The registry is therefore eventually consistent with the Table DOs; the GCS file is only written from the DO's record, so it is complete whatever BigQuery did.
- Cost: a few small inserts per game and one tiny view query per lookup: well inside the free tier.
- The existing BGA tables (`all_games_stat`, `logs_archive_mapping`) are not touched: the lookup tries the registry for ids that start with `E` and the existing index for the others. The GCS path is `live/<yyyy>/<mm>/E<n>.json.gz`.

**What uses it.** The landing page and `/api/lookup` accept a live table id and open the replay of a finished game from `gcs_path`; an unfinished table says so, and an abandoned one too. An admin view (later) lists tables by status; the stuck-table job finds `playing` tables untouched for N days and marks them `abandoned` (nothing is exported, decision 18).

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
2. **Fuzz / self-play**: random legal-move bots play thousands of full games per rules change; invariants checked after every action (card conservation, track limits, no `NotImplementedError`, game always terminates, `legal_actions` never empty unless over). This is the main protection for rules that no log exercised.
3. **Projection tests**: for random states, the projection for seat A contains no card id from B's hand, no deck order, no seed; and applying actions shown to A never needs hidden data.
4. **API tests**: two simulated clients over the real routes: concurrent moves (version conflicts), reconnect mid-turn, undo/restart rules (reversible vs irreversible), timeouts, concede, mutual abandon, replayed `request_id`.
5. **UI tests** with a headless browser for the click paths (placement, card selection, draft), on desktop and phone width.
6. **Game record and registry**: play scripted games (including undo, restart, rejected and stale submissions, a reconnect) and check that the exported record reproduces the final state, contains every submitted action, and contains no seat token. Registry: ids are unique `E{n}` strings and strictly increasing under concurrent creation, and `parse_table_id` / the routes accept both forms; every ending (finished, conceded, abandoned, including a table abandoned before the start, error) leaves the right `status` and a `gcs_path` that exists exactly when a record was exported; a BigQuery failure does not stop the game and is repaired by the retry / sync job; the event write is idempotent (run twice, the view still shows one row per table).
7. **Load**: a few dozen simultaneous games, WebSocket counts and hibernation, Durable Object row writes and requests per game against the plan limits, the Cloud Run LRU cache hit rate, and the append race (two moves submitted at once: one gets `409`).

## 11. Phases

| # | Deliverable | Exit criteria |
|---|---|---|
| L0 | The two planning sheets filled in (`web/planning.html`); supported-content flag (which cards/maps are fully implemented) | no undecided rows; flag computed from `engine_coverage` |
| L1 | Engine: explicit confirm step, both-seat input states, reversibility from the sheet + undo/restart, structured events, `engine_version` with the manifest and its test (5.10); replay kept green | engine and replay tests pass; replay no longer needs the "log timed" overrides for turn end |
| L2 | Rules completeness for the supported set + fuzz harness | 100k random games play to the end with invariants intact |
| L3 | Live package: the Cloudflare project (Worker, Table DO, id counter DO) and its Python client, sessions, the projection driven by the visibility sheet, API routes, seat links with player names | two scripted clients play a full game over the API and the WebSocket; projection tests pass; a stale `expected_version` is refused |
| L4 | **(built)** **Game record and table registry**: unique table ids `E{n}` (id counter DO), the BigQuery registry (`live_table_events` plus the `live_tables` view) written through the life of the table, header, every action and engine event, control events, checkpoints, GCS export with the path written to the row; replay of a recorded game | every ending leaves the right status and path; a finished game's record reproduces its final state and is read back by the replay viewer; BigQuery outages do not affect a game; no tokens in the record |
| L5 | **(built)** **Replay of recorded games** (section 9.3): the source interface, `from_record.py` (no engine import, effective history with undone moves removed), the structured step fields shared with the BGA source, the viewer step format with its `viewer_schema_version`, `E{n}` ids in the replay API | a self-play record and a live game both open in the existing viewer, also with the engine made unimportable; undone moves never show; fork works at any step; the BGA replays are unchanged |
| L6 | Frontend split into render modules (replay unchanged) | replay pixel-identical, all existing tests pass |
| L7 | **(built)** Play page: the mediator UI (grouping legal actions, mapping input back), WebSocket, reconnect, draft, confirm/undo/restart | two browsers finish a game |
| L8 | Hardening: rate limiting on, abandonment, retention, spectator view | load test and soak test pass |
| L9 | Clocks with speed settings | timed games with the presets decided then |
| L10 | Sandbox (position editor, fork from replay) and custom game lobby | landing page cards go live one at a time |

L1-L2 are the long ones; L3-L4, L5 and L6 can proceed in parallel once L1's action and event shapes are fixed (L5 only needs the record format of L4 (the viewer step format is defined jointly with it), and can start from a self-play record before the server exists). L4 comes right after L3 on purpose: the record exists from the first playable game, so no early game is lost.

## 12. Decisions

Taken:
1. **Time**: no time control at first; a simple real-time clock with several speed settings later (L9).
2. **Persistence and realtime**: Cloudflare Durable Objects (a Table DO per game with SQLite and WebSockets, an id counter DO, a Worker in front); the Python engine stays on Cloud Run and is the only place that validates moves and builds the views (3.5). The free plan covers roughly 30 games a day; the $5 plan after that. Firestore and server-sent events were the first draft and are rejected.
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
13. **Timeout policy** (for L9, once there is time control): when a player runs out of time the opponent chooses to wait or to abort; an abort ends the table as `abandoned` with `end_reason = timeout`.
14. **Spectators and replays**: spectators are allowed while the game runs and get the view of a player with hidden hands (4.2); a replay of a table opens only after the table has ended, for whatever reason (a `finished` or `conceded` table has a record to open, an `abandoned` one has none, decision 18).
15. **Engine version policy** (5.10): an engine upgrade makes every table that is still `waiting` or `playing` `abandoned` (`end_reason = engine retired`); there is no draining, no state migration and no old engine copy kept. Only a new `engine_version` counts: a deploy that changes neither rule code nor data (frontend, infrastructure) does not.
16. **Draft and setup**: the action card draft is played if and only if Marine Worlds is on (standard action cards otherwise); in a normal game the 3 base projects are drawn at random; a custom game has its own rules, to be specified when it is built.
17. **Expected scale**: a small community, at most 20 concurrent users: a single small Cloud Run instance range and the free Cloudflare plan are enough; the limits (rate limit, body sizes, a cap on open tables per IP) are there against accidents and abuse, not for load.
18. **Retention and exports**: the record is exported to GCS for `finished` and `conceded` tables; an `abandoned` table is not exported (its last event says `abandoned` and has no `gcs_path`). A Table DO deletes all its data once the export is confirmed (for an abandoned table: as soon as the row is updated). Player names are part of the exported record (it is what the replay shows).
19. **Resources**: the bucket, prefix, BigQuery dataset and table, Cloudflare project and Worker names are placeholders for now (`<live-bucket>`, `<live-dataset>`, ...); the paths in this plan are examples and the names are filled in when the infrastructure is created.

20. **Rule changes are batched**: rule changes are collected and released together in one new `engine_version` (a minor bump per batch), never one version per fix, because every new version abandons the running tables (decision 15). Between batches the rules are developed and tested, not deployed; a batch is released when no live table is in a long game or on an agreed quiet time.

21. **Registry shape**: append-only status events (`live_table_events`) with a view `live_tables` that returns the latest event of each table (9.2); no `UPDATE`.

Nothing is left open in this section for now; new questions are added here as the implementation raises them.

## 13. Main risks

- **Rules coverage** is the real gate: a crash or a wrong rule in a live game is worse than in a replay, where a mismatch just gets flagged. Fuzzing and the completeness list cost more than the networking.
- **Hidden information leaks** are easy to introduce (a debug field, a label in the log text). The projection is the only way out of the server and has its own tests.
- **Replay and live drifting apart**: the replay keeps log-timed overlays that the engine does not need. Doing the explicit confirm step early and reducing the overlays keeps one source of truth.
- **Frontend size**: the viewer is a single large file with global state; the split (L4) must be finished before interactions are added, or both will be rewritten twice.
- **Cloud Run behaviour** with long-lived streams and scale-to-zero (cold starts, 60 minute request cap, instance fan-out) needs a spike early in L3.
