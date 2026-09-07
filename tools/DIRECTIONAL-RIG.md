# Directional puppet builder

`node tools/build-directional-art.mjs --config=tools/art-review/directional-101/pilot-forest-rigs.json --out=gen/directional-pilot`

`node tools/check-directional-art.mjs gen/directional-pilot`

`node --test tools/rig-test.mjs tools/directional-rig-test.mjs`

The builder writes into its selected output directory. It does not promote assets, edit gameplay, or mark unreviewed artwork ready. The checked-in pilot config supplies measured coordinates for the actual squirrel/fox part atlases. `legacy-wide-rigs.json` supplies the seven existing ground rigs with a wider stride; these entries deliberately contain only a side view and remain unready.

## Input and coordinates

The root input is `{version:1, canonicalCell:512, assetVersion:93, entries:[...]}`. Source paths resolve from the repository root. Every source atlas requires its SHA256. All part regions are normalized rectangles in that source image. Region borders must lie in empty gutters; disconnected large pieces and cropped parts fail preparation. White/checker backgrounds are removed only by the existing edge-connected mask; reviewed enclosed gaps may be listed in `backgroundSeeds` in original image pixels.

An entry has `assetId`, `wave`, `role`, `locomotion`, `cell`, `referenceHeight`, `cycleStride`, `reviewApproved`, and `views`. IDs are `w001`, `b010`, or `b020-2`, and their numeric portion must match the wave. Roles are `normal`, `boss`, or `secondary`. Normal cells are256px and boss cells512px. `referenceHeight` and `cycleStride` use canonical units, shared across all views. The full cell is resized once; no per-frame centroid, area, or height normalization is applied.

Each `side`, `front`, or `back` view supplies:

- `source`, `sourceSha256`, `background:'checkerboard'`, optional `backgroundSeeds`.
- `pivot:[x,y]` in the canonical512px cell. This is the game placement/ground reference, not the lowest nontransparent pixel; tails are never used automatically as feet.
- `body:{roi:[x,y,w,h],target:[x,y,w,h],layer:0}`. The target rectangle is canonical cell coordinates, and must retain the source body aspect ratio within1.5%. Body target scale is fixed over the cycle.
- Alternatively, `body.target:{height,top,centerX}` derives a single width from the trimmed source aspect ratio. This is not a per-frame fit.
- A corrected torso may use `body.source`, mandatory `body.sourceSha256`, optional `body.background/backgroundSeeds`, and a `body.roi` measured in that separate source. Legs still come from `view.source`. Both original sources and hashes are retained in QA provenance and checked independently; no merged synthetic source is substituted for either original.
- `parts:[...]` and optional `layerOrderFrames`, which explicitly lists `body` and every part ID exactly once for each output frame.

`socket` values below are body-local canonical coordinates. `socketRoi` is a reviewed body-local canonical rectangle. Source joints and pivots are normalized inside the **trimmed opaque part bounding box**, not inside the larger source atlas region.

## Articulated legs

Use `locomotion:'legged'` for2/4/6/8 legs and8frames in a4×2 sheet. Each part contains:

`{id:'leftFore',type:'leg',roi,sourceJoints:{hip,knee,ankle,sole},socket,socketRoi,legScale,standingReach,phase,layer,bend}`.

The isolated leg source runs downwards from hip to knee to ankle to sole. IDs preserve physical left/right and fore/hind identity across views. `legScale` calibrates the source once. Bone lengths are derived from the source joints and that fixed scale. `standingReach` is the neutral vertical hip-to-ankle distance in the unprojected sagittal plane. `bend` is+1 or−1 in that same plane. `phase` is a cycle offset in[0,1). A biped uses opposite offsets. A quadruped walk uses four distinct footfalls, for example leftHind0,leftFore.75,rightHind.5,rightFore.25, and at least two feet in support throughout.

Physical left/right is the animal's left/right, not repeated screen labels. A physical left leg appears on screen-right in front, screen-left in back, and behind the right leg in the right-facing side source. The builder checks these socket/layer relationships and requires identical limb IDs and phase offsets across all provided views. `leftFore/rightFore/leftHind/rightHind` and `leftLeg/rightLeg` are the standard IDs. Keep fore/hind identity through corners.

An individually authored side leg facing the wrong way may use reviewed `flipX:true`. Input `sourceJoints` stay in the original trimmed source coordinates. The builder mirrors both bitmap and joint x coordinates before computing links, foot offsets and calibration. Original source ROI/hash and the reflection flag remain in provenance; reflection does not change bone lengths or the physical limb ID.

For repeatable input, `socketNormalized:[u,v]` and `socketRoiNormalized:[u,v,w,h]` are converted from the trimmed body rectangle to canonical body-local pixels. The reviewed ROI must still contain the socket. Instead of specifying `legScale/standingReach`, `calibrate:{groundY:460,maximumStanceAngle:168}` solves one fixed scale and neutral reach from the specified ground level and maximum stride pose; it preserves the authored upper/lower length ratio. It does not approve anatomy. Inspect each source joint's horizontal coordinate independently; copying the same x into asymmetrical legs can expose a triangular knee seam.

The approved forest template uses `body.layer:10`, lower fore/hind layers `1/-1` according to view depth, and upper limbs behind the body (`upperLayer:-3` or below body). The default upper layer is always below its body. Front/back upper thigh caps must be occluded by the torso. `proximalFeather:.18` and `proximalEdgeFeather:.09` are optional reviewed attachment cleanup, tapering out at the knee. They do not alter sole pixels or extend bones.

Entry `gait:{stanceDuty:.65,lift:16,pelvis:'fixed'}` is appropriate for a calibrated quadruped. A biped uses `.5` duty and `pelvis:'support'`. Its preferred pelvis path is constrained to feasible support angles rather than stretching the bones. A wider cycle needs a newly verified pose trajectory; multiplying runtime stride alone creates sliding. `proximalFeather` is an optional small fraction of upper-leg length for a reviewed attachment seam.

The joint solver uses the unprojected forward/down plane. `projection.forward` is[1,0] for side,[0,1] for front,[0,−1] for back; the default height axis is[0,1]. It is deliberately not legal to shrink the forward axis to hide a mismatch in game travel. Projected bone textures may foreshorten along their length while retaining calibrated width. A knee angle measured on a front/back PNG is not the anatomical knee angle. Apparent overlap and anatomy still require visual review.

The builder checks256 phases before rasterization: finite reachable joints, fixed bone lengths, support/swing alternation, meaningful relative foot motion, lifted swing, biped support160–175°, and projected foot contact after the corresponding root advance. Those exact geometry checks do not prove zero slip between the eight displayed raster poses. Actual game-canvas contact/turn checks remain a separate runtime task.

In front/back views, an end-on bone strip shorter than2 canonical pixels is culled instead of compressing a full-length texture into a horizontal hairline. Its rounded adjacent joint/foot pieces remain. This affects raster visibility only, not IK or contact; each occurrence is recorded in `rasterDiagnostics`. The W18 front third-pose regression checks the actual pixels of the previously detached line.

The explicit `anatomy:'hand'` walking exception requires exactly `thumb/index/middle/ring/little`, five distinct phases, at least three supporting digits and no more than two in swing at all256 samples. Suggested phase offsets are0/.2/.4/.6/.8 and duty.7. It does not add a sixth digit. Compatible source fields `hip/knee/ankle/sole` mean finger root/middle/tip-base/contact-tip for this anatomy; a reported middle bend must not be called a human knee angle. Other legged profiles retain the2/4/6/8 rule.

An explicit six/eight-legged `anatomy:'arthropod'` with fixed pelvis may set per-leg `heightAxis:[x,y]`. It must be a downward unit vector with `|x|<=.65`; use opposite x signs for left/right screen splay in front/back views. Calibration divides the requested vertical ground depth by axis y before solving one fixed source scale. Source joint lengths and contact checks remain in sagittal coordinates, and the game progress axis remains unchanged. `leftLeg1..4/rightLeg1..4` retain physical partner and screen-side validation. This option does not stretch a limb independently in each frame.

## Other locomotion

- `flight`:4frames,2×2. Requires at least two parts of type`wing`. Each has `roi`, body-local `socket`, normalized `sourcePivot`, fixed `scale`, `angleDeg:[mean,amplitude]`, `phase`, and `layer`. Wings must articulate relative to the torso. Other articulated ornaments may use type`appendage` with the same fields. A whole-body bob cannot pass as flight.
- `slither`:8frames,4×2. Requires at least three type`segment` parts in chain order. Each has `roi`, normalized `sourceJoints:{start,end}`, `socket`, `scale`, `angleDeg:[mean,amplitude]`, `phase`, and `layer`. The first socket attaches to the body; subsequent starts equal the previous endpoint. At least three phase offsets and a traveling bend are required. Mean angles and source texture orientation are authored separately for each view. This is a jointed segment model, not a deformation of an arbitrary unsegmented whole snake.
- `float`:4frames,2×2. Explicit hovering profile with entry`hover:{lift,roll}` in canonical pixels/degrees; optional articulated appendages. It does not claim walking, wings, or planted feet.

Flight and float may set `cycleStride:0` and positive `cycleSeconds` (runtime default .8 seconds). The builder passes the optional cycle time through. Wing/appendage `flipX:true` reflects source art about its unchanged sourcePivot, in socket-translation → angle-rotation → signed-scale order. Segment reflection mirrors the bitmap and source start/end together before attaching to the unchanged chain endpoints. Non-boolean `flipX` is rejected.

`body.flipX:true` is an explicit reflection of the isolated body bitmap, retaining original source SHA/ROI/bounds and recording the reflection in provenance. Body-local limb sockets are authored against the resulting reflected body; they are not silently remapped. This supports reviewed left/right equipment corrections without inventing a replacement source file. Non-boolean values reject.

For a separately reviewed RGBA extraction, `background:'alpha'` preserves the existing transparency and white/pale foreground without running the color flood again. It requires a real input alpha channel and rejects simultaneous background seeds. Original and derived file provenance must remain recorded by the producing workflow. Checkerboard/runtime extraction behavior is unchanged.

## Batch input templates

The config may contain `templates:{quad:{...entryDefaults}}` and entries with `template:'quad'`. Nested objects merge; arrays such as parts replace in full. Source paths and hashes are still explicit. Template approval is never inherited: every entry needs its own explicit `reviewApproved:true` after review. An optional per-view `atlasRow:[top,height]` maps that template's normalized body/part ROI y and height into a row, preserving the normalized source joints. Row gutters must pass the normal clip checks. Unknown templates and out-of-image rows reject.

Sources with only a finished whole character are insufficient for legged, flight, or slither production. They can serve as visual references, but cannot be silently converted into approved locomotion by bobbing the whole image.

## Existing side rigs

The W4/W8 side flyers use the restricted `legacySheet` adapter, with `reviewedExisting:true`, exact existing `source/sourceSha256`, `cols:2,rows:2,frames:4,anchor:'center',stillFrame:0`. It applies the existing game loader stabilization once and pads the result into the canonical cell. W4 uses referenceHeight328 and pivot[255.5,420]; W8 uses288 and[256,400]. Both retain cycleSeconds.8 and cycleStride0. Every preserved pose is compared pixel-for-pixel against the actual game `processSheet` function in the browser regression. This adapter cannot be used for newly generated flight art or different IDs. The still is explicitly the first preserved flight pose.

An approved flight swarm may declare `body.componentCount:3`. The source remains SHA-pinned, the extraction must contain exactly three substantial connected bodies, and each must occupy at least5% of the body's foreground. Other anatomy, extra components, and a tiny third noise fragment reject. Ordinary parts retain the single-component requirement. Measured component areas are included in provenance.

A legged side view may instead contain `legacyRig:{config:'tools/art-review/pr29-gait/rig-config.json',wave:2,strideMultiplier:1.5,overrides:{supportCurve:'constraint-envelope'}}` plus `pivot`. This reuses the existing source extraction and renderer. Default old configs retain their previous poses. The optional support curve uses a161–174° envelope inside the existing160–175° acceptance band. The two current quadrupeds require separately reviewed fixed body-height adjustments for1.5×reach; see the explicit overrides in `legacy-wide-rigs.json`.

The seven legacy `referenceHeight` values are the old game loader's crop heights (192/446/449/440/295/445/424), not a common460. Thus the old and new source-pixel-to-game-pixel scale is identical and world stride is exactly1.5× at any draw size. Adding front/back to a legacy side requires `legacyRig.limbIds`, e.g. `near:'rightLeg',far:'leftLeg'`, or corresponding fore/hind mappings. Those mapped physical IDs and phase offsets must match the new directions.

## Output and readiness

`directional-art.js` assigns `window.INF_DIRECTIONAL_ART={version,entries}`. Each runtime entry supplies role, locomotion, referenceHeight, cycleStride and views. Each view supplies `still`, `sheet`, `frames`, `cols`, `rows`, `cell`, `pivot`, `scale:cell/canonicalCell`, and an inline transparent64×64 lossless WebP`fallback` from the same final neutral still. When drawing fallback pixels, convert pivot and pixel scale by64/cell. Paths are relative to the selected output root and must be promoted together.

After wave101 the original combat roster repeats. Its slot10 at W111/W212/... spawns two combat bosses, although the first W10 has one. Appearance code111 therefore retains the secondary role and shares approved `b010` rat-king art, with the normal0.7 secondary drawing scale and a `부관` name. This uses the existing nineteen boss assets; it does not create a `b010-2` asset or change the secondary's legacy combat type, health, speed, rewards, or spawn count.

Zero-stride flight/float retain the game's established animation clock: local `animT` advances by forward distance/38. Their `cycleSeconds` is measured in that clock, not necessarily wall-clock seconds. Spectators undo the source-to-view lane-length scale before applying the same increment, so observed slow/stun also changes or stops the wing/hover phase. Network positions are integer pixels and arrive in summaries, so status observation has that existing latency and quantization. Snapshot phase corrections still reconcile the last transmitted pose. Cache retry limits count consecutive failures; successful PNG decoding resets that count even after earlier successful loads and evictions.

Run `node tools/e2e/directional-review-regressions.cjs` against the local game to verify54 flight/float cadence cases (normal/slow/stun, speeds1/3, three path scales), repeated-boss local/spectator identity, and real-PNG recovery after three successful evictions followed by a transient failure. It writes `gen/e2e/directional-review/directional-review-regressions.json`; set `E2E_BASE_URL`/`E2E_OUTPUT_DIR` to override locations.

`ready:true` requires all three views to finish technical checks and input`reviewApproved:true`. A technical pass never sets the review flag itself. Partial pilots remain unready. The checker’s optional`--require-ready` fails on any incomplete or unreviewed entry.

Outputs also include labeled review boards/GIFs, `directional-qa.json` with source hashes, image hashes, landmarks and geometry results, and `directional-validation.json` from the checker. The checker decodes every output, checks grid/scale/pivot, verifies all64px fallbacks, and rehashes the source atlases. Review GIF timing is a declared display cadence; runtime cadence is driven by actual game motion and the common cycle stride.

Every walk pose, neutral still and decoded64px fallback must contain sufficient opaque foreground and have zero nontransparent edge pixels above the declared alpha threshold. Negative fixtures cover blank and clipped neutral/fallback images. Synthetic flight/slither/float fixtures exercise the real Chrome Canvas raster path, and the wing reflection test measures actual texture pixels about a fixed socket. Synthetic fixtures are test inputs, not production artwork.

`node tools/preview-directional-motion.mjs gen/directional-pilot` reads the baked sprite sheets and renders three cycles in four directions over a fixed grid, with a separate reset screen. Each character uses a constant256px review cell, including bosses; that display scale is recorded. `directional-moving-qa.json` separately records planted-pose capture residual and continuous held-frame contact excursion at256 samples/cycle. Eight displayed poses necessarily produce a sawtooth error bounded by one frame's root travel; do not call that all-time zero slip. Texture-near-sole probes are recorded as proximity, not proof of the physical identity of an occluded limb. Final gameplay, corners and visual approval remain separate.

The moving preview also accepts slither, flight and float. Slither uses its declared distance stride. Flight/float use the declared time cycle and a labelled review travel of `.4*referenceHeight` per cycle; that travel is not a measured game speed. Non-legged reports check complete recorded phase sequences and distinct decoded raster poses, with contact assessment explicitly inapplicable. All review panels are fitted to the actual foreground bounds at every displayed frame; fitting changes the board space, never the sprite scale.
