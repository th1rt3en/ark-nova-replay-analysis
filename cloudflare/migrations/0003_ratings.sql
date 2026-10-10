-- Rated live games, deleting an account (docs/accounts_plan.md): the rating of every rated game, and the date an account was anonymized.
ALTER TABLE accounts ADD COLUMN deleted_at TEXT NOT NULL DEFAULT '';

CREATE TABLE rating_history (
    game_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    seat INTEGER NOT NULL,
    opponent_id TEXT NOT NULL,
    result REAL NOT NULL,
    rating_before REAL NOT NULL,
    rating_after REAL NOT NULL,
    delta REAL NOT NULL,
    k INTEGER NOT NULL,
    at TEXT NOT NULL,
    PRIMARY KEY (game_id, account_id)
);
CREATE INDEX rating_history_account ON rating_history (account_id, at);
