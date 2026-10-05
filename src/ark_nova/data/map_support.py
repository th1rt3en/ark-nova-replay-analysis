"""Which zoo maps the engine can replay. The beginner maps 0 and A have no geometry yet: tables that were played on them are moved out of
log_examples/ (scripts/quarantine_unsupported_maps.py) until support is switched on, with the environment variable ENABLE_BEGINNER_MAPS=1
or by emptying UNSUPPORTED_MAPS once their geometry is in data_manual/maps_geometry/."""
import os

UNSUPPORTED_MAPS = frozenset() if os.environ.get("ENABLE_BEGINNER_MAPS") == "1" else frozenset({"0", "A"})
