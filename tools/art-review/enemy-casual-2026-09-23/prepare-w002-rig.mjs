// Derive a candidate-only W002 three-view rig from the reviewed production
// geometry.  This never writes the runtime directional manifest or art.
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
const sideSource = `${rel}/w002-side-puppet-casual-source.png`;
const frontBackSource = `${rel}/w002-front-back-puppet-casual-source.png`;
const wave = structuredClone(oldSide.waves.find(w => w.wave === 2));
const entry = structuredClone(oldDir.entries.find(e => e.assetId === 'w002'));
if (!wave || !entry) throw new Error('W002 source rig missing');

wave.source = sideSource;
wave.sourceSha256 = hash(sideSource);
wave.background = 'alpha';
wave.regions = {
  body: [0, 0, 0.63, 1],
  near: [0.66, 0, 0.34, 0.52],
  far: [0.66, 0.52, 0.34, 0.48],
};
wave.sourceJoints = {
  near: { hip: [0.28, 0.10], knee: [0.35, 0.48], ankle: [0.35, 0.84] },
  far: { hip: [0.28, 0.10], knee: [0.35, 0.48], ankle: [0.35, 0.84] },
};
// The new taller helmet touched the 64px inline fallback's top edge at the
// legacy 460px baseline.  Translate the figure and its pivot together.
wave.groundY = 480;
write('w002-side-legacy-config.json', { ...oldSide, waves: [wave] });

// Three 256px stills, 8-pose sheets, 50px arena contact sheet and knee
// geometry were visually reviewed before marking this candidate ready.
entry.reviewApproved = true;
entry.views.side.legacyRig.config = `${rel}/w002-side-legacy-config.json`;
entry.views.side.pivot = [256, 480];
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
front.body.roi = [0.02, 0.025, 0.245, 0.92];
front.parts[0].roi = [0.27, 0.35, 0.08, 0.60];
front.parts[1].roi = [0.41, 0.35, 0.085, 0.60];
back.body.roi = [0.53, 0.125, 0.19, 0.82];
delete back.body.source;
delete back.body.sourceSha256;
delete back.body.background;
delete back.body.backgroundSeeds;
back.parts[0].roi = [0.75, 0.35, 0.08, 0.60];
back.parts[1].roi = [0.89, 0.35, 0.08, 0.60];
// The original back atlas had narrower feet.  Separate the new rounded boots
// under the hem while retaining physical left/right limb identity and phases.
back.parts[0].socketNormalized = [0.31, 0.873];
back.parts[0].socketRoiNormalized = [0.25, 0.813, 0.12, 0.12];
back.parts[1].socketNormalized = [0.69, 0.873];
back.parts[1].socketRoiNormalized = [0.63, 0.813, 0.12, 0.12];

write('w002-directional-rig.json', {
  version: 1,
  canonicalCell: oldDir.canonicalCell ?? 512,
  assetVersion: 93, // directional manifest schema; per-view art cache uses 128
  entries: [entry],
});
console.log('W002 candidate configs prepared from pinned RGBA sources');
