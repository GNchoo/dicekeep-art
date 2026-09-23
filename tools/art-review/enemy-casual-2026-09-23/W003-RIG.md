# W003 grave ogre — clean casual, three-view walking rig

Infinity wave 3's hooded green ogre keeps its club, leather vest, and heavy boots. The source art was edited with Codex's built-in image generator. No API key was used. The output is simplified into broad matte color shapes and a warm dark outline to match the clean arena and towers. The upper body stays rigid during locomotion; the two independent legs articulate from the hips and bend forward at the knees.

## Reviewed sources

- [`w003-side-puppet-casual-source.png`](w003-side-puppet-casual-source.png) — 1254² transparent RGBA, exactly three isolated parts: right-facing body/club, near leg/boot, far leg/boot. Edited from `tools/art-review/pr29-gait/sources/w003-puppet.png`; the W002 casual puppet was a style-only reference.
- [`w003-front-back-original-crop.png`](w003-front-back-original-crop.png) — the W003 row (y=375..675) cropped from the existing `legacy-biped-01-front-back-parts.png` atlas for the front/back edit target.
- [`w003-front-back-puppet-casual-source.png`](w003-front-back-puppet-casual-source.png) — 2172×724 transparent RGBA, exactly six isolated parts: front body, front legs, back body, back legs. Edited from the W003 crop; the new side puppet was a style-only reference. Two one-pixel stray alpha components from generation were removed without changing the six drawn parts.
- [`w003-side-legacy-config.json`](w003-side-legacy-config.json), [`w003-directional-rig.json`](w003-directional-rig.json) — derived by [`prepare-w003-rig.mjs`](prepare-w003-rig.mjs) from the existing W003 walking geometry and the new pinned source hashes. The manifest schema stays at version 93, and each of the three new views has `assetVersion: 128`. The front/back legs retain the v110 forward-knee `bend: -1` correction.

The new ogre is intentionally stockier than the previous painting. The side leg scale is 0.31 so the hood and boots fit the 512px canonical cell. The front/back six-part regions were measured independently. The 8-pose sheets and the 50px game-size preview were inspected for leg separation, forward knees, common ground contact, and uncut boots before setting `reviewApproved: true`.

## Build and review

```powershell
node tools/art-review/enemy-casual-2026-09-23/prepare-w003-rig.mjs
node tools/build-directional-art.mjs --config=tools/art-review/enemy-casual-2026-09-23/w003-directional-rig.json --out=gen/enemy-casual-w003-build
node tools/check-directional-art.mjs gen/enemy-casual-w003-build --require-ready
node tools/preview-directional-motion.mjs gen/enemy-casual-w003-build
```

Validation on 2026-09-23: one ready entry, 12 decoded files (three directions × still/8-frame sheet), zero check errors; the independent motion preview passed. At 50px the front/back boots alternate without occluding into one leg; the side stride reads as an ogre's shorter, heavier walk. No source part or rendered boot clips the cell. [`Three-view comparison`](w003-three-view-comparison.png), [`24-pose contact sheet`](w003-walk-contact.png), and [`moving preview`](w003-moving-preview.gif) show the rendered output against the new arena.

## Exact generation prompt: side three-part puppet

Input image 1: `tools/art-review/pr29-gait/sources/w003-puppet.png` — **edit target/identity and three-part layout**.  
Input image 2: `w002-side-puppet-casual-source.png` — **style-only reference**.

> Use case: style-transfer. Asset type: editable 3-part cutout puppet atlas for Dicekeep Infinity wave 3 grave ogre walking right in side view. Image 1 is the EDIT TARGET and locks the identity, silhouette and EXACT THREE-PART LAYOUT: a stocky olive-skinned ogre's separate head/torso/arms/brown hood/leather work vest/wooden club on the LEFT, and two independent complete trousered legs with brown boots at UPPER RIGHT and LOWER RIGHT. Keep body with no attached legs, each leg with one knee joint and complete boot, with large clear gutters between pieces. Image 2 is STYLE-ONLY reference for the newly approved clean casual toy-fantasy finish: broad rounded volumes, strong warm-charcoal outer contour, simple two-step matte cel shading, large legible facial features and no surface noise. Keep ogre distinct from skeleton: chunky green face, small rounded tusks, big arms, solid short club, earthy brown hood, heavy boots. A friendly determined fantasy opponent, not scary horror. Maintain right-facing side profile and correct forward-bending two-legged anatomy. Genuinely transparent background, complete uncut pieces, no baked checkerboard, scenery, pedestal, floor, text or extra parts. No gritty leather pores, scratches, tiny rivets, photorealism, painterly grain or distressed skin. Square canvas and approximate original part positions/sizes; parts must remain individually separable for an 8-frame walking rig.

## Exact generation prompt: front/back six-part puppet

Input image 1: [`w003-front-back-original-crop.png`](w003-front-back-original-crop.png) — **edit target/six-part layout**.  
Input image 2: `w003-side-puppet-casual-source.png` — **style-only reference**.

> Use case: style-transfer. Asset type: directional puppet source atlas for the SAME Dicekeep wave 3 grave ogre as Image 2. Image 1 is the EDIT TARGET and locks a wide SIX-PART layout: from left to right (1) front-facing stocky olive ogre head/torso/arms/brown hood/leather vest/wooden club with NO legs attached; (2,3) two separate front-facing green trousered legs with heavy brown boots; (4) back-facing hood/torso/arms/vest and wooden club with NO legs attached; (5,6) two separate back-facing green trousered legs with heavy brown boots. Keep all six parts in those exact columns, similar proportions to Image 1, and wide clear transparent gutters. Image 2 is STYLE-ONLY reference for character identity and clean casual design: large rounded olive-green face, small rounded tusks, thick warm-charcoal outer contour, big simplified cloth/wood/boot shapes, two-step matte cel shading, minimal inner lines. Front and back must clearly be the same character as Image 2. Friendly but determined toy-fantasy ogre, not gritty horror. Genuinely transparent background, no baked checkerboard, no scenery, ground, shadows, labels, frame borders, extra parts, or other characters. No rough skin pores, photorealism, painterly texture, scratches, tiny rivets, muddy gradients. Wide horizontal composition, every body/leg component cleanly separable for 8-frame skeletal walking animation.
