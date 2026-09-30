# Data sources

## Upstream: Next-Ark-Nova-Cards
https://github.com/Ender-Wiggin2019/Next-Ark-Nova-Cards, cloned (shallow) into `vendor/Next-Ark-Nova-Cards/` (not committed). **License: the repo has no LICENSE file; its About page says images/text belong to Capstone Games. TODO: confirm terms with the maintainer before publishing the data or the site.**

Data is TypeScript (`src/data/*.ts`). `python scripts/import_data.py` bundles it with esbuild (`scripts/ts_extract/`, zod stubbed) and runs it under node, writing normalized JSON to `src/ark_nova/data/`:
`animals.json` (161), `sponsors.json` (82), `projects.json` (32), `endgames.json` (17), `project_bonuses.json`, `maps.json` (25). Env: `ESBUILD_BIN`, `NODE_BIN`. Locale strings for effect text are resolved from `public/locales/en/common.json` (`text` fields).

Each card has `key` = letter + 3-digit number (`A414`, `S231`, `P127`, `F003`). This matches the letter+number part of BGA log ids (`A414_SouthAmericanCoati`), which is the join key; the name part is unreliable (upstream `cardNames` covers only some cards). Card `source` is `base`, `marine_worlds` or `promo`.

## Coverage vs the 29 sample logs (`python scripts/check_data_coverage.py`)
296 distinct card keys are seen in logs. Gaps in upstream:

1. **Missing Marine Worlds conservation projects: P133-P139** (Sea Animals + the six "Management Plan" projects). `data_manual/projects_mw.json` holds skeleton entries (id, name, tag); slots, place bonuses and description are to be filled in manually (`"verified": false` until done). `import_data.py` merges the file into `projects.json`.
2. **Marine Worlds reprint variants** (`_MW` ids in logs): final scoring cards via `scoring` (see below); P131 and S250 via `data_manual/variants_mw.json`. Every card can carry `variants.marine_worlds` = field overrides applied over the base card when Marine Worlds is enabled: P131 Large Animals needs 3/2/1 large animals for 4/3/2 conservation (base: 4/3/2 icons for 4/3/2); S250 Sea Turtle Tank gets water 2 and tags reptile + seaAnimal, rest unchanged. The same file's `patches` fix upstream bugs (P131 upstream wrongly uses `bonusRequirement: water`; corrected to `animal-size-4`).
3. **Map geometry is missing.** Upstream only has map names, ability text and an image (`public/img/maps/plan*.jpg`). Tile layout, bonus spaces, starting placements and building-space adjacency need to come from elsewhere (BGA's game assets / hand encoding from the images). `maps.json` has `geometry: null` until filled in by hand: see `docs/map_geometry.md` (BGA coordinate system, per-map templates in `data_manual/maps_geometry/`). Map ids: `1`-`14`, `1a`-`8a`, `T1`, plus beginner boards `0` and `A` (flagged `beginner`, not BGA-selectable).
4. Text has some mojibake from upstream (e.g. "someone�s"); cosmetic only.
5. Card effects are text + keyword enums, not executable rules. Engine ability implementations are still all to be written; use `text` as spec.
6. Prehistoric expansion data upstream (`src/data/prehistoric`) is ignored.

## Manual Marine Worlds projects: bonus schema (data_manual/projects_mw.json)
Upstream bonuses only know `Conservation Point` and `Reputation` with a fixed `bonusValue` (+ optional `bonusRequirement`). The Management Plans (P134-P139) need more, so the manual file extends it (engine code must implement these):

- `{"bonusType": "Conservation Point", "bonusValue": 2}` and `{"bonusType": "Reputation", "bonusValue": 1}`: as upstream.
- `per`: scales any bonus: `{"tag": "science", "every": 2}` = value per every 2 icons of that tag (e.g. 1 reputation per 2 science icons).
- `{"bonusType": "Keyword", "keyword": "hunter", "per": {"tag": "predator", "every": 1}}`: triggers a card keyword ability. `bonusValue` is the keyword's number where it has one (posturing 1, sunbathing 2, digging 2); `clever` has none; `hunter` uses X = number of predator icons via `per`.
- `{"bonusType": "Tutor", "tag": "predator"}`: tutor an icon of that tag.
- `{"bonusType": "Activate Reef"}`: activate all reef abilities.
- `placeBonuses`: the "first time" bonus (given when the project is first placed). Upstream leaves it empty everywhere; the plans use it.
- `requirement`: `{"tag", "count"}` = icons needed (top of card); sea animals use tag `seaAnimal`.
- Type `Management` is new (`ProjectCategory` upstream has none).
P133 (Sea Animals) follows the base icon-count projects: indicators 5/4/2 giving 5/4/2 conservation.

## Final scoring cards: base vs Marine Worlds
Upstream already stores both versions: `scoreArray` = Marine Worlds scoring, `originalArray` = base-game scoring (present for F001, F003, F005, F008, F010, F011; verified against the values supplied by the user). `import_data.py` exposes them as `endgames.json` -> `scoring: {"base": [...], "marine_worlds": [...]}`. The engine must pick `scoring["marine_worlds"]` only if the game has Marine Worlds enabled (BigQuery `marine_worlds` flag), otherwise `scoring["base"]`. Log ids with the `_MW` suffix (e.g. `F001_LargeAnimalZoo_MW`) map to the same key with the `marine_worlds` variant. Cards F012-F017 are Marine Worlds-only.
