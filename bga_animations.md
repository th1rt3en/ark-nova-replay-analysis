# BGA Ark Nova animations — detailed inspection record

Compiled: **5 November 2026**. Primary live inspection: **4 November 2026**.

This is a technical handoff for a developer or AI agent investigating animations in the Ark Nova replay viewer. It consolidates the retained BGA inspection findings, adds relevant code recovered from the HTML response previously supplied by the user, and preserves the original audit in an appendix.

## 1. Evidence, scope and provenance

There are two distinct BGA evidence sets. Keep their table IDs and interface releases separate.

| Evidence | Table / version | What was actually available |
| --- | --- | --- |
| Live replay inspection | Table **932408681**, player **94936862 / Propaganda Panda**; replay interface release **261015-1030** | Normal replay progression through setup and the first break, ending at move 49; rendered DOM, computed CSS, inline styles, and loaded script/link references. |
| Previously supplied HTML response | Table **930781276**, player **97616549**; surrounding interface release **261007-0930** | A locally saved HTML response, including bootstrap JavaScript, preferences, initial game data and static hand markup. Relevant extracts were read locally when compiling this document. |
| Game-specific asset release | **260803-1142**, referenced by both evidence sets | The game asset base and stylesheet reference; module references were observed during the live inspection. This does not mean their external source bodies were retained. |

Live-inspected replay:

```text
https://boardgamearena.com/tablereplay?version=261015-1030&table=932408681&player=94936862
```

Other replay associated with the supplied response:

```text
https://boardgamearena.com/tablereplay?version=261007-0930&table=930781276&player=97616549&comments=94936862%3B
```

Local evidence files:

```text
C:\Users\ascri\Documents\Codex\2026-10-11\ple\outputs\bga_animation_audit_2026-11-04.md
C:\Users\ascri\.codex\attachments\c667e5f3-19f2-41e3-b697-dba8c0a979b8\Pasted text.txt
```

The supplied HTML is approximately 10.5 million characters. It is not a standalone export of every loaded JavaScript module. Its reference to an external file is not the file's implementation.

### Evidence labels used below

- **Observed declaration:** a transition property, duration and easing read from the live page's computed style.
- **Observed execution:** a visual state or intermediate transform established that a transition was actually running.
- **Verbatim excerpt:** code copied from the supplied HTML response. Surrounding unrelated content is omitted; the excerpt is not necessarily executable by itself.
- **Normalized representation:** CSS written here to express measured properties. This is not a verbatim stylesheet extract.
- **Inference:** a plausible responsibility or mechanism suggested by the evidence, not a source-confirmed implementation.
- **Recommendation:** a proposed treatment for our viewer, not a description of BGA's behavior.

### What this investigation did not obtain

The external bodies of `arknova.js`, the game modules listed below, and `arknova.css` were not retained during the live inspection. Therefore this document cannot honestly provide BGA's card-transfer handlers, complete animation helpers, notification queue code, or every keyframe.

There was no confirmed central animation registry. There is no retained exact 3D matrix from the Build upgrade, no frame-by-frame position trace, and no complete recording of every event category. Those details must not be invented from familiar BGA conventions.

No scripted fetch/XHR requests to BGA were made for this document. The original live inspection used normal browser navigation and replay controls; the additional excerpts were recovered from the user's existing local file. The user explicitly prohibits direct scripted requests to BGA.

## 2. Loaded game files and the asset-version distinction

The live replay exposed the following game-specific entry points:

```text
arknova.js
modules/js/Core/game.js
modules/js/Core/modal.js
modules/js/Players.js
modules/js/Cards.js
modules/js/ActionCards.js
modules/js/Meeples.js
arknova.css
```

Observed game asset base:

```text
https://x.boardgamearena.net/data/themereleases/current/games/arknova/260803-1142/
```

The surrounding replay interface release was `261015-1030`, while the game assets came from `260803-1142`. The supplied older response independently shows the same game asset release inside an interface release of `261007-0930`.

**Implication:** do not construct an Ark Nova asset URL by simply substituting the replay's `version=` value. Interface and game versions are separate.

### 2.1 Verbatim stylesheet reference

From the supplied response:

```html
<link rel="stylesheet" type="text/css" href="https://x.boardgamearena.net/data/themereleases/current/games/arknova/260803-1142/arknova.css"/>
```

This confirms the stylesheet URL, not its contents.

### 2.2 Verbatim game-package loader entry

The following is an excerpt from the `dojoConfig.packages` array, not the complete array:

```javascript
{
    name: "bgagame",
    location: "https://x.boardgamearena.net/data/themereleases/current/games/arknova/260803-1142/"
}
```

Other bootstrap settings present in that response included:

```javascript
parseOnLoad: false,
async: true,
useXDomain: true,
baseUrl: "https://x.boardgamearena.net/data/themereleases/261007-0930/js/dojoroot/dojo/"
```

These are loader configuration properties, not animation configuration.

### 2.3 Verbatim release and theme bindings

These separate excerpts show the release identifiers and game asset location:

```javascript
globalThis.g_release = '261007-0930';
globalThis.g_gamename = 'arknova';
globalThis.g_gameversion = '260803-1142';
```

```javascript
globalThis.g_themeurl = 'https://x.boardgamearena.net/data/themereleases/261007-0930/';
globalThis.g_gamethemeurl = 'https://x.boardgamearena.net/data/themereleases/current/games/arknova/260803-1142/';
globalThis.gamegui = null;
globalThis.g_last_msg_dispatched_uid = 0;
```

The last-message field exists, but its name alone is not proof of any animation queue or completion policy.

### 2.4 Verbatim game-module loading branch

```javascript
const esModule = false;
// we load the game when gameui is loaded, as it depends on it, so we cannot put it in the same await requireAsync.
const promiseResult = esModule ? await import("https://x.boardgamearena.net/data/themereleases/current/games/arknova/260803-1142//modules/js/Game.js") : await requireAsync(["bgagame/arknova"]);
const gameModule = esModule ? promiseResult : promiseResult[0];
```

Later initialization excerpt:

```javascript
globalThis.gameui = esModule ? new gamegui() : new bgagame.arknova();
if (esModule) {
    globalThis.gameui.GameModule = new gameModule.Game(globalThis.gameui.bga);
}
```

**Established:** this response selects the AMD branch because `esModule` is `false`. The ES-module URL is present in an inactive branch. Do not infer that `modules/js/Game.js` was executed, and do not confuse it with the separately observed `modules/js/Core/game.js`.

### 2.5 Where to look when source bodies become available

The following mapping is an inference from file names and observed UI responsibilities:

| File | Useful investigation target | Not yet established |
| --- | --- | --- |
| `arknova.js` | Main game setup, notification registration, preferences and orchestration | Exact notification names, duration calculations, queue synchronization. |
| `Core/game.js` | Shared game behavior, possible movement helpers | Whether it owns animation helpers, how cancellation or instant mode works. |
| `Core/modal.js` | Modal appearance and reveal presentation | Opening/closing timings or transitions. |
| `Players.js` | Player boards, hand state and resource updates | Which transfers or marker animations it implements directly. |
| `Cards.js` | Card creation and movement between locations | Deck/display/hand/discard flight paths, duration or easing. |
| `ActionCards.js` | Action slots, selection and side-I/II representation | Reordering implementation and whether it shares helpers with upgrades. |
| `Meeples.js` | Worker, track marker and token representation | Exact movement/reparenting methods and destination calculations. |
| `arknova.css` | Transition declarations, animation classes and transforms | Full selectors, overridden rules, media-specific variants and keyframes. |

## 3. BGA's actual animation-speed preference definition

This was recovered from the supplied HTML response while compiling this document. It is additional evidence beyond the original live audit.

### 3.1 Verbatim preference object

```json
{
    "id": 111,
    "name": "Animations speed",
    "value": 1,
    "options": [
        {
            "label": "Very slow",
            "value": 5,
            "cssPref": null
        },
        {
            "label": "Slow",
            "value": 4,
            "cssPref": null
        },
        {
            "label": "Regular",
            "value": 3,
            "cssPref": null
        },
        {
            "label": "Fast",
            "value": 2,
            "cssPref": null
        },
        {
            "label": "Very fast",
            "value": 1,
            "cssPref": null
        },
        {
            "label": "Instant (no animation)",
            "value": 0,
            "cssPref": null
        }
    ]
}
```

### 3.2 What the object establishes

| Stored value | Label |
| --- | --- |
| 5 | Very slow |
| 4 | Slow |
| 3 | Regular |
| 2 | Fast |
| 1 | Very fast |
| 0 | Instant (no animation) |

The supplied response has value `1`, corresponding to **Very fast**. This is the selected value in that response, not proof of BGA's default for all users. It is also not proof of the selected value during the separate table-932408681 live inspection.

The numbers are enum values. They are **not established multipliers**. In particular:

- Value `3` does not mean 3× playback speed.
- Value `5` does not establish a fivefold duration.
- `cssPref: null` does not prove that CSS transitions are unaffected. JavaScript might modify a class, variable, duration, queue delay, or another mechanism.
- The label for value `0` indicates an intended no-animation mode, but the code implementing it was not obtained.
- There is no verified formula converting this preference into milliseconds.

### 3.3 Why this matters when interpreting the measured timings

The 300/400/500/800 ms values below are computed declarations recorded from the inspected page. Without the relevant implementation and preference state, they should not be advertised as BGA's universal “Regular” speed settings.

To determine the actual scaling, a later source audit should trace preference **111** from its change handler through all duration/delay calculations. A runtime comparison should then measure the same effect under multiple preference values. Neither step has been completed.

## 4. Confirmed transition inventory

The original audit retained the following property/duration/easing tuples:

| Element / family | Property | Duration | Easing | Evidence level |
| --- | --- | --- | --- | --- |
| `.action-card-perspective` | `transform` | 500 ms | `ease-in-out` | Declaration plus execution observed during the Build upgrade at move 32. |
| `.action-card` | `top` | 500 ms | `ease` | Declaration observed. |
| `.action-card` | `box-shadow` | 500 ms | `ease` | Declaration observed. |
| Reputation marker, e.g. `#meeple-reputation-94936862` | `top` | 300 ms | `ease` | Declaration observed. |
| Appeal/conservation markers, including duplicated conservation-track representation | `transform` | 500 ms | `ease` | Declarations observed; complete movement mechanism not established. |
| `.worker-holder` | `top` | 500 ms | `ease` | Declaration observed. |
| `#floating-hand-wrapper` | `transform` | 800 ms | `ease` | Declaration observed. |
| `#floating-hand-button-container` | `top` | 800 ms | `ease` | Declaration observed. |
| Hand/scoring/stored-hand controls | `transform` | 400 ms | `ease` | Declaration observed for the control family. |
| Hand/scoring/stored-hand controls | `margin` | 400 ms | `ease` | Declaration observed for the control family. |

The retained audit did not record transition delays, transform origins, all authored selector strings, complete before/after values, or all applicable overrides. Do not fill those gaps with guessed defaults and call them observed data.

## 5. Granular notes on each confirmed family

### 5.1 Action-card upgrade flip

**Observed execution:** at move **32**, Build became level II. The `.action-card-perspective` element had an intermediate 3D transform matrix during the change.

This is stronger evidence than simply finding a CSS rule: there was a transform in progress while the side changed.

**Normalized representation of the measured declaration — not copied stylesheet source:**

```css
.action-card-perspective {
    transition-property: transform;
    transition-duration: 500ms;
    transition-timing-function: ease-in-out;
}
```

Equivalent shorthand for the known tuple:

```css
/* Measurement representation only; no transition delay was retained. */
.action-card-perspective {
    transition: transform 500ms ease-in-out;
}
```

Unknown: authored front/back DOM, rotation axis, start/end angles, perspective distance, `backface-visibility`, transform origin, whether the artwork switches at a midpoint, and JavaScript handler names. No exact `matrix3d(...)` value is preserved.

Do not turn “intermediate 3D transform was present” into a claim that BGA uses a particular `rotateY(180deg)` implementation.

### 5.2 Action-card vertical movement and emphasis

**Normalized representation:**

```css
.action-card {
    transition-property: top, box-shadow;
    transition-duration: 500ms, 500ms;
    transition-timing-function: ease, ease;
}
```

Equivalent measured shorthand:

```css
.action-card {
    transition: top 500ms ease, box-shadow 500ms ease;
}
```

The declaration supports vertical position/emphasis changes. It does **not** establish horizontal slot movement. Slot reordering may involve a different property, wrapper, temporary positioning or JavaScript helper. The exact shadow colors, offsets and selection sequence were not retained.

### 5.3 Reputation marker

One concrete player-marker identifier recorded was `meeple-reputation-94936862`.

**Normalized representation:**

```css
#meeple-reputation-94936862 {
    transition-property: top;
    transition-duration: 300ms;
    transition-timing-function: ease;
}
```

The ID is an observed instance, not a claim that BGA authors one stylesheet rule per player. The original selector could be a shared class or attribute rule.

Unknown: target coordinates for each reputation position, stacking offsets, movement across different parents, and JavaScript changes to `top`.

### 5.4 Appeal and conservation markers

The retained computed tuple is:

```text
transition-property: transform
transition-duration: 500ms
transition-timing-function: ease
```

This includes conservation's duplicated track representation. The exact set of authored selectors was not retained, so no guessed selector is supplied here.

Important distinction: a marker's CSS transform transition does not establish that a transfer between two track representations is handled entirely by CSS. The JavaScript may reparent, replace or synchronize elements. No exact track coordinate arrays, offsets or transfer helper were recovered.

### 5.5 Worker holders

**Normalized representation:**

```css
.worker-holder {
    transition-property: top;
    transition-duration: 500ms;
    transition-timing-function: ease;
}
```

This rule was associated with worker holders in the player-board area. It is not a measurement of a worker's full journey from reserve to Association board, or its return during a break.

Unknown: whether the worker itself or its holder is reparented; travel duration, travel easing, task occupancy handling, stacking and return stagger.

### 5.6 Floating hand panel

**Normalized representation:**

```css
#floating-hand-wrapper {
    transition-property: transform;
    transition-duration: 800ms;
    transition-timing-function: ease;
}
```

This is a panel reveal/hide transition. It is not a measurement of an individual card being drawn, discarded, stored or played.

### 5.7 Floating hand button-container movement

**Normalized representation:**

```css
#floating-hand-button-container {
    transition-property: top;
    transition-duration: 800ms;
    transition-timing-function: ease;
}
```

The wrapper and button container share a measured duration, which makes coordinated panel/control movement plausible. A shared controller or a particular synchronization order remains unverified.

### 5.8 Hand/scoring/stored-hand controls

The measured control-family tuple was:

```text
transition-property: transform, margin
transition-duration: 400ms, 400ms
transition-timing-function: ease, ease
```

The supplied static markup below confirms the hand and scoring-hand IDs. A stored-hand control was part of the live computed-style inspection, but its exact ID and complete authored selector were not preserved in the audit. Do not invent one.

These are control movements, not evidence of card flight paths.

## 6. Verbatim floating-hand markup from the supplied response

```html
<div id="floating-hand-wrapper">
    <div id="floating-hand-button-container">
        <div id="floating-hand-button">
            <div class="arknova-icon icon-hand">
                <i class="fa fa-times" aria-hidden="true"></i>
            </div>
        </div>
        <div id="floating-scoring-hand-button">
            <div class="arknova-icon icon-scoring-hand">
                <i class="fa fa-times" aria-hidden="true"></i>
            </div>
        </div>
    </div>
    <div id="floating-hand"></div>
</div>
```

This is a source excerpt with indentation normalized for readability; element names, nesting, IDs, classes and attributes are preserved.

Established relationships:

```text
floating-hand-wrapper
├── floating-hand-button-container
│   ├── floating-hand-button
│   │   └── arknova-icon icon-hand
│   │       └── fa fa-times
│   └── floating-scoring-hand-button
│       └── arknova-icon icon-scoring-hand
│           └── fa fa-times
└── floating-hand
```

The source's `floating-hand` node is initially empty in this excerpt. That does not mean the initialized UI lacks cards: they can be inserted later. The source markup alone does not reveal how card elements are animated after insertion.

The separation between outer wrapper, button container and card container is useful when interpreting the measured rules: different elements can animate different properties simultaneously. It does not establish the full interaction handler.

## 7. Replay-event inventory: moves actually reviewed

These examples were retained from the opening of table **932408681**. The event occurred in the reviewed replay; the exact BGA animation was not necessarily measured. The final column names the remaining inspection question rather than inventing an implementation.

| Event | Example BGA move(s) | Retained evidence / next question |
| --- | --- | --- |
| Initial hand dealt | 7 | The opening deal is a useful card-arrival example. Individual-card BGA duration/path not retained. |
| Action selected/returned | 10–11, 12–13, 29–34, 41–46 | Inspect slot changes separately from `.action-card` vertical/shadow rules and upgrade flips. |
| Worker use and return | 11, 13, 49 | Task use and break return appear in the opening; holder transition is known, full worker travel is not. |
| Building placed | 16, 18, 44 | Useful examples for board placement and placement bonuses; no measured BGA building-settle keyframes. |
| Caves storage | 19, 45 | Card goes into storage; storage must not be conflated with discarding. BGA transfer code unretained. |
| Deck draw | 22 | Useful ordinary draw example; no retained source/destination trajectory. |
| Hand discard | 23 | Useful departure example; no retained BGA discard flight/dissolve implementation. |
| Resource/track changes | 11, 13, 26, 31, 33, 38 | Track transition tuples are recorded above, but not every resource's per-event motion. |
| Animal played | 30, 37 | Useful hand-to-played-area and enclosure-occupation examples. Exact coordination not recovered. |
| Build upgraded to side II | 32 | Actual 3D flip in progress observed, with 500 ms ease-in-out transform transition. |
| Animal marked in display | 35 | Marker placement event identified; no measured marker arrival animation. |
| Display snap | 39, 48 | Useful explicit display-to-hand transfers; actual BGA card-flight implementation unretained. |
| Display replenished | 40, 49 | Useful surviving-card shifts and new-card arrival examples; order and duration not established. |
| Sponsor played | 42 | Useful hand-to-played-area event; no exact transfer helper retained. |
| Break trigger/resolution | 47–49 | First break reviewed. Complete choreography, queue blocking and batch ordering not established. |

The recorded move numbers are replay move references, not elapsed time, engine turn numbers, or indexes into our generated replay steps. Multiple lines/notifications can belong to a single move.

## 8. Animation categories that were not examined in that playback pass

The opening inspection does not establish BGA's behavior for:

- Conservation-project support cubes and donation markers.
- Attack-token arrival, removal, prevention or immunity feedback.
- Release of animals or enclosure reuse after release.
- Sending a sponsor on an expedition.
- Detailed endgame/final-scoring marker movement.
- Every Hunter, Scavenging, Perception, Scuba Dive or other reveal flow.
- Sunbathing, Pouching, Glide and targeted-draw visual effects as later prototyped in our viewer.
- Every map-specific effect, Marine Worlds interaction, or hidden-opponent presentation.

Our later Sunbeam pickup, Portrait canvas pouch, Bubble lift and Species spotlight designs are **our approved designs**. They were not discovered in BGA source code. The same applies to Direct glide and Soft dissolve. Refer to `animations_v01.md` for those decisions.

## 9. Important implementation distinctions

### 9.1 Declared transition versus executed animation

A computed transition lists what could animate when a property changes. It does not identify the event handler, prove the property changed for a particular event, or establish the entire visual sequence. The Build upgrade is the clearest retained execution example because an intermediate transform was observed at the corresponding move.

### 9.2 Duration versus total event time

A 500 ms transition does not prove that the replay notification takes exactly 500 ms. Total time might include queue delays, preceding effects, staggering, a reading hold, or subsequent effects. None of those extra delays should be asserted without source or runtime evidence.

### 9.3 Position change versus cross-container transfer

Animating `top` or `transform` within one parent is different from moving an object into another parent. Source and destination coordinates can use different spaces, and removing/recreating DOM nodes can interrupt CSS transitions. The inspected tuples do not establish BGA's transfer strategy.

### 9.4 Interface animations versus game-object animations

The 800 ms hand-wrapper motion concerns the interface panel. The 400 ms control motion concerns buttons. Neither establishes how long an individual card should fly. A later implementation should keep these timing categories distinct.

### 9.5 Duplicate representations versus duplicate events

Conservation can have more than one on-screen representation. Multiple animated marker elements do not necessarily mean the resource was gained twice. An event audit must distinguish one state change from its visual copies.

### 9.6 Hidden information

The inspection did not establish every BGA visibility rule during card travel. A face-up card in one player's replay must not be treated as permission to show the same face in an opponent's hand. Our animation layer must use the viewer's permitted state.

### 9.7 Animation speed versus replay speed

The supplied response proves a game animation preference exists. It does not prove how it interacts with replay pacing, notification scheduling, pause, fast-forward, or instant mode. Those are separate implementation questions.

## 10. Historical comparison with our viewer

The original audit compared BGA with our local frontend on **4 November 2026**, before the subsequently approved card-motion implementation. The original line references in Appendix A are historical and may have shifted.

At that time the local viewer already had:

- Starting-hand presentation in `web/js/dock.js`, with fan and floating-tray variants.
- Reveal-kept-card dealing in `web/js/handfly.js`.
- Resource-number gain/loss flashes in `web/js/side-panel.js`.
- Drawer, tray, lightbox and other UI transitions in `web/css/parkposter.css`.
- Markup reconciliation in `web/js/main.js` that preserved identical subtrees but did not track a moving object across arbitrary containers.

The audit also found disabled/dormant paths:

- Card/project-strip/bonus-token arrival effects were disabled by theme rules.
- `zoneNew()` left its departure-ghost list empty, even though consumers still contained ghost-related code.
- Autoplay advanced on an interval without waiting for animation completion.

**Current-state caveat:** card motion and autoplay coordination have since been added locally. Do not use this historical description as evidence that the current viewer still lacks them. Current integration is in `card-motion.js`, `card-motion-plan.js` and the corresponding changelog section.

## 11. Recommendations derived from the inspection — not BGA source facts

### 11.1 Preserve object continuity

For a visible card or worker, use stable identity and actual before/after positions. A generic `transition: all` cannot reliably repair container changes or wholesale DOM replacement.

### 11.2 Coordinate actions with their consequences

Useful animation sequences include:

```text
Card chosen from display
    → that same card arrives at the receiving hand
    → display shifts/refills when the replay state calls for it

Animal played
    → card reaches the played area
    → occupied enclosure is made clear
    → resource gains are shown as the state resolves

Action card upgraded
    → visible side-I/II change
    → subsequent slot changes remain understandable

Break
    → trigger becomes clear
    → actual cleanup / worker return / display refresh / income resolve coherently
```

These diagrams describe proposed design relationships. They do not claim that BGA uses this exact order or blocks its queue at these boundaries.

### 11.3 Avoid tying every effect to one fixed duration

The measured BGA declarations span 300–800 ms across different object/UI families. That supports investigating purpose-specific timings. It does not justify copying those values indiscriminately, especially without tracing preference 111.

The initial audit suggested prototyping common transfers around 200–400 ms and deliberate flips around 400–500 ms. Those were early recommendations, not BGA measurements for every transfer and not the current approved speed specification for our viewer.

### 11.4 Make replay navigation authoritative

- Adjacent forward progression can animate relevant changes.
- Seeking, scrubbing and backward navigation should reach their target state promptly.
- Cancellation must restore visible final-state elements and remove obsolete overlays.
- Multiple frames of the same logical step should not replay an unchanged reward.
- Hidden destinations, closed drawers and off-screen areas need an understandable treatment.
- Reduced-motion and no-animation behavior should have deliberate handling.

## 12. Missing source-level questions for the next audit

These are questions to answer, not names of methods already found:

1. Where does preference 111 get read and changed?
2. What exact formula maps its enum values to durations or delays?
3. Are CSS timings rewritten, or are only JavaScript animations affected?
4. What does Instant do to already-running animations and pending notifications?
5. Is there one shared movement helper? What are its real name, parameters and callers?
6. Are draw, snap, discard, play and store operations handled by the same card class?
7. How are coordinates converted when moving across containers or scaled boards?
8. Does a moving element retain identity, or is a temporary clone used?
9. How are card faces concealed during transfers involving hidden information?
10. How does action-slot reordering work independently of the confirmed upgrade flip?
11. Are workers reparented or recreated? How are multiple returns batched?
12. What coordinates and offsets position appeal, conservation and reputation markers?
13. How is the duplicated conservation representation synchronized?
14. Which notifications block the replay queue, for how long, and on what completion condition?
15. How does fast-forward affect those waits and animations?
16. How do break sequences avoid overlapping cleanup, refill and income effects?
17. Which animation rules are active, and which are unused or overridden?
18. Are there special exceptions for touch layouts, reduced motion, spectators or different maps?

Search terms such as `animate`, `transition`, `duration`, `delay`, `111`, `instant`, `synchronous`, `slide`, `move`, `flip`, `notif` and `onPreferenceChange` may be useful when actual source files are available. These are exploratory search terms, not confirmed identifiers in this game's source.

## 13. Safe way to acquire the missing implementation

Use the files already loaded during normal authenticated replay navigation. Do not create direct BGA fetch/XHR scripts.

Suggested manual workflow:

1. Open the replay normally and select a player.
2. Open Chrome DevTools → Sources.
3. Use Ctrl+P to find the exact game file.
4. Verify its path belongs to the observed Ark Nova game release, rather than an unrelated framework `game.js`.
5. Save the loaded source locally.
6. Repeat for the seven JavaScript files and `arknova.css` listed in section 2.

No account cookies, authentication headers or full HAR archive are needed for this handoff. A full HTML or HAR export can contain unrelated account/session material; share only the relevant source files or excerpts.

With those files, the next agent can produce an implementation inventory with exact file/line references, copied helper functions, notification-to-animation mappings, full keyframes or transforms, queue timing and speed-preference behavior. This document should remain the record of what was established before that source pass.

## 14. Findings that must not be overstated

| Supported statement | Unsupported stronger statement |
| --- | --- |
| Build's upgrade was observed during a 500 ms ease-in-out transform transition. | Every action-card movement is a 500 ms 3D flip. |
| `.action-card` has measured `top` and `box-shadow` transition declarations. | Horizontal slot reorder uses those same properties. |
| Worker holders have a 500 ms `top` transition. | Worker reserve-to-task flights take exactly 500 ms. |
| The hand wrapper has an 800 ms transform transition. | Individual BGA card draws take 800 ms. |
| The preference enum includes Instant. | Its implementation always sets all CSS durations to zero. |
| The supplied response selected Very fast. | Very fast was selected during the separate live inspection, or is BGA's universal default. |
| Game-specific module URLs were observed. | Every module body and animation handler was read. |
| The opening through the first break was reviewed. | All Ark Nova animation categories were exhaustively audited. |

## Appendix A. Original retained audit, preserved in full

The original 4 November report follows verbatim. Its local-project comparison and line references describe the state on that date; later implementations supersede those parts. Its recommendations are not BGA source excerpts.

---

# BGA replay animation reconnaissance and priorities for our viewer

Date: 2026-11-04

## Scope and confidence

Read-only investigation of BGA table **932408681**, viewed as Propaganda Panda, plus the relevant frontend files in `C:\Users\ascri\Desktop\ark-nova-replay-analysis-main`.

Replay: https://boardgamearena.com/tablereplay?version=261015-1030&table=932408681&player=94936862

The replay was opened successfully through BGA's player-selection page after login. I stepped through setup and the first break, up to move 49. I inspected rendered elements, computed CSS, inline DOM styles, and script/link elements. No project files were edited. No scripted HTTP/fetch requests were sent to BGA; navigation and replay progression used the normal page controls.

**This is an initial animation inventory, not an exhaustive audit of BGA's JavaScript implementation.** The browser connection exposes external script URLs but not their source bodies. Consequently, this report does not claim that every BGA animation has been found, does not assign unverified JavaScript method names, and does not treat a CSS transition declaration as proof that every possible movement uses that transition.

## 1. What the page reveals about the code organization

There is enough evidence to identify useful entry points. The replay frame loads these game-specific files:

```text
arknova.js
modules/js/Core/game.js
modules/js/Core/modal.js
modules/js/Players.js
modules/js/Cards.js
modules/js/ActionCards.js
modules/js/Meeples.js
arknova.css
```

Observed asset base:

```text
https://x.boardgamearena.net/data/themereleases/current/games/arknova/260803-1142/
```

The surrounding archived BGA interface uses release `261015-1030`. These are the actual paths observed in this replay; they should not be assumed to apply to all replay versions.

The module names suggest where card transfers, action-card changes, piece movement, and shared animation helpers should be investigated. That responsibility mapping remains an inference until the source bodies are available. I have not established whether a central animation registry exists.

## 2. Confirmed motion declarations in BGA

These values were read from the game frame's computed styles, without requesting the stylesheet separately.

| Element/family | Property | Duration | Easing | What is established |
|---|---|---|---|---|
| `.action-card-perspective` | `transform` | 500 ms | `ease-in-out` | Action-card flip rule. At move 32, Build changed to level II and its perspective element had an intermediate 3D rotation matrix, confirming a flip in progress. |
| `.action-card` | `top`, `box-shadow` | 500 ms each | `ease` | Vertical/emphasis transition declarations; this alone does not establish the implementation of horizontal slot reordering. |
| Reputation markers, e.g. `meeple-reputation-94936862` | `top` | 300 ms | `ease` | Reputation marker's CSS motion rule. |
| Appeal/conservation markers, including the duplicated conservation track | `transform` | 500 ms | `ease` | Transform transition declarations on those markers. Reparenting or other JavaScript movement can involve additional behavior. |
| `.worker-holder` | `top` | 500 ms | `ease` | Transition on worker holders in the player board; not proof of the duration of worker travel to Association tasks. |
| `#floating-hand-wrapper` | `transform` | 800 ms | `ease` | Hand panel reveal/hide transition. |
| `#floating-hand-button-container` | `top` | 800 ms | `ease` | Button-container position transition. |
| Hand/scoring/stored-hand buttons | `transform`, `margin` | 400 ms each | `ease` | Transitions for the hand controls. |

These findings support a useful design direction: short, purpose-specific transitions, rather than one duration applied to everything. BGA's timings are references to assess, not requirements to copy.

## 3. Events to consider animating

The following events occur in the reviewed opening of this game. The proposed effects below are recommendations for our viewer, not assertions that BGA uses those exact effects.

| Event | Example moves | Proposed treatment | Benefit |
|---|---|---|---|
| Initial cards dealt | 7 | Keep/refine the existing staggered arrival. | Establishes the starting hand. |
| Draw from deck | 22 | Brief arrival at the hand/deck origin when both are visible. | Makes new cards identifiable. |
| Discard from hand | 23 | Card leaves toward the discard pile; remaining cards close the gap. | Makes the selected discard and its destination clear. |
| Snap from display | 39, 48 | Move the chosen card toward the receiving hand, followed by display reflow. Use a card back/count when the hand is hidden. | Explains what disappeared and who received it. |
| Display replenishment | 40, 49 | Surviving cards move to their new slots; new cards enter afterward. | Preserves the viewer's understanding of the display. |
| Animal played | 30, 37 | Move the card into the played area and emphasize the occupied enclosure as one coordinated event. | Connects the animal card with its board placement. |
| Sponsor played | 42 | Brief hand-to-played-area movement. | Makes the newly active sponsor identifiable. |
| Building placed | 16, 18, 44 | Short fade/settle at its actual board position, with placement bonuses emphasized afterward. | Shows where the board changed. |
| Action chosen and returned | 10–11, 12–13, 29–34, 41–46 | Lift/emphasize the chosen action, then slide it to slot 1 while displaced actions move together. | Explains strength and order changes. |
| Action card upgraded | 32 | Brief face flip, modeled on the confirmed BGA example. | Makes the change from side I to II explicit. |
| Appeal/reputation and resource changes | 11, 13, 26, 31, 33, 38 | Short marker movement and/or a readable signed delta at the changed resource. | Makes gains and costs legible without rereading the log. |
| Association worker used/returned | 11, 13, 49 | Move the same worker between reserve and task, batching returns at the break. | Explains worker availability. |
| Animal marked in display | 35 | Place the player's marker on the affected card with a short settle. | Draws attention to a small but important change. |
| Card stored under Caves | 19, 45 | Transfer toward the stored-card area/control. | Distinguishes storage from discarding or playing. |
| Break trigger and resolution | 47–49 | Indicate the trigger, then group the actual cleanup, display refresh and income changes coherently. | Makes a large state change understandable. |

Project support/donation cubes, attack tokens, releases, expeditions, and final scoring are also sensible candidates. Their animation behavior was **not reviewed in playback during this pass**. They need a second pass or source inspection before being listed as confirmed BGA effects.

## 4. What our current frontend already has

Our page is not starting from zero:

- `web/js/dock.js:71` implements initial hand presentation and dealing, including staggered cards and fan/tray variants.
- `web/js/handfly.js:21` animates cards kept from reveal effects into the hand. Despite the filename, it intentionally does not fly a large lightbox card into a small card; the lightbox disappears and the kept cards enter the hand. Its own comments explain that the earlier direct flight looked awkward. This should be judged on its own merits rather than replaced automatically.
- `web/js/side-panel.js:152` attaches gain/loss flash classes when numerical values change.
- `web/css/parkposter.css` contains drawer, tray, lightbox and other interface transitions.

The biggest gap is the continuity of game objects between successive board states.

### Arrival/departure effects are deliberately disabled

`web/css/parkposter.css:494–497` explicitly disables arrival animation for cards, project strips and bonus tokens, and removes the new-token/building frame treatment.

`web/js/cards.js:212–225` leaves `test.gone` empty. Departed cards therefore do not become departure ghosts through that helper. Consumers still contain code for ghosts, but that does not mean the effects currently execute.

This explains why existing animation-related code can be misleading when simply searching the repository: some of it is dormant.

### The renderer preserves unchanged markup but does not track every moving object by identity

`web/js/main.js:50–68` reconciles old and fresh markup, comparing child positions recursively. It preserves identical subtrees, which helps prevent flicker. It is not a general system for recognizing that the same card or worker moved to a different container.

A movement layer would need stable identities and before/after positions. Adding `transition: all` would not solve reparenting and replacement of elements reliably.

### Autoplay does not wait for animation completion

`web/js/playback.js:14–18` advances using `setInterval(..., 1000 / S.speed)`. `go()` updates the step and calls `render()` directly at lines 101–110. There is no animation-completion coordination in this navigation path.

Long effects would risk being interrupted by subsequent frames, especially at higher playback speeds. Animation timing and navigation behavior should be designed together.

## 5. Recommended first implementation scope

Start with these three groups:

1. **Card continuity:** play, draw, discard, snap, and display reflow.
2. **Action-card continuity:** chosen-action emphasis, return/reordering, and side-I/II flip.
3. **Board feedback:** building arrival/occupation, resource deltas, and track markers.

Then add worker/cube/token transfers and a coordinated break sequence. Keep the existing drawer and hand presentation unless a specific issue warrants changing them.

Suggested timing to prototype: roughly 200–400 ms for common transfers/emphasis and around 400–500 ms for a deliberate flip. These are design proposals, not measured timings from every BGA effect. Evaluate them at actual replay speed and with the current layouts.

Implementation principles:

- Animate adjacent forward playback; render arbitrary jumps and timeline scrubbing promptly at their target state.
- Define back-step behavior explicitly; an undo should not look like a new reward.
- Cancel/finish obsolete effects when the user navigates again. Effects must never change the underlying game state.
- Account for multiple presentation frames of the same replay step so an effect does not restart on an unchanged board.
- Use stable card/piece identity, not only array position. Avoid showing a hidden card face in an overlay or transfer.
- If a destination is hidden in a drawer, on another player's board, or offscreen, use a short local cue rather than an unexplained cross-screen flight.
- Group related effects, particularly during breaks; avoid making the user wait for every coin or worker individually.
- Honor reduced-motion preferences and offer an animation setting.
- Keep the final state authoritative even when an effect is cancelled or playback is accelerated.

## 6. What is still needed for a complete BGA source inventory

The eight files listed in section 1 would allow a proper code-level pass: identify notification handlers, movement/flip helpers, durations, queue delays, CSS classes and exceptions, and distinguish active effects from unused code.

They can be saved from the replay's already-loaded sources in Chrome DevTools: **Sources → Ctrl+P → exact filename → Save as**. Take the files from the observed `arknova/260803-1142/` path; `game.js` and similar names may otherwise refer to unrelated framework files. Saving loaded source does not require writing a `fetch` script.

No account cookies, tokens, or full HAR export are needed. The next audit should use the saved source files, not issue direct requests to BGA to obtain them.

Until then, this report is sufficient to choose useful animation prototypes, but it should not be presented as a complete list of all animations implemented by BGA.

