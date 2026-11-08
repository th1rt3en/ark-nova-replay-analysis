# Replay loading in stages: findings and plan

For the agent that implements it. Scope: the **replay** only (`replay.html`, both sources: indexed tables via `GET /replay`, extension logs via `POST /upload`). Fork, sandbox, live play and the mini games never load in parts and stay as they are.

## 1. How a replay loads today

### Extension path (`source=upload`)
1. `extension/capture.js` keeps BGA's `logs.html` response (the whole log) and the table info; `extension/button.js` posts both to `import.html` (or `importer.js` does, for `?ark=auto`).
2. `web/import.html` stores log, table info and base projects in IndexedDB (`LogStore`) and redirects at once to `replay.html?table=<id>&source=upload`. Nothing is sent to the server here.
3. `web/js/load.js` `fetchReplay()` posts the gzipped log to `POST /api/tables/{id}/upload` with `"quick": true` and sets `fullFetch` to the same post without it.
4. `web/js/main.js` `boot()`: after the quick answer it fetches `sprites.json`, `icons.json`, `names.json`, runs `init()`, and only then calls `loadRest()` (main.js ~194-215), which starts `fetchFullReplay()`. **The full request starts only after the quick view is on screen.**
5. When the full view arrives, `loadRest` replaces `S.replay`, rebuilds the move list and timeline and calls `go(S.step, S.phase)`.

### Indexed path
Same, with `GET /api/tables/{id}/replay` and header `X-Quick: 1` (`api/main.py` `get_replay`, ~291-323). A replay the server has cached (`app.state.replays`) or the browser has (304) comes back whole, so no second request.

### Server
- `api/main.py` `upload_replay` (~505-524): verifies the log, builds the record, and (only when not quick) hands the log to `contributions.submit`, then `_replay(..., quick)`. **Upload results are never cached**: every open and every F5 rebuilds the whole game.
- `replay/view.py` `build_replay_view(raw, record, with_states, first_moves, quick)` (~1082):
  - `quick=True` sets `first_moves = max(dealt + 2, QUICK_MIN_MOVES)` (`QUICK_MIN_MOVES = 20`, `QUICK_MOVES = 60` when no deal is found, ~38-39) and adds `partial: true`.
  - With `first_moves` set, the engine is **not** run (`EngineReplay` stub with `MoveEngine("log")`), the states come from the log builder (`build_replay`), `map_stats` is `None` and `waza_uses` is empty.
  - Without it, `build_engine_replay` runs and engine states replace log states where the engine matched.
- Responses are gzipped by `GZipMiddleware` (`minimum_size=1024`).

## 2. Measurements

Six games from `log_examples/` (941429583, 927683584, 927726814, 930781276, 931947993, 943170782), timed in the cloud workspace (fast CPU; the user's laptop and Cloud Run's default 1 vCPU are slower, the changelog estimates 15-30 s for the engine on Cloud Run):

| build | steps | time | JSON |
|---|---|---|---|
| quick (`quick=True`) | 27-35 | 0.15-0.43 s | 0.28-0.35 MB |
| whole game, log only (`first_moves=len(parsed.moves)`) | 534-707 | 2.2-4.3 s | 5.5-7.8 MB |
| full (engine) | 534-707 | 5.8-10.3 s (engine itself 1.4-2.4 s; the rest is engine `state_view` and `step_options`) | 5.8-8.2 MB |

Script: `scratchpad/timeq2.py` pattern: wrap `view.build_engine_replay` to time it, call `build_replay_view` three ways.

### Log-only whole game vs engine view (table 941429583, 609 steps)
- Same number of steps, **0 label differences, 0 `move_id` differences** (step counts also equal in all six games).
- State differences in 595 steps, almost all invisible or engine-only:
  - ids: building `id` (log 3 vs engine 9102), worker token ids (56 vs 9003);
  - engine-only fields: `stats.*` (turns, money, x tokens, points by kind: the results / end statistics), `prompt.*`, `players[].flags.turn_window`;
  - `variant_stats`, `sponsor_stats` (the engine adds its own observations to the logged gains);
  - `players[].flags.m9_removed`.
- Top level: `engine` summary, `map_stats` (`None` in log only: the map rows of the results table).
- `fork`: 8 forkable steps in log only (draft) vs 583 with the engine; `options` 0 vs 523.

Check before relying on it: compare the board rendering of log-only and engine steps on a few games (buildings by anchor, not by id; card motion keys on anchors/types, `buildingFlips`), and that the step counts match on all `log_examples/`. If a game differs in step count, the swap must map the position by `move_id` + index within the move, not by step index.

## 3. Problems

1. **Too little is loaded first.** The quick view is ~5 % of the game (the draft, the starting hands, a few moves). A user clicks through it in seconds; the full view arrives after quick + asset fetch + `init()` + full build + transfer, so the user stands at the last loaded step (→ does nothing; only the small "Loading the rest of the game…" note bottom left says why). Reported locally: 5-15 s. Not measured on the public site (no network from the workspace or the user's shell); same code on one Cloud Run instance with slower CPU, so very likely the same or worse.
2. **Timeline.** `buildTimeline()` / `roundStarts()` (`web/js/playback.js` ~34-86) use `S.replay.steps.length` and the steps whose label matches `/^End of the break/im`. The quick view has no break and ~30 steps: one segment, the head reaches the end after the starting hands. The exact step count and break positions come only from building the whole game (steps are split / merged late: `_merge_pairs`, `_merge_pilfer`, `_drop_announced_gains`, `_draft_option_steps`, `mark_merges`), so estimating them from the parsed log is not reliable.
3. **Deep links are lost.** `boot()` resolves the hash with `stepOfHash` (playback.js ~205): a move not in the partial view becomes the last partial step, then `history.replaceState` (main.js ~130) overwrites the hash with that step, and `loadRest` keeps `S.step`. `replay.html?table=X#145` opened from an extension log lands at ~step 33 and stays there.
4. **No cache for uploads.** Every F5 of an extension replay costs a full build on the server.

## 4. Plan

### 4.1 A middle stage: the whole game from the log
- Server: one more level of `build_replay_view`. Proposal: replace `quick: bool` with `stage: "quick" | "log" | None`.
  - `"quick"`: as now.
  - `"log"`: `first_moves = len(parsed.moves)` (no engine; keep the full `parsed.normal_turns`, do not cut the timeline), output `partial: "log"`. `map_stats` may be computed here too if it does not need the engine (check `mapstats.map_stats`); otherwise leave it `None`.
  - keep `partial: true` working for old clients or bump both sides together (all in `web/`, no build step).
- API: `upload` body `"stage": "quick" | "log"` (keep accepting `"quick": true`); `GET /replay` header `X-Quick: 1` or `X-Quick: log`. Neither partial stage may call `contributions.submit` (only the full upload does, as now) or be put in `app.state.replays`; both answer `Cache-Control: no-store`.
- Client (`load.js`): `fetchReplay()` returns the quick view; export `fetchStage(stage)`; `main.js` asks for `"log"` and the full view (see 4.2), swaps in each as it arrives (the existing `loadRest` swap: `stageBreaks`, `buildMoveList`, `buildTimeline`, `S.lastBoard = null`, `go(step, phase)`), and never swaps an older stage over a newer one (the log stage may arrive after the full one on a busy server).
- While `partial === "log"`: Fork button disabled (it already follows `step.fork`), results statistics show a short loading state if opened before the engine view (`results.js` reads `stats` / `map_stats`).

### 4.2 Start the requests at once
- Fire the `"log"` and full requests right after the quick response (or together with it), not after `init()`. On one Cloud Run instance Python threads share one core (GIL): two builds side by side each take longer. Measure both orders on the dev server: (a) quick, then log and full in parallel; (b) quick, then log, then full in a chain. Pick the one where the log stage arrives first and the full one is not much later.
- The upload body is the gzipped log (~0.4 MB) each time; fine.

### 4.3 Timeline until the log stage
- While `partial === "quick"`: hide the timeline (`#timeline`) even when the setting is on (also the right-click round jumps and Ctrl + arrows / Ctrl + 1-9, `roundJumps()`), show it as soon as a non-quick stage is in. Keep the setting untouched.

### 4.4 Deep links
- In `boot()`: when the hash names a move the partial view does not have, remember it (`S.wantHash`), do not let `replaceState` overwrite it (skip the hash update while a wanted hash is pending), and resolve it again after each swap; go there once it exists. Also show a small "Loading move N…" state instead of the last partial step if that is cheap.

### 4.5 Cache for uploads
- `api/main.py` `upload_replay`: key = (VERSION, sha256 of the unpacked log text, the cleaned index info fields the record uses, base projects). Keep the full view's bytes in `app.state.replays` (same size limits) and answer with an ETag; on a hit return it at once, also for `stage` requests (then the client gets the full view first and needs no more requests: handle "first answer is not partial").
- Mind memory on Cloud Run (`CACHE_MB`, `/tmp` is RAM).

### 4.6 At the end of the loaded steps
- If the user presses → / autoplay reaches the last step of a partial view, show a visible "Loading…" on the move bar instead of doing nothing; continue when the next stage arrives (autoplay goes on).

## 5. Tests and checks
- Python: `build_replay_view(stage="log")` has the same step count, labels and `move_id`s as the full view on every `log_examples/` game; partial stages never trigger contributions; cache hit returns identical bytes. Add to `tests/` next to the existing replay view tests.
- JS (`node --test tests/*.test.mjs`): the stage ordering logic (an older stage never replaces a newer one) if it is factored into a pure function.
- Browser (Playwright, dev server `scripts/dev_server.py`, a log uploaded through `import.html` or `LogStore` + `source=upload`): timeline hidden then shown, `#145` deep link lands on 145, Fork enabled after the full view, F5 is instant the second time.
- Changelog: a new section in `changelog.md`; update the "A replay opens on a quick view" bullet in `CLAUDE.md`.
- Server change: the user must restart the server (`Start Ark Nova.bat`).
