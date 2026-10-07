# Custom game rulesets: plan and open questions

Status: plan only, nothing is implemented. The questions at the end of each item (and the list at the bottom) have to be answered before the design of that item is final.

The rulesets are any combination of:

1. forced upgrades of a specific action card for the 1st (2nd, 3rd, 4th) upgrade, configured before the game;
2. excluding sets of cards by icon before the game;
3. action cards that cannot be upgraded during the game;
4. custom cards added to the decks;
5. custom action card variants;
6. a custom map / map layout;
7. randomized placement bonuses on an existing map (constraints: no clump of 3 or more adjacent bonuses, ...);
8. randomized rock / water hexes on an existing map (with constraints).

## Foundation (needed by everything)

Today the engine reads global, cached data (`data.cards_by_key()` is used in about 45 places, `board(map_id)` in about 28) and `GameConfig` carries no rules. The server is stateless, so a ruleset has to travel inside the state.

1. **`Ruleset`**: a JSON-serializable, validated block in `GameConfig`, with an id derived from a hash. Empty = the standard game. It extends the options of `game.new_game(options)` with a `rules: {...}` block.
2. **Catalog**: a per-ruleset view of the data (cards, boards, action variants), cached by ruleset id.
   - Recommended: `apply`, `legal_actions` and `start_game` set a context variable from `state.config.ruleset`; `data.cards_by_key()` and `board()` read it. No signature of the ~70 call sites changes, and everything defaults to the standard catalog.
   - Alternative: pass the state or the catalog explicitly everywhere. Cleaner, but a very large refactor.
3. **Safety net**: an empty ruleset must give byte-identical states and the differential test must stay at 0 problems. A linter checks every ruleset before the game starts (unknown icons, impossible combinations, a deck that is too small, forced and forbidden upgrades that contradict each other).
4. **Seeding**: every random step (layouts, variant picks) uses its own random stream derived from the seed, as `game._standard_action_cards` does, so the decks keep their order.

## Per item

### 1 and 3. Forced and disallowed upgrades

The cheapest items, and the same mechanism.

- `bonuses.upgradable(p)` is the single filter of every upgrade source (reputation track, conservation 2 choice, the "upgrade" bonuses, the map 11 worker). The harness, the UI texts and `_nothing_to_do` already go through it.
- `Ruleset.upgrades = {"forced": ["animals", null, "build"], "forbidden": ["cards"]}`. `forced` is indexed by "n-th upgrade of this player", null = free choice.
- `upgradable(p)` returns only the forced type for that index, minus the forbidden types. If nothing is left the effect is skipped, as it already is when nothing can be upgraded.
- The number of upgrades done so far is the count of level-2 cards.

Open questions:
- The reputation cap stays at 9 until the Cards action is upgraded (`bonuses.reputation_cap`). If Cards is forbidden the track stops at 9 for good. Is that intended, or should the cap lift another way?
- One forced list for both players, or one per seat?
- "Specific action card": the type (Animals, Build, ...) or a variant?

### 2. Exclude cards by icon

- It runs in `game.deck_cards(deck, mw)`, the single place that builds the three decks.
- A card matches by its tags (including the Marine Worlds variant tags and the rock / water requirement icons). Example: `exclude_icons: ["primate", "reptile"]`.
- The hard part is what depends on a removed icon: base, release and breeding projects, endgame cards that count the icon, sponsors that count it, category universities (the search finds nothing), Monkey Gang.

Open questions:
- Remove a card that has any excluded icon (recommended), or only cards with that icon as their main one?
- Drop the dependent projects, endgame cards and sponsors automatically, or list them by hand? A removed icon whose university tile is still on the board is a dead end.
- Which icons count: animal categories and continents only, or also science, rock and water?

### 4. Custom cards

- A card is a record in the schema of the data files (key, deck, tags, requirements, price, appeal, abilities). Animal abilities and sponsor "programs" are keyword compositions in `animal_abilities.py` and `card_programs.py`. A custom card can combine the existing effect primitives for free; a genuinely new effect needs engine code.
- Needed alongside: a key namespace (`A9xx` / `S9xx`) accepted by the BGA id pattern in `data/__init__.py`, validation, deck counts, card text and art for the viewer (`replay/view.card_catalog`).

Open questions:
- Data only (recombining existing effects), or also a plug-in point for new effect code?
- Can custom projects and endgame cards be added too?
- Where does the art come from, or does the viewer render a text-only card?

### 5. Custom action card variants

- Today the 20 variants (5 actions x variants 1-4) are `if card.variant == 3 and level >= 2:` branches spread over five modules, and `draft.py` hard-codes the pool of 20.
- Plan: first refactor the existing variants into a registry of small hooks (strength modifier, extra effect before / after the action, cost change). The differential test guards the refactor. Then a custom variant is a registry entry composed from those hooks; the draft pool and the card text become dynamic (`build5`, ...).
- The biggest item, and only safe after that refactor.

Open questions:
- Which kinds of custom variants do you have in mind? That decides which hooks to build.
- Level I and level II sides, like the existing ones?
- Is the draft pool the 20 plus the custom ones, or can a ruleset also remove standard variants?

### 6. Custom maps

- A map is the existing geometry schema (hexes with terrain, level-II flags, placement bonuses, notepad bonus slots, in `maps.json` format). A custom map goes into the ruleset, `board()` resolves it from the catalog, and `map_select.pool` can list it.
- Map abilities (tower, restaurants, ...) are code keyed by map id in `map_rules.py`. A custom map starts with no ability or uses one from a small registry. Everything else is data.
- A validator checks the grid (x + y odd, cell count, ...). The viewer has no background image for it, so it needs a plain hex rendering.

Open questions:
- Does a custom map need its own ability, or are plain maps enough at first?
- Are the 7 notepad slots part of a custom map?
- Is the viewer rendering in scope? (`web/` has been left alone so far.)

### 7 and 8. Randomized bonuses and terrain

The same generator and the same override mechanism.

- A layout is generated from the seed and stored in the state as an override on top of the base map; `board()` is keyed by (map, layout id).
- Bonuses (7): reposition the existing bonuses, or draw new ones from a pool. Constraints are checkable by rejection sampling, e.g. no connected group of 3 bonus hexes. Map-bound bonuses (the kiosk hexes of maps 7 / 7a, the Worker and store hexes of map 11) probably stay fixed.
- Terrain (8): keep the counts of rock and water, keep the playable cells and the upgrade flags, and do not block what the map rules need (aquariums need water, the tunnel needs 2 water cells).
- Property tests: for every map and many seeds all constraints hold.

Open questions:
- When both players share a map (`random-mirrored`), the same layout for both? (Assumed yes, for fairness.)
- Bonuses: shuffle only the bonuses of the map, or draw from the full set of placement bonuses? Terrain: keep the totals, or free counts within limits?
- Constraints besides "no clump of 3": a minimum distance to the border or between rock / water cells? What clump size for terrain?
- Can a bonus sit on a rock or water hex?

## Order of work

1. Foundation (the empty ruleset changes nothing).
2. Upgrade rules (items 1 and 3).
3. Card exclusion (item 2).
4. Layout override, random bonuses and terrain (items 7 and 8).
5. Custom maps (item 6), on the same override.
6. Custom cards (item 4).
7. The variant registry refactor, then custom variants (item 5).

Each step ships with unit tests, and the differential stays at 0 problems.

## Questions to answer first

1. Context-variable catalog (recommended) or explicit passing?
2. Forced upgrade: the Cards reputation cap, one list or one per seat, action type or variant?
3. Exclusion: any icon or main icon, how to handle dependent cards, which icons count?
4. Custom cards: data only or new effect code, and which decks?
5. Custom variants: examples of what you want, and whether they have two levels.
6. Custom maps: do they need an ability and notepad slots, and is the viewer rendering in scope?
7. Randomization: mirrored layouts, bonus and terrain sources, extra constraints.
