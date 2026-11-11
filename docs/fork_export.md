# Exporting a fork as a replay

A fork (`fork.html`, see `docs/engine_design.md`) can be stopped anywhere and kept as a replay of its own.

## What the player sees
- The fork page's bar shows the current prompt and its buttons only (no log line: the log tab has them). The log is worded like a BGA replay (`live/bgalog.py`).
- The box in the sidebar has **Stop and export as a replay**. It keeps the fork up to the step on show (going back a step first cuts the moves after it), then shows the link and a Copy button.
- The link is `/replay.html?table=<original table id>&fork=<n>`: `n` counts 1, 2, 3 ... per original table. The replay opens like any other replay (steps, log, spectate choice, results table).
- A fork that stops before the end has results too: the score where it stands, as if the player who is behind had quit. The results switch says "Fork stopped" and names the leader. The table shows the numbers the engine counts (`engine/gamestats.py`); rows for what it does not count (income split, drawn from deck, ...) are left out, and so are the graph, the Elo chips and the thinking time.

## The replay holds the whole game
The record keeps the steps of the original replay from the start of the game up to the fork point (`prefix`: the viewer's steps with every state as a JSON patch against the step before, `fork_export.pack_prefix`), then the moves of the fork.
The replay shows them as one game; its step numbers are the original's up to the fork point. The server reads the prefix from the table's own replay (the log the server has, or the one the page sends again with the export:
`S.forkSource`), or, for a fork of an exported fork, from that fork's replay. Thinking time shows N/A for a fork.

## The seed
Every fork starts with a new random seed (52 bits, `fork.random_seed`; it is put in the address so that a reload is the same fork). Seed 1 is the order of the replay and can still be typed in.
The box on the side can be folded; the choice is kept in the browser.

## Forking a fork
In the replay of an exported fork the Fork button works at every step where a decision waits (`fork: true` on the step). A step of the original game (up to the fork point) is forked from the table itself (`fork.html?table=<table>&step=<k>`);
a step of the fork's own moves is `fork.html?table=<table>&step=<k>&fork=<n>`, which posts `{step, fork_id}` to `/api/tables/{table}/fork`: the server plays the moves of fork `n` again from its `start_state` up to step `k`
(`fork_export.position_at`), so no log of the original game is needed. The new fork is exported as one more number of the same table;
its record names the fork it came from (`origin.parent_fork`) and its first line says "Fork of fork #n of table #T after step k".

## What is stored
`POST /api/tables/{table}/forks` with `{start_state, actions, players, origin}` (the engine state the fork began at and the moves made since). The server plays the moves again, refusing an illegal one, and writes `forks/<table>/<n>.json.gz`:
the layout of a live game's record (`live/archive.py`): `viewer` (maps, cards, `initial_view`, the label of the first step), one `steps[]` item per move (log text, decision, view as a JSON patch), `actions`, `start_state`
(so the engine can play the fork again), `stats` (`gamestats.final`), `result` (`stopped: true` when the game did not end), `origin` (table, step, seed). The replay is built without the engine (`replay/from_record.py`), the same
way as the replay of a recorded live game, so it opens on any later engine version.

`GET /api/tables/{table}/forks/{n}/replay` returns the replay JSON plus `fork_replay` and `post_stats` (the statistics in the shape of `web/js/results.js`).

## Switching it on
Exporting is on only where a bucket is set: `FORK_GCS_BUCKET` (develop: `ark-nova-dev-live`; production: not set, the routes answer "coming soon"). The dev server keeps the files in `build/forks/`.
Code: `replay/fork_export.py`, `storage/forks.py` (Memory / File / Gcs stores, a number is only taken with `if_generation_match=0`), routes in `api/main.py`, page code in `web/js/fork.js` (`exportFork`, `initForkReplay`) and `web/js/load.js`.
Tests: `tests/test_fork_export.py`.

## Thinking time
`replay/view.py thinking_times_from_log`: when the stats table has no thinking time for a player, it is estimated from the log: BGA sends `updateReflexionTime` for a player when their turn ends, so the time
since the previous such event belongs to that player. It replaces the "12:34" placeholder of the results table.
