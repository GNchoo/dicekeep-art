const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function content(withArt) {
  const context = { window: {} };
  for (const file of withArt ? ['directional-art.js', 'extreme-art.js', 'content.js'] : ['content.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  }
  return context.window.DKCONTENT;
}

test('the stag walks in every roster cycle even when no art manifest is available', () => {
  for (const withArt of [false, true]) {
    const C = content(withArt), inf = C.INFINITY;
    for (let cycle = 0; cycle < 100; cycle++) {
      for (let slot = 10; slot <= 100; slot += 10) {
        const wave = cycle * 101 + slot;
        for (const role of [0, 1]) {
          const boss = inf.bossFor(inf.bossOrdinal(wave), role);
          const base = C.bossBases.find(b => b.id === boss.base);
          assert.equal(inf.bossMoveFor(wave, role, base.move), slot === 20 && role === 1 ? 'ground' : base.move,
            `art=${withArt} wave=${wave} role=${role}`);
        }
      }
    }
  }
});

test('the original airborne base retains its stats and flight for other uses', () => {
  const C = content(false), inf = C.INFINITY;
  const base = C.bossBases.find(b => b.id === inf.bossFor(inf.bossOrdinal(20), 1).base);
  assert.equal(base.id, 'eagleEmperor');
  assert.equal(base.move, 'air');
  const before = JSON.stringify(base);
  assert.equal(inf.bossMoveFor(20, 1, base.move), 'ground');
  assert.equal(inf.bossMoveFor(20, 0, base.move), 'air');
  assert.equal(inf.bossMoveFor(30, 1, base.move), 'air');
  assert.equal(JSON.stringify(base), before);
});
