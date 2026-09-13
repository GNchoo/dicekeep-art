// The five legacy side walks already bend forward; correct only front/back.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { expandConfig, sha256 } from './lib/directional-rig.mjs';
const baseline = '5630cdd', dir = 'tools/art-review/biped-knees-110';
const ids = ['w002', 'w003', 'w005', 'w007', 'w009'];
const releases = JSON.parse(fs.readFileSync('tools/art-review/directional-101/release-builds.json'));
const entries = [], selection = [];
for (const id of ids) {
  const source = releases.builds.find(b => b.assetIds.includes(id)).config.path, bytes = fs.readFileSync(source);
  assert.equal(sha256(bytes), sha256(execFileSync('git', ['show', baseline + ':' + source])), 'released legacy config changed');
  const original = expandConfig(JSON.parse(bytes)).entries.find(e => e.assetId === id), entry = structuredClone(original);
  assert.ok(original.views.side.legacyRig);
  entry.anatomy = 'biped'; entry.reviewApproved = false;
  const directions = [];
  for (const view of ['front', 'back']) {
    const v = entry.views[view], legs = v.parts.filter(p => p.type === 'leg');
    assert.equal(legs.length, 2); assert.ok(legs.every(p => p.bend === 1));
    directions.push({ view, priorVersion: v.assetVersion ?? 93, flippedLegs: legs.filter(p => p.flipX).map(p => p.id) });
    legs.forEach(p => { p.bend = -1; }); v.assetVersion = 110;
  }
  assert.deepEqual(entry.views.side, original.views.side);
  const restored = structuredClone(entry);
  if (original.anatomy === undefined) delete restored.anatomy; else restored.anatomy = original.anatomy;
  restored.reviewApproved = original.reviewApproved;
  for (const view of ['front', 'back']) {
    restored.views[view].parts.filter(p => p.type === 'leg').forEach(p => { p.bend = 1; });
    if (original.views[view].assetVersion === undefined) delete restored.views[view].assetVersion;
    else restored.views[view].assetVersion = original.views[view].assetVersion;
  }
  assert.deepEqual(restored, original, 'only front/back bend, cache version and approval/anatomy may change');
  entries.push(entry);
  selection.push({ id, kind: 'legacy', source, sourceSha256: sha256(bytes), directions });
}
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(dir + '/legacy-front-back-rigs.json', JSON.stringify({ version: 1, canonicalCell: 512, assetVersion: 110, entries }, null, 2) + '\n');
fs.writeFileSync(dir + '/legacy-selection.json', JSON.stringify({ version: 110, baseline, scope: 'Five existing legacy side walks retained exactly; only front/back forward-knee corrections.', selection }, null, 2) + '\n');
console.log('Prepared 5 legacy identities / 10 corrected views / 20 knees; all side configs preserved.');
