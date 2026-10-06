"""Run a function over many logs in parallel (the log-driven tests and scripts: every log is independent).

`parallel_map(fn, items)` is `list(map(fn, items))` spread over worker processes (`fn` has to be a top-level function that can be pickled, the items and
the results too). The number of workers is `ARK_WORKERS` (default: the CPUs); 1 runs everything in the calling process, which is what a debugger wants.
"""
import os
from concurrent.futures import ProcessPoolExecutor


def worker_count(n_items: int) -> int:
    asked = os.environ.get("ARK_WORKERS")
    n = int(asked) if asked else (os.cpu_count() or 1)
    return max(1, min(n, n_items))


def parallel_map(fn, items, chunksize: int = 1) -> list:
    items = list(items)
    n = worker_count(len(items))
    if n <= 1 or len(items) <= 1:
        return [fn(x) for x in items]
    with ProcessPoolExecutor(max_workers=n) as pool:
        return list(pool.map(fn, items, chunksize=chunksize))
