-- Saved maps (maps made in the map editor, played in the game mode "custom map"): at most 3 per account, each with a name and an id `M{n}` (counters.custom_map).
CREATE TABLE custom_maps (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX custom_maps_by_account ON custom_maps (account_id);
