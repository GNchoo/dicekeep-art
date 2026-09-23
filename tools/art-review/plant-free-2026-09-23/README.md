# Plant-free tower variants

Six reviewed base-tower variants retain each tower's identity and combat focal point while removing grass, moss, and ivy. The first removal attempts added too many roof and masonry seams; these selected images instead use broader surfaces and simpler two-tone shading. The existing `t1-a`…`t6-a` sprites remain available for grassy maps.

`tower-1.png`…`tower-6.png` are the selected full-resolution outputs of Codex's built-in image generator. `node tools/promote-clean-towers.mjs` deterministically crops and resizes them into `casual/towers/t1-clean.png`…`t6-clean.png` at no more than twice their gameplay size. `promotion.json` records source, reference, and output hashes. No API key is required for that promotion step.

The game selects these clean base sprites on the stone arena and in castle and hell regions; grassy regions keep the existing plant-bearing sprites. Purchased cosmetics and alternate tower skins remain independent of this map choice. Combat stats and projectile positions are unchanged.
