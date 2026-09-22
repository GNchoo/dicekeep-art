# Casual pilot integration — 2026-09-23

PR #43's release audit is the integration base. Its lossless WebP assets,
account deletion, chat moderation, CI and native extreme-art cache are retained.

Built-in Codex ImageGen source PNGs are preserved here, outside the mobile and
web deployment payload. `source-manifest.json` records the original generation
snapshot and hashes; `promotion.json` records the subsequent runtime promotion.
No API key was used. A model snapshot is not asserted.

## Applied

- Portrait/landscape title art and a matching blurred backdrop.
- Tower 1 default `a` skin and its fallback. Other tower skins remain as before.
- Mail reward icon.

The tower's animation code and gameplay values are unchanged. Runtime output
sizes are reduced for mobile. The gallery preserves the old title images so
its before/after comparison remains meaningful after replacement.

## Preserved for follow-up

- Pig warrior: needs matching walk frames and foot-pivot validation. Replacing
  only the still would leave the old character visible while walking.
- Muzzle flash: needs directional origin/rotation validation in the renderer.
- Arena board: rejected because its repeating edges are visible.

Run `node tools/promote-casual-pilot.mjs` from the repository root to reproduce
the promoted images, then `npm run art:manifest` and `npm run test:art-pipeline`.
The original runtime artwork remains recoverable from git before this commit.
