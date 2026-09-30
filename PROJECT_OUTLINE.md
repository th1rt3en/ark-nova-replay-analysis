# Ark Nova Replay & Fork Analyzer — Project Outline

## 1. Goal

A website where a user enters a BGA table ID for a finished Ark Nova game and can:

1. Step through the replay move by move (no animations, forwards and backwards).
2. At any point, **fork** the current game state into a new tab and play alternative lines for **both** players, switching POV freely, until the game ends or they quit.

Powered by a from-scratch Python rules engine covering the full base game plus **Marine Worlds**: all animal, sponsor, conservation project and final scoring cards, and every BGA map (1–14, 1a–8a, T1).

**Stack:** Python (backend + engine), HTML, JavaScript (frontend, no heavy framework needed).
**Deploy:** Cloud Run service. **Storage:** BigQuery (log index) + GCS (raw logs).

## 2. Architecture

```
Browser (HTML/JS)
   │  REST/JSON
Cloud Run service (Python, FastAPI or Flask)
   ├─ /api/tables/{id}        → BigQuery lookup → GCS log fetch → parser → replay
   ├─ /api/replay/{id}/state?move=N
   ├─ /api/fork               → seed finder → new game session
   └─ /api/game/{sid}/...     → legal actions, apply action, undo, switch POV
   │
   ├─ ark_nova.engine   (pure Python, no I/O, deterministic given seed)
   ├─ ark_nova.parser   (BGA log → normalized event list + deck-order prefix)
   └─ ark_nova.data     (cards, maps as JSON, generated from upstream sources)
```

Design principles:
- **Engine is pure and deterministic**: `state' = apply(state, action)`; all randomness comes from one seeded RNG stored in the state. Immutable/copy-on-write state makes backward stepping and forking trivial.
- **Replay = precomputed list of states (or snapshots + events)**. Stepping back is an index change, not an inverse operation.
- **Stateless service, client-side sessions**: fork sessions are ephemeral and live in the browser (in-memory, optionally `sessionStorage` per tab). The client holds `(table_id, fork_move, seed, action list)` or a full serialized state and sends it with each request; the server rebuilds/validates the state and returns legal actions and the next state. Nothing is stored server-side, so Cloud Run can scale to zero. Closing the tab loses the fork.

## 3. Repo Layout

```
ark-nova-replay-analysis/
├─ CLAUDE.md                     # conventions, commands, gotchas for Claude sessions
├─ PROJECT_OUTLINE.md
├─ pyproject.toml
├─ Dockerfile                    # Cloud Run
├─ src/ark_nova/
│  ├─ engine/
│  │  ├─ state.py                # GameState, PlayerState, Zoo map, decks, break track
│  │  ├─ actions.py              # Action types + legality
│  │  ├─ rules/                  # cards.py, animals, sponsors, projects, marine, scoring, breaks
│  │  ├─ rng.py                  # deck shuffling + seed strategy (see §6)
│  │  └─ game.py                 # turn loop, phases, end game
│  ├─ data/                      # cards.json, maps.json (generated)
│  ├─ parser/                    # BGA log parsing
│  ├─ replay/                    # replay builder: events → engine actions → states
│  ├─ seedfinder/
│  ├─ api/                       # web layer
│  └─ storage/                   # bigquery.py, gcs.py, requests.py
├─ web/                          # index.html, replay.html, play.html, js/, css/
├─ scripts/                      # import_cards.py, import_maps.py, log fixtures
├─ tests/                        # unit, per-card, golden replay tests
└─ docs/
```

## 4. Flows

### Flow 1 — Table lookup
1. User submits table ID on the landing page.
2. Backend queries BigQuery (`table_logs` table: `table_id`, `gcs_path`, `downloaded_at`, `players`, per-player `map` (source of truth for maps; the log usually omits it), `marine_worlds` flag (source of truth for whether the expansion is in play; also drives engine setup), `parse_status`).
3. **Found:** read log from GCS → parser → replay builder → redirect to `/replay/{table_id}`.
4. **Not found:** return `404 not_logged`; frontend shows a modal: "That table hasn't been logged yet, a request has been submitted."
   - **TODO:** request mechanism (options: insert row into a BigQuery `log_requests` table, Pub/Sub topic consumed by a downloader job, or a Cloud Tasks queue). For now, stub `request_log(table_id)` that only logs it.

### Flow 2 — Replay page
Buttons: **A** forward 1 move, **B** back 1 move, **C** jump to move #, **D** fork from here. Also keyboard arrows, a move list sidebar, and both players' zoos/hands/tableau shown at each step (no animation, instant re-render).
- **A "move" is one sub-decision**: a player's turn is choosing an action card and then resolving its effects, and each single effect resolution is one move (this matches how the BGA log records them). Forward/back/jump-to step through these moves. The move list groups moves under their parent turn/action card for readability. The engine's atomic action must line up with this definition, so each logged move maps to exactly one engine action.

### Flow 3 — Fork
1. D opens a new tab: `/play?table={id}&move={n}`.
2. Server rebuilds the replay state at move `n` and its deck-order info from the log.
3. **Seed finder** produces an engine seed consistent with the known card order (see §6).
4. Load the state at move `n` with that seed; from here the RNG is authoritative and further draws beyond the known prefix are random.
5. Play UI: user acts as either player, with a POV toggle; legal-action list from the engine; undo; end/quit; game-over scoring screen.

## 5. Game Engine Scope

Implement in layers, each with tests:

1. **Core**: zoo map placement (hex/tile grid, buildings, enclosures, adjacency, bonus tiles), 5 action cards with strength-slot rotation, X tokens, money/appeal/reputation/conservation tracks, hand limit, card display (6 cards + refresh), break track, income, end-game trigger.
2. **Actions**: Animals, Build, Cards, Association, Sponsors, with upgraded (flipped) variants.
3. **Cards**: animal cards (icons, requirements, abilities), sponsor cards, conservation projects (base + release + Marine Worlds), final scoring cards. Model as data + ability hooks (`on_play`, `on_break`, `on_income`, `passive`, `scoring`).
4. **Marine Worlds**: sponsor/animal additions, aquatic buildings, new maps and associated rules, tokens and icons.
5. **Maps**: 1–14, 1a–8a, T1 as data (tile shapes, bonus spaces, starting placements) plus per-map rule tweaks.
6. **Game flow**: setup for **2 players only** (no 1, 3 or 4 player support), turn order, break resolution, scoring, tiebreakers.
7. **Interface for UI/AI**: `legal_actions(state)`, `apply(state, action)`, `is_terminal`, `score`, serialization (JSON round-trip).

**Validation strategy:** golden tests replaying real BGA logs through the engine and checking that final scores match the logged result. This is the primary correctness harness; also write per-card tests.

### Data sources
- Cards and maps: https://github.com/Ender-Wiggin2019/Next-Ark-Nova-Cards (single upstream repo for both). **Imported** (`scripts/import_data.py`; see `docs/data_sources.md`). Findings: no license file; Marine Worlds projects P133–P139 are skeletons in `data_manual/projects_mw.json`, to be filled in manually; `_MW` reprint variants not modelled; **no map geometry, only names/text/images**, so maps need another source.
- BGA card IDs in the logs look like `A414_SouthAmericanCoati`, `S231_SponsorshipPrimates`, `P127_PrimateBreeding`, `F003_ResearchZoo_MW`; these prefixes (A/S/P/F, `_MW` suffix) should be the join key to the upstream data.
- `scripts/import_*.py` normalize them into `src/ark_nova/data/*.json`. Keep provenance and a license note in `docs/data_sources.md`.

## 6. Seed Finder (Key Technical Risk)

Goal: engine seed whose first *x* drawn cards match the real game's observed order.

**Problem:** brute-forcing a 32/64-bit seed only works for very small *x*. Matching *x* cards from a deck of ~200+ has probability roughly 1/(200·199·…), so past x≈4–5 no seed will exist to be found by search.

**Recommended design (keeps the "seed" concept):**
- Deck build = `known_prefix` (from the log) followed by a PRNG shuffle of the remaining cards, where the PRNG is seeded by a random `tail_seed`.
- The "seed" stored in the session is `(known_prefix, tail_seed)`. Finding it is O(x), deterministic and always succeeds.
- Alternatively, an invertible shuffle (Lehmer code / Fisher–Yates driven by an explicit index stream), where the seed finder constructs the index stream directly instead of searching.
- Keep a pure brute-force finder only as a fallback/tutorial for small x, if wanted.

Details to define:
- Separate decks: main animal/sponsor deck, conservation projects, final scoring cards, base tiles, etc.: each gets its own prefix.
- Hidden information: the logs reveal everything (both players' draws, hands, display refills, discards), so the full deck order is reconstructable up to the last card drawn in the game. Correctly deriving that order is the critical piece; everything after it is random. Derive it by replaying events chronologically and recording each card as it leaves the deck (drawCards/pDrawCards, fillPool, snapCard, deck reshuffles). Watch for: the initial deal, the discard pile being reshuffled when the deck runs out (the post-reshuffle order is not a deck prefix of the original deck), and cards seen in the display before being drawn.
- Consistency check: after forking, the engine state at move *n* must equal the replay state at move *n*.

## 7. Log Parsing

- Input: raw BGA replay JSON stored in GCS (samples in `log_examples/`, 29 games, 5–17 MB each). Shape: `{status, data: {logs: [packet...], players: [{id, color, name, avatar}]}}`. Each packet has `packet_id`, `move_id`, `time`, `channel` (`/table/t…` or `/player/p…` for private data), and `data: [event...]`. Each event has `uid`, `type`, `log` (template string), `args`.
- Observed event types (from one sample): gameStateChange, getBonuses, actionCardCleanup, chooseActionCard, slideMeeples, fillPool, takeBonus, pDiscardCards/discardCards, pDrawCards/drawCards, buyBuilding, snapCard, buyAnimal, discardCardsOnDisplay, playSponsor, advanceBreak, startBreak/finishBreak, upgradeCard, donation, moveProjects, markCard/markAssign, pilfering(Money), releaseAnimal, endOfGame, finalScoring, setupActionCards, initial-selection updates. Drop noise types (updateReflexionTime, wakeupPlayers, midmessage, gameStateMultipleActiveUpdate).
- Note: the same event can appear twice, as a public event (`drawCards`, count only) and a private one (`pDrawCards`, card identities). Parser must dedupe and merge these.
- Output: normalized event list `[ {move_no, player, type, payload} ]`, map + expansion settings, player info, final result, and the **observed deck-order prefixes**.
- Output: normalized event list `[ {move_no, player, type, payload} ]`, map + expansion settings, player info, final result, and the **observed deck-order prefixes**.
- Build a mapping from BGA card IDs to engine card IDs (a single source of truth in `data/`).
- `log_examples/` is the fixture folder (keep out of the Docker image via `.dockerignore`; large files, consider git LFS or gitignore). Tests assert parse → replay → final score agreement.
- Handle BGA log format quirks and errors: `parse_status` field in BigQuery to record failures.

## 8. Frontend

- Pages: `index.html` (table ID entry + modal), `replay.html`, `play.html`.
- Vanilla JS modules (state store, renderer, API client), or a small lib (Alpine/Preact via CDN) if needed.
- Renders: zoo grid for both players, hand, display, tracks, break track, action card stacks, log/move list.
- Replay is fully client-side after loading the state list (snapshot + diffs) to make stepping instant. Play mode calls the server for legal actions and applying actions.
- POV switch: same state, different hand-visibility and orientation.

## 9. Deployment (Cloud Run)

- Dockerfile with a gunicorn/uvicorn server, `PORT` env var, non-root user.
- Rate limiting: add the structure now (a middleware/dependency hook with a per-IP key and configurable limits in settings) but keep it a no-op: limits disabled, nothing enforced. Later this can be turned on via config or moved to Cloud Armor/API Gateway.
- Service account with least-privilege access: BigQuery Data Viewer + Job User, GCS Object Viewer, plus write access for request logging.
- Config through env vars (`BQ_TABLE`, `GCS_BUCKET`, etc.); no secrets in the image.
- CI: run tests → build container → deploy to Cloud Run (Cloud Build or GitHub Actions).
- Local dev: `docker compose` or plain `uvicorn`, with a fake storage layer backed by local files for tests.

## 10. Phased Plan

| Phase | Deliverable | Exit criteria |
|---|---|---|
| 0 | Repo scaffold, CLAUDE.md, Dockerfile, hello-world on Cloud Run | Deployed URL responds |
| 1 | Data import for cards and maps | JSON validated by schema, counts match known totals |
| 2 | Engine core (base game, 1 map) | Simple scripted game plays to the end |
| 3 | All base cards + all base maps | Rules tests pass per card |
| 4 | Marine Worlds + remaining maps | Rules tests pass per card and map |
| 5 | Log parser + replay builder | Real logs replay with final scores matching |
| 6 | Web replay page + Flow 1 (BigQuery/GCS) | Enter a table ID and step forwards/backwards |
| 7 | Seed finder + fork + play UI | Fork, play both sides, game-end scoring |
| 8 | Polish: request mechanism, error handling, perf | Request TODO resolved |

Phases 2–4 (the engine) are the bulk of the work; phases 5–6 can start in parallel with phase 3 using base-game logs.

## 11. Open Questions

1. ~~Log format~~ — resolved: BGA replay JSON, see §7 and `log_examples/`. Maps and the Marine Worlds flag both come from the BigQuery index.
2. ~~Move definition~~: resolved, one move = one effect resolution/sub-decision (see §4 Flow 2).
3. ~~Hidden information~~ — resolved: logs reveal all hidden information.
4. ~~Player count~~: resolved, 2-player only.
5. ~~Session persistence~~: resolved, ephemeral client-side.
6. ~~Data source~~ — provided (Next-Ark-Nova-Cards repo). Still to check: licensing and completeness.
7. ~~Auth/rate limiting~~: resolved, no auth; rate-limit hook stubbed but not enforced.

## 12. First Steps for Claude Sessions

1. Create `CLAUDE.md` (commands, layout, conventions from this outline).
2. Analyze `log_examples/` and write `docs/log_format.md` (event catalogue, move_id semantics, where setup/map info lives, deck-draw events). This de-risks the parser and the seed finder.
3. Clone/inspect the Next-Ark-Nova-Cards repo and write the card/map import scripts.
4. Scaffold the repo and the Dockerfile, deploy "hello world" to Cloud Run.
5. Design and lock down `GameState`, `Action` and serialization schemas before writing rules.
