"""Which recorded games the sweep tests read.

`pytest --full` (or ARK_FULL_LOGS=1) reads every log in `log_examples/`. Without it the sweeps read a fixed subset of FAST_COUNT games: the ones whose id hashes
lowest, so the subset is the same on every run and on every machine, and adding logs changes it only a little. The everyday run (`pytest -n auto`) stays at
a few minutes; run `pytest --full -n auto` before a deploy.
"""
import hashlib
import os
from pathlib import Path

FULL = os.environ.get("ARK_FULL_LOGS") == "1"
FAST_COUNT = 100


def sweep(paths) -> list:
    """All the logs with --full, else the fixed subset (still in sorted order)."""
    paths = list(paths)
    if FULL:
        return paths
    return sorted(sorted(paths, key=lambda p: hashlib.sha1(Path(p).stem.encode()).hexdigest())[:FAST_COUNT])
