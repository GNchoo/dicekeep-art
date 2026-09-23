# 7–20★ plant-free casual towers

These fourteen selected sprites keep the original star towers' distinct silhouettes and attack focal points: twin crystals, prism, telescope, star crown, portal, floating keep, gravity orb, twin-spire arch, wings, triple turret, solar window, tiered citadel, rift gate, and cosmic orb. The plant-free treatment uses broad cel-shaded planes and fewer brick and trim lines so each tower reads at a 70×96 gameplay footprint. No grassy or biome-specific version is part of this set.

`clean-07.png` through `clean-20.png` are the full-resolution selected edits from Codex's built-in image generator. `prompts-07-13.json` and `prompts-14-20.json` record the exact reference assets and prompts. The original `casual/towers/star-07.png` through `star-20.png` remain intact for comparison and future themed variants.

Run `node tools/promote-casual-stars.mjs` to trim and downsize the selected edits into `casual/towers/star-07-casual.png` through `star-20-casual.png`. This is deterministic and requires no API key. `promotion.json` records source, reference, and promoted-image hashes and sizes. The game uses these fourteen new sprites on every map; the existing 1–6★ map-dependent tower art selection remains unchanged.

Review the complete set at `docs/star-casual-v125.html`, which shows the original and simplified art side by side and at the game's 70×96 maximum size. Before release, check the attack origins against the visible crystal, lens, or cannon and run `npm run test:casual-world`, `npm run test:art-pipeline`, and `npm run build:www`.
