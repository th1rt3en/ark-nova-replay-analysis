# Ark Nova Replay & Fork Analyzer

See `PROJECT_OUTLINE.md` for full scope, architecture and phases; `docs/log_format.md` for the BGA log format; `docs/engine_design.md` for the state/action model.

## Summary
Website: enter a BGA table id, step through the finished game (fwd/back/jump, no animation), fork at any point into a new tab and play both sides with a from-scratch Python Ark Nova + Marine Worlds engine. 2 players only.

## Stack / deploy
Python (engine, API), HTML + vanilla JS. Cloud Run. BigQuery (log index) + GCS (raw logs). Fork sessions are ephemeral, client-side.

## Commands
- Setup: `python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]"`
- Tests: `.venv/Scripts/python -m pytest -q` (data, API, engine foundation, parser; the log-based tests read `log_examples/` and take ~10 s)
- Run locally: `.venv/Scripts/python -m uvicorn ark_nova.api.main:app --reload` (serves `web/` at `/`)
- Run locally on the sample logs (no BigQuery/GCS needed): `.venv/Scripts/python scripts/dev_server.py` (every table in `log_examples/` counts as indexed and logged)
- Regenerate data: `python scripts/import_data.py` (needs `ESBUILD_BIN`/`NODE_BIN`, see script header). Map geometry lives in `data_manual/maps_geometry/` (see `docs/map_geometry.md`).
- Deploy: `gcloud run deploy --source .` (uses `Dockerfile`, `.gcloudignore`); env vars `BQ_TABLE`, `BQ_LOGS_TABLE`, `GCS_BUCKET`, `RATE_LIMIT_ENABLED`.

## Conventions
- Engine is pure and deterministic (`apply(state, action) -> state`), no I/O; all randomness from a seeded RNG in the state.
- Seed = (known deck prefix from the log, tail_seed); see PROJECT_OUTLINE section 6.
- One replay "move" = one effect resolution / sub-decision = one engine action.
- Card/map data comes from https://github.com/Ender-Wiggin2019/Next-Ark-Nova-Cards, normalized by `scripts/import_data.py` into `src/ark_nova/data/` (needs node + esbuild, see the script header). Manual data (P133-P139, `_MW` variants in `data_manual/variants_mw.json`, map geometry) is documented in `docs/data_sources.md`; check with `scripts/check_data_coverage.py`.
- Generated/hand-editable data that is not from upstream: `data/sponsor_thresholds.json`, `sponsor_play_effects.json`, `unique_shapes.json` (scripts `infer_sponsor_thresholds.py`, `infer_sponsor_effects.py`, `fit_unique_shapes.py`; `check_icons.py` validates the icon counts).
- Association data that is not upstream: `data/association_bonuses.json` (per-map conservation bonuses, `scripts/infer_association_bonuses.py`). Players start at reputation 1; replay workers use placeholder ids 9000+ until BGA's ids are seen.
- Animals: `engine/animals_action.py` (the action), `engine/animal_abilities.py` (abilities, see docs/engine_design.md); `scripts/engine_problems.py` dumps every differential problem with the animals of the turn.
- Conservation projects: `engine/association.py` (project -> slot -> bonus as separate actions) + `engine/project_effects.py` (the pending effects of every kind of project); `scripts/debug_diff.py GAME TURN` traces one differential turn.
- Icons: `PlayerState.icons` counters (`engine/icons.py`), breaks: `engine/breaks.py`; both are compared with the logs by the differential test.
- Sponsor effects live in `engine/card_programs.py` (data) + `engine/effects.py` (pending effects, triggers); text of every card: `vendor/Next-Ark-Nova-Cards/public/locales/en/common.json`.
- End of game: `engine/endgame.py` (trigger, last turns, final scoring incl. the sponsors' endgame effects, fitted to the logs by `scripts/check_endgame_cards.py`).
- Engine-driven replay: `replay/engine_replay.py` runs `run_differential(chain=True)`; the viewer (`replay/view.py`) shows the engine's state for every step of a turn the engine replayed and matched, else the log-built state with a flag (`step.engine` = source/status/detail; badges in the move list). Flags are the to-do list for the rules; the next goal is to shrink them to zero and drop the log-built states.
- Fork: the replay's Fork button opens `web/fork.html?table=<id>&step=<n>&seed=<s>` (same viewer, `window.FORK_MODE`). `POST /api/tables/{id}/fork` returns the engine state of that step (`replay/view.py` keeps one per step the engine played, `fork: true`), `POST /api/fork/apply` plays one action on a state posted by the browser (stateless); `replay/fork.py` has the seed rule (`reorder_decks`: seed 1 = the replay's order, any other seed reorders the cards never seen, the same way from every fork point) and the one-line texts of the legal actions. The action card draft steps are engine states too (`builder.engine_draft` feeds `engine/draft.py` the log's offers and choices; the undealt pool is a guess), so the draft can be forked.
- Sandbox: `web/sandbox.html` (lobby: Marine Worlds, a map per seat, the seat to play; the game is kept in `sessionStorage`) + `replay/sandbox.py` + `/api/sandbox/{maps,new,apply,edit}`: the fork viewer (`window.SANDBOX_MODE`) with a tools panel; the other seat is a bot that only passes (`bot_action`), the empty base projects / 5 / 8 / 16 reputation bonuses must be set (random or by hand) before the first move, edits (`edit`: resources, hand, display, action card order / variants, partner zoos / universities, workers) are steps like moves. State and `meta` travel with each step (stateless server). Tests: `tests/test_sandbox.py`.
- Golden tests: replay `log_examples/*.json` through parser + engine, final scores must match `finalScoring` (5 sample games were conceded and have none).
- Rate limiting: middleware hook exists but is disabled.
- Caching: a finished game never changes, so `storage/logs.py` `CachedLogStore` keeps the GCS logs (memory, then files) and `api/main.py` keeps the built replays the same way and answers `If-None-Match` with 304; the ETag carries a code version (newest .py/.json under `src/`), so a deploy never serves an old replay. Env: `CACHE_MB` (memory, default 256), `CACHE_DIR` (default a folder in the temp dir, `off` = no files), `CACHE_DISK_MB` (default 2048). On Cloud Run `/tmp` is memory backed: lower `CACHE_DISK_MB` or set `CACHE_DIR=off` there.

- Full card images (`web/cards/<key>.webp`, 296 cards) are cut from community sprite sheets by `scripts/build_card_images.py` (needs Pillow + numpy; sheets cached in `vendor/card_sheets/`; used with the publisher's permission for this non-profit project). A341, S281, S282 are not on the sheets and fall back to the vendor art.
- Viewer art in `web/` is generated from sprite sheets / BGA by scripts (all need Pillow + numpy, run with the system `python`, not the venv): `build_card_images.py` (cards), `download_bga_maps.py` (`web/maps/map-<id>.jpg` from BGA, 4a cut from the vendor board scan; 6a uses `map-6.jpg`, see `PICTURE_OF` in `replay/view.py`; hex (x, y) at (96 + 115 x, 88 + 66.5 y)), `build_enclosure_sprites.py` (`web/enclosures/`, from `bga_ui_screenshots/enclosures.png`, hex lattice, anchors = the building's (x, y); the Amazon House has no sprite and is outlined), `build_icons.py` (`web/icons/r<row>c<col>.webp` from `icons.png`; `ICON_IDS` in `web/js/replay.js` names the ones in use). `name_icons.py` writes `web/icons/names.json` (BGA's icon names -> sheet ids, read from BGA's `arknova.css`), `build_badges.py` cuts the round continent/animal badges into `web/badges/` from BGA's badge sheet. `build_action_icons.py` cuts the round silver effect badges of the 5 action cards' variants 1-4 (both sides) into `web/action_icons/` (the part hidden by the type panel is mirrored back; the vendor files have Chinese names, run with `PYTHONIOENCODING=utf8`). `build_workers.py` cuts BGA's worker meeples (one per player colour) from the vendored `workers.png` into `web/workers/`. `build_large_art.py` writes the full size art for the hover preview (`web/cards_large/` sponsors, `web/action_cards/` all action cards). `build_mw_card_images.py` makes `<key>_MW.webp` for sponsors whose icons differ in Marine Worlds (S250: 2 water, reptile + sea animal; `card_catalog` uses them when the game has Marine Worlds). The outputs are committed so deploys do not need the scripts.
- JSON files use 4-space indentation.

## Gotchas
- Replay states come from the log events (`replay/builder.py`), the engine is tested per transition against them; `scripts/replay_coverage.py` reports unhandled events and oracle mismatches.
- Engine coverage: `python scripts/engine_coverage.py` lists which turns the engine replays and why the others are skipped (the to-do list for the rules).
- Replay steps = `move_id`s with at least one non-noise event (~79% of move ids); the rest are state-only. Details in `docs/log_format.md`.
- Deck order for the seed: use top-of-deck draws + `fillPool` new cards; do NOT count scavenging/Horse Whisperer/Pilfering/scoring draws; search (tutor) draws only log the found card; the engine rule is first match in deck order, rest keep order, so the deck is one consistent permutation (place the found card just before the first later card of the same type; see `docs/log_format.md`, Seed construction).
- Three decks: main (animals, sponsors, non-base projects), endgame (F cards), base projects (P101-P112, P133; 3 random in play at start). Each card has a `deck` field. The 3 base projects in play are entered by the user (not inferred from the log).
- Tracks: score = appeal + conservation points (-14 at 0, +2/step to 10, then +3/step); end of game triggers at score 100; income from appeal per `engine/tracks.py`; rules in `docs/engine_design.md`.
- `args.infos` on log events (score, income, icons, sizes) is the oracle for engine validation.
- Logs contain a public and a private version of draw events; use private for card ids.
- `log_examples/` is large (~400 MB); keep out of Docker images.
- Beginner maps 0 and A have their geometry (`data_manual/maps_geometry/0.json`, `A.json`, read off the board scans; no special ability; map A starts with an idle 3-space enclosure and a kiosk, `start_buildings`). BGA's index labelled the T1 layout "Map 0" in some tables: `data_manual/map_label_fixes.json` ({table: {player: {label, log}}}, found with `scripts/find_mislabeled_maps.py` from the log's first-building lists) corrects them in `replay/config.py`. `data/map_support.py` (`UNSUPPORTED_MAPS`) lists maps without geometry; their logs go to `log_examples_unsupported/` by `scripts/quarantine_unsupported_maps.py`.
