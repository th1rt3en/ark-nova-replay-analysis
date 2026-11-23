"""The cubes on the spaces of the special enclosures (petting zoo, reptile house, large bird aviary, the aquariums and the underwater tunnel).

An animal in a special enclosure covers as many spaces with cubes as its special enclosure size says (Aquarium 2 = 2 cubes, Aquarium 0 = none). The aquariums
of a zoo share their spaces, so the cubes of one aquarium animal can lie in several aquariums (African Penguin 853899676 move 465: 1 + 1). `Building.cubes`
keeps them per animal ({card key: cubes in this building}); the animal itself lives in one building (`Building.animals`, the first aquarium BGA names).

BGA's log gives the number of cubes of every building it names (`state` of the building in buyAnimal, releaseAnimal, moveAnimal: the count after the event,
checked on every special enclosure of the 14 sample logs). The replay passes those counts as `totals` ([[x, y, count], ...]), so the cubes are the ones BGA
shows; without them (fork, sandbox, live play) the chosen aquarium is filled first and the rest goes into the other aquariums of the zoo, in the order they
were built. Cubes change nothing in the rules: the spaces of the aquariums are counted together anyway (`animals_action.hosts`).
"""
from typing import Optional

AQUARIUMS = ("small-aquarium", "large-aquarium", "underwater-tunnel")
CAPACITY = {"petting-zoo": 3, "reptile-house": 5, "large-bird-aviary": 5, "small-aquarium": 2, "large-aquarium": 5, "underwater-tunnel": 2}


def _card(key: str) -> dict:
    from ark_nova import data
    return data.cards_by_key().get(key) or {}


def size_of(key: str) -> int:
    """The cubes an animal takes in a special enclosure (the largest of its special enclosure sizes; 1 without any)."""
    return max((s["size"] for s in _card(key).get("specialEnclosures") or []), default=1)


def _at(p, x, y):
    return next((b for b in p.buildings if (b.x, b.y) == (x, y)), None)


def _placed(p, key: str) -> bool:
    return any(key in b.cubes for b in p.buildings)


def used(p, b, exclude: Optional[str] = None) -> int:
    """The cubes on `b`: the recorded ones, and for an animal of a state made before the cubes were recorded (no entry anywhere) the size of the animal."""
    return sum(n for k, n in b.cubes.items() if k != exclude) + sum(size_of(k) for k in b.animals if k != exclude and not _placed(p, k))


def place(p, b, key: str, totals=None) -> None:
    """The animal `key` has just moved into the special enclosure `b` (it is in `b.animals`): put its cubes down. `totals` ([[x, y, count], ...], from the log):
    the counts of the buildings after the move, so each one gets the difference; else `b` first, then the other aquariums of the zoo while the animal has cubes left."""
    if b is None or b.type.startswith("size-"):
        return
    if totals:
        for x, y, total in totals:
            q = _at(p, x, y)
            if q is None or q.type.startswith("size-"):
                continue
            share = int(total) - used(p, q, exclude=key)
            if share > 0:
                q.cubes[key] = q.cubes.get(key, 0) + share
        b.cubes.setdefault(key, 0)
        return
    left = size_of(key)
    pool = b.type in AQUARIUMS and any(s["type"] == "Aquarium" for s in _card(key).get("specialEnclosures") or [])
    order = [b] + ([q for q in p.buildings if q is not b and q.type in AQUARIUMS] if pool else [])
    b.cubes.setdefault(key, 0)
    for q in order:
        if not left:
            break
        take = min(left, max(0, CAPACITY.get(q.type, 0) - used(p, q, exclude=key))) if pool else left
        if take:
            q.cubes[key] = q.cubes.get(key, 0) + take
            left -= take
    if left:                                                  # (more cubes than free spaces: they stay with the animal)
        b.cubes[key] += left


def drop(p, key: str) -> dict:
    """The animal `key` leaves its special enclosure(s): its cubes are taken off. Returns {building index: cubes taken off}."""
    out = {}
    for i, b in enumerate(p.buildings):
        n = b.cubes.pop(key, None)
        if n:
            out[i] = n
    return out


def sync(p, totals, freed: dict) -> None:
    """After an animal left (`freed`: what `drop` returned), the log says how many cubes the buildings it names hold now (`totals`). BGA's cubes belong to no
    animal: when it freed spaces in a named building that held none of the animal's cubes, the cubes of other animals there move to the building the animal
    had its cubes in (that one keeps its count in BGA), so every building holds what BGA shows."""
    listed = [(_at(p, x, y), int(total)) for x, y, total in totals or []]
    listed = [(q, t) for q, t in listed if q is not None and not q.type.startswith("size-")]
    named = {p.buildings.index(q) for q, _ in listed}
    for q, total in listed:
        i = p.buildings.index(q)
        extra = used(p, q) - total
        for j, n in list(freed.items()):
            if extra <= 0:
                break
            if j in named or j == i:
                continue
            d = p.buildings[j]
            while extra > 0 and n > 0:
                k = max((k for k, c in q.cubes.items() if c > 0), key=lambda k: q.cubes[k], default=None)
                if k is None:
                    break
                q.cubes[k] -= 1
                if not q.cubes[k] and k not in q.animals:
                    del q.cubes[k]
                d.cubes[k] = d.cubes.get(k, 0) + 1
                extra, n = extra - 1, n - 1
            freed[j] = n


GROUP = {"Aquarium": AQUARIUMS, "Reptile House": ("reptile-house",), "Large Bird Aviary": ("large-bird-aviary",), "Petting Zoo": ("petting-zoo",)}


def spec_size(key: str, btype: str) -> int:
    """The cubes the animal takes in a special enclosure of this type (0 if it cannot live there)."""
    for s in _card(key).get("specialEnclosures") or []:
        if btype in GROUP.get(s["type"], ()):
            return int(s["size"])
    return 0


def take(p, b, n: int) -> int:
    """Remove n cubes from building `b` (cubes belong to no animal: the per-card records there shrink, the largest first). Returns how many were removed."""
    done = 0
    while done < n:
        k = max((k for k, c in b.cubes.items() if c > 0), key=lambda k: b.cubes[k], default=None)
        if k is None:
            break
        b.cubes[k] -= 1
        if not b.cubes[k] and k not in b.animals:
            del b.cubes[k]
        done += 1
    return done


def _shift(src, q) -> bool:
    """Move one cube (a real per-card record, the largest) from building `src` to building `q`."""
    k = max((k for k, c in src.cubes.items() if c > 0), key=lambda k: src.cubes[k], default=None)
    if k is None:
        return False
    src.cubes[k] -= 1
    if not src.cubes[k] and k not in src.animals:
        del src.cubes[k]
    q.cubes[k] = q.cubes.get(k, 0) + 1
    return True


def _off(p, key: str, src, need: int) -> None:
    """Exactly `need` cubes leave `src`; every other building keeps its count. Cubes belong to no animal: the card's own records are dropped, and a building
    that held some of them is refilled from `src`."""
    before = {i: used(p, q) for i, q in enumerate(p.buildings)}
    isrc = p.buildings.index(src)
    freed = drop(p, key)
    target = before[isrc] - need
    for j in freed:
        if j == isrc:
            continue
        q = p.buildings[j]
        while used(p, q) < before[j] and used(p, src) > target and _shift(src, q):
            pass
    if used(p, src) > target:
        take(p, src, used(p, src) - target)


def release_from(p, key: str, b) -> None:
    """Live rules (no log counts, 2026-11-22): releasing an animal takes its cubes off the special enclosure the player chose (`b`, which must hold them: special
    enclosures come first, an aquarium animal's aquarium is the player's choice among those that meet its rock need). Seed 210000579: an African Penguin
    released from a Large Aquarium holding 5 cubes recorded for other cards took nothing off before this."""
    _off(p, key, b, spec_size(key, b.type) or size_of(key))


def move_from(p, key: str, src, dest) -> None:
    """Live rules (no log counts): moving an animal into a new special enclosure takes its cubes off `src` (a special enclosure) and puts them on `dest`."""
    _off(p, key, src, spec_size(key, src.type) or size_of(key))
    place(p, dest, key)


def move(p, key: str, dest, totals=None) -> None:
    """The animal `key` moves from its special enclosure(s) into `dest` (Bonus: move into a new reptile house / aviary)."""
    freed = drop(p, key)
    named = [t for t in totals or [] if dest is not None and (t[0], t[1]) == (dest.x, dest.y)]
    sync(p, [t for t in totals or [] if t not in named], freed)
    if dest is not None and not dest.type.startswith("size-"):
        place(p, dest, key, named or None)


def release(p, key: str, totals=None) -> None:
    """The animal `key` leaves the zoo."""
    sync(p, totals, drop(p, key))


def view(p, b) -> list:
    """[[card key, cubes], ...] of a building for the viewer (an animal of an old state without recorded cubes: its size, never more than the free spaces)."""
    if b.type.startswith("size-"):
        return []
    out = [[k, n] for k, n in b.cubes.items() if n > 0]
    left = CAPACITY.get(b.type, len(out)) - sum(n for _, n in out)
    for k in b.animals:
        if not _placed(p, k):
            n = min(size_of(k), max(0, left))
            if n:
                out.append([k, n])
                left -= n
    return out
