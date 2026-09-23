// Candidate-only W005 shield-goblin rig, derived from the existing gait and
// reviewed transparent cutouts. This never writes runtime art or manifest.
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
const sideSource = `${rel}/w005-side-puppet-casual-source.png`;
const frontBackSource = `${rel}/w005-front-back-puppet-casual-source.png`;
const wave = structuredClone(oldSide.waves.find(w => w.wave === 5));
const entry = structuredClone(oldDir.entries.find(e => e.assetId === 'w005'));
if (!wave || !entry) throw new Error('W005 production geometry missing');

wave.source = sideSource;
wave.sourceSha256 = hash(sideSource);
wave.background = 'alpha';
wave.regions = {
  body: [0, 0, 0.67, 1],
  near: [0.69, 0, 0.31, 0.50],
  far: [0.69, 0.50, 0.31, 0.50],
};
wave.legScale = 0.36;
write('w005-side-legacy-config.json', { ...oldSide, waves: [wave] });

// All three eight-pose sheets and 50px arena contacts were visually reviewed:
// stable shield/spear, two visible boots and forward knee bend without clipping.
entry.reviewApproved = true;
entry.views.side.legacyRig.config = `${rel}/w005-side-legacy-config.json`;
entry.views.side.assetVersion = 128;
const front = entry.views.front, back = entry.views.back;
for (const view of [front, back]) {
  view.source = frontBackSource;
  view.sourceSha256 = hash(frontBackSource);
  view.background = 'alpha';
  view.assetVersion = 128;
  // Preserve the reviewed v110 forward-knee correction.
  for (const part of view.parts.filter(part => part.type === 'leg')) part.bend = -1;
}
front.body.roi = [0, 0.12, 0.27, 0.76];
front.parts[0].roi = [0.27, 0.30, 0.11, 0.60];
front.parts[1].roi = [0.41, 0.30, 0.11, 0.60];
back.body.roi = [0.53, 0.12, 0.22, 0.76];
delete back.body.source;
delete back.body.sourceSha256;
delete back.body.background;
delete back.body.backgroundSeeds;
back.parts[0].roi = [0.75, 0.30, 0.10, 0.60];
back.parts[1].roi = [0.88, 0.30, 0.10, 0.60];

write('w005-directional-rig.json', {
  version: 1,
  canonicalCell: oldDir.canonicalCell ?? 512,
  assetVersion: 93,
  entries: [entry],
});
console.log('W005 candidate configs prepared from pinned RGBA sources');
