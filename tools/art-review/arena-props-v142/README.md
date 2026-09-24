# Simplified arena props (v142)

The shared tower socket, four braziers, four crystal-banner pillars and four broken-die piles were redrawn to match the broad ivory paving and quiet violet board. Both Infinity layouts use the same four runtime files. The socket now has an ivory stone rim and a muted center; the decorations use fewer, larger color planes and no plant or tiny masonry texture.

`source-*.png` are the selected full-resolution PNGs made with Codex's built-in image generator. `originals/` preserves the previous runtime art. `prompts.json` records the exact prompts and input reference roles. Run `node tools/promote-arena-props-v142.mjs` to produce the 1024px transparent runtime assets and `promotion.json` containing source/output hashes. The process makes no API call.

`prop-1.png` is intentionally unlit because `drawArenaBraziers` paints the animated flames in front of it. `prop-2.png` remains a corner decoration rather than a playable tower. The placement and combat geometry are unchanged.
