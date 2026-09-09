// Promote only the ten reviewed front views; other directions must be byte-identical.
// Run from the repository root after the three builds and check-directional-art.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../../lib/directional-rig.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
assert.ok(process.argv.slice(2).every(a => a === '--check'), 'only --check is supported');
const at = p => path.join(repo, p);
const read = p => JSON.parse(fs.readFileSync(at(p)));
const groups = [
  ['middle', 'directional-art.js', 'INF_DIRECTIONAL_ART', ['b040', 'b040-2']],
  ['late', 'directional-art.js', 'INF_DIRECTIONAL_ART', ['b090', 'b090-2', 'b100']],
  ['extreme', 'extreme-art.js', 'INF_EXTREME_ART', ['b141', 'b141-2', 'b191', 'b191-2', 'b201']],
];
const approval = read('tools/art-review/boss-front-footwork-102/review.json');
assert.equal(approval.passed, true); assert.equal(approval.frontPosesReviewed, 80);
assert.deepEqual([...approval.ids].sort(), groups.flatMap(g => g[3]).sort());
const manifests = new Map(), pending = [], report = { version: 102, fronts: [], unchangedSideBackFiles: 0 };
const plain = x => JSON.parse(JSON.stringify(x));
const withoutFront = e => { const c = plain(e); delete c.views.front; return c; };
const frontGeometry = v => { const c = plain(v); delete c.fallback; delete c.assetVersion; return c; };

for (const [group, filename, global, ids] of groups) {
  if (!manifests.has(filename)) {
    const text = fs.readFileSync(at(filename), 'utf8'), context = { window: {} };
    vm.runInNewContext(text, context, { timeout: 1000 });
    manifests.set(filename, { text, data: plain(context.window[global]) });
  }
  const target = manifests.get(filename).data;
  const dir = 'gen/boss-front-footwork/' + group;
  const manifestBytes = fs.readFileSync(at(dir + '/directional-art.json'));
  const qaBytes = fs.readFileSync(at(dir + '/directional-qa.json'));
  const candidate = JSON.parse(manifestBytes), qa = JSON.parse(qaBytes), checked = read(dir + '/directional-validation.json');
  const movingBytes = fs.readFileSync(at(dir + '/directional-moving-qa.json')), moving = JSON.parse(movingBytes);
  const approved = approval.builds?.[group];
  assert.equal(approved?.manifestSha256, sha256(manifestBytes), group + ': visually approved manifest changed');
  assert.equal(approved?.qaSha256, sha256(qaBytes), group + ': visually approved geometry/images changed');
  assert.equal(approved?.movingQaSha256, sha256(movingBytes), group + ': approved movement evidence changed');
  assert.equal(moving.passed, true); assert.deepEqual(moving.errors, []);
  assert.equal(moving.manifestSha256, sha256(manifestBytes), group + ': stale movement evidence');
  assert.equal(checked.passed, true); assert.deepEqual(checked.errors, []); assert.deepEqual(qa.errors, []);
  assert.equal(checked.manifestSha256, sha256(manifestBytes)); assert.equal(checked.qaSha256, sha256(qaBytes));
  assert.equal(qa.configSha256, sha256(fs.readFileSync(at(qa.config))));
  assert.deepEqual(Object.keys(candidate.entries).sort(), [...ids].sort());
  for (const id of ids) {
    const old = target.entries[id], fresh = candidate.entries[id];
    assert.ok(old?.ready && fresh.ready && qa.entries.find(e => e.assetId === id)?.reviewApproved, id);
    assert.deepEqual(withoutFront(fresh), withoutFront(old), id + ': non-front metadata changed');
    assert.deepEqual(frontGeometry(fresh.views.front), frontGeometry(old.views.front), id + ': front grid/scale/pivot changed');
    assert.equal(fresh.views.front.assetVersion, 102);
    for (const name of ['side', 'front', 'back']) for (const kind of ['still', 'sheet']) {
      const relative = fresh.views[name][kind];
      assert.match(relative, /^casual\/bosses\/(?:inf\/directional|extreme)\/b\d{3}(?:-2)?-(?:front|side|back)(?:-walk-4x2)?\.(?:png|webp)$/);
      const bytes = fs.readFileSync(at(dir + '/' + relative)), original = fs.readFileSync(at(relative));
      assert.equal(sha256(bytes), qa.files.find(f => f.file === relative)?.sha256, relative + ': stale build');
      if (name !== 'front') {
        assert.equal(sha256(bytes), sha256(original), relative + ': untouched direction changed');
        report.unchangedSideBackFiles++;
      } else {
        pending.push({ relative, bytes });
        report.fronts.push({ id, kind, path: relative, beforeSha256: sha256(original), sha256: sha256(bytes), bytes: bytes.length });
      }
    }
    target.entries[id].views.front = fresh.views.front;
  }
}
assert.equal(pending.length, 20); assert.equal(report.unchangedSideBackFiles, 40);
if (process.argv.includes('--check')) {
  console.log(JSON.stringify({ passed: true, checkOnly: true, frontFiles: pending.length, unchangedSideBackFiles: report.unchangedSideBackFiles }));
  process.exit(0);
}
// Every precondition is checked before replacing any production image or manifest.
for (const { relative, bytes } of pending) fs.writeFileSync(at(relative), bytes);
report.manifests = [];
for (const [filename, { text, data }] of manifests) {
  const prefix = text.slice(0, text.indexOf('{'));
  const indent = text.includes('\n  "version"') ? 2 : undefined;
  const bytes = prefix + JSON.stringify(data, null, indent) + ';\n';
  fs.writeFileSync(at(filename), bytes);
  report.manifests.push({ path: filename, sha256: sha256(Buffer.from(bytes)), entries: Object.keys(data.entries).length });
}
report.passed = true;
fs.writeFileSync(at('gen/boss-front-footwork/promotion.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, frontFiles: pending.length, unchangedSideBackFiles: report.unchangedSideBackFiles, manifests: report.manifests }));
