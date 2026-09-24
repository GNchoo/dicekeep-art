# Casual pilot integration — 2026-09-23

PR #43's release audit is the integration base. Its lossless WebP assets,
account deletion, chat moderation, CI and native extreme-art cache are retained.

Built-in Codex ImageGen source PNGs are preserved here, outside the mobile and
web deployment payload. `source-manifest.json` records the original generation
snapshot and hashes; `promotion.json` is the historical pilot promotion snapshot,
not the hashes of the current runtime title or tower images.
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

For the current title art run `node tools/art-review/title-d6-v143/promote.mjs`.
The original pilot can be deliberately replayed with
`node tools/promote-casual-pilot.mjs --replay-legacy-pilot`, followed by
`npm run art:manifest`. That replay restores the older tower skin and mail icon,
so it is not a current-build regeneration command. Its title source uses the
corrected D6 painting to avoid restoring the impossible 5-beside-2 arrangement.
The original runtime artwork remains recoverable from git before this commit.
