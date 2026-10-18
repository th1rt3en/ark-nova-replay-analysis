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
After: ES modules in `web/js/`, entry point `web/js/main.js`. The module list and roles are in `docs/frontend_architecture.md` (section "Modules"); the modules are: `action-bar, association, board, cards, dock, fork, frames, icons, layout, load, log-labels, main, notips, playback, pov, projects, sandbox, shared, side-panel, sidebar, state, util, zoo`; plus `settings` (8.10); `logstore.js` is unchanged and **stays a classic script** (it defines the global `LogStore`; it is loaded by `replay.html` and `submit.html`).

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
- `.layout` padding: `0 calc(320px + 38px) 0 14px`. `.movebar` is `position: sticky; top: 0; z-index: 30` inside `main`, a band over the full width (section 42: it reaches over the sidebar); it keeps its place in the flow (grows when the fork action bar wraps), so it never covers content. Markup: `.movebar > .movepill (#actionbar, #current, #enginemark) + #hdrstats`. `.movepill` is the cream pill with the step text / the playable bar. `#hdrstats` is filled by `headerStats()` in `side-panel.js` on every drawn position: a round pill (starburst with the number + "Round") and an orange break pill ("Break", `n/9` in Bowlby One, nine pips: `done` = gold, `cur` = the last filled one is ringed); live games append `gameMenu()` (concede / abandon / overtime) after the pills. The deck, discard and endgame-deck counters and the pile pop-up buttons were removed on purpose (`pile.js` stays but nothing opens it).
- `.shared`: the display (`.displaycol`) and the association element (`.tablecol`) are two separate paper panels (padding 6 px). `fitDisplay()` in `layout.js` takes the panel's border and padding into account (`colX`, `colY`): `wa = (rd (W - colX) + colY - c) / (rd + rb)`, so both panels stay exactly equally high. The project areas lose their own frame (`.projpanel` has no background / border inside the panel).
- `.zoos`: two paper panels with a 40 px gap above them for the tab: `.zoo h2` is the dark tab (a dot in the player's colour from `--pc`, set in `zoo.js`, the name, the map name). The zoo of the player on turn carries no mark on the board itself (the gold ring of the active zoo was removed; how to show the turn on the boards is open, the sidebar's player panels still show it with the glowing gold line, `.pphead.on`). Under the map row the played cards are in `.played` (`zoo.js`): the sections Animals / Sponsors (/ Released) side by side, titles WITHOUT counts, cards 92 px wide, wrapping onto more rows when there are many.
- Sidebar (fixed, 320 px wide, 12 px from the right edge; since section 42 it starts at y = 90, under the top row; its content is a fixed 300 px wide, see 42): the Control | Log tabs are a segmented switch at the top of the sidebar, ABOVE the panes (`.sbtabs`, outside the control panel, see 42); the Control pane = control panel (`header.bar`, a paper panel) + `#forkinfo` + `#side` (the two info boxes, `display: grid; gap: 10px`); the Log pane = the move list filling the whole sidebar (`.moves` is a paper panel). The pane scrolls when its content is higher than the window (bonus tokens, timeline row, fork box). `fitSidebar()` (called by `layout.js`, `main.js`, `settings.js`, `sidebar.js`) measures the pane's scrollbar width (`--sbgutter`, section 42).
- Control panel: round icon buttons (inline SVG in the HTML; `playback.js` swaps the play / pause SVG, `PLAY_SVG` / `PAUSE_SVG`), then the line, then one row `Move [n]` (the total number of moves is NEVER shown, so the end of the game is not spoiled: no `#jumpof`)`), the gear (settings) and Fork (the fork glyph was removed from the text). The line is a decoration (`#tldeco`: dashed line with a gold dot) while the timeline is off; `applyTimeline()` in `settings.js` shows `#timeline` INSTEAD of `#tldeco` (setting "Timeline in the control panel"). Autoplay speed buttons live only in the settings pop-up (restyled, same ids / classes).
- Info boxes (`.pp`, built by `sidePanel()`; `--pc` = the player's BGA colour, class `light` for light colours): band (`.pphead`: live dot for the active player, name link, eye button, clock badge, score starburst), five tiles `.ppres` (money, X tokens, reputation, appeal with the income as a gold badge, conservation points; the number sits on the icon, X tokens below it), the row `.ppres2` (available workers, hand `n/limit` with `.over` red, the bonus tokens `.bons` at the right end, several fit), the five action cards `.ppactions` (border `--act1` blue, `--act2` red when upgraded, 38 px icons, the Marine Worlds variant badge, the chosen card lifted), and `.ppicons`: three `.icrow` rows of 5 / 5 (6 with Marine Worlds: Sea Animal) / 5 round 42 px badges with the count in a 28 px bubble at the corner (zero = faded). The flash classes (`flash-up` / `flash-down`) are still put on the nodes (`S.lastNums` keys unchanged; round and break are in `#hdrstats`).
- Hand dock (`dock.js` keeps all its logic: selection, fold, drag-to-reorder, dimming, marks): the cards of the shown row lie in a fan at the bottom left (`--i` = place counted from the middle, `--n` = count, set by `renderDock()`; rotation `--i * 3deg`, overlap `min(106px, 520px / n)`), only their upper part is visible at rest and they rise by 82 px on hover. The hover is jitter-free by construction: `.dock` is a fixed box, its `::after` covers the strip where the cards lie at rest (`pointer-events: auto`), the panel moves with `transform` (not the dock), and a short `transition-delay` on the way down. At the left of the fan are the two player groups (name chip + Hand n + Endgame n buttons, the old selection logic), the fold arrow is hidden (clicking the selected button again still folds the cards). `body` gets `padding-bottom: 150px` so the last row stays reachable. Fix: `renderDock()` removes the fading `.card-gone` ghosts of departed cards from the shown row before setting `--n` / `--i` (they used to take a fan slot and vanish 0.8 s later, leaving the fan lopsided, most visibly after jumping many moves at once). Fan shape: all cards rotate about one common pivot (`transform-origin: 50% 230%`, angle step `--a = min(4.5deg, 40deg / n)`, overlap `min(46px, 330px / n)` plus the spread of the rotation), so they lie on a circle like a real fan; the outline is a 1 px hairline plus a soft shadow (was a 3 px ink ring + 4 px ink drop), marked cards get a 3 px gold ring. Fixes: the active player's info box has no gold ring any more (the yellow contour of the zoo is enough); the "/ total" after the Move number is gone again (it had slipped back in with `d201edf`; `#jumpof` removed from the four pages, `main.js` and the CSS). Round pill reads "Round (5)" with a solid teal circle (`.rcircle`, no starburst: that is only for scores); the selected sidebar tab (`.sbtab.on`) is leaf green `#3F9A4E` with paper text (the orange is the break pill's); the log lists only the moves up to the one on show (`render()` in `main.js` sets `hidden` on the later `#moves li`, so the end of the game is not spoiled). The round number circle is rust red (`--rust`; the Fork button stays teal). Move bar text: the step text (`.current`) and the choice buttons (`.movepill .abtn`) share one font, Barlow 700 18px, both centred (the step text is ink; it used to be Barlow Condensed 25 / 21 px, the buttons inherited Barlow 500). Replay only: while an action card is chosen, the move bar no longer shows the X token count, its - / + buttons and the "put back for an X token" button (`action-bar.js`, `if (!FORK) return;` before that block); fork, sandbox and live play keep them. Action card draft in the replay: the draft frame is drawn into a lightbox (`#draftbox`, created by `draftPopup()` in `action-bar.js`, class `.draftbox` / `.draftpop` in `parkposter.css`) instead of the move bar: dimmed boards (not the sidebar), the paper panel centred in the area left of the sidebar, one row per player, the cards in full size (`clamp(120px, 1230px / --cn, 250px)` wide), picked card ringed green. `actionBar()` hides and empties the box on every call and fills it only for a `draft` frame when not in a fork / sandbox / live game (they still draw the draft into the bar, they need its buttons); in the replay the move bar shows the step text during the draft (`main.js`: `cur.hidden` no longer true for the draft frame). Move bar font, root cause: `table.css` still set `font-size: .95rem` / a brown colour on `.movebar .actionbar:not([hidden]) ~ .current` and `.95rem` + weight 900 on the bar's bold text, and those won over the theme whenever a bar sat beside the step text. Now the font is declared once on `.movepill` (`700 18px Barlow`) and the step text (both states), the bar, its `b` / `.who` and the `.abtn` choices use `font: inherit`; change the move bar font only there. Top row alignment: the step pill (`.movepill`, min-height), the Round and Break pills (`.pill`) and the Control / Log tabs (`.sbtab`) are all 60 px high with their top edge at y = 8 (the move bar band is 80 px high; the fixed sidebar starts at `top: 8px`, its height is `100vh - 20px`). The move bar has no band behind it any more (`.movebar` is transparent, no blur; the pills float on the poster and the boards scroll underneath them). Top band (option B3): `#app::after` is a fixed full-width band 80 px high (`#08303b`, 4 px gold line at the bottom) behind the top row, z-index 15 (over the scrolling boards, under the sidebar (20) and the move bar (30)); only at 900 px and wider. `.movebar` itself stays transparent. Content start: the display / association boards and the control panel both start at y = 86 (`.movebar` margin-bottom 6 px under its 80 px; `.sbtabs` margin-bottom 8 px). The gap between the display / association boards and the player name tabs is 10 px smaller (`.shared` margin-bottom 18 -> 8 px; `.zoos` padding-top stays 40 px with the tabs 2 px below its top). Background (option A): the sun is gone (`body::after` and `pp-pulse` removed); the rays (`body::before`) now turn about a point beyond the top right corner, so the layer is a 4800 px circle at `left: -400px; top: -2500px`, still one rotation per 240 s. Hand drag: dragging a hand / endgame card no longer uses the browser's drag and drop (its drag image is always see-through); `dragRow()` in `cards.js` uses pointer events: the card itself follows the pointer at full opacity (`--dx` / `--dy` in its transform, `.dragging` in `parkposter.css`), neighbours swap places when the pointer passes their middle (`refan()` renumbers `--i`), the click that ends a drag does not mark the card (the swap test: the dragged card lies after the neighbour -> swap when the pointer is left of its middle; before it -> when right of it; an inverted test once made every swap a no-op). Fan variables: `--amax` (angle between two cards), `--atot` (largest total angle), `--sp` (distance of two cards) on `.dockpanel .cards`. Fan angle (option F2): `--amax: 8deg; --atot: 64deg` on `.dockpanel .cards` (was 4.5 / 40). Hand size: the default hand is 1.5 x the first Park Poster design. `--hk = 1.5 * --hs` on `body.viewer` scales the dock (width / height, panel offset, hover rise, card width, overlap, radius, `body` bottom padding, and the left padding that makes room for the outermost swinging card via `sin()`); `--hs` (0.5, 0.75, 1, 1.25, 1.5, 1.75, 2; default 1) is set on `body` by `applyHandScale()` in `settings.js` from `S.handScale` (`state.js`), chosen with the new "Cards in hand" slider of the settings pop-up (`.setslide`, `.setrange`, `.setticks`) and kept in `localStorage.settings.hand`. Drag fix: the move / up listeners of `dragRow()` sit on `window` (pointer capture proved unreliable: after a fast move the card was left behind with no `pointerup`, so it floated, stuck in `.dragging`, and sank out of view when the hand panel dropped); the pointer is clamped to the hand's rectangle (+60 px sideways, +90 px above, +40 px below at the default size, times the hand size setting; the card itself also stays inside the window at the top and the sides), `body.card-dragging` keeps the raised hand up while dragging, and the drag also ends on window blur. Point of view: both eyes open at once is gone. Exactly one eye is open (`S.pov` = 0 / 1); clicking the closed eye switches to that player and closes the other, the open eye does nothing (`toggleEye()` in `pov.js`), so the dock (hands / endgame cards) shows only the chosen player's buttons and cards. An old stored `pov:<table> = 'all'` (or `&pov=all`) is read as unset, i.e. the first player. `S.pov = null` remains only in live play, where the server decides what a seat sees. Hand greyed out by mistake: in a Sponsors action whose prompt has nothing left to play (`options.sponsors.hand` and `.display` both empty, e.g. while the effects of the sponsor just played resolve, game 833146203 moves 30-32) `handDim()` in `dock.js` used to grey out the whole hand; now the hand is only dimmed while a sponsor can still be chosen from the hand or the display. Hand count buttons: the player's name and the cream frame are gone (the open eye says whose cards these are, `dockwho` removed from `dock.js` / CSS); the two buttons (hand, endgame cards) are two loose pills stacked at the bottom left, each with its own 3 px ink outline and 4 px shadow, 100 x 62 px, icon 40 px, count in Bowlby One 28 px; 130 px together, about the part of the fan that shows at rest (a first try with 90 px pills, as high as the whole resting strip, was too big); fixed (they do not follow the hand size slider). The selected one is orange as before. Spectator choice and orientation: every time a replay is opened in a new tab (no `orient:<table>` in sessionStorage; F5 keeps it, closing the window and entering the ID again asks again) a lightbox (`askSpectated()` in `pov.js`, `#povChoice`, `.povbox` / `.povchip` in `parkposter.css`) asks "Choose which player to spectate" with one chip per player (colour dot + name); the choice opens that player's eye and sets `S.orient` (0 / 1, stored per tab as `orient:<table>` in sessionStorage, passed to forks as `&orient=`). The orientation is separate from the eyes: the chosen player's map is the left one and their player box the upper one (`seatOrder()` is used by `main.js` for the zoos, `side-panel.js` for the boxes and `action-bar.js` for the draft rows); switching the eye later changes only what is shown of the cards. The first draft pop-up is hidden while the dialog is open, keyboard shortcuts are off meanwhile. Live play and the sandbox keep seat 0 left; the 0.75x hand size seen in the user's screenshot is not a new default (the default stays 1.00x). The dialog is 1.5 x bigger (box 960 px, title back at 26 px on one line, chips 93 px high with 22 px names (the first fonts), 27 px colour dots) and a chip only selects (orange, `aria-pressed`); the choice is applied by the green Confirm button, which stays disabled until a player is selected, so it can be changed first. Spectator dialog, final sizes (option B of the mockups): box 1100 px (room for about 20 characters per name, "Propaganda Panda" is 310 px at this size and is shown whole, longer names end in an ellipsis), title 36 px, chips 96 px high with the names in Bowlby One 27 px, Confirm 76 px high / 28 px; Enter confirms once a player is selected (a capture-phase key listener of the dialog). The action card draft lightbox (`.draftbox`) now dims the whole window: full width, z-index 90 (over the move bar, sidebar and hand), `pointer-events: none` on the backdrop so the playback buttons in the dimmed sidebar still work, the panel (`.draftpop`, `pointer-events: auto`) is centred in the area left of the sidebar (`padding-right`).
- Fork / sandbox / live play: the same panels (`.forkinfo`, `.forkpanel`, `.sbtools` are paper panels, `.abtn` uses `--act1` / `--act2`, `.forkmove` pills). Not tuned further on purpose (they are "crammed in"); adapt them in a later pass.

BACKEND NEEDED: none.

Verification (1920x1080 and 1366x768, replay #300 of any sample game): header with action pill, Round and Break pills on one row and sticky while scrolling; the display and association panels are equally high; the sidebar (tabs, control panel, two info boxes) fits 1080 px without a scrollbar when the timeline is off; Log tab fills the sidebar and follows the current step; the settings pop-up opens with the gear / `S`, the timeline switch swaps the dashed line for the timeline; the hand fan rises on hover and stays raised while the pointer is over the cards or the strip below them (no flicker); no console errors; `fork.html?table=<id>&step=300&seed=1` and `sandbox.html` (Start) render with the same chrome.

## 20. Hand display: floating tray (setting)
Settings has a drop-down "Hand display" (`S.handMode`, saved in `localStorage.settings.handMode`): `tray` (default, listed first) or `fan` (the fan at the screen edge). No arrow button: only the header strip and H fold it. Tray mode (`dock.js` `drawTray`, CSS block "the floating tray" in `parkposter.css`): a cream tray at the bottom left with the cards flat in one row (width 170 px x `--hs`; no overlap until the boards' width is reached, see 21 and 30); BGA-style round grey discs (hand / endgame cards, with the count badge) straddle its top edge. A click on the tray header, or the key `H` (`toggleDock()`) folds / unfolds it (`.fol` / `.unf`; folded, the top of the cards stays visible). One-time hint "Click the tray to fold or unfold it": remembered in `localStorage.handTrayHint`, but shown every time the setting is selected (`handmode` event) once the settings pop-up closes (`settingsclosed`). Drag-reorder works as in the fan.

## 21. Tray: animated fold, width grows with the hand
`drawTray` (dock.js) keeps the `.handtray` / `.trayframe` / `.traybtns` elements from one draw to the next (it used to rebuild them, so nothing could animate): `.fol` / `.unf` flip on the same element and the frame's `height` transitions (0.4 s), so the tray glides down / up. Width: the cards lie next to each other with no overlap; the frame is `min(--maxw, cols x card width + 50px)` (5 px border + 20 px padding per side) and grows with the hand (`--cols` = min(cards, 20), no width animation). `--maxw` = the width from the left to the right edge of `.shared` (the display / association boards, in design px, `trayBox()`, also updated on window resize; see follow-up 2), so the tray never reaches the side bar. Once that is reached the overlap is dynamic: the row is a CSS grid (`grid-template-columns` set by `drawTray`: `repeat(cols-1, var(--step)) var(--W)`) and `--step = W + min(0, (avail - cols x W) / (cols - 1))`. No wrapping up to 20 cards (`TRAY_ROW`); more than 20 get further rows (grid) and the row scrolls vertically (`.cards.multi`, max height one card row).
Follow-up: the header strip is 20 px high (the same as the side padding) and the cards have 5 px under them (unfolded height `30px + 1.3972 x card width`; folded `25px + 74px x --hs`); the width does not animate (a switch between hand and endgame cards, or a card arriving / leaving, changes it at once); only the height glides.
Follow-up 2: tray colour is sand `#E3CF9C` (not the panel cream); its left edge is the left edge of `.shared` (14 px at 1920, aligned with the move bar, display and zoos; measured by `trayBox()` in `dock.js`, which sets `left` on the dock and `--maxw` = right edge of `.shared` minus that, on every draw and on resize); the round buttons (`.traybtns`, z-index 40) and the hint (41) always lie in front of the cards (a hovered card is z-index 6, a dragged one 20).

## 22. Selected card: "Leaf tag"
A card selected with a click (`.card.marked`, `.draftcard.marked`; hand, tray, fan, display, endgame cards, the action card draft) no longer has BGA's translucent grey square and green frame, nor the yellow Park Poster ring. Now (end of `parkposter.css`): a 4 px ink outline (inset), a soft tint over the card (`::before`, green `rgba(63,154,78,.28)`) and a green rounded tag with a cream check on its top right corner (`::after`, `clamp(24px, 28%, 46px)`, 3 px ink border, 3 px hard ink shadow; it scales with the card). In the fork (`.forkpage`) the tint and tag are blue (`--mk` / `--mkt` variables). The picked cards of the draft (the log's choice, `.draftcard.picked`) keep their green ring and the round check.
Follow-up: no ink outline on a selected card any more, the tint is lighter (`.14` green / `.13` blue), a selected card has `z-index: 4` so its tag is never covered by the next (overlapping) card (replaced in 30); the Break pill lost its gold ring (`.pill.brk` has only the ink shadow like the other pills).
Fix: the tag was cut at the card's edge because `.card` has `overflow: hidden` (replay.css); a selected card is `overflow: visible` now (its image gets `border-radius: inherit`), so the tag overhangs the top right corner.

## 23. Kept action card: "Ticket frame" + "Sun seal"
The action card kept in the draft (`.draftcard.picked`, also the kept card in the green zone of the second pick) has an orange 6 px frame inside an ink frame (9 px `box-shadow`) with a hard ink drop shadow, and the span `.draftcheck` (added by `action-bar.js`) is now an orange seal with a cream star on the top edge of the card (`clamp(36px, 20%, 54px)`, 4 px ink ring), instead of BGA's green ring and round check. `.draftpop .draftcards` got padding (40 px on top, so the seal does not cover the title) and a 22 px gap. The cards not kept stay faded (`.passed`); a click-selected card keeps the leaf tag (section 22).
Draft lightbox spacing: the title has equal space (about 44 px) above it (popup border) and below it (to the card tops): popup `padding-top: 40px`, `.draftcards` `padding-top: 38px`, no flex gap. The dashed line between the kept card and the two offers is 4 px, `rgba(23, 38, 43, .55)`, and sits halfway between the kept card's frame and the next card (`right: -28.5px`).

## 24. Draft phase details
While the action card draft lightbox is open (`#draftbox` not hidden) `showPreview()` (cards.js) shows nothing: the cards neither enlarge in the lightbox nor in the dimmed background. During the draft (`st.phase === 'setup'`, `st.draft.stage !== 'done'`) the tray is not drawn at all (`drawTray`, dock.js; the fan mode is unchanged). A newly created tray slides up (`.handtray.enter`, `tray-in` 0.35 s, removed on `animationend`): after the draft, and when the hand display setting is changed to the tray.

## 25. Fan: dark glow
The fan (`.dockpanel .cards`) has a dark glow around the silhouette of the whole fan (`filter: drop-shadow(0 0 10px black .9) drop-shadow(0 0 26px black .6)`), so it stands out from the maps and boards behind it. The tray is unchanged.

## 26. Fan intro animation (`dock.js`)

When the hand is shown as a fan, it no longer blinks in. `dockIntro(row, handCount, seat, setup, tray)` (called `fanIntro` at first) runs after the fan is built in `renderDock` (and after the tray's cards are placed in `drawTray`):
- **Deal** (only while the game is still in its setup: the hand of that seat was empty at the previous drawing in the setup phase and now has cards, i.e. the starting hand is dealt, also after jumping back in the replay). A hand that falls to 0 cards during the game and is refilled does not animate. The `card-new` flash is not used any more (section 27).
- **Rise and spread** (page load, switching the hand display setting): the closed stack rises from below, then spreads from the centre to both sides into the fan (`FAN_RISE_MS` 900 ms).
- Only once per appearance (`fanDone`, reset by the `handmode` event). `renderDock` rebuilds the fan on every redraw, so a running intro continues with a negative `delay` (elapsed time) instead of restarting; earlier intro animations on the same card are cancelled first (only plain `Animation`s, CSS transitions are left alone).
- Not gated by `prefers-reduced-motion` (like the tray slide-up; Windows with animation effects off reports it, and the intro would never show).

## 27. No arrival / departure animations (for now)
All the arrival and departure effects of the zones are off until new ones are designed:
- `.card.card-new`, `.projline.card-new`, `.btoken.card-new` have `animation: none` and the green frame of new partner zoos / universities / buildings (`.tok-new .frame`) is hidden (end of `parkposter.css`).
- Departed cards, bonus tokens, buildings and association tokens no longer fade away in red: `zoneNew` (cards.js) does not fill `.gone` any more, so no ghost (`card-gone`, `tok-gone`) is drawn anywhere. To bring them back, restore the `test.gone.push(...)` in `zoneNew`.
- The number flashes of the player tracker (`flash-up` / `flash-down`) are not touched.

## 28. Floating tray: the starting hand drops in
Same trigger as the fan's deal (setup phase, empty hand -> the starting hand; `dockIntro(..., tray = true)` in `drawTray`, dock.js). The tray slides up empty (`tray-in`, 350 ms = `TRAY_SLIDE_MS`), then the cards fall into it from above one after another (`DROP_MS` 560, `DROP_GAP` 100: tilt of 9 degrees to alternating sides, a small bounce, `fill: 'backwards'` so they stay invisible until their turn). They may leave the tray's frame while falling (not clipped). A redraw while it runs goes on with a negative delay. While the action card draft is open `drawTray` records the (empty) hand, so the deal after the draft is recognised although no tray is drawn then. Refilled hands during the game do not animate.

## 29. Floating tray: no outline, dark glow
`.trayframe` (parkposter.css) has no ink outline any more: its 5px border is transparent (the sand background shows through, so sizes and the card layout are unchanged) and it has the same dark glow as the fan (`0 0 10px rgba(0,0,0,.9), 0 0 26px rgba(0,0,0,.6)`).

## 30. Floating tray: gap between cards, check tags always in front
- The cards of the tray had a gap of 0, so their 1px ring shadows touched / overlapped. `--gap: 8px` (`.handtray`, parkposter.css) is now part of `--step` and of the frame width: cards without compression are 8px apart; when the row is too wide for the tray the overlap is computed from the remaining space as before.
- The check tag of a selected card (`.marked::after`) is no longer hidden by a neighbouring card, selected or not: a selected card (not `.draftcard`) has `z-index: auto` and, in the tray, `transform: none` (unless dragged), so it builds no stacking context and the tag (`z-index: 10`) is sorted among all cards of the row; the tint (`::before`) has `z-index: auto` so it stays at its card's level. In the fan the cards are rotated (each one a stacking context), so the tag is still under later cards there.

## 31. Switching the hand display to the fan (dock.js, parkposter.css)
In the `handmode` listener: switching to the fan from an **unfolded** tray makes the fan appear raised like on hover (class `raised` on `#dock`, same transform as `.dock:hover .dockpanel`; it rises and spreads in that state) and it sinks to its resting place when the settings close (`settingsclosed` removes the class; the CSS transition does the sinking). Switching from a **folded** tray: the fan has no folded state except "not drawn" (`S.dockHidden`), so `dockHidden` is reset and the fan appears at rest. Not changed: a page that loads in fan mode with a stored `dockHidden`.

## 32. Review clean-up (dock.js, parkposter.css, docs)
- dock.js: one `handmode` and one `settingsclosed` listener (there were two of each, the first one had to run before the second); `fanIntro` is called `dockIntro` (it also drives the tray) with `introState` / `introDone`; the dead `card-new` removal in the deal is gone; the tray's count badges read the shown state (`st`, so a point of view is respected) instead of `S.replay.steps[S.step].state`; the inline `left` that the tray sets on `#dock` is cleared when the fan is shown again.
- parkposter.css: the selected-card rules no longer set a z-index first and override it later (`.draftcard.marked` keeps 4 / 2 / 3, cards of every other zone have none for the tint and 10 for the tag); the tray comment describes the real layout.
- Docs: `docs/frontend_architecture.md` (cards.js / dock.js rows), the `zoneNew` comment in state.js and the outdated sentences in sections 20, 21 and 26 of this file were corrected.
- Left as it is on purpose: the code of the departure ghosts and arrival flashes (`ghost()`, `card-gone`, `tok-gone`, `card-new` / `tok-new` and their rules in replay.css) is now unused but kept for the new animations.

## 33. Timeline: dotted line without a circle, filled progress, draggable head
- The dotted line that stands in for a switched-off timeline (`.tldeco`) has no circle any more.
- The timeline fills up: `.tlfill` (first child of `#timeline`, under the round marks) is as wide as the head's position (`updateTimeline()`), a gradient from sun orange to gold that stretches with the fill, so it is gold at the head (`var(--tlfill, ...)` in parkposter.css).
- The head can be dragged: `buildTimeline()` (playback.js) uses pointer events on the whole bar (pointer capture, `touch-action: none`): a press goes to the step under the pointer, moving goes on to the steps under the pointer and the board follows while dragging (at most one `go()` per animation frame); a running autoplay is paused when the bar is pressed. The head has a wider invisible grab area (`.tlhead::before`) and a grab cursor. The old `onclick` is replaced by the press.

## 34. Draft lightbox centred on the whole window
`.draftbox` (parkposter.css) had `padding-right: sidebar width + 24px`, so the action card draft panel sat in the middle of the area left of the sidebar (set in the commit "draft lightbox dims the whole window"). The padding is gone: the panel is centred on the window (measured: centre = half the window width at 1920 and 1366 px wide).

## 35. Spectator dialog: smaller, warm gold chips
The first-visit dialog (`#povChoice`, pov.js) was sized for a poster (1100 px wide, 36 px title, 96 px chips) and looked big next to the action card window. Now it is 880 px wide like that window (882), the title is Bowlby One 24 px, the chips 60 px high (20 px names, 4 px border, 17 px colour dot) and Confirm 52 px (20 px), spacing 22 px. Before a choice both chips are warm gold (`#F7DD9B`, hover `#F4D07A`); the chosen chip is sun orange as before. The two duplicate `.povdot` rules were merged.

## 36. No enlarged card after a click on a card of the hand
`cards.js`: a click on a card in `#dock` (hand and endgame cards; tray and fan) hides the enlarged card and holds it back (`holdPreview`, `heldSrc`): while the pointer stays on that card, also when the card is drawn again under it by the click, the enlarged view does not come back, not even after the 1 s delay. When the pointer leaves the card (`mouseout` on a `.card` towards outside it), or hovers a different card first, the usual 1 s rule applies again. (Touch screens: see 37.)

## 37. Touch screens: a long press opens the enlarged card
A tap used to open the enlarged card at once (the mouse events a tap makes up). Now a tap only does its normal job (selecting a card, ...); the enlarged card opens when a finger stays on a card for 1 s (`TOUCH_HOLD`) without moving more than 10 px (`TOUCH_SLOP`; moving cancels it, so dragging a card of the hand still works), stays while the finger is down and closes when it is lifted; the click that may follow a long press is swallowed, the browser's context menu and iOS callout are off (`contextmenu` handler, `-webkit-touch-callout` / `user-select: none` on `.card` and `.draftcard`, parkposter.css). Mouse behaviour is unchanged (1 s rest).
All places that show an enlarged card use one helper now, `bindPreview(element, src, centered)` (cards.js; `src` / `centered` may be functions): cards, the draft cards (action-bar.js), the project strips (projects.js), the card buttons of the sandbox (sandbox.js) and the action cards of the side panel (side-panel.js). `showPreview` ignores the mouse events a tap makes up.

## 38. Logo at the top left, stacked Round pill
- New logo: the crowned emu on a hill in a circle (rays and hill like the page background; the crown keeps a gap to the border). It is a vector file, `web/brand/logo.svg` (the silhouette `web/brand/emu_silhouette.png` is traced), with PNG exports (`logo-1024 / 512 / 180 / 64 / 32.png`) and `favicon.ico`; everything is made by `scripts/build_logo.py` (needs cv2, Pillow, playwright). Use `logo.svg` or `logo-1024.png` for other projects (the files have the dark ring only).
- `<a class="brand" href="/">` is the first child of `.movebar` in replay.html, fork.html, sandbox.html and play.html: 60 x 60 px (the height of the pills) with the pills' hard shadow (`drop-shadow`) and a thin light outer line (a 3 px `border` of `#6E9AA3` inside the 60 px, because the dark ring is invisible on the dark band), a link to the start page; hover lifts it 2 px, a press sinks it, `:focus-visible` has a gold outline. `align-self: flex-start`, so it stays in the band at the top when the bar grows (fork / play with choices).
- The room comes from the Round pill, which is stacked now (`pill.rnd`, 84 px instead of 114): a small "ROUND" above the number in rust (Bowlby One 28 px); the move bar pill (flexible) gives up the rest by itself. The Break pill is unchanged. Measured on the rendered pixels (4x zoom, rounds 1-10): "ROUND" is centred (`text-indent` = the letter spacing, it sat 0.9 px left), the number is centred by its ink (`centreInk()` in side-panel.js, canvas `measureText`; the digits have uneven side bearings: a 1 sat 1.6 px left) to within 0.4 px, 2 px between label and number, and 8 / 7.5 px above and below (`padding-top: 1.5px` balances the block).
- Every page has the favicon (`rel="icon"` ico + svg, `apple-touch-icon`).

## 39. Control panel: the timeline row and the dotted line are centred
Measured on the rendered pixels (4x zoom) as the gap between the ink of the button rows above and below (the buttons' shadows count): in the replay the timeline had 1 px above and 7 px below, the dotted line 13 px above and 16 px below (in the fork pages 19 / 16). Reasons: the autoplay button is 50 px tall with a 3 px shadow and sticks out of its row by 3 px above and 6 px below, and the dotted line was drawn from the middle of its box downwards (`border-top` at `top: 50%`).
- `.tldeco i` is centred on its box (`top: calc(50% - 1.5px)`).
- In the replay (`body.viewer:not(.forkpage)`) the timeline / dotted line row moves down 3 px with a margin pair (`margin-top: 3px; margin-bottom: -3px`, so the bar keeps its height). The fork pages hide the autoplay button and need no shift.
- Result: timeline 4 px above and below (head included); dotted line 15 / 14 px (replay) and 18 / 17 px (fork pages), the half pixel left is the 3 px line in an odd gap.

## 40. Break pill: a coffee mug instead of the word
The word "Break" in the orange pill is Ark Nova's own symbol now, the coffee mug: BGA's icon sheet has it (`break` = `r3c14`, `strbreak` = `r5c4` with stripes; `web/icons/names.json`), the picture is `web/icons/r3c14.webp` (96 x 108 px) and is used as it is (a vector redrawing and a traced version were tried and rejected: the traced one was jagged, the redrawn ones did not look like the Ark Nova mug). `headerStats()` (side-panel.js) puts `<img class="brkicon" src="/icons/r3c14.webp" alt="Break">` in place of the label; the pill's tooltip still says "Break track: ...". Size and place, measured on the rendered pixels (4x zoom): 32 px high, so the body of the mug (rows 27 to 107) is 23.75 px high like the dots (24 px); its bottom is on the baseline of the digits and the bottom of the dots (y 50), the body is centred on the pill's centre line with `top: -4px` (38.1 against 38.0, bottom on the baseline of the digits); but the faint steam above made that look too high, so it is 2 px lower (`top: -2px`, body bottom at y 52), as measured by eye.

## 41. Logo as tall as the pills, Break pill aligned
Measured on the rendered pixels (4x zoom).
- Logo: the light outer line was a `box-shadow` outside the 60 px box, so the logo looked 66 px next to 60 px pills. It is a `border` inside the box now (`box-sizing: border-box`): the light ring is exactly 60 x 60 px, the same top and bottom as the pills (y 8 to 68), and its left edge (x 14) lines up with the boards below.
- Break pill: the ink of the mug is 20 px from the left rounded end and the ink of the last pip 20 px from the right one (was 22.75 / 18; `padding: 0 20px 0 19.25px`, the mug image starts 0.75 px inside its box). The mug sat 4.5 px lower than the digits and pips because the faint steam counts as part of the image; it is moved up (`top` on `.brkicon`, see 40), so the bottom of the mug, the baseline of the digits and the bottom of the pips are on one line (y 50). Gaps mug - number - pips are 12 px.

## 42. The sidebar as its own place: Control | Log below the top row, shaded wall, dotted rail
Scope: `web/css/parkposter.css`, `web/js/sidebar.js` (no HTML change: the markup of the four viewer pages is as before, `.sbtabs` is still the first child of `aside.sidebar`).
- Top row: Control | Log are no longer in it. `.movebar` spans the whole window width on desktop (>= 900 px): `margin-right: calc(-1 * (var(--sidebar-w) + 38px))`, `padding-right: 12px`. The move pill (`flex: 1 1 0`) takes the freed room (about 340 px more), Round and Break end at x 1908, the right edge of the sidebar. The bar can grow (fork / sandbox / live: choices, buttons) and then reaches over the sidebar, so `.movebar` has `pointer-events: none` and its children `auto` (clicks go through to the sidebar), and `#hdrstats` has `align-self: flex-start` (Round and Break stay in the top line and never cover the Control | Log switch; before they were centred in a tall bar). The band (`#app::after`, 80 px) is unchanged.
- Sidebar: `aside.sidebar { top: 90px; height: calc(var(--vh) * 100 - 102px) }`. `.sbtabs` is a segmented switch: 44 px high pill, 3 px gold outline at 50 %, dark translucent track (`rgba(4, 26, 33, .7)`), two halves in Bowlby One 17 px; the active half is gold with ink text, the other one `#A9CBD1` (hover: paper). Same ids / classes / `aria-selected` as before, `sidebar.js` unchanged in that respect. Then the pane (control panel + info boxes, or the log) follows after a 10 px gap.
- The sidebar's own ground (desktop only): `.layout::before` = the wall, fixed, `sidebar-w + 40px` wide at the right edge, z-index 16 (over the band, under the sidebar at 20 and the top row at 30): a gradient from transparent (the first 4 %, so the arena's edge is not touched) over `rgba(4, 26, 33, .5)` at 30 % to `rgba(3, 20, 26, .88)` at the window edge, so the poster background gets deeper toward the right and the end of the band darkens with it. `.layout::after` = the rail, fixed, 8 px wide, `right: sidebar-w + 16px` (in the 16 px gap between the arena and the sidebar), from y 92 to 8 px above the bottom, gold dots (`radial-gradient` 3 px radius, 16 px pitch) faded out at both ends with a mask.
- Width: the switch, the control panel and the two info boxes are 300 px wide at EVERY window height (a constant: `--sbw: 300px` for the switch; panel and boxes keep their 320 px design and are zoomed by the constant `--sbz: 0.9375` = 300/320, `width: var(--sidebar-w)`, `margin-left: auto`; all in the desktop media block of parkposter.css), right-aligned (the dotted rail gets 20 px more room). Nothing depends on the window height any more (an earlier version scaled 0.91 to 1 by height and the boxes grew when going full screen). `#paneControl` has `scrollbar-gutter: stable`, so the scrollbar space is always reserved and the right edge of the boxes does not move when the scrollbar appears; `fitSidebar()` (sidebar.js) only measures that gutter (`offsetWidth - clientWidth` of the pane) and sets `--sbgutter` on the aside, which the switch uses as `margin-right` so that it ends where the boxes end. At 1920 x 1080 (page scrollbar visible, as in Chrome on Windows) the control pane has about 0 px of vertical scroll (8 px with hidden scrollbars, counting the 10 px bottom padding); in a lower window the pane scrolls; the Log pane is not scaled. Runs after every render, on resize, on a tab switch and when the fonts are loaded.
- Rail spacing: the sidebar content is 300 px (x 1598 to 1898), the rail strip lies at x 1576 to 1584 (`.layout::after`, `right: sidebar-w + 16px`), so the main column was made 10 px narrower: `.layout` padding-right = `sidebar-w + 38px` (was 28), the movebar's negative `margin-right` follows (+ 38px). The arena ends at x 1562; the space is 14 px between the arena and the rail strip and 14 px between the strip and the sidebar content. The arena content is fitted to its column by `fitDisplay` and the zoos, so everything in it is a little smaller.
- Narrow windows (< 900 px, not designed yet): only the segmented look of the tabs applies, no wall, rail or full-width bar.
Verification (Chromium with visible scrollbars, 1920 x 1080 / 940 / 1300, replay #400 of table 770429314): the switch, panel and boxes are 300 px wide (298 on screen at the page zoom 0.992) and end at the same x in all three heights; no console errors.

## 43. Round | Turn element
Scope: `web/js/side-panel.js` (`headerStats`), `web/css/parkposter.css`.
- The stacked Round pill (84 px, section 38) is now a two-part pill, 167 px wide (`.pill.rnd`): two equal 78 px halves (`.half`) and a dashed divider (`.dv`, 3 px, `rgba(23, 38, 43, .45)`, `margin: 9px 0`, `align-self: stretch`; the pill's `align-items: center` would otherwise give the empty `<i>` no height). Each half: the word small above the number (Barlow Condensed 13 px, Bowlby One 28 px), the number centred by `centreInk()` (it is called for both numbers). Round number rust, Turn number "Ocean" (`--ocean: #1F67B0`, new token on `body.viewer`; contrast on paper 5.0:1).
- Turn is the number of turns the player who is acting has had (`turnNumber(st)` in `side-panel.js`, section 58). It does not flash on change (only Round and break do: `flash()`).
- The room (about 83 px more than before) comes from the move pill (`flex: 1 1 0`); the break pill is unchanged (365 px, orange). `.pill.rnd` has `flex: none` so the row never squeezes it. At the page zoom 0.992 the browser draws the 3 px divider 2 px wide (border snapping); at exactly 1920 px it is 3 px.
Verification: replay #400 of table 770429314 at 1920 x 1080: pill 164 px on screen (167 design), 12 px gap to the break pill, no console errors; sandbox and fork pages load without errors.

## 44. Player colours: BGA's own, white shown as grey, names legible on paper
Scope: `web/js/util.js`, `icons.js`, `action-bar.js`, `dock.js`, `fork.js`.
- Replays and forks already took each player's colour from the log (`players[].color`, BGA's own: blue #1863a5, red #b91b1b, yellow #d1c81c, black #000000, purple #c028d3, grey #5a5856, ...) through `seatColor(seat)`: info box header and `--pc`, the dot of the zoo tab, the log line's left border, the cubes and workers on the association board, the hand tray and the pov chips. Only live and sandbox games have no BGA colour: they use `COLORS` in `replay/sandbox.py` (red seat 0, blue seat 1).
- `seatColor` shows BGA's white (all channels >= 235) as a mid grey, `WHITE_AS = #767c82` (white font on it: 4.4:1; clearly lighter than BGA's own dark grey 5a5856). `seatRawColor(seat)` is the colour as BGA has it: `icons.js` `workerUrl` picks the worker meeple with it, so a white player keeps BGA's white meeple.
- New `seatText(seat)`: the colour as TEXT on the pale paper. A light colour (yellow, the grey) is mixed with black in 5 % steps until the contrast with the paper is 4.5:1 (yellow becomes an olive), a dark one stays. Used for every player name set with `style.color` (the move bar's choices in `action-bar.js` and `fork.js`, the hand tray in `dock.js`). Before, a yellow name on the paper pill was nearly unreadable and a white one invisible.
- Not changed: `endstats.css` (`--p0` / `--p1`, the end screen of live games) still has its own fixed red / blue, as the live games have no BGA colours.
Verification: table 833146203 (yellow vs. black) in replay and fork at 1920 x 1080: the info boxes, dots and log lines carry the log's colours; the name in the fork prompt is rgb(115, 110, 15) instead of the pure yellow; with the replay response rewritten so that seat 1 is #ffffff, its info box header is #767c82 with white font; no console errors.

## 45. Action card draft: the last keep gets its frame
Scope: `web/js/action-bar.js`, `web/js/frames.js`.
- Bug (seen in table 927726814, true for every draft log): the replay shows the draft in a lightbox on the frames of the stages `pick1` / `pick2` / `keep` only. The builder (`draft_states`, `builder.py`) turns the stage to `done` AT the step in which the last player keeps their cards (and the starting hands are dealt in the same step), so that step had no draft frame: the viewer jumped from "X must select the 2 action cards you want to keep" straight to the dealt hands and the last chooser's cards never got their orange outline and star.
- Fix: new `draftOpen(st, i)` (`action-bar.js`): true while the stage is not `done`, and on the one step where it turns `done` (the previous step's stage is not `done`). `framesOf` (frames.js), `frameState` (the action card order stays hidden in that frame, shown from the deal on, as before), and the two draft conditions of `actionBar` use it. The fork is unchanged (its draft bar still ends at `done`). The step after has no draft frame, as before.
Verification (Chromium, 1920 x 1080): table 927726814 as sorryimlikethis: step 7 "must select the 2 action cards", step 8 "selected these 2 action cards" with two orange outlines and stars, step 9 no lightbox; as BDWSSBB steps 7 and 8 show its own selection; tables 920295323 and 770429314 (also 8 steps through the draft) the same; no console errors.

## 46. Back / Next at the sides of the action card draft lightbox
Scope: `web/js/action-bar.js`, `web/css/parkposter.css`.
- In the replay the draft lightbox dims the whole window, the control panel included, so nothing said that the playback buttons and the arrow keys still step on. `actionBar` now puts the pop-up into a `.draftwrap` (flex row, gap 26 px, max-width 100 %): `Back | panel | Next` (`draftNav(d)` in `action-bar.js`). Each `.draftnav` is a button: a round 68 px paper button with an ink chevron (hover gold, press sinks, disabled at the very start / end: `atStart()` / `atEnd()` of `playback.js`) and under it the word (Barlow Condensed 18 px, paper on the dim) with a keycap `kbd` (30 px rounded square, paper, 2 px ink border, 3 px ink shadow) holding the arrow of the key that does the same. Click = `stepBy(d)`, the same function as the arrow keys (`main.js`), so it steps through the frames of a step too.
- The panel's `max-width` leaves the room of both buttons (`calc(var(--vw) * 100 - 2 * 118px - 52px)`); only the replay has the lightbox (`bar === $('actionbar') && !FORK`), the fork is unchanged.
Verification (Chromium, table 927726814, 1920 x 1080 and 1280 x 720): Back is disabled at step 0; Next, Next, Back, ArrowRight give steps 1, 2, 1, 2; the buttons sit 26 px from the panel and inside the window in both sizes; no console errors.

## 47. The keys skip the opponent's steps of the action card draft
Scope: `web/js/playback.js`.
- From a player's point of view the draft lightbox shows nothing of what the opponent chooses (`povState` hides their offers / picks / keeps), so the log lines "X chooses action cards (action card draft)" were frames that looked exactly like the one before: Next seemed to do nothing, once per round.
- `stepBy(d)` (arrow keys, the Back / Next buttons of the lightbox, the playback buttons, autoplay) now goes frame by frame and skips a frame when `skipFrame(n, phase)`: a point of view is selected (`S.pov !== null`), it is the first frame of a step, that frame is the draft frame, and `JSON.stringify(povState(state).draft)` (the draft as the viewer sees it) is the same as on the step before. That is the general rule instead of a text match on "(action card draft)", and it covers the last keep too (as the first player, the second player's keep is hidden: its draft frame is skipped, its starting-hand frames after it are not). The steps stay in the log; the log, the timeline and the jump box still go to them (`go()` is unchanged). With both hands open (`S.pov === null`) nothing is skipped.
Verification (Chromium, table 927726814, ArrowRight / ArrowLeft): as sorryimlikethis the steps go 0, 2, 3, 5, 6, 8 (its frames), 9; as BDWSSBB 0, 1, 3, 4, 6, 7, 8, 9; backwards the same way; no console errors.

## 48. Control panel: reef timeline, ? button, Move without arrows
Scope: `web/css/parkposter.css`, `web/replay.html`.
- The timeline fill (`.tlfill`, fallback of `--tlfill`) is a deep teal to mint gradient, `#0E6F78 -> #6FD3A8` (it was sun -> gold, too close to the buttons above); the segment hover tint is the mint.
- Replay only: a placeholder button `#extra` (class `settingsbtn extrabtn`, a "?" in Bowlby One 21 px, same paper fill / ink ring / shadow as the settings wheel) between the wheel and Fork. It does nothing yet.
- The spinner arrows of the Move box are gone (`::-webkit-inner-spin-button`). In the replay row (`.controls:has(.forkbtn)`) Move and Fork are both 92 px wide, 40 px high; with the 8 px gaps Move | wheel | ? | Fork fill the 288 px row exactly, so the outer edges line up with the first and last button above and with the timeline. The other pages (fork, sandbox, play) have no Fork button and keep their flexible Move box (without the arrows).

## 49. Keyboard shortcuts pop-up (the ? button)
Scope: `web/js/shortcuts.js` (new), `web/js/main.js`, `web/replay.html`, `web/css/parkposter.css` (`--mint` token, `.kb*` rules at the end).
- The ? button (`#extra`, replay page only) and the ? key open a pop-up with a full keyboard (main block + navigation cluster, 42 px unit). Only keys with a function are drawn as buttons in mint: Esc, S, H, Space, Home, End, the left / right arrows and `/` (= the ? key). Selecting one (click, or pressing it on the real keyboard) turns it gold and fills the strip below with its name and an explanation.
- While the pop-up is open the keys only explain themselves: a capture-phase handler in `shortcuts.js` stops them (`S` does not open the settings, the arrows do not step), and `main.js` ignores the other keys (`shortcutsOpen()`). Esc, the X and a click on the dimmed background close it.
- The whole window is `zoom: 1.3` on `.kbbox` (base: 42 px key unit, 894 x 500 px; shown 1162 x 648 at a 1920 px window).
- The `D` table of `shortcuts.js` lists the keys and their texts; add a key there when `main.js` gets a new one.

## 50. No-snake mode (settings dropdown)
Scope: `web/js/nosnake.js` (new), `web/js/cards.js`, `web/js/settings.js`, `web/js/state.js`, `web/js/main.js`, `scripts/build_nosnake_images.py` (new), 44 images in `web/cards/` and `web/cards_large/`.
- Settings pop-up: dropdown "No-snake mode" with "Show snake images" (default), "Suppress snake images", "Show Slow Worm instead". Kept in `localStorage.settings.noSnake` (`S.noSnake` = show | hide | worm), so it holds across sessions and tables.
- The 11 cards with a snake in the photo: animals A470 Western Green Mamba, A474 Indian Rock Python, A475 King Cobra, A482 Anaconda, A483 Boa Constrictor, A485 Common European Adder, A487 European Grass Snake, A492 Inland Taipan; projects P109 Reptiles, P125 Reptile Breeding Program; sponsor S203 Veterinarian. (Not included: A488 Slow Worm, P136 Reptile Management Plan, S232 Sponsorship: Reptiles.)
- `snakeSafe(url)` turns `/cards/A487.webp` (and `/cards_large/...`) into `A487_ns.webp` (a dashed "missing photo" frame with a crossed-out camera) or `A487_sw.webp` (the photo of the Slow Worm). It is applied where a card image is set (`cards.js`) and in `largeOf` (hover / held preview), so every place that shows a card is covered. The project strips have no photo and stay as they are.
- Changing the dropdown clears `S.lastBoard` and renders again (`nosnake` event in `main.js`): no reload needed.
- `scripts/build_nosnake_images.py` makes the images from the existing card images: the photo area (down to the title bar: animals 592 / projects 527 / sponsor 563 px at 745 x 1040, 276 / 244 / 263 at 360 x 503) is replaced and the icons, tabs and badges lying on the photo are pasted back by shapes (`KEEP`; the grey stat panel of animals is 293 px wide with a water icon, else 231). New snake card: add it to `SNAKE_CARDS` / `KEEP` there and to the regex in `nosnake.js`.

## 51. Action card colours and clean-up of old sidebar / colour leftovers
Scope: `web/css/parkposter.css`, `web/css/replay.css`, `web/css/table.css`, `web/js/sidebar.js`, `web/js/layout.js`.
- The unupgraded / upgraded action cards are `--act1: #229DD7` and `--act2: #A72070` (were `#009fe2` / `#d02a52`): the action card icons (`.ac`, `.ac.lvl2`) in the player info box and the action buttons (`.abtn`, `.abtn.lvl2`) in the move bar and action bar. Checked in the browser: the info box borders compute to rgb(34, 157, 215) / rgb(167, 32, 112).
- Leftovers removed: the old `replay.css` colours of the same cards (`#009fe2`, `#a91b71`; now the new two) and its dead `.abtn.lvl2 { #7a3fb0 }` rule (always overridden by the later one); the unused tokens `--blue` and `--red` in `parkposter.css`; the redundant media query `(max-width: 899px) and (max-width: 1100px)` in `replay.css` (= `(max-width: 899px)`).
- Sidebar remnants: `fitSidebar()` still cleared an inline `zoom` of the info boxes from the time the zoom was computed in JS (now pure CSS, `--sbz`); that line is gone, and the comments of `sidebar.js`, `layout.js` and `table.css` that still described "fitting the info panel" / "zoomed by fitSidebar()" now say what the code does (it only measures the pane's scrollbar width, `--sbgutter`). Sidebar widths re-measured at window heights 700, 900 and 1080: switch, control panel and info boxes are 300 px each.

## 52. Player info box: X-token number on the X, income on the money tile
Scope: `web/js/side-panel.js`, `web/css/parkposter.css`.
- X tokens (`.rt.ov.xo`, replaces `.rt.xt`): the icon is 46 px and the number lies on it, 25 px Bowlby One, white with a 5 px black outline (`-webkit-text-stroke` + `paint-order: stroke fill`), like the reputation number.
- The income at the next break ("+16") moved from the appeal tile to the money tile (it is money): a mint pill (`--mint`, ink text and border, Barlow Condensed 17 px, was a 14 px gold pill) at the lower right of the money tile (`.rt.ov small`). Its tooltip is unchanged ("Income at the next break (from the appeal track ...)"). The appeal tile has no pill any more.

## 53. Floating tray: the discs no longer overlap the cards
Scope: `web/css/parkposter.css` (`.traybtns`, `.traycount`).
- The two discs (hand, endgame cards) sit 16 px higher (`top: -46px`, was -30px): their bottom edge is now above the top edge of the cards (measured at 1920 px: disc bottom 826, card top 837) so nothing of the discs lies on a card, folded or not (the head strip of the tray is 20 px, the cards start 25 px below the tray's top edge).
- The count chips moved from the lower right to the upper right of the disc (`top: -6px; right: -6px`).

## 54. Dragging cards in the hand (audit of the fan drag)

An outside audit (`ark-nova-fan-drag-audit.md`) listed six findings; checked against the code and a before/after run in the browser (6 cards, a 480 px drag to the right and back, grab point measured as pointer minus card centre):

- **Agreed, fixed (1, 2, 3, 4, 6 in part).** Before: the grabbed point drifted by up to 265 px, because `refan()` gave the held card a new `--i` (a new angle) every time it crossed a slot. After: it stays within 0.5 px. `web/js/cards.js` `dragRow`:
  - the held card turns with its slot again (a frozen angle looked wrong), but `dragRow` shifts it so the grabbed point stays under the pointer: the point is kept in the card's own frame (`u`, measured from the fan pivot 1.8 card heights below the middle), and each time the angle changes `--dx/--dy` get `rot(angle0, u) - rot(angle, u)` added (checked: the point in the card's frame stays within 0.5 px while the card turns);
  - no more clamping of the pointer used for the card position (the hard limits made the card stop while the pointer went on); the card follows the real pointer, only the slot decision is limited (no reordering far above / below the hand);
  - the shift of the whole row (the raised fan is still rising at pick-up) is taken out with one `row.getBoundingClientRect()`; a running entrance animation (`dockIntro`) is cancelled when the drag starts;
  - pointer moves are only stored; once per animation frame all neighbours are measured, one target slot is computed and the card is moved once (before: a loop that moved the node and re-measured). A swap needs the pointer 6 px past the neighbour's middle (hysteresis, no flicker on a boundary); the last position counts on release;
  - one pointer is tracked (`pointerId`); release commits, `pointercancel` / window blur / a live update that replaced the cards **cancel**: the original order is restored and no `cardorder` is sent.
- **Not done.** (5) The tooltip observer and the two `drop-shadow` filters of the fan row: not measured, no problem seen, so left as they are. (6) A settling animation on release: not added, the card now lands without a jump (the held card already has its slot's angle).
- **Enlarged view while dragging.** Grabbing a card of the hand (pointer down) now holds its enlarged view like a click does (`holdPreview` in `cards.js`), and `showPreview` does nothing while `body.card-dragging` is set, so neither the grabbed card nor the cards it passes get enlarged. After the drop the usual rule applies again (leave the card and come back).

## 55. Settings order, empty project places
Scope: `web/js/settings.js`, `web/css/parkposter.css`.
- Settings: "Cards in hand" now comes above "Hand display"; the value text ("1.25x", `.setval` / `.settop`, removed) is gone: the label and the slider sit side by side (`.setslide` is a two-column grid, the size labels under the slider in column 2).
- An empty place of the project area (`.projslot.projempty` in `.shared`) has a thin ink outline (`inset 0 0 0 2px rgba(23, 38, 43, .35)`), so the area no longer looks like a blank gap.
- Settings, later: the size of "Cards in hand" is written on the slider's knob (a wide rust pill, `.settrack` + `.setbubble`, 20 px number like "1.25x"); the size labels under the slider (`.setticks`) are gone.

## 56. Favicon
Scope: `scripts/build_favicon.py` (new), `web/brand/`, the `<head>` of every page in `web/`.
- The favicon is now the emu silhouette alone (teal `#0E6F78` body, golden `#F7B529` crown, cream outline `#F8EDCB`, 28/512 stroke), because the logo (emu on a hill in a disc) does not read at 16 px. `scripts/build_favicon.py` traces `emu_silhouette.png` with the code of `build_logo.py` and writes `favicon.svg`, `favicon-32.png`, `favicon-48.png`, `apple-touch-icon.png` (180 px, on a cream square) and `favicon.ico` (16 / 32 / 48 px). `build_logo.py` no longer writes `favicon.ico`.
- Every page links `favicon.ico`, `favicon.svg`, `favicon-32.png` and `apple-touch-icon.png` (was `logo.svg` and `logo-180.png`). `logo.svg` stays the logo of the move bar.

## 58. Turn counter, log font, check marks
Scope: `web/js/side-panel.js` (`turnNumber`), `web/js/log-labels.js` (`engineBadge`), `web/css/parkposter.css`.
- The Turn number of the Round | Turn pill counts the turns of the player who is acting (per player: both players' first turns are turn 1). The action card draft and the starting hand are no turns: 0 until the first player chooses an action card. It goes up when the first player of a pair chooses an action card (the other player's turn keeps the same number), and stays while a turn goes on.
- How: `state.turn` counts the finished turns of both players (`replay/builder.py` leaves out a second action of the same turn, e.g. Determination; the engine does the same in `game.py`); the players alternate, so the first player is `active_player ^ (turn & 1)` and a seat has finished `floor((turn + (seat is first)) / 2)` turns. A turn is on (`current_action` set) -> finished turns of the acting player + 1; between two turns -> the finished turns of the player who has just ended; in a replay, a frame between two actions of one turn (no card chosen for a moment) looks back through the steps of the same `turn` for a `current_action`. Checked on table 833146203 by pressing "next" through the whole game: 0 before the first card, never goes down, never jumps by more than 1, ends at 32 (64 finished turns).
- The log uses the font of the move bar (Barlow 700, 18 px) instead of Barlow Condensed 600 / 17 px.
- The check mark ("the engine agrees with the log") is a drawn SVG (`engineBadge`, class `engine-badge engine`): stroke 3.6 of 24, 22 px in the log (was a thin 14 px glyph), 30 px in the move bar; the badge is `flex: none` so a long log line cannot squeeze it.

## 59. Draft frames of the opponent, log weight
Scope: `web/js/playback.js` (`draftSeen`), `web/css/parkposter.css`.
- Bug found on table 927726814, point of view BDWSSBB: the last frame of the draft (the opponent's keep) was not skipped, although the lightbox looked exactly like the one before. Cause: the opponent's hidden keep ends the draft, so `draft.stage` changes from `keep` to `done`, which made the two views differ for `draftSeen`. `draftSeen` now treats `done` like `keep` (the view of a keep that changes what the viewer sees, i.e. his own, still differs through `kept`). Checked from both points of view, forward and back.
- The log uses weight 600 (was 700 since section 58); the selected line stays 700.

## 60. Player cubes and cylinders from the fan site
Scope: `scripts/build_cubes.py`, `web/cubes/`, `web/cylinders/`, `web/js/icons.js` (`pieceUrl`, `pieceImage`), `projects.js`, `association.js`, `board.js`, `shared.js`.
- The isometric SVG cubes are replaced by the pictures `cubes.png` / `cylinders.png` of Next-Ark-Nova-Cards (cut per BGA player colour into `web/cubes/<hex>.webp`, `web/cylinders/<hex>.webp`, same colour order as `web/workers/`). A seat is matched by its raw BGA colour (`seatRawColor`, so white stays white).
- Cubes: project slots (supporters and the 2-player blocked slots), Mark cube, donation cells, association bonus-slot cubes, map 9 continent markers. Cylinders: the reputation and conservation tracks (`blockedCube(..., kind)`).
- Blocked cubes use a BGA colour nobody plays (`BLOCKED_COLORS` in `association.js`).

## 61. Folded steps are one frame
Scope: `web/js/frames.js` (`textParts`).
- `replay/view.py` joins a step that changes nothing visible to the next one with " · " in the label (the log keeps every text). `textParts` split every label on " · " into one text frame per group of lines (meant for the merged steps of the setup), so each folded step became several forward presses with the same board. Now only a step of the setup phase is split; elsewhere the whole joined text is one frame.

## 62. Players' boards layout
Scope: `web/js/settings.js`, `main.js` (`zooBoards`), `state.js` (`zooLayout`, `zooTab`), `parkposter.css`.
- Settings > "Players' boards": side by side (default, as before), tabbed (one board under an arrow bar with the player name; the arrows go round the seats in the order of the tracker) or top / bottom (one column, tracker order, `seatOrder()`). Replay only (fork, sandbox, live play and the mini games stay side by side). Kept in `localStorage.settings.zoos`; the `zoolayout` event redraws.

## 63. Daily starting hand: picks, fixed point of view
Scope: `web/css/minigame.css`, `web/js/minigames/daily_hand.js`, `web/js/pov.js`.
- The pick styles were written for the fan (`.dockpanel`) and never matched the floating tray. Picked cards now carry the theme's `.marked` (green tint, check tag); after the answer a blue ring is your pick and a green ring what the original player kept (selectors on `.dock .cards`, any hand display).
- A mini game never asks whom to spectate (`needsChoice` is off) and starts with the puzzle's seat as the left map / upper box (`S.orient` from `MINIGAME_POV`).

## 64. Account widget and puzzle panel in the Park Poster top row
Scope: `web/js/account.js`, `web/css/parkposter.css`, `web/minigames/*.html`.
- On a viewer page (`body.viewer .movebar`, the mini games) `account.js` puts `#acctbar` into the move bar as a 60 px pill after the Round / Break pills (name, rating, Log out; or the Log in / Sign up button) instead of a fixed box over them; the log in dialog is on paper. Other pages keep the fixed box.
- The puzzle panel (`#puzzle`) now sits under the move bar in `main`, not above it: the sticky move bar and the top band covered its first 80 px.

## 65. Who's ahead shows both hands
Scope: `web/js/zoo.js`, `web/js/dock.js`.
- With no point of view in a mini game (`MINIGAME && S.pov === null`) the dock is empty (it shows one hand at a time, and the eyes are gone) and each zoo carries its player's Hand (and endgame / stored cards) in a row under the played cards.

## 66. Tabbed arrows, played cards beside the board
Scope: `web/js/main.js` (`zooBoards`), `web/js/zoo.js`, `parkposter.css`.
- The tab arrows worked once: the buttons have the same markup every time, so `redraw` put the old ones back, and their handlers still held the seat of the first drawing. They now read the current seat when clicked (and go round, so the same direction cycles).
- Tabbed and top / bottom layouts: the played animals and sponsors are two columns at the right of the board (`.zoopiles`), overlapped so that the last card is whole and the others show their top 18 % (`--pw` 132 px); the preview opens after the usual second. Side by side keeps the rows under the board.

## 67. The other player's initial discard is hidden
Scope: `src/ark_nova/replay/view.py`, `web/js/pov.js`.
- In a point of view the log line of the other player's initial discard (the first `pDiscardCards` move of the game) reads "X discard 4 cards"; the steps from that move on carry `state.initial_discard` (the keys each seat discarded) and `povState` shows the other seat's cards as `?` in the discard pile. Later discards stay public.

## 68. No "confirm or restart your turn" frame in the replay
Scope: `web/js/frames.js`. The gate frame (greyed "must confirm or restart your turn") exists only in a live game (`PLAY`); the replay steps straight on to the next frame / step.

## 69. Waves and animal gains are one step
Scope: `src/ark_nova/replay/view.py` (`_combine_runs`).
- A Wave (the "Removing n cards ... Wave icons reveal" line, a Mark that keeps a card, the refill of the display) is one step, and so is a run of gains that animals give without asking (appeal / reputation / conservation whose reason is an animal card, "Iconic animal" or "Petting Zoo Animal action"). The text of the run goes in front of the last step (state and prompt of the last step), in the order of the log; later `_fold_unchanged` still joins steps that change nothing visible.

## 70. Pass step, university prompt, duplicate decisions, tabbed header, zoo row sizes
Scope: `view.py` (`_combine_runs`), `options.py`, `action-bar.js`, `frames.js`, `main.js`, `zoo.js`, `parkposter.css`.
- An action card put back for an X token ("X gains 1 xtoken" with no reason, then "places action card ... (finishing action)") is one step.
- The replay bar of a pending `take_tile` effect (the Fac / Partner-Zoo bonus; the effect now carries `tile`) reads "must choose a university / partner zoo to gain" without a button.
- A decision frame is skipped when the step before has the same decision and the same options, also across moves (the engine state still holds the effect that the log line resolves, e.g. the tutor draw).
- Tabbed layout: the arrows that go to the other board were first on either side of the name in the zoo tab; see "Tabbed layout: board switch" at the end of the file for where they sit now (`zooStep` in `main.js`), the bar above the board is gone.
- Tabbed / top-bottom: the bonus panel and the partner zoo strip are 16 % / 16.7 % of the row without the card columns (`.zooRow.withpiles`, `--pilesw`), the proportions they have in the side-by-side layout, so the map grows with them.

## 71. Map 11 third worker upgrade; no decision frame after choosing an action card
Scope: `web/js/association.js` (`bonusPanel`), `web/js/frames.js`.
- Map 11 (Caves): the bonus panel shows the action card upgrade under the middle one of the three locked workers.
- Replay: a step "X chooses action card ..." has no decision frame ("must play a sponsor or break for money", "must choose a task" ...); the step that follows says what was done. The "must choose an action card" frames after the end of a turn stay.

## 72. Joined labels were doubled in a point of view
Scope: `src/ark_nova/replay/view.py` (`_join_labels`). The per-player texts of a joined step were built after the step's own label had been replaced by the joined text, so the last line was written twice (X gains 1 xtoken, X gains 1 xtoken, X places ...) in a point of view; the group's own texts are read first now. Applies to every joined step (passes, Waves, animal gains, unchanged steps).

## 73. Tokens on the action cards
Scope: `web/js/side-panel.js`, `parkposter.css`. The Venom, Constriction and Multiplier tokens on a player's action cards (`action_cards[].tokens`, already in the state) are drawn as small round icons on the lower right corner of the card in the player box (sheet icons r2c12, r2c9, r6c8), with a tooltip.

## 74. Worker silhouette behind the locked workers
Scope: `scripts/build_worker_slot.py`, `web/assets/worker_slot.webp`, `web/js/association.js`. The silhouette slot of the association board (recoloured to a light pink, a lighter shade of the zone, centred in it vertically; rounded square, 186 px) replaces the pink rectangles behind the three locked workers of the bonus panel; the meeple lies over it, an empty (unlocked) slot shows the silhouette.

## 75. Cubes in the special enclosures
Scope: `web/js/board.js` (`drawBuilding`, `SPECIAL_ENCLOSURE`). An animal in a petting zoo, reptile house, bird aviary, small / large aquarium (or underwater tunnel) is a cube of the player's colour (`web/cubes`, the same as on the projects and the donations) on a hex of the enclosure, one per animal, tooltip = the animal; a fourth animal on three hexes goes on the first hex again, offset a little.

## 76. Unstore, action runs, long scores and names
Scope: `view.py` (`_without_unstore`, `_combine_action`), `side-panel.js`, `parkposter.css`.
- Map 11: the free action "unstore" is not listed among the options of a replay step (`_without_unstore`), so no bar offers it.
- A sponsor bought / an animal played / a building built and what comes with it (the price of a sponsor from the reputation range, gains with a reason, a building the card adds, a placement bonus) is one step; the "chooses action card" step before and the "places action card" step after stay (`_combine_action`).
- Player box: the adaptive font sizes for long scores (`.burst.digits3/4`) and long names were removed again (not the wanted solution); the score and the name are back to their fixed sizes, a better fit is still to be found.

## 77. Played cards behind the board in the side-by-side layout
Scope: `web/js/zoo.js`, `parkposter.css`. Side by side (replay): the played animals and sponsors are two piles (`.zoopiles.behind`) at the top right corner of the board, behind it: each card shows its top 18 % (a 23 px strip of a card 92 px wide), the board, the bonus panel and the partner zoo strip (z-index 1) cover the rest, also of the last card. The zoo gets room above it for the taller pile of the two players (`marginTop`). The tabbed and top / bottom layouts keep the columns beside the board.

## 78. Piles inside the zoo paper, column names, the covered part cut off, no Released row
Scope: `web/js/zoo.js`, `parkposter.css`.
- The Released row under the zoo is gone (the end-of-game statistic stays).
- Side by side: the zoo box gets padding at the top (`paddingTop` = 34 px + 23 px per card of the longer pile) so the paper reaches up round the piles; the piles show the column names Animals / Sponsors; their `.cards` clip the covered part (`overflow: hidden`), so nothing of it shows between the panels.

## 79. Bigger piles, a paper bump instead of a band
Scope: `web/js/zoo.js`, `parkposter.css`. Side by side: the cards of the piles are 120 px wide (strip 30 px); the zoo box has no extra padding any more: a bump of paper (`.pilebump`, ink border without a bottom edge, rounded top) rises out of the top edge round the two piles and goes back down at both sides; the zoos get room above for the taller pile.

## 80. One outline for a zoo with a bump
Scope: `web/js/zoo.js` (`outline`), `parkposter.css`. The paper bump was a separate box, so its border did not join the zoo's. A zoo with piles behind its board (`.hasbump`) has no background, border or shadow of its own any more: an svg behind the content (`.zoooutline`, redrawn by a ResizeObserver) draws one path for the paper, the ink border (clipped stroke), the hard shadow, with rounded inner corners where the bump joins the top edge.

## 81. Piles of five or more are two columns
Scope: `web/js/zoo.js`, `parkposter.css`. Side by side: an animals or sponsors pile with 5 cards or more is split into two columns (the first one card longer if odd; `SPLIT`), under one name; the bump (`outline(box, tall, columns)`) is as wide as all the columns (120 px each, 8 px between) and as tall as the longest column of either player.

## 82. Constricted action cards are replayed
Scope: `src/ark_nova/replay/actions.py` (`turn_actions`), `tests/test_problem_fixes.py`. A card chosen under Constriction tokens (-2 strength each) took the wrong number of X tokens as paid strength (-2 gave +1 instead of 0), so the differential harness skipped the turn ("strength above the slot that the engine does not explain", 814290712 step 287) and the viewer showed the log state with a flag. The tokens are counted as 2 each now: -2 = one token, -1 = one token and 1 paid, -4 = two tokens.

- Fix: the right inner corner of the bump ended 10 px from the zoo's right edge, inside the zoo's own rounded corner (which starts 20 px from it), so the path doubled back and the corner looked jagged. The bump now ends 44 px from the right edge (`x1 = W - R - F - 8`), the piles with it (`right: 44px`).

## 83. Cubes on sponsor cards
Scope: `web/js/zoo.js` (`withCubes`), `parkposter.css`. Okapi Stable (3), Breeding Program (2) and Breeding Cooperation (2) show their cubes in a small pill at the top right of the card (the top strip that stays visible in a pile); a cube that was used is an empty dashed ring, so the removal is visible. Waza Special Assignment has a red X over the bonus of the kind not chosen (`flags.waza`: left 2 appeal per small animal, right 4 per large one); the cubes of the other cards are at the top middle of the card. Colour of the owner (`web/cubes`). Tables to look at: 617270432 (Okapi Stable played at step 28, cubes used at 32 and 63, Breeding Cooperation at 353), 613566554 (Waza: small animals chosen at step 316).

## 84. What a sponsor has given (the replay only)
Scope: `src/ark_nova/replay/view.py` (`_tracked_sponsors`, `_sponsor_gains`, `state.sponsor_stats`, `tracked_sponsors`), `web/js/cards.js` (`showStats`), `parkposter.css`. The 51 sponsors with a passive effect are followed: every `getBonuses` event that the log names after the card (`card_name` / `source`) is added to `state.sponsor_stats[key][resource]` (appeal, money, reputation, conservation, xtoken; cumulative, per step, so jumping around is right). Hovering such a sponsor that is in play shows its enlarged card with a paper panel at the right ("Given by this card", the resource icons and the totals; the card moves left). Gains of the card's own play (its printed effect) are counted too: the log does not tell them from the triggers. Cards drawn / worker / upgrade effects are not attributed in the log and are not tracked.

## 85. Own statistics of seven sponsors
Scope: `view.py` (`OWN_STATS`, `_sponsor_gains`), `differential.py` (`observe_sponsors`, `RESOLVED_STATS`, the trace tuple has a fifth element), `engine_replay.py` (`MoveEngine.obs`), `cards.js` (`STAT_TEXT`). The instant gain of Expert On Africa / Asia / Australia, Expert In Small / Large Animals, Conference On Australia and Waza Small Animal Program is no longer shown. Instead: Africa counts the Clevers that the player used (`slot1` effect of S214 resolved, not skipped), Asia the pavilions (`build`), Australia the pouches, Conference On Australia the enlargements, Waza Small Animal Program the small animals snapped and the 3rd small animals played; the experts in small / large animals count the money saved (3 / 4 for every small / large animal the owner plays after the expert, from the log). The engine ones are read off the pending effects of every engine action of the differential replay (a turn that the engine did not replay is not counted).

## 86. More sponsor statistics
Scope: `view.py` (`OWN_STATS`, `NO_STATS`, `EXTRA_TRACKED`, `ONLY`), `differential.py` (`RESOLVED_STATS`, `APPEARED_STATS`, `observe_sponsors`), `cards.js` (`STAT_TEXT`). Conference On Australia counts the enlargements and the appeal it gave; Breeding Cooperation / Program, Quarantine Lab and Expansion Area are not followed; Marine Research Expedition: expeditions and Scuba Dive 3s; Technology Institute: X tokens; Expert On The Americas: kiosks; Expert On Europe: size-1 enclosures; Migration Recording: conservation only; Barred Owl Hut: bird icons played after it (its reveal effects that appear); Sea Turtle Tank: cards sunbathed; Spotted Hyena Compound: hunts triggered and cards seen (the hunter value of every hunt); Publications: donations. Effects of the engine are counted when they leave the pending effects unskipped, or (Owl Hut, Hyena, Waza third animal) when they appear.

## 87. Statistics of the action card variants (Marine Worlds, the replay only)
Scope: `src/ark_nova/replay/variant_stats.py` (new, `observe_variants`), `differential.py` (called from `observe_sponsors`, wrapped in try/except), `view.py` (`state.variant_stats[seat][action]`, the Sponsors2 money from the log), `web/js/cards.js` (`ACTION_STATS`, `variantStatsBox`, `bindPreview(..., extra)`), `side-panel.js`, `tests/test_variant_stats.py`. Hovering an action card of the player box (variants 1-4) shows its statistics next to the enlarged card (the panel of the sponsors): Animals 1 conditions ignored (a condition of the single animal was really missing and the Ignore credit was used), 2 hunts and cards hunted, 3 money saved (side I) and appeal paid (side II), 4 marks placed and the reputation for a marked card from the display; Association 2 workers hired (side I) and workers used to lower the strength (side II), 3 X tokens (side I) and money saved on donations (side II), 4 determination (side I) and cards instead of a donation (side II; the harness infers `take_instead` from the draw at the end of an upgraded Association action); Build 1 / 2 additional pavilions / kiosks at 3 and at 2, 3 the extra strength used, 4 terrain built for 2 / for a gain of 2; Cards 2 digging from hand / display, 3 snaps, 4 Clevers for 2 / for free; Sponsors 1 the four trades, 2 the money of its ability, 3 discards for 4 money / for 2 strength, 4 sponsors discarded to snap a sponsor / cards discarded to play a sponsor. Animals 1 / Association 1 / Cards 1 have none. Counted from the engine, so only for turns that the engine replays.

## 88. Who's ahead: the final position after the answer
Scope: `web/js/minigames/whos_ahead.js`, `web/js/frames.js`. After the result is shown, a button switches the boards between the puzzle position and the last step of the real game (`/api/tables/<id>/replay`, fetched once; `S.replay` is swapped, the move list and timeline rebuilt, `go()` to the last / first step). `framesOf` drops its cache when another replay is on show.

## 89. A table without a log: the extension instead of an upload
Scope: `web/submit.html`, `web/index.html`. The page after "indexed but not logged" (`/submit.html?table=<id>`) no longer asks for the log file: it links the Chrome Web Store and Firefox Add-ons pages of the extension and the table's BGA replay (`https://boardgamearena.com/gamereview?table=<id>`), where the extension adds the button that opens the replay here. The upload form and the verify call of that page are gone (`web/js/load.js` still reads a log that is already in the browser).

## 90. Forking a replay opened with the extension
Scope: `src/ark_nova/api/main.py` (`fork_table`, `_fork_entry`), `web/js/load.js`, `main.js`, `fork.js`, `web/fork.html`, `tests/test_fork.py`. The log that the extension brings lives only in the browser (IndexedDB `LogStore`), so the fork request, which the server answers from the collected log, found nothing. Now the replay's Fork button keeps `source=upload` in the fork URL, the fork page reads the log from the browser and sends it with `{step, seed, log}`; for a table that is indexed but not logged the server verifies it (once per log, kept under `(table, sha1)`) and builds the fork from it. A table that has a collected log ignores a log that is sent. The "copy link" of such a fork carries `source=upload` too (it opens in this browser only).

## 91. Elo of the players at this table
Scope: `src/ark_nova/storage/index.py` (`TableRecord.elos`, column `elo` of `all_games_stat` in the index query), `replay/view.py` (`players[].elo`), `side-panel.js` (`.ppelo`), `zoo.js` (`.elo` in the tab), `parkposter.css`. The Elo that each player had at this table is a small pill after the name in the player box and in the zoo tab; nothing shows when the index has no value (the dev server's local index has none).

## 92. Features switched off on the live site
Scope: `src/ark_nova/config.py` (`disabled_features`, env `DISABLED_FEATURES`), `src/ark_nova/api/main.py` (the `coming_soon` middleware), `scripts/deploy_pages.py` (`coming_soon`, applied when the branch is `main`), `pages/coming-soon.html`, `tests/test_features.py`. Live site: live games, accounts (with ratings, profiles and leaderboards), mini games, sandbox are "coming soon": their API routes answer 404 `coming_soon` (Cloud Run env `DISABLED_FEATURES=live,accounts,minigames,sandbox`); their standalone pages and the start page cards are replaced in the uploaded copy only. The replay, the fork, the lookup, the submit / extension pages and the internal routes (daily rollover) are unchanged. Develop keeps everything on.

## Player box: selected action card and total income

- The selected action card no longer gets the gold ring (`.ppactions .ac.chosen`); only the lift and the ink shadow remain.
- The green chip on the money tile now shows the total income of the next break (`income_total` from `replay/view.py`: appeal track + kiosks + map ability + sponsors + activated map money bonuses; `income_parts` feeds the tooltip). Chip font 17 -> 18 px, padding 0 7px, radius 12px.

## Played cards: no Released row (again)

- `zoo.js` had the Released row under the played cards back (section 78 had removed it; it came back with a merge). Removed again; the "Animals released" end-of-game statistic stays.

## Played cards: double size, no dashed line

- Played cards under the zoo map 92 -> 184 px wide (radius 14, gap 12); the dashed rule above Animals / Sponsors is gone.

## Played cards: two stacks per kind (like BGA)

- `zoo.js` `stacks()`: animals and sponsors are separate blocks, each with the icon of its action card (`ACTION_ICON`) + the title; the cards go to two columns in turn (1st, 3rd... left; 2nd, 4th... right, so an odd count has the extra card on the left). Each column is a stack: a card covers 2/3 of the one before (`margin-top: calc(var(--cw) * -0.9315)`). Cards 160 px wide, each covers 80% of the one before (-1.1178 x width) (`--cw` on `.played`, one place to change it); animation zones are `<seat>:animals:c0/c1`.

## Played cards: a two-tone ground, recessed trays, paper seams, count chip

- The played cards lie on a ground that fills the rest of the zoo box under the map (`.played`: #F3E8C0, bleeds to the box edge, `.zoo` is a flex column so it grows to equal height).
- Animals and Sponsors each lie in a recessed tray (`.pkind`, set by `--tray`): soft red #E6C3B8 for animals, cool blue-grey #C8D8DD for sponsors, each with a hairline edge in its hue and an inner shadow. The heading (icon, title, count chip `.cnt`) sits at the top of the tray.
- Cards: a .75 px outline at 35 %; a card that covers another has a 3 px seam in the tray colour above it (`box-shadow: 0 -3px 0 var(--tray)`), so the stacked cards read as cut strips.

## Played cards: calmer colours, butter ground, soft seam under the map

- `parkposter.css`: ground `#F7EFD3` (was `#F3E8C0`); sand trays with only a hint of colour: animal tray `#EFDEC2` (a touch warm), sponsor tray `#E3E2D0` (a touch cool), both with a brown-sand edge `rgba(120, 95, 40, .38)` and a soft inset.
- The 4px ink line under the map (`.zooRow` box-shadow) is replaced by a soft cast shadow (`0 8px 10px -4px`), with `position: relative; z-index: 1` so it falls over the card area.

## Cubes on sponsor cards: directly on the card

- `.cardcubes` (Okapi Stable, Breeding Program, Breeding Cooperation) has no pill, strip, border or outline: the cubes (20px) lie directly on the card, centred in the blue icon panel of the card art (about 57.5% from the left, 7px from the top, so they sit fully inside the blue and not on its edge), with only a soft drop shadow; a used cube is a light dashed ring.

## Setting "Played cards": three ways to show the played cards

- New setting in the settings pop-up, "Played cards" (`S.playedMode`, saved as `played` in the `settings` entry: `below` | `tray` | `drawer`; default `below`, the layout under the map). The `playedmode` event redraws the boards and the dock (`main.js`); `zoo.js` `playedMode()` is the one place that decides what applies (a mini game always uses `below`; `tray` needs "Hand display" = floating container, with the fan the cards stay under the map).
- `below`: unchanged (two stacked columns per kind under the map).
- `tray` (`dock.js` `playedTrayBody`): a third round disc (animals icon, count of all played cards) next to the hand and endgame discs. It opens the hand tray's slot as a wide tray (`.handtray.played`, the width of the boards): one row, animals then sponsors, each card showing as much as the width allows (step at most 100px, at least 24px), the count chips of the two kinds on the head, a switch with both player names on the right (`S.dockSel = {seat, kind: 'played'}`; it works in a player's point of view too, the played cards are public). A hovered card rises. Fold / unfold by the tray's head strip like the hand. The dock selection falls back to the hand when the setting is changed away from the tray.
- `drawer` (`playedDrawer`): a chip "Cards" on the top edge of the board and a sheet with the cards over the map, narrow beside it or expanded over all of it; see the last section of this file ("Played cards: the drawer").
- Shared: `.gchip` (icon, name, count) in `parkposter.css`; `fitPlayed()` is called at the end of `render()`.
- The tray option needs the floating hand: with "Hand display" = fan the option is disabled in the select and drawn very pale (`rgba(23,38,43,.22)`, set inline in `syncPlayedOptions`), and switching the hand to the fan while "Tray in the hand dock" is active sets `S.playedMode` back to `below` (and fires `playedmode`); a stored `played: tray` with `handMode: fan` loads as `below` (`settings.js`). `zoo.js` `playedMode()` keeps the same rule as a safety net.

## Hand tray: slim dark glass with a fold button (supersedes the sand tray and the click hint of sections 20-32)

- Look (`parkposter.css`, `.trayframe`): dark slate glass `rgba(20, 25, 29, .74)` with `backdrop-filter: blur(5px)` and a pale glow `0 0 12px rgba(255,255,255,.22), 0 0 34px rgba(255,255,255,.12)`, radius `14px 14px 0 0`, no border. The sand `#E3CF9C` is gone.
- Slim: 8 px round the cards (`.cards` padding `0 8px 8px`, the head strip `.trayhead` is an 8 px spacer, no longer clickable). Width = cards + 16 px (was + 50 px, `--avail` = `--maxw - 16px`); unfolded height `16px + 1.3972 x card width`, folded `14px + 74px x --hs`. The played-cards tray (setting "Played cards" = tray): `68px` / `58px + 70px x --hs`, its player switch `.ptseg` is light on dark and keeps a 56 px right margin for the fold button, the empty text is paper-coloured.
- Fold button (`dock.js` `drawTray`, `.trayfold`): a round 38 px button straddling the top edge at the right (`right: 14px; top: -19px`), a chevron drawn with a CSS border (down when open, up when folded), `title` / `aria-label` "Hide the cards" / "Show the cards", `aria-expanded`. It calls `toggleDock` like the H key. Clicking the tray itself no longer folds it.
- Removed: the one-time hint "Click the tray to fold or unfold it" (`.trayhint`, `@keyframes tray-hint`, `HINT_KEY`, `hintSeen`, `startHint`, `hintPending` / `hintStart`, the `localStorage` entry `handTrayHint`, the hint branch of the `settingsclosed` listener).

## Played-cards tray: labels in side rails, as tall as the hand tray

- Before, the tray with the played cards had a 36 px label row (count chips + player switch) and was 52 px taller than the hand tray. Now it has the same height (`16px + 1.3972 x card width` open, `14px + 74px x --hs` folded): the rules `.handtray.played.unf / .fol .trayframe` and `.pthead` are removed; `.pt` has 8 px side padding, `.ptdeck` is exactly one card high and its cards sit at `top: 0`.
- Rails (`dock.js` `playedTrayBody`, `.prail`): each group (animals, sponsors) starts with a 26 px wide vertical rail (`RAIL_W` 32 px with its margin, `RAIL_GAP` 22 px between groups) showing the icon at the top, the name rotated bottom-to-top (`writing-mode: vertical-rl`, uppercase) and the count in a paper pill at the bottom; translucent white on the dark glass. The card step is computed with the rails' width taken out (at most 100 px, at least 24 px). Folded, only icon and count show (`.handtray.fol .prail span { display: none }`). The old chips (`gchip`) are no longer drawn in the tray; `playedChips` still provides their icon, name and count.
- Player switch (`.ptseg`): moved onto the top edge, left of the fold button (`position: absolute; top: -15px; right: 62px`, 30 px high, dark glass, light text, the active name on paper). It is a child of `.pt` inside `.trayframe`, which is the positioned box. The names follow `seatOrder()` (the same order as the boards), so the player of the left map and the upper box is always the left name.

## Played-cards button: icon of the two tiles

- The third round button of the hand tray (played cards) no longer shows the elephant alone. Its icon is `web/icons/played.webp` (118 px, like the sheet icons): the animal tile (`action-animals`, r3c7) and the sponsor tile (`action-sponsors`, r3c12) overlapped, the sponsor tile in front at the bottom right, with a soft shadow. Made by `scripts/build_played_icon.py` (Pillow, from the committed icon sheet cuts; the output is committed).
- `dock.js`: `KIND_ICON.played = 'played'` (an icon id of its own, not a sheet cell); the image of that disc has the class `tiles`. `parkposter.css`: `.traydisc img.tiles { filter: none }` (the line icons are brightened by `brightness(1.6)`, the light tiles are not).

## Hand tray buttons: slate blue

- The round buttons of the hand tray (`.traydisc`: hand, endgame cards, stored cards, played cards) that are not selected were grey `rgba(98, 98, 98, .92)` and nearly vanished on the dark glass. Now: slate blue `#8499A6` (hover `#9BB0BC`) with an ink ring `0 0 0 3px var(--ink)` and the drop shadow `0 2px 6px rgba(0, 0, 0, .5)`, the same ring as the selected button. The selected button (`.on`, sun orange) is unchanged.

## Played-cards tray: whose cards are these (supersedes the plain switch of the side-rails section)

- The tray glows in the colour of the selected player: `.handtray.played .trayframe { box-shadow: 0 0 0 3px var(--pc), 0 0 26px 2px var(--pc) }` (`--pc` = `seatColor(seat)`, set on `.handtray` by `drawTray`).
- The player switch (`.ptseg`, `dock.js` `playedTrayBody`): each name button gets `--pc` = its player's `seatColor` and a dot in that colour before the name (`::before`, 11 px, white ring). The selected name is bright and filled with the player's colour (`background: var(--pc)`, text `--pt` = ink or white by luminance, `onColour()` in `dock.js`, white dot); the other name is dimmed (`opacity: .55`, `.85` on hover). The switch's own outline is in the selected player's colour too (`border: 2px solid var(--pc)`).

### Hand tray with 0-2 cards: never narrower than its buttons

With one card the tray (card + 16 px) was narrower than the row of round buttons, and the round fold button landed on top of the third button. Now `.trayframe` has `min-width: calc(22px + --nb * 60px + (--nb - 1) * 14px + 14px + 38px + 14px)` (296 px with 3 buttons; `--nb` = number of round buttons, set on `.handtray` by `drawTray` in `dock.js`, 4 on map 11), so the fold button always keeps its place at the top right corner. The few cards stand in the middle of the glass (`.cards { justify-content: center }`, `.cards.multi` stays `start`), the empty message is centred. Trays with 3+ cards are unchanged.

### Sponsor S274: Victory Column (BGA name) or Mascot Statue, setting "Statue card"

On BGA the card is called Victory Column and shows a picture of the last Arena season's winner; the card data calls it Mascot Statue. New setting **Statue card** (settings dialog, last row; `S.s274` = `'victory'` (default) | `'mascot'`, saved in `localStorage.settings.s274`). `cards.js` `info(key)` returns for S274 a patched copy of the catalog entry (name `VICTORY COLUMN`, image `/cards/S274_VC.webp`, large `/cards_large/S274_VC.webp`) unless the setting is `mascot`, so every card face, preview, tooltip and card name follows it. `pov.js` `labelOf` rewrites "Victory Column" / "Mascot Statue" in the step labels (move bar, move list) to the chosen name, and `refreshLabels()` redraws the move list when the setting changes (the `nosnake` event, same refresh as the No-snake mode).

The card image `S274_VC` is made by `scripts/build_cards.py` (`VARIANTS`; `scripts/cardgen/harness/entry.tsx` renders the key `S274_VC` with the name VICTORY COLUMN). The photo is the picture of the incumbent Emu Cup winner: `data_manual/emu_cup_photos/04-skalding.png` (the source photos of all winners, `<edition>-<name>.png`, ASCII names; they are not served: only `web/emu_cup_winners/thumbs/` is). `scripts/build_victory_column_art.py` puts it on the card face `scripts/cardgen/site/art/S274_VC.jpg` (the photo area of the Mascot Statue face replaced, scaled to the card width, its missing upper part filled with its own dark top edge, lowered so the head clears the purple play-effect box; the strength tab and the purple box are redrawn on top from the original, `scripts/cardgen/site/mw.css` gives the data-id `S274_EmuCup` this face). For the next winner: replace `PHOTO` in the script, run it, then `python scripts/build_cards.py --only S274_VC`. The BGA card also has a play effect and a list of past winners: not built yet.

**Victory Column: champion caption and roll of honour.** The *large* card `S274_VC` (not the small one: `compact.css` hides `.emu-caption`) carries a caption on the bottom of the photo, "Emu Cup champion: <name> (Season N)", drawn by `entry.tsx` (`emuCup()`, rules in `mw.css`) from `web/emu_cup_winners/winners.json` (newest season first; `event`, `winners[]` with `season`, `name`, `photo`, `focus`, `thumb`). In the viewer, hovering the enlarged Victory Column (only with the setting Statue card = Victory Column, not in mini games) shows a roll of honour panel (`showRoll` in `cards.js`, `.previewroll` in `parkposter.css`): directly right of the card, top-aligned with it (left of the card when there is no room; `.preview.withroll` shifts the card left like `.withstats`). The newest season is a gold row with a portrait from `web/emu_cup_winners/thumbs/<NN>.webp` (112 px, made by `scripts/build_emu_cup_thumbs.py`, which sets the `thumb` flag); seasons without a photo show the initial letter. Rows that do not fit collapse into "+ N earlier seasons". To add a winner: add the entry to `winners.json`, put `<NN>-<name>.png` in the folder, run `python scripts/build_emu_cup_thumbs.py`, then for the new champion change `PHOTO` in `scripts/build_victory_column_art.py`, run it and `python scripts/build_cards.py --only S274_VC`. The two card webp files must be rebuilt after any change to `winners.json`. The roll of honour is positioned in unzoomed px: the page is CSS-zoomed (`S.scale`), `getBoundingClientRect` is in zoomed px while `left` / `top` / `maxHeight` of the fixed box are not, so `showRoll` divides the card's rect (and the stats panel's top, and `innerWidth`) by `S.scale` (at a zoom below 1 the panel used to land on the card). All portraits of the roll of honour are the same size (56 px with a 3 px ring, `.previewroll .ph`; the panel is 16rem wide, `.preview.withroll` is shifted by 17rem), and the words read "Chanpion" / "Chanpions" (an inside joke, on purpose: roll rows, panel title and the caption of the large card).

## Played cards: the mini strip and the Flip option are gone

- Removed "Mini strip under the map" and "Flip: Map | Cards": the `PLAYED_MODES` entries (`settings.js`), `playedStrip()`, `flipSwitch()`, the `.ms` measuring loop of `fitPlayed()` and the `strip` / `flip` branches of `renderZoo` (`zoo.js`), `S.flipSeats` (`state.js`) and the `.ms` / `.msdiv` / `.seg3` / `.zoo.flip` rules (`parkposter.css`). A stored `played: strip` or `played: flip` loads as `below` (the `PLAYED_MODES.some(...)` test in `settings.js`). NOT removed: `.flip` / `.ft` / `.fc` / `.ff` in `parkposter.css`, `flipScore` in `side-panel.js` and the `contains('flip')` check in `main.js`: those are the score plates, a different feature that shares the class name. Earlier sections that describe the strip or the flip mode are obsolete.

## Played cards: the map runs to the bottom edge when nothing lies under it

- `.zooRow` has `margin: -8px -8px 4px` and the board 8 px padding, so under the map there is always a 12 px strip of paper; with the played cards under the map (`below`) that strip is the soft edge into the card area, but in the modes without cards under the map (`tray`, `drawer`) it was a gap under a map cut off in a straight line. `renderZoo` adds `.mapends` to the board whenever the mode is not `below`; `.zoo.mapends .zooRow { margin-bottom: -8px; border-radius: 16px; box-shadow: none }` lets the map run to the bottom edge with rounded corners (also no soft edge shadow).

## Board tabs sit directly on the map

- The name tab (`.zoo h2`) and the Cards chip (`.drtab`) are 38 px high with 4 px bottom padding (text position unchanged), so their bottom edge lies on the inner edge of the board's 4 px ink border: they cover the border and touch the map / paper directly, whatever their colour (no dark band under a lighter chip).

## Played cards: the drawer

Setting "Played cards" = "Slide-out drawer" (`S.playedMode === 'drawer'`; a stored `'side'` from an earlier build loads as `'drawer'`). The labels, in this order: "Below the map" (value `'below'`), "Slide-out drawer" (`'drawer'`), "Tray in the hand dock" (`'tray'`). A mini game always uses `below`. Code: `playedDrawer` and `fitPlayed` in `zoo.js`, the block "played cards: the display modes" at the end of `parkposter.css`.
- **Tabbed layout: cards next to the map.** The setting "Played cards" has a fourth option, "Cards next to the map" (value `'beside'`), and it is the only one the tabbed layout ("Players' boards" = "Tabbed") offers: with it the other three options are disabled in the select (pale like the tray option, `syncPlayedOptions` in `settings.js`) and the select shows "Cards next to the map"; in the side-by-side and top / bottom layouts "Cards next to the map" is disabled and the first three work as before. `S.playedMode` is not overwritten: it keeps the choice for the other layouts, and `playedMode()` (zoo.js) returns `'beside'` whenever `tabbedLayout()` is true (the replay with `S.zooLayout === 'tabs'`; fork, sandbox, live play and mini games always lay the boards side by side) and falls back to `'below'` when a stored `'beside'` meets another layout. Switching the layout calls `syncPlayedOptions()`. The played cards are NOT part of the board: `zooBoards` (main.js) returns two boxes for the tabbed layout, `renderZoo(st, seat)` (the map row only; mode `'beside'` counts like every mode but `'below'`, so `.mapends`) and `renderCards(st, seat)` (zoo.js: `.zoo.cardsbox` > `.sheet` > `playedBlock`, animals and sponsors with two stacks each, the same sheet as the expanded drawer, so `fitPlayed()` sizes its cards; it carries the class `zoo` only because the played-cards styles are scoped to `.zoo`; `.zoo.cardsbox` has NO plate: no background, border, shadow or padding, and `overflow: visible`, so the Animals and Sponsors trays lie straight on the poster; the trays split the box (`flex: 1 1 0`, 12 px gap: the Animals tray starts at the left edge of the association element, the Sponsors tray ends at its right edge) and start at the top of the map row beside them (`.played` has 4 px top padding, the distance between the zoo box's outer edge and its row); they are NOT stretched: `.zoo.cardsbox` has `align-self: start`, its sheet is `position: relative` and each tray is as tall as its own cards (`align-items: flex-start`), so few cards give short trays; `fitPlayed()` takes the height of the preceding zoo box as the limit for the card size, so the tallest pile never gets taller than the map row; checked with `getBoundingClientRect` at 1920 x 1080 and 1366 x 768; `fitPlayed()` uses 72 px / 80 px instead of 100 px for this box, since there is no padding around the trays), and `#zoos` gets the class `zoos-beside`. The width is set by the surroundings, not by the height: `.zoos.zoos-tabs.zoos-beside` has the same two columns as `#shared`, `minmax(0, 1fr) var(--assocw)` and the same 16 px gap, so the zoo box stands exactly under the display element (conservation track and folders) and the cards box exactly under the association element (project areas and board); `fitDisplay()` (layout.js) sets `--assocw` on `#shared` and now also on `#zoos` (fallback 40 % in the CSS). The grid makes the cards box as tall as the zoo box. With the map as wide as the display element (about 875 px at the 1920 px layout) the zoo box is about 520 px high and the page scrolls a little in a window as high as 1080 px; nothing is fitted to the height of the window (an earlier version fitted the map to the end of the sidebar and made it tiny in browser windows). There is no drawer chip, size button or association bar in this mode (they belong to the drawer).

- **Chip and bar.** `renderZoo` calls `playedDrawer(box, p, seat, narrow)` right after the name tab. It adds `.drbar` (absolute, `right: 22px; top: -38px`, flex) holding the size button `.drexp` (only while the drawer is open) and the chip `.drtab`: 38 px high like the name tab, charcoal `#30373C`, Bowlby One 17 px, rounded top, reading "Cards", the number of ALL played cards (animals + sponsors) in a pill that carries the player colour (`--pc` set on the button, `color-mix(in srgb, var(--pc) 72%, #30373C)`) and an arrow that is always ▼ (turned 180 degrees while open: `.drtab.open i`), in both sizes. The hand floats over the lower edge of the page, so there is no bar under the map. Open / close: the chip, and Esc (not while a card pile or a `.modalback` dialog is open). `S.drawerSeats[seat]` says which boards are open; `.zoo.drawer-open` raises the board above its neighbour.
- **The sheet.** `.sheetclip` is a child of the map row (`renderZoo` appends `box._sheetclip` to the `.zooRow`; `.zoo.drawer-open .zooRow { position: relative }`), absolute with `inset: 0`, `overflow: hidden`, radius 16 px: exactly the map's place and height whatever the map or the window, nothing is measured. `.sheet` fills it: flat butter `#F7EFD3`, no frame, no lip, no title row; the played cards are the same `playedBlock` as under the map. `.zooRow > .sheetclip { width: auto; height: auto }` is needed because the rule for the parts of the row (`.zooRow > *`: width 100%, no radius) would win otherwise.
- **Expanded** (`S.drawerFull[seat]` true): the sheet covers the whole map, two stacks per kind, nothing shifts. `fitPlayed()` sets `--cw` of `.played` so that the tallest stack (half the cards of a kind per column, 0.2794 x width visible per covered card) and the four columns fit: 60-170 px wide. The free width is spread evenly (`.sheet .played { justify-content: space-evenly }`).
- **Narrow** (`.zoo.nrw`, the default; the class is `nrw`, not `side`, because `.side { margin-bottom: .8rem }` in replay.css gave the sheet a gap): the map (`.zooRow > :nth-child(2)`) slides left over the project bonus panel and the association strip (`:nth-child(3)`) tucks under the map; the sheet (`left: var(--sd-left)`, `right: 0`, radius only on the right) takes both freed areas (about 238 px at the 1920 px layout, with a shadow on its left edge where the map lies over it). `fitPlayed()` sets `--sd-b` (map shift), `--sd-s` (strip shift) and `--sd-left` on every `.zoo.drawer-open` box from the widths of the three parts of the row (`getBoundingClientRect` divided by the zoom; the parts can be SVG, which has no `offsetWidth`), and `--cw` of `.sheet.nrw .played` from the longest pile (48-120 px, one column per kind: `playedDrawer` joins the two stacks of each `.pkind`; the heading is 13 px without the action icon).
- **Size button.** `.drexp` (four corner arrows, "Expand over the map" / "Shrink beside the map") switches the size of THIS board only: `S.drawerFull` is an object seat -> boolean (missing = narrow), so each board's drawer is expanded or narrow on its own (one can be expanded while the other stays narrow, and a closed drawer keeps its size); it fires `drawerfull` (`settings.js` saves it as `drawerFull: { 0: bool, 1: bool }` in the `settings` entry and still reads the old single boolean as the size of both boards), so the next opening has the size of the last one. The switch wipes: `S.drawerAnim = { seat, t, kind: 'resize' }` puts `.rz` on the box of that seat only, narrow -> expanded: the sheet (already drawn at full width) is revealed by `clip-path` (`sd-wipe-out`, from the narrow width to the whole map) while the map and strip slide back (`sd-map-in`, 360 ms). Expanded -> narrow is the reverse and also a slide: the redraw has already replaced the expanded sheet by the narrow one, so the click handler clones the old `.sheetclip` first and `shrinkGhost(seat, ghost)` (zoo.js) appends the copy (`.sheetclip.ghost`, `aria-hidden`, its `.enter` removed) to the new `.zooRow`; `.zoo.nrw.drawer-open .sheetclip.ghost` (parkposter.css) overrides the narrow sheet's placement (`left: 0; right: 0; z-index: 20; pointer-events: none`) and runs `sd-wipe-in` (360 ms, the same curve): its `clip-path` goes from the whole map to the narrow width (`inset(0 0 0 var(--sd-left))`) while the map and strip slide aside (`sd-map-out`), and it fades out over the last third so that the real narrow sheet below takes over without a jump; it is removed on `animationend` (fallback timer 600 ms). Reduced motion: no ghost, no animation.
- **Animation.** `openDrawer(seat)` sets `S.drawerAnim = { seat, t }`; the box gets `.fresh` (narrow) or the sheet `.enter` (expanded) only when that is under 700 ms old, so a redraw of an open drawer (stepping through the game) does not replay it. `closeDrawer(seat, box)` puts `.closing` on the board first and draws the board without the sheet after `TRAY_IN_MS + 20` ms (300 ms + 20; the chip and Esc go through it: `box._closeDrawer`). `prefers-reduced-motion: reduce`: no animation, the drawer opens and closes at once (`reducedMotion()` and a media query).
  - **Narrow: a door, the sheet never moves.** The sheet lies at its final place all the time, behind the map and the strip (`.zoo.nrw.drawer-open .sheetclip { z-index: 0 }` against the map's 3 and the strip's 1). Opening: the map and the strip slide left (`sd-map-out`, 400 ms, `cubic-bezier(.3, .7, .2, 1)`; the strip travels farther than the map, so it tucks under it) and uncover the sheet, right edge first; the chip arrow turns in 400 ms (`.zoo.nrw .drtab.open i.enter`). Closing: the map and strip slide back over the sheet (`sd-map-in`, 300 ms, `ease-in`), the arrow turns back in 300 ms. There is no sheet animation in this size (`zoo.js` gives the sheet `.enter` only when it is not narrow; `.zoo:not(.nrw).closing .sheet`). Chosen from five variants (today's simultaneous drop, a drop behind the map, slide then drop, a cascade, the door) because it is one motion with nothing to time.
  - **Expanded: like a wooden tray.** The sheet comes down from above (`sheet-out`, 460 ms: `translateY(-100%)` fast and decelerating, an overshoot of 1.6 %, back past the end by -0.5 %, settle) and runs back up with a pull-back of 1.2 % (`sheet-in`, 300 ms); the arrow turns with it (`sheet-arrow-out` 460 ms / `sheet-arrow-in` 300 ms). The keyframes were called `tray-out` / `tray-in` before; `tray-in` is also the keyframe name of the hand tray's entrance (`.handtray.enter`, further up in `parkposter.css`), and the later definition overrode it, so the hand tray entrance was broken: the drawer's keyframes are named `sheet-*` now. Keep the two names apart.
- **The bar under the zoo.** While a drawer is open, `playedDrawer` also appends `assocBar(map, p, seat)` (`assocbar.js`) to the box: a `.assocbar` that hangs from the box like the stub of a ticket. The box and the bar are one shape: while a drawer is open `.zoo.drawer-open` has square bottom corners, no shadow of its own and square bottom corners of the map row and of the sheet (`.zooRow`, `.zooRow > .sheetclip`, `!important`); the bar is absolute (`left: -4px; right: -4px; top: calc(100% - 4px)`, so nothing in the layout moves; it lies over the free strip under the boards, 58 px high with its edge, plus the 6 px hard shadow) and exactly as wide as the box, so its two outer edges continue the box's edges: the box's side borders run on into the bar's. The seam is a 3 px dashed ink line (the bar's top border), the bar has the ink edge (4 px), a radius of 20 px at the bottom, the box's hard shadow and the fill `--stone` (`#D9D6CE`, a light warm grey, a token of `body.viewer`: a step darker than the paper, without being another cream). A semicircle is punched out of each side at the seam (a ticket stub), a real hole: the zoo box carries a `mask-image` of two circles (radius `--hole: 11px`, centred on the side edges, `--seam: 7px` above the bottom edge of the box) that cuts the box and map, so the poster behind shows through. The absolutely positioned bar repeats those two circles in its own coordinate system, centred `8px - var(--seam)` below its top; this explicitly cuts its grey fill out of the lower half of each hole instead of relying on an ancestor mask to affect overflowing content. Both mask tiles are 8000 px larger than their boxes (`mask-size: calc(100% + 8000px) ...; mask-position: -4000px -4000px; mask-clip: no-clip`) so that shadows and other overflow remain visible, and `mask-composite: intersect` joins the two circles; the old prefixed properties are set as well. The ink rim is drawn by `.zoo.drawer-open::before` (a transparent layer over the whole box, `z-index: 6`, `pointer-events: none`, above the map, which runs right up to the side edges; 20 px longer than the box at the bottom so that the lower half of the rims fits; two ring gradients from `--bite` = 11 px to 4 px more): in the box it is a half ring. (The gold ring that used to mark the active zoo, round box and bar, is gone: the mask, the rim and the bar do not depend on whose turn it is.) The bar keeps its state in view because both drawer sizes cover the bonus panel and the association strip. One row with two groups and a dashed divider (`.abperf`): on the left the map's bonus spaces (the 3 purple income squares, 40 px, a small gap, then the 4 yellow pentagons, 44 px; sorted by `index`; a map without `bonus_slots` has no left group), on the right the 4 partner zoo slots (32 px) and the 3 university slots (31 px). A bonus space is taken when its bit of `p.flags.bonus_used` is set (they can be uncovered in any order, so they light up one by one): full colour; a space that is still covered is `.off` (opacity .34, saturation .35). The picture of a bonus space is `slotGlyph(root, sl, y)` of `association.js`, the function the bonus panel draws each of its spaces with (extracted from `bonusPanel`, so a bonus looks the same in both), here in a small svg with `viewBox="69 60 80 80"`. The partner zoo and university slots come from `p.tokens` (`partner_1..4`, `university_1..3`, filled from the first): the token picture cropped to its drawn part, or for an empty slot the silhouette of the strip (`HANDSHAKE` / `UNIVERSITY` of `handshake.js`, black at 20 %). Every item has a tooltip ("Bonus space 4 (taken): 3 reputation", "Partner zoo 2: empty", "University 1: science and reputation"). The number styles `.slot-number`, `.slot-label` and `.money-border` of replay.css also apply inside `.assocbar`. Animation: a freshly opened drawer puts `foot-in` on the box (`fresh`, the same 700 ms rule as the sheet) and the bar (the shape of the ticket, the box's mask and its rim are there at once; the bar's own mask belongs to the bar, so its two cut-outs travel with it and sit up to 14 px off the box's bites while it is still faded out, and are exactly on them at rest) slides 14 px down from the box while it fades in (`assocbar-in`, 320 ms after a 120 ms delay, so it follows the sheet); `.closing` makes it go up and fade out (`assocbar-out`, 200 ms); a size switch or a redraw does not replay it; reduced motion has none. The bar exists only in the drawer mode (not under the map, not in the tray) and, like the drawer, per board. The hand can cover the left end of the left board's bar, so while a drawer is open the page gets more room to scroll (`parkposter.css`, end of the file, `body.viewer:has(.zoo.drawer-open)`): the bottom padding becomes `169px * --hk + 56px` with an unfolded tray and `124px * --hk + 56px` with the fan (the part that shows at rest), and the page can be scrolled until the bar's lower edge lies above the top of the hand; a folded tray is low enough for the normal room, and with no open drawer nothing changes.
- **Keeping it fitted.** `fitPlayed()` runs after every render (`main.js`); a `ResizeObserver` on the map rows runs it again when a row changes (a map picture that loads late, a window change). `fitPlayed()` observes each row once (`watched`: a new observation fires at once and would call `fitPlayed` again, so there is no `disconnect()` and no repeated `observe()`) and lets go of rows that have left the page.

- **Tabbed layout: board switch.** The two arrows (`.zootab-arrow`, `zooStep` in `main.js`) are no longer in the name tab, where the right one moved with the length of the name. `renderZoo` (zoo.js) builds `.zootab-switch`, a small ink tab of its own, 38 px high like the name tab, `position: absolute; right: 22px; top: -38px` in the zoo box, so it sits at the right edge of the box whatever the name; it holds the two buttons (40 x 26 px pills, 14 px arrow icon). The buttons are outline buttons: transparent, a cream rim (`rgba(248,237,203,.65)`, 2 px) and a cream arrow; on hover the fill, rim and gold are the fully saturated `--gold` and the arrow is ink; `:active` moves them 1 px, `:focus-visible` has the 3 px gold outline. The old rules of the arrows (cream round buttons with a shadow, the smaller ones in `.zoo h2`) are gone from `parkposter.css`. Checked at 1920 x 1080: the switch is at x 756-862, y 514-552 for both players.

- **Top / bottom layout = the tabbed layout, both players.** `S.zooLayout === 'stack'` (the replay only) now draws every player like the tabbed layout does: the zoo box in the display's column and the played cards in their own plate-free box (`renderCards`) in the association element's column, one row per player in the order of the tracker, and no board switch (the switch and the arrows only exist when `tabbedLayout()`). `zooBoards` (main.js) returns `[renderZoo, renderCards]` for each seat and `#zoos` has `zoos-stack zoos-beside`; the grid rule is now `.zoos.zoos-beside` (two columns, `minmax(0, 1fr) var(--assocw)`), and `.zoos.zoos-stack.zoos-beside` has `row-gap: 66px` so the second player's name tab (38 px above its box) has room and there is some air between the rows. `besideLayout()` (zoo.js, tabs or stack) replaces `tabbedLayout()` in `playedMode()` and in `syncPlayedOptions` (settings.js): both layouts offer only "Cards next to the map". The page is taller than the window (about 1830 px at 1920 x 1080 with this game) and scrolls. `fitPlayed()` sizes the cards of each box to the zoo box before it, as in the tabbed layout.

- **Settings: only the options of the layout are listed.** `syncPlayedOptions` (settings.js) now rebuilds the "Played cards" select (`psel.replaceChildren()`) whenever the layout or the hand display changes: the tabbed and the top / bottom layouts list only "Cards next to the map", the side-by-side layout lists "Below the map", "Slide-out drawer" and "Tray in the hand dock" (no "Cards next to the map"). Nothing is greyed out in the first case; in the second only the tray is greyed (pale, `disabled`) while the hand display is not the floating tray. Checked by switching the layout in the settings: side [below, drawer, tray], tabs [beside], stack [beside].

- **Settings panel: wider, aligned, speed slider.** `#settingsModal .modalbox` is 620 px wide (was 440 px), and the controls form one column of equal width at the right (`--setcol: 300px` on `#settingsModal`): the selects are all 300 px wide with their text centred (`text-align-last: center`), the two sliders take the same column (`.setslide` grid `minmax(0, 1fr) var(--setcol)`) and the timeline switch sits flush right; the labels stay left. The autoplay speed is a slider now, like the size of the cards in the hand: `knobSlider(values, current, label, onPick)` (settings.js) builds the track with the knob that carries the value, and both rows use it. `SPEEDS = [0.5, 1, 2, 3, 4]` (1x default; a stored 1 / 2 / 4 still loads); the knob reads `0.5x`, `1x` ... and calls `setSpeed(v)` + `save()`. The three speed buttons (`.setspeed`, parkposter.css) and the toggling of `.speed button` in `setSpeed` (playback.js) are gone. Autoplay interval is still `1000 / S.speed` ms.

- **Settings panel: three tabs.** Under the title a gold pill with three tabs (`.settabs` / `.settab`, like the Control | Log tabs of the sidebar; `role=tablist`, arrow keys move between them), one `.setpanel` per tab: **Control** (Autoplay speed, Timeline in the control panel), **Board** (Player boards, Played cards, Hand display), **Cards** (Hand card size, Statue card, No-snake mode). Renamed: "Players' boards" -> "Player boards", "Cards in hand" -> "Hand card size". `setupSettings` (settings.js) still builds the rows as before and `showTab(i)` shows one panel; the tab last used (module variable `settingsTab`, not stored) stays open while the page is open, Control at the start. The panels have `min-height: 232px`, so the box keeps its height (384 px) on every tab; the first row of a panel has no dashed line above it.

## Endgame live count

- **What it is.** A violet "+X" pill under the Appeal tile and under the Conservation points tile of the player info box (`.rt.ov small.eg`, parkposter.css: pill like the income pill of the money tile, but violet `#7B4FB5` and centred under the tile, so it is not taken for income). It shows what the endgame effects would give *right now*: sponsors' appeal under the appeal tile, sponsors' conservation points (and, where the cards are shown, the endgame cards) under the conservation tile. Zero values show no pill. Works in the replay, the fork, the sandbox and live play (all of them draw `state_view`).
- **Setting.** Settings > Control > "Endgame live count" (switch, default on; `S.endgameLive` in state.js, saved as `egLive` in the `settings` localStorage JSON; the `eglive` event makes main.js draw the boards again).
- **Data.** `replay/view.py` `state_view` adds per player `endgame_live` = `{appeal, conservation}` (sponsors; `null` when the rules cannot read the position) and `endgame_cards` = conservation points of the endgame cards that would be kept. Both come from `engine/endgame.py` `live_scoring(state)`, which scores like `final_scoring` (Arcade first, Mascot Statue / Victory Column last) on a copy, changes nothing and returns zeros once the final scoring has begun (phase SCORING / OVER: the points are in the score). Endgame cards: all of them once the discard is done, before it all but the lowest one (`kept_endgame_cards`: every player with more than one card discards exactly one).
- **Who sees the card points.** `side-panel.js` adds `endgame_cards` only for a seat whose hand is shown (`!hides(seat)`: the open eye in the replay / fork, the own seat in live play). `live/projection.py` sets `endgame_cards = None` for every other seat, so a live viewer never receives the opponent's card points.
- **Rule fixes found on the way (engine 0.2.5-dev, not released).** Cable Car (S246) scores at 6 rock icons, not 7; Polar Bear Exhibit (S251) gives 1 conservation point at 3 bears and 2 at 6 (`HIDDEN_ICON_TIERS` now holds tiers); Expert on Europe (S211) counts 5 occupied 1-size enclosures with `effective_size` (next to the gate on maps 2 / 2a an enclosure counts as 3). Run `scripts/check_endgame_cards.py` and `scripts/problem_list.py` on the full log set before releasing.
- Tests: `tests/test_live_scoring.py` (live count equals `final_scoring`, state unchanged, zero at the end, best-all-but-one cards), `tests/test_live.py` (the opponent's `endgame_cards` is masked).

- **Ticket bar under the zoo (drawer open): evenly spread.** `assocbar.js` groups the icons into clusters (`.abcl`: the purple income bonus spaces, the yellow ones, the partner zoos, the universities; no more `.abgap` spacers). The two sides of the perforation (`.abgroup`) each take half of the bar (`flex: 1 1 auto`) and spread their two clusters with `justify-content: space-evenly`, so the icons are centred in their half with equal air between the clusters; bar padding 0 10 px (was 0 16 px). Partner zoo icons 36 px high (was 32), university icons 34 px (was 31); the bonus spaces are 38 / 42 px (were 40 / 44) so that the larger icons still leave room to breathe at the narrowest board width (766 px, side by side).

## Placement preview (right click on a sponsor building card, or on a map)

- **What it does.** With the setting on (Settings > Board > "Placement preview (right-click)", default on, `S.previewBuilding`, saved as `bpreview`), a right click on a sponsor building card in a hand (the 27 of `PREVIEW_CARDS` in cards.js: Mascot Statue / Victory Column, Arcade, Franchise Business, Landscape Gardener, the three Experts, Adventure / Water Playground, Underwater Tunnel, Side Entrance, Expansion Area, Zoo School, the animal houses, Amazon House, Aquarium, Cable Car, Excavation Site, Waza Large Animal Program) puts the building on that player's zoo, half see-through (`.pghost`, opacity .5), without placing anything. The hand card gets a dashed orange outline (`.card.previewing`).
- **Enclosures.** A right click on a zoo map (either player's, whichever the cursor is on) opens a small picker (`.bpmenu`, `openMenu` in bpreview.js): 1-size ... 5-size, Aviary, Reptile house, Petting zoo and, in Marine Worlds only, Small / Large aquarium, each with its sprite. A choice starts the same preview. Only the geometry is shown: every enclosure can be previewed, whatever the Build action's level (the upgraded level is assumed: flagged spaces count), the money or the enclosures already built; Diversity Researcher's overbuild is honoured.
- **Using it.** The building follows the cursor (the hex under it is the anchor); a click pins it (anchor mark and the two turn buttons, like the fork's placement), a second click on the same hex lets it follow again. R / Shift + R and the mouse wheel over the map turn it. The outline is green where it fits and red where it does not, and a large pill at the top of the map says how to turn and stop it ("Wheel / R: turn     Right click: stop"; no name and no fits / doesn't fit text, the outline says it). Diversity Researcher: when the previewed zoo has played S219 (`overbuild` of the request) water and rock spaces may be built on and the rock / water requirements are ignored, for the buildings and the enclosures alike. Terrain Build (Build action card side 4, `terrain_build` of the request, from `action_cards` variant 4): the enclosure previews may also cover exactly one rock / water space (the card's once-per-action rule; no cost shown); sponsor buildings never get it, they come from the Sponsors action. Nothing is placed, there is no check mark.
- **Ending it.** A right click on the same card, a right click on the previewed map, Esc, a step change (replay / fork / live: `S.preview.step`, checked at the start of `render()`) or switching the setting off. A right click on another building card shows that one instead; a right click on a map without a preview opens the picker (so switching the enclosure takes two right clicks). The picker closes with Esc, a click outside, the wheel or a choice. Only a hand whose cards are shown (`!hides(seat)`) can start a card preview; in the replay, the fork, the sandbox and live play alike. With a real building placement running in a fork, neither the preview nor the picker is used.
- **Code.** `js/bpreview.js` (state, `begin`, `togglePreview`, `openMenu`, `turnPreview`, keys; started by the `bpreview-toggle` event that `cardRow` in cards.js sends from the card's `contextmenu`, and by the `bpreview-menu` event of the map's `contextmenu`), `previewLayer` block at the end of `zooBoard` (board.js: pick hexes, ghost, border, pill, buttons). Legal anchors and turns come from `POST /api/preview/placements` (`replay/preview.py`): {card | enclosure, map_id, marine_worlds, buildings, build_level, overbuild} in, {type, shape, options: [[x, y, rotation]]} out. It works from what the viewer shows (no engine state, so every mode can use it) and applies the rules of the card when it is played (`effects.build_rules` + `build_action.valid_placements`); the Experts (kiosk / 1-space enclosure / pavilion, placed later by their trigger) use the plain rules. When the request fails the pill says why (`S.preview.error`: "the server has no preview route yet (HTTP 404)" for a backend that predates the route, or the HTTP status) instead of the preview ending silently; a right click clears it. Tests: `tests/test_building_preview.py`. The R key is listed in the keyboard pop-up (shortcuts.js).

## Endgame scoring card count (replaces the "+n" tile of the second row)

- **What it is.** For the player whose cards are hidden (`hides(seat)`: the non-POV player), a small card (terracotta back, light inner border: the look of an endgame card) with the number of endgame cards that are scored printed on it, at the upper right of the Conservation points tile (`egCardIcon` in side-panel.js, `.egcard`, parkposter.css; variant D of the mocks, the hourglass would not stay readable at small window sizes). 1 normally, more with Resistance (the elephants). The count is known while the cards are not. The player whose cards are shown gets no icon: the cards are in the hand and their points in the violet "+X" pill.
- **The count.** `p.endgame_hand.length`, minus 1 while the player has 2 or more cards and fewer than 10 conservation points (the discard at 10 points is still to come; same rule as `engine/endgame.py` `kept_endgame_cards`). No cards = no icon (the draft / setup).
- **Removed.** The `.ppres2` tile `.egx` ("+n" next to the hand) and its CSS. Hover title: "Endgame scoring cards: n are scored".

## 93. Extension: table info and log, kept per table
Scope: `extension/capture.js`, `extension/button.js`, `extension/manifest.json` (1.2.0, `unlimitedStorage`), `web/import.html`. On a BGA table page the extension keeps the table info (tableinfos.html, its `data`) under `ark:index:<table id>` in extension storage; on a game review page the log (archive/logs.html) under `ark:log:<table id>`. The button shows only when both exist for the table of the page and their table ids agree. The import page checks the table info is about the same table and keeps it as `index:<table id>` in the browser next to the log. Not done yet: the server side (the replay and the fork read the table info, the Elo of each player) and the Elo scale (see the notes of the session).

## 94. Elo from the table info
Scope: `src/ark_nova/storage/tableinfo.py`, `tests/test_tableinfo.py`, `tests/fixtures/tableinfos_607674960.json`. The Elo before the game of each player is `floor(rank_after_game - point_win - 1300)` from BGA's table info (checked against the index of table 607674960: 358 and 391). Not wired into the replay or the fork yet.

## 95. Replay and fork from the extension's table info
Scope: `src/ark_nova/api/main.py` (`/api/tables/{id}/upload`, `_record_for_upload`, the fork takes `index`), `src/ark_nova/storage/tableinfo.py` (`record_from_tableinfo`), `web/js/load.js` (upload replay and fork send the table info stored by the import page), `tests/test_upload.py`. A log that the browser brings is replayed also when the table is not indexed: the table info stands in for the index (the Elo of the players comes from it, checked against the index). The table info must be about the same table as the log. The extension zip (`extension/extension.zip`, 1.2.0) is rebuilt; it is gitignored like every zip here.

- The manifest description is shortened to the store limit (132 characters).

- Verify of a log accepts a table that is not indexed (the import page said "not indexed yet"): the table id of the log is still checked.

## 96. Same map for all players (table info)
Scope: `src/ark_nova/storage/index.py` (`TableRecord.same_map`), `src/ark_nova/storage/tableinfo.py` (`same_map_of`), `src/ark_nova/replay/view.py` (one inferred map for both seats), `src/ark_nova/api/main.py`. A table whose table info has "Competitive level" (option 102) = "Same map for all players" was replayed with a different map per player (the log inference looked at each player on its own): both seats now get the map that the log shows for either of them. Found on table 930655556 (both on 3a).

## 97. Maps and Marine Worlds from the table info
Scope: `src/ark_nova/storage/tableinfo.py` (`maps_from_tableinfo` from `result.stats.player.map`, `marine_worlds_of` from option 111), `src/ark_nova/api/main.py` (`_record_for_upload` takes them for a table that is not indexed), `tests/test_upload.py`. The maps of 930655556 are both 3a in its table info, so the log inference is no longer needed for them; the same-map fallback is kept for a table info without the maps. The Marine Worlds flag from option 111 is checked on one table (607674960, index says Marine Worlds and the option is 1).

## 98. Own draft choice is not skipped; hunter and scuba dive reveals
Scope: `web/js/playback.js` (`ownChoice`: the frame of the viewed player's own draft choice is never skipped; before, the opponent-skip rule also skipped the second player's keep, so the starting hand came straight after the draft), `web/js/dock.js` (`revealDim`: during a Hunter / Scuba Dive draw step only the drawn cards the effect takes stay bright (animals for Hunter, sponsors for Scuba Dive); the other drawn cards and the rest of the hand are greyed out; the drawn cards are the hand gained in that step).

## 99. Placement bonus buttons are named
Scope: `src/ark_nova/replay/options.py` (`placement_bonus_name`, `effect_name` for `pbonus`), `tests/test_placement_names.py`. The bar named a placement bonus "pbonus"; it now says what the bonus gives ("Placement bonus: 5 money", "Placement bonus: kiosk", "Placement bonus: size-2 enclosure").

## 100. Starting hand with multi-word names and the discard decision
Scope: `web/js/frames.js`. (1) The lines of a merged setup step are grouped by their verb (after the player name, which can have several words: "Papa Emeritus V draw ..."; grouping by the second word put every line of such a player in one group, so the 8 starting cards had no frame). (2) The decision frame is dropped after a choice only for the real action card choice ("chooses action card X with strength N"), not for the draft line "chooses action cards (action card draft)", which dropped the initial discard frame. Found on table 930752686 as the second player.

## 101. Reveals hidden from the other player; Expedition and Scuba Dive 3 buttons
Scope: `src/ark_nova/replay/view.py` (`_reveal`, `_reveal_hidden`: the Hunter / Scuba Dive / Scavenging / Perception draws and keeps of the other player read "X draws N cards for the Y effect", "X keeps Z for the hunter / scuba dive effect", "X keeps N card(s) for the scavenging / perception effect"), `src/ark_nova/replay/options.py` (`_expedition_buttons`: Marine Research Expedition is two buttons, Expedition (greyed out without a person sponsor) and Scuba Dive 3), `web/js/action-bar.js` (`effectOption`, a disabled button, the fork sends the chosen option). The expedition buttons are unit-tested only; no sample game reaches that prompt in the replay.
