# Simplified Infinity arena surfaces

The v126 pad in this historical review was superseded by the ivory socket in [v142](../arena-props-v142/README.md). The current `promote-clean-arena.mjs` rebuilds only floor, board and road; use `promote-arena-props-v142.mjs` for the current pad.

The 7–20★ towers had been repainted, but the shared Infinity arena still used its v123 floor, board, road and placement pads. Those images were already more casual than the original gritty set; their many stone joints and small pad segments nevertheless made the battlefield look busier than the new plant-free tower art. This pass changes those four surfaces for every tower tier. The road shape, board geometry, placement coordinates, corner props, combat rules and rewards remain unchanged.

`source-floor.png`, `source-board.png`, `source-road.png` and `source-pad.png` are the selected full-resolution edits made with Codex's built-in image generator. Their exact prompts and source/style reference roles are recorded in `prompts-floor-board.json` and `prompts-road-pad.json`. `originals/` contains the four v123 runtime files. No API key is required to recreate the reviewed runtime outputs.

Run `node tools/promote-clean-arena.mjs` to rebuild the floor, board and road in `casual/tiles/arena/`. The road texture's outer pixels are feathered together before downsampling to a 160px repeat; the board is painted once inside its code-drawn rounded boundary instead of being repeated at 256px. The historical `promotion.json` records all four v126 assets; the pad now uses the separate v142 source and cache key.

The castle and hell maps also draw their stone floor, road and pad fallbacks from the arena files with their existing color grades. Check the desktop and phone arena plus these two maps when editing the surfaces. `npm run test:casual-world` verifies that the four tiles load and draw in both arena layouts and that road repeat edges join.

The [v123/v126 comparison](../../../docs/arena-clean-v126.html) includes gameplay captures, enlarged crops of all four surfaces and a placed ★7 tower.
