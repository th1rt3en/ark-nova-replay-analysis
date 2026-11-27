"""The cubes on the spaces of the special enclosures (petting zoo, reptile house, large bird aviary, the aquariums and the underwater tunnel).

Ark Nova has no link between an animal and an enclosure (owner, 2026-11-25; docs/no_animal_enclosure_link.md): a special enclosure holds a NUMBER of cubes
(`Building.cubes`), nothing else. An animal played into a special enclosure covers as many spaces as its special enclosure size says (Aquarium 2 = 2 cubes,
Aquarium 0 = none). The aquariums of a zoo share their spaces: an aquarium animal's cubes may be spread over several aquariums (African Penguin 853899676
move 465: 1 + 1).

BGA's log gives the number of cubes of every building it names (`state` of the building in buyAnimal, releaseAnimal, moveAnimal: the count after the event).
The replay passes those counts as `totals` ([[x, y, count], ...]) and they are set as they are. Without them (fork, sandbox, live play) the chosen enclosure
is filled first and, for an aquarium animal, the rest goes into the other aquariums of the zoo in the order they were built; leaving cubes come off the
chosen enclosure first and, for an aquarium animal, off the other aquariums for the rest.
"""

AQUARIUMS = ("small-aquarium", "large-aquarium", "underwater-tunnel")
CAPACITY = {"petting-zoo": 3, "reptile-house": 5, "large-bird-aviary": 5, "small-aquarium": 2, "large-aquarium": 5, "underwater-tunnel": 2}
GROUP = {"Aquarium": AQUARIUMS, "Reptile House": ("reptile-house",), "Large Bird Aviary": ("large-bird-aviary",), "Petting Zoo": ("petting-zoo",)}


def _card(key: str) -> dict:
    from ark_nova import data
    return data.cards_by_key().get(key) or {}


def size_of(key: str) -> int:
    """The cubes an animal takes in a special enclosure (the largest of its special enclosure sizes; 1 without any)."""
    return max((s["size"] for s in _card(key).get("specialEnclosures") or []), default=1)


def spec_size(key: str, btype: str) -> int:
    """The cubes the animal takes in a special enclosure of this type (0 if it cannot live there)."""
    for s in _card(key).get("specialEnclosures") or []:
        if btype in GROUP.get(s["type"], ()):
            return int(s["size"])
    return 0


def is_aquarium_animal(key: str) -> bool:
    return any(s["type"] == "Aquarium" for s in _card(key).get("specialEnclosures") or [])


def _at(p, x, y):
    return next((b for b in p.buildings if (b.x, b.y) == (x, y)), None)


def used(p, b, exclude=None) -> int:
    """The cubes on `b` (`p` and `exclude` are kept for the callers; cubes belong to no animal)."""
    return 0 if b.type.startswith("size-") else int(b.cubes)


def free(b) -> int:
    return max(0, CAPACITY.get(b.type, 0) - int(b.cubes))


def set_totals(p, totals) -> None:
    """The log's counts: every named special enclosure holds what BGA shows."""
    for x, y, total in totals or []:
        q = _at(p, x, y)
        if q is not None and not q.type.startswith("size-"):
            q.cubes = int(total)


def put(p, b, n: int, aquarium: bool) -> None:
    """`n` cubes go onto the special enclosure `b`; an aquarium animal's that do not fit go onto the other aquariums (in the order they were built); any
    still left stay on `b` (more cubes than free spaces, as an old state may have)."""
    order = [b] + ([q for q in p.buildings if q is not b and q.type in AQUARIUMS] if aquarium and b.type in AQUARIUMS else [])
    for q in order:
        if n <= 0:
            break
        k = min(n, free(q))
        q.cubes += k
        n -= k
    if n > 0:
        b.cubes += n


def take(p, b, n: int, aquarium: bool = False) -> int:
    """`n` cubes leave: from `b` first, then (an aquarium animal) from the other aquariums. Returns how many came off."""
    order = [b] + ([q for q in p.buildings if q is not b and q.type in AQUARIUMS] if aquarium and b.type in AQUARIUMS else [])
    done = 0
    for q in order:
        k = min(n - done, int(q.cubes))
        q.cubes -= k
        done += k
        if done >= n:
            break
    return done


def place(p, b, key: str, totals=None) -> None:
    """The animal `key` has just been played into the special enclosure `b`: its cubes go down (the log's counts when given)."""
    if b is None or b.type.startswith("size-"):
        return
    if totals:
        set_totals(p, totals)
        return
    put(p, b, spec_size(key, b.type) or size_of(key), is_aquarium_animal(key))


def release(p, key: str, totals=None, b=None) -> None:
    """The animal `key` leaves the zoo: the log's counts when given, else its cubes come off the special enclosure the player chose (`b`; none: nothing
    to take, the animal was in a standard enclosure)."""
    if totals:
        set_totals(p, totals)
        return
    if b is not None and not b.type.startswith("size-"):
        take(p, b, spec_size(key, b.type) or size_of(key), is_aquarium_animal(key))


def move(p, key: str, src, dest, totals=None) -> None:
    """The animal `key` moves into the new special enclosure `dest` (Bonus: move into a new reptile house / aviary): the cubes come off the special
    enclosure `src` (a standard source: its `occupied` is the caller's), onto `dest`; the log's counts when given."""
    if totals:
        set_totals(p, totals)
        return
    if src is not None and not src.type.startswith("size-"):
        take(p, src, spec_size(key, src.type) or size_of(key), is_aquarium_animal(key))
    if dest is not None and not dest.type.startswith("size-"):
        put(p, dest, spec_size(key, dest.type) or size_of(key), False)


def view(p, b) -> int:
    """The cubes of a building for the viewer (a count)."""
    return used(p, b)
