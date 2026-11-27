# Removing the animal-enclosure link (owner, 2026-11-25)

Ark Nova has no link between an animal and an enclosure (said by the owner more than ten times). The code still had one; this branch
(`no-animal-enclosure-link`) removes it everywhere.

## Model
- Standard enclosure (`size-1` .. `size-5`): `Building.occupied: bool`. No card key.
- Special enclosure (petting zoo, reptile house, large bird aviary, small / large aquarium, underwater tunnel): `Building.cubes: int`, the cubes
  on its spaces. No card keys, no per-card counts.
- Animals are in the zoo (`PlayerState.animals`), not in an enclosure.
- Loading an old state (records, live tables, saved forks): `animal` -> `occupied = bool(animal)`; `cubes` as a dict -> its sum (plus the size of each
  listed animal that has no entry, as `cubes.used` did); `animals` is dropped.

## Rules from these two facts only
- Play an animal: a free standard enclosure of a size it fits (and its needs: rock / water / map rules), or free cube spaces in a special enclosure
  of a type it can live in (its special size). Aquariums share their spaces: an aquarium animal's cubes may be spread over several aquariums.
- Release: the player picks what gives up the animal's space. Special enclosures that hold at least the animal's special size in cubes and meet its
  needs come first (an aquarium animal: any aquarium meeting its rock need, possibly several for its cubes), else an occupied standard enclosure of a
  size it fits (the smallest that meets its needs first). The chosen one loses the cubes / becomes empty.
- Move into a new reptile house / aviary (bonus): cubes come off a special enclosure that holds enough, or an occupied standard enclosure becomes empty;
  the new building gets the cubes.
- Flock Animal (owner's ruling): playable without an enclosure when the zoo has a Herbivore animal whose CARD size is X or more. Herbivores rescued with
  the Rescue Station (map 10, `PlayerState.rescued`) count too (owner, 2026-11-25).
- Reef Dweller (owner's ruling): when an animal is placed in an aquarium, every Sea Animal card in the zoo with a Reef Dweller effect triggers.
  Not the animals rescued with the Rescue Station (map 10, `PlayerState.rescued`): their Reef Dweller effect never triggers (owner, 2026-11-25).
- Counts that read occupancy only (kiosk income next to occupied enclosures, size-1 enclosures for endgame cards, the enlarged enclosure's +2 appeal
  when occupied) read `occupied`.
- Replays: BGA's cube counts per named building (`totals`) set `cubes` directly; a standard enclosure BGA names as filled / emptied sets `occupied`.

## Touch points (from grep, 2026-11-25)
Engine: `state.py` (Building, load), `cubes.py` (rewrite: counts only), `animals_action.py` (hosts, room, place, `aquarium_animals`, `flock_free`,
`own_abilities` reef), `project_effects.py` (`release_enclosures`, `release_animal`, reef aquariums), `bonuses.py` (move-in source / target),
`animal_abilities.py` (empty standard enclosure check), `breaks.py` (kiosk income, occupied counts), `endgame.py` (size-1 occupied count),
`sponsor_extras.py` (enlarge: +2 appeal when occupied; reposition placeback).
Replay: `builder.py` (buyAnimal / releaseAnimal / moveAnimal: counts and occupied only), `view.py` (building view: `occupied`, `cubes` count),
`differential.py` (compares occupied / cube counts), `options.py`, `live/bgalog.py` (one appeal line).
Viewer: `board.js` (occupied marker, cubes drawn from a count), `card-motion-plan.js` (held = occupied / cubes > 0).
Then the same in ark-nova-ai's engine copy and the Rust port (`fastpath/arkcore`), checked by the oracle and the log tests.
