import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareView, poseAt } from './lib/directional-rig.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const groups = [
  ['tools/art-review/directional-101/middle-waves/ground-next-rigs.json', ['b040', 'b040-2']],
  ['tools/art-review/directional-101/late-waves/all-rigs.json', ['b090', 'b090-2', 'b100']],
  ['tools/art-review/extreme-202/all-rigs.json', ['b141', 'b141-2', 'b191', 'b191-2', 'b201']],
];
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-8, label + ': ' + actual + ' != ' + expected);
const point = (a, b, label) => a.forEach((n, i) => close(n, b[i], label + '[' + i + ']'));

for (const [configPath, ids] of groups) {
  const config = JSON.parse(fs.readFileSync(path.join(repo, configPath)));
  for (const id of ids) test(id + ' turns its front feet outward without changing the walking skeleton', async () => {
    const entry = config.entries.find(e => e.assetId === id);
    assert.ok(entry, id + ' must exist in its production input');
    const view = entry.views.front;
    assert.equal(view.assetVersion, 102);
    const legs = view.parts.filter(p => p.type === 'leg');
    assert.equal(legs.length, 2);
    assert.ok(legs.every(p => p.flipX === true));
    const original = structuredClone(view);
    for (const p of original.parts.filter(p => p.type === 'leg')) delete p.flipX;
    delete original.assetVersion;
    const before = await prepareView(entry, 'front', original, repo);
    const after = await prepareView(entry, 'front', view, repo);
    assert.deepEqual(after.gait, before.gait); assert.deepEqual(after.pivot, before.pivot);
    assert.deepEqual(after.body, before.body); assert.equal(after.count, 8);
    for (const leg of after.limbs) {
      const old = before.limbs.find(p => p.id === leg.id);
      assert.equal(leg.phase, old.phase); assert.deepEqual(leg.socket, old.socket);
      assert.equal(leg.layer, old.layer); close(leg.scale, old.scale, id + ' scale');
      point(leg.links, old.links, id + ' bone lengths'); close(leg.H, old.H, id + ' standing reach');
      close(leg.footOffset[0], -old.footOffset[0], id + ' horizontal foot offset');
      close(leg.footOffset[1], old.footOffset[1], id + ' sole height');
      const outward = leg.id === 'leftLeg' ? 1 : -1;
      assert.ok(leg.footOffset[0] * outward > 0, id + ' foot must point away from the centre');
    }
    for (let i = 0; i < 256; i++) {
      const a = poseAt(after, i / 256), b = poseAt(before, i / 256);
      close(a.body.x, b.body.x, id + ' body x'); close(a.body.y, b.body.y, id + ' body y');
      for (const leg of a.legs) {
        const old = b.legs.find(p => p.id === leg.id);
        assert.equal(leg.contact, old.contact); assert.equal(leg.phase, old.phase);
        for (const joint of ['hip', 'knee', 'ankle']) point(leg.screen[joint], old.screen[joint], id + ' ' + joint);
        close(leg.screen.sole[1], old.screen.sole[1], id + ' contact plane');
      }
    }
  });
}
