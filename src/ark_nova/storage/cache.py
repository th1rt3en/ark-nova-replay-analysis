"""Small in-process TTL cache (per Cloud Run instance)."""
import threading
import time
from collections import OrderedDict
from typing import Any, Callable, Hashable


class TTLCache:
    def __init__(self, max_size: int = 4096, clock: Callable[[], float] = time.monotonic):
        self._items: OrderedDict[Hashable, tuple[float, Any]] = OrderedDict()
        self._max_size = max_size
        self._clock = clock
        self._lock = threading.Lock()

    def get_or_load(self, key: Hashable, load: Callable[[], Any], ttl: Callable[[Any], float]) -> Any:
        """Cached value for `key`, else `load()` it and keep it for `ttl(value)` seconds (e.g. empty results expire sooner)."""
        now = self._clock()
        with self._lock:
            hit = self._items.get(key)
            if hit and hit[0] > now:
                self._items.move_to_end(key)
                return hit[1]
        value = load()  # outside the lock: concurrent misses may both query, which is harmless
        with self._lock:
            self._items[key] = (self._clock() + ttl(value), value)
            self._items.move_to_end(key)
            while len(self._items) > self._max_size:
                self._items.popitem(last=False)
        return value
