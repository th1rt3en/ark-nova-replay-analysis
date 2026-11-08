# Board Design Workshop maps (BDW1 - BDW4)

Four fan-made zoo maps, played in a game that asks for them (the option "Include BDW map pack": `GameConfig.bdw_maps`, `bdw_maps` in `POST /api/games`, `POST /api/sandbox/new` and the lobby settings (`live/lobbies.py`, `cloudflare/src/lobbies.ts`); the maps then join the
pool of the map selection of the modes original / random-mirrored / free-select / Ark360 (a layout of random bonus places), and the sandbox list; not in the custom-map mode, where the host's map is played). They are not in `maps()` (so no replay, test or coverage script ever meets them) but in
`src/ark_nova/data/bdw_maps.json`, which `data.map_by_id` reads after `maps()`.

| id | name | ability |
|---|---|---|
| BDW1 | Management Zoo | each time the count of a species icon (Bird, Predator, Herbivore, Bear, Reptile, Pet, Primate, Sea Animal) reaches 2 (animal, sponsor, species university): 5 money, Snapping or Marketing |
| BDW2 | Construction Yard | a building may also touch the crane; when an enclosure next to the crane is flipped to its occupied side the player may reposition it |
| BDW3 | Enigma Isle | anything may be built on water and rock for 1 money per space; income: 1 money per pair of connected water and rock spaces; map fill gives 5 appeal |
| BDW4 | Vast Valley | an animal placed in an oversized standard enclosure costs 5 less; the blue notepad space: standard enclosures on the border hold one more |

## Source and parsing
The artwork is in `bdw_maps/` (12083 x 6378 PNG, not in the repository). It is the same board layout as the vendor scans of `docs/map_geometry.md` at 3 times the size: hex (x, y) is at
(713.6 + 204.9 x, 235 + 118 y) of the picture scaled to 4038 x 2130. Rock / water were classified from the hex colours and checked on the overlays; the placement bonuses, flags, notepad spaces and
association spaces were read off the picture. `scripts/build_bdw_maps.py` holds the tables (it writes `bdw_maps.json`); `scripts/build_bdw_images.py` cuts `web/maps/map-BDW<n>.jpg` (1122 x 976, like the BGA
pictures) and paints the printed icons out (the viewer draws them).

The record of a map is the one of a map made in the map editor: `geometry` (hexes, `placement_bonuses`, `special_hexes` = `upgrade_flag` + `crane`, `bonus_slots`) and `association` (the bonuses of the worker /
partner zoo / university spaces; `data.has_association_record`), plus `full_map_appeal`. Placement bonuses of the four maps: take-in-range-or-deck, money 1 / 5 / 6, Clever, xtoken, reputation, bonus-sponsor
(Marketing), kiosk and pavilion (a free building: `game.apply_placement_bonus`). Notepad spaces (index 0-6): Snapping, size-2, money 5 (income), then a fourth space that differs, Worker, money 12, 3 X tokens;
BDW1: `project-support` (not playable yet: `association.NOT_PLAYABLE_SPACES` hides the space), BDW2: `size-5` (a free size 5 enclosure), BDW3: `bonus-kiosk-pavilion` 3, BDW4: no fourth space, but a last blue
one, `border-capacity` (passive: `map_rules.border_capacity`).

## Rules (the code)
- BDW1: `map_rules.species_effects` is called by `effects.fire_icon_counter` (every icon that enters the zoo goes through it): one effect `species_bonus` (`bonuses.py`) per species whose count goes from < 2 to >= 2.
- BDW2: `map_rules.crane_hex` (the rock hex of the crane; the ability stops when a building covers it), `crane_adjacent`, the build rule `crane` (`build_action.valid_placements`: a building may be built next to the crane at any time, the first one too), the effect `crane_move` (`map_rules.crane_targets`, `game.reposition_building`: any rotation, no adjacency needed, the animal's water / rock requirements, spaces with an upgrade flag need the
  upgraded Build action; only the spaces it was not on pay placement bonuses and count for Hydrologist / Geologist / Archeologist). The map fill bonus is paid once (`PlayerState.flags["full_map_paid"]`).
- BDW3: `map_rules.terrain_fee` is charged in `game._put_building` (every building, a free one too; the Diversity Researcher and the underwater tunnel pay nothing; a Reconstruction placeback pays), the rule
  `terrain_ok` lets every build go on water / rock, Water / Rock Build: level I adds nothing, level II one space free and 2 money; income in `breaks.map_ability_income` (`map_rules.terrain_pairs`).
- BDW4: `animals_action.oversize_discount` / `price_in` / `effective_size` (the border space of the blue notepad space is part of the capacity).

## Confirmed by the maker / the user
- "Oversized" (BDW4) = a standard enclosure larger than the size the animal needs (its capacity counts, with the border +1).
- A "pair of connected water and rock spaces" (BDW3) = one water and one rock space that no building covers but one touches; the income is the smaller of the two counts.
- BDW1's fourth notepad space (`project-support`): an Assertion that puts the chosen unused base project straight onto the board like a played one (`association.put_in_play`, the effect `assertion` with `play`): no cube
  of the player's is on it, both players may support it.
- The crane (BDW2) is a place to build next to for every building, the first too. Repositioning onto an upgrade-flag space needs the upgraded Build action. (6,7) of BDW3 is rock, with an X token bonus.

## Still assumed
- Species icons (BDW1) are the animal categories; a continent, research, rock or water icon is not a species.
- The full map bonus counts the plain spaces only on every map (also BDW3, where water / rock may be covered).
