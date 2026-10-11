-- Accounts, sessions and the mini games (docs/accounts_plan.md, "Data model"). The same tables as ark_nova/accounts/store.py and
-- ark_nova/minigames/platform/store.py (SQLite), reached through the signed /internal/store/<op> routes (src/store.ts).

CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    id_source TEXT NOT NULL,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    recovery_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_login_at TEXT NOT NULL DEFAULT '',
    bga_elo_seed REAL,
    rating REAL NOT NULL DEFAULT 0,
    rated_games INTEGER NOT NULL DEFAULT 0,
    rated_wins INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE counters (
    name TEXT PRIMARY KEY,
    value INTEGER NOT NULL
);

CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX sessions_account ON sessions (account_id);

CREATE TABLE minigame_puzzles (
    game_key TEXT NOT NULL,
    day TEXT NOT NULL,
    source_ref INTEGER NOT NULL,
    moment TEXT NOT NULL,
    builder_version TEXT NOT NULL DEFAULT '',
    public_cache TEXT,
    created_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (game_key, day)
);

CREATE TABLE minigame_used_sources (
    game_key TEXT NOT NULL,
    source_ref INTEGER NOT NULL,
    PRIMARY KEY (game_key, source_ref)
);

CREATE TABLE minigame_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_key TEXT NOT NULL,
    day TEXT NOT NULL,
    account_id TEXT,
    anon_id TEXT,
    payload TEXT NOT NULL,
    score REAL NOT NULL,
    detail TEXT NOT NULL DEFAULT '{}',
    submitted_at TEXT NOT NULL
);
CREATE UNIQUE INDEX minigame_sub_account ON minigame_submissions (game_key, day, account_id) WHERE account_id IS NOT NULL;
CREATE UNIQUE INDEX minigame_sub_anon ON minigame_submissions (game_key, day, anon_id) WHERE account_id IS NULL;
