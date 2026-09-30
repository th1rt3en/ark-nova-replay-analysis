# Ark Nova Replay & Fork Analyzer

See `PROJECT_OUTLINE.md` for full scope, architecture and phases; `docs/log_format.md` for the BGA log format.

## Summary
Website: enter a BGA table id, step through the finished game (fwd/back/jump, no animation), fork at any point into a new tab and play both sides with a from-scratch Python Ark Nova + Marine Worlds engine. 2 players only.

## Stack / deploy
Python (engine, API), HTML + vanilla JS. Cloud Run. BigQuery (log index) + GCS (raw logs). Fork sessions are ephemeral, client-side.

## Commands
- Setup: `python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]"`
- Tests: `.venv/Scripts/python -m pytest -q` (data + API; `test_every_log_card_is_known` reads `log_examples/`)
- Run locally: `.venv/Scripts/python -m uvicorn ark_nova.api.main:app --reload` (serves `web/` at `/`)
- Regenerate data: `python scripts/import_data.py` (needs `ESBUILD_BIN`/`NODE_BIN`, see script header). Map geometry lives in `data_manual/maps_geometry/` (see `docs/map_geometry.md`).
- Deploy: `gcloud run deploy --source .` (uses `Dockerfile`, `.gcloudignore`); env vars `BQ_TABLE`, `GCS_BUCKET`, `RATE_LIMIT_ENABLED`.

## Conventions
- Engine is pure and deterministic (`apply(state, action) -> state`), no I/O; all randomness from a seeded RNG in the state.
- Seed = (known deck prefix from the log, tail_seed); see PROJECT_OUTLINE section 6.
- One replay "move" = one effect resolution / sub-decision = one engine action.
- Card/map data comes from https://github.com/Ender-Wiggin2019/Next-Ark-Nova-Cards, normalized by `scripts/import_data.py` into `src/ark_nova/data/` (needs node + esbuild, see the script header). Manual data (P133-P139, `_MW` variants in `data_manual/variants_mw.json`, map geometry) is documented in `docs/data_sources.md`; check with `scripts/check_data_coverage.py`.
- Golden tests: replay `log_examples/*.json` through parser + engine, final scores must match `finalScoring` (5 sample games were conceded and have none).
- Rate limiting: middleware hook exists but is disabled.

- JSON files use 4-space indentation.

## Gotchas
- Logs contain a public and a private version of draw events; use private for card ids.
- `log_examples/` is large (~400 MB); keep out of Docker images.
