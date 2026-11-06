# Animation decisions — v01

Recorded: 5 November 2026

## Status and scope

This document records the card animations approved through interactive mocks. **Implementation was authorized on 5 November 2026 and has been added locally.** See the project's `changelog.md`, “Card movement animations”, for integration details and validation limits. Nothing has been deployed or published.

The approved designs cover the **floating hand container and fan**. The fan retains its existing rise-and-deal animation for deck draws and uses the approved continuous upright glide for display and targeted arrivals. The mocks remain visual references.

## Shared decisions

**Implemented speed setting:** the 1.0× baseline runs every timing in this document as written (a 650 ms flight takes 650 ms at 1.0×). An earlier local revision that doubled all timings was removed on 5 November 2026. Settings → Control begins with **Animation speed**, offering 0.25×, 0.5×, 1.0×, 1.5×, 2.0× and 3.0× (`base / speed`). The selection persists independently of autoplay and applies to animations already running.

- Default animation speed: **1.0×**. This supersedes the original proposed default of 1.5×.
- Animation timing must support an adjustable speed multiplier later. At speed `s`, a base duration or stagger interval takes `base / s` milliseconds. Scale the entire sequence consistently, including hand rearrangement.
- The mock speed choices are 0.5×, 1.0×, 1.5×, 2.0× and 3.0×. These demonstrate scalability; the final settings UI has not been specified.
- Keep animation speed distinct from replay navigation/autoplay speed unless a later decision explicitly links them.
- The replay interface has **no visible draw deck**. A deck draw enters from beyond the top of the page, rather than departing from an invented deck graphic.
- Display draws start at the actual visible card. The card that moves must be the same card that arrives in the hand.
- The mock controls reset the example hand for repeatable comparisons. That reset is demonstration behavior, not intended application behavior.

## 1. Draw from deck — original deal (revised 5 November 2026)

**Superseded:** the Direct glide below is no longer used for deck draws. By the user's decision, every draw from the deck (one card or the eight-card starting hand) uses the application's original deal, in both layouts.

- **Fan:** unchanged, the rise-and-deal of 520 ms with 110 ms stagger described under "Fan adaptations".
- **Floating tray:** the original drop: each card tilts 9° to alternating sides, fades in, dips 6 px and settles; 100 ms stagger; a freshly drawn tray slides up first (350 ms) and the cards start after it.
- **Invisible deck:** every card of a draw (and of a tray discard) travels from / to ONE fixed point, the centre of the header row (the move bar), not straight above its own slot. - **Revision:** the cards no longer start 260 px above the slot but at the top edge of the viewport (the height of the move bar, as in BGA), so they fall across the page. The flight time grows with the distance: `clamp(320 + 0.45 × fall, 560, 800)` ms, about 730 ms for a hand at the bottom of the screen. These values are our own; the BGA inspection (`bga_animations.md`) holds no card-flight timing.

The original Direct glide design, kept as history:


**Approved:** Direct glide, for both a single card and the normal eight-card starting hand.

### Appearance

- The card enters from above the visible board and glides into its destination in the floating hand.
- Use a clean, restrained motion with gentle rotation and deceleration into the slot.
- In the followed player's hand, the approved mock shows the card face-up during its visible flight.
- Do not show a physical deck or a source marker.
- Apply the same individual-card motion to the starting hand, with successive cards staggered into their slots.

### Approved reference timing at 1.0×

| Parameter | Value |
| --- | --- |
| Individual flight | 560 ms |
| Starting-hand stagger | 95 ms per card |
| Eight-card sequence, first departure to final landing | 1,225 ms |
| Flight easing | `cubic-bezier(.22, .65, .3, 1)` |

The mock's transform keyframes are:

| Keyframe | Translation remaining to destination | Rotation | Scale |
| --- | --- | --- | --- |
| Start | 100% of source-to-destination offset | −6° | 0.94 |
| 56% | 38% of horizontal offset; 42% of vertical offset | −2° | 1.02 |
| End | None | 0° | 1.00 |

The mock places the source above the scene (`y = −145 px`) at about 46% of its width. These coordinates describe the reference scene, not fixed production coordinates: the application should calculate an offscreen source and the real hand destination from its layout.

## 2. Draw from display — tuned Direct glide

**Approved:** The tuned display draw shown beside the deck reference in `draw-speed-comparison.html`.

The first display mock used the deck draw's 560 ms duration and easing. The user felt it looked faster. The accepted revision gives the display draw a slightly longer duration and gentler growth, without the deck animation's size overshoot.

### Appearance

- The card leaves its actual slot in the shared display and glides into the floating hand.
- It stays face-up throughout; no flip or reveal animation is needed.
- Start at exactly the displayed card's position and size. Its image disappears from the display as the moving representation takes over, so there is no duplicate visible card.
- Gradually grow from display size to hand size. Do not enlarge beyond its final size.
- Existing hand cards move smoothly to make room.
- Leave the vacated display slot empty until the actual replay state calls for a display shift or refill. This mock does not specify those separate animations.

### Approved reference timing at 1.0×

| Parameter | Value |
| --- | --- |
| Flight | **650 ms** |
| Flight easing | `cubic-bezier(.22, .65, .3, 1)` |
| Existing hand cards making room | 260 ms, concurrent with the flight |
| Hand rearrangement easing | `cubic-bezier(.22, .65, .3, 1)` |

The flight follows the same translation progression as Direct glide: full source offset at the start, 38% horizontal / 42% vertical offset remaining at 56%, then the destination.

For scaling, let `s0` be the display card's size relative to the destination card:

- Start: `s0`.
- At the 56% keyframe: `s0 + (1 − s0) × 0.70`.
- End: `1.00`.

There is no added rotation in this display version. Match the visible source rectangle at departure and the destination rectangle at arrival, including their centers.

**The 650 ms tuned version supersedes the earlier 560 ms display mock.** Its aim is a consistent perceived pace alongside the deck draw, rather than identical numerical duration.

## 3. Discard from hand — Soft dissolve

**Approved:** Soft dissolve. Reverse glide, Sweeping arc and Quick flick were explored but not selected.

### Appearance

- The discarded card lowers slightly, shrinks and fades away from its position in the floating hand.
- Keep it face-up while it dissolves; do not flip it or fly it towards an invented discard pile.
- Once the discarded card or batch has disappeared, the remaining cards glide together to close the gap.
- The mock supports a single discard and a three-card discard, demonstrating the same effect with staggered departures.

### Approved reference timing at 1.0×

| Parameter | Value |
| --- | --- |
| Individual dissolve | 380 ms |
| Multiple-card stagger | 80 ms per card |
| Dissolve easing | `ease-in` |
| Hand gap-closing movement | 230 ms, after the batch has disappeared |
| Gap-closing easing | `cubic-bezier(.22, .65, .3, 1)` |

The dissolve keyframes are:

| Keyframe | Downward movement | Scale | Opacity |
| --- | --- | --- | --- |
| Start | 0 px | 1.00 | 1.00 |
| 32% | 9 px | 0.97 | 0.80 |
| End | 42 px | 0.83 | 0.00 |

There is no rotation. For three cards, the last dissolve finishes after 540 ms; gap closing then takes 230 ms. Pixel offsets describe the approved mock's card size and may need proportional adaptation to actual hand scaling.

## Reference mocks

All paths below refer to local, unpublished mock files.

| Reference | Purpose |
| --- | --- |
| [Deck draw options](C:/Users/ascri/.codex/visualizations/2026/10/10/01a1282e-38d4-7540-91ad-5aaeb07b0514/card-draw-motion.html) | Select **Direct glide**, with speed explicitly set to **1.0×**. Demonstrates single-card and eight-card draws. Its original fallback speed still reads 1.5×; that is superseded by this document. |
| [Discard options](C:/Users/ascri/.codex/visualizations/2026/10/10/01a1282e-38d4-7540-91ad-5aaeb07b0514/card-discard-motion.html) | Select **Soft dissolve**. Demonstrates single-card and three-card discards. |
| [Initial display draw](C:/Users/ascri/.codex/visualizations/2026/10/10/01a1282e-38d4-7540-91ad-5aaeb07b0514/display-card-glide.html) | Earlier 560 ms display version; retained for comparison, **superseded**. |
| [Approved draw comparison](C:/Users/ascri/.codex/visualizations/2026/10/10/01a1282e-38d4-7540-91ad-5aaeb07b0514/draw-speed-comparison.html) | Deck reference at 560 ms beside the **approved display draw at 650 ms**, with gradual growth and no overshoot. Use “Draw both together” at 1.0×. |

## 4. Sunbathing — Sunbeam pickup

**Approved:** Sunbeam pickup from the special-card-loss mock.

- A narrow diagonal shaft of warm sunlight illuminates the card.
- The card tilts towards the light, lifts along the beam, shrinks and disappears.
- Keep the effect local to the card; do not introduce a visible deck or discard destination.
- Reference card motion: 800 ms at 1.0×; accompanying beam: 900 ms. Multiple-card example staggers departures by 145 ms.
- Reference: [Special card-loss options](C:/Users/ascri/.codex/visualizations/2026/10/10/01a1282e-38d4-7540-91ad-5aaeb07b0514/special-card-loss-options.html), **Sunbathing · Sunbeam pickup**.

## 5. Gliding / Glide — Bubble lift

**Approved:** Bubble lift from the special-card-loss mock.

- Small bubbles collect beneath the card and rise, carrying it upwards.
- The card gently tilts from side to side, becomes translucent and shrinks as it rises away.
- Bubbles continue briefly and fade. This is the selected marine treatment for Gliding; ordinary discards retain Soft dissolve.
- Reference card motion: 900 ms at 1.0×; multiple-card departures stagger by 145 ms.
- Reference: [Special card-loss options](C:/Users/ascri/.codex/visualizations/2026/10/10/01a1282e-38d4-7540-91ad-5aaeb07b0514/special-card-loss-options.html), **Gliding · Bubble lift**.

## 6. Pouching — Portrait canvas pouch

**Approved:** The first design, **Portrait canvas pouch**, from the source-animal pouch mock. This supersedes the six initial Pouching concepts; the other three animal-branded pouch designs were not selected.

- A soft tan canvas drawstring pouch appears above the hand.
- Do not show the separate cream source-label box such as “Pouch 2 · Red Kangaroo”. The animal portrait and printed name on the pouch itself remain.
- The pouch features artwork from the animal responsible for Pouching, adapted into a rounded printed portrait, with its name on the fabric. Do not simply paste a complete miniature card onto the pouch.
- The reference uses **Red Kangaroo / Pouch 2**, with its real card artwork. The eventual implementation must use the actual source animal, not always Red Kangaroo.
- The selected hand cards rise towards the opening and slide down behind its front, disappearing into the pouch rather than fading in midair.
- A small cloth movement accompanies each arrival. The mouth then closes, the pouch lingers briefly and leaves.
- Reference at 1.0×: pouch entrance 220 ms; individual card sequence 900 ms; subsequent cards stagger by 160 ms; closing movement about 220 ms. The pouch exits after a short settling hold.
- The reference offers one-card and two-card examples. This is a visual mock, not authority for the number of cards a game effect permits.
- Reference: [Source-animal pouch options](C:/Users/ascri/.codex/visualizations/2026/10/10/01a1282e-38d4-7540-91ad-5aaeb07b0514/pouch-animal-identity.html), **Portrait canvas pouch**.

## 7. Targeted draw — Magnifying glass (replaces the Species spotlight, 5 November 2026)

**Approved:** option C of the targeted-draw mock. Implemented in `card-motion.js` `searchFlight()`; the old spotlight, species badge and one-second hold are gone (no icon, no ribbon, no species text).

Sequence (ms at 1.0×, from the start of the step): the screen dims (`.cm-dim`, 450 ms, 92%); seven face-down cards fall in from the invisible deck into a row in the middle of the viewport (520 ms each, 70 ms stagger, row cards at 62% of the big card); at 650 ms a brass magnifying glass (`.cm-lens`, CSS in `card-motion.css`, sized by `--u` = the page scale) appears and swings over the row **left to right and back as one smooth pendulum** (`x = c - R cos(theta)`, theta eased with a cosine, so every turn and the stop are smooth; duration about 2.3-2.6 s depending on the distance; slight float and tilt) and **settles on a random card** (index 0-5, new each time). Each card hops up when the glass passes over it (on the way out and back). When the glass settles: a white ring flash, the other cards drop away, the glass drifts off, the chosen card is pulled out to the middle and, for the followed player, turned face-up (3D flip, 650 ms). After a reading hold (about 0.9 s for the face-up card) the card glides to its place as usual (650 ms, same curve as the display take; in the fan the continuous upright glide) while the dim fades. The floating container's width follows that final glide (single-card opening, below).

**The other player's targeted draw** (not the followed player): the same sequence, but the selected card stays a card back (nothing is revealed) and glides, shrinking and fading, into their player info box (the box is their "hand"). `otherPlan` returns `targeted` (0 or 1) next to `deck`.

**What counts as a targeted draw** (`card-motion-plan.js` `targetedCount(text, name)`, from the step's log lines): a draw with the University (`<SEARCH-...>`), the Monkey Gang effect, a species Management Plan (`with <BIRD> (...)`), the sponsor card of map 8 / 8a (`(Map 8 effect)`), the person sponsor for a worker on map 14 (`(1st|2nd|last worker bonus)`, **not** the one at the start of the game, `Map 14 effect`) and the animal of Waza Special Assignment (`(Waza Special Assignement effect)`). Only the first card of a step gets the sequence, further cards of the same step fly in as ordinary deck draws.

## Fan adaptations

**Selected for deck draws:** retain the current fan's rise-and-deal motion, extending the same individual-card treatment to normal draws: rise from below the screen edge, initially upright, then settle into the card's fan angle. Reference timing is 520 ms per card, with 110 ms stagger for the eight-card starting hand (1,290 ms total).

All seven actions can be tried in [Fan animation suite](C:/Users/ascri/.codex/visualizations/2026/10/10/01a1282e-38d4-7540-91ad-5aaeb07b0514/fan-card-animation-suite.html). The fan adaptations retain **Soft dissolve** for discards, **Sunbeam pickup** for Sunbathing, **Portrait canvas pouch** for Pouching, and **Bubble lift** for Gliding. Cards begin at their actual fan angles. The pouch has no separate source-label box.

**Approved for fan display draws and targeted draws: Continuous upright glide** (also described by the user as “continuous upright slide”). The authoritative reference is the revised [continuous-arrival mock](C:/Users/ascri/.codex/visualizations/2026/10/10/01a1282e-38d4-7540-91ad-5aaeb07b0514/fan-continuous-arrival.html).

- Use one uninterrupted **650 ms flight at 1.0×**, staying mostly upright and smoothly blending into the destination card's fan angle near arrival.
- Do not pause above the fan, introduce an intermediate stopping point, or split the arrival into separate approach and tuck phases.
- Do not automatically raise the fan as part of this selected arrival. Land in its current raised or resting position.
- For a display draw, start at the actual visible display card's position and size.
- For a targeted draw see section 7 (magnifying glass); its reading hold is intentional and separate from the removed mid-flight hesitation.
- Existing hand cards smoothly make room. All animation timing scales with the shared speed multiplier.
- This selection supersedes the earlier Direct to slot, Raised reception, and paused Upright approach alternatives. Those remain exploration references only.

Implementation is authorized and has been added locally for these selected designs.

**Deck requirement clarified:** keep the actual application's existing starting-hand animation exactly as it is, generalizing its per-card deal to any number of deck draws. Do not replace its keyframes, 520 ms duration, 110 ms stagger or easing with the new display/targeted glide. The revised mock provides a draw-count input (1–20 for preview) plus a starting-eight button; that preview limit is not a proposed application limit.

## Discard from the floating tray — deal played backwards (5 November 2026)

**Approved (user decision):** in the floating container a discard is the opposite of a deck draw: each card dips slightly, then rises, tilted to alternating sides (9°), to the invisible deck and fades out there (the point is shared with the deck draw, see the revision note in section 1). 100 ms stagger, `ease-in-out`, flight time `clamp(320 + 0.45 × rise, 560, 800)` ms. This replaces the Soft dissolve in the floating container only; the fan keeps the Soft dissolve (380 ms, 80 ms stagger).

## Still to be decided

- No remaining decision on the speed setting: it is implemented as the first row of Settings → Control, with the six values listed above.
- Display shifts and refills, playing cards, and other card movements.
- Full visual validation of playback, seeking, interruption, both layouts and responsive sizes. Integration now handles these lifecycle events and respects reduced motion and hidden hands; the complete browser validation matrix remains outstanding because browser control stalled.

The durations and keyframes above are the visual references and run as written at 1.0×. Local integration is documented in `changelog.md`; seven classifier tests pass, timing checks pass, and an earlier replay smoke check recorded no JavaScript errors. Full visual QA and a cache-bypassing reload of the latest speed setting remain outstanding because browser control timed out.

## Other player's card flights (replay, live play, sandbox; not fork)

**Principle.** For the seat that is not followed (the POV seat decides), that player's info box in the sidebar (`.pp[data-seat]`, `boxPoint(seat)`) acts as their hand in every animation: cards that go into or come out of their hand fly to / from the box (deck draws and discards as card backs, a played card as the real card, display takes as the real card).

For the seat that is not followed, only counts are known, so the flights come from `otherPlan` (card-motion-plan.js): hand-count change minus pilfered cards, display cards that left the display (public), and new `main_discard` cards.
- Draw from the display: the real card glides to the right edge of that player's info box (`.pp[data-seat]`, set in side-panel.js) with the same glide as the followed player's display take, duration scaled by distance (650 ms per 850 px, 650-1500 ms). It keeps its size until the last 24 % of the flight, where it shrinks and fades (the vanishing part).
- Draw from the deck / discard: card backs only (`web/card_back.webp`, 420x588, cut from the 4th panel of `scripts/cardgen/site/img/card-backgrounds.jpg`, inside the frame so no light edge) fly between the invisible deck (`deckPoint()`) and the info box, 560-800 ms, tilt alternating 9 deg, 100 ms stagger.
- Pilfering (`parsePilfer` reads "X gives N card(s) to Y from Pilfering effect"; money pilfers are ignored): the card we give leaves our hand as a back to the receiver's info box; the card we receive flies from the giver's info box as a back and turns face-up in our hand.
- Not in a pure fork (both seats are played there), minigames or with reduced motion.
- Tests: `node --test tests/card-motion-plan.test.mjs` (16 tests).

- Sunbathing (own and other seat): a ray from the invisible deck to the card (to the player's info box for the other seat), held for the whole animation (`.cm-ray`, `sunRay`); the card or back is beamed up along it. Sunbathing also covers the Sponsors action card's level 3 discards ("discards X to gain money" and, on the upgraded side, "discards X to increase Sponsors action's strength by 2"). The level 4 (Marketing) discards ("to play a Sponsor card for money", "to snap a Sponsor card") are normal discards, not sunbathing.
- Gliding (own and other seat): the card flies to the invisible deck in a trail of bubbles (`bubbleTrail`).
- Other seat: sunbathe, glide and pouch are counted (`discardKinds` reads the log lines of that player, pouches come from the new `under` / `pouched` entries) and shown as that many backs; the pouch backs slide out of the info box towards the zoo and are tucked away.
- The backs are as wide as a card of the display (`backWidth`).
- Money tile flash: the ring rule of replay.css targeted `.rs.money` but the tile is `.rt.money`, so the ring never showed; fixed.

## Playing animals and sponsors — approved layouts, implemented 5 November 2026

Animals and sponsors use the same continuous, face-up glide into their own played-card column. Position, upright rotation and size change together; no flip or intermediate pause. Timing matches the existing distance-based glides: 650 ms per 850 design pixels, clamped to 650–1500 ms at 1×, with cubic ease-in/out and 140 ms stagger for multiple plays. The animation-speed setting scales flight duration and stagger. Existing pile cards that must move or resize use the same flight window, preserving their initial geometry without an early short reflow. Pile overlap remains the renderer's 80%.

- **Origins:** the POV player's rendered card in the floating hand or fan, or the actual display slot. Other players' public played cards emerge face-up from the right edge/vertical centre of their sidebar info box, including when playing from the display. No unknown hand cards are revealed. Folded POV trays open first, play the motion, then fold back using the existing temporary-unfold lifecycle.
- **Top/bottom:** glide and resize directly into the actual fitted pile slot beside the owner's board, including offscreen destinations. The viewport is preserved, including display plays.
- **Tabbed:** if the owner is already shown, the same motion. Otherwise switch immediately to the owner's tab without a tab animation, glide into the pile, hold the completed board for **one wall-clock second after all played-card flights finish**, then restore the original tab immediately. The temporary tab choice is not persisted. Autoplay waits through both flight and hold. Navigation/layout/POV changes or interaction interrupt and clean up the flight and pending return rather than running an obsolete callback.
- **Side by side, drawer closed:** leave it closed. Fly to the right-hand map area (82% across, 52% down the map row), shrinking to the card size calculated for that player's **full-size open drawer**, then disappear over the last 18% of the flight. The destination size shares the expanded drawer's fitting function; there is no tiny-card cap.
- **Small drawer open:** land in the actual small pile, one column per kind, respecting the renderer's fitted card sizes and ordering.
- **Full-map drawer open:** land in the actual fitted pile, two alternating columns per kind. Capture the old pile before redraw, measure the final fitted layout once, and animate necessary adjustments over the incoming flight, avoiding the mock's upfront 260 ms size twitch.

Implementation: `card-motion-plan.js::playedCards` reads public animal/sponsor-zone additions and detects display departures; it excludes those hidden-hand plays from discard counts. `card-motion.js` captures the geometry before redraw and owns overlays, pile reflow, temporary tabs and cleanup through its existing animation registry. `zoo.js` adds seat identifiers to map/played containers and shares expanded-drawer sizing. Reduced motion, backward seeks and initial loads show the final state immediately. No backend or conservation-project animation changes are required.

## Playing a conservation project
Approved: the "Flip" option of the mock. Implemented in `playProject` (card-motion.js); from the hand (container or fan) or from the display, for the followed player and for the other seat (see below).
- Glide: the card flies to the open spot of the association board (the `.projstrip[data-key]` of the new project), 650 ms per 850 px, at least 650 ms, eased in and out, shrinking to 0.75 on the way and turning upright.
- Flip: the card turns edge-on around its middle (`scaleX` to 0.001, 200 ms, ease-in) and is removed; straight after, the real strip unfolds from its middle (`scale` 0 to 1.04 to 1 over 220 ms). Nothing else lights up: no gold ring or glow.
- The slot (`.projslot`) is never moved or scaled. Until the strip unfolds it looks like an empty place (outline = the `.projempty` inset box-shadow, read from a hidden probe clone; no green base); outline and green base switch to their real values at the moment the strip starts to unfold.
- Other player's project: played from the display it flies exactly like ours; played from their hand (hand count shrank, the card is not in the display) the real card fades in at the info box and flies to the spot (`otherPlan(...).projects`, `playProject(p, i, g, emerge)`), then the same flip. The played card is not counted as a discard.
- Timing rules learned: `animate()` starts animations paused and releases them two frames later (a render stalls the page for ~400 ms right after stepping); a delayed follow-up on the same element uses `fill: 'forwards'`, never `'both'`.

## Folded floating container
Folded floating container (setting "Hand display" = floating container): the tray stays folded and every hand animation of the followed player (deck draw, display take, targeted draw, discard / sunbathe / glide / pouch, pilfer, played card or project, the endgame row) plays exactly as in the open tray. The folded tray keeps its cards in the page, only its frame is short, so the cards reach below the bottom of the window; the flights run against these real positions and the overlay `#card-motion` is cut at the window's edges, so a card sinks into the folded tray / rises out of it showing only the part above the edge, like the cards lying in it. (`visibleZone()` / `visibleHand()` in card-motion.js count a folded tray as shown.) The fan has no folded state. The only automatic unfolding is the starting deal: the hand opens and stays open.

## One card into the floating tray: the frame opens with the flight
When exactly one card arrives in the floating tray (`S.handMode === 'tray'`; from the deck, from the display, or a targeted draw; open or folded) the tray frame (`.trayframe`) does not jump to its new width at the start of the step. Its width is animated from the old to the new width over the card's own flight (same delay, duration and easing), so the edge reaches the new slot just as the card lands, in one smooth motion; the frame is `overflow: hidden` for that time so the new slot stays clipped until the edge reaches it. The old width is captured in `beforeRender` (`capture.frameW`); `arrive()` returns the flight window `{delay, duration, ease}` and `run()` calls `openWith()` when there is exactly one arrival and no departures or projects. For a targeted draw the width holds during the whole magnifying-glass sequence and opens only with the final glide. Not changed: several cards at once (starting hand, 3-4 card draws), every way of cards leaving the hand, the fan, the other seat.

**Survivors close up with the flight (6 November 2026).** When the lone card is the only change of the hand (no cards leaving, no projects), the cards already in the tray no longer slide to their new places *before* the new card appears (when the row was at its widest this sent them left, out of the picture, while nothing had arrived yet). They now slide during the card's flight, from 40 % of it to its end (60 % of the flight time, `ease-in-out`), so the row closes up as the frame's edge opens and the card lands. Everything else (several cards, cards leaving, fan, projects) keeps the old timing (`run()` in `card-motion.js`: `lone`, `slideAt`, `slideMs`).

**The row stays put while the frame opens (6 November 2026, the real cause).** The cards still jumped left when a lone card came in (table 941429583, move 57: the first card cut off at the left edge, then the whole row drifting back right). The survivors' slide was not the cause (here no card changes its slot). The row of cards is centred in the frame (`parkposter.css`, `.handtray .cards { justify-content: center }`) and has its new, wider layout at once, while the frame's width is animated from the old width: a frame narrower than its row lets the row overflow on both sides, so every card stood half the added width to the left and moved back as the frame opened. Now `pinRow()` (`card-motion.js`, called by `openWith()` and by the frame animation of the starting hands) holds the row to the frame's left edge (`justify-content: start` on the row) until the width animation ends or is cancelled; at its end the row fills the frame, so left and centred are the same place. Skipped for a frame that was held at its minimum width (few cards, the round buttons are wider: there the old cards really were centred and the survivors' slide moves them) and for a multi-row tray.

- **Played cards in the hand dock** (setting "Played cards" = Tray, pile not on screen): nothing flies; the played-cards round button of the owner (`.traydisc[data-kind="played"][data-seat]`, attributes set in `dock.js`) blinks twice (800 ms, scale + brightness) in `runPlayed`.

## Buildings: glide from / to the invisible deck (5 November 2026)
A building (enclosure, kiosk, pavilion, special / unique building, sponsor building) that is new in the step glides from the invisible deck (`deckPoint()`, centre of the move bar) to its place on the map; one that is cut down (or replaced) glides from its place to the deck. Same timing rule as the other flights: `650 ms * distance / 850 px`, clamped to 650-1100 ms, `glideEase`, 130 ms between buildings of one step; arrival fades in over the first 12 % and starts at 45 % of the size, departure shrinks to 45 % and fades out over the last 15 %. Forward steps only (same condition as the card flights: `S.cardMotionForward`, fork step +1, later phase of a step); backward seeks, jumps and reduced motion show the final state at once.
- `card-motion-plan.js` `buildingChanges(before, after)`: per seat `added` / `removed` ids `type|x|y` (a turn or an animal moving in / out of a building is not an arrival).
- `board.js` `drawBuilding` marks every building group with `data-bseat` / `data-bid`; a building of the last drawing that is gone from this one is drawn again as an invisible group `.cm-leaving` (opacity 0, no pointer events; `zoneNew().gone` has no ghosts any more), only as the source of the copy.
- `card-motion.js` `runBuildings` / `buildingFlight`: the flying piece is a copy of the building's SVG group inside an overlay `<svg class="cm-building">` in `#card-motion`, placed with the group's `getScreenCTM()` (so it is right under any page zoom) and moved with transforms around the sprite's centre (the centre is taken from the sprite `<image>`, not the group: its masks span the whole board). The copy gets ids of its own for its masks / clip paths (the original is hidden with `visibility`, which would empty the masks of the copy). The real group stays hidden until the copy has landed (`hide` / `show`); a board that is not on screen (tabbed layout, other tab) has no group and gets no flight.

## Display: leave and replenish (5 November 2026)
`card-motion.js` `runDisplay(old, st)` (state + display shots captured in `beforeRender` as `displayCapture`; every forward step, both seats, also forks): a card that left the display through a wave or a natural discard (`displayChanges().leaving`: gone from the display and newly in `main_discard`; a take by a player is not one, the existing take flights handle it) glides into the invisible deck (dip, tilted rise, fade; 560-800 ms like the tray discard); a card put in (`added`, the replenish) glides out of the deck into its slot (the real card is hidden until it lands). The replenish waits 450 ms when cards left the display in the same step, 120 ms between replenished cards. Display cards sit in a scaled folder, so `shotOnScreen()` takes their size from the bounding rect (offsetWidth was ~30 % too big, which also made the take flights start oversized).
## Targeted draw of the other seat: face-up
A targeted draw is public. `runOther(plan, old, seat, text, name)` finds the card from the log line (`targetedNames(text, name)` -> the catalog entry by name) and calls `searchFlight({ front: image, backGoal: true, ... })`: the card is turned face-up in the middle and then shrinks and fades into the info box. Without a name in the text it stays a back.
## Buildings: 25 % slower
Building flights last 812-1375 ms (`812 * distance / 850`), card flights keep 650-1100 ms.
## Display cards given to a player (digging, takes that the state files as discards)
Some cards leave the display and land in the discard pile in the state although the log gives them to a player ("X digs <card> from the display"). `givenTo(key, text)` reads the step's log lines ("<player> ... <card> from the display"); such a card does not go to the deck but glides from its display slot to that player's info box (`displayTake`, the same flight as the other seat's display take: keeps its size, shrinks and fades in the last quarter). Only cards the log does not give to a player (wave, natural discard) go to the deck.
## Display: cards slide into their new slots (domino)
In the step that replenishes the display the state shifts the remaining cards to the front (a take leaves a gap first, `null`, and the next "The display is replenished" step closes it) and appends the new cards. `runDisplay` finds every card that is in both displays and sits in another slot (position on screen differs) and slides a ghost from the old to the new position while the real card is hidden: like dominoes, left to right, each card starts 70 ms after the one before it, `420 ms + 110 ms * slots moved`, `cubic-bezier(.25,.8,.25,1)`. It starts 320 ms after leaving / taken cards started (0 when nothing left in the step); the replenished cards come out of the deck after the slide (`480 ms + 70 ms * (cards - 1)`), 120 ms apart. Scales to any number of cards; chosen from the mock options (A simple glide, B domino, C lift, D overshoot, E arc): B.


## Wave: steep breaking wave (replay) — SWITCHED OFF for now
**Currently disabled** (`WAVE_ANIMATION = false` in `card-motion.js`, 6 November 2026): `waveNext` returns null, so the cards a Wave removes from the display are animated like any natural discard from the display (they glide to the invisible deck) and the replenish step is a normal step of its own. The wave code (`wave.js`, `runWave`) is kept and is to be finetuned; set the constant to `true` to bring it back. The description below is the approved look for that later.

Approved look: a single procedural wave (canvas, `web/js/wave.js`) from right to left, ~2.5 s at speed 1. Surf choreography: leaving cards ride up and are thrown to the left with spray (720 ms), surviving cards are lifted, tilted and set down in their new slot (about 700 ms + 420 ms), new cards wait under the water and rise when the wave has passed. Played on the removal step with the state of the next step ("The display is replenished"), then the viewer advances by itself. Only removals "due to Wave"; fork / live / sandbox and any mismatch use the glide.

## Starting hands: consecutive
Dealing 8 + 2 and discarding 4 happen for seat 0 first, then seat 1, within the same step.

## Starting hands: sync with the followed player (second change)
Seat 0's cards move first. The followed player's tray (width, slide-in) belongs to the followed player's own part, so it never moves while the other player's cards are still going. The hand stays open after the starting deal. The display's first replenish starts after both players' discards. Buildings that appear wait 26 % of their flight at the deck (fade-in) before they set off.

## Targeted draws are public
Every targeted draw (university / category search, worker bonuses, Management Plans, Map 8, Map 14 including the starting person sponsor, Waza Special Assignment, Monkey Gang) names its card in the log for both players and gets the magnifying-glass search in every point of view. Random draws (deck, Sprint, Hunter, Perception, Scuba Dive, Adapt, scoring cards) stay hidden for the other player.

## Targeted search: no spoiler in the move bar
The move bar shows the previous step's text during the search and the step's text (which names the card) when the card is revealed.

## RULE for all animations: info box targets exist on every sidebar tab
Anything that flies to or from a player's info box must get its point from `boxPoint(seat)` in `card-motion.js`, never from a raw `querySelector('.pp...')`. `boxPoint` also works while the Log or Chat tab is open (the Control pane is hidden then): it measures the box at the place it has on the Control tab, so the animation is played exactly as on the Control tab and the card simply flies to / from that spot. Never skip an animation because the box is not visible. The same holds for any other target that can be hidden by a tab or fold: measure it as it would be when shown.

## Action cards: order, upgrades and attached tokens — implemented 6 November 2026

The sidebar action icons and the optional full action cards below each board animate the same public action-card state changes. Match cards by their action type and player, not by the DOM slot that happens to contain them after a redraw. Every displaced card participates in the reorder, including the cards shifted aside when another action returns to slot 1 or moves up to slot 5. Successive Clever, Determination, Hypnosis and normal-action returns use each step's current order; do not manufacture intermediate orders absent from the replay state.

- **Order: Direct glide.** The affected cards glide together from their previous positions to the new slots, with cubic ease-in/out, 480 ms at 1×. Numbered binder clips below the board stay in their fixed slots. Attached badges travel with a moving card.
- **Upgrade: flip in place.** Side I turns into side II around the card's vertical centre line (`rotateY` 0 to -180°, 650 ms at 1×, cubic ease-in/out). The card does not move, lift or slide while it turns: the only change in its box is the perspective (700 px) the turn itself causes. Both the full artwork and the small icon's blue/red border and Marine Worlds variant badge show the old side first and the new side after the half turn. If an upgrade and reorder share a state transition, the flip runs in the moving card (both motions together).
- **Sidebar tokens: Venom, Constriction and Multiplier.** A new badge glides from the invisible deck (the move bar's centre) into its exact attachment position. A removed badge glides back there. Use the existing distance-based pace: `650 ms * distance / 850 design pixels`, clamped to 650–1500 ms, cubic ease-in/out; fade in/out only at the first/last 10%. Duplicate tokens are matched as a multiset, so adding or spending one multiplier does not replace all multipliers. Surviving badges close any gap after the departing badge's flight (220 ms at 1×).
- **Tokens below the board: instant.** Venom, Constriction and Multiplier were already rendered on the full action cards. Keep their addition/removal immediate, including when that card is also moving or flipping. Do not run a second token flight to the board strip.
- **Hidden Control pane: still animate.** Sidebar flights and action transitions still use the locations the action icons/badges would occupy on Control when Log or Chat is selected. A specific attachment is not the info box's general `boxPoint`: `action-motion.js::withControlGeometry` briefly makes Control measurable with `visibility:hidden`, measures exact icon/badge rectangles, then restores the pane flags and inline visibility synchronously before painting. It does this before and after redraw, so newly added badges also have a real target. Never switch the user's selected tab, flash Control, or skip tokens because a hidden pane returns a zero rectangle.

Implementation: `action-motion-plan.js` produces public per-player action changes; `action-motion.js` captures old/final geometry and builds viewport-overlay copies with their rendered styling and local zoom preserved. `side-panel.js` and `zoo.js` attach action/token identity metadata. The existing `card-motion.js` animation registry owns all animations, hiding/restoring real targets, autoplay waiting, speed changes and interruption cleanup. The six animation-speed options scale durations and token-gap delays. Initial loads, backward navigation, reduced motion and concealed action orders show the final state immediately. No backend changes.

Validation: six action-plan regression tests plus 26 existing card-motion tests pass. Isolated Chromium ran the actual replay frontend against a saved replay response with additional synthetic Venom/Constriction/Multiplier add/remove states: 48 transitions across both players and Control/Log/Chat pane states, exact hidden token endpoints matching Control, both card sizes, immediate board tokens, cleanup, backward interruption, reduced motion, disabled board strip and all six speed settings. Further real-time checks verified natural completion, changing speed during playback, combined reorder/token changes with duplicate badges and gap closure, and hidden targets at 1366- and 1920-pixel viewport widths. Chat's hidden-pane check used a synthetic Chat pane in the replay page; a live multiplayer Chat session was not exercised. The browser cache was cleared and local test responses used `Cache-Control: no-store`.

## Autoplay = manual stepping (5 November 2026)

Autoplay must show exactly what a click on Next shows. The timer in `playback.js` only calls `stepBy(1)` when `cardAnimationsBusy()` (`card-motion.js`) is false; that function is the single place that says "a step may start". It is true while: a flight runs (`animations`), a tab visit runs (`tabVisit`), a CSS transition runs in `#dock` (`dockSettling`), or the reveal lightbox opens (`#draftbox.lbopen`). Any new timer or transition that changes where cards are measured must be added there, otherwise autoplay starts the next step from a state that a manual step never sees.

Display rules that follow from this: (1) a display card that keeps its slot is never slid, even if the board around it moved (the bar above the display grows or shrinks between steps); only a change of slot is a slide; (2) a flight of a display card is drawn dimmed when the real card is dimmed (`dim` in `shotOnScreen`, `ghost()`), so the greying of cards that cannot be taken happens at once, not as each ghost lands.

The display slots (tan plate + number tab) are static: they are drawn whether or not the slot holds a card, so a card that is hidden while its flight is under way never leaves a hole. Only a greyed-out (`.dim`) card hides the plate behind it.

Display flights pass behind the folder number tabs: `tabCovers()` redraws the tabs in the overlay (`.cm-tab`, above the flying cards) while the display's flights run. Any new display flight must run inside `runDisplay`'s span so the covers last long enough.

The tab covers (`tabCovers`) are made at the end of `afterRender` for every render in which the display's cards change, and last until the latest flight of that render ends (`flightEnd`). Size them with the tab's own zoom (`rect.width / offsetWidth`), never `scale()`: the display row is scaled separately from the page.

Zones: the hand and the endgame cards are two zones of the followed player. A zone whose tab is open flies into / out of its row (`run`); a zone that is not on show flies to / from its tab button, which blinks (`tabFlights`, `blinkTab`); nothing is added to a row that is not displayed and the tab is never switched. Endgame cards use `endgamePlan`; when one step discards and draws (Adapt) the discards play first and the draws follow (`plan.after`, `lead`). The other seat's endgame cards are backs of `BACK_EG` (`otherPlan` `egDeck` / `egDiscard`, discards first). The lightbox frames of Adapt show the endgame hand from before the effect (`frames.js`), so closing the lightbox is what triggers the flights.

Starting hands: always seat 0's deal, seat 1's deal, seat 0's discard, seat 1's discard, then the display. A jump over skipped steps (the other player's draw in a point of view) is split back into its steps (`openingSplit`, `ownStep`) and the parts are played in step order, then seat order. The endgame cards are part of the deal (after the cards). No tray is drawn before the followed player has cards in the setup; it slides in when that player's deal starts.

## Starting hands: steps
Both starting deals are one viewer step (`dealMerged` in `playback.js`); the discards of both and the first display replenish are the next step. Independent of the POV.


## Played cards into the closed drawer's chip
With the played-cards drawer closed, a played card flies to that board's "Cards N" chip (top edge of the board) instead of to the middle of the map, fading out as it lands; the count in the chip stays at the old number until the landing, then shows the new one and pops once (one pulse of scale 1.5 and brightness, 600 ms). A card that leaves the played cards (release, expedition) while the drawer is closed comes out of the chip, glides to the invisible deck with the bubble trail of a glided discard (800-1100 ms) and the count goes down with a pop as it leaves. Open drawer, tray and below-the-map layouts keep their behaviour. Code: `runPlayed()`, `drawerChip()`, `chipCount()`, `popNumber()` in `card-motion.js`, `playedRemoved()` in `card-motion-plan.js`.


## Association side: cylinders, partner zoos / universities, workers, cubes
Everything glides with the pace of a card (ease of `glideEase`, 650-1500 ms by distance, scaled by the animation speed); the real piece is hidden until its copy has landed.
- **Tracks:** a player's reputation / conservation cylinder glides along the track (conservation only while the move touches the first 10 points).
- **Partner zoos / universities taken:** from the supply tile on the association board to the slot of the player's strip; with the drawer out, to the small slot of the bottom row, resizing on the way. No green frame (the `tok-new` frame is removed for them).
- **Break:** missing supply tiles come from the invisible deck (95 ms apart); spent workers all glide home together.
- **Workers:** spent: icon in the player's info box -> slot of the task, the count drops as it leaves; gained: invisible deck -> icon, count +1 on arrival; Extra Shift / break: slot -> icon, count on arrival (the sidebar number keeps the old text until then, the flash comes with the new one).
- **Cubes:** a supported project's cube comes from the exact bonus space of the player's left panel whose bit is newly set in `flags.bonus_used`; with the drawer out (no panel, the bonuses are in the bottom row) it comes out of that bonus space in the bottom row (`data-abonus` in `assocbar.js`); donations come out of the eye (`.poveye`). A project card played in the same step arrives empty and the cube glides once the strip has unfolded (`landings` in `card-motion.js`).
Code: `assoc-motion-plan.js` (pure classification, tested in `tests/assoc-motion-plan.test.mjs`; tokens are told by type + place because ids are not stable), `assoc-motion.js` (`captureAssoc` before the render, `runAssoc` measures and returns `go()`, called at the end of `afterRender`); DOM hooks: `data-track`/`data-seat` (shared.js), `data-supply`, `data-wtask`/`data-wseat`, `data-dseat`/`data-dk`, `data-bcube`/`data-bseat`, `data-assoc-slot` (association.js, assocbar.js), `data-wk-seat` (side-panel.js), `data-pkey`/`data-pseat`/`data-pslot` (projects.js); `.cm-piece` in `card-motion.css`.
- **Order inside a step:** a spent worker goes first; every other flight of the step (cylinders, the partner zoo / university taken, cubes) starts when it has landed (a project cube: when the worker has landed and the project card lies in its strip).
- **The break at its lines:** the engine's state of the first break line already has the workers home and the supply refilled. `break-stages.js` (`stageBreaks`, called where `S.replay` is set in `main.js`; replays only) keeps the workers on the association board and the supply as it was until the lines "All workers go back to each player's reserve" and "Replenishing partner zoos and universities", so the flights happen at those lines.
- **A gained worker at its own line:** the engine has the worker from the step of the action that earned it (the animal, the reputation). `stageWorkerGains` in `break-stages.js` keeps it locked until the line "<name> gains a new Association worker", so the flight and the count change happen there.
