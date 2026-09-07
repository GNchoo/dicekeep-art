# W56 wizard glove

The approved assembly is a violet leather game character with brass trim and exactly five walking digits: thumb, index, middle, ring and little. Front thumb is screen-left; back thumb is screen-right. The side source follows the original right-facing three-quarter character reference. There is no flesh, blood or gore.

Two image-generation calls are recorded in [wizard-hand-generation-ledger.json](wizard-hand-generation-ledger.json), with exact prompts and original PNG hashes. The first source supplies all fifteen finger pieces. The second supplies only the three repaired palms; both originals are retained unchanged. Manual ROI, joint and body-socket picks are recorded in [wizard-hand-measurements.json](wizard-hand-measurements.json). The small shaded thumb cuff remains part of the leather source, and the attached finger overlaps it through all eight poses.

The earlier individual `wizard-hand-side-parts.txt`, `wizard-hand-front-parts.txt` and `wizard-hand-back-parts.txt` prompts are unsubmitted planning material. Only the combined three-view prompt and palm-repair prompt were actually requested, as recorded in the supplemental ledger.

[wizard-hand-review.json](wizard-hand-review.json) records the final review and hashes. All three 8-pose boards and three neutral stills were inspected. The fingers stay attached, upper links remain behind the palm, and the five phases maintain three or four supporting digits with at most two swinging. This is a finger bend plane; the shared QA field named `kneeAngle` does not describe a human knee.

Rebuild from the repository root:

```sh
node tools/art-review/directional-101/middle-waves/wizard-hand-measure.mjs
node tools/build-directional-art.mjs --config=tools/art-review/directional-101/middle-waves/wizard-hand-rigs.json --out=gen/middle-wizard-hand
node tools/check-directional-art.mjs gen/middle-wizard-hand --require-ready
node tools/preview-directional-motion.mjs gen/middle-wizard-hand
```

The final build has 3 views, 24 walking poses, 3 neutral PNGs, 3 inline WebP fallbacks and 6 runtime PNG files. Four-direction moving QA covers 20 direction/digit traces, 336 contact-pose captures, 10,752 continuous contact samples and 480/480 composite texture-proximity samples. The moving GIF contains 24 movement frames across three cycles plus one marked reset frame.

Captured contact poses have zero measured residual. Held sprite frames have up to 6.66015625 output-PNG pixels of excursion, below the 6.875-pixel one-frame limit. These are 256-cell output pixels, not game-screen pixels and not a claim of continuous zero slip. Actual game integration is verified separately by the release owner.

For the final release audit, include `gen/middle-wizard-hand` as an explicit build directory and add `--ledger=tools/art-review/directional-101/middle-waves/wizard-hand-generation-ledger.json`. Its 2 requests are supplemental to, and not duplicated in, the shared middle-wave ledger.
