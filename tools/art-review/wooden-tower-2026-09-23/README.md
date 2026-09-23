# Original wooden tower, casual repaint

The user selected the original brown wooden watchtower, not the ivory pilot.
`original.png` is preserved from `9efff45:casual/towers/t1-a.png`.
`casual.png` was produced with built-in Codex ImageGen, without an API key.

Prompt: style-only repaint of the original wooden watchtower. Preserve its
silhouette, width/height proportions, three-quarter view, roof and balcony
levels. Keep brown shingle roof, square cap, open wooden railings and posts,
timber-framed cream lower room, round red front lens, diagonal right bracing,
right torch and oval stone/grass base. Use the approved loading castle solely
as the clean cheerful painting reference: broad warm planes, soft timber edges,
simple plank marks, smooth cel shading, no gritty grain or scratches. No ivory
castle redesign, gold trim, dice roof or blue banners. Transparent background
and balcony openings; no labels, scenery or external halo.

`node tools/promote-wooden-tower.mjs` reproduces the runtime normalization.
The original 242×384 asset envelope and existing 96px logical render height
are retained. This supersedes both ivory pilot promotion scripts for tower 1.
Only default skin a and fallback are changed; gameplay and animation code
are unchanged. Cache revision `casual3` applies to runtime and menu consumers.
