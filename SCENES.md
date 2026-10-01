# Local scene navigation and inclined orbits

Release packaging: the application code/data match c227325. Validation PNG/WebM files and their historical commits are excluded from this release. Historical before/after comparisons require the preserved local development checkout; npm test and the Pages build use portable source/data.

This update starts from `87fef11`; it preserves the 73 real records, their IDs,
vectors, dates, evidence categories, URLs and schema-v1 export. WebGPU retains
the `f2ee556` runtime correction (Transformers 3.8.1 / ONNX Runtime 1.30.0).
No repository push, Actions run or deployment was performed.

## Presentation and navigation

The bounded follow-up to `b7fb1b7` shows two interactive layers together in
macro views: primary ranges/entities and real immediate children of visible
primary scopes. It expands at most eight visible parents, coalesces geometry
loads with at most four pending jobs and never recursively previews a third
layer. Each visible parent gets 3–4 representatives (up to six on hover), chosen
from actual children by visible focus and membership. Main labels have priority;
colliding secondary labels are hidden while the entity remains pickable. Soft
nebula boundaries remain ranges. System and planet views already show their
current body plus event/satellite children and do not add another layer.

`npm run test:two-layers` bundles the complete old `b7fb1b7` source tree for a
real before/after browser comparison. At 73 records the universe view changes
from four halos to 4 main ranges + 10 adjacent representatives (five entities).
At 1k/10k it shows 8 + 24 nodes; a 390px viewport remains within its 48-node
default budget. This intentionally increases overview work to make the scene
more informative: final measured 10k median/P95 changes from 0.3/0.5 to
0.7/1.1 ms, rather than claiming another speedup. Final figures are in
`verification/two-layers-browser-results.json`. Nodes and aggregate card counts
are derived from real source records; there is no fabricated sparse-scene filler.

`presentation.js` maps the semantic forest to universe, galaxy, optional soft
nebula/region, system, event planet and source satellite scopes. A nebula is a
density range containing systems; it is not a universal parent or orbital
centre. Some systems are directly inside a galaxy. Event planets with no source
do not have empty terminal scopes.

`SceneView` renders only the current scope and a bounded page of next-layer
previews. Single click opens a nonmodal card, double click enters, targeted
wheel/pinch zoom enters or returns using separate thresholds and a cooldown.
Dragging does not select. Closing a card preserves the camera. Chinese search
uses a compact global route index to enter the target system and highlight its
event without forcing that event into the universe overview. Touch users can
enter through the card button; breadcrumbs and back/home buttons remain usable.

Catalogues store child display geometry in `data/scenes/` and fetch it along
the visited route. Document/source shards remain lazy and export hydrates all
documents/vectors. The global text index and original semantic forest are still
linear, resident data; this implementation does not claim fully paged search
or semantic storage. Offline standalone/imported graphs derive their scopes
locally because their complete graph is already present.

## Motion

Semantic positions never change. Display positions use seeded inclined 3D
elliptical Kepler orbits: planes vary between systems with smaller variation
within a system and for satellites. Source motion composes with its parent
planet motion, and projection, trails, hit testing and labels use the same world
position. Pause/resume/speed/reset and local reading pause use the existing
delta-time clock; reduced-motion preference disables orbits by default. Macro
galaxies and density ranges are static. This is illustrative local orbital
motion, not an astronomical distance/time scale or an N-body simulation.

## Reproducible verification

Run `npm run build`, `npm test`, `npm run check:pages`, `npm run test:browser`
and `npm run test:scenes`. Set `COSMOS_CHROMIUM` to the installed Edge executable.
For full-viewport recording, install Playwright's pinned capture helper into a
task-specific temporary `PLAYWRIGHT_BROWSERS_PATH` (`playwright install ffmpeg`);
no new project dependency is required. `test:orbits` now runs the consolidated
scene suite; the old orbit browser script describes the previous global view.
Unit tests have 10-second item timeouts and a 30-second watchdog. Scene and
compatibility browser runs have 240-second watchdogs; scene inference has a
60-second timeout per backend.

`verification/scenes-browser-results.json` records real 73-row WASM/hardware
WebGPU inference (nonfallback NVIDIA Lovelace adapter, 4897 GPU submissions),
aligned vector cosine minimum 0.99564, Chinese search/card/route checks, lazy
geometry, 390px touch/reduced-motion and 4x CPU throttle. Existing browser
compatibility covers original 29 records, NPY C/Fortran layouts, import/export,
IndexedDB, invalid/empty/duplicate input, offline reload and standalone HTML.
Visibility/freeze clock behavior is covered deterministically; Edge did not
expose a reliable actual desktop minimize/background transition in the earlier
probe, so that transition is not claimed as a passed hardware/browser check.

The stress fixture is synthetic, seed 42, dimension 64, at 1000 and 10000
records. The scene suite rebuilds the exact old `87fef11` app and compares the
same input/viewport to the new app. The old mixed frontier draws 594 previews;
the new selected systems draw 6 / 29. Earlier measured draw median/P95 changed
from 3.3/4.1 to 0.2/0.3 ms at 1k, and 3.8/4.1 to 0.5/0.6 ms at 10k. The gain is
primarily the smaller useful visible workset, not embedding cache acceleration
or a same-glyph rendering kernel comparison. Final run numbers are authoritative
in the JSON report. No 100k performance claim is made.

The real `semantic-cosmos-scenes.webm` records the entire browser viewport,
including HTML cards and breadcrumbs, through universe → galaxy → soft range →
system → event/source cards → zoom out. PNGs are genuine browser captures.
GitHub Pages still uses `.github/workflows/pages.yml`; this code-only release uses the user-authorized existing Actions workflow. The
recordings remain local and are not part of the published repository.
