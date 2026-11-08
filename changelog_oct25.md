# Changes — 25 October 2026

## Rounded X-token silhouettes — 7 November 2026

Matched the supplied X-token reference with explicit curves at all eight outer corners, retaining sharp inward notches. The previous polygon rounded only its thin stroke, which became visually sharp at log sizes. All four sprite variants now share the same path: dotted/solid, bordered/plain (`r3c2`, `r5c6`, `r3c2_ns`, `r5c6_ns`). Editable SVGs live in `web/icons_hd/xtoken-{dotted,solid}[-plain].svg`; all have uniform opaque charcoal interiors. Verified identical alpha silhouettes for dotted and solid counterparts and inspected 24/32/44/100 px browser renders. Shared icon cache version bumped to art20261107c; validation browser cache cleared.


## Clean dotted X-token — 7 November 2026

Rebuilt the dotted X-token as precise SVG geometry with a uniform opaque charcoal fill and four white squares. Replaced both bordered (`r3c2.webp`) and plain (`r5c6.webp`) raster consumers with lossless renders. Editable sources: `web/icons_hd/xtoken-dotted.svg` and `xtoken-dotted-plain.svg`. This removes the right-half stains and stray edge pixels from the AI-generated asset. Checked the opaque fill and the 44 px log rendering in Chrome; bumped the shared icon cache version and cleared the validation browser cache. Number-overlay variants are unchanged.


## Approved icon restorations throughout the frontend — 7 November 2026

Installed the 20 reviewed image variants (19 pictograms plus the dotted X-token). Replaced both the shared `web/icons` sprites and `web/icons_hd` artwork, so existing consumers in resource counters, logs, maps, association bonuses, track rewards, action tokens, tooltips and the map editor resolve to the approved artwork without individual layout rewrites. Existing logical sprite dimensions and aspect ratios remain unchanged. Full bonus-tile sprites are composed from the real `bonusTile` renderer, preserving their pentagon, background and framing. The plain/bordered X-token families retain separate dotted and number-overlay variants; the plain versions have the external white perimeter removed while preserving the four square dots.

Adapt 3 now uses the restored original BGA two-card design (hourglass, crossed card, separate 3x labels) through `adaptIcon`, including maps, association bonuses and the editor. Adapt values other than 3 keep their existing variable-number drawing. Shared icon and HD image URLs carry `?v=art20261107` to bypass previous image cache entries.

Validation: headless Chrome loaded the actual frontend modules and all 40 bonus/frame variants, verified Adapt 3 selects its restored image, captured the full-tile sprites and a visual overview, and reported no JavaScript errors. Browser cache was cleared in the validation context. No engine rules or game-state data changed. These are approved AI-assisted recreations of legacy BGA artwork, not newly designed symbols or lossless enlargements. The historical `build_bonus_hd.py` / `build_icons.py` pipelines still recreate older art if run: preserve the installed assets when regenerating unrelated sprites.


## Follow-up — action-card animations, 6 November 2026

Implemented the approved Direct glides for action-card reordering and the right-to-left edge upgrade flip for sidebar icons and enabled full cards below the board. Venom, Constriction and Multiplier badges glide to/from the invisible deck in the sidebar, including while the player's info box is hidden by Log or Chat: exact hypothetical Control positions are measured invisibly without changing the selected tab. Full-card badges below the board retain their existing immediate updates. Fixed binder clips stay in their slots. All effects share animation-speed settings, autoplay waiting and interruption cleanup through the existing animation registry.

Added `web/js/action-motion-plan.js`, `web/js/action-motion.js` and `tests/action-motion-plan.test.mjs`; integrated metadata and motion hooks in `side-panel.js`, `zoo.js`, `card-motion.js` and `card-motion.css`. Updated `docs/animations_v01.md`. Validation: 32 classifier tests passed; actual-frontend Chromium checks passed for 48 transitions across both players and Control/Log/Chat pane states, exact hidden token endpoints, instant board tokens, reduced motion, backward cleanup, optional-strip disabling and six speed levels. Token fixtures and Chat pane were synthetic where the saved replay lacked those cases. Browser cache cleared for local validation. Full details are in **Action-card glides, edge-led upgrades and token flights — 6 November 2026** in `changelog.md`. No backend changes or deployment.

## Follow-up — played-card animations, 5 November 2026

Implemented the approved animal/sponsor card-play glides for Top/bottom, Tabbed, and Side-by-side closed/small/full drawers. POV cards come from the hand/fan or display; other players' cards emerge from their info box. Cards continuously resize into the real fitted piles without scrolling. Hidden tabbed owners are selected immediately and the original tab returns one full second after the flights finish. Closed-drawer cards end at the full drawer's fitted card size before disappearing; existing full-drawer pile cards reflow on the incoming flight's clock to prevent the early twitch. Folded trays temporarily open for their own plays. Speed, reduced motion, autoplay waiting and interruption cleanup use the existing animation lifecycle.

Changed `web/js/card-motion.js`, `web/js/card-motion-plan.js`, `web/js/zoo.js`, the classifier regression tests, and `docs/animations_v01.md`. Public played additions supply identities without revealing hidden hands; hand plays are excluded from other-player discard counts. Full implementation details and validation are maintained in the **Played animals and sponsors — 5 November 2026** section of `changelog.md`. No backend changes.


## 1. Normal-turn detection, replay header and post-game graphs

### Problem and verified evidence

The BGA replay parser used public `gameStateChange id=20` notifications as action-selection markers. These markers are useful for reproducing actions through the engine, but they also occur during Determination, Hypnosis, repeated actions and other choices. They do not uniquely identify a player's normal turn.

The log-driven builder counted completed turns at action-card cleanup and used the next state-20 owner to recognize continuation. The header reconstructed a per-player ordinal from that completed-turn counter, active seat, assumed alternation and whether an action was selected. Graph samples and key events independently used `ceil(state.turn / 2)`. Those consumers could disagree even when the underlying action replay was otherwise correct.

The audit reproduced three concrete failures:

- Game **930258897**, normal turn beginning at move **115**: Hypnosis puts back an opponent-owned Association card for an X-token without a `chooseActionCard` notification. Cleanup identifies the physical card owner. The old builder treated the subsequent normal turn as continuation and missed one completed turn. Its final completed-turn count was **64 instead of 65**; skälding's actual turn **33** appeared as **32**.
- Game **902906029**, move **19**: Papa Emeritus V acquires a university during normal turn **2**. The header displayed 2, but the key-event graph assigned it to **Turn 1**. First-turn changes could also overwrite the graph's Start point. Repeated overwriting of completed-turn buckets admitted effects from the next turn.
- Game **937181556**: portgard starts turn **30** at move **395**, acts at 396–398, then the opponent concedes at 399. There are **60 started turns**, although only **59 complete**. This distinction must be preserved. The final started turn must survive without a cleanup.

The internal, currently undisplayed results-statistics `turns` field also counted action cleanups. Its old rule disagreed with 16 of the 34 independent player counts, totaling 1,070 instead of 1,052.

### Implemented lifecycle

`src/ark_nova/parser/turns.py` introduces a separate normal-turn timeline. The source is the structured backend event stream, before `parse_log` drops state notifications and state-only moves.

- A normal turn starts at **state 7**, with the normalized `active_player` as owner. Its per-player ordinal increments immediately.
- State 20, action choice, action cleanup, state 93, extra actions, temporary opponent decisions and borrowed action-card ownership do not create normal turns.
- `endOfGame` is a trigger and leaves the current turn and remaining normal turns intact.
- The next accepted state 7 closes the outgoing interval immediately before the incoming start.
- **State 10 / `startBreak`** enter one neutral Break phase. `finishBreak` leaves that phase without inventing a turn.
- **State 98** enters neutral final scoring. **State 99** and `playerConcedeGame` enter terminal phase. Concession administration and subsequent events have no normal-turn owner.
- The interval is `[start_event, closing_event)`. End move means the last accepted in-turn event, including refill/Wave effects before handover. It is not computed as `next_move - 1`.
- A started turn remains present if interrupted or if the file stops. A file stopping without a closing boundary is recorded in internal diagnostics rather than described as completed.
- Player IDs normalize to strings. Public state order takes precedence over earlier private copies. Private-only lifecycle evidence is retained and diagnosed; equivalent private lifecycle representations are reconciled.
- Duplicate event representations and repeated state-7 transitions for the same backend move/owner are absorbed. Genuine subsequent starts for that owner in later moves remain countable. Break/scoring/terminal guards prevent stale copies reopening consumed phases.
- Private draw/discard/store/unstore twins are associated with the corresponding public causal event for UI ownership. Private selector arguments do not make a following public Break line belong to the outgoing turn.

The existing state-20 `ParsedLog.turn_markers` and engine action segmentation retain their purpose. No global replacement of state 20 with state 7 was made.

### Builder and replay-view changes

`src/ark_nova/parser/model.py` carries the timeline as `ParsedLog.normal_turns`; `src/ark_nova/parser/log.py` populates it alongside existing parser outputs.

`src/ark_nova/replay/builder.py` now records state snapshots immediately before accepted lifecycle boundaries. These supply graph endpoints before Break income, concession administration or final scoring. Cleanup can consult the normal-turn owner independently of the physical owner of a Hypnosis card. This fixes the missing completed turn in 930258897.

The rules engine's own completed-turn counter, rules, serialization, action legality and normal action-marker segmentation were not redesigned. The intentional 59-completed/60-started distinction in 937181556 remains.

`src/ark_nova/replay/view.py` adds replay metadata:

| Field | Meaning |
|---|---|
| `state.turn_context.phase` | setup, turn, break, between_turns, scoring or terminal |
| `state.turn_context.index` | Global normal-start index, or null in neutral phases |
| `state.turn_context.seat` | Normal-turn owner, or null in neutral phases |
| `state.turn_context.number` | Owner's per-player ordinal, or null in neutral phases |
| `state.turn_context.display` | Header number; retains the last ordinal during neutral phases |
| `state.turn_context.counts` | Started-turn counts in seat order |
| `normal_turns` | Ordered rows containing index, seat, number, start/end moves and endpoint metrics for both players |
| `turn_start` | Metrics immediately before the first normal start, used for the graph's Start point |

Endpoint metrics cover score, appeal, conservation, reputation, money and X-tokens. These are additive replay fields, not a change to another project's `turn_history` schema.

Normal starts get explicit replay entries such as “Papa Emeritus V starts turn 2”, including starts in otherwise state-only moves. Their board state precedes action selection; they are informational entries and do not expose a synthetic fork position. Existing engine-backed fork positions remain attached to their engine states. Display folding does not merge normal actions across different turn contexts. New entries change numeric replay-step indices; old numeric URL fragments are not stable bookmarks to the same event after this update.

Partial views used by mini games cap the timeline at the selected event range. They do not publish future normal-start counts. The current view inherits accumulated sponsor/variant statistics across the inserted informational starts.

### Frontend behavior

`web/js/side-panel.js` reads the explicit ordinal for BGA replays. It shows 0 during setup and counts at the normal start, before action selection. Breaks and terminal/scoring phases retain the last displayed number while metadata identifies them as neutral. Live games, fork/sandbox engine positions and older archived payloads keep the existing compatibility path. The header tooltip describes the new counting rule.

`web/js/results.js` uses actual endpoint samples for all six numeric graph categories. The paired-player presentation remains: **Turn n** uses the last normal-turn endpoint numbered n, after both players' nth turns where both exist. This is a paired comparison, not a separate x-coordinate for every global player turn. Start is sampled before the first turn; final scoring remains a separate End column. No later in-progress turn can overwrite an earlier numbered point.

Key events use the containing normal turn's ordinal, including extra actions and temporary opponent choices. Break choices are neutral and appear between numbered columns. Their half-step position is a display convention on the paired axis; it is not a manufactured player turn. Setup and final/terminal administration are not attributed to normal-turn key-event columns.

The internal results-statistics turn counts and first-player identity use the normal-turn rows when available, rather than inferring first player from the first card chosen. Existing action counts and X-back statistics were not otherwise redesigned.

### Files changed

- `src/ark_nova/parser/turns.py` — new normal-turn timeline and reconciliation.
- `src/ark_nova/parser/model.py` — timeline field beside action-selection markers.
- `src/ark_nova/parser/log.py` — construct the lifecycle before dropping state noise.
- `src/ark_nova/replay/builder.py` — boundary snapshots and correct Hypnosis cleanup actor.
- `src/ark_nova/replay/view.py` — explicit starts, metadata, graph endpoints and phase-safe folding.
- `web/js/side-panel.js` — header source and explanatory tooltip.
- `web/js/results.js` — graph samples, event attribution and internal turn totals.
- `tests/test_turn_history.py` — real-fixture and synthetic lifecycle regressions.
- `changelog_oct25.md` — this change record, as requested.

### Validation

The new fixture tests compare all **17 specified games / 34 player records / 1,052 started turns** with the independent post-game counts: **zero discrepancies**. Expected counts are fixed test data and are never used to repair production output.

All six specified endpoint projections pass:

| Game | Start move | Last in-turn move | Closing boundary |
|---|---:|---:|---|
| 902906029 | 275 | 287 | Next normal start at 288 |
| 927726814 | 399 | 408 | Refill precedes next start within 408 |
| 930258897 | 493 | 523 | Borrowed cleanup/refill precede next start within 523 |
| 714192218 | 36 | 40 | Break entry at 41 |
| 920295323 | 402 | 408 | Refill precedes Break entry within 408 |
| 937181556 | 395 | 398 | Neutral concession at 399 |

Synthetic coverage includes chained extra actions (including synthetic double Determination), temporary opponent decisions, borrowed-card cleanup, no card selection, immediate concession, own/opponent concession, concession during Break, shared-move effects before concession, repeated/private/late starts, subsequent genuine starts by the same owner, end trigger versus scoring, incomplete logs, and private selector arguments preceding public Break entry.

Full production replay views were generated for 902906029, 930258897, 937181556 and 920295323. Assertions against the actual JavaScript functions check the header contexts, all six graph categories against endpoint samples, the university event on turn 2, skälding's turn 33, and the neutral concession with retained display 30.

Final validation results:

- **40 focused tests passed** in `tests/test_turn_history.py`, including all 34 independent player counts, the six real boundary fixtures, lifecycle edge cases, actual builder/view behavior, setup-only serialization and mini-game payload isolation.
- **116 compatibility tests passed, 26 skipped, 1 deselected** across the focused tests plus parser, replay builder, setup replay, archived-record replay, API, fork and previous problem regressions. The 26 skips are unavailable historical fixtures. This run preceded the final four additional focused serialization/mini-game cases; those four pass in the final 40-test run.
- The deselected existing test is `tests/test_api.py::test_verify_rejects_wrong_table_and_garbage`: it expects HTTP 422 for an unindexed `/api/tables/999/verify`, whereas the route returns 404. A separate run against a source copy with the original parser/builder/view restored also returns **404**. This unrelated route behavior was preserved.
- An initial archived-record test could not create pytest's sandbox temporary directory. Rerunning with `--basetemp` under the writable Codex workspace resolves the environment error; the archived-record test passes, including its assertion that the reader never imports the engine.
- **3,073 JavaScript assertions passed** against the actual `race`, `keyEvents` and `turnNumber` functions using the four generated full replay views. All six numeric categories match their endpoint samples; the turn-2 university, turn-33 Hypnosis regression and neutral concession assertions pass.
- Both Daily Hand seats and a real mid-game Who's Ahead public position pass the existing leak guard. Neither mini-game publishes `normal_turns` or `turn_start`; the per-state context contains seat numbers/counts and no player IDs. The Daily Hand answer/selection contract also remains correct. No mini-game production code required editing.
- Browser replay validation at **1600 × 900** confirms the university event with **Round 1 / Turn 2**, final **Turn 31**, the key-event graph and all six numeric graphs. All render without console errors/warnings or NaN/Infinity chart geometry. Screenshots are retained outside the project.
- A fresh **700 × 900** load retains the correct DOM turn number. The existing narrow viewer layout remains awkward; no responsive CSS was changed and a mobile-layout improvement is not claimed.
- The existing localhost backend retained an older imported Python/replay cache. Browser checks therefore loaded a full replay generated by the changed backend through a temporary static fetch fixture, using the actual current viewer modules. The temporary HTML/JSON were removed from `web/` afterwards. This verifies rendering against the new payload; it is not a claim that the old running server had reloaded the backend. New API/fork behavior is covered by the automated compatibility tests. The old server's fork page remained waiting on its API request; only the sandbox lobby was browser-smoke-tested.

To repeat the focused regressions from the project root:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_turn_history.py -q
```

For the compatibility run, include `test_parser.py`, `test_replay_builder.py`, `test_setup_replay.py`, `test_record_replay.py`, `test_api.py`, `test_fork.py` and `test_problem_fixes.py`, excluding the known API expectation above. Set `ARK_WORKERS=2` to limit parallel log workers. Under a restricted filesystem, point pytest's `--basetemp` at a writable scratch directory.


### Limits and operational notes

- No identified raw fixture specifically proves double unrestricted Determination or Determination on Silver Lake. Chained lifecycle coverage for these is synthetic; no map-specific splitting rule was introduced.
- No new signature for rollback across completed normal turns was invented. The extractor uses the surviving events supplied by the existing parser; BGA undo-checkpoint notifications alone do not undo turn starts. Archived live games retain their existing effective-history reader.
- Public state 7 exists for all starts in the supplied corpus. Private-only lifecycle handling is defensive and diagnosed; it is not described as independently validated by the 34 post-game totals.
- Replays already cached by a running local Python server require that server to reload/restart. Frontend-only refresh cannot update its imported Python or an older in-memory replay payload.
- Verification artifacts and original-source backups are outside the project in the Codex workspace. No deployment was performed as part of this implementation.

## 2. Duplicate Break completions and structured graph markers

### Scope and reason

The Break review compared the exact frozen appendix in `02_breakpoint_review_spec.md` with 18 raw games. Existing boundaries already matched **88 starts, 88 finishes, 17 end-game trigger recipients and 18 raw endpoints**. Same-move Break starts/finishes, crossing during a Break, crossing during Hypnosis and concession were correct. The rule for when a Break actually starts or ends was retained.

A synthetic resend exposed an inconsistency: the normal-turn timeline absorbed a repeated `finishBreak`, but the main parser retained it and the replay builder advanced the round twice. One completed Break could change Round 1 to Round 3. Separately, graph markers still depended on English rendered labels even though structured events and player IDs were available.

### Shared boundary reconciliation

New `src/ark_nova/parser/breaks.py` supplies `accepted_break_orders`, used by both the main parser and the normal-turn timeline.

- A dedicated notification is identified by **game, numeric move and boundary kind**. This reconciles private/public representations and resends with either the same or a new UID.
- Public representation takes precedence over an earlier private copy, preserving public causal event order.
- `startBreak` and `finishBreak` remain distinct on the same move. Similar notifications in later moves remain distinct, including reused UIDs.
- Without a usable move, packet/event provenance supplies the fallback identity. Reusing a UID in a different packet does not collapse every unknown-move boundary together.
- The raw order counter still advances for every event, including excluded copies. Existing event-order references and state-20 action segmentation retain their meaning.

`src/ark_nova/parser/log.py` excludes redundant dedicated Break notifications before the builder sees them. Consequently, `h_finish_break` runs once and resets the Break track / advances the round once. No engine rule or serialized engine state needed changing.

`src/ark_nova/parser/turns.py` uses the same acceptance set. It also absorbs a late repeated state-10 corroboration from a resolved Break, preventing that copy from reopening the Break over a later normal turn. Private-only dedicated boundaries use the shared acceptance decision and produce internal diagnostics; public-only evidence remains sufficient in the verified corpus.

This change reconciles dedicated Break boundaries. It is not a general rewrite of all ordinary gameplay-event duplication or rollback handling. No new rollback-event signature, guessed Break completion, crossing detector or literal-lastmove output was introduced.

### Structured graph metadata

`src/ark_nova/replay/view.py` now adds `break_markers` to BGA replay JSON:

```json
[
  {"start_move": 65, "end_move": 67, "turn": 7.5, "seat": 1}
]
```

- `start_move` comes from the accepted `startBreak` event.
- `end_move` comes from the accepted `finishBreak`; it remains null when completion is absent. Same-move start/end values are valid.
- `turn` preserves the existing half-column position on the paired-player graph axis. It is a display coordinate, not a new normal turn or exact global player-turn index.
- `seat` is the **triggering player's colour**, taken from the structured `getBonuses` event whose `args.source` is `triggering break`, with identity from `args.player_id`. Unknown identity remains null/neutral-coloured. This does not assign ownership of the Break to a normal turn.

Marker generation uses accepted events, independently of translated, rewritten or combined display labels. It scans the selected replay range, so partial replay views do not append future boundaries. The existing mini-game payload builders explicitly whitelist their public replay fields and omit this full-history metadata.

`web/js/results.js` uses the structured array for coffee markers and their colours. An explicitly empty array means no markers. Older payloads with no array retain the previous text-based compatibility fallback, allowing the frontend to load while a backend is still serving its older format.

The raw results-statistics reader also ignores repeated start/end notifications when updating its `inBreak` flag. A late old completion therefore cannot end the reader's next Break prematurely, and a late old start cannot classify subsequent ordinary-action money as Break income. Numeric aliases such as `3` and `03` resolve to the same notification move.

### Money-graph behavior — clarification, no sampling change

The graph shows **money balance at sampled points**, rather than assigning each individual income reward to a player turn.

The existing paired axis is preserved: Turn n uses the last normal-turn endpoint numbered n, after both players' nth turns where both exist. Break income enters the first sampled balance after it is paid:

- After both players finish turn n, income normally first appears in the Turn n+1 column.
- Between the two players' nth turns, it can already appear in Turn n through the second player's endpoint.
- When a final Break leads directly to scoring with no further normal turn, its money appears in End.

Any spending before that endpoint also affects the displayed balance. The Break itself remains neutral. This fix does not introduce a separate Break-income graph column or change the numeric graph samples.

### Files changed in this follow-up

- `src/ark_nova/parser/breaks.py` — new shared notification acceptance helper.
- `src/ark_nova/parser/log.py` — remove redundant dedicated boundary copies before replay processing.
- `src/ark_nova/parser/turns.py` — share acceptance and guard late state-10 copies / private-only fallbacks.
- `src/ark_nova/replay/view.py` — publish structured graph markers.
- `web/js/results.js` — use marker metadata and protect raw statistics' Break-phase flag.
- `tests/test_break_markers.py` — new frozen-corpus, duplicate, phase, partial and view regressions.
- `tests/test_break_markers.cjs` — actual frontend-function tests using Node's built-in assertions, with no npm/build dependency.
- `tests/test_turn_history.py` — extend the existing mini-game isolation assertion to `break_markers`.
- `changelog_oct25.md` — this record and the money-sampling explanation.

### Validation and limits

- **78 tests passed** across `test_break_markers.py`, `test_turn_history.py` and `test_parser.py`. This includes all 18 frozen breakpoint fixtures and all 34 independently validated player turn counts.
- **14 replay-builder and fork tests passed**, including the available raw-log oracle checks. The existing Starlette dependency deprecation warning is unrelated.
- The duplicate completion regression verifies Round 1 to Round 2 rather than Round 3, with both identical and fresh-UID resends.
- Synthetic cases cover private/public ordering, private-only boundaries, late state-10 copies, same-move starts/finishes, later genuine Breaks with reused UIDs, missing-move provenance, and interrupted Breaks with no invented finish.
- Actual frontend-function tests verify structured markers despite misleading/changed labels, explicit empty metadata, legacy fallback, late duplicate income-phase notifications, the three money-sampling cases above, and unchanged numeric samples in all six graph categories.
- A freshly generated replay payload for 902906029 contains all five expected start/end pairs, display coordinates and trigger seats. Its generation uses the log-driven replay path; no full engine rerun is claimed for that browser fixture.
- A live browser check was attempted, but `127.0.0.1:8000` refused the connection because no local server was listening. The temporary HTML/JSON fixture was removed from `web/` and retained only in the external Codex validation workspace. Live-browser rendering of this follow-up is therefore not claimed.
- The focused deduplication behavior is synthetically verified. The 18 real fixtures contain the already-correct dedicated markers; they do not establish real-world rollback, quit/disconnect or concession-during-Break examples.
- Restart the local Python backend before checking the new metadata in the app. No deployment was performed.

## 3. Duplicate Break advancements and triggering rewards in post-game statistics

### Problem and retained calculation

The follow-up review of `02_break_history_review_spec.md` confirmed that the existing aggregate rules were correct for all 19 supplied raw games. All 38 player totals matched the independent frozen CSV: 307 advancement executions contributed 922 advancement points, with 93 genuine Break triggers. The physical marker travelled only 874 spaces. The statistic intentionally sums each resolved `advanceBreak.args.n`, including overshoot and effects executed while already capped, rather than capped physical displacement.

The audit nevertheless reproduced a resend bug in `countStats`: repeating a public advancement notification or its triggering reward counted that notification again. In an in-memory copy of game 902906029, repeating move 234's advancement increased Propaganda Panda's total from 33 to 38. Repeating move 230's triggering reward increased the Break count from 4 to 5 and also duplicated its X-token gain. These duplicates are synthetic regressions; the 19 real fixtures do not contain the offending repeated advancement notifications.

### Implementation and identity

`web/js/results.js` now keeps a local set of accepted Break-effect identities during each `countStats` call. The guard applies specifically to `advanceBreak` and to `getBonuses` with structured source `triggering break`, before either notification changes a statistic.

- An event with a nonempty UID is identified by public channel, numeric move, event type and string-normalized UID. A late copy carrying its original move is ignored. Numeric/string UID forms, including zero, agree.
- Without a UID, the fallback is public channel, numeric move, event type, packet ID and event offset. This absorbs a repeated packet while preserving separate executions at different offsets or in different packets.
- With neither usable UID nor packet ID, the event remains counted. The reader does not invent an identity by comparing amount, result, actor or rendered text.
- Distinct UIDs at the same move remain distinct, even for equal-valued effects at the cap. Reusing a UID on a later move also remains distinct. The set is local to one statistics calculation and is not shared between games or calls.
- An identified duplicate triggering reward is skipped as a whole notification. This keeps both `breaks` and the reward's X-token contribution unchanged; any other resources contained in that same duplicate reward are likewise not applied twice.

Advancement amount and actor still come directly from `args.n` and normalized `args.player_id`. Hypnosis card ownership and cleanup do not override that actor. Public/private copies still resolve through the existing public-channel-only statistics reader. The second genuine Sponsors execution after a cap remains included without inventing another trigger.

This is a focused frontend statistics safeguard. It does not add the other project's six-field `break_history`, classify advancements by cause, change replay samples or marker geometry, change the parser/engine/round lifecycle, or introduce a new rollback protocol. Ordinary bonus notifications outside `source = triggering break` retain their existing processing.

### Regression coverage and results

`tests/test_break_markers.cjs` extends the existing actual-function test runner; the existing pytest frontend contract test invokes it automatically. No framework, npm dependency or build step was introduced.

- **19 synthetic Break-effect identity cases passed:** same-packet and cross-packet resends, late copies with numeric move aliases, later genuine executions with reused UIDs, equal capped effects with different UIDs, channel/type scoping, public/private copies, repeated triggering rewards and their X-token effect, zero UIDs, packet/offset fallbacks, missing identity, unrelated reward scope, and Hypnosis actor attribution.
- Frozen expected advancement totals and trigger counts were summed from the review spec's independent Appendix 20 CSV at authoring time, then embedded in the test runner. All **19 games / 38 player totals passed: 922 advancement points and 93 triggers**. The tests do not derive expectations from `countStats`.
- A real-fixture regression inserts copies of the affected notifications into game 902906029 in memory and checks that the entire statistics result equals the untouched game's result. Source fixtures are never modified.
- **78 pytest tests passed** across `tests/test_break_markers.py`, `tests/test_turn_history.py` and `tests/test_parser.py` (29.38 seconds), including the expanded Node contract runner. The existing graph-marker, compatibility-fallback, Break-phase money classification and six graph-sampling checks also passed.
- Node syntax checking passed for `web/js/results.js`.

Reproduce from the project root:

```powershell
node tests/test_break_markers.cjs
.\.venv\Scripts\python.exe -m pytest tests/test_break_markers.py tests/test_turn_history.py tests/test_parser.py -q -p no:cacheprovider
```

### Scope and validation limits

Only `web/js/results.js`, `tests/test_break_markers.cjs` and this changelog changed. Original-file backups are outside the project in the Codex workspace. There is no visual or CSS change. A local listening-port check found no server on port 8000, so live-browser replay/fork/sandbox validation was unavailable; no browser rendering check is claimed for this follow-up. The tests execute the current production statistics and graph functions directly.

Resends that receive entirely new UIDs cannot safely be equated to an earlier effect from equal public values alone. Missing identity is preserved rather than guessed. Private-only advancement handling, arbitrary rollback/replay reconciliation and position-derived fallback when a trigger reward is absent remain outside this fix. Trigger detection continues to use the structured reward, which matches all 93 real baseline transitions. No deployment was performed.

## 4. Sponsor hover benefit tracking: S201-S230 (2026-10-27)

### Requested behavior

The enlarged sponsor-card hover panel now includes the additional statistics requested for S201-S230. Totals belong to the selected replay position; future rewards are not credited in advance. The existing replay-only visibility rules remain: these historical benefit panels are not offered as historical totals in live play, forks, sandbox or minigames.

| Sponsor | Added information |
| --- | --- |
| S201 Science Lab | Cards gained from the deck or reputation-range display, on play and during break income; actual final-scoring conservation. |
| S203 Veterinarian | `Effect used`: each conservation support made with an Association action of effective strength exactly 4. |
| S206 Medical Breakthrough | Immediate appeal and cumulative conservation income. |
| S207 Basic Research | Conservation awarded to the sponsor's owner, excluding the opponent's money payment. |
| S209 Technology Institute | Actual final-scoring conservation, alongside its X-token total. |
| S210 Expert on the Americas | Immediate appeal and actual final-scoring conservation, alongside kiosks gained. |
| S211 Expert on Europe | Immediate appeal and actual final-scoring conservation, alongside size-1 enclosures gained. |
| S212 Expert on Australia | Immediate appeal, alongside pouches. |
| S213 Expert on Asia | Immediate appeal, alongside pavilions. |
| S214 Expert on Africa | Two separate resource rows: `Immediate appeal` and `Final-scoring appeal`, alongside Clever activations. |
| S215 Breeding Cooperation | Sponsor tokens spent and actual final-scoring conservation. |
| S216 Talented Communicator | Actual final-scoring conservation. |
| S218 Breeding Program | Sponsor tokens spent and actual final-scoring conservation. |
| S219 Diversity Researcher | Water/rock spaces newly built over and water/rock requirements actually bypassed, in separate counters. |
| S220 Federal Grants | One cumulative money total, including the payment on play and subsequent break income. |
| S221 Archaeologist | A breakdown of extra placement bonuses: resource amounts or bonus counts, with strength-labelled abilities distinguished (one Scavenging 3 bonus is not three activations). |
| S222 Release of Patents | Conservation awarded to the owner, excluding the opponent's money payment. |
| S224 Migration Recording | Its initial X-token as well as the existing conservation total. |
| S225 Quarantine Lab | Actual final-scoring conservation and confirmed attacks prevented, with BGA's self-protection bug filtered. |
| S226 Foreign Institute | Actual final-scoring conservation. |
| S229 Expert in Small Animals | Immediate appeal, alongside the savings counter. |
| S230 Expert in Large Animals | Immediate appeal, alongside the savings counter. |

### Attribution and replay timing

`replay/sponsor_stats.py` centralizes the eligible sponsors, resource policies, card ownership and per-action context. Logged resources use the structured sponsor card ID where available, with existing name/source matching as fallback. Basic Research and Release of Patents only credit conservation to the sponsor's owner, not rewards received by opponents. Explicit final-only resources require the scoring phase of the normal-turn timeline. Expert on Africa's two appeal categories use that same phase distinction.

Science Lab and Archaeologist are identified directly from BGA's raw `gameStateChange.args.args.sourceId`:

- State 27 with `S201_ScienceLab` identifies a card-taking choice. The counter increments on its actual retained draw/take outcome, including display cards; entering the choice state alone gives no credit.
- State 91 with `S221_Archeologist` identifies an extra placement-bonus choice. Its source-less `takeBonus` supplies `bonus_type` and `bonus_n`. Ordinary placement rewards and 5/8-conservation choices are not blindly assigned to Archaeologist. The resulting resource notification is not counted again as a second bonus.
- Public state transitions are authoritative. Private snapshots often announce the next state before the public outcome is logged; allowing those private snapshots to clear the source would lose real outcomes.
- Source hints refer to the parser's retained notification orders, so a public/private draw twin does not count twice or consume the choice before its retained counterpart.
- These two new counters do not depend on successful rules-engine reconstruction. Source information is read from the original raw stream, before state notifications are discarded as replay noise. If a source cannot be established, unrelated gains are not guessed to belong to these cards.

Veterinarian uses the selected Association action's outer `strength`, which already includes X-tokens and strength modifiers. It does not add paid X-tokens again, and does not use `slideMeeples.args.strength`: that field can still say 5 for the conservation worker space when the actual action had strength 4. The counter is scoped to the actual player's Association action and is cleared when that action finishes. Verified examples include base strength 3 plus one X-token counting as strength 4, and strength 4 plus one X-token counting as 5 and therefore not using Veterinarian.

Breeding counters count matching meeples actually removed from the relevant sponsor, rather than using the notification's combined `n`. Identified already-spent tokens do not increment again on a duplicate. Tokens lacking IDs are not conflated with each other. The animal-expert savings tracker also stops after an expert is sent away on an expedition; game 795215166 contains a real removal followed by a small-animal play that must not receive a further discount credit.

For Expert on Europe, the panel uses conservation actually awarded by BGA. The existing scoring rule was retained and regression-tested: on Outdoor Areas, a standard size-1 enclosure next to the gate has effective size 3 and does not contribute to the five occupied size-1 enclosures needed for its point.

### Diversity Researcher geometry

Placement observations use the log-built board immediately before the relevant effect group, independent of rules-engine coverage. The board/map geometry, building type, position and rotation determine newly covered water and rock spaces. Already covered cells are excluded. Unknown map geometry is not guessed.

A requirement counter increments once per actually unmet terrain requirement type on the selected animal enclosure or sponsor-building placement. It does not count every printed terrain icon, or each missing adjacent hex separately. Requirements already satisfied at the chosen placement do not count as bypassed. Flock plays without a selected enclosure do not create a bypass. Water beneath an Underwater Tunnel continues to count as water for animal requirements; placing the tunnel on water is its native permission, not a Diversity Researcher terrain benefit. Terrain Build's independent one-use terrain permission is taken into account before attributing a terrain placement to this sponsor. A normal aquarium's inherent water-placement requirement is also checked.

### Quarantine Lab notifications and BGA bug

`parser/sponsor_messages.py` selectively recognizes the explicit `midmessage` template:

```text
${player_name} is not affected by <Venom|Constriction|Hypnosis|Pilfering> thanks to their Quarantine Lab sponsor card
```

The parser previously discarded all `midmessage` events as noise, including these real protection records. Recognized protection records are now retained, while unrelated informational messages remain noise. The replay builder treats them as informational; action reconstruction treats them as passive consequences. The game rules themselves are unchanged.

Identified duplicate protection copies are reconciled before parsing: identity includes table, backend move, type and UID, with public copies preferred. Distinct UIDs at the same move and reused UIDs at later moves remain distinct. Without a UID, packet/channel/position provenance is used; equal text alone is not an identity.

The protected player comes from `args.player_id`. A protection only increments when the Lab is in that player's zoo and the actual acting/ability-owner context belongs to an opposing player. A later resource reward or free building does not overwrite that actor context. This filters BGA's incorrect message when the Lab owner plays their own aggressive animal.

Concrete regressions:

- Game 760993552: Breeding Program is played at 169, tokens spent at 262 and 377, and 1 conservation awarded at 462. Quarantine Lab prevents Constriction at the explicit message at 415: the counter is 0 before it and 1 afterward.
- User-supplied 800983534: reject the Pilfering self-protection message at 350 after Rust_'s own Barbary Macaque; accept the Constriction protection at 520 caused by jinxiaozi114's Boa Constrictor played at 516. The intervening kiosk from Expert on the Americas does not change the attack owner. This file is an optional external regression fixture; its raw contents were not copied into the repository.
- All four ability names are covered synthetically using the template confirmed by the user. Real explicit Constriction notifications and the false Pilfering notification are present in the supplied logs; separate real positive Venom, Hypnosis and Pilfering examples are not claimed.

### Frontend and files

`web/js/sponsor-stats.js` describes resource rows, the two Expert on Africa appeal rows, new counters, and Archaeologist's dynamic bonus breakdown. `cards.js` renders those descriptors through the existing preview panel. Zero rows remain hidden and an eligible card without recorded benefits still says `nothing yet`. Historical rows for later sponsors are retained; additional income-only cards outside the requested S201-S230 scope are not enabled by this change.

Changed/added implementation files:

- `src/ark_nova/parser/sponsor_messages.py` (new): targeted protection recognition and identity handling.
- `src/ark_nova/parser/log.py`: retain accepted protection notifications before the noise filter.
- `src/ark_nova/replay/sponsor_stats.py` (new): resource/counter policies, raw source provenance, ownership/action context and geometry attribution.
- `src/ark_nova/replay/view.py`: integrate event-ordered sponsor observations into each replay snapshot and publish the expanded tracked-card list.
- `src/ark_nova/replay/actions.py`, `builder.py`: accept retained informational protection messages without inventing game actions or state changes.
- `web/js/sponsor-stats.js` (new), `web/js/cards.js`: expanded hover rows.
- `tests/test_sponsor_stats.py`, `tests/test_sponsor_stats.cjs` (new): focused attribution, timing, real-log totals, duplicate handling, BGA bug and frontend-row regressions.
- `changelog_oct25.md`: this record.

Original-file backups are outside the project under the Codex workspace's `outputs/sponsor-stats-oct27/before/`. No extension files, original logs, card data or deployment configuration were changed. The existing backend code-version mechanism invalidates replay caches after the updated Python code is loaded; restart the backend and reload the replay when reviewing locally.

### Validation results and limits

- **140 tests passed** in the final focused run (124.78 seconds), covering `test_sponsor_stats.py`, `test_parser.py`, `test_turn_history.py`, `test_break_markers.py` and `test_replay_builder.py`. The sponsor module contributes 59 cases, including frozen real-log totals, full generated replay snapshots and the optional attached BGA bug fixture. The replay-builder suite checks all 20 local logs for unhandled events and oracle mismatches.
- Direct Science Lab attribution matches all four local games containing it: 770429314 = 3 cards, 902906029 = 5, 920295323 = 5, 927683584 = 4. The raw-source path includes a draw missed by the earlier engine-only prototype; that prototype was replaced and is not part of the final implementation.
- Archaeologist attribution yields 3 Shark Attack bonuses in 927683584, and 2 Clever bonuses plus 5 money in 930781276. The tests check that a bonus is not credited before its actual choice, allowing for the viewer's existing folding of related backend moves into a later displayed snapshot.
- Frozen checks cover the requested resource totals across the example games, including Federal Grants' 15 money in 791369985, Expert on Africa's separate 1 immediate / 3 final appeal in 795215166, the breeding-token examples and Veterinarian's 3 counted uses in 927683584.
- The actual production frontend row function passes the Node contract checks, including zero-row suppression, all prior counter labels, resource icons, separate appeal rows, new counters and strength-labelled bonus descriptions. Node syntax checks pass for `cards.js` and `sponsor-stats.js`; the new Python sources parse successfully.
- An exploratory run also included the existing `test_endgame.py::test_final_scores_match_the_logs`. Its minimum-corpus assertion requires at least 95 qualifying logs; this folder contains 20 logs, of which 19 qualify. That test therefore cannot pass with this local corpus. Its threshold and game rules were not changed to mask the limitation.
- Full live hover rendering was attempted through the browser, but local test URLs returned connection-refused/timed-out errors. No successful live-browser visual check is claimed. Temporary local servers were stopped.
- The source-specific counters require the corresponding BGA public state provenance. Missing/unsupported source states are not replaced by guessed attribution to unrelated draws or bonuses. No rules-engine success is required for the new Science Lab or Archaeologist counters; existing engine-derived counters for other sponsors retain their previous coverage limits.
- No deployment was performed.

Reproduce the final focused checks from the project root (with Node on PATH for the frontend contract runners):

```powershell
$env:ARK_WORKERS = '2'
.\.venv\Scripts\python.exe -m pytest tests/test_sponsor_stats.py tests/test_parser.py tests/test_turn_history.py tests/test_break_markers.py tests/test_replay_builder.py -q -p no:cacheprovider
node tests/test_sponsor_stats.cjs
node --check web/js/cards.js
node --check web/js/sponsor-stats.js
```


## 5. Remaining sponsor hover statistics (S231-S281; 2026-10-27)

### Request and scope

Implemented the next approved set of replay-only sponsor hover statistics. The review used all 20 JSON games in `log_examples/` plus the supplied Desktop logs `800983534.txt` and `669734230.txt`. The user confirmed that Sponsorship: Reptiles shares the other Sponsorship cards' notification mechanism, Free-range New World Monkeys shares the immediate-appeal/final-conservation mechanism, and the missing positive conservation awards use the same structured final-reward mechanism. No further logs were required for implementation. Those missing real examples are covered by synthetic regressions rather than claimed as observed real awards.

Game rules, original logs, card definitions, extension code, unrelated replay features and deployment configuration were not changed. Backups of existing edited files are outside the project at `C:/Users/ascri/Documents/Codex/2026-10-11/ple/outputs/sponsor-rest-implementation/before/`.

### Displayed statistics by sponsor

| Sponsor | Result |
| --- | --- |
| S231-S235, Sponsorship: Primates/Reptiles/Vultures/Lions/Elephants | Immediate appeal and cumulative named money income. |
| S249, Barred Owl Hut | Existing counter and detection retained; label changed from `Bird icons played` to `Perceptions`. |
| S253, Okapi Stable | Cubes actually spent, using `tokens_spent`; matching token meeples on this card are counted individually and identified duplicates ignored. |
| S257, Side Entrance | Cumulative money income and separate final-scoring appeal. |
| S258-S260, Native Seabirds/Lizards/Farm Animals | Immediate appeal and final-scoring conservation. |
| S261, Guided School Tours | Final-scoring conservation only; immediate appeal and immediate conservation are excluded. |
| S264, Free-range New World Monkeys | Immediate appeal and final-scoring conservation. |
| S265, Franchise Business | Cumulative money income, explicitly displaying zero, plus final-scoring conservation. No kiosk-gained row is introduced. |
| S267, Farm Cat | Immediate appeal and final-scoring conservation. |
| S268, Conference on Europe | Adds `Animals marked`, attributed to this sponsor rather than every marking effect while the card is in play. Existing named rewards remain. |
| S269, Conference on Australia | Separates `Occupied-enclosure appeal` from `Final-scoring appeal`; existing enlargement counter retained. |
| S270, Marine Research Expedition | Keeps conservation; removes the redundant `Expeditions` row; labels the distinct counter `Scuba Dives`. |
| S271, Excavation Site | Breakdown of doubled placement bonuses and final-scoring conservation. The breakdown means the full doubled award: a printed 5-money bonus doubled is 10 money, not just the additional 5. |
| S272, Expansion Area | Enables tracking (removes its former explicit exclusion) and adds final-scoring conservation. |
| S273, Publications | Cumulative money actually saved on every donation while active. The existing donation count now counts all such donations, not only the immediate opportunity on playing the sponsor. |
| S274, Mascot Statue / Victory Column | Separates cumulative break-income appeal and final-scoring appeal, expressly excluding the initial 1 appeal. Both structured card-ID variants are supported. |
| S279, Underwater Tunnel | Separates immediate and final-scoring appeal. |
| S280, Reconstruction | Counts new optional kiosks and pavilions actually taken, plus final-scoring appeal; repositioned buildings and skipped opportunities do not count. |
| S281, Arcade | Cumulative money income and final-scoring appeal; initial appeal is excluded from that final row. |

Newly requested income/immediate/endgame cards are included in the replay's `tracked_sponsors` metadata, so their panels are actually enabled. Unrequested cards without eligible effects remain disabled. Previously implemented S201-S230 statistics are preserved.

### Attribution and timing

`replay/sponsor_stats.py` retains explicit per-card resource policies. Final-only rewards require the normal-turn timeline's scoring phase. Structured card IDs take priority over names; this also handles BGA's `S274_VictoryColumn` versus the catalog's Mascot Statue name.

Appeal is stored under separate statistic keys where required:

- `appeal_initial` and `appeal_final`: Underwater Tunnel (and the existing Expert on Africa split).
- `appeal_enlargement` and `appeal_final`: Conference on Australia.
- `appeal_income` and `appeal_final`: Mascot Statue / Victory Column.
- `appeal_final`: Side Entrance, Reconstruction and Arcade.

For S274, the tracker consumes the initial 1 appeal after the card is played and only adds subsequent break income to `appeal_income`. This exclusion is necessary even if the card itself is played during a break; phase alone would confuse the immediate reward with income. The generic frontend renderer now accepts the sponsor key so only Franchise Business gets the explicit zero-money row; zero suppression for other cards is unchanged.

`replay/sponsor_sources.py` (new) reads public BGA source states and binds actual retained outcomes to their sponsors:

- State 103 with source `S268_ConferenceOnEurope`: counts the Animal entries of `markCard.args.cards`. Unrelated marks, skipped choices and non-Animal entries are excluded.
- State 30 with source `S280_Reconstruction`: counts actual `buyBuilding` outcomes of type kiosk or pavilion. `reconstructionPlaceBack` never counts as a new building.
- S270's source states 91/114: counts the retained draw/reveal once per Scuba Dive opportunity, including a dive that finds no sponsor. Selecting an opportunity or sending a person away does not create a Scuba Dive count.

Private state snapshots may announce the next state before the public outcome. They therefore do not replace the authoritative public source context. Attribution uses parser-retained outcome orders to avoid public/private twin counting; identified duplicates are scoped by table, move, notification type and UID. The tracker also requires the relevant sponsor to be active for the outcome's owner.

The old engine observers for S270 expeditions/Scuba and S273 immediate donations were removed, so they cannot double-count the new log/state observations. Other engine-derived counters, including Barred Owl Hut, retain their existing detection.

### Publications and Excavation Site

`replay/sponsor_stats.py:sponsor_state_gains` uses the log-built state before the effect group, not a successfully reconstructed rules-engine turn.

For Publications, it reads the science-icon total at each donation, including science universities and currently active cards. Savings are capped by the payable donation cost: game 833146203 has 3 science icons when the initial donation costs 2, so the actual saving is 2. Existing donation slots determine the base cost, including the 12-money overflow slot. X Association's independent rebate is excluded using a counterfactual cost with and without Publications. That rebate is only applicable to a donation from BGA's Association state 33; a sponsor's own donation during an Association action must not inherit it. Source state 33 is carried by `sponsor_source_hints`. Game state is never mutated by these observations.

For Excavation Site with a known map, the actual excavation building footprint identifies newly covered printed bonuses; the panel records those awarded bonuses twice at placement. This is a breakdown of the awarded placement bonuses, not all downstream benefits from universities, other sponsors or buildings subsequently taken. Covered cells are excluded, repositioning does not trigger it, and Reconstruction suppresses placement bonuses. Ability strength remains part of the label: Scavenging 3 twice means two `Scavenging 3 bonuses`, not six activations. The map-11 Worker bonus is labelled Extra Shift.

Unknown maps are not treated as the default map. They use a conservative fallback from explicit placement-source outcomes: named placement resources, university/partner tiles, Clever resolutions, card-taking outcomes and upgrades. Nested university rewards and other sponsors' money are excluded. Unsupported or ambiguous unknown-map bonuses are not guessed; this fallback cannot promise the full printed-bonus breakdown when the map/source information is absent. The supplied unknown-map Excavation example does have both explicit money awards and is fully counted.

### Concrete regression evidence

- Sponsorship: Lions in 930258897: 4 immediate appeal, then two payments of 6 money = 12 cumulative money. All five Sponsorship IDs share synthetic schema tests, including Reptiles.
- Okapi Stable in 853899676: 3 cubes at 301, 358, 464; in 927726814: 2 cubes.
- Side Entrance in 800999064: 32 money and 5 final appeal.
- Native Lizards in 927743770: 5 immediate appeal / 1 final conservation; Native Farm Animals: 6 immediate appeal / 2 final conservation.
- Guided School Tours: immediate conservation is excluded; 1 final conservation in 770429314 and 791369985.
- Franchise Business in 833146203: 0 money and 1 final conservation. Its opponent has no kiosk at the relevant break, validating the explicit zero rather than a missing parser event.
- Conference on Europe in 927726814: only 14, 55, 254 belong to this sponsor = 3 animals; other marks in the same game are excluded.
- Conference on Australia in 927683584: 8 enlargement appeal / 3 final appeal.
- Marine Research Expedition: 2 Scuba Dives in 714192218, 5 in 795215166; the latter also has 1 conservation from an actual expedition.
- Excavation Site: two genuine 5-money payments at 228 in 770429314 = 10 money; 798345117 covers the university and Clever spaces, giving 2 of each. Raw fallback and known-map geometry are never both added.
- Expansion Area in 798345117: 1 final conservation.
- Publications in 833146203: 17 money saved across 4 donations, with contemporaneous changing science counts and the initial cost cap.
- Victory Column in 833146203: initial 1 at 376 excluded; income 1 at 381; final 2 at 433. Synthetic cases cover both ID variants and playing during a break.
- Underwater Tunnel in 795215166: 2 immediate appeal / 5 final appeal.
- Reconstruction in 798345117: 1 kiosk at 416 and 1 pavilion at 417. In 760993552 both optional new buildings are declined; moved buildings do not count, and final appeal is 5.
- Arcade in 902906029: 12 cumulative money / 2 final appeal; initial 2 appeal is excluded.

### Files and validation

Implementation files: `replay/sponsor_stats.py`, new `replay/sponsor_sources.py`, `replay/view.py`, `replay/differential.py`, `web/js/sponsor-stats.js`, `web/js/cards.js`. Tests: extended `tests/test_sponsor_stats.py` and `.cjs`, new `tests/test_sponsor_stats_rest.py`. Documentation: this section of `changelog_oct25.md`.

Validation:

- The broad regression run passed **245 tests** in 184.68 seconds: both sponsor modules, parser, normal-turn history, break markers and replay builder. The replay-builder checks cover the 20 local example games.
- After adding the final Association-versus-sponsor donation-source guard and its extra regression, the final targeted run passed **161 tests** in 54.11 seconds. This includes the complete-replay integration checks for the new observations, the raw-log/frozen totals, source attribution, final/initial splits, zero income, donation cost caps and the production frontend row contract. Four previously passed S201-S230 full-replay tests were deselected for this targeted rerun; none failed.
- Standalone Node frontend contract checks pass. Both changed production JavaScript files pass Node syntax checks. All changed/new Python sources parse successfully.
- Full replay checks verify event timing and ensure source observations and existing engine counters do not double-count. They check both known-map Excavation geometry and the unknown-map money fallback.
- No successful live-browser visual verification is claimed for this change; frontend verification used the actual production row function through Node.
- There is no real played Reptiles/Free-range New World Monkeys example or positive Native Seabirds/Farm Cat/Excavation final conservation example in this corpus. The user's confirmation and shared structured-reward schema are covered by synthetic cases.

No deployment was performed. Restart the backend and reload the replay to review the changed cached replay payloads.

Reproduce the broad regression run from the project root (with Node on PATH):

```powershell
$env:ARK_WORKERS = '2'
.\.venv\Scripts\python.exe -m pytest tests/test_sponsor_stats.py tests/test_sponsor_stats_rest.py tests/test_parser.py tests/test_turn_history.py tests/test_break_markers.py tests/test_replay_builder.py -q -p no:cacheprovider
node tests/test_sponsor_stats.cjs
node --check web/js/cards.js
node --check web/js/sponsor-stats.js
```


## 6. Special action-card statistics and naming (2026-10-27)

### Requested changes and definitions

Added the two requested counters, corrected the two action-card names, and tightened the side-II Marketing count. Existing Ignore Animals and Clever Cards detection remains unchanged; its mechanism is documented below and now covered by focused engine-transition regressions.

- **+1 Build, side II**: adds `identical`, displayed as `Additional identical standard enclosures (side II)`. This counts each standard enclosure after the first of that same size in the current action. Thus size-2, size-2, size-1, size-1 gives 2 additional identical enclosures, not 4. The action's `placed` list provides the per-action history; buildings already in the zoo from earlier actions do not count. The existing extra-strength counter remains separate, and a placement can increment both when it uses both benefits.
- **+1 Build source isolation**: both counters apply only to the action's ordinary `build_place` placements. Engineer repeats (`engineer` flag) and free buildings from pending effects are excluded, since those have independent permissions rather than using +1 Build. This also prevents false extra-strength credits from such placements.
- **Keep Cards**: enables a hover panel and adds `extra_kept`, displayed as `Additional cards kept`. A completed draw credits the ordinary Cards discard that Keep Cards avoids: side I gives 1 extra at strengths 1, 3, 5; side II gives 1 extra at strengths 2, 4, 5. Other strengths give zero. Strength above 5 uses the strength-5 table, consistent with the game rules. The observer reuses `cards_action.discard_count(level, standard_variant, strength)` rather than duplicating the rules table. It credits once on the final acquisition, so mixed deck/display or several partial draws cannot count more than once. Snapping does not receive an extra-kept credit because ordinary snapping also requires no discard. Other card-taking effects do not count.
- **Sponsors variant 1**: renamed from `Money Sponsors` to `Trade Sponsors`. Variant 2 remains `Money Sponsors`.
- **Sponsors variant 4**: renamed from `Snap Sponsors` to `Marketing Sponsor`. Side II now displays just `Marketing`. The `play` statistic increments only for a successfully applied `sponsor_side` / `discard_play` action with a sponsor actually selected in `args.play`. Discarding a card with `play: None` does not count. Side-I snapping tracking is unchanged.

The action names were updated in the hover titles, `data/action_cards.json`, and the English card-generator locale. `scripts/import_data.py` explicitly preserves the corrected names when importing upstream data, so an upstream name would not silently revert the catalog. Rule text, action IDs, variants and gameplay behavior were not changed. Existing raster card artwork was not regenerated.

### How Ignore Animals is identified

On a successfully reconstructed `play_animal` transition of Animals variant 1, the observer inspects the state immediately before the play:

1. The prompt must be `animals_play`.
2. `animals_action.failed_conditions` evaluates the animal's prerequisites against the current zoo and the effective action level. It handles required icons, Animals II, university and matching partner-zoo requirements. This is not a count of water/rock placement requirements.
3. `animals_action.credits` identifies the available bypasses in the same priority used by the engine: Ignore Animals, connected Research Institute, Waza Large Animal Program, Camouflage.
4. The counter increments if there is an unmet prerequisite and the first applicable credit is `ignore`. That credit requires the single-animal option before any animal has been played.

Choosing the single-animal option alone gives no credit. Playing an animal whose requirements are already satisfied gives no credit. If a condition is instead bypassed using an ignore-conditions bonus token without the Ignore Animals allowance, the action-card counter does not increment. One animal increments the counter once, rather than counting every missing requirement. There is no dedicated BGA notification that directly states this attribution; it follows the reconstructed rule state.

### How Clever Cards is identified

Choosing Cards variant 4 queues an optional `slot1` effect with source `cards4`, at cost 2 on side I or 0 on side II. The observer inspects the pending effect actually selected by a successful `choose_effect` action. It counts only `source == cards4` and `kind == slot1`, incrementing `clever_paid` or `clever_free` according to the effect's cost.

A skipped effect does not count. A Clever from an animal, sponsor or placement bonus has another source and does not count toward Clever Cards. Source inspection also works after the main Cards action finishes; it does not mistakenly attribute the effect based only on whatever action card is currently active.

### Files

- `src/ark_nova/replay/variant_stats.py`: repeated-enclosure and additional-kept counters; actual-play requirement for Marketing; +1 Build source isolation; observer documentation.
- `web/js/cards.js`: new Keep Cards panel and rows, new +1 Build row, corrected names and Marketing label.
- `src/ark_nova/data/action_cards.json`: the two corrected names only.
- `scripts/cardgen/site/locales/en/common.json`: the corresponding English names only.
- `scripts/import_data.py`: name overrides to preserve the correction on future imports.
- `tests/test_variant_stats_observers.py` (new): actual engine transitions for both Keep Cards tables through strength 7, mixed draws, snapping, duplicate enclosure sizes, real subsequent-action reset, Engineer/free-building exclusions, Ignore Animals satisfied/unmet/token cases, Clever cost/source/skip cases, and Marketing play versus discard-only behavior.
- `tests/test_variant_stats.cjs` (new): exercises the actual production hover-rendering function with a small element stub, checking titles, labels, values, zero rows, existing Ignore/Clever rows and fork-mode exclusion.
- `changelog_oct25.md`: this section.

Backups of existing edited files are outside the project at `C:/Users/ascri/Documents/Codex/2026-10-11/ple/outputs/action-variant-stats-oct27/before/`.

### Validation and remaining limits

- Initial focused observer/rendering suite: 15 tests passed. After strengthening the actual subsequent-action test and adding the final Engineer/free-building source-isolation cases, the final focused suite passed **17 tests** in 2.17 seconds.
- Broader regression run: **262 passed, 2 skipped, 1 deselected** in 193.26 seconds. It covered action statistics, game data, engine foundation, engine-turn unit tests, animal abilities and both sponsor-statistics suites, including their complete-replay checks. The two existing variant-statistics corpus tests skip because `607674960.json` is absent. The historical full-corpus differential test `test_engine_agrees_with_the_log_turn_by_turn` was deliberately not selected; it requires a much larger corpus. Its threshold was not changed.
- The final focused suite includes the source-isolation refinements made during review. Those refinements change statistics attribution only, not engine action legality or state transitions.
- The changed production JavaScript passes Node syntax checking. Changed Python sources and the importer parse successfully; the edited data/locale JSON files parse successfully.
- Counts remain dependent on successfully reconstructed engine turns, as the other action-variant counters are. No direct-log fallback was introduced in this change. Unsupported or mismatching turns can therefore leave these statistics incomplete.
- No live-browser visual check or deployment is claimed. Restart the backend and reload the replay to review the updated cached payloads.

Reproduce the focused checks from the project root with Node on PATH:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_variant_stats_observers.py -q -p no:cacheprovider
node tests/test_variant_stats.cjs
node --check web/js/cards.js
```


## 7. Direct Ignore Animals evidence, overlap inference and Camouflage (2026-10-27)

### Approved scope

Implemented the fixes approved after reviewing the supplied `ignore_history_spec.md`. This supersedes section 6's description of the engine-derived Ignore Animals hover counter. Clever Cards and the other action-variant counters retain their existing detection. No `ignore_history` database field, BigQuery query, map-enrichment pipeline or new UI feature was introduced.

Research Institute's current-coverage activation rule is deliberately unchanged. The supplied spec describes persistent activation after covering 0:11, but the audit did not have a subsequent-uncovering example to establish that gameplay edge case. No change to that rule was included in this approval's confirmed fixes.

### Ignore Animals now uses direct backend evidence

New `parser/animal_ignores.py` builds per-play evidence from the original raw stream after the parser has established retained event orders. `ParsedLog.animal_ignores` maps each retained public `buyAnimal` order to its player/card, latest private pre-play requirement weight, selected action, confirmed Animals flow, and directly associated ignore-token consumption. This metadata does not add replay events or change move/turn boundaries.

The hover counter increments once for a resolved animal only when all are true:

- its selected action is `Animals1`;
- that same player's latest private pre-play `conditions.ignored` is positive;
- the associated public flow confirms `ignore = 1`, `max = 1` and a valid level/strength;
- the play is not paired with actual consumption of a `bonus-ignore-conditions` token;
- it is not an identified duplicate notification.

No `conditions.valid` or `playable` requirement is imposed. An actual `buyAnimal` proves the play resolved; in the real examples, those ordinary status flags can remain false on the ignore branch. The requirement weight is read from `conditions.ignored`, not calculated by counting false named keys or inferred from a token's capacity. The hover statistic counts animal plays, not requirement units: ignored weight 3 still contributes 1 use.

Level/strength fields accept numeric strings. Side I requires the strength-5 table (boosted strengths above 5 remain valid); side II requires strength at least 3. Merely owning/using Animals1, or selecting the branch for an animal with no ignored requirements, does not increment the statistic.

#### Event order and confirmation timing

The parser preserves the given backend packet/event order. A player's status is read only from that player's private channel, supporting `gameStateChangePrivateArg.args.statuses` and private `gameStateChange.args.args._private.statuses`. Opponent snapshots are never substituted. The requirement snapshot is captured when the animal is played, so a later status update cannot rewrite it.

An important local-log format differs from a strictly pre-play flow detector: the public state confirming `ignore = 1` follows `buyAnimal` in the same packet. The extractor binds that confirmation back to the most recent animal by that owner in the same action and packet. It also accepts a following packet in the same backend move under that action context. A pre-play branch can be used when it is already explicit. A post-play confirmation supersedes an ordinary pre-selection flow.

Private flow snapshots are not allowed to override the public source flow; they can announce the next state before the public outcome. Repeated confirmations do not create additional uses. Action/turn boundaries clear the branch association, and a flow from a later unrelated move is not borrowed for an earlier animal.

Ignore-token consumption is identified from structured `discardTokens.args.meeples[].type == bonus-ignore-conditions` and paired with the immediately following public notification for the same player. Intervening private snapshots do not break the public pair. Possessing/acquiring a token is not treated as spending it. A token consumed for another animal or another player does not suppress this play's counter. A paired token overrides a suggestive ignore-flow flag, as required by the supplied spec.

Identified duplicate plays use table, backend move, notification type and UID. A reused UID in a later move is a distinct play. Equal card/text content without an identity is not itself a reason to merge events.

### Counter integration and reconstruction

`replay/variant_stats.py:logged_variant_gains` supplies the existing `ignored` statistic at the actual animal event order. `replay/view.py` merges it with the other event-ordered observations. No frontend key/label change was needed. The old Ignore Animals engine observer was removed so the same play cannot receive an additional inferred engine credit.

This statistic is now independent of whole-turn engine success. A complete replay test disables engine reconstruction entirely and still gets the correct count. The increment appears when the animal appears in the replay state, never in an earlier snapshot. Missing private requirements or missing/invalid branch evidence remain unknown and cannot generate a guessed use; there is no speculative engine fallback for the displayed count.

For engine reconstruction itself, `differential.py:_use_ignore_branch` honors the per-animal evidence. An explicit ignore branch selects the engine's single-animal option; an explicit ordinary branch or a paired token prevents that inferred insertion. Only when the branch is unknown does the harness retain a legality fallback. It no longer scans the whole action group for any token consumption.

`_needs_a_token` now sums all applicable non-Animals1 ignore capacities. The reproduced counterexample was a Moose missing two herbivore requirements with both Research Institute and WAZA Large Animal Program active. The ordinary play is legal through those two allowances. The old helper nevertheless returned true because it only exempted one missing requirement at a time, causing the harness to invent an Ignore Animals choice. The helper now returns false in that case. The raw hover statistic never treats the engine's internal priority order as proof of BGA causal attribution.

### Camouflage consumption

`engine/animals_action.py:play` now clears an already pending Camouflage after checking the next animal's requirements, on every successful animal play. It does so even when:

- that animal needs no bypass; or
- other applicable credits already cover all its missing requirements.

The credit remains available while validating/resolving that animal's requirements. Clearing occurs before the new animal's abilities are applied, so an animal that itself activates Camouflage correctly creates a fresh pending effect for the following animal. Engine `apply` remains pure; the input state is not changed.

This fixes the reproduced Lined Seahorse -> Sun Bear case: when the Sun Bear's partner-zoo condition is already satisfied, the old implementation left Camouflage pending. It now consumes it. The Research Institute + WAZA overlap with Camouflage pending is also covered, ensuring that an unused-by-priority credit still expires on the next animal.

### Files and development version

- `src/ark_nova/parser/animal_ignores.py` (new): direct pre-play status, selected-flow, token-pair and duplicate evidence.
- `src/ark_nova/parser/model.py`: adds the optional per-play metadata dictionary with an empty default.
- `src/ark_nova/parser/log.py`: populates that metadata after ordinary event normalization; noise handling and existing parser events remain unchanged.
- `src/ark_nova/replay/variant_stats.py`: log-derived counter; removes the old engine-derived credit and updates the module documentation.
- `src/ark_nova/replay/view.py`: merges the direct counter at its event order.
- `src/ark_nova/replay/differential.py`: source-aware branch selection and combined bypass capacity.
- `src/ark_nova/engine/animals_action.py`: consumes Camouflage on the next actual play, preserving a fresh activation by that animal.
- `tests/test_ignore_evidence.py` (new): evidence attribution and timing, ordinary/missing/invalid branches, weighted requirements, private ownership and chronology, token precedence/pairing, UID identity, overlap inference, Camouflage expiry/reactivation, three real logs, and engine-independent complete replay snapshots.
- `tests/test_variant_stats_observers.py`: updates the former Ignore Animals engine-counter expectation; it now checks that engine choices alone do not supply the hover statistic. Other variant tests remain intact.
- `changelog_oct25.md`: this section.

The engine is already on `0.2.5-dev`, the existing unreleased development version. It remains there; no release-manifest entry or live-table migration was created. Backups of existing edited files are outside the project at `C:/Users/ascri/Documents/Codex/2026-10-11/ple/outputs/ignore-fix-oct27/before/`.

### Validation

The first focused run passed **48 tests** in 9.19 seconds (`test_ignore_evidence.py` plus `test_variant_stats_observers.py`). It includes these real source confirmations:

- 770429314, move 200: Giant Panda, player 84076011, ignored requirement weight 1, public ignore confirmation after the animal, total 1 use.
- 853899676, move 202: Barbary Macaque, player 94936862, weight 1, total 1 use.
- 930781276, move 75: Andean Condor, player 86346298, weight 1, numeric-string strength, total 1 use.

The complete-replay timing test uses game 770429314 with engine reconstruction disabled, checks a final total of 1, and checks that no earlier step receives the increment.

The broad regression run passed **364 tests**, with **2 skipped and 1 deselected**, in 211.36 seconds. It covered the new evidence tests, action-variant observers/rendering, engine version gate, parser, normal-turn history, break markers, replay-builder oracle checks across all 20 local example logs, engine-turn unit tests, animal abilities and both sponsor-statistics suites. The two existing action-variant corpus tests skip because `607674960.json` is absent. The existing full-corpus differential test requiring at least 55,000 checked actions was not selected with this smaller local corpus; its assertion was not changed.

An additional read-through of all 20 example logs plus the two supplied Desktop logs parsed **425 animal-play evidence records** across 22 inputs without errors. It found exactly the three Ignore Animals uses above, plus the actual token pairs at 770429314/364 (Grevy's Zebra) and 853899676/481 (Red Panda). The token pairs did not become Ignore Animals credits.

All changed/new Python sources parse successfully. Frontend layout and JavaScript were not changed in this fix; their existing production renderer checks ran as part of the regression suite.

Reproduce the broad run from the project root with Node on PATH:

```powershell
$env:ARK_WORKERS = '2'
.\.venv\Scripts\python.exe -m pytest tests/test_ignore_evidence.py tests/test_variant_stats_observers.py tests/test_variant_stats.py tests/test_engine_version.py tests/test_parser.py tests/test_turn_history.py tests/test_break_markers.py tests/test_replay_builder.py tests/test_engine_turn.py tests/test_animal_abilities.py tests/test_sponsor_stats.py tests/test_sponsor_stats_rest.py -k 'not test_engine_agrees_with_the_log_turn_by_turn' -q -p no:cacheprovider
```

No deployment or live-browser visual check is claimed. The UI layout is unchanged. Restart the backend and reload the replay to review the new cached payloads.
