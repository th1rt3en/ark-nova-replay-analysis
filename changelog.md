# Frontend change documentation (for the AI agent that ports the local frontend to the live site)

Audience: an AI coding agent, not a human. This document describes **the final state** of every frontend change made locally on top of the baseline, as instructions you can apply to a codebase whose backend has moved on. Changes that were later overwritten or abandoned are deliberately not described. The folder this file lives in is a **reference implementation**: when this text and the reference files disagree, the reference files win, and you report the difference.

## 0. How to use this document

Status: this change set has been applied to the repo that also has the live games (section 13 lists what the merge added: live play, render reconciliation, loading progress). The reference files in `web/` are the merged result; a later port to another codebase follows the same rules.

Scope
- Only `web/` changed (plus `docs/frontend_architecture.md` and the local-only helpers of section 10). The backend (`src/`, `data/`, `data_manual/`) was not edited and **no change here REQUIRES a backend change** (sections 9.6 / 9.7 list optional improvements marked BACKEND NEEDED). The frontend only reads fields the replay API already returned when these changes were made. Fields read by the new code (check each still exists with the same meaning on the live API; if one was renamed, adapt the read in the frontend only): per step `fork` (truthy = the Fork button is enabled), `index`, `actor`, `irreversible` / `irreversible_reason`, `actions` (fork: legal moves), `sandbox`, `label`, `label_pov[]`, `move_id`, `options` (`prompt`, `seat`, `kinds`, `pieces`, `effects`, `take`, `sponsors`, `discard`, `skip`, `association`, `value`, `only`, `cards`), `engine` (`source`, `status`), `engine_state` (fork / sandbox), `state` (`turn`, `phase` setup / turn / final_turns / over, `draft` {`stage` pick1 / pick2 / keep / done, `offers`, `picked`, `kept`}, `current_action` {`seat`, `slot`, `strength`}, `active_player`, `display`, `conservation_options`, `projects_in_play`, `base_projects`, `players[]` {`hand`, `endgame_hand`, `action_cards[]` {`type`, `level`, `variant`}, `hand_limit`, `initial_offer`, `icons`, `tokens`, `x_tokens`, `score`, ...}); per replay `table_id`, `players[]` {`seat`, `id`, `name`, `color`}, `marine_worlds`, `cards`, `base_projects`, `base_pool`, `maps`, `shapes`, `setup`, `sandbox`; the fork response also carries `fork` {`step`, `seed`}. The exact set is whatever the modules read: grep `S.replay.` and `st.` in `web/js` if in doubt. The BGA profile link of a player name is built from `players[].id`. If the live API renamed or dropped such a field, adapt the read in the frontend; do not touch the backend.
- The live site serves `web/` with FastAPI `StaticFiles`. There is no build step and none may be introduced. JS is native ES modules.
- Applies identically to `replay.html`, `fork.html`, `sandbox.html` (one viewer, three modes: `replay.html` sets no flag; `fork.html` sets `window.FORK_MODE = true`; `sandbox.html` loads the viewer only with `?play=1` and a stored game and then sets `window.FORK_MODE` and `window.SANDBOX_MODE`; `state.js` exports `FORK`, `SANDBOX`). The sandbox counts as `FORK` everywhere below (so it reads the eyes from the `pov` URL parameter only and never uses localStorage for them).

Strategy (the live backend and possibly parts of the live frontend changed since the baseline, so do not overwrite the live `web/` with this folder)
1. Check the live `web/js/replay.js`: if it still is the baseline file (3021 lines, sha256 starts `8322cad87526e14e`), section 1 can be applied by copying the modules. If it differs, diff it against the baseline and port the differences into the modules by hand (a former top-level `let foo` is `S.foo`; function names are unchanged; see the module table in `docs/frontend_architecture.md`).
2. Sections 1-9 are ONE atomic port, not independent steps: the reference modules and HTML files are the FINAL state, and `main.js` imports every module (`sidebar`, `settings`, `frames`, `notips`, ...) and wires elements (`#tabControl`, `#settings`, `#timeline`, ...) that only the final HTML has. So take the final `replay.html`, `fork.html`, `sandbox.html`, the complete `table.css` (3.3, which already contains the CSS of 8.7, 8.9, 8.10 and 9.5: do NOT add those rules a second time when a later section says "append to table.css") and all modules together, then work through sections 2-9 to check each behaviour and to port what the live code does differently. Zero console errors can only be expected once everything is in place.
3. Dependencies between sections: 8.10 (`settings.js`) imports `sidebar.js` (4) and `setSpeed` from `playback.js`, and `alignControl` in `sidebar.js` reads the `#timeline` state of 8.10; 8.9 and 8.10 describe the `<header class="bar">` that 3.1 shows in its final form; 5.2 needs the `.placepick` / `.placemenu` CSS that is in 3.3; section 9 builds on 3.2 and 5.1. Sections 2 and 3 change the layout of the whole page: after them the pages look different on purpose.
4. Do not "improve" the old CSS while porting. `web/css/replay.css` is intentionally one non-consolidated file in which later rules override earlier ones; reordering or merging rules changed computed layout by 1-4 px in an experiment.
5. Local-only helpers are listed in section 10: do not port them, but read the caching advice there.
6. Interfaces the frontend relies on (API calls, URL parameters, browser storage) are listed in section 0.1.

Vocabulary: "design viewport" = 1920x1080 CSS px. "zoomed px" = the unit `getBoundingClientRect` and mouse coordinates return inside the zoomed body. "layout px" = the unit of `offsetWidth`, `clientWidth`, `scrollHeight` and of CSS lengths.


### 0.1 Interfaces the frontend relies on (check each against the live site)

API calls (all JSON): `GET /api/tables/{id}/replay` (the replay); `POST /api/tables/{id}/replay` (body: the raw text of an uploaded log, when the URL has `source=upload`; the log itself is read from IndexedDB, see below); `POST /api/tables/{id}/fork` (body `{step, seed}`; the fork page's start state); `POST /api/fork/apply` (body `{state, action, names, ...}`; plays one legal action in a fork); `POST /api/sandbox/new`, `POST /api/sandbox/apply`, `POST /api/sandbox/edit`, `GET /api/sandbox/map/{id}`, `GET /api/sandbox/maps?marine_worlds=true|false` (sandbox). Static JSON: `/enclosures/sprites.json`, `/icons/icons.json`, `/icons/names.json` (a failed load falls back to an empty object). Live play (`play.html`, `play.js`, `end.html`): `GET /api/live/options`, `GET /api/live/config` (`{ws_base}`; empty = poll every 2 s), `POST /api/games` (create; returns the two seat tokens), `GET /api/games/E<n>`, `POST /api/games/E<n>/join`, `GET .../setup`, `GET .../state`, `POST .../preview`, `POST .../actions` (`{version, action, request_id}`), `POST .../concede`, `POST .../timeout`, `GET|POST .../abandon`, `POST .../abandon/withdraw`, `POST .../abandon/answer`, `GET .../result`, and the WebSocket `<ws_base>/ws/E<n>?s=<token>` (messages `state`, `lobby`, `status`, `abandon`, `waiting`; the client sends `ping`, the server answers `pong`). The seat token goes in the header `X-Seat-Token` (or `?s=`). Other: `GET /api/lookup?q=`, `GET /api/tables/{id}/log`, `POST /api/tables/{id}/verify` (used by `index.html` / `submit.html`). The exact request bodies are in `load.js`, `fork.js`, `sandbox.js`, `play.js` (reference files win). Check the HTTP status before reading the body: error bodies have a `status` field too.

URL parameters (`state.js` exports `params`, `table`): `table` (game id; the replay page redirects to `/` when it is missing or not numeric), `step` and `seed` (fork page), `pov` (fork page: `all` | `0` | `1`, see 8.8), `source=upload` (replay of a manually submitted log), `play=1` (sandbox page: start the stored game), `game=E<n>` and `s=<seat token>` (play page; `end.html` takes `game`), and the hash `#<step>` or `#<step>.<frame>` (replay; written by `go()`, read once at start).

Browser storage: localStorage `settings` (8.10), `pov:<table id>` (8.8), `sidebarTab` (`control` | `log`, 4), `dockSel` and `dockHidden` (the hand dock: selected cards and folded state, `dock.js`); sessionStorage `sandboxGame`; localStorage `playToken.<game id>`, `playerName`, `playAlerts` (turn alert on/off), `liveUnlocked` (set by the start page; without it `play.html` shows "coming soon"), `progress.<key>` (`progress.js`: past loading times) (the sandbox game handed from the lobby to `?play=1`); IndexedDB database `ark-nova-replay`, object store `logs` (`logstore.js`, a classic script: uploaded logs are too big for sessionStorage; written by `submit.html` and by `import.html`, read by `load.js` for `source=upload`). `import.html` is opened by the browser extension (`extension/button.js`) with `?table=<id>` and receives the BGA log with `window.postMessage` (`ark-nova-import-ready` from the page, `ark-nova-log` from the extension).

---

## 1. Module split of `web/js/replay.js` (no visual or behavioural change)

Before: `web/js/replay.js`, one IIFE (3021 lines, ~60 top-level `let`, ~200 functions) loaded with `<script src="/js/replay.js">`.
After: ES modules in `web/js/`, entry point `web/js/main.js`. The module list and roles are in `docs/frontend_architecture.md` (section "Modules"); the modules are: `action-bar, association, board, cards, dock, fork, frames, icons, layout, load, log-labels, main, notips, pile, playback, pov, projects, sandbox, shared, side-panel, sidebar, state, util, zoo`; plus `settings` (8.10); `logstore.js` is unchanged and **stays a classic script** (it defines the global `LogStore`; it is loaded by `replay.html` and `submit.html`).

Steps
1. Add the module files. Delete `web/js/replay.js`.
2. `replay.html`, `fork.html`: replace `<script src="/js/replay.js"></script>` by `<script type="module" src="/js/main.js"></script>`. Keep `<script src="/js/logstore.js"></script>` before it (replay.html; `submit.html` loads it too) and the inline `window.FORK_MODE = true;` script before it (fork.html).
3. `sandbox.html`: the inline script that creates the script element must create a module: `const s = document.createElement('script'); s.type = 'module'; s.src = '/js/main.js'; document.body.append(s);`.
4. Do not change the inline mode flags; `state.js` reads them once and exports `FORK`, `SANDBOX`.

Semantics to preserve when porting by hand
- Former top-level `let` variables live on the exported object `S` (`state.js`). `params`, `table`, `FORK`, `SANDBOX` are exported consts of `state.js`.
- The tail of the old IIFE (init code) is wrapped in `boot()` in `main.js` (a module cannot `return` at top level).
- The import graph is cyclic on purpose; it is safe because modules only use imported functions at call time. Never read an imported binding in a top-level statement (except `state.js` exports).
- New mutable state: add a field to `S` in `state.js` with a comment.

Dead code that was removed (delete it if the live code still has it; nothing referenced it): `iconImg`, `SUMMARY`, `associationSummary`, `projectRow`, `SB_TYPES`, `renderInitialDiscard`, the unreachable tail of `renderForkMoves` (it only clears `#forkpanel` and keeps the last error now; legal moves are played from the action bar, see `forkBar`), and `piecesRow` and the `PIECE_SCALE` constant (section 5), `naturalTop` in `state.js`. The CSS rules `.forkhead .forkgroup .forkfilter .forkdiscard .forknone` are unused (verified: no class name appears in `web/js`) and were left in `replay.css`; delete them if you like.

Verification: load `/replay.html?table=<id>#<step>`, `/fork.html?table=<id>&step=<n>&seed=1`, `/sandbox.html`; zero console errors; step through a replay with the arrow keys; click through a fork (action card, build, association task) and a sandbox setup. In the reference run 126 scripted scenarios gave identical normalised DOM before/after the split (except sandbox games, whose card deal is random).

---

## 2. Uniform scaling: the desktop layout is always the 1920 px layout, zoomed to the window

Problem solved: width / height breakpoints and fixed-size boards gave small laptop windows (e.g. 1280x550) stacked zoos, a drawer and ~7 screens of scrolling. Now every desktop window shows the same layout, only smaller or bigger (like BGA).

Behaviour
- Window width >= 900 px ("desktop mode", `S.scaled = true`): the page is laid out as a 1920 px wide page and `document.body.style.zoom = clientWidth / 1920`. Height does not change the layout; the page scrolls vertically.
- Window width < 900 px: nothing is scaled and the old narrow-window rules apply (phones are out of scope for now; there is only a simple fallback, section 3).

Files and exact changes
1. `web/js/layout.js`: exports `fitScale()` (below). `main.js` `boot()` calls `fitScale()` as its first statement; the `resize` listener in `layout.js` calls `fitScale(); fitSidebar(); fitDisplay();` (`fitSidebar`, `fitDisplay`: section 4).
```js
const DESIGN_W = 1920, DESKTOP_MIN = 900;
export function fitScale() {
  const root = document.documentElement, w = root.clientWidth;
  S.scaled = w >= DESKTOP_MIN;
  S.scale = S.scaled ? w / DESIGN_W : 1;
  document.body.style.zoom = S.scaled ? String(S.scale) : '';
  if (S.scaled) {
    root.style.setProperty('--vw', DESIGN_W / 100 + 'px');
    root.style.setProperty('--vh', window.innerHeight / S.scale / 100 + 'px');
  } else {
    root.style.removeProperty('--vw'); root.style.removeProperty('--vh');
  }
}
```
2. `web/js/state.js`: new fields on `S`: `scale: 1`, `scaled: false`, `sbTab: 'control'`.
3. `web/css/replay.css` (mechanical transformation of the baseline file; if the live `replay.css` changed, redo it by these rules):
   - Every `@media` block that tests only width / height is split in two: (a) the original condition AND `(max-width: 899px)`, which keeps the old behaviour for narrow windows; (b) if the original condition is true at 1920x1080, a copy of the same rules under `@media (min-width: 900px)` **at the same position in the file** (cascade order unchanged). Blocks that are false at 1920x1080 get no desktop copy. Blocks testing `hover` or `prefers-reduced-motion` are untouched.
   - Every `Nvh` / `Nvw` becomes `calc(var(--vh, 1vh) * N)` / `calc(var(--vw, 1vw) * N)`. (Inside a zoomed body the real `vh` / `vw` would be multiplied by the zoom a second time; `fitScale` sets `--vh` = `innerHeight / scale / 100` px and `--vw` = 19.2 px on `<html>`.)
   - `html { overflow-y: scroll; }` must be present (the reference has it in `table.css` at the top and also in `replay.css`; one of them is enough) so a scrollbar appearing never changes the width the scale is computed from.
   - Remove the drawer rules (`.asidetoggle`, the `aside` drawer block and its reduced-motion line); the drawer no longer exists (section 3).
4. Rules for all future frontend code
   - Never add a width / height `@media` query or a raw `vh` / `vw` unit for the desktop layout; use `--vh` / `--vw`, and keep `(max-width: 899px)` in conditions of narrow-window rules.
   - Chrome reports `getBoundingClientRect` and mouse coordinates in zoomed px but `offsetWidth`, `clientWidth`, `scrollHeight` in layout px. When mixing them divide the zoomed ones by `S.scale` (see `fitDisplay`).
   - Elements with `position: fixed` (card preview, pile popup, sidebar) are inside the zoomed body and scale with it; they need no extra handling.

Known limits: below 1920 px all text is proportionally smaller (intended). Phones are not designed yet.

Verification: zoo width divided by window width is the same (0.404) at 1280x551, 1536x730, 1920x1080, 2560x1300; live resizing 1920 -> 1280 -> 1000 -> 2560 -> 1920 keeps the layout; no horizontal overflow; at exactly 1920x1080 the DOM is identical to the pre-scaling code.

---

## 3. Page structure: move bar on top, fixed sidebar (Control | Log), shared area, maps below

Target layout (the display element and the association element are equally high, see 3.4; design viewport; identical for replay, fork and sandbox):
```
+--------------------------------------------+------------------+
| MOVE BAR (step text | pending decision)    | [Control] [Log]  |   <- sidebar, position: fixed, always in view
+---------------------+----------------------+------------------+
| Display             | association board    | control panel    |
| (conservation track | (project spaces above| (2 button rows;  |
|  + folders + rep.   |  and below)          |  optional third  |
|  track)             |                      |  row: timeline)  |
+---------------------+----------------------+                  |
| zoo / map of seat 0 | zoo / map of seat 1  | info (trackers)  |
+---------------------+----------------------+------------------+
```
In the Log tab the sidebar shows the move list instead of control panel + info.

3.1 HTML (`replay.html`; `fork.html` and `sandbox.html` get the same structure plus their extras)
- Removed: the full-width top `<header class="bar">`, the second move bar `#current` below it, the old `<aside>` with the move list and its `<h2>Moves</h2>`.
- New body of `#app`: `.layout` containing `<main>` and `<aside class="sidebar">`. All ids used by the JS are unchanged. Link `/css/table.css` after `/css/replay.css` in the three pages.
```html
<div id="app" hidden>
  <div class="layout">
    <main>
      <div class="movebar">
        <div id="actionbar" class="actionbar" hidden></div>
        <div id="current" class="current" aria-live="polite"></div>
        <span id="enginemark" class="enginemark"></span>
      </div>
      <section id="shared" class="shared"></section>
      <section id="zoos" class="zoos"></section>
    </main>
    <aside class="sidebar">
      <div class="sbtabs" role="tablist">
        <button id="tabControl" class="sbtab on" type="button" role="tab" aria-selected="true">Control</button>
        <button id="tabLog" class="sbtab" type="button" role="tab" aria-selected="false">Log</button>
      </div>
      <div id="paneControl" class="sbpane">
      <header class="bar">
        <div class="controls" role="group" aria-label="Replay controls">
          <button id="first" title="First step (Home)" aria-label="First step">&#9198;</button>
          <button id="prev" title="Back one step (Left arrow)" aria-label="Back one step">&#9194;&#xFE0E;</button>
          <button id="play" title="Start / stop autoplay (Space)" aria-label="Start autoplay">&#9654;</button>
          <button id="next" title="Forward one step (Right arrow)" aria-label="Forward one step">&#9193;&#xFE0E;</button>
          <button id="last" title="Last step (End)" aria-label="Last step">&#9197;</button>
        </div>
        <div id="timeline" class="timeline" role="slider" aria-label="Game timeline" title="Timeline: each | is the start of a round" hidden></div>
        <div class="controls controls2" role="group" aria-label="Settings, move and fork">
          <button id="settings" class="settingsbtn" title="Settings (S)" aria-label="Settings"><svg class="gearicon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M10.29 3.57 L10.57 1.09 L13.43 1.09 L13.71 3.57 L16.75 4.83 L18.70 3.28 L20.72 5.30 L19.17 7.25 L20.43 10.29 L22.91 10.57 L22.91 13.43 L20.43 13.71 L19.17 16.75 L20.72 18.70 L18.70 20.72 L16.75 19.17 L13.71 20.43 L13.43 22.91 L10.57 22.91 L10.29 20.43 L7.25 19.17 L5.30 20.72 L3.28 18.70 L4.83 16.75 L3.57 13.71 L1.09 13.43 L1.09 10.57 L3.57 10.29 L4.83 7.25 L3.28 5.30 L5.30 3.28 L7.25 4.83Z M12 8.4a3.6 3.6 0 1 0 0 7.2a3.6 3.6 0 1 0 0-7.2Z"/></svg></button>
          <label class="jump">Move <input id="jump" type="number" min="0" aria-label="Jump to move"></label>
          <button id="fork" class="forkbtn" title="Fork this position: play on from here for both players, in a new tab" aria-label="Fork this position">&#9095; Fork</button>
        </div>
      </header>
        <section id="side" class="side"></section>
      </div>
      <div id="paneLog" class="sbpane" hidden>
        <ol id="moves" class="moves"></ol>
      </div>
    </aside>
  </div>
</div>
```
- `fork.html` differences from `replay.html`: `<body class="viewer forkpage">`; `<section id="forkpanel" class="forkpanel" aria-label="Legal moves"></section>` right after the whole `.movebar` div (inside `<main>`, before `#shared`); no `#fork` button; `<div id="forkinfo" class="forkinfo" hidden></div>` inside `#paneControl` between `</header>` and `<section id="side">`.
- `sandbox.html` differences: `<body class="viewer forkpage sandboxpage">` (`.sandboxpage` has no CSS rules); as fork.html, plus `<details id="sbtools" class="sbtools" open></details>` before `#forkpanel` in `<main>`; the lobby / loading elements and inline bootstrap script at the top and bottom of the page are unchanged.

3.1b Width: the sidebar is 300 px wide (`--sidebar-w: 300px` in `table.css`, a design px at the 1920 layout); the main column takes the rest (right padding of `.layout` = sidebar width + 2rem). The two tabs share the width. The info panel (`#side`) is laid out 19rem wide and zoomed by `fitSidebar` to exactly the width of the pane (about 0.99 at 300 px; see section 4).

3.2 The move bar (`.movebar`) is one parchment box (the box styling moved from `.actionbar` / `.current` to `.movebar`, min-height 50 px, it grows when its content wraps). It holds the text of the step (`#current`: what just happened) and the action bar (`#actionbar`: what is pending). **In the replay the two are never shown at the same time**: they are consecutive frames of the step, the step text first and the decision as the next click (section 9); the box shows whichever the frame says, centred, and the other element is hidden. In the fork and sandbox (frame kind `both`) the old combined layout stays: `#current` left (muted, at most 42% wide, thin divider, `order: -1` while `#actionbar` is visible) and the bar after it, wrapping when they do not fit. In the fork the server prefixes the label of the first step (`Fork of table #N after step M: ...`); `render()` strips that prefix because the fork box already says where the fork comes from. The engine badge moved out of `#current` into the corner element `#enginemark`. In `web/js/main.js` `render()`:
```js
  const cur = $('current'), kind = frameKind();
  cur.replaceChildren();
  cur.hidden = kind !== 'text' && kind !== 'both';                 // replay: the step text and the bar are never shown together (frames.js)
  if (!cur.hidden) {
    let text = frameText();
    if (FORK && typeof text === 'string') text = text.replace(/^Fork of table #\d+ after step \d+: /, '');       // (the first step of a fork: the server prefixes the label; the fork box above says where it comes from)
    cur.append(labelNode(text));
    if (s.engine && s.engine.detail && s.engine.source === 'log') cur.append(el('div', 'engine-detail', 'Engine: ' + s.engine.detail));
  }
  $('enginemark').replaceChildren(engineBadge(s.engine));
```
Who draws what: `render()` (`main.js`) fills the step text `#current`; the action bar `#actionbar` is drawn by `renderShared(st)` in `shared.js` (calls `actionBar(st)`, section 9.4) in the replay, and by `forkBar()` / `refreshBar()` (`fork.js`) in the fork and the sandbox.
and `render()` calls `followLog(); ... fitSidebar(); fitDisplay();` after drawing; `init()` calls `setupSidebar()` and `setupNoTips()` (section 7) instead of the old drawer setup; the old inline scroll code of the move list in `render()` is replaced by `followLog()`.

3.3 `web/css/table.css` (new file, complete; loaded after `replay.css`, so it overrides the older structure rules that remain in `replay.css` (`.bar`, `.shared`, `.tablecol`, `aside` ...); do not delete those yet):
```css
/* ==== Structure of the table page (replay / fork / sandbox) ====================================================================================
   Loaded after replay.css. .layout = main column | sidebar.
   main:    move bar (the prompt of the step, or the step text) / shared area (display | association board, 50:50) / the two zoos side by side.
   sidebar: fixed on the right (always in view while the page scrolls), as high as the window; tabs "Control" | "Log". Control = control panel (.bar) + info (#side, the player trackers); Log = the move list.
   Desktop windows are laid out at 1920 px and zoomed (changelog.md, section 2), so these sizes are the same on every screen. */

html, body.viewer { overflow-x: clip; overflow-y: visible; }          /* (hidden would make <body> a scroll container) */
html { overflow-y: scroll; }

.layout { --sidebar-w: 300px; display: block; padding: .8rem calc(var(--sidebar-w) + 2rem) 1rem 1rem; }          /* the sidebar is fixed on the right, the main column leaves room for it */
main { min-width: 0; }

/* ---- move bar: ONE parchment box, 50 px high at least, that grows (wraps) with its content. It holds the text of the step (#current: what just happened) and, when there is
   something to choose / confirm, the action bar (#actionbar: what is pending). In the replay only one of the two is shown at a time (consecutive frames of a step,
   changelog.md section 9); in the fork and the sandbox the step text and the bar can both be shown and then wrap onto two rows when they do not fit. The engine mark sits in the corner ------------------------------------- */
.movebar { position: relative; box-sizing: border-box; display: flex; flex-wrap: wrap; align-items: center; gap: .2rem 0; margin-bottom: .8rem; min-height: 50px; padding: .15rem 2.4rem .15rem 1rem;
  background: rgba(244, 236, 210, .96); color: #2b1d12; border: 2px solid #1b110a; border-radius: 6px; box-shadow: 0 3px 10px rgba(0, 0, 0, .5); font-size: 1.05rem; }
.movebar .actionbar { flex: 1 1 auto; margin: 0; min-height: 0; padding: 0; background: none; border: 0; border-radius: 0; box-shadow: none; }
.movebar .actionbar.draftbar { padding: .4rem 0; }
.movebar .actionbar[hidden] { display: none; }
.movebar .current { order: -1; flex: 1 1 auto; box-sizing: border-box; align-self: stretch; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;
  padding: .15rem 0; background: none; border: 0; font-weight: 700; }
.movebar .actionbar:not([hidden]) ~ .current { flex: 0 1 auto; max-width: 42%; align-items: flex-start; text-align: left; margin-right: 1rem; padding-right: 1rem; border-right: 2px solid rgba(43, 29, 18, .25);
  font-size: .95rem; color: #5a4636; }
.enginemark { position: absolute; top: .3rem; right: .5rem; z-index: 2; }

/* ---- shared area: the display element (display + both tracks) | the association element (project area + board + project area). Both are EXACTLY equally high: fitDisplay() (layout.js)
   solves the width of the association element (--assocw) from the fixed proportions of the two; the display is zoomed to the rest  -------------------------------------------------- */
.shared { display: grid; grid-template-columns: minmax(0, 1fr) var(--assocw, 40rem); gap: 1rem; align-items: start; margin-bottom: 1rem; }
.shared > .displaycol { min-width: 0; overflow: hidden; }
.shared > .tablecol { flex: none; min-width: 0; max-width: none; width: auto; }

/* the project areas above and below the association board have the height their content gives them (they are no longer tied to the conservation track); the icon keeps its proportions */
.shared .projpanel { box-sizing: border-box; }
.shared .projpanel .projslot { align-self: stretch; height: auto; min-height: 0; }
.shared .projpanel .projicon { height: auto; width: auto; max-width: 3.4rem; }

/* ---- sidebar ----------------------------------------------------------------------------------------------------------------------------------------- */
aside.sidebar { position: fixed; top: .8rem; right: 1rem; width: var(--sidebar-w); z-index: 20; height: calc(var(--vh, 1vh) * 100 - 1.6rem); max-height: none; overflow: hidden; display: flex; flex-direction: column; gap: .5rem; }
.sbtabs { flex: 0 0 50px; display: flex; gap: .4rem; }
.sbtab { flex: 1 1 0; height: 50px; padding: 0 .6rem; border: 2px solid #1b110a; border-radius: 10px; background: rgba(40, 25, 14, .94); color: #e8dcb8; font: 700 1rem system-ui, sans-serif; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, .45); }
.sbtab:hover { background: rgba(70, 45, 26, .96); }
.sbtab.on { background: #e8dcb8; color: #3a2616; }
.sbpane { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: .5rem; }
.sbpane[hidden] { display: none; }
#paneControl { overflow-x: hidden; overflow-y: auto; scrollbar-width: thin; }

/* control panel */
.sidebar .bar { position: static; flex: 0 0 auto; box-sizing: border-box; justify-content: center; display: flex; flex-direction: column; align-items: stretch; flex-wrap: nowrap; gap: .3rem; padding: .25rem .65rem;
  border: 2px solid #1b110a; border-radius: 10px; box-shadow: 0 3px 10px rgba(0, 0, 0, .5); }
.sidebar .timeline { flex: 0 0 1.6rem; width: 100%; max-width: none; margin: 0; }
.timeline[hidden] { display: none; }
.sidebar .controls { margin: 0; flex-wrap: nowrap; justify-content: space-between; gap: .4rem; }
.sidebar .controls .jump { margin-left: 0; display: inline-flex; align-items: center; gap: .4rem; flex: 1 1 0; min-width: 0; font-weight: 700; color: #f1d9a0; }
.sidebar .controls .jump input { flex: 1 1 0; min-width: 0; width: 3rem; }
.sidebar .controls button { flex: 0 1 3rem; min-width: 0; padding-top: .2rem; padding-bottom: .2rem; }
.sidebar .controls .forkbtn, .sidebar .controls .settingsbtn { flex: 0 0 auto; }
.sidebar .controls .forkbtn { min-width: 0; padding-left: .8rem; padding-right: .8rem; }
.sidebar .controls .settingsbtn { line-height: 1; padding-top: 0; padding-bottom: 0; display: inline-flex; align-items: center; justify-content: center; }
.settingsbtn .gearicon { width: 1.9rem; height: 1.9rem; display: block; }
.sidebar .forkinfo { flex: 0 0 auto; border: 2px solid #1b110a; border-radius: 10px; padding: .5rem .65rem; font-size: .85rem; line-height: 1.6; }

/* info (the player trackers): laid out for 19rem, zoomed by fitSidebar() */
.sidebar .side { flex: 0 0 auto; width: 19rem; margin: 0 auto; }

/* log */
.sidebar .moves { flex: 1 1 0; min-height: 0; max-height: none; position: relative; font-size: .95rem; }

/* ---- narrow windows (not designed yet): one column, the sidebar on top ---------------------------------------------------------------------------------- */
@media (max-width: 899px) {
  .layout { padding: .6rem; display: flex; flex-direction: column; }
  aside.sidebar { position: static; width: auto; height: auto; order: -1; overflow: visible; }
  .sidebar .moves { max-height: 40vh; flex: none; }
  .shared { grid-template-columns: minmax(0, 1fr); }
}

/* the piece menu of a Build in the fork: one button in the move bar, the pieces drop down below it */
.placepick { position: relative; padding: 0; display: inline-flex; }
.placemenu { position: absolute; top: calc(100% + .25rem); left: 0; z-index: 30; display: flex; flex-direction: column; gap: .3rem; padding: .5rem; min-width: 16rem; background: #f3ead2; border: 1px solid #6f5749; border-radius: 6px; box-shadow: 0 4px 14px rgba(0, 0, 0, .45); }
.placemenu[hidden] { display: none; }
.placemenu .forkmove.piece { justify-content: flex-start; }
.movebar .actionbar .placectl { margin: 0; padding: 0; background: none; border: 0; flex-basis: auto; }
.movebar .current[hidden] { display: none; }   /* replay: a decision / gate frame shows the bar alone (frames.js) */


/* a project area with only two spots (the conservation projects in play) has them centred in the whole area (--shift is set by fitDisplay) */
.shared .projpanel.pair .projslot { transform: translateX(var(--shift, 0px)); }

/* settings pop-up: dimmed background over the whole page, the box in the middle */
.modal { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center; background: rgba(15, 9, 4, .6); }
.modal[hidden] { display: none; }
.modalbox { min-width: 24rem; max-width: 90%; padding: 1rem 1.4rem 1.2rem; border: 2px solid #1b110a; border-radius: 12px; background: #ece3b4; color: #2b1d12; box-shadow: 0 10px 40px rgba(0, 0, 0, .7); }
.modalhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: .9rem; font-size: 1.3rem; }
.modalx { display: flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; margin: -.3rem -.4rem 0 0; padding: 0; border: 0; background: none; color: #3a2616; cursor: pointer; }
.modalx svg { width: 1.4rem; height: 1.4rem; display: block; }
.modalx:hover { color: #000; }
.setrow { display: flex; justify-content: space-between; align-items: center; gap: 1.5rem; padding: .6rem 0; border-top: 1px solid rgba(111, 87, 73, .45); font-size: 1.05rem; cursor: default; }
.setlabel { font-weight: 700; }
.setspeed { display: inline-flex; gap: .3rem; margin: 0; }
.setspeed button { min-width: 3rem; padding: .3rem .6rem; border: 1px solid #1b110a; border-radius: 6px; background: #e8dcb8; color: #3a2616; font: 700 1rem system-ui, sans-serif; cursor: pointer; }
.setspeed button:hover { background: #fff3cf; }
.setspeed button.on { background: #8fd1a8; }
.setswitch { appearance: none; -webkit-appearance: none; position: relative; width: 3rem; height: 1.6rem; margin: 0; border: 1px solid #1b110a; border-radius: 999px; background: #b9ab86; cursor: pointer; transition: background .15s; }
.setswitch::after { content: ""; position: absolute; top: 2px; left: 2px; width: calc(1.6rem - 6px); height: calc(1.6rem - 6px); border-radius: 50%; background: #fff3cf; border: 1px solid #1b110a; transition: left .15s; }
.setswitch:checked { background: #5cae78; }
.setswitch:checked::after { left: calc(3rem - 1.6rem + 2px); }
.forkpage #settings { display: none; }

/* ---- conservation projects like on BGA: a base with a dark green part (25 %, the icon(s) of the project) and a light green part (the three slots and their cubes). The base is drawn here, the icons and slots are the picture web/project_strips/<key>.webp (scripts/build_cards.py) laid over it; this replaces the cut of the card of the earlier rounds ---- */
.projslot { aspect-ratio: 1000 / 412; box-sizing: border-box; padding: 0; border: 0; border-radius: 5px; overflow: hidden; position: relative; background: linear-gradient(90deg, #528b43 25%, #c8d7c4 25%); box-shadow: 0 1px 3px rgba(0, 0, 0, .5); }
.shared .projpanel .projslot { align-self: center; height: auto; min-height: 0; }
.projslot .withtokens, .projslot .projline { width: 100%; height: 100%; gap: 0; }
.projstrip { position: relative; display: block; overflow: visible; border-radius: 0; box-shadow: none; }
.projstripart { display: block; width: 100%; height: 100%; }
.projstrip .blockcube { top: 50%; width: 11%; }
@media (max-width: 899px) { .projpanel .projslot { min-height: 0; } }
.projslot.projempty { background: rgba(255, 255, 255, .35); box-shadow: inset 0 0 0 1px rgba(27, 17, 10, .35); }       /* (no project there: a pale empty place, not the green base) */
.projslot .sbcenter { flex-direction: row; flex-wrap: wrap; gap: .3rem; }       /* (the sandbox's two buttons on an empty project place, which is only as high as a strip) */

/* ---- the numbers of money, appeal, conservation points and reputation use BGA's own font and settings (BGA's CSS `.player-info .icon-*`, `.icon-container .icon-*`): MyriadPro-Bold, letter-spacing -1px, text-indent -1px, font size = 0.625 x the height of the icon (20px on its 32px icons; reputation 19px), white on money and reputation, BLACK on appeal and conservation, no outline; everywhere on the page: the player panels (number over the icon, income over the money icon) and the conservation / reputation bonuses of the maps and the bonus tiles ---- */
@font-face { font-family: MyriadPro-Bold; font-style: normal; font-weight: 400; font-display: swap; src: url(/fonts/MyriadPro-Bold.woff) format("woff"); }
.rs.inside b, .rs.inside .income i { font-family: MyriadPro-Bold, system-ui, sans-serif; font-weight: 400; letter-spacing: -.05em; text-indent: -.05em; text-shadow: none; }
.rs.inside b { font-size: 1.625rem; }
.rs.inside.rs-reputation b { font-size: 1.55rem; }
.rs.inside.rs-appeal b, .rs.inside.rs-conservation b { color: #000; }
.rs.inside .income i { font-size: 1.3rem; }
.cons-number, .board .bonus-number, .ctcomposed .bonus-number { font-family: MyriadPro-Bold, system-ui, sans-serif; font-weight: 400; letter-spacing: -.05em; }
.cons-number { fill: #000; stroke: none; }
.cons-number.rep-number { fill: #fff; }
```
Why these choices: `.layout` must be `display: block` (replay.css still declares a grid for it). The sidebar is `position: fixed` because `sticky` stops at the end of its grid row. `overflow-x: clip` instead of `hidden` because `hidden` turns `<body>` into a scroll container. The 50 px heights are the product decision: move bar and tab switch are 50 px, the move bar may grow when its content wraps.

3.4 The shared area: the display element (display + the conservation track above + the reputation track below) and the association element (project area + association board + project area) are EXACTLY equally high. The two have different widths (at the 1920 design viewport about 904 px display : 652 px association, heights 391.4 px); the project areas no longer have to be as high as the conservation track (the old `--projh` coupling is removed from `layout.js` and `table.css`). Both elements have a fixed proportion: the display (zoomed `.displaybox`) height = 0.433 x width, the board 0.2955 x its width (aspect 2000 x 591), each project area has the height of its project strips (about 93 px at the 1920 design viewport; a strip keeps the aspect ratio 1000 : 412 of its width, see section 15; `fitDisplay()` measures the fixed part c every time, so the two heights stay equal: measured 393.03 / 393.02 at 1920 px, 523.0 / 523.0 at 2560 px), the association column adds two gaps (.5rem each). With W = the width of the shared area minus the grid gap, rd = display height / width, rb = board height / width and c = the fixed part of the association height (project areas + gaps = measured association height - rb x its width): rd x (W - wa) = rb x wa + c, so wa = (rd x W - c) / (rd + rb). `fitDisplay()` (below) measures rd, rb and c every time it runs (after every render and on resize), sets `--assocw` (px) on `#shared` and zooms the display to the remaining width. `.shared` in `table.css` is `grid-template-columns: minmax(0, 1fr) var(--assocw, 40rem)` (the fallback is only used before the first fit); on windows below 900 px (single column) the old rule is kept and the display is simply fitted to its column. Measured (the two heights, layout px): 1920 px window 391.36 / 391.38, 1500 px 389.66 / 389.7, 2560 px 390.19 / 390.19, in every step including the end of the game. The conservation track is always drawn, also when both players have passed 10 conservation (then without cubes; `conservationTrack()` in `shared.js` still returns the track with the remaining bonus tiles and only skips the cube of a player whose conservation is above 10), so the display keeps its height in every state. The `.projpanel` rules in `table.css` now are: `.shared .projpanel { box-sizing: border-box; }`, `.shared .projpanel .projslot { align-self: stretch; height: auto; min-height: 0; }`, `.shared .projpanel .projicon { height: auto; width: auto; max-width: 3.4rem; }`. `.shared > .displaycol` is `min-width: 0; overflow: hidden`, `.shared > .tablecol` is `flex: none; min-width: 0; max-width: none; width: auto`.

Verification: zero console errors in replay, fork, sandbox; the sidebar stays in place while scrolling at 1920x1080 and 1280x551; the Log tab shows the list with the current move centred; scripted fork / sandbox click sequences still work.

---

## 4. Sidebar module and the display fit

`web/js/sidebar.js` (new, complete):
```js
// [module] Sidebar: the Control | Log tabs, the log's scroll-follow, and fitting the info panel (player trackers) into the height left under the control panel.
import { $ } from './util.js';
import { S } from './state.js';

const TAB_KEY = 'sidebarTab';
function setTab(tab) {
  S.sbTab = tab === 'log' ? 'log' : 'control';
  for (const [id, name] of [['tabControl', 'control'], ['tabLog', 'log']]) {
    const b = $(id); if (!b) continue;
    b.classList.toggle('on', S.sbTab === name);
    b.setAttribute('aria-selected', String(S.sbTab === name));
  }
  $('paneControl').hidden = S.sbTab !== 'control';
  $('paneLog').hidden = S.sbTab !== 'log';
  try { localStorage.setItem(TAB_KEY, S.sbTab); } catch (e) { /* private window */ }
  fitSidebar();
  followLog(true);
}
export function setupSidebar() {
  $('tabControl').onclick = () => setTab('control');
  $('tabLog').onclick = () => setTab('log');
  let saved = 'control';
  try { saved = localStorage.getItem(TAB_KEY) || 'control'; } catch (e) { /* private window */ }
  setTab(saved);
}
// Keep the line of the step on show inside the visible part of the log (the list only, never the page). `center`: put it in the middle (after switching to the log).
export function followLog(center) {
  const list = $('moves'), li = list && list.children[S.step];
  if (!li || !list.clientHeight) return;
  if (center) list.scrollTop = li.offsetTop - (list.clientHeight - li.offsetHeight) / 2;
  else if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
  else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
}
// The info panel (#side) is laid out for SIDE_W px (19rem) and always zoomed to the full width of the sidebar; when it is then higher than the space under the control panel, the pane scrolls and shows a thin scrollbar, and the panel is then fitted to the width that is left (no scrollbar, no lost width when nothing scrolls).
// The control panel has the same height and the same top edge as the upper project area (at the top of the page), so the info boxes below it start at the top edge of the
// association board (the gap under the panel is the .5rem of the pane, the gap between project area and board is .5rem too). Page px = zoomed px / S.scale.
function alignControl(pane) {
  const bar = pane.querySelector('.bar'), proj = document.querySelector('.tablecol .projpanel');
  if (!bar || !proj) return;
  const k = S.scale || 1, pr = proj.getBoundingClientRect();
  pane.style.marginTop = '0px';
  const top = (pr.top + window.scrollY) / k, paneTop = pane.getBoundingClientRect().top / k;       // (the sidebar is fixed: its top is the viewport's)
  pane.style.marginTop = Math.max(0, top - paneTop) + 'px';
  const tl = $('timeline');
  bar.style.height = tl && !tl.hidden ? '' : pr.height / k + 'px';                 // (with the timeline row the panel is higher: its own height, only its top stays aligned)
}
window.addEventListener('load', () => fitSidebar());                       // (the project area has its final size once the pictures are loaded)
export function fitSidebar() {
  const pane = $('paneControl'), side = $('side');
  if (!pane || !side || pane.hidden) return;
  if (!S.scaled) { side.style.zoom = ''; side.parentElement.style.marginTop = ''; const b = pane.querySelector('.bar'); if (b) b.style.height = ''; side.style.removeProperty('--ppx-gap'); side.style.removeProperty('--ppx-badge'); side.style.removeProperty('--ppx-pad'); return; }       // phones: not handled yet
  alignControl(pane);
  const fitWidth = () => { side.style.zoom = 1; side.style.zoom = pane.clientWidth / side.offsetWidth; };
  fitWidth();
  spreadInfo(pane, side);
  if (pane.scrollHeight > pane.clientHeight) { fitWidth(); spreadInfo(pane, side); }       // (a scrollbar appeared and took some width: fit to what is left)
}
// The player boxes get a constant extra height, so that in the basic state (full window 16:9, no timeline row, no bonus-token row, no fork box) they fill the pane down to its bottom edge without a scrollbar.
// The extra is worked out for that state and for a window of at least 16:9 height (a lower window keeps the same extra and the pane scrolls); whatever else is visible only makes the pane scroll too (the boxes never shrink to avoid it).
// The extra goes to the icon rows (continents, species, science, rock, water): the badges grow as far as the column allows, with the number beside the badge (like BGA's .icons-summary) or below it,
// whichever lets the badge grow more; what is left moves the rows apart and is empty space at the bottom of each box.
// All measurements are viewport px; the CSS variables are in the layout px of #side (one px of it = k viewport px).
function spreadInfo(pane, side) {
  const bar = pane.querySelector('.bar'), proj = document.querySelector('.tablecol .projpanel');
  const boxes = [...side.querySelectorAll('.pp')];
  const reset = () => { side.classList.remove('ppbelow'); for (const v of ['--ppx-gap', '--ppx-badge', '--ppx-pad']) side.style.setProperty(v, '0px'); };
  reset();
  if (!bar || !proj || !boxes.length) return;
  const k = side.getBoundingClientRect().height / side.offsetHeight || 1;
  const pr = proj.getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(pane).rowGap || getComputedStyle(pane).gap) * (pane.getBoundingClientRect().height / pane.offsetHeight || 1);
  const baseTop = pr.bottom + gap;                                                  // the info boxes start here in the basic state (control panel as high as the project area)
  const paneBottom = pane.getBoundingClientRect().bottom + Math.max(0, window.innerWidth * 9 / 16 - window.innerHeight);       // (a window lower than 16:9 counts as 16:9)
  let extras = 0;                                                                   // height of the bonus-token rows (an additional element)
  for (const r of side.querySelectorAll('.bonusrow')) extras += r.getBoundingClientRect().height + parseFloat(getComputedStyle(r).marginTop) * k;
  const cols = S.replay && S.replay.marine_worlds ? 6 : 5;
  const colW = (boxes[0].querySelector('.ppicons') || side).offsetWidth / cols;      // layout px
  const plan = (below) => {
    reset(); side.classList.toggle('ppbelow', below);
    const e = Math.max(0, (paneBottom - baseTop - (side.getBoundingClientRect().height - extras) - 2) / boxes.length / k);       // free height per box
    const cap = below ? colW - 6 - 30 : colW - 20 - 30;                              // the badge may be as wide as the column minus its number
    const g = Math.max(0, Math.min(cap, e / 3 - 3));
    return { below, e, g };
  };
  const best = [plan(false), plan(true)].sort((a, b) => b.g - a.g)[0];
  reset(); side.classList.toggle('ppbelow', best.below);
  if (best.e < 1) return;
  const target = paneBottom - baseTop - 2;                                          // height the boxes (without the bonus rows) may have
  const apply = (g, rest) => {
    side.style.setProperty('--ppx-badge', g + 'px');
    side.style.setProperty('--ppx-gap', rest * 0.7 / 2 + 'px');
    side.style.setProperty('--ppx-pad', rest * 0.3 + 'px');
  };
  let g = best.g, rest = Math.max(0, best.e - 3 * g);
  for (let i = 0; i < 6; i++) {                                                     // (the numbers grow with the badges: correct what the estimate missed, the badge shrinks only if the spacing is used up)
    apply(g, rest);
    const over = (side.getBoundingClientRect().height - extras - target) / boxes.length / k;
    if (Math.abs(over) < 0.5) break;
    if (over > 0) { const cut = Math.min(rest, over); rest -= cut; g = Math.max(0, g - (over - cut) / 4); }
    else rest += -over;
  }
}
```

`web/js/layout.js`, `fitDisplay` (sets the width of the association element so that both elements are equally high, then zooms the display to the rest, see 3.4; it also waits for the pictures to load):
```js
// The display element (conservation track + folders + reputation track) and the association element (project area + board + project area) are exactly equally high. Both
// have a fixed proportion (the display: height = 0.433 x width, the board 0.2955 x its width, the two project areas a fixed height), so the widths that give one height follow
// from a linear equation: with W the width of the shared area without the gap, rd = height / width of the display, rb = of the board, c = the fixed height of the association
// element (project areas + gaps): rd * (W - wa) = rb * wa + c  ->  wa = (rd * W - c) / (rd + rb). The association element gets wa (--assocw on #shared, used by the grid in
// table.css), the display is zoomed to the rest. Without the scaled desktop layout (phones) the display is simply fitted to its column.
const DISPLAY_MAX = 1.1, DISPLAY_MIN = 0.3;
export function fitDisplay() {
  const box = document.querySelector('.displaybox'), shared = document.getElementById('shared');
  if (!box || !box.parentElement || !shared) return;
  const imgs = [...shared.querySelectorAll('img')].filter((i) => !i.complete);
  if (imgs.length) imgs.forEach((i) => i.addEventListener('load', fitDisplay, { once: true }));       // (the heights are only known when the pictures are loaded)
  const tc = shared.querySelector('.tablecol'), board = tc && tc.children[1];
  box.style.zoom = 1;
  const sc = S.scale || 1, rect = (e) => { const r = e.getBoundingClientRect(); return [r.width / sc, r.height / sc]; };       // (getBoundingClientRect is in zoomed px)
  const [nw, nh] = rect(box);
  let width = box.parentElement.clientWidth;
  if (S.scaled && tc && board && nw > 0 && getComputedStyle(shared).gridTemplateColumns.split(' ').length > 1) {
    const [tw, th] = rect(tc), [bw, bh] = rect(board);
    if (bw > 0) {
      const rd = nh / nw, rb = bh / bw, c = th - rb * tw;
      const gap = parseFloat(getComputedStyle(shared).columnGap) || 0, W = shared.clientWidth - gap;
      const wa = Math.max(300, Math.min(W * 0.6, (rd * W - c) / (rd + rb)));
      shared.style.setProperty('--assocw', wa + 'px');
      width = W - wa;
    }
  }
  box.style.zoom = Math.max(DISPLAY_MIN, Math.min(DISPLAY_MAX, width / nw));
  for (const pn of shared.querySelectorAll('.projpanel.pair')) {       // two spots in a panel made for three: shifted so that the space between the icon and the pair equals the space between the pair and the panel's right edge (measured after the widths are final)
    const icon = pn.querySelector('.projicon'), slots = pn.querySelectorAll('.projslot');
    if (!icon || !slots.length) continue;
    pn.style.setProperty('--shift', '0px');
    const k = S.scale || 1, ir = icon.getBoundingClientRect(), pr = pn.getBoundingClientRect(), first = slots[0].getBoundingClientRect(), last = slots[slots.length - 1].getBoundingClientRect();
    pn.style.setProperty('--shift', (((ir.right + pr.right) / 2 - (first.left + last.right) / 2) / k) + 'px');       // (equal space between the icon and the pair and between the pair and the right edge)
  }
  fitSidebar();       // (the control panel is aligned with the project area, whose place is final only now)
}
window.addEventListener('resize', () => { fitScale(); fitSidebar(); fitDisplay(); });
```
Removed from `layout.js` in the baseline-to-final step: `fitAside`, `setupDrawer`, `DRAWER_QUERY` and the narrow-window media-query test of the old `fitDisplay`.

Notes: the info panel (`#side`, the player trackers) is laid out for 19rem and zoomed by `fitSidebar` ALWAYS to the full width of the sidebar (never smaller because of the height: if it is then higher than the space under the control panel the pane scrolls, `#paneControl` has `overflow-x: hidden` and a thin scrollbar that exists only while it scrolls; `fitSidebar` fits the panel to the full width and, when a scrollbar then appears, once more to the width that is left; the second row of the control panel shrinks (the Move box is flexible) so that the Fork button is never cut; at 1920x1080 with the timeline off there is no vertical scroll). The control panel (`header.bar`) holds two rows (section 8.9): the playback buttons, and the settings button, the "Move" box and (replay) the Fork button; the settings pop-up can add the timeline as a third row between them (8.10). The title / home link ("Ark Nova Replay") and the table info line (`#tableInfo`: table id, Marine Worlds, the players, the engine summary "engine: 68/69 turns replayed ...") were removed on purpose: the elements are gone from the three HTML files and so are the JS lines that filled `#tableInfo` (`main.js` `init()` two statements, `fork.js` `initFork()`, `sandbox.js` two statements); the per-step engine mark in the move bar corner stays. The rules `.bar .home`, `#tableInfo` in `replay.css` are dead and were left. The hand dock is untouched.

---

## 5. Move bar content: no building pieces in the replay, a piece menu in the fork

5.1 Replay (`!FORK`): the building pieces are never shown. The decision frame of a Build prompt says only "<player> must build a building of size at most N" (N = the largest `size-N` piece in `o.pieces`; BGA says the same), with the action card badge before it; the step text frame says what was built ("X pays 8 for building a size-4 enclosure"). In `web/js/action-bar.js`, `genericBar()` has, right after the `who` element is created:
```js
  // The building pieces are not shown in the replay (they take a lot of space and say little): only the prompt, with the largest size that can be built, like BGA.
  if (!FORK && o.pieces && o.pieces.length) {
    const max = Math.max(0, ...o.pieces.map((p) => +((/^size-(\d)$/.exec(p.type) || [])[1] || 0)));
    bar.append(actionBadge(st), who, el('b', '', ' must build a building' + (max ? ' of size at most ' + max : '')));
    return;
  }
```
This covers every prompt that carries `o.pieces` (the Build action and effects that place a building). `piecesRow()` and the `PIECE_SCALE` use were deleted. (`actionBadge(st)` is the existing helper that draws the action card icon with its strength.)

5.2 Fork and sandbox: the pieces are the controls of the move, so they stay, but as a menu: one "Place a building" button in the move bar whose drop-down lists the pieces; the bar stays 50 px high. In `web/js/fork.js` `renderPlacementControls` the branch `if (!S.placement)` is:
```js
  if (!S.placement) {
    // one "Place building" button; its menu lists the pieces (a row of pieces would make the move bar tall)
    const row = el('div', 'forkrow placepick');
    const toggle = el('button', 'forkmove placetoggle', 'Place a building \u25BE');
    toggle.type = 'button'; toggle.disabled = S.forkBusy;
    toggle.title = 'Choose a piece, then click a hex of the zoo for its anchor';
    const menu = el('div', 'placemenu');
    menu.hidden = true;
    toggle.onclick = (ev) => {
      ev.stopPropagation();
      menu.hidden = !menu.hidden;
      if (!menu.hidden) {
        const close = (e) => { if (!menu.contains(e.target)) { menu.hidden = true; document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
      }
    };
    for (const p of pieces) {
      const b = el('button', 'forkmove piece');
      b.type = 'button'; b.disabled = S.forkBusy;
      b.style.setProperty('--pc', seatColor(seat));
      const sp = spriteOf({ type: p.type });
      if (sp) { const img = el('img'); img.src = '/enclosures/' + sp.image; img.alt = ''; const k = Math.min(0.12, 70 / sp.size[1]); img.style.width = (sp.size[0] * k) + 'px'; img.style.height = (sp.size[1] * k) + 'px'; b.append(img); }
      b.append(el('span', '', p.type.replace(/-/g, ' ') + (p.extra ? ' (additional)' : '') + ' - ' + p.n + ' spots'));
      b.onclick = () => {
        S.placement = { seat, type: p.type, extra: p.extra, x: null, y: null, rot: 0 };
        render();
        const board = document.querySelectorAll('.zoo')[seat];
        if (board) board.scrollIntoView({ block: 'center', behavior: 'smooth' });
      };
      menu.append(b);
    }
    row.append(toggle, menu);
    wrap.append(row);
```
The branch for a chosen piece (`else { ... }`: the head line with anchor / rotation / legal, the "Place the building" and "Choose another piece" buttons) is unchanged. The old `.placehead` line ("X can place a building: choose a piece ...") is no longer shown in the no-piece state. CSS: `.placepick`, `.placemenu`, `.movebar .actionbar .placectl` in `table.css` (section 3.3).

---

## 6. Card preview appears after a delay

All enlarged cards (hand, display, endgame, action cards, projects: everything that calls `showPreview` on `mouseenter` and `hidePreview` on `mouseleave`) appear only after the pointer rested on the card for 1000 ms; leaving the card cancels the timer. A finger tap shows the preview at once. Do not key on `matchMedia('(hover: hover)')`: touch laptops answer `none` and would never get the delay; the last pointer type is used instead. In `web/js/cards.js`:
```js
// The enlarged card appears only after the pointer has rested on a card for PREVIEW_DELAY ms (a tap on a touch screen shows it at once; the device is told apart by the last pointer used, not by the `hover` media query, which
// touch laptops answer with "none")
const PREVIEW_DELAY = 1000;
let previewTimer = 0, lastTouch = false;
document.addEventListener('pointerdown', (e) => { lastTouch = e.pointerType === 'touch'; }, true);
document.addEventListener('pointermove', (e) => { lastTouch = e.pointerType === 'touch'; }, true);
export function showPreview(src, centered) {
  clearTimeout(previewTimer);
  const show = () => { const p = $('preview'); p.classList.toggle('center', !!centered); p.src = src; p.hidden = false; };
  if (lastTouch) show(); else previewTimer = setTimeout(show, PREVIEW_DELAY);
}
export function hidePreview() { clearTimeout(previewTimer); $('preview').hidden = true; }
```
The listeners that call `showPreview` / `hidePreview` are unchanged.

---

## 7. No native tooltips on pictures

Rule: a picture never has a tooltip (the text a browser shows after a hover). Implemented once, in `web/js/notips.js` (new, complete), called from `main.js` `init()` (`import { setupNoTips } from './notips.js'` and `setupNoTips();`):
```js
// [module] No native tooltips on pictures. One rule: a PICTURE never has a tooltip (the text a browser shows after a hover), so the tooltip is removed from
//   - every <img> and every SVG (the boards, tracks, cubes, zoo maps: the `title` attribute and the <title> child elements),
//   - everything inside the conservation project panel and the reputation upgrade marker (PICTURE_ZONES),
//   - any element that holds an image / SVG and has no text of its own (cards, icons).
// Buttons, links, inputs and elements with text keep theirs. It runs on every DOM change, so no other code has to know about it: set `title` wherever it helps
// (it is still the accessible name), and it is dropped here. To show a tooltip on a picture again, remove it from the rule below (or drop the setupNoTips() call).
const PICTURE_ZONES = '.projpanel, .repupgrade';       // add a selector here to silence a whole area
const PICTURE = 'img, svg';
const KEEP = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL']);

const isPicture = (n) => n.matches(PICTURE) || !!n.closest(PICTURE + ', ' + PICTURE_ZONES) || (!!n.querySelector(PICTURE) && !n.textContent.trim());

function strip(root) {
  root.querySelectorAll('svg title').forEach((t) => t.remove());                          // (SVG tooltips are <title> children)
  for (const n of [root, ...root.querySelectorAll('[title]')]) {
    if (n.hasAttribute && n.hasAttribute('title') && !KEEP.has(n.tagName) && isPicture(n)) n.removeAttribute('title');
  }
}

export function setupNoTips() {
  let queued = false;
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; strip(document.body); }); } })
    .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  strip(document.body);
}
```
- Nothing else in the code base changes: code keeps setting `title` / `<title>` wherever it is, and the module removes it where the element is a picture (all images and SVG: boards, association board, tracks, track cubes, blocked cubes, zoo maps and their bonus markers; everything in the base conservation project panel `.projpanel`; the reputation upgrade marker `.repupgrade`; elements that only hold an image or SVG, such as cards and icons).
- Kept on purpose: tooltips of `button`, `a`, `input`, `select`, `textarea`, `label` and of elements with their own text (control-panel buttons and timeline, dock buttons, engine badges, the info-panel counters for money, X tokens, reputation and the small animal / continent icons).
- To silence another area add a selector to `PICTURE_ZONES`; to switch the feature off remove the `setupNoTips()` call.

Verification: after rendering a step, `document.querySelectorAll('svg title, svg [title], img[title], .projpanel [title], .card[title]').length` is 0.

---

## 8. Visual details

8.1 Label: the jump box in the control panel reads "Move" instead of "Step" (`<label class="jump">Move <input id="jump" ... aria-label="Jump to move"></label>` in the three pages (see 8.9: the "/ total" is gone)).

8.2 Action colours (`web/css/replay.css`): unupgraded `#1d9ad6` -> `#009fe2`, upgraded `#e04fd0` -> `#a91b71`. Exactly these rules:
```css
.ac { display: inline-flex; border: 3px solid #009fe2; border-radius: 8px; background: #fff; }
.ac.lvl2 { border-color: #a91b71; }
.abtn { background: #009fe2; border-color: #006a98; }
.abtn.lvl2 { background: #a91b71; border-color: #6e1148; }
```
The pink reputation upgrade disc `.repupdisc` (`#e04fd0`) is not an action card and keeps its colour. An older `.abtn.lvl2 { background: #7a3fb0 ... }` rule earlier in the file is overridden by the later rule above; leave it.

8.3 Donations on the association board are cubes of the player's colour (not worker meeples). `web/js/association.js`, in `associationBoard()` replacing the old blocked-cube loop and the donation worker loop; the workers of the tasks 2-5 stay meeples (`workerAt`):
```js
  // a cube like the ones on the base projects (isometric, three shades of the colour), centred on (x, y)
  const cubeAt = (x, y, colour, tip) => {
    const g = svg('g', { transform: 'translate(' + x + ' ' + (y - 2) + ') scale(1.55)' });
    const edge = mix(colour, '#000000', .6);
    for (const [pts, fill] of [['0,-19 19,-9 0,2 -19,-9', mix(colour, '#ffffff', .45)], ['-19,-9 0,2 0,21 -19,10', colour], ['19,-9 0,2 0,21 19,10', mix(colour, '#000000', .3)]]) {
      g.append(svg('polygon', { points: pts, fill, stroke: edge, 'stroke-width': 1.3, 'stroke-linejoin': 'round' }));
    }
    if (tip) { const t = svg('title'); t.textContent = tip; g.append(t); }
    s.append(g);
  };
  const blocked = unusedColor();                     // 2 players: the left donation cells of 5 / 7 / 10 money are covered by cubes of a colour nobody plays
  for (const k of [1, 3, 5]) cubeAt(ASSOC.donation[k][0], ASSOC.donation[k][1], blocked, 'Blocked in a 2 player game');
  ASSOC.donation.forEach(([x, y], k) => (at['association_0_' + k] || []).forEach((seat) => cubeAt(x, y, seatColor(seat), S.replay.players[seat].name + ': donation')));      // a donation is a cube of the player's colour
```

8.4 The heading "Display" above the display row is removed: in `web/js/shared.js` the line `root.append(section('Display', box, 'sect displaycol'));` became
```js
  const dispcol = el('div', 'sect displaycol');                      // (no heading: the display is easy to recognise)
  dispcol.append(box);
  root.append(dispcol);
```
The sandbox setup panel has its own "Display" section (`sandbox.js`, `sec('Display', disp)`); it is unchanged.

8.5 A card the viewer selects with a click (hand and endgame cards of the dock, display cards in the fork: class `.marked` on `.card`, set by `cards.js` as before) is drawn like on BGA (copied from a BGA screenshot): a thin green frame, and in the middle of the card (centre at 35% of its height) a light translucent rounded square, 46% of the card width, with a big green check mark (an inline SVG as background, so no extra element). It used to be a yellow outline with a glow. In the fork the colour is blue (the choice is confirmed afterwards). The cards of the action card draft that the viewer highlights with a click (`.draftcard.marked`) get the same frame and centre check mark (square at 30% of the height, the card is taller); the picked ones keep their own style: the green frame and the check circle on the corner (`.draftcard.picked` with `.draftcheck`), also when highlighted. In the fork the highlight is blue. Appended at the end of `web/css/replay.css` (it must come after the older `.card.marked` / `.draftcard.marked` rules, which it overrides; the `.forkpage` rules repeat the selector because the older ones are as specific):
```css
/* a hand / endgame / display card the viewer selected with a click, as on BGA: a thin green frame and a big green check mark in a translucent light rounded square in the
   middle of the card (blue in the fork, where the choice is confirmed afterwards) */
.card.marked, .folder .card.marked { outline: 3px solid #4cae4f; outline-offset: -1px; box-shadow: 0 2px 6px rgba(0, 0, 0, .5); }
.card.marked::after, .draftcard.marked::after { content: ''; position: absolute; left: 50%; top: 35%; z-index: 3; width: 46%; aspect-ratio: 1; transform: translate(-50%, -50%); border-radius: 12%; pointer-events: none;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M18 54 L40 76 L84 26' fill='none' stroke='%232fa843' stroke-width='17' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 78% no-repeat, rgba(238, 238, 238, .82); }
.forkpage .card.marked, .forkpage .folder .card.marked { outline-color: #2f80e8; }
.forkpage .card.marked::after, .forkpage .draftcard.marked::after { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M18 54 L40 76 L84 26' fill='none' stroke='%232f80e8' stroke-width='17' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); }

/* the same for the cards of the action card draft that the viewer highlights with a click (the picked ones keep their green frame and the check mark on the corner) */
.draftcard.marked::after { top: 30%; }       /* (the draft card is taller than a hand card: keep the square on the artwork) */
.draftcard.marked { outline: 3px solid #4cae4f; outline-offset: -1px; box-shadow: 0 2px 6px rgba(0, 0, 0, .5); }
.draftcard.picked.marked { outline: 4px solid #2ebe54; outline-offset: 1px; box-shadow: 0 2px 6px rgba(0, 0, 0, .5); }
.forkpage .draftcard.marked { outline: 3px solid #2f80e8; outline-offset: -1px; box-shadow: 0 2px 6px rgba(0, 0, 0, .5); }
.forkpage .draftcard.picked.marked { outline: 4px solid #2ebe54; outline-offset: 1px; box-shadow: 0 2px 6px rgba(0, 0, 0, .5); }
```



8.6 The hand and endgame cards in the dock can be dragged to a new position within their own row (display only; the game data is untouched). Per page session only (a module-level `userOrder` in `web/js/cards.js`: zone `seat:hand` / `seat:endgame` -> card keys, dropped when `S.replay` changes; lost on F5, deliberately). `orderedKeys(zone, keys)` merges every step's own card list with it: cards in the stored order first, newly arrived cards appended, departed cards dropped, duplicates matched one by one. `cardRow(..., markable=true)` (the dock) draws the ordered keys and, when the row has more than one visible card (no hidden `'?'` cards), makes the cards `draggable` (`dragRow`): while dragging, the dragged card moves live in the row (HTML5 `dragover`), on `dragend` the new order is stored, the click selections (`cardMarks`, index based) are re-mapped to the new indices and the event `cardorder` is dispatched; `dock.js` listens and re-draws the dock inside `quietly(...)` (no arrival / departure flash). Because the selection marks count in the displayed order, `fork.js` `marked(zone, keys)` runs the state's list through `orderedKeys` first. Cards have `data-key`. CSS (end of `replay.css`): `.dockpanel .card[draggable="true"] { cursor: grab }`, `.dockpanel .card.dragging { opacity: .35; cursor: grabbing; }`.
```js
// The order the viewer gave his hand / endgame cards by dragging them (display only, kept for this page session): zone -> card keys.
// The game data stays untouched: every step's own list is merged with it (cards in the stored order first, newly arrived cards at the end).
const userOrder = {};
let orderReplay = null, quiet = false;
const reorderable = (zone, keys) => !!zone && /:(hand|endgame)$/.test(zone) && keys.length > 1 && keys.every((k) => k && k !== '?');
export function orderedKeys(zone, keys) {
  if (orderReplay !== S.replay) { for (const z of Object.keys(userOrder)) delete userOrder[z]; orderReplay = S.replay; }
  const stored = userOrder[zone];
  if (!stored || !reorderable(zone, keys)) return keys;
  const left = keys.slice(), out = [];
  for (const k of stored) { const i = left.indexOf(k); if (i >= 0) { out.push(k); left.splice(i, 1); } }       // (duplicates are matched one by one)
  return out.concat(left);
}
export function quietly(fn) { quiet = true; try { fn(); } finally { quiet = false; } }           // (re-drawing without the arrival / departure flashes)
function dragRow(row, zone, shown, nodes) {                              // cards of this row can be dragged to another position within the row
  let dragged = null;
  nodes.forEach((node) => {
    if (!node.classList || node.classList.contains('card-gone')) return;
    node.draggable = true;
    node.querySelectorAll('img').forEach((im) => { im.draggable = false; });
    node.addEventListener('dragstart', (e) => { dragged = node; node.classList.add('dragging'); hidePreview(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); });
    node.addEventListener('dragover', (e) => {
      if (!dragged || dragged === node) return;
      e.preventDefault();
      const r = node.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      const ref = after ? node.nextSibling : node;
      if (ref !== dragged && dragged.nextSibling !== ref) row.insertBefore(dragged, ref);
    });
    node.addEventListener('dragend', () => {
      node.classList.remove('dragging');
      if (dragged !== node) return;
      dragged = null;
      const live = [...row.children].filter((n) => n.dataset && n.dataset.key);
      const keys = live.map((n) => n.dataset.key);
      if (keys.join('|') === shown.join('|')) return;
      const marked = shown.filter((k, i) => cardMarks.has(zone + '#' + i));                     // the highlighted cards stay highlighted
      for (const m of [...cardMarks]) if (m.startsWith(zone + '#')) cardMarks.delete(m);
      const left = keys.slice();
      for (const k of marked) { const i = left.indexOf(k); if (i >= 0) { cardMarks.add(zone + '#' + i); left[i] = null; } }
      userOrder[zone] = keys;
      document.dispatchEvent(new Event('cardorder'));
    });
  });
}
export function cardRow(rawKeys, cls, emptyText, zone, dimmed, markable) {
```



8.7 Small cosmetics (all final):
- Player name in the info box (`side-panel.js`): an `<a class="ppname">` (was `<b>`) with `href="https://boardgamearena.com/player?id=" + encodeURIComponent(players[seat].id)` (the id is `replay.players[seat].id`, a string, from the log), `target="_blank"`, `rel="noopener noreferrer"`; it still has the seat colour as inline `color`. CSS (end of `replay.css`): `a.ppname { font-weight: 700; text-decoration: none; }` (so it looks exactly like the old bold text). A name whose colour is light (luma `(0.299 r + 0.587 g + 0.114 b) / 255 > 0.6`, i.e. yellow / white; function `isLight` in `side-panel.js`) gets the class `light`: `a.ppname.light { -webkit-text-stroke: 4px #000; paint-order: stroke fill; }` = a black outline of 2 px (the stroke is painted first and the letters over it, so only its outer half shows; a plain `text-shadow` outline was barely visible). The name is 2 px bigger: `.ppname { font-size: calc(1.05rem + 2px); }` in `replay.css`.
- The step text in the move bar is bold: `.movebar .current` has `font-weight: 700` in `table.css` (was 500; `.engine-detail` keeps its own 400).
- The upper project area (conservation projects in play) has two spots in a panel made for three: `projectPanel()` in `projects.js` adds the class `pair` when `count < 3`; at the end of `fitDisplay()` (`layout.js`, after the widths are final) `--shift` (px) is set on each `.projpanel.pair` so that the empty space between the icon and the pair equals the empty space between the pair and the panel's right edge (the icon is NOT counted into the centring): `shift = ((iconRight + panelRight) / 2 - (firstSpotLeft + lastSpotRight) / 2) / S.scale`, measured with `--shift: 0px`; `.shared .projpanel.pair .projslot { transform: translateX(var(--shift, 0px)); }` (already part of the complete `table.css` of 3.3). Measured at 1920: 103.31 px on both sides. The spots keep the size of the base project area's spots.



8.8 The point of view is set by an eye next to each player's name in the info box; the three POV buttons ("All hands", player 1, player 2) of the control panel are gone (their markup `<div id="pov" class="pov">` in `replay.html`, `fork.html`, `sandbox.html`, the `.pov` / `.povbtn` / `.povicon` / `.povname` rules in `replay.css` and `.sidebar .pov` in `table.css` are deleted, `setupPov()` and the localStorage key `pov` are removed, so the control panel is shorter and `fitSidebar()` gives the info boxes more room).
- Meaning: an open eye = that player's cards are shown. `S.pov === null` = both eyes open (the old "All hands"), `S.pov === 0` / `1` = only that seat's eye is open (the old button of that player: the other player's hand, endgame cards, draw pile contents and the draft offers are hidden). The closed eye is the open eye struck through with a diagonal line and drawn faded (`.poveye.closed`, 55% opacity colour). Both eyes cannot be closed: the only open eye is locked (clicking does nothing; its tooltip says so). Clicking a closed eye opens it (both open); clicking an open eye while both are open closes it (the other one stays open).
- Default: the first time a table is opened (replay, sandbox, everything else) only the eye of seat 0 (the player whose zoo is on the left / on top) is open, `S.pov = 0`. After that the eyes are remembered per table, also over F5: localStorage key `pov:<table id>` (`pov:local` when there is no table id; in practice only a theoretical case, since the sandbox counts as `FORK` and therefore never touches localStorage) with the value `all` | `0` | `1`, written by `applyPov()` on every change; it lives in the browser's site data until the user clears it. A fork (`fork.html`, opened in a new tab by the Fork button) inherits the eyes of the replay at that moment: the Fork button (`main.js`) appends `&pov=all|0|1` to the URL (the fork's 'Copy link' adds it too), `pov.js` reads it when `FORK`; the fork does not read or write localStorage, so toggling eyes in a fork tab does not change the replay's. Without a `pov` parameter a fork starts with seat 0's eye like everything else. In a fork the info boxes have eyes too; with a hand hidden its cards cannot be clicked, so open the eye of the player who has to act.
- Code. `pov.js` (the rest of the module is unchanged: `hides`, `povState`, `curState`, `labelOf`; `applyPov()` no longer calls `setupPov()`, it rewrites the labels of the move list for the new point of view and calls `render()`):
```js
// The eyes are remembered per table in localStorage ('pov:<table>': 'all' | '0' | '1'), also over F5; the first time only the first player's eye is open (his zoo is the left one).
// A fork (opened in a new tab from a replay) does not use the storage: it takes the eyes of the replay from the URL (`&pov=`, see `povParam`) and changes them only in its own tab.
const POV_KEY = 'pov:' + (table || 'local');
const readPov = (v) => (v === 'all' ? null : v === '0' ? 0 : v === '1' ? 1 : undefined);
export const povParam = () => (S.pov === null ? 'all' : String(S.pov));
{ let v; try { v = readPov(FORK ? params.get('pov') : localStorage.getItem(POV_KEY)); } catch (e) { /* no storage */ } S.pov = PLAY ? null : v === undefined ? 0 : v; }       // (a live game: the server already left out what this seat may not see, nothing is hidden by the page)
```
```js
export const eyeOpen = (seat) => S.pov === null || S.pov === seat;
export const eyeLocked = (seat) => S.pov === seat;                    // (the only open eye)
export function toggleEye(seat) {
  if (eyeLocked(seat)) return;
  S.pov = eyeOpen(seat) ? S.replay.players.findIndex((_, i) => i !== seat) : null;
  applyPov();
}
```
`side-panel.js` (the header of every info box: `<span class="who">` holds the name link and the eye button, then the score; the eye is redrawn from `S.pov` on every `render()`):
```js
function eyeButton(seat) {                                          // open eye = this player's cards are shown; the only open eye cannot be closed
  if (PLAY) return document.createTextNode('');                     // (a live game: no eyes, the server decides what a seat sees)
  const open = eyeOpen(seat), locked = eyeLocked(seat), nm = S.replay.players[seat].name;
  const b = el('button', 'poveye' + (open ? '' : ' closed') + (locked ? ' only' : ''));
  b.type = 'button';
  b.title = locked ? nm + "'s cards are shown (at least one player's cards must stay visible)" : open ? 'Hide ' + nm + "'s cards" : 'Show ' + nm + "'s cards";
  b.setAttribute('aria-label', b.title); b.setAttribute('aria-pressed', String(open));
  const g = svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  g.append(svg('path', { d: 'M2 12C5 6.5 8.5 4.5 12 4.5S19 6.5 22 12C19 17.5 15.5 19.5 12 19.5S5 17.5 2 12Z' }), svg('circle', { cx: 12, cy: 12, r: 3.2, fill: 'currentColor' }));
  if (!open) g.append(svg('path', { d: 'M3.5 3.5L20.5 20.5', 'stroke-width': 2.6 }));         // closed: the same eye, struck through (and faded by .poveye.closed)
  b.append(g);
  b.onclick = () => toggleEye(seat);
  return b;
}
```
```js
    const who = el('span', 'who');
    who.append(name);
    who.append(eyeButton(seat));
    const cb = clockBadge(seat);                                            // the clock of the time control, to the right of the name
    head.append(...(cb ? [who, cb, score] : [who, score]));
```
CSS (end of `replay.css`):
```css
.poveye { display: inline-flex; align-items: center; justify-content: center; width: 1.9rem; height: 1.6rem; margin-left: .35rem; padding: 0; border: 0; border-radius: 6px; background: transparent; color: #3a2616; cursor: pointer; vertical-align: middle; }
.poveye:hover { background: rgba(58, 38, 22, .14); }
.poveye.closed { color: rgba(58, 38, 22, .55); }
.poveye.only { cursor: default; }
.poveye.only:hover { background: transparent; }
.poveye svg { width: 1.45rem; height: 1.45rem; }
.pphead .who { display: inline-flex; align-items: center; }
```
`main.js` no longer imports or calls `setupPov`; it imports `povParam` for the Fork button: `window.open('/fork.html?table=' + encodeURIComponent(table) + '&step=' + S.step + '&pov=' + povParam(), '_blank')`. `applyPov()` starts with `if (!FORK) { try { localStorage.setItem(POV_KEY, povParam()); } catch (e) { /* no storage */ } }`.



8.9 Control panel: two rows (the old POV buttons are gone, see 8.8; the timeline and the speed buttons live in the settings pop-up, see 8.10). In `replay.html`, `fork.html`, `sandbox.html` the `<header class="bar">` is now (the Fork button exists only in `replay.html`):
```html
<header class="bar">
  <div class="controls" role="group" aria-label="Replay controls">
    <button id="first" ...>&#9198;</button> <button id="prev" ...>&#9194;&#xFE0E;</button> <button id="play" ...>&#9654;</button>
    <button id="next" ...>&#9193;&#xFE0E;</button> <button id="last" ...>&#9197;</button>
  </div>
  <div id="timeline" class="timeline" role="slider" aria-label="Game timeline" title="Timeline: each | is the start of a round" hidden></div>   <!-- shown only when switched on in the settings pop-up (8.10) -->
  <div class="controls controls2" role="group" aria-label="Settings, move and fork">
    <button id="settings" class="settingsbtn" title="Settings (S)" aria-label="Settings"><svg class="gearicon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M10.29 3.57 L10.57 1.09 L13.43 1.09 L13.71 3.57 L16.75 4.83 L18.70 3.28 L20.72 5.30 L19.17 7.25 L20.43 10.29 L22.91 10.57 L22.91 13.43 L20.43 13.71 L19.17 16.75 L20.72 18.70 L18.70 20.72 L16.75 19.17 L13.71 20.43 L13.43 22.91 L10.57 22.91 L10.29 20.43 L7.25 19.17 L5.30 20.72 L3.28 18.70 L4.83 16.75 L3.57 13.71 L1.09 13.43 L1.09 10.57 L3.57 10.29 L4.83 7.25 L3.28 5.30 L5.30 3.28 L7.25 4.83Z M12 8.4a3.6 3.6 0 1 0 0 7.2a3.6 3.6 0 1 0 0-7.2Z"/></svg></button>   <!-- an inline SVG cogwheel (8 teeth, hole), sized by `.settingsbtn .gearicon`, coloured by `currentColor` -->
    <label class="jump">Move <input id="jump" type="number" min="0" aria-label="Jump to move"></label>
    <button id="fork" class="forkbtn" ...>&#9095; Fork</button>
  </div>
</header>
```
Row 1: the five playback buttons (unchanged ids and behaviour). Row 2: the settings wheel (`#settings`, an inline-SVG cogwheel; it opens the settings pop-up, 8.10), the "Move" box showing the current step number only (no "/ total" any more: `#total` is removed from the HTML and the two JS lines that filled it and the `max` attribute of `#jump` are removed from `main.js` and `fork.js`), and the Fork button. Entering a move number larger than the last one jumps to the end (the last frame of the last step); a smaller number than 0 goes to 0; the box then shows the real step number again (`render()` sets `$('jump').value = S.step`):
```js
  $('jump').onchange = (e) => {                                          // a move number past the end jumps to the end (its last frame)
    const n = parseInt(e.target.value, 10) || 0;
    if (n >= S.replay.steps.length - 1) go(S.replay.steps.length - 1, 99); else go(Math.max(0, n));
  };
```
CSS in `table.css` (control panel block): `.sidebar .controls` is a no-wrap row with `justify-content: space-between`:
```css
.sidebar .controls { margin: 0; flex-wrap: nowrap; justify-content: space-between; gap: .4rem; }
.sidebar .controls .jump { margin-left: 0; display: inline-flex; align-items: center; gap: .4rem; flex: 1 1 0; min-width: 0; font-weight: 700; color: #f1d9a0; }
.sidebar .controls .jump input { flex: 1 1 0; min-width: 0; width: 3rem; }
.sidebar .controls button { flex: 0 1 3rem; min-width: 0; padding-top: .2rem; padding-bottom: .2rem; }
.sidebar .controls .forkbtn, .sidebar .controls .settingsbtn { flex: 0 0 auto; }
.sidebar .controls .forkbtn { min-width: 0; padding-left: .8rem; padding-right: .8rem; }
.sidebar .controls .settingsbtn { line-height: 1; padding-top: 0; padding-bottom: 0; display: inline-flex; align-items: center; justify-content: center; }
.settingsbtn .gearicon { width: 1.9rem; height: 1.9rem; display: block; }
```
Alignment with the table: the control panel has the SAME top edge and height as the upper project area, and the info panel (`#side`) starts at the top edge of the association board (page at scroll position 0; the sidebar is fixed, the page scrolls). `fitSidebar()` (`sidebar.js`) calls `alignControl(pane)` first: it measures the first `.tablecol .projpanel` (top = `rect.top + scrollY`, height; divide zoomed px by `S.scale`), sets `margin-top` on `#paneControl` so that the control panel starts at that y, and sets the control panel's height to the project area's (91.3 layout px at the design size; `box-sizing: border-box`, `flex-wrap: nowrap`, the two rows are compacted to fit: panel padding .25rem .65rem, button padding .2rem). The gap between control panel and info panel (the pane's `row-gap` .5rem) equals the gap between project area and board (.5rem), so no further offset is needed. `fitSidebar()` is also run on `window` `load` (the project area only has its final size once pictures are loaded). The settings wheel is drawn large (`font-size: 1.9rem`). On the fork page (the `#forkinfo` box sits between control panel and info) the control panel is aligned, the info panel is not.
```js
// The control panel has the same height and the same top edge as the upper project area (at the top of the page), so the info boxes below it start at the top edge of the
// association board (the gap under the panel is the .5rem of the pane, the gap between project area and board is .5rem too). Page px = zoomed px / S.scale.
function alignControl(pane) {
  const bar = pane.querySelector('.bar'), proj = document.querySelector('.tablecol .projpanel');
  if (!bar || !proj) return;
  const k = S.scale || 1, pr = proj.getBoundingClientRect();
  pane.style.marginTop = '0px';
  const top = (pr.top + window.scrollY) / k, paneTop = pane.getBoundingClientRect().top / k;       // (the sidebar is fixed: its top is the viewport's)
  pane.style.marginTop = Math.max(0, top - paneTop) + 'px';
  const tl = $('timeline');
  bar.style.height = tl && !tl.hidden ? '' : pr.height / k + 'px';                 // (with the timeline row the panel is higher: its own height, only its top stays aligned)
}
window.addEventListener('load', () => fitSidebar());                       // (the project area has its final size once the pictures are loaded)
```
8.10 Settings pop-up and the optional timeline row (`web/js/settings.js`, new module; called once from `main.js` `init()` as `setupSettings()`, which replaced the old wiring of the `.speed` buttons). The gear button `#settings` (second row) opens `#settingsModal` (appended to `<body>` by the module): a modal in the middle of the window, the page behind it dimmed (`rgba(15,9,4,.6)`). Content: heading "Settings" with a close button (no box: a thick inline-SVG X, stroke 4.2 in a 24 viewBox, top right, `.modalx`); row "Autoplay speed" (buttons 1x / 2x / 4x, class `.speed.setspeed`, the active one has `.on`; click calls `setSpeed(v)` from `playback.js`); row "Timeline in the control panel" (checkbox styled as a switch, `.setswitch`). Defaults: speed 1x, timeline OFF. Both settings are saved in `localStorage` under the key `settings` as `{speed, timeline}` (global, not per table) and restored at start; `S.speed` and `S.showTimeline` (new in `state.js`, default false) hold them. The S key opens and closes it (`toggleSettings()` in `settings.js`, called from the `main.js` keydown handler before the other-shortcuts guard; ignored while typing in an input and on pages without a gear, i.e. the fork page); the gear's tooltip is "Settings (S)". The modal closes on S, on the close button, on a click on the dimmed background and on Escape (capture-phase keydown that stops propagation). While it is open the global keyboard shortcuts are ignored (`main.js` keydown guard `if (settingsOpen() || ...) return`). The gear is hidden on the fork page (`.forkpage #settings { display: none; }`), because the fork page has no timeline and no autoplay either.
The timeline: `<div id="timeline" class="timeline" ... hidden>` is the MIDDLE child of `header.bar` (between the two `.controls` rows, see the markup in 8.9); `applyTimeline()` toggles its `hidden` attribute from `S.showTimeline` and calls `fitSidebar()`. `buildTimeline()` / `updateTimeline()` in `playback.js` are unchanged and tolerate a missing element. CSS in `table.css`: `.sidebar .timeline { flex: 0 0 1.6rem; width: 100%; max-width: none; margin: 0; }` and `.timeline[hidden] { display: none; }`; The buttons of the control rows may shrink (`.sidebar .controls button { flex: 0 1 3rem; min-width: 0; }`, the gear and Fork button `flex: 0 0 auto`, the Move box is flexible) so that, when the sidebar is narrowed by its vertical scrollbar, the right edge of the End button and of the Fork button stay aligned and nothing is cut. the generic `.timeline`, `.tlseg`, `.tlhead`, `.speed` rules stay in `replay.css`, and `.forkpage #timeline, .forkpage .speed, .forkpage #play { display: none; }` stays too. Alignment exception: with the timeline OFF the control panel has exactly the height and top edge of the upper project area (8.9); with it ON the panel keeps only the top edge, its height becomes automatic (about 115px instead of 91px) and everything below (info panel) moves down; `alignControl()` in `sidebar.js` (code above) does this by clearing `bar.style.height` while the timeline is visible. `fitSidebar()` is also called at the END of `fitDisplay()` (`layout.js`) because the project area only gets its final place and height after the display is fitted; without this the panel was measured too early and came out squashed.
Complete module:
```js
// [module] Settings pop-up (the wheel in the control panel): the autoplay speed and the switch that adds the timeline to the control panel. Both are remembered in the browser.
import { $, el } from './util.js';
import { S } from './state.js';
import { setSpeed } from './playback.js';
import { fitSidebar } from './sidebar.js';

const KEY = 'settings';                                                    // localStorage: { speed: 1 | 2 | 4, timeline: boolean }
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ speed: S.speed, timeline: S.showTimeline })); } catch (e) { /* no storage */ } };
export const settingsOpen = () => { const m = $('settingsModal'); return !!m && !m.hidden; };
export function toggleSettings() {
  const m = $('settingsModal'), g = $('settings');
  if (!m || !g || g.offsetParent === null) return;                 // (no gear on the page, e.g. the fork page: no settings)
  if (m.hidden) { m.hidden = false; m.querySelector('.modalx').focus(); } else close();
}
function close() { const m = $('settingsModal'); if (m) m.hidden = true; }
// the timeline is a row of its own between the two button rows of the control panel; without it the control panel is as high as the upper project area (sidebar.js)
export function applyTimeline() {
  const t = $('timeline');
  if (t) t.hidden = !S.showTimeline;
  fitSidebar();
}
export function setupSettings() {
  const st = read();
  S.showTimeline = st.timeline === true;                                   // default: off
  S.speed = [1, 2, 4].includes(st.speed) ? st.speed : 1;                  // default: 1x
  const modal = el('div', 'modal'); modal.id = 'settingsModal'; modal.hidden = true;
  const box = el('div', 'modalbox'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Settings');
  const head = el('div', 'modalhead');
  const x = el('button', 'modalx'); x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4L20 20M20 4L4 20" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" fill="none"/></svg>'; x.type = 'button'; x.title = 'Close (Esc)'; x.setAttribute('aria-label', 'Close'); x.onclick = close;
  head.append(el('b', '', 'Settings'), x);
  const speedRow = el('div', 'setrow');
  const sp = el('span', 'speed setspeed'); sp.setAttribute('role', 'group'); sp.setAttribute('aria-label', 'Autoplay speed');
  for (const v of [1, 2, 4]) {
    const b = el('button', '', v + 'x'); b.type = 'button'; b.dataset.speed = String(v); b.title = 'Autoplay at ' + v + 'x';
    b.onclick = () => { setSpeed(v); save(); };
    sp.append(b);
  }
  speedRow.append(el('span', 'setlabel', 'Autoplay speed'), sp);
  const tlRow = el('label', 'setrow');
  const sw = el('input'); sw.type = 'checkbox'; sw.className = 'setswitch'; sw.checked = S.showTimeline;
  sw.onchange = () => { S.showTimeline = sw.checked; save(); applyTimeline(); };
  tlRow.append(el('span', 'setlabel', 'Timeline in the control panel'), sw);
  box.append(head, speedRow, tlRow);
  modal.append(box);
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });         // a click on the dimmed background closes it
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && settingsOpen()) { e.stopPropagation(); close(); } }, true);
  document.body.append(modal);
  const wheel = $('settings');
  if (wheel) wheel.onclick = () => { modal.hidden = false; x.focus(); };
  setSpeed(S.speed);
  applyTimeline();
}
```
Modal CSS (already part of the complete `table.css` of 3.3):
```css
.modal { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center; background: rgba(15, 9, 4, .6); }
.modal[hidden] { display: none; }
.modalbox { min-width: 24rem; max-width: 90%; padding: 1rem 1.4rem 1.2rem; border: 2px solid #1b110a; border-radius: 12px; background: #ece3b4; color: #2b1d12; box-shadow: 0 10px 40px rgba(0, 0, 0, .7); }
.modalhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: .9rem; font-size: 1.3rem; }
.modalx { display: flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; margin: -.3rem -.4rem 0 0; padding: 0; border: 0; background: none; color: #3a2616; cursor: pointer; }
.modalx svg { width: 1.4rem; height: 1.4rem; display: block; }
.modalx:hover { color: #000; }
.setrow { display: flex; justify-content: space-between; align-items: center; gap: 1.5rem; padding: .6rem 0; border-top: 1px solid rgba(111, 87, 73, .45); font-size: 1.05rem; cursor: default; }
.setlabel { font-weight: 700; }
.setspeed { display: inline-flex; gap: .3rem; margin: 0; }
.setspeed button { min-width: 3rem; padding: .3rem .6rem; border: 1px solid #1b110a; border-radius: 6px; background: #e8dcb8; color: #3a2616; font: 700 1rem system-ui, sans-serif; cursor: pointer; }
.setspeed button:hover { background: #fff3cf; }
.setspeed button.on { background: #8fd1a8; }
.setswitch { appearance: none; -webkit-appearance: none; position: relative; width: 3rem; height: 1.6rem; margin: 0; border: 1px solid #1b110a; border-radius: 999px; background: #b9ab86; cursor: pointer; transition: background .15s; }
.setswitch::after { content: ""; position: absolute; top: 2px; left: 2px; width: calc(1.6rem - 6px); height: calc(1.6rem - 6px); border-radius: 50%; background: #fff3cf; border: 1px solid #1b110a; transition: left .15s; }
.setswitch:checked { background: #5cae78; }
.setswitch:checked::after { left: calc(3rem - 1.6rem + 2px); }
.forkpage #settings { display: none; }
```
The Escape / click-outside behaviour and the modal are not tied to this page: the same module works in `fork.html` and `sandbox.html` (they contain the same `header.bar` markup).

---

## 9. Replay frames: step text, then decision (BGA-style)

9.1 What and why. In the replay every step is shown in up to three consecutive frames (more for merged steps and the setup draft: kinds `text1`, `text2`, ... and `draft`, see 9.2 and 9.7), never at the same time (the move bar shows one of them; the boards are those after the step in all of them):
- `text`: the step text (`step.label`, what just happened).
- `gate`: only on the step that ends a turn (the action card goes back to slot 1 and the state passes the turn on): "<player> must confirm or restart your turn" with greyed-out Confirm / Undo / Restart buttons (this used to replace the next player's choice and was never a frame of its own).
- `decision`: what the engine says is pending after the step (`step.options`): the next player's choice of an action card, the building to place, the effect to resolve ...
The order is in the data and agrees with BGA: BGA's own log is prompt, then the move that answers it, then the next prompt; here a step is the event and `options` the prompt that follows. Verified by hand against a BGA replay of table 798345117: moves 10-13 (choose card, build, confirm, opponent's card), 37-44 (a run of effects) and 91-94 (a break). BGA numbers its moves (`move_id`); about a third of the numbers are decision-only moves without a log line (the confirm click above all); they are the gate / decision frames, not extra steps. Fork and sandbox have one frame per step of kind `both` (the bar is the way to play, so it stays together with the step text). The game setup (action card draft, starting hand) follows the same rules, see 9.7.

9.2 Rules (`web/js/frames.js`, new, complete). A decision frame exists only if the bar has something to show (the bar is drawn into a detached element to find out), and it is left out when the previous step of the same BGA move (`move_id`) already showed the same decision (the engine keeps a pending decision attached to every line of a move, e.g. the whole break). The frames of the steps are computed on demand and cached per point of view:
```js
// [module] Frames of the replay: every step is shown in up to three consecutive frames, like BGA (what happened, then what has to be decided next), never at the same time:
//   'text'      the step text (what just happened); the board is the one after the step. A step that merges several lines of one BGA move (the draft's last keep with
//               the starting draw, the initial discards with the refill of the display: lines joined with " · ") has one text frame per group of lines ('text', 'text1', ...)
//   'draft'     the steps of the action card draft (Marine Worlds): the draft bar alone - the cards on offer and the choices made so far - instead of the step text
//   'gate'      only on the step that ends a turn: "<player> must confirm or restart your turn" (greyed out buttons)
//   'decision'  what the rules engine says is pending after the step (the next player's choice of an action card, the effect to resolve, the building to place ...)
//   'both'      fork / sandbox only (the bar is the way to play, so it stays with the step text)
// Simultaneous actions (the starting hand): the move bar follows one player, the point of view's, else the one whose zoo is on the left (seat 0): only that player's
// decision frame exists and only that player's lines of a merged text are shown. (The draft shows everything: both players' offers, with a point of view only its own.)
// A decision frame exists only if the bar has something to show, and it is left out when the previous step of the same BGA move (`move_id`) already showed the same decision
// (the engine keeps a pending decision attached to every line of a move: a break, a run of effects).
import { FORK, SANDBOX, S } from './state.js';
import { labelOf, povState } from './pov.js';
import { actionBar, prioritySeat, turnEnds } from './action-bar.js';

let cache = new Map(), cachePov = null;
const virt = new Map();
const frameName = () => framesOf(S.step)[S.phase] || 'text';
export const frameKind = () => (FORK || SANDBOX ? 'both' : frameName().replace(/\d+$/, ''));
// the text of the frame on show (a text frame of a step that merges several lines: its group of lines)
export function frameText() {
  const s = S.replay.steps[S.step], label = labelOf(s) || '(state update)';
  return FORK || SANDBOX ? label : textParts(S.step)[+(frameName().replace(/^\D+/, '') || 0)] ?? label;
}
// the lines of a merged label (joined with " · "), grouped by what they say (second word: draw, discard, keeps ...); where one group holds lines of both players
// (they act simultaneously) only the followed player's are kept
function textParts(i) {
  const label = String(labelOf(S.replay.steps[i]) || '(state update)'), parts = label.split(' · ');
  if (parts.length < 2) return [label];
  const names = S.replay.players.map((p) => p.name), owner = (p) => names.findIndex((n) => p.startsWith(n + ' '));
  const groups = [];
  for (const p of parts) {
    const last = groups[groups.length - 1];
    if (last && (last[0].split(' ')[1] || '') === (p.split(' ')[1] || '')) last.push(p); else groups.push([p]);
  }
  return groups.map((g) => {
    const owners = [...new Set(g.map(owner).filter((o) => o >= 0))];
    if (owners.length > 1) { const seat = prioritySeat(owners); g = g.filter((p) => owner(p) === seat || owner(p) < 0); }
    return g.join(' · ');
  });
}

// what the bar of `kind` would say on step i (a signature of its content), or null when it has nothing to show
function probe(i, kind) {
  const saved = [S.step, S.forkClaimed, S.forkGate], bar = document.createElement('div');
  S.step = i;
  try { actionBar(povState(S.replay.steps[i].state), kind, bar); } finally { [S.step, S.forkClaimed, S.forkGate] = saved; }
  return bar.hidden ? null : bar.textContent + '|' + bar.querySelectorAll('.abtn').length;
}
export function framesOf(i) {
  if (FORK || SANDBOX) return ['both'];
  if (S.pov !== cachePov) { cache = new Map(); cachePov = S.pov; }
  let f = cache.get(i);
  if (f) return f;
  const steps = S.replay.steps;
  f = textParts(i).map((_, k) => 'text' + (k || ''));
  const st = steps[i].state;
  if (st.phase === 'setup' && st.draft && ['pick1', 'pick2', 'keep'].includes(st.draft.stage) && probe(i, 'draft')) f[0] = 'draft';       // (the first group of lines of a merged step is the draft's keep)
  if (turnEnds(i)) f.push('gate');
  const sig = probe(i, 'decision');
  if (sig && !(i > 0 && steps[i - 1].move_id === steps[i].move_id && probe(i - 1, 'decision') === sig)) f.push('decision');
  cache.set(i, f);
  return f;
}

// The state the boards show in the frame on show. Normally the state of the step. The draft frame of a step that also deals the starting hands (the last keep and the draw
// are one step in the data) shows the state before that step with the draft of the step: the three cards are kept first, the 8 starting cards appear in the next frame.
export function frameState() {
  const steps = S.replay.steps, s = steps[S.step];
  let base = s.state;
  if (frameKind() === 'draft' && S.step > 0 && textParts(S.step).length > 1) {
    let v = virt.get(S.step);
    if (!v) { v = { ...steps[S.step - 1].state, draft: s.state.draft }; delete v.__id; virt.set(S.step, v); }       // (no __id: povState gives it its own cache entry)
    base = v;
  }
  // Marine Worlds: the order of the action cards is only drawn at random once the action cards are chosen, together with the starting hand (as on BGA). Until then the players' info boxes
  // show nothing (`actions_hidden`: the boxes keep their size, the cards are invisible); from the frame that deals the starting hand on, the real order (the one of the first turn state) is shown.
  if (base.phase === 'setup' && base.draft && ['pick1', 'pick2', 'keep'].includes(base.draft.stage)) {
    const dealt = textParts(S.step).length > 1 && S.phase >= 1;        // (every frame after the keep: the draw lines, then the discard decision)
    const key = S.step + (dealt ? 'd' : 'h') + (base === s.state ? '' : 'v');
    let v = virt.get(key);
    if (!v) {
      const real = dealt && (steps.slice(S.step + 1).find((x) => x.state.phase !== 'setup') || {}).state;
      v = { ...base, actions_hidden: !real, players: base.players.map((p, i) => (real ? { ...p, action_cards: real.players[i].action_cards } : p)) };
      delete v.__id; virt.set(key, v);
    }
    return v;
  }
  return base;
}
```

9.3 State and navigation (`web/js/state.js`: `S.phase`, the index of the frame of `S.step`). The arrow keys, the back / forward buttons and autoplay go frame by frame; the first / last buttons, the jump box and the Log go to a step (its first frame; "last" goes to the last frame of the last step). The jump box keeps counting steps (a number past the last step jumps to the end, see 8.9). The URL hash is `#<step>` or `#<step>.<frame>` (`#13.1` = the confirm frame of step 13); loading parses both. In `web/js/playback.js`:
```js
export function setPlaying(on) {
  if (S.timer) { clearInterval(S.timer); S.timer = null; }
  if (on && atEnd()) go(0);                                              // started at the end: play again from the start
  if (on) S.timer = setInterval(() => { if (atEnd()) setPlaying(false); else stepBy(1); }, 1000 / S.speed);
```
```js
// ---- frames: a step is shown in consecutive frames (frames.js); the keys, buttons and autoplay go frame by frame, the timeline, log and jump box step by step ----
export const atEnd = () => S.step >= S.replay.steps.length - 1 && S.phase >= framesOf(S.step).length - 1;
export const atStart = () => S.step === 0 && S.phase === 0;
export function stepBy(d) {
  if (d > 0) { if (S.phase < framesOf(S.step).length - 1) go(S.step, S.phase + 1); else go(S.step + 1); }
  else if (S.phase > 0) go(S.step, S.phase - 1);
  else if (S.step > 0) go(S.step - 1, framesOf(S.step - 1).length - 1);
}
export function go(n, phase = 0) {
  const before = S.step;
  S.step = Math.max(0, Math.min(S.replay.steps.length - 1, n));
  S.phase = Math.max(0, Math.min(framesOf(S.step).length - 1, phase));
  if (S.step !== before) { S.thresholdMode = null; S.marketMode = null; S.assocSpecies = null; S.forkBonus = null; S.assocMode = null; S.forkMenu = null; S.forkError = ''; draftMarks.clear(); cardMarks.clear(); keepSel.clear(); S.forkSpend = 0; S.skipMode = false; S.animalEnc = null; S.placement = null; }
  render();
}
```
and in `web/js/main.js`: the buttons `#prev` / `#next` and the keys ArrowLeft / ArrowRight call `stepBy(-1)` / `stepBy(1)`; `#last` and End call `go(steps.length - 1, 99)`; `#first` / `#prev` are disabled when `atStart()`, `#next` / `#last` when `atEnd()`; the hash is written as `'#' + S.step + (S.phase ? '.' + S.phase : '')` and read in `init()`:
```js
  const [h1, h2] = PLAY ? [S.replay.steps.length - 1, 0] : FORK ? [0, 0] : location.hash.slice(1).split('.').map((x) => parseInt(x, 10));
  if (loadProgress) loadProgress.done();
  $('loading').hidden = true;
  $('app').hidden = false;
  go(Number.isFinite(h1) ? h1 : 0, Number.isFinite(h2) ? h2 : 0);
```

9.4 `web/js/action-bar.js`. `actionBar(st, kind = frameKind(), bar = $('actionbar'))` draws the bar of a frame kind into any element; kind `text` (and `text1`, `text2`, ...) hides it, `draft` shows the action card draft (9.7), `gate` shows the turn-end confirmation, `decision` skips the gate and shows the pending decision, `both` is the old behaviour. `turnEnds(i)` is the old turn-end test, now shared with `frames.js`. The head of the function:
```js
// the step that puts the action card back on slot 1 ends the turn: the state already passes it on to the other player
export function turnEnds(i) {
  const steps = S.replay.steps, st = steps[i].state, before = i > 0 ? steps[i - 1].state : null;
  return !!before && st.turn > before.turn && st.active_player !== before.active_player && (before.phase === 'turn' || before.phase === 'final_turns');
}
// Draws the bar of the frame `kind` (frames.js) into `bar`: 'text' (replay: the step text is on show, no bar), 'draft' (the action card draft), 'gate' (the turn-end confirmation), 'decision' (what the
// engine says is pending after the step) or 'both' (fork / sandbox, and the action card draft: the bar is shown with the step text). Other bars than the #actionbar
// can be drawn into (frames.js asks whether a decision frame has anything to show).
export function actionBar(st, kind = frameKind(), bar = $('actionbar')) {
  S.forkClaimed = new Set();
  S.forkGate = false;
  bar.replaceChildren();
  bar.classList.remove('draftbar');
  const cur = S.replay.steps[S.step], o = cur.options;
  if (kind === 'text') { bar.hidden = true; return; }
```
and the gate branch is entered with `if (turnEnds(S.step) && kind !== 'decision' && !(FORK && S.forkConfirmed === S.step)) {` (it used to repeat the test inline). Two further cleanups so that the decision frames match BGA: effects of kind `income_*` (the incomes of a break) get no button (they are paid by themselves; BGA lists them as log lines), and the engine's `skip_effect` option gets no button in the replay (BGA has none). The Build prompt without pieces is section 5.1.

9.5 CSS (already in the complete `table.css` of 3.3; one line): `.movebar .current[hidden] { display: none; }` (the box rule `.movebar .current` sets `display: flex` and would otherwise win over the `hidden` attribute).

9.6 Known differences from BGA (the frontend can only show what the payload says). BACKEND NEEDED where the data should change; none of it blocks this section:
- Some prompts come from the engine, not from BGA, and are worded by the frontend (`PROMPT_TEXT`, effect buttons): e.g. after "chooses Sponsors I" BGA asks "choose which effect to resolve: Sponsors 4 ..." and then "must snap one card", the engine says "may play a sponsor" (and repeats it after the discard and the snap); the Long-billed Vulture's "Draw 3 from shuffled discard, keep 1" button says "Animal ability". BACKEND NEEDED (optional): send the prompt text / button names of BGA with each step (BGA state ids of the raw log map cleanly onto the engine prompts: 30 build, 32 animals, 33 association, 34 cards take, 35 sponsors, 36 discard, 20 choose action card, 91 effect, 93 confirm turn).
- The replay JSON (incl. the card catalog with the `image` / `large` paths) is cached in memory and on disk under a key made from the newest `.py` / `.json` under `src` (`_code_version()` in `api/main.py`), so changed card images (web/cards, web/cards_large) are not picked up by an already cached replay until the code version changes. BACKEND NEEDED (optional): add the newest mtime of `web/cards*` to the key.
- Steps the engine could not play (`engine.status` skipped / illegal / mismatch, `source: 'log'`) have no `options`, so they get only a text frame (and, where the log-built state says a card is to be chosen, the old guessed action card bar).
- Simultaneous decisions in the game setup follow one player (9.7); the discards of a break are shown one after the other (the log's order), BGA lets both players act at once.
- The "Move N" box (no total any more) counts steps (0 to 605 in the example), not BGA's move numbers (1 to 453); the step's `move_id` is in the data if the live site wants to show BGA's number.

9.7 Game setup: the action card draft and the starting hand. In the data (table 798345117) steps 0-8 have `phase: 'setup'` and step 9 (the merged discard / refill) is already `phase: 'turn'`; the first may be an empty "state update": one step per pick (`phase: 'setup'`, `state.draft.stage` = `pick1` / `pick2` / `keep`, `picked` / `kept` per seat), then one step that merges the last keep with the draw of the starting hands (label parts joined with " · "; the state already has 8 cards in each hand) and one that merges the initial discards (4 each, hands 4) with the refill of the display. Rules:
- The action card draft (a Marine Worlds mechanism: 3 cards dealt, pick 1; pass 2, receive 2, pick 1; pass 1, receive 1 (a 4th card of another kind if the three left are alike), keep 2) has its own frame kind `draft` and **no step text**: every step of the draft shows the draft bar alone, i.e. for each player the cards on offer and what he picked / kept so far (green frame with a check mark, passed cards greyed out; in the second round the card picked in the first round stands left of a dashed line, as large as the cards on offer). Stepping through steps 0-8 therefore shows the whole selection process, one choice per step. A player who has chosen reads "selected this action card" / "selected these 2 action cards", one who still has to reads "must select ...". With a point of view only that player's cards are shown (the data hides the other's). The fork is unchanged (bar and text together, with the confirm button). The card picked in the first round has no padded green zone around it any more (it looked bigger than its neighbours): `.draftkept { padding: 0; background: none; border: 0; }` and `.draftkept .draftcard.picked { outline: 4px solid #2ebe54; outline-offset: 1px; }`, the last rules of `replay.css`. The offered cards keep their own height: `.draftcards > .draftcard { align-self: flex-start; }` (last rule of `replay.css`); without it the row stretched them to the height of the zone of the first pick and left an empty strip below the shorter cards in the second round.
- The last keep and the deal of the starting hands are ONE step in the data (its state already has the 8 + 2 cards). Its draft frame therefore shows the state of the previous step with the draft of this step (`frameState()` in `frames.js`, used by `render()`): the dock and the player boards still have no starting cards while the three cards are kept; the next frame ("X draw ...") shows the real state, the draft cards are gone and the 8 starting cards (and 2 scoring cards) appear.
- A merged label is split into one text frame per group of lines (`textParts` in `frames.js`: lines are grouped by their second word, e.g. keeps / draw / discard / display); the first group of the draft's last step ("X keeps ...") is replaced by the draft frame, so that step = draft frame, then "X draw ..." (the draft is resolved before the starting cards are drawn, as in the BGA log), the second merged step = the discard line, then "The display is replenished ...".
- Simultaneous decisions after the draft (the starting hand): the move bar follows ONE player: the point of view's player, else the player whose zoo is on the left (seat 0; `prioritySeat`). The same goes for the lines of a merged text that name both players (the two initial discards): only the followed player's line is shown.
- New decision: after the starting cards are drawn, "<player> must discard 4 cards (initial selection)" (any step in the setup phase where a hand has more than 4 cards; the number is hand size minus 4; replay only). The first prompt of the game ("must choose an action card") follows the refill of the display.
In `web/js/action-bar.js`:
```js
// Simultaneous decisions: the replay shows one of them at a time, the point of view's player first, else the player whose zoo is on the left (seat 0)
export function prioritySeat(seats) {
  if (!seats.length) return null;
  return S.pov !== null && seats.includes(S.pov) ? S.pov : Math.min(...seats);
}
```
```js
  // The action card draft (a Marine Worlds mechanism) has its own frame in the replay, 'draft': the bar alone, without step text, with the cards on offer and what each
  // player picked / kept so far (point of view: only the viewer's own offers). The fork shows it together with the step text, like every bar.
  if (st.phase === 'setup' && st.draft && st.draft.stage !== 'done' && (FORK || kind === 'draft') && draftBar(bar, st.draft)) return;
  if (!FORK && st.phase === 'setup') {                                          // the starting hand: 8 cards drawn, 4 to discard (initial selection)
    const seat = prioritySeat([0, 1].filter((i) => S.replay.steps[S.step].state.players[i].hand.length > 4));
    if (seat !== null) {
      const who = el('span', 'who', S.replay.players[seat].name);
      who.style.color = seatColor(seat);
      bar.hidden = false;
      bar.append(who, el('b', '', ' must discard ' + (S.replay.steps[S.step].state.players[seat].hand.length - 4) + ' cards (initial selection)'));
      return;
    }
  }
  // the step that puts the action card back on slot 1 ends the turn (the state already passes it on): the player has to confirm it. In the replay the buttons
```
and in `draftBar()` the heading of a group (a player who has chosen no longer "must" choose):
```js
    const done = !FORK && chosen.length >= need;                              // (the replay shows the draft as it goes: a player who has chosen no longer "must" choose)
    head.append(who, el('b', '', done ? (need === 1 ? ' selected this action card' : ' selected these 2 action cards')
      : need === 1 ? ' must select the action card you want to keep' : ' must select the 2 action cards you want to keep'));
```
`main.js` hides `#current` for every frame kind except `text` / `both` (`cur.hidden = kind !== 'text' && kind !== 'both'`).
The action cards in the players' info boxes during the setup (Marine Worlds): their order is only drawn at random after the action cards are chosen, together with the starting hand, so BGA shows nothing in the boxes until then, and the real order (with the silver variant badges of the special action cards) appears with the starting hand. The data carries the schematic order (animals, association, build, cards, sponsors, variant 0) in every setup state; the real order is first in the state of the first later step whose `phase` is not `setup` (`frames.js` `.find`; step 9 in the example). `frameState()` in `frames.js` therefore returns for every frame of a setup step whose state has a draft in stage pick1 / pick2 / keep a derived state (cached in `virt`, no `__id`): before the deal (the draft frames, every step up to the last keep) `actions_hidden: true` with the schematic cards; from the first frame after the keep of the merged deal step (`S.phase >= 1`: the draw text, then the discard decision) the `action_cards` of both players are replaced by those of the first later step whose phase is not 'setup'. `side-panel.js` adds the class `unseen` to `.ppactions` when `st.actions_hidden` (CSS, end of `replay.css`: `.ppactions.unseen { visibility: hidden; }`, so the boxes do not change height when the cards appear). Games without a draft (base game) are untouched.
```js
  // Marine Worlds: the order of the action cards is only drawn at random once the action cards are chosen, together with the starting hand (as on BGA). Until then the players' info boxes
  // show nothing (`actions_hidden`: the boxes keep their size, the cards are invisible); from the frame that deals the starting hand on, the real order (the one of the first turn state) is shown.
  if (base.phase === 'setup' && base.draft && ['pick1', 'pick2', 'keep'].includes(base.draft.stage)) {
    const dealt = textParts(S.step).length > 1 && S.phase >= 1;        // (every frame after the keep: the draw lines, then the discard decision)
    const key = S.step + (dealt ? 'd' : 'h') + (base === s.state ? '' : 'v');
    let v = virt.get(key);
    if (!v) {
      const real = dealt && (steps.slice(S.step + 1).find((x) => x.state.phase !== 'setup') || {}).state;
      v = { ...base, actions_hidden: !real, players: base.players.map((p, i) => (real ? { ...p, action_cards: real.players[i].action_cards } : p)) };
      delete v.__id; virt.set(key, v);
    }
    return v;
  }
  return base;
```

Known limits (BACKEND NEEDED, optional): the merged step 8 only carries the lines of the player who made the last keep (the other player's starting draw is not in the label, so with that player's point of view his own draw is never shown as text), and step 9 has no `label_pov`, so with a point of view the other player's discard line is simply not shown.

Verification: `/replay.html?table=798345117#13`: `#13` (text: "places action card Build ..."), Right: `#13.1` (only "must confirm or restart your turn", greyed buttons), Right: `#13.2` (only "<opponent> must choose an action card"), Right: `#14`. `#10` then Right shows `#10.1` "must build a building of size at most 5" with no pieces. In the break (steps 102-111) the frames read "must discard 1 card(s)" / log lines / "must discard 3 card(s)" with no "Income" button. Setup (all hands): `#0` ... `#8` draft frames only (both players' offers, picks checked as they happen), `#8.1` draws, `#8.2` "must discard 4 cards (initial selection)", `#9` discard (seat 0's line only), `#9.1` display replenished, `#9.2` first action card prompt. Frames of table 798345117: 606 text (+ the merged-step extras) + 67 gate + 330 decision, no console errors; Left from `#14` goes to `#13.2`, End shows step 605 (only the text frame).

---

## 10. Local-only helpers (do NOT port) and the caching risk on the live site

- `Start Ark Nova.bat` (project root of the developer's Windows PC): creates `.venv`, installs the project, starts `scripts\dev_server_nocache.py` (not `dev_server.py`) and opens the browser.
- `scripts/dev_server_nocache.py`: wraps `dev_server.build_app()` and sends `Cache-Control: no-store` for `/` and for `.html`, `.js`, `.css`, `.json` paths outside `/api/`. Purely a convenience for development.
- Risk for the live site: with ES modules the browser may keep an old `replay.html` (or old modules) after a deploy and mix them with new files; the symptom was `Cannot set properties of null (setting 'onclick')` because new JS ran against old HTML. If the live server serves `web/` with a long cache lifetime, serve the HTML, JS, CSS and JSON files with `Cache-Control: no-cache` (revalidate with the ETag that `StaticFiles` sends) or give the module and stylesheet URLs a version query that changes per deploy.

---

## 11. Final verification checklist (run on the live site after porting)

1. `/replay.html?table=<id>#10` (a table whose step 10 is a Build action choice): the move bar shows the step text; Right shows "must build a building of size at most N" and no pieces; the bar is 50 px high. Then the frame sequence of section 9 verification (`#13` -> `#13.1` -> `#13.2` -> `#14`).
2. Window sizes 1280x551, 1536x730, 1920x1080, 2560x1300: identical layout, scaled; no horizontal scrollbar; sidebar fixed and fully visible.
3. Tabs Control / Log work and remember the choice; the Log centres the current move.
4. Fork a position at a Build: the move bar shows one "Place a building" button with a drop-down of pieces; choosing one lets you click a hex of the zoo.
5. Hover a card: nothing for one second, then the enlarged card; moving away cancels it; no browser tooltip appears over cards, association board, tracks, zoo maps or the conservation project panel.
6. Donations on the association board are cubes in the player colours; no "Display" heading; the jump box says "Move"; action buttons and cards are `#009fe2` / `#a91b71`.
7. Replay setup of a Marine Worlds table (e.g. `#0` ... `#9`): the action card draft frames (section 9.7) show no step text, the info boxes show NO action cards until the frame that deals the starting hand (they appear then with the special-action markers, the boxes do not change height); the last keep and the deal are two frames.
8. Shared area at 1280, 1920 and 2560 px windows, at the start and at the end of the game (conservation track without cubes): the display element and the association element have exactly the same height (section 3.4); the two project spots of the upper project area have equal empty space left (icon excluded) and right.
9. Dock: drag a hand card to another place in its row; it stays there after stepping to the next move (not after F5); a click still selects it (green frame + centred check mark, section 8.5); the other player's hidden cards cannot be dragged (section 8.6).
10. Info box: the player names are links to `https://boardgamearena.com/player?id=<id>` (new tab) that look like plain bold text; a yellow / white name has a 2 px black outline; the names are 2 px bigger; the step text of the move bar is bold (section 8.7).
11. Point of view (section 8.8): the control panel has no POV buttons; each info box has an eye next to the name; the first time only seat 0's eye is open; clicking the closed eye of the other player shows both hands; with both open one eye can be closed, the last open eye cannot; the state survives F5 (per table) and a fork opened from the replay shows the same eyes.
12. Control panel (section 8.9): two rows (playback buttons; settings wheel, Move box, Fork); timeline (optional third row, between the two) and 1x/2x/4x only via the settings pop-up (8.10; defaults speed 1, timeline off; `settings.js`), no "/ total"; typing a move number above the last jumps to the end.
13. Zero console errors on replay, fork and sandbox.

---

## 12. Maintaining this document

This is documentation of the final state, not a log. When a later task changes something described here, rewrite the affected section (delete what became obsolete); when it adds a feature, append a new numbered section at the END of the document (the numbers 10-13 are historical order; do not renumber). Mention "BACKEND NEEDED" explicitly if a change ever depends on the backend. Update `docs/frontend_architecture.md` for new modules.

---

## 13. Live play (play.html) on top of the modules (added when the frontend update was merged into the repo that has the live games)

Scope: `web/play.html`, `web/js/play.js` (new), `web/js/state.js` (`PLAY`, `S.play`, `S.animalEnc`), plus small hooks in `main.js`, `load.js`, `fork.js`, `action-bar.js`, `board.js`, `cards.js`, `dock.js`, `shared.js`, `side-panel.js`, `pov.js`, `playback.js` and `web/css/replay.css` (the block "live play (play.html)" at its end). `play.html` loads `main.js` as a module with `window.FORK_MODE = true; window.PLAY_MODE = true;` (set by the page's lobby script once a game id is in the URL); the page is the fork layout plus `#abandonbox`, `#endbar` and `#endstats`.

- `play.js`: everything of a live game. `playLoad()` (called by `fetchReplay`) reads `/api/games/{id}/setup` and `/state`; `pushLive` appends the pushed view as a step; sockets (`/ws/{id}`) or 2 s polling; clocks (`clockBadge`, `tickClocks`; the badge is drawn next to the name in the player tracker), the game menu in the round row of the tracker (`gameMenu`: concede, end the game on overtime, propose to abandon), abandon proposals, the turn alert, the end of the game (`showGameEnd`: the statistics replace the zoos, a button switches back), `playLive` (preview + irreversible warning + post of a move), `playWaitingBar`, `playTurnButtons`, `initPlay`. State is `S.play`; nothing else is stored.
- `PLAY` implies `FORK`. `S.pov` is always `null` in a live game (the server already masks what a seat may not see) and the eyes are not drawn.
- `forkBar` (fork.js) has the live branch: waiting for the second player; the map pick (click a map, its board is drawn with `zooBoard` / `bonusPanel` / `associationStrip` on an empty zoo, then Confirm); the card pick of an effect (digging: select a card of the hand or the display, then Confirm; a second Confirm for map 10's rescue); the animal's enclosure (click a highlighted enclosure in the zoo, then Confirm; `S.animalEnc`, `animalSelection()` in action-bar.js, `.encpick` in the css).
- The log of a live game has several lines per step (newline separated, BGA's wording; `white-space: pre-line` on `.current` and `.moves li`); the labels `Starting a new break` / `End of the break` are matched with the `m` flag.
- The hand dock has a group (name + hand | endgame cards) per player; a card of the dock previews in the middle of the screen (`.preview.center`).
- Not part of this document: the server side (`src/ark_nova/live`, `bgalog.py`, the time control) is described in CLAUDE.md.

13.2 Other changes of the merge (everything below is in the reference files; nothing here needs a backend change except where marked):
- `main.js` `render()` no longer redraws boards that did not change: `S.lastBoard = {st, pov}` remembers what the boards on show were drawn from; in the replay (not fork / sandbox / live) the next frame of the same step (same `st`, same `S.pov`) skips drawing the zones and the zone-flash bookkeeping (`S.prevZones` ...). When the position did change, `redraw(root, draw)` draws the zone and puts back the old DOM nodes whose markup (`outerHTML` with the `mt<N>` clip-path ids normalised) is identical (`reconcile`), so pictures are not reloaded and only the changed parts flash. This is why frames of one step no longer flicker. Anything that must show a change without a new position or a new `S.pov` (for example the dock after a drag, `cardorder`) must call its own render function, as `dock.js` already does.
- Loading box: `web/js/progress.js` (new classic script, loaded after `logstore.js` in `replay.html` and `fork.html`, before `main.js`) defines `window.Progress.start(box, {key, title, expected, stages})` which draws a progress circle with stage texts and an estimate learned per `key`; `boot()` in `main.js` starts it (`replay` / `fork`; not in the sandbox or in play), calls `.stage('Preparing the board')` when the data arrived, `.done()` after the first render and `.fail()` on an error. The loading text in the HTML is now just "Loading…" and `replay.css` styles `body.viewer .status` (solid parchment card), `.status.error` and the progress colours.
- Table ids: the replay page accepts live game ids `E<n>` as well as digits (`/^(E\d+|\d+)$/` in `boot()`), `GET /api/tables/E12/replay` is served from the game record (`replay/from_record.py`).
- `window.MAP_EDITOR`: `map_editor.html` imports the drawing modules; `main.js` ends with `if (!window.MAP_EDITOR) boot();`. `association.js` reads `map.upgrade_sets || SETS[map.id]` (the map editor supplies its own sets).
- `cards.js`: card images are no longer `loading="lazy"` (a card drawn again with the next render showed an empty frame first); `showPreview(src, centered)` and the `afterMark()` export of `action-bar.js` replace the old `refreshBar()` call on card marks in a fork (`refreshBar` still exists).
- `replay.css`: a phones-only block `@media (max-width: 800px)` (project panels as columns, card preview as a corner thumbnail). It does not break the rule of section 2 (the desktop layout is always the 1920 layout, scaled from 900 px up), but it is the one width query allowed to stay; do not add others for desktop. Also the lobby form styles (`.lobby ...`), the clock badges, the game menu, `.abandonbox`, `.alertbtn`, `.encpick`, `.mappreview`, `.dockgroup` / `.dockwho` / `.dockpair`.
- `play.js` adds the classes `forkpage playpage` to `<body>` (`play.js` `initPlay`), so in a live game the gear, the timeline and the play button are hidden (`.forkpage #settings`, `.forkpage #timeline, .forkpage #play`), the S key does nothing there (`toggleSettings()` ignores a hidden gear) and there is no autoplay: `main.js` ignores the Space key in every FORK mode (fork, sandbox, live) so that Space keeps pressing the focused button.
- `play.html` has the control panel markup of 8.9 without the Fork button (the second row has the gear and the Move box; the gear is hidden by `.forkpage`).

13.3 Fixes after the merge (small, frontend-only; the behaviour in the reference files wins):
- Replay frames (`main.js` `render()`): the boards are skipped when the position did not change (`same`), but the decision / confirm bar is drawn by `actionBar(st)`, which `renderShared` calls. So `render()` must call `actionBar(st)` itself in the `same` case (`{ ... } else actionBar(st);`), otherwise every decision and confirm frame is an empty box. Check: for every frame of the replay exactly one of `#current` and `#actionbar` is visible (never both, never none; table 798345117: 1001 frames = 9 draft + 599 text + 326 decision + 67 gate).
- End of the game (`play.js`): `showGameEnd` marks the end screen as shown only after `EndStats.render` succeeded (an error is logged and the next `playEndCheck` draws it again). `playEndCheck` also runs for `abandoned` and after a concede; for `abandoned` the screen says "Game abandoned: no winner." (`EndStats` status `abandoned`). `endFromResult` passes `reason` (`result.reason`, or `overtime` when `end_reason` says so) so an overtime win is not shown as a concession, and keeps asking while nothing is shown.
- Polling (no `ws_base`): the 2 s loop stops once the status is `finished`, `conceded`, `abandoned` or `closed`.
- Abandon: `setAbandon` schedules `refreshGameMenu` for the end of this seat's cooldown, so the menu entry is enabled again without a reload.
- `play.html` lobby: `api()` never rejects (a network failure returns `{ok:false, status:0, body:{message}}`, shown in the lobby; the title says "No connection"); the options request falls back to an empty list; the Create / Join submit button is disabled while the request runs (and enabled again on an error); form controls get `aria-label`s.
- `end.html`: a game whose status is `waiting` or `playing` shows "This game is not over yet." with a link to the game instead of a result.
- `planning.html` (dev tool): one save timer per sheet, so switching sheets within 400 ms no longer drops the first sheet's save.
- Not changed on purpose (needs a decision or a backend change): the stored seat token is still used when the URL has none; no pong watchdog for half-open sockets; `import.html` still checks `e.source` only (the origin of the BGA page is not pinned); action-bar controls that are `span`/`div` are not keyboard-operable.

## 14. Card images: one process for all cards (`scripts/build_cards.py`)

Scope: `web/js` changed only in the three hover-preview calls (see the `largeOf` bullet below); no change in `web/css`. The files `web/cards/<key>.webp` (360 x 503) and `web/cards_large/<key>.webp` (745 x 1040) are now produced for **every** card (animals A###, sponsors S###, conservation projects P101-P139, endgame cards F001-F017, variants `S250_MW`, `P131_MW`: 300 cards) by one script, and replace the old files (animals composed with Pillow, sponsors / projects / endgame cut from community sprite sheets at 240 x 335, large images only for sponsors). `card_catalog` (`replay/view.py`, unchanged) hands out `image` = `/cards/<key>.webp` and, because the large file now exists for every card, `large` = `/cards_large/<key>.webp`; `cards.js` `showPreview(c.large || c.image)` therefore shows the sharp 745 x 1040 card with its full ability text for animals, sponsors, projects and endgame cards alike. The card box keeps the aspect ratio 240 / 335 (`.card { aspect-ratio: 240 / 335 }`), the new files are 360 / 503 (0.716), so no CSS changed.

How the cards are made (details: `scripts/cardgen/README.md`):
- The cards are drawn as HTML/CSS by the React card components and the stylesheet (`arknova.css`, BGA's own card CSS) of the fan site Next-Ark-Nova-Cards (permission given), copied into `scripts/cardgen/src` together with its fonts, icon sprites, card backgrounds, animal photos, sponsor pictures and the English texts (`scripts/cardgen/site`). esbuild bundles them; headless Chromium (Playwright) draws every card at 2 x the design size (750 x 1044) and screenshots it; Pillow scales the screenshots to the two sizes and writes webp (`python scripts/build_cards.py`, needs node + npm, Pillow, a Chromium; `--only A401,S201` rebuilds single cards; a full build takes about 4 minutes).
- Two versions of every card, like on BGA: the large one (`web/cards_large`, the hover preview) has all texts; the small one (`web/cards`, used in hands, zoos, display, dock) shows only the names of the abilities of an animal and no effect text on sponsors and projects (`scripts/cardgen/site/compact.css`, applied by `shoot.mjs` as `body.compact`) with BGA's own no-description mode of `arknova.css` (`data-card-desc="0"` on the body: names 32px instead of the normal size, ability names 32px, taller title bar (70px animals/scoring, 77px projects, 75px sponsors), no Latin name and no card number). Endgame cards keep their text in both. The hover preview takes its image from `largeOf(card)` (`cards.js`, exported; used by `cards.js`, `projects.js`, `sandbox.js`): `card.large` of the catalog, else the small image path with `/cards/` replaced by `/cards_large/`, so a replay cached by the server before the large images existed (the catalog is part of the cached replay JSON) still shows the full card. The card catalog (`image`/`large` paths) is part of the cached replay JSON: after the card images change, restart the server so the cache key (code version) changes.
- Animals: photo, enclosure / size / price badges, requirement and tag badges, bonus bubbles, wave icon and the ability boxes (title + text) as on the printed card. Sponsors: the printed card picture (top part with the icons) plus the effect text and the income / endgame bars. Projects and endgame cards: tag icon, description, slots with their rewards or the score table.
- Ability texts that do not fit are shrunk (CSS `zoom` 0.6 to 1, in `shoot.mjs`) until they end above the bottom of the card (sponsors: above the income / endgame bars). 15 cards are shrunk (the longest: S215, S218, S270, A524, A551).
- Our own additions to the fan site's data: the patched slots of P129 / P131 and the Marine Worlds slot indicators of `P131_MW` (`data_manual/variants_mw.json`, `src/ark_nova/data/projects.json`); `S250_MW` is painted from `S250` by `scripts/build_mw_card_images.py` (the top part of a sponsor is a photo, so its icons cannot be changed in HTML); the Marine Worlds projects P133-P139, which the fan site does not have, are drawn by `scripts/cardgen/harness/mw.tsx` + `site/mw.css` from our own data (P133 with the base project template; P134-P139, the six Management Plans, with their own layout: two requirement icons, three slots with 2 conservation points and a keyword / reputation per 2 science / tutor reward, the place bonus tab). Their photos (`site/art/P133.jpg` ... `P139.jpg`) are cut from our old 240 px card images (badge removed by inpainting), so they are softer than the other cards; a better photo of the same name (374 x 264 px or larger) dropped into `site/art/` is used by the next build.
- `web/cards` and `web/cards_large` are generated files that are committed (the live site serves them); `scripts/cardgen/node_modules`, `out/` and the intermediate files are in `.gitignore`.
- The old scripts `build_card_images.py`, `build_large_art.py` and `build_animal_cards.py` are superseded (they need the git-ignored `vendor/` folder); `build_mw_card_images.py` is still used (called by `build_cards.py`).
- Project texts: the fan site's locale had a hard `<br>` between "partner" and "zoo" in the five Breeding Program texts (desc_123-127); it produced a lone "partner" line. The `<br>` is removed there (the herbivore text is a bit longer: `shoot.mjs` shrinks every project text that needs more than 2 lines with CSS `zoom` in steps of 2 % down to 0.8; only P126 is affected, at 0.98), and the Research text (desc_132) got the same `<br>` as the other "icons in your zoo" texts. Edited in `scripts/cardgen/site/locales/en/common.json`; all 40 project cards rebuilt.
- A341, S281, S282 (inactive cards) are rendered too. `replay/view.py` only had two comments naming the old scripts (now `scripts/build_cards.py`).

## 15. Conservation projects in the project areas, like BGA (`web/project_strips`)

Scope: `web/js/projects.js`, `web/css/table.css` (end of the file), the new folder `web/project_strips/` (40 pictures and `cubes.json`, committed, made by `scripts/build_cards.py`). Nothing in the backend.

Final state: every project of the two project areas (conservation projects in play above the association board, base projects below it) is ONE element like on BGA: a base whose left 25 % is dark green (`#528b43`, the green of BGA's project icon tab) and whose right 75 % is light green (`#c8d7c4`); the icon(s) of the project (a circle with the tag; two circles for release / breeding / Marine Worlds plans, with the size / partner symbol) stand in the dark part, the three slots (indicator number, shield with the conservation points, extra rewards such as reputation or tutor) in the light part, and the cubes of the players lie on the slots. The old cut-out of the card (`.projcrop`, `.projbar`) is no longer used by the page (its rules stay in `replay.css`, overridden).

- `projectPanel()` (`projects.js`): per project `.projslot > .withtokens > .projline.projstrip` containing `<img class="projstripart" src="/project_strips/<key>.webp">` (the path is the small card's `image` with `/cards/` replaced by `/project_strips/`, so `P131_MW` works) and the cubes: `blockedCube(slot)` for the 2 player blocked slots of the base projects and for every supporter token. A cube is placed from `web/project_strips/cubes.json` (`{key: [[x, y, width], x3]}`, fractions of the strip, loaded once with a top-level `await fetch` in `projects.js` as `STRIP_CUBES`; passed to `blockedCube(slot, colour, title, spot)`, which sets `left`, `top` and `width` in %). The spot is the cube holder of the card slot (the green square above the shield; on the Marine Worlds plans the middle of the slot). Without an entry the fallback is `SLOT_X` (37.5 %, 62.5 %, 87.5 %) and the CSS default `top: 50 %`, width 11 % (`.projstrip .blockcube`). Hovering the strip shows the whole large card (`largeOf`). An empty place (no project yet, sandbox) has the class `projempty` (pale, no green base).
- CSS (`table.css`, end): `.projslot` has `aspect-ratio: 1000 / 412`, no padding / border, `background: linear-gradient(90deg, #528b43 25%, #c8d7c4 25%)`; `.projstripart` fills it. The panel keeps its grid (icon + 3 columns; the pair shift of `layout.js` is unchanged).
- The pictures: `build_cards.py` (`build_strips`) composes 1000 x 412 px (saved at 600 x 247, webp with transparency): the icon element(s) of the card centred in the left 250 px, every slot of the card (cut from a screenshot with transparent background, `site/bare.css`, `body.bare` in `shoot.mjs`, boxes in `out/bare/geometry.json`) enlarged as far as the strip allows (one factor for the three slots: at most 1.5, the three visible parts together at most 90 % of the light green part's width and not higher than 80 % of the strip) and placed by their VISIBLE part (alpha channel): the three visible parts are spread with EQUAL space left of the first, between them and right of the last (so the breeding projects P123-P127, whose first two slots are wider than the third (shield + cap), look centred as a whole), their tops on one line (the shields of the Marine Worlds plans stand side by side) and the tallest part in the middle of the strip's height. `cubes.json` gets the position of each cube holder after this move. Because the green is CSS, the strips stay sharp and any panel width works.
- Marine Worlds management plans (P134-P139) show their three slots (shield + reef / reputation / tutor reward); the place bonus tab of the card is not part of the strip (hover shows it).
- Rebuild after a card change: `python scripts/build_cards.py` (all 300 cards and the strips) or `--only P101,P120`.

Verification: with a replay at the end of a game the project areas show the green bases with the project icons left and the slots right; the base projects of a 2 player game show one cube per project on slot 1 / 2 / 3; supporters' cubes lie on their slot; hovering a project shows the large card; no console errors, no broken `.projstripart` images.

## 16. BGA's number font for money, appeal, conservation and reputation

Scope: `web/fonts/MyriadPro-Bold.woff` (new, the font the fan-site cards and BGA use), the end of `web/css/table.css`, one class in `side-panel.js` (`rs-<icon>` on the number-over-icon spans) and the font size / class of the two `cons-number` texts in `association.js`.

Final state (settings taken from BGA's own CSS, `.player-info .icon-*` and `.icon-container .icon-*`): every number of money, appeal, conservation points and reputation is set in MyriadPro-Bold (`@font-face` in `table.css`, weight 400 because the font is already bold), `letter-spacing` -1px at 20px (-.05em), `text-indent` -.05em, no outline / shadow, font size = 0.625 x the height of the icon (BGA: 20px on 32px icons; reputation 19px): in the player panels `.rs.inside b` is 1.625rem (reputation 1.55rem) over our 42px icons, the income over the money icon (`.rs.inside .income i`) 1.3rem. Colours as on BGA: white on money and reputation, BLACK on appeal and conservation (`.rs-appeal b`, `.rs-conservation b`). The SVG numbers of the maps (`.cons-number`: conservation bonus of the 4th worker etc. black, font size 0.62 x icon height; with the extra class `rep-number` white: the 1 reputation of worker 1 / 2 on map T1) and the bonus tiles (`.board .bonus-number`, `.ctcomposed .bonus-number`, white with their dark outline as before) use the same font. Not changed on purpose: the score next to the star, X tokens, workers, card counts, tag counts and all texts.

Verification: a player panel shows the numbers in the narrower Myriad digits; no request for `/fonts/MyriadPro-Bold.woff` fails.
## 17. Display folders like BGA (number and zoo place names)

Scope: `web/js/shared.js` (`FOLDER_PLACES`, one extra `span.folname` per folder), the end of `web/css/replay.css`.

Final state: the folder picture (`web/assets/folder.webp`) already contains the brown number square; the number (`.folnum`) is centred in it (left 82.2 %, top 7.9 %) in MyriadPro-Bold, white, no shadow, letter-spacing -0.05em (BGA `.folder-number` is 17px of a 150px folder; we deliberately use 19px = 1.47rem of our 11.6rem folder). The zoo place of each folder is printed in the tab (`.folname`, italic, `#624c0a`, 0.55rem, centred, ellipsis; BGA `.folder-name`): 1 San Diego, USA; 2 Frankfurt, GER; 3 Johannesburg, SA; 4 São Paulo, BR (with ã, deliberately differs from BGA); 5 Okinawa, JP; 6 Sydney, AUS. BGA's CSS has no place data (it is in the picture/locale of BGA), so the names are hard-coded in `FOLDER_PLACES`.

Verification: all six tabs show their place name without clipping; numbers sit centred in the brown squares.
## 18. (superseded) Player info boxes fill the side bar

Removed: the info boxes no longer stretch to the window (`spreadInfo()`, `alignControl()` and the `--ppx-*` variables are gone). Section 19 describes the info boxes, the sidebar and the whole look that replaced it.

## 19. Park Poster: the default theme of replay, fork, sandbox and live play

Scope: new `web/css/parkposter.css` (loaded LAST by `replay.html`, `fork.html`, `sandbox.html`, `play.html`, after `table.css`), new fonts in `web/fonts/` (Bowlby One 400, Barlow Condensed 500/600/700, Barlow 500/600/700, all `latin` woff2 from fontsource), small markup changes in the four HTML files, and changes in `side-panel.js`, `sidebar.js`, `dock.js`, `zoo.js`, `layout.js`, `playback.js`, `settings.js`, `main.js`. The art (maps, tracks, folders, cards, icons, badges, workers) is untouched. This section SUPERSEDES the look and the sidebar / move bar / dock layout of sections 3, 4, 8.9, 8.10 and 18 where they disagree (the structure, ids and behaviour of those sections still hold unless stated here). Do not touch the "round N" overrides of `replay.css` / `table.css`: `parkposter.css` overrides them with `body.viewer ...` selectors (higher specificity), so removing the file brings the old wooden look back.

Look (tokens on `body.viewer`: `--teal --teal2 --sun --gold --rust --paper --ink --blue --red --act1 --act2`; a later theme can redefine them or replace the file): teal sky (radial gradient) with spinning rays (`body::before`), a pulsing sun (`body::after`) and two hills (`#app::before`, a data-URI SVG), all `position: fixed; z-index: -1`; cream paper panels (`--paper`) with a 4 px ink border, 20 px radius and a hard `0 6px 0` ink shadow; Bowlby One for headings and numbers, Barlow Condensed for texts. Everything is in design px (1920 wide, zoomed by `layout.js`).

Layout (no more three "levels"; plain page scroll, the sidebar is fixed):
- `.layout` padding: `0 calc(320px + 28px) 0 14px`. `.movebar` is `position: sticky; top: 0; z-index: 30` inside `main`, a translucent teal band with `backdrop-filter: blur(8px)`; it keeps its place in the flow (grows when the fork action bar wraps), so it never covers content. Markup: `.movebar > .movepill (#actionbar, #current, #enginemark) + #hdrstats`. `.movepill` is the cream pill with the step text / the playable bar. `#hdrstats` is filled by `headerStats()` in `side-panel.js` on every drawn position: a round pill (starburst with the number + "Round") and an orange break pill ("Break", `n/9` in Bowlby One, nine pips: `done` = gold, `cur` = the last filled one is ringed); live games append `gameMenu()` (concede / abandon / overtime) after the pills. The deck, discard and endgame-deck counters and the pile pop-up buttons were removed on purpose (`pile.js` stays but nothing opens it).
- `.shared`: the display (`.displaycol`) and the association element (`.tablecol`) are two separate paper panels (padding 6 px). `fitDisplay()` in `layout.js` takes the panel's border and padding into account (`colX`, `colY`): `wa = (rd (W - colX) + colY - c) / (rd + rb)`, so both panels stay exactly equally high. The project areas lose their own frame (`.projpanel` has no background / border inside the panel).
- `.zoos`: two paper panels with a 40 px gap above them for the tab: `.zoo h2` is the dark tab (a dot in the player's colour from `--pc`, set in `zoo.js`, the name, the map name). The active zoo has a gold ring. Under the map row the played cards are in `.played` (`zoo.js`): the sections Animals / Sponsors (/ Released) side by side, titles WITHOUT counts, cards 92 px wide, wrapping onto more rows when there are many.
- Sidebar (fixed, 320 px wide, 12 px from the right edge, no zoom of `#side` any more): the Control | Log tabs are two separate buttons ABOVE the panes (`.sbtabs`, outside the control panel); the Control pane = control panel (`header.bar`, a paper panel) + `#forkinfo` + `#side` (the two info boxes, `display: grid; gap: 10px`); the Log pane = the move list filling the whole sidebar (`.moves` is a paper panel). The pane scrolls when its content is higher than the window (bonus tokens, timeline row, fork box). `fitSidebar()` (still called by `layout.js`, `main.js`, `settings.js`) only resets `#side`'s zoom.
- Control panel: round icon buttons (inline SVG in the HTML; `playback.js` swaps the play / pause SVG, `PLAY_SVG` / `PAUSE_SVG`), then the line, then one row `Move [n]` (the total number of moves is NEVER shown, so the end of the game is not spoiled: no `#jumpof`)`), the gear (settings) and Fork (the fork glyph was removed from the text). The line is a decoration (`#tldeco`: dashed line with a gold dot) while the timeline is off; `applyTimeline()` in `settings.js` shows `#timeline` INSTEAD of `#tldeco` (setting "Timeline in the control panel"). Autoplay speed buttons live only in the settings pop-up (restyled, same ids / classes).
- Info boxes (`.pp`, built by `sidePanel()`; `--pc` = the player's BGA colour, class `light` for light colours): band (`.pphead`: live dot for the active player, name link, eye button, clock badge, score starburst), five tiles `.ppres` (money, X tokens, reputation, appeal with the income as a gold badge, conservation points; the number sits on the icon, X tokens below it), the row `.ppres2` (available workers, hand `n/limit` with `.over` red, the extra endgame cards ONLY when the player holds more than usual: `+n` where usual = 2, or 1 from 10 conservation points; the bonus tokens `.bons` at the right end, several fit), the five action cards `.ppactions` (border `--act1` blue, `--act2` red when upgraded, 38 px icons, the Marine Worlds variant badge, the chosen card lifted), and `.ppicons`: three `.icrow` rows of 5 / 5 (6 with Marine Worlds: Sea Animal) / 5 round 42 px badges with the count in a 28 px bubble at the corner (zero = faded). The flash classes (`flash-up` / `flash-down`) are still put on the nodes (`S.lastNums` keys unchanged; round and break are in `#hdrstats`).
- Hand dock (`dock.js` keeps all its logic: selection, fold, drag-to-reorder, dimming, marks): the cards of the shown row lie in a fan at the bottom left (`--i` = place counted from the middle, `--n` = count, set by `renderDock()`; rotation `--i * 3deg`, overlap `min(106px, 520px / n)`), only their upper part is visible at rest and they rise by 82 px on hover. The hover is jitter-free by construction: `.dock` is a fixed box, its `::after` covers the strip where the cards lie at rest (`pointer-events: auto`), the panel moves with `transform` (not the dock), and a short `transition-delay` on the way down. At the left of the fan are the two player groups (name chip + Hand n + Endgame n buttons, the old selection logic), the fold arrow is hidden (clicking the selected button again still folds the cards). `body` gets `padding-bottom: 150px` so the last row stays reachable. Fix: `renderDock()` removes the fading `.card-gone` ghosts of departed cards from the shown row before setting `--n` / `--i` (they used to take a fan slot and vanish 0.8 s later, leaving the fan lopsided, most visibly after jumping many moves at once). Fan shape: all cards rotate about one common pivot (`transform-origin: 50% 230%`, angle step `--a = min(4.5deg, 40deg / n)`, overlap `min(46px, 330px / n)` plus the spread of the rotation), so they lie on a circle like a real fan; the outline is a 1 px hairline plus a soft shadow (was a 3 px ink ring + 4 px ink drop), marked cards get a 3 px gold ring. Fixes: the active player's info box has no gold ring any more (the yellow contour of the zoo is enough); the "/ total" after the Move number is gone again (it had slipped back in with `d201edf`; `#jumpof` removed from the four pages, `main.js` and the CSS). Round pill reads "Round (5)" with a solid teal circle (`.rcircle`, no starburst: that is only for scores); the selected sidebar tab (`.sbtab.on`) is leaf green `#3F9A4E` with paper text (the orange is the break pill's); the log lists only the moves up to the one on show (`render()` in `main.js` sets `hidden` on the later `#moves li`, so the end of the game is not spoiled). The round number circle is rust red (`--rust`; the Fork button stays teal). Move bar text: the step text (`.current`) and the choice buttons (`.movepill .abtn`) share one font, Barlow 700 18px, both centred (the step text is ink; it used to be Barlow Condensed 25 / 21 px, the buttons inherited Barlow 500). Replay only: while an action card is chosen, the move bar no longer shows the X token count, its - / + buttons and the "put back for an X token" button (`action-bar.js`, `if (!FORK) return;` before that block); fork, sandbox and live play keep them. Hand size: the default hand is 1.5 x the first Park Poster design. `--hk = 1.5 * --hs` on `body.viewer` scales the dock (width / height, panel offset, hover rise, card width, overlap, radius, `body` bottom padding, and the left padding that makes room for the outermost swinging card via `sin()`); `--hs` (0.5, 0.75, 1, 1.25, 1.5, 1.75, 2; default 1) is set on `body` by `applyHandScale()` in `settings.js` from `S.handScale` (`state.js`), chosen with the new "Cards in hand" slider of the settings pop-up (`.setslide`, `.setrange`, `.setticks`) and kept in `localStorage.settings.hand`.
- Fork / sandbox / live play: the same panels (`.forkinfo`, `.forkpanel`, `.sbtools` are paper panels, `.abtn` uses `--act1` / `--act2`, `.forkmove` pills). Not tuned further on purpose (they are "crammed in"); adapt them in a later pass.

BACKEND NEEDED: none.

Verification (1920x1080 and 1366x768, replay #300 of any sample game): header with action pill, Round and Break pills on one row and sticky while scrolling; the display and association panels are equally high; the sidebar (tabs, control panel, two info boxes) fits 1080 px without a scrollbar when the timeline is off; Log tab fills the sidebar and follows the current step; the settings pop-up opens with the gear / `S`, the timeline switch swaps the dashed line for the timeline; the hand fan rises on hover and stays raised while the pointer is over the cards or the strip below them (no flicker); no console errors; `fork.html?table=<id>&step=300&seed=1` and `sandbox.html` (Start) render with the same chrome.
