"""Mini games (docs/accounts_plan.md, "Mini games and puzzles"): small daily games played on real finished tables.

`platform/` is the shared part (contract, manifest, stores, daily rollover, scoring, leaderboards); every game lives in its own sub-package
(`daily_hand/`, `whos_ahead/`, ...) and is known to the platform only through the manifest `src/ark_nova/minigames/manifest.json`. A game never imports another game.
"""
