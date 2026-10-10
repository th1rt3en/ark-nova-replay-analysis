-- The answer of a puzzle, read from the log at rollover and kept with the puzzle (server side only): a cache, rebuilt from the log when it is missing or out of date.
ALTER TABLE minigame_puzzles ADD COLUMN answer_cache TEXT;
