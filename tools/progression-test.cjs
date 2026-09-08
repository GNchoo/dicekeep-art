const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const P = require('../progression.js');

const run = (id, overrides = {}) => ({ id, mode: 'clear', wave: 25, kills: 300, won: false, date: '2026-09-08', elapsed: 125.5, ...overrides });
const funded = () => { const p = P.defaultProfile(); p.shards = P.MAX_SHARDS; return p; };
const unchanged = (profile, operation, reason) => {
  const before = JSON.stringify(profile), result = operation();
  assert.equal(result.ok, false); if (reason) assert.equal(result.reason, reason);
  assert.equal(JSON.stringify(profile), before); return result;
};

test('browser and CommonJS share a side-effect-free API; defaults preserve legacy only', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../progression.js'), 'utf8'), context);
  assert.equal(typeof context.window.DKPROGRESSION.draw, 'function');
  const p = P.defaultProfile({ infBest: 401, infClears: 4 });
  assert.deepEqual(p.legacy, { best: 401, clears: 4 });
  assert.deepEqual(p.deck, [1, 2, 3, 4, 5]); assert.equal(p.shards, 0);
  for (let face = 1; face <= 20; face++) assert.equal(p.levels[face], face <= 6 ? 1 : 0);
  assert.deepEqual(Object.keys(p.records), ['clear', 'build', 'extreme', 'multi', 'extremeMulti']);
  assert.ok(Object.values(p.records).every(r => r.best === 0 && r.clears === 0 && !r.runs.length && !r.gemMilestones.length));
});

test('sanitize repairs invalid saves, fills five unlocked cards, caps finite integers and copies references', () => {
  const raw = P.defaultProfile();
  raw.shards = 5e9; raw.levels = { 1: -2, 2: '10', 3: Infinity, 4: 1.5, 5: 2000, 6: 0, 7: 3, 8: NaN, 9: 10 };
  raw.deck = [7, 7, 20, '9', 9, 5]; raw.settled = ['a', 'a', '', '\n', 'b'];
  raw.records.clear = { best: Infinity, clears: -1, milestones: [100, 100, 150, '25'], gemMilestones: [150, 200, 200], runs: [run('valid'), run('bad', { wave: -1 })] };
  const p = P.sanitize(raw);
  assert.equal(p.shards, P.MAX_SHARDS); assert.equal(p.levels[5], 200); assert.equal(p.levels[8], 0);
  assert.deepEqual(p.deck, [7, 9, 5, 1, 2]); assert.deepEqual(p.settled, ['a', 'b']);
  assert.deepEqual(p.records.clear.milestones, [100]); assert.deepEqual(p.records.clear.gemMilestones, [150, 200]);
  assert.equal(p.records.clear.best, 0); assert.equal(p.records.clear.runs.length, 1);
  p.records.clear.runs[0].wave = 50; assert.equal(raw.records.clear.runs[0].wave, 25);
  assert.equal(P.sanitize({ version: 1, shards: Infinity }).shards, 0);
  assert.equal(P.sanitize({ version: 1, shards: Number.MAX_SAFE_INTEGER + 1 }).shards, 0);
  assert.deepEqual(P.sanitize(undefined, { infBest: 900, infClears: 2 }).legacy, { best: 900, clears: 2 });
});

test('unlock and upgrade debit exact costs once and reject invalid mutations atomically', () => {
  const p = P.defaultProfile();
  assert.equal(P.cardUnlockCost(7), 80); assert.equal(P.cardUnlockCost(20), 600);
  assert.equal(P.cardUnlockCost(0), null); assert.equal(P.cardUnlockCost('7'), null);
  unchanged(p, () => P.unlock(p, 7), 'insufficient-shards');
  p.shards = 80; assert.deepEqual(P.unlock(p, 7), { ok: true, face: 7, level: 1, cost: 80 });
  assert.equal(p.shards, 0); unchanged(p, () => P.unlock(p, 7), 'already-unlocked');
  unchanged(p, () => P.upgrade(p, 8), 'locked'); unchanged(p, () => P.upgrade(p, 21), 'invalid-face');
  p.shards = 10; assert.equal(P.upgrade(p, 7).level, 2); assert.equal(p.shards, 0);
  unchanged(p, () => P.upgrade(p, 7), 'insufficient-shards');
  p.shards = NaN; unchanged(p, () => P.unlock(p, 8), 'invalid-profile');
});

test('all levels have finite increasing costs, shared cap permits free or paid currency to reach the same endpoint', () => {
  const p = funded(); let spent = 0, prev = 0;
  for (let level = 1; level < 200; level++) {
    const cost = P.upgradeCost(level); assert.ok(Number.isSafeInteger(cost) && cost > prev); prev = cost;
    const result = P.upgrade(p, 1); assert.equal(result.level, level + 1); assert.equal(result.cost, cost); spent += cost;
  }
  assert.equal(P.upgradeCost(1), 10); assert.equal(P.upgradeCost(19), 100); assert.equal(P.upgradeCost(20), 120);
  assert.equal(P.upgradeCost(200), null); assert.equal(P.upgradeCost(Infinity), null);
  assert.equal(p.shards, P.MAX_SHARDS - spent); unchanged(p, () => P.upgrade(p, 1), 'max-level');
});

test('deck selection is exactly five distinct unlocked faces and snapshots cannot follow later profile changes', () => {
  const p = funded(); P.unlock(p, 20);
  unchanged(p, () => P.setDeck(p, [1, 2, 3, 4, 4]), 'invalid-deck');
  unchanged(p, () => P.setDeck(p, [1, 2, 3, 4]), 'invalid-deck');
  unchanged(p, () => P.setDeck(p, [1, 2, 3, 4, 19]), 'locked');
  const chosen = [20, 6, 3, 2, 1]; assert.equal(P.setDeck(p, chosen).ok, true); chosen[0] = 9;
  const snap = P.snapshot(p, 'build'); assert.deepEqual(snap.deck, [20, 6, 3, 2, 1]);
  assert.ok(Object.isFrozen(snap) && Object.isFrozen(snap.deck) && Object.isFrozen(snap.levels));
  p.levels[20] = 200; P.setDeck(p, [1, 2, 3, 4, 5]); assert.equal(snap.levels[20], 1); assert.equal(snap.deck[0], 20);
  assert.equal(P.snapshot(p, 'endless'), null);
});

test('clear/multi never use growth or consume deck RNG; build caps at 20 while extreme supports 200', () => {
  const p = funded(); p.levels[1] = 200; p.levels[6] = 200;
  for (const mode of ['clear', 'multi']) {
    const snap = P.snapshot(p, mode); assert.equal(snap.growth, false); assert.equal(P.damageMultiplier(snap, 1), 1);
    assert.equal(P.draw(snap, () => { throw Error('pure RNG must not be consumed'); }), null);
  }
  const build = P.snapshot(p, 'build'), extreme = P.snapshot(p, 'extreme');
  assert.equal(P.damageMultiplier(build, 1), 2.52);
  assert.equal(P.damageMultiplier(extreme, 1), 2.52 * Math.pow(1.08, 180));
  assert.equal(P.damageMultiplier(extreme, 6), 1, 'nonselected card has no deck multiplier');
  for (let level = 1; level <= 200; level++) {
    p.levels[1] = level;
    const mult = P.damageMultiplier(P.snapshot(p, 'extreme'), 1); assert.ok(Number.isFinite(mult) && mult >= 1);
  }
});

test('every face maps to a legal renderer, and each selected deck entry has an equal RNG interval', () => {
  const p = funded(); for (let face = 7; face <= 20; face++) P.unlock(p, face);
  const legal = { d1: [1, 1], d4: [1, 4], d6: [1, 6], d8: [1, 8], d12: [1, 12], d20: [1, 20], epic: [14, 20], myth: [18, 20], primal: [20, 20] };
  for (let first = 1; first <= 16; first++) {
    const deck = Array.from({ length: 5 }, (_, i) => first + i); P.setDeck(p, deck);
    const snap = P.snapshot(p, 'build'), counts = new Map(deck.map(f => [f, 0]));
    for (let i = 0; i < 1000; i++) {
      let calls = 0; const result = P.draw(snap, () => { calls++; return (i + .5) / 1000; });
      assert.equal(calls, 1); assert.ok(result.face >= legal[result.kind][0] && result.face <= legal[result.kind][1]);
      counts.set(result.face, counts.get(result.face) + 1);
    }
    assert.deepEqual([...counts.values()], [200, 200, 200, 200, 200]);
  }
  for (const value of [-1, 1, NaN, Infinity, '0.5']) assert.equal(P.draw(P.snapshot(p, 'extreme'), () => value), null);
});

test('every arena mode pays completed waves and independent first milestones, without touching gems/legacy', () => {
  const p = P.defaultProfile({ infBest: 600, infClears: 3 });
  for (const mode of P.MODES) {
    const record = p.records[mode]; record.gemMilestones.push(150);
    const result = P.settle(p, run(mode, { mode }));
    assert.equal(result.ok, true); assert.equal(result.shards, 45); assert.deepEqual(result.newly, [10, 25]);
    assert.equal(result.record, record); assert.deepEqual(record.gemMilestones, [150]); assert.equal(record.best, 25);
    assert.equal(P.settle(p, run(mode + '-repeat', { mode })).shards, 25);
  }
  assert.equal(p.shards, 350); assert.deepEqual(p.legacy, { best: 600, clears: 3 }); assert.equal(p.gems, undefined);
});

test('run award caps, 101 clear bonus, duplicate transaction and recent-history retention', () => {
  const p = P.defaultProfile();
  const result = P.settle(p, run('clear101', { wave: 101, won: true }));
  assert.equal(result.shards, 170); assert.equal(p.records.clear.clears, 1); assert.equal(p.records.clear.best, 101);
  const before = JSON.stringify(p); const duplicate = P.settle(p, run('clear101', { wave: 9999, won: true }));
  assert.equal(duplicate.duplicate, true); assert.equal(duplicate.shards, 0); assert.equal(JSON.stringify(p), before);
  assert.equal(P.settle(p, run('long', { mode: 'extreme', wave: Number.MAX_SAFE_INTEGER })).shards, 550);
  assert.equal(P.settle(p, run('long-again', { mode: 'extreme', wave: 501 })).shards, 500);
  assert.equal(P.settle(p, run('partial', { mode: 'build', wave: 4 })).shards, 0);
  for (let i = 0; i < 80; i++) assert.equal(P.settle(p, run('history-' + i, { wave: 0 })).ok, true);
  assert.equal(p.settled.length, 64); assert.equal(p.settled[0], 'history-79'); assert.equal(p.settled.at(-1), 'history-16');
  assert.equal(p.records.clear.runs.length, 5); assert.equal(p.records.clear.runs[0].id, 'history-79');
});

test('wallet saturation is explicit and invalid run data never partially mutates profile', () => {
  const p = funded(); p.shards -= 3;
  const result = P.settle(p, run('cap')); assert.equal(result.shards, 3); assert.equal(result.earnedShards, 45); assert.equal(result.capped, true); assert.equal(p.shards, P.MAX_SHARDS);
  for (const override of [{ id: '' }, { mode: 'unknown' }, { wave: -1 }, { wave: 1.1 }, { wave: Infinity }, { kills: NaN }, { won: 1 }, { date: '2026-02-30' }, { elapsed: -1 }, { elapsed: Infinity }]) {
    unchanged(p, () => P.settle(p, run('invalid', override)), 'invalid-run');
  }
  const clean = P.sanitize(JSON.parse(JSON.stringify(p))); assert.deepEqual(clean, p);
});
