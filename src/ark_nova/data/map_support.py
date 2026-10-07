"""Which zoo maps the engine can replay. All of them since the beginner maps 0 and A got their geometry (data_manual/maps_geometry/0.json, A.json). A map
that has no geometry yet goes into UNSUPPORTED_MAPS: tables that were played on it are moved out of log_examples/ (scripts/quarantine_unsupported_maps.py)."""
UNSUPPORTED_MAPS = frozenset()
