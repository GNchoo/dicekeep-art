const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../progression.js'), T = require('../tree-rules.js');
const reject = (p, fn, reason) => { const before = JSON.stringify(p), result = fn(); assert.equal(result.ok, false); assert.equal(result.reason, reason); assert.equal(JSON.stringify(p), before); };
const funded = () => { const p = P.defaultProfile(); p.shards = 10000; p.collection.gold = 100000; return p; };
const run = id => ({ id, mode: 'clear', wave: 25, kills: 100, won: false, elapsed: 300, date: '2026-09-14' });

test('browser and server tree metadata share actual combat abilities and a standalone tree still exposes its costs', () => {
  const fs = require('node:fs'), vm = require('node:vm'), R = require('../deck-rules.js'), browser = { window: {} };
  for (const name of ['deck-rules.js', 'tree-rules.js', 'progression.js']) vm.runInNewContext(fs.readFileSync(require.resolve('../' + name), 'utf8'), browser);
  const fromBrowser = browser.window.DKTREERULES;
  for (let face = 1; face <= 20; face++) {
    assert.deepEqual(T.get(face).awakening, R.awakeningInfo(face));
    assert.equal(JSON.stringify(fromBrowser.get(face).awakening), JSON.stringify(R.awakeningInfo(face)));
  }
  for (const supporter of T.supporters) assert.deepEqual(supporter, R.supporterInfo(supporter.id));
  assert.equal(T.talents[0].name, R.talentInfo(1, 'force').name);
  const fresh = browser.window.DKPROGRESSION.defaultProfile(); assert.equal(fresh.tree.migration.source, 'new-profile');
  assert.equal(browser.window.DKPROGRESSION.sanitize(fresh).tree.migration.source, 'new-profile');
  assert.equal(browser.window.DKPROGRESSION.sanitize(undefined).tree.migration.source, 'new-profile');
  const standalone = { window: {} }; vm.runInNewContext(fs.readFileSync(require.resolve('../tree-rules.js'), 'utf8'), standalone);
  assert.equal(standalone.window.DKTREERULES.unlockCost(16).gold, 120);
});

test('deterministic start has all five family roots/routes, six preserved starters, three free supporters and no packs', () => {
  const p = P.defaultProfile(); assert.equal(p.collection.gold, 1860); assert.equal(p.collection.packs, 0); assert.equal(p.shards, 0);
  assert.deepEqual(T.families.flatMap(f => f.faces).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(P.treeSummary(p).owned, 6); assert.equal(P.treeSummary(p).mastery, 0);
  for (const s of T.supporters) assert.equal(P.setSupporter(p, s.id).ok, true);
  for (const action of ['unlock', 'upgrade', 'classUp', 'craft', 'openPack']) reject(p, () => P[action](p, 1), 'tree-system');
});
test('every card unlocks deterministically along its family; skipped prerequisites and insufficient costs are atomic', () => {
  const p = funded(); reject(p, () => P.treeUnlock(p, 14), 'prerequisite');
  for (const f of T.families) for (const face of f.faces) if (!p.collection.cards[face].owned) {
    const before = { gold: p.collection.gold, shards: p.shards }, result = P.treeUnlock(p, face);
    assert.equal(result.ok, true); assert.equal(p.collection.gold, before.gold - result.cost.gold); assert.equal(p.shards, before.shards - result.cost.shards);
    assert.equal(p.levels[face], 1); assert.equal(p.collection.cards[face].owned, true);
  }
  assert.equal(P.treeSummary(p).owned, 20); reject(p, () => P.treeUnlock(p, 14), 'already-unlocked');
  const q = P.defaultProfile(); q.collection.gold = 0; reject(q, () => P.treeUnlock(q, 7), 'insufficient-gold');
  q.collection.gold = 1000; P.treeUnlock(q, 7); reject(q, () => P.treeUnlock(q, 10), 'insufficient-shards');
});
test('mastery caps at5; talents are exclusive, gated at2 and freely reversible; awakening requires3 plus exact cost', () => {
  const p = funded(); reject(p, () => P.treeTalent(p, 1, 'force'), 'mastery-required'); reject(p, () => P.treeAwaken(p, 1), 'mastery-required');
  reject(p, () => P.treeUpgrade(p, 20), 'locked');
  for (let mastery = 1; mastery <= 5; mastery++) {
    const result = P.treeUpgrade(p, 1); assert.equal(result.mastery, mastery); assert.deepEqual(result.cost, T.masteryCost(mastery - 1));
    if (mastery === 2) {
      const before = [p.collection.gold, p.shards]; P.treeTalent(p, 1, 'force'); P.treeTalent(p, 1, 'insight');
      assert.equal(p.tree.talents[1], 'insight'); assert.deepEqual([p.collection.gold, p.shards], before);
      reject(p, () => P.treeAwaken(p, 1), 'mastery-required');
    }
    if (mastery === 3) assert.deepEqual(P.treeAwaken(p, 1).cost, { gold: 300, shards: 15 });
  }
  reject(p, () => P.treeUpgrade(p, 1), 'max-mastery'); reject(p, () => P.treeAwaken(p, 1), 'already-awakened');
  reject(p, () => P.treeTalent(p, 1, 'all'), 'invalid-talent'); reject(p, () => P.setSupporter(p, 'premium'), 'invalid-supporter');
});
test('migration conserves old class/duplicate/pack value exactly once and retains ownership, levels, presets, records and shards', () => {
  const p = P.defaultProfile(); delete p.tree; p.collection.gold = 500; p.collection.packs = 7;
  p.collection.cards[1].class = 12; p.collection.cards[1].copies = 31; p.collection.cards[20] = { owned: true, class: 10, copies: 3 }; p.levels[20] = 87; p.shards = 321;
  P.setPreset(p, 2, [20, 1, 2, 3, 4]); P.activatePreset(p, 2);
  const before = structuredClone(p), oldSnapshot = P.snapshot(p, 'build'); assert.equal(oldSnapshot.treeVersion, undefined);
  const result = P.migrateTree(p), m = result.migration;
  assert.equal(result.migrated, true); assert.deepEqual(p.levels, before.levels); assert.deepEqual(p.records, before.records); assert.equal(p.shards, 321);
  assert.deepEqual(p.collection.presets, before.collection.presets); assert.equal(p.collection.cards[20].class, 10); assert.equal(p.collection.cards[20].owned, true);
  assert.equal(m.convertedCopiesGold, 31 * 25 + 3 * 200); assert.equal(m.convertedPacksGold, 7 * 420);
  assert.equal(p.collection.gold - 500 + p.tree.reserveGold + m.masteryValue, m.classInvestmentGold + m.convertedCopiesGold + m.convertedPacksGold);
  assert.equal(p.tree.mastery[1], 5); assert.equal(p.collection.cards[1].copies, 0); assert.equal(p.collection.packs, 0);
  const serialized = JSON.stringify(p); assert.equal(P.migrateTree(p).migrated, false); assert.equal(JSON.stringify(p), serialized); assert.deepEqual(P.sanitize(p), p);
  assert.equal(P.snapshotValid(oldSnapshot), true); assert.equal(P.damageMultiplier(oldSnapshot, 1), 1.33);
});
test('conversion overflow is reserved and automatically replenishes research gold instead of disappearing', () => {
  const p = P.defaultProfile(); delete p.tree; p.collection.gold = P.MAX_GOLD; p.collection.cards[1].copies = P.MAX_COPIES;
  P.migrateTree(p); assert.equal(p.tree.reserveGold, P.MAX_COPIES * 25); const before = p.tree.reserveGold;
  P.treeUpgrade(p, 1); assert.equal(p.collection.gold, P.MAX_GOLD); assert.equal(p.tree.reserveGold, before - 100);
});
test('new snapshots freeze tree choices, reject invalid/missing maps, replace class bonuses and leave both pure and v111 rules intact', () => {
  const p = funded(); P.treeUpgrade(p, 1); P.treeUpgrade(p, 1); P.treeTalent(p, 1, 'force'); P.setSupporter(p, 'crusher');
  p.collection.cards[1].class = 20; const s = P.snapshot(p, 'build'); assert.equal(s.treeVersion, 1); assert.equal(s.critDamage, 1.5);
  assert.equal(P.damageMultiplier(s, 1), 1.06 * 1.1); assert.equal(Object.isFrozen(s.mastery), true); assert.equal(Object.isFrozen(s.talents), true);
  P.treeTalent(p, 1, 'insight'); assert.equal(s.talents[1], 'force'); assert.equal(P.snapshotValid(s), true);
  for (const patch of [{ mastery: {} }, { treeVersion: 2 }, { supporter: 'invalid' }, { critDamage: 1.9 }, { talents: { ...s.talents, 2: 'force' } }, { awakenings: { ...s.awakenings, 2: true } }]) assert.equal(P.snapshotValid({ ...s, ...patch }), false);
  for (const mode of ['clear', 'multi']) assert.deepEqual(P.snapshot(p, mode), P.snapshot(P.defaultProfile(), mode));
  delete p.tree; const legacy = P.snapshot(p, 'build'); assert.equal(legacy.treeVersion, undefined); assert.ok(Math.abs(P.damageMultiplier(legacy, 1) - 1.57) < 1e-12);
});
test('settlement replaces random packs with fixed research gold and pays existing free shards once', () => {
  const p = P.defaultProfile(), result = P.settle(p, run('first'));
  assert.equal(result.shards, 45); assert.deepEqual(result.collectionRewards, { gold: 1120, packs: 0 }); assert.equal(p.collection.packs, 0);
  const before = JSON.stringify(p); assert.equal(P.settle(p, run('first')).duplicate, true); assert.equal(JSON.stringify(p), before);
});
test('sanitize clamps malformed tree fields, preserves one-time migration and retains no input references', () => {
  const p = funded(); p.tree.mastery[1] = 99; p.tree.talents[1] = 'all'; p.tree.awakenings[2] = true; p.tree.supporter = 'premium'; p.tree.reserveGold = Infinity;
  const q = P.sanitize(p); assert.equal(q.tree.mastery[1], 5); assert.equal(q.tree.talents[1], null); assert.equal(q.tree.awakenings[2], false); assert.equal(q.tree.supporter, 'supply'); assert.equal(q.tree.reserveGold, 0);
  assert.deepEqual(P.sanitize(q), q); q.tree.mastery[1] = 1; assert.equal(p.tree.mastery[1], 99);
});
