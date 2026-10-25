# Kangaroo change specification

## Scope

The eight approved animated views are implemented in `web/js/landing.js`. This revision changes kangaroo drawing helpers, initialization markup and routing only. Other animals, page controls, styling and replay functionality are unchanged.

## Artwork and directions

The approved red and umber models retain the rounded torso, slightly extended snout, paws, outlined thighs and articulated tail. The profiles include the approved integrated shoulders. Rear and frontal views use the refined proportions; rear diagonals have continuous necks without facial features, and front diagonals have foreshortened faces and integrated thighs.

Bearings use map coordinates, increasing clockwise from up:

| Bearing | Travel | Model |
| --- | --- | --- |
| 0 | Up | Rear |
| 45 | Up-right | Rear three-quarter |
| 90 | Right | Profile |
| 135 | Down-right | Front three-quarter |
| 180 | Down | Front |
| 225 | Down-left | Mirrored front three-quarter |
| 270 | Left | Mirrored profile |
| 315 | Up-left | Mirrored rear three-quarter |

Every moving hop follows an exact supported bearing. Facing is calculated from its actual endpoints, selected before take-off and held through landing. In-place safety hops retain the previous facing. The root SVG group exposes `data-direction` for inspection. These are eight illustrated views, not a continuously rotating 3D mesh.

`ROO_SCALE = 0.830894` remains unchanged: the standing profile is approximately 102 map units tall, about 80% of the crowned adult emu. Other views share this scale.

## Animation and rendering

- Nine interpolated poses animate loading, push-off, tucked flight, reaching, landing compression and settling. Cycles remain 1,100 ms with no standing rests. Animals start at different phases.
- Map travel occurs between 26% and 76% of the cycle, planting the feet during loading and landing. Elapsed time carries into the next cycle.
- Tail geometry and shading bend together, with separate mid-tail and delayed tip movement. Directional limbs and heads use the approved mock animation.
- Each animal lazily caches five unique SVG view trees; mirroring supplies three additional bearings. Only the active view is displayed. Animation updates cached path and transform attributes rather than rebuilding markup each frame.
- Reduced motion keeps both animals visible and does not schedule the kangaroo animation loop.

## Routes and clearance

- The cached visibility graph uses an 8-unit lattice and cardinal/diagonal edges. This finer grid preserves narrow passages that a 16-unit directional grid disconnected. Edges reach 100 units, or 160 near the creek. A binary heap searches routes; a small per-edge cost favors longer stretches.
- Distant reachable destinations favor distance, forward travel and locations not visited recently. Nominal stride targets remain 150-190 units. The planner looks up to 230 units ahead and can merge waypoints only when the resulting hop is clear and exactly cardinal or diagonal. Landings stay on the lattice. Tight corners, route ends and dry landing requirements can require shorter hops.
- Ground positions retain the northern `lawnTopAt(x) + 140` buffer, the bounds `82 < x < 1838`, and `y < 1000`, with conservative cell clearance.
- The emu lane remains a curved exclusion area with a 140-unit vertical gap and rounded 90-unit end caps. Kangaroos may travel around its ends into outer lawn areas below y=800, but cannot cross the excluded lane.
- Static checks retain 8-unit cells, blocking every cell touched by scenery discs, boxes, ellipses and canopies at the existing sample heights.
- Pond interiors and sampled outlines retain a 33-unit radius covering the 32-unit margin and sampling uncertainty. Creek cells retain a 45-unit radius; crossings require dry landings.
- Graph edges and hop segments traverse every crossed cell, including diagonal corner contacts and travel along boundaries.
- Both trajectories retain 114-unit separation. Closest approach is solved between take-off and landing boundaries through the later landing.
- Blocked routes replan around the other kangaroo, then try a safe yielding hop. Yielding also obeys the eight bearings. When every checked exit is blocked, the kangaroo keeps hopping on its safe patch with its previous facing.

## Validation: 2026-10-23

- JavaScript syntax passed. Source outside the kangaroo helper, markup and controller regions was checked unchanged.
- 1,616 pose comparisons (101 phases, eight bearings, two coats) matched the approved mock artwork exactly. SVG node reuse, one active view and mirroring passed.
- Three ten-minute simulations (seeds 1234567, 42 and 8675309) exercised every bearing: 54,000 frames and 3,276 planned hops. Every moving hop was cardinal or diagonal and used its matching model. Cycles remained continuous; no in-place hops occurred in the normal runs.
- Separation, dry landings and independent scenery/pond checks held along all tested hops. No blocked emu-lane cells were crossed. A two-unit scan of 315,720 positions found no accepted landings rejected by the exact scenery or pond-margin checks.
- Travel coverage was approximately 704 by 632 map units east and 232 by 424 west. Mean moving strides were 86-87 and 106-109 units respectively. Exact eight-way travel needs more cornering than unrestricted bearings; scenery can require shorter strides.
- Three additional five-minute head-on simulations covered 27,000 frames and 1,641 hops. Separation, clearance, continuous cycles and correct facing held. There were two in-place safety hops in total.
- Reduced-motion initialization kept both animals visible and scheduled no kangaroo animation frames.
- A separate 808-pose rasterized silhouette check covered all bearings at half-unit resolution, including outline pixels. Using a conservative 0.337 hedge slope (above the actual maximum), the largest required northern buffer was 137.76 units, within the retained 140-unit buffer. This is a sampled geometry check, not a formal continuous bound.
- The installed localhost page rendered both coats and changing views in Chromium without console warnings or errors. Forty-five live DOM samples gave 49 moving comparisons with no facing mismatch, no malformed geometry and exactly one active view per animal.
- Simulations use numerically sampled SVG water geometry and a synthetic DOM. Cross-browser certification was not performed.

For visual review, watch view changes during grounded loading, paw silhouettes, tail follow-through, routes near the hedge and lane ends, and yielding when animals approach one another.
