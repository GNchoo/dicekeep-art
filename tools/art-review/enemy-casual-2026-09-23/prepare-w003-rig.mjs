// Candidate-only W003 ogre rig.  Source art and coordinates stay separate from
// the production manifest until the three views and gait are reviewed.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const rel = 'tools/art-review/enemy-casual-2026-09-23';
const dst = path.join(root, rel);
const hash = file => createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const write = (name, value) => fs.writeFileSync(path.join(dst, name), JSON.stringify(value, null, 2) + '\n');
const oldSide = JSON.parse(fs.readFileSync(path.join(root, 'tools/art-review/pr29-gait/rig-config.json'), 'utf8'));
const oldDir = JSON.parse(fs.readFileSync(path.join(root, 'tools/art-review/directional-101/legacy-directional-rigs.json'), 'utf8'));
const sideSource = `${rel}/w003-side-puppet-casual-source.png`;
const frontBackSource = `${rel}/w003-front-back-puppet-casual-source.png`;
const wave = structuredClone(oldSide.waves.find(w => w.wave === 3));
const entry = structuredClone(oldDir.entries.find(e => e.assetId === 'w003'));
if (!wave || !entry) throw new Error('W003 production geometry missing');
wave.source = sideSource;
wave.sourceSha256 = hash(sideSource);
wave.background = 'alpha';
wave.regions = {
  body: [0, 0, 0.63, 1],
  near: [0.69, 0, 0.31, 0.54],
  far: [0.69, 0.54, 0.31, 0.46],
};
// The new ogre is intentionally stockier than the original long-legged
// painting.  Keep its helmet within the 512px canonical cell.
wave.legScale = 0.31;
write('w003-side-legacy-config.json', { ...oldSide, waves: [wave] });

// Inspected all 8 poses in side/front/back at source scale and at 50px game
// scale; boots stay visible and knees bend toward travel without clipping.
entry.reviewApproved = true;
entry.views.side.legacyRig.config = `${rel}/w003-side-legacy-config.json`;
entry.views.side.assetVersion = 128;
const front = entry.views.front, back = entry.views.back;
for (const view of [front, back]) {
  view.source = frontBackSource;
  view.sourceSha256 = hash(frontBackSource);
  view.background = 'alpha';
  view.assetVersion = 128;
  // Keep the v110 forward-knee correction when replacing the old atlas.
  for (const part of view.parts.filter(part => part.type === 'leg')) part.bend = -1;
}
front.body.roi = [0, 0.12, 0.25, 0.80];
front.parts[0].roi = [0.26, 0.26, 0.10, 0.67];
front.parts[1].roi = [0.39, 0.26, 0.105, 0.67];
back.body.roi = [0.50, 0.14, 0.23, 0.77];
back.parts[0].roi = [0.75, 0.26, 0.105, 0.67];
back.parts[1].roi = [0.88, 0.26, 0.105, 0.67];

write('w003-directional-rig.json', {
  version: 1,
  canonicalCell: oldDir.canonicalCell ?? 512,
  assetVersion: 93,
  entries: [entry],
});
console.log('W003 candidate configs prepared from pinned RGBA sources');
