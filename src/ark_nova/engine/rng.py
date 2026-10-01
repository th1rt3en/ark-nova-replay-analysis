"""Deterministic, serializable PRNG and deck construction.

The engine never uses `random`: all randomness comes from one `Rng` whose state is a single 64-bit integer stored in the
game state, so a game is reproducible from (config, seed, actions) on any Python version and platform.

Deck construction follows the seed strategy of PROJECT_OUTLINE section 6: a deck is the *known order* taken from the log
followed by the remaining cards shuffled with the tail seed.
"""

MASK = (1 << 64) - 1


class Rng:
    """SplitMix64. Small, fast, good enough for shuffling, and its whole state is one int."""

    __slots__ = ("state",)

    def __init__(self, state: int) -> None:
        self.state = state & MASK

    def next_u64(self) -> int:
        self.state = (self.state + 0x9E3779B97F4A7C15) & MASK
        z = self.state
        z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & MASK
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & MASK
        return z ^ (z >> 31)

    def randbelow(self, n: int) -> int:
        """Uniform integer in [0, n) by rejection sampling (no modulo bias)."""
        if n <= 0:
            raise ValueError("n must be positive")
        limit = (1 << 64) - ((1 << 64) % n)
        while True:
            x = self.next_u64()
            if x < limit:
                return x % n

    def shuffle(self, items: list) -> None:
        """In-place Fisher-Yates."""
        for i in range(len(items) - 1, 0, -1):
            j = self.randbelow(i + 1)
            items[i], items[j] = items[j], items[i]


def build_deck(cards: list[str], known_order: list[str], rng: Rng) -> list[str]:
    """Deck (top first): `known_order` first, then every other card in a random order.

    `cards` is the full set of the deck (any order; it is sorted first so the result only depends on the set and the seed).
    """
    universe = set(cards)
    if len(universe) != len(cards):
        raise ValueError("duplicate card in deck")
    if len(set(known_order)) != len(known_order):
        raise ValueError("duplicate card in known order")
    unknown = [c for c in known_order if c not in universe]
    if unknown:
        raise ValueError(f"known order contains cards that are not in this deck: {unknown[:5]}")
    known = set(known_order)
    rest = sorted(c for c in universe if c not in known)
    rng.shuffle(rest)
    return list(known_order) + rest
