-- The live tables an account has a seat at (a game between accounts), so a player can find a table again without its link: written when the seat is taken, updated when the table ends.
CREATE TABLE account_tables (
    account_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    seat INTEGER NOT NULL,
    opponent_id TEXT NOT NULL DEFAULT '',
    rated INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'live',
    result TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    ended_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (account_id, game_id)
);
CREATE INDEX account_tables_by_account ON account_tables (account_id, created_at);
