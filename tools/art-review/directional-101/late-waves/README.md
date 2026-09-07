# W61–101 directional artwork

This package supplies all **45 catalog identities** in waves61–101:37 ordinary monsters,4 main bosses and4 secondary bosses. Each identity has independently authored side, front and back artwork; runtime mirrors the side for the fourth direction. The final catalog includes W101. Korean names and roles remain those of `../production-catalog.json`.

The approved inputs are `all-rigs.json` and the five `*-rigs.json` files for float, flight, biped, quad and slither. Their final combined output is `gen/late-directional`. There are21 bipeds,6 quadrupeds,9 winged flyers,5 explicit hoverers and4 segmented slitherers. Legged and slither entries use8 poses; flight and float entries use4. No whole-body hover is counted as walking or winged flight.

## Reproduce and validate

Run from the repository root:

```powershell
node tools/art-review/directional-101/late-waves/combine-rigs.mjs
node tools/art-review/directional-101/late-waves/validate-package.mjs
node tools/build-directional-art.mjs --config=tools/art-review/directional-101/late-waves/all-rigs.json --out=gen/late-directional
node tools/check-directional-art.mjs gen/late-directional --require-ready
node tools/preview-directional-motion.mjs gen/late-directional
node tools/art-review/directional-101/late-waves/audit-boards.mjs gen/late-directional
node tools/art-review/directional-101/late-waves/roster-review.mjs gen/late-directional
```

These commands use existing originals and deterministic extraction/rendering; they do not invoke an image API. Individual `make-*-rigs.mjs` scripts are preparation tools and deliberately reset their output review flags. Do not replace a reviewed config by a preparation run and silently retain an old approval.

`gen/late-directional/directional-validation.json` verifies decoded sprite sheets, neutral stills, inline fallbacks, borders, pivots and source hashes. `directional-moving-qa.json` records four-direction, three-cycle motion from the actual baked PNGs. Labeled per-view and all-view boards plus moving GIFs are in its `review/` folder. The five `*-visual-review.json` files record the independent art decisions and practical limits.

## Originals and cost record

`generation-ledger.json` records50 actual builtin image-generation requests:22 turnaround requests and28 part/correction requests. The user requested multiple characters per call; normal groups use up to4 identities, with compatible bosses paired. Each immutable raw PNG is in `sources/`, with its exact prompt in `prompts/`, actual dimensions/channels, SHA256, references and original tool output path. Monetary cost was not reported by the tool; `null` does not mean free. No CLI image API was used.

Many supplied PNGs are RGB with a painted checkerboard, not transparent images. Extraction uses the reviewed edge-connected mask and source-pinned seeds for enclosed empty pockets. The frost fairy's neutral silver hair is protected by reviewed interior masks that restore the original RGB pixels. Eighteen derived PNGs preserve explicit source rectangles/hashes in `eye-extraction.json`, `fairy-alpha-extraction.json`, `biped-normalization.json` and `slither-extraction.json`; alpha inputs bypass the background color flood. `validate-package.mjs` rehashes all50 raw originals,50 prompts,79 references and18 derived files.

Atlas approval applies to the selected components used in the final composites. Failed or superseded body cells remain in the immutable source for provenance. In particular, the first quadruped torso correction retained inappropriate leg/bust shapes in some cells; the later body-only correction replaced those cells. Bird torso and lizard/cockatrice/dragonkin identity corrections preserve the remaining good limbs and equipment. No failed atlas is treated as a complete production sheet.

## Visual scope and limits

Every final side/front/back pose was inspected for silhouette, head/rump/tail orientation, physical limb identity, foot alternation, equipment side, alpha residue and clipping. The style uses painted fantasy armor, intact fur/scales and readable character proportions. It excludes wounds, exposed flesh, blood and photographic body horror. The void tentacle is a smooth violet game creature with a charm; the hell worm has a contained crystal mouth.

Bipeds have articulated leg exchange and passing poses, with the torso hiding proximal caps. Quadrupeds preserve the full horizontal trunk and distinct fore/hind limbs. Near-side shoulder/haunch cutouts overlap the torso with feathering; front/back upper limbs remain behind the body. Flight uses actual wing pivots. Slither uses three connected bands with distinct traveling phases, including the upright tentacle shaft. The tentacle's back base specifically uses the existing plain rear drawing: the repeated front pendant in the other atlas was rejected. Per-piece source provenance records that substitution.

These are painted articulated cutouts. Enlarged views can reveal joint/band texture seams; fur, cloth, weapons and necks generally remain part of the fixed body drawing. Eight displayed poses have a bounded held-frame contact excursion even when the sampled planted pose is exact. The moving report separates those quantities and does not claim continuous zero slip. Flight/float preview translation is explicitly a review distance, not measured game speed. Final game loading, turns, crowd readability and publication are validated by the integrating task.

`quad-prototype-rigs.json`, `make-biped-rigs.mjs` and `preview-other-motion.mjs` are historical preparation/review helpers. The approved `all-rigs.json`, five current rig configs and shared moving tool above define the production path.
