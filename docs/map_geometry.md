# Map geometry: coordinates and how to fill in `data_manual/maps_geometry/<id>.json`

## Coordinate system (matches the BGA logs, so parsed buildings need no conversion)
Derived from all 839 `buyBuilding` placements in `log_examples/`: `x` is in 0..8, `y` in 0..12, and **`x + y` is always odd**; exactly 58 distinct cells occur, which is every cell of the board.

- Hexes are **flat-top**. `x` = column (0 = leftmost, 8 = rightmost), `y` = "doubled" row (each step down the screen by half a hex is +1; a full hex is +2).
- A cell exists iff `x + y` is odd:
  - even `x` (0, 2, 4, 6, 8): `y` = 1, 3, 5, 7, 9, 11 (6 cells, column sits half a hex lower)
  - odd `x` (1, 3, 5, 7): `y` = 0, 2, 4, 6, 8, 10, 12 (7 cells)
  - 5 x 6 + 4 x 7 = 58 cells.
- Neighbours of (x, y): (x, y-2), (x, y+2), (x-1, y-1), (x-1, y+1), (x+1, y-1), (x+1, y+1).
- Buildings in the logs are stored as an anchor `x, y` + `rotation` 0-5; footprints will be derived from the logs later. You do not need them for the map files.

## Overlays for every map
`docs/images/maps/overlay_<id>.jpg` (25 files: `1`..`14`, `1a`..`8a`, `T1`, plus the beginner boards `0` and `a`) show every cell labelled `x,y` over the board scan from the vendored upstream repo (`vendor/Next-Ark-Nova-Cards/public/img/maps/plan*.jpg`, 4038x2130 full player-board scans). The grid position is identical on all boards (checked on 1, 1a, 5, 8a, 13, T1). Regenerate with `python scripts/render_all_map_overlays.py`; `scripts/render_map_overlay.py` does one image (also accepts a screenshot such as the original map-1 crop via `--preset screenshot`, `docs/images/map1_overlay.png`).

Some maps have icons outside the 58 cells (e.g. map 13 has icons on the left edge and above the top row): give them coordinates as if the grid were extended, including negative values, with `"off_board": true`.

## Workflow
1. `python scripts/make_map_templates.py` already created a template per map (`1`..`14`, `1a`..`8a`, `T1`; existing files are never overwritten).
2. Edit `data_manual/maps_geometry/<id>.json` (4-space indent) using the overlay for that map.
3. Set `"verified": true`. `python scripts/import_data.py` copies verified files into `maps.json` under `geometry`; unverified maps stay `null`.

## File format
```json
{
    "map_id": "1",
    "verified": false,
    "hexes": [{"x": 0, "y": 1, "terrain": "plain"}, "... 58 entries, pre-generated ..."],
    "placement_bonuses": [{"x": 0, "y": 1, "bonus": {"type": "xtoken", "value": 1}}],
    "special_hexes": [{"x": 1, "y": 6, "kind": "observation_tower", "off_board": false, "note": ""}],
    "bonus_slots": [{"index": 0, "kind": "instant_income", "bonus": {"type": "card", "value": 1}, "note": ""}, "... 7 entries ..."],
    "map_rules": ["Gain 2 appeal every time you flip a standard enclosure ... next to the Observation Tower."]
}
```
- **`hexes[].terrain`**: `plain` (default), `rock` (rock formation) or `water` (pond). Only change the ones that are not plain.
- **`placement_bonuses`**: the yellow pentagon icons printed on hexes, given when a building covers that hex (BGA source label "placement bonus"). One entry per icon: the hex coordinates + `bonus`.
- **`special_hexes`**: everything else printed on the map that a map rule refers to (tower, harbor, the red "II" upgrade flags, ...). `kind` is a free identifier (`observation_tower`, `commercial_harbor`, `upgrade_flag`...); set `"off_board": true` and use the coordinates the hex would have if the grid were extended (e.g. the commercial harbor of map 4 is at (-1, 12)). Use `note` for anything unclear. The engine implements the behaviour per map id in code, so these entries only need to say *where* things are and *what they are*.
- **`bonus_slots`**: the 7 bonus spaces in the panel on the left of the board, **top to bottom, index 0..6**. In the logs each player starts with tokens `bonus_0`..`bonus_6` (from `setupPlayer.meeples`) and gains them as "map bonus space" bonuses, so the order/index must match the picture. There are always 7 in total, but the split between the upper and lower panel differs per map (map 1: 4 + 3, map T1: 3 + 4); count top to bottom across both panels. Each slot has a **`kind`** given by its colour:
  - `"instant_income"`: purple slot, the bonus is gained immediately **and** again as income (each break).
  - `"instant"`: yellow slot, the bonus is gained immediately only.
  In practice the purple slots are the upper ones and the yellow slots the lower ones. Use `bonus: null` and a `note` if a slot has a condition (the lightning/hand icons next to the panel).
- **`map_rules`**: the map's printed ability text (already in `maps.json` `description`; only add here if you want a cleaned-up version).

### Bonus vocabulary
`{"type": ..., "value": n}`. Types used so far (log names where they exist): `money`, `appeal`, `reputation`, `conservation`, `xtoken`, `take-in-range-or-deck` (take a card from the deck or reputation range), `Snapping`, `size-2` (free size-2 enclosure), `special-enclosure`, `kiosk`, `Worker`, `Clever`, `Digging`, `Determination`, `Pouch`, `Mark`, `Scavenging`, `Fac`, `Multiplier` (x2 icon), `Partner-Zoo`, `bonus-sponsor`, `bonus-scoring-cards`, `sponsor-person-card`, `upgrade-card`, `store`, `conceal`, `wave`, `shark-attack`, `adapt`, `animal-magnet`, `cut-down`, `continent`. `"bonus": null` = an icon that has not been identified yet (see `note`). Several bonuses on one hex: repeat the entry with the same x, y.

Optional extra keys: `note` on any `placement_bonuses` / `special_hexes` / `bonus_slots` entry, and `bonus` on `special_hexes` entries that carry a bonus themselves (map 13 area bonuses).

Special hex kinds used: `observation_tower`, `upgrade_flag` (red flag with shovel + II: needs the upgraded Build action), `gate`, `restaurant`, `commercial_harbor`, `research_institute` (off-board at (-1, 12)), `hollywood_h`, `continent_area` / `continent_marker` (map 9), `digging_card_slot` (map 10), `area_bonus` / `map_center` (map 13).

## Worked reading of the attached image (map 1, Observation Tower): the first reading, now superseded by `data_manual/maps_geometry/1.json` (verified)
The file agrees on rock, water, pentagons, flags and the tower at (1,6); it has no second tower off-board, and its left panel is Snapping, size-2, money 5, bonus-sponsor (indices 0-3, income) then Worker, money 12, 3 X tokens (4-6).
Rock: (1,0), (2,1), (3,0) top cluster; (0,5), (1,6) with the tower, (0,7), (0,9) left cluster (the 4 rock spaces of the tower rule); (3,10), (3,12).
Water: (4,5), (5,6), (6,7), (7,6), (8,5), (8,7), (5,12).
Yellow pentagons at: (0,1), (4,1), (7,2), (6,5), (3,6), (7,8), (0,11), (4,11), (7,12).
Red "II" flags at: (3,4), (4,7), (5,8). Tower at (1,6) and a second tower off-board at about (2,13).
Left panel, top to bottom: folder-card icon, "2 hexes", "5", "X + @" (upper panel, indices 0-3); worker-plus, "12", "3 X" (lower panel, indices 4-6).

## Beginner maps 0 and A (read off the board scans `overlay_0.jpg`, `overlay_a.jpg`)
- Terrain was classified from the BGA board images (`web/maps/map-0.jpg`, `map-A.jpg`: the pixels of every hex centre at (96 + 115 x, 88 + 66.5 y)), which reproduces the known maps exactly. Placement bonuses, upgrade flags and the notepad panel (slots: Snapping 1, size-2, money 5, conservation 1 (income slots), Worker, money 12, 3 X tokens) were read off the overlays; bonus values seen in the logs of the tables played on map A (money 5 / 10, 1 X token, reputation 2, conservation 1) confirm them. The upgrade flags are the two cells at the lower right of A ((8,11), (7,12)) and (7,4), (6,5) of map 0.
- `start_buildings` (map A): an idle 3-space enclosure (anchor (0,9), rotation 0) and a kiosk ((0,7)) for each player; BGA numbers them 1, 2 (first player) and 3, 4 (second). The enclosure is confirmed by the logs (id 1 / 3 at (0,9)), the kiosk position is read off the board marker.
- Map A is verified by four logs (653431606, 801090816, 817617353, 837366183), **map 0 by one** (833897527: its first-building lists fingerprint as map 0 and it replays without a problem). Map 0 has no starting building. The placement Worker hex of A hires a new worker; on map 11 it takes one back from the board.
- **BGA labelled T1 as "Map 0" in some tables** (792169867, 792633294: the log's first-building lists match the T1 layout exactly, and they replay as T1 including its discard-for-strength ability). `data_manual/map_label_fixes.json` lists such tables by log evidence; the complete list is to be supplied. `python scripts/find_mislabeled_maps.py [out.json]` finds them: it compares the index label of every player with `config.infer_maps` (maps whose first-building list is not the border, like map A with its starting buildings, cannot be fingerprinted).
- Association bonuses (user-confirmed): maps 0 and A give 2 conservation for the 4th partner zoo, the 3rd university and the 3rd (last) worker (`data/association_bonuses.json`, verified).
