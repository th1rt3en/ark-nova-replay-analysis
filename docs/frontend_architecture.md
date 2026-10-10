# Frontend architecture (audience: AI coding agents)

Scope: `web/` of the replay / fork / sandbox / live play viewer (`replay.html`, `fork.html`, `sandbox.html`, `play.html`; `end.html` shows the result of a finished live game; `map_editor.html` + `js/map_editor.js` is a separate tool that imports the viewer's drawing modules). Other pages (`index`, `guide`, `planning`, `submit`, `import`) are independent and use mainly `style.css` (`submit.html` and `import.html` load `logstore.js` and store the uploaded log, `submit.html` also `progress.js`; `index` / `planning` call their own `/api/` endpoints; `planning.html` is a dev tool that needs `scripts/dev_server.py`; `import.html` is opened only by the browser extension).

## Hard constraints
- Static files served by FastAPI `StaticFiles` from `web/`. **No build step, no bundler, no npm.** JS is native ES modules (`<script type="module" src="/js/main.js">`).
- Visual output must stay as `changelog.md` (the change documentation) describes it; the default look is the Park Poster theme (section 19). Prefer behaviour-preserving moves.
- Backend (`src/`) is owned by someone else. If a frontend change needs a new API field, write "BACKEND NEEDED" in the matching section of `changelog.md`; do not edit `src/`.

## Page -> script wiring
`replay.html`, `fork.html`, `sandbox.html` load `/js/main.js` as a module; `replay.html` sets no mode flag, `fork.html` sets `window.FORK_MODE = true` (inline script), `sandbox.html` sets `FORK_MODE` and `SANDBOX_MODE` only when started with `?play=1` and a stored game; `play.html` sets `FORK_MODE` and `PLAY_MODE` once a game id is in the URL (`state.js` exports `PLAY`; PLAY implies FORK). `main.js` does not boot when `window.MAP_EDITOR` is set. `state.js` reads those flags once and exports them as `FORK` / `SANDBOX`. CSS: `/style.css` (site-wide) + `/css/replay.css` (viewer; ~930 lines, deliberately left as one file with later rules overriding earlier "round N" blocks - **do not reorder or merge rules**: an automated merge changed computed layout by 1-4 px) + `/css/table.css` (structure) + `/css/parkposter.css` (the default theme, loaded last; it restyles everything with `body.viewer ...` selectors, see changelog.md section 19; another theme replaces this one file).

## Scaling (changelog.md section 2)
Desktop (window >= 900 px) is laid out at a fixed design viewport of 1920x1080 and zoomed (`body.style.zoom`, `fitScale` in `layout.js`) to the window width. Consequences for every future edit: do not add width / height `@media` queries or raw `vh` / `vw` for desktop styles (use `--vh` / `--vw`); when JS mixes `getBoundingClientRect` / mouse coordinates (zoomed px) with `offsetWidth` / `clientWidth` / CSS px (layout px), divide by `S.scale`. Below 900 px the old responsive rules (`@media (max-width: 899px) and ...`) apply unscaled.

## Page structure (changelog.md sections 3-4)
`.layout` > `main` (move bar, shared area as a grid with equally high display and association elements (fitDisplay), zoos) + `aside.sidebar` (fixed on the right; tabs Control | Log above the panes). The move bar is sticky at the top of `main`: `.movepill` (step text / action bar) + `#hdrstats` (round and break pills). Structure CSS lives in `css/table.css`, the look in `css/parkposter.css` (loaded after `replay.css`; replay.css still holds the older component rules that the later files override). `sidebar.js` owns the tabs; `layout.js` owns scaling and the display fit (it accounts for the panels' border and padding).

Interfaces (API calls, URL parameters, browser storage keys): changelog.md section 0.1.

## Data flow
`main.js boot()` -> `load.js fetchReplay()` (API replay, uploaded log via `logstore.js`, fork start state, or sandbox game from `sessionStorage['sandboxGame']`) -> `S.replay` -> `render()` draws step `S.step` from scratch (full re-render, no virtual DOM). Fork/sandbox moves are POSTed with the state they apply to; the server keeps nothing.

## Modules (`web/js/`)
| file | role |
|---|---|
| `state.js` | `params`, `table`, `FORK`, `SANDBOX`, and the single mutable state object `S` (all fields documented there). Every former top-level `let` of the old `replay.js` is now `S.<samename>`. |
| `util.js` | `$`, `el`, `svg`, `title`, `section`, `seatColor`, `mix` |
| `icons.js` | icon/sprite lookup, action icons, worker icons, `pic`, `moneyTile` |
| `pov.js` | point of view (both players / seat 0 / seat 1), what is hidden, the eye toggles (`toggleEye`, remembered per table in localStorage; the sandbox, which counts as FORK, only reads the `pov` URL parameter), see changelog.md section 8.8 |
| `load.js` | `fetchReplay` |
| `cards.js` | card faces (images from `web/cards`, made by `scripts/build_cards.py`, see changelog 14), preview popup (the 745 x 1040 `web/cards_large` image, chosen by `largeOf`), changed-card flash, ghost cards (`zoneNew`), session-only drag-to-reorder of hand / endgame cards (`orderedKeys`, `dragRow`) |
| `board.js` | hex maths, map cells, building sprites, `legalPlacement`, `zooBoard` |
| `association.js` | association board / strip, conservation bonus panel |
| `projects.js` | conservation project panel (BGA-like green strips from `web/project_strips`, see changelog 15) and markers |
| `action-bar.js` | the bar of a frame (replay: text / gate / decision; fork/sandbox: playable controls) |
| `fork.js` | fork mode: `initFork`, placement controls, `commitSteps`, `playFork`, `forkBar` |
| `shared.js` | table centre: card folders (zoo place names + numbers like BGA), display, reputation track, thresholds, conservation track |
| `pile.js` | discard / endgame deck popup |
| `side-panel.js` | the two player info boxes (`sidePanel`) and the round / break pills of the top bar (`headerStats`, into `#hdrstats`); no deck / discard counters |
| `dock.js` | hand / endgame-card dock: a fan of cards at the bottom left that rises on hover (CSS), per-player buttons |
| `zoo.js` | one player's zoo |
| `log-labels.js` | move-list label icons and engine badge |
| `layout.js` | `fitScale` (page zoom), `fitDisplay`; registers the resize listener |
| `frames.js` | the frames of a replay step (step text, turn-end gate, decision), see changelog.md section 9 |
| `notips.js` | one rule that removes tooltips from pictures (images, SVG, project panel, image-only elements), see changelog.md section 7 |
| `sidebar.js` | Control / Log tabs, `followLog`, `fitSidebar` (now only resets the zoom of `#side`) |
| `playback.js` | autoplay, speed, timeline (shown or hidden by the settings pop-up, changelog.md 8.10), `go(step, frame)`, `stepBy`, move list |
| `settings.js` | settings pop-up (autoplay speed, timeline row on/off; localStorage `settings`), changelog.md 8.10 |
| `sandbox.js` | sandbox lobby/setup tools |
| `logstore.js` | IndexedDB store for uploaded logs. Stays a CLASSIC script (global `LogStore`), loaded in `replay.html` (before `main.js`) and in `submit.html`; `load.js` reads the global for `source=upload`. Do not convert it. |
| `main.js` | `render()` (redraws only the zones whose position changed, `S.lastBoard`, `reconcile`; changelog.md 13.2), `boot()` |
| `play.js` | live play (play.html; the lobby / create / join form is the inline script of `play.html`): sockets or polling, clocks, game menu, abandon proposals, turn alert, end of game (also for abandoned games; a render error is retried), polling stops when the game is over; state in `S.play`; changelog.md sections 13 and 13.3 |
| `endstats.js` | classic script: the statistics of a finished game (`end.html`, and the play page at the end) |
| `progress.js` | classic script: the progress circle of the loading box (`window.Progress`), loaded before `main.js` in `replay.html` / `fork.html` |

Import graph is cyclic on purpose (e.g. `shared.js` <-> `sandbox.js`). That is safe because modules only use imported *functions* at call time, never at load time. Keep it that way: do not read imported bindings in top-level statements except `state.js` exports.

## Rules for editing
0. `changelog.md` is the change documentation for the agent that ports this frontend to the live site. It describes the final state only. Every frontend task must update it in the same turn: rewrite the section of the feature that changed (delete what became obsolete), or append a new section.
1. New mutable state -> add a field to `S` in `state.js` with a comment. Never create module-level `let` that other modules need.
2. One concern per module; add `// [module] ...` header line to new modules.
3. Only export what another module imports.
4. Never introduce a bundler, TypeScript, or a framework.
5. After any change, verify: load `/replay.html?table=<id>#<step>`, `/fork.html?table=<id>&step=<n>&seed=1` and `/sandbox.html`; zero console errors; compare against the previous version visually at 1600x900 and 700x900.
