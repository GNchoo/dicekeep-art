const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../progression.js'), R = require('../deck-rules.js');
// Explicit v111 fixtures retain coverage of the supported legacy APIs.
const legacyProfile = (...args) => { const p = P.defaultProfile(...args); delete p.tree; p.collection.gold = 600; p.collection.packs = 3; return p; };

const run = (id, mode = 'clear') => ({ id, mode, wave: 25, kills: 100, won: false, date: '2026-09-14', elapsed: 300 });
const unchanged = (p, call, reason) => { const before = JSON.stringify(p), result = call(); assert.equal(result.ok, false); assert.equal(result.reason, reason); assert.equal(JSON.stringify(p), before); };

test('collection has distinct rarities/classes, six starters, three copied presets and free-only packs', () => {
  const p = legacyProfile(), s = P.collectionSummary(p);
  assert.equal(s.owned, 6); assert.equal(s.total, 20); assert.equal(s.gold, 600); assert.equal(s.packs, 3);
  assert.deepEqual(p.collection.presets.map(p => p.faces), Array(3).fill([1, 2, 3, 4, 5]));
  for (let face = 1; face <= 20; face++) assert.equal(p.collection.cards[face].class, face <= 6 ? R.get(face).baseClass : 0);
  assert.equal(new Set(R.catalog.map(c => c.rarity)).size, 4);
  assert.equal(Object.values(P.PACK_ODDS).reduce((sum, n) => sum + n, 0), 100);
  p.collection.presets[0].faces[0] = 6; assert.equal(p.collection.presets[1].faces[0], 1);
});

test('legacy investment is converted once without altering old levels, shards, records or deck', () => {
  const p = legacyProfile(); delete p.collection; p.levels[1] = 21; p.levels[7] = 1; p.deck = [7, 2, 3, 4, 5]; p.shards = 317;
  P.settle(p, run('historic'));
  const legacy = JSON.stringify(p), before = structuredClone(p);
  const result = P.migrateCollection(p);
  assert.equal(result.migrated, true); assert.deepEqual(p.levels, before.levels); assert.deepEqual(p.records, before.records);
  assert.deepEqual(p.deck, before.deck); assert.equal(p.shards, before.shards); assert.deepEqual(p.settled, before.settled);
  assert.equal(result.migration.spentShards, 1150); assert.equal(result.migration.convertedGold, 11500); assert.equal(result.migration.convertedCopies, 456);
  assert.deepEqual(p.collection.cards[1], { owned: true, class: 14, copies: 274 }); assert.equal(p.collection.gold, 1700);
  assert.equal(p.collection.cards[7].owned, true); assert.equal(p.collection.cards[7].class, 3);
  const migrated = JSON.stringify(p); assert.equal(P.migrateCollection(p).migrated, false); assert.equal(JSON.stringify(p), migrated);
  const treeMigrated = P.sanitize(JSON.parse(migrated)); assert.deepEqual(treeMigrated.levels, p.levels); assert.deepEqual(treeMigrated.records, p.records); assert.equal(treeMigrated.tree.version, 1);
  const oldRun = P.snapshot(JSON.parse(legacy), 'extreme'); assert.equal(oldRun.deckSystem, undefined); assert.equal(P.snapshotValid(oldRun), true);
  assert.equal(oldRun.levels[1], 21); assert.equal(P.damageMultiplier(P.snapshot(JSON.parse(legacy), 'build'), 7), 1);
});

test('sanitization preserves valid collection and repairs unsafe counters/decks without granting a second starter gift', () => {
  const p = legacyProfile(); p.collection.gold = 0; p.collection.packs = 0; p.collection.opened = 3; p.collection.pity = 2;
  p.collection.cards[1].class = 4; p.collection.cards[1].copies = 9;
  const migrated = P.sanitize(JSON.parse(JSON.stringify(p))); assert.equal(migrated.tree.version, 1); assert.deepEqual(P.sanitize(migrated), migrated);
  p.collection.gold = Infinity; p.collection.packs = -1; p.collection.cards[7].copies = '9'; p.collection.presets[2].faces = [20, 20, -1];
  const clean = P.sanitize(p); assert.equal(clean.collection.gold, 225); assert.equal(clean.collection.packs, 0);
  assert.equal(clean.collection.cards[7].copies, 0); assert.deepEqual(clean.collection.presets[2].faces, [1, 2, 3, 4, 5]);
  assert.equal(clean.collection.cards[1].class, 4); assert.equal(clean.collection.cards[1].copies, 0); assert.equal(clean.tree.migration.oldCopies[1], 9);
  clean.collection.cards[1].class = 9; assert.equal(p.collection.cards[1].class, 4);
});

test('every card is obtainable through fixed free-shard crafting and duplicate upgrades debit both resources atomically', () => {
  const p = legacyProfile(); p.shards = 280;
  for (let face = 7; face <= 20; face++) { const result = P.craft(p, face); assert.equal(result.ok, true); assert.equal(result.cost.shards, 20); assert.equal(result.reward.newlyOwned, true); }
  assert.equal(P.collectionSummary(p).owned, 20); assert.equal(p.shards, 0);
  unchanged(p, () => P.craft(p, 1), 'insufficient-shards');
  const fresh = legacyProfile(); unchanged(fresh, () => P.classUp(fresh, 1), 'insufficient-copies');
  fresh.collection.cards[1].copies = 2; fresh.collection.gold = 59;
  unchanged(fresh, () => P.classUp(fresh, 1), 'insufficient-gold');
  fresh.collection.gold = 60; const raised = P.classUp(fresh, 1);
  assert.deepEqual(raised.cost, { copies: 2, gold: 60 }); assert.equal(raised.class, 2); assert.equal(fresh.collection.gold, 0); assert.equal(fresh.collection.cards[1].copies, 0);
  unchanged(fresh, () => P.classUp(fresh, 7), 'locked');
  fresh.collection.cards[1].class = 20; unchanged(fresh, () => P.classUp(fresh, 1), 'max-class');
});

test('three presets are independent, reject locked/duplicate selections and keep the legacy active deck alias', () => {
  const p = legacyProfile(), faces = [6, 5, 4, 3, 2];
  assert.equal(P.setPreset(p, 1, faces).ok, true); faces[0] = 1; assert.equal(p.collection.presets[1].faces[0], 6);
  assert.deepEqual(p.deck, [1, 2, 3, 4, 5]); assert.equal(P.activatePreset(p, 1).ok, true); assert.deepEqual(p.deck, [6, 5, 4, 3, 2]);
  assert.equal(P.setDeck(p, [1, 3, 4, 5, 6]).ok, true); assert.deepEqual(p.collection.presets[1].faces, p.deck);
  unchanged(p, () => P.setPreset(p, 2, [1, 1, 3, 4, 5]), 'invalid-deck');
  unchanged(p, () => P.setPreset(p, 2, [20, 1, 2, 3, 4]), 'invalid-deck');
  unchanged(p, () => P.activatePreset(p, 3), 'invalid-preset');
});

test('free pack results are reproducible from persisted state and twentieth pack guarantees a legendary', () => {
  const a = legacyProfile(), b = JSON.parse(JSON.stringify(a));
  const first = P.openPack(a); assert.deepEqual(P.openPack(b), first); assert.deepEqual(a, b); assert.equal(first.cards.length, 5);
  assert.equal(a.collection.packs, 2); assert.equal(a.collection.opened, 1); assert.equal(a.collection.gold, 720);
  a.collection.pity = 19; const pity = P.openPack(a); assert.equal(pity.legendary, true); assert.equal(a.collection.pity, 0);
  assert.ok(pity.rewards.some(r => r.rarity === 'legendary'));
  P.openPack(a); unchanged(a, () => P.openPack(a), 'no-packs');
});

test('established modes award collection resources without changing legacy shards; duplicate/invalid runs cannot grant twice', () => {
  for (const mode of ['clear', 'build', 'extreme', 'multi', 'extremeMulti']) {
    const p = legacyProfile(), before = structuredClone(p.collection), result = P.settle(p, run('reward-' + mode, mode));
    assert.equal(result.shards, 45); assert.deepEqual(result.collectionRewards, { gold: 280, packs: 2 });
    assert.equal(p.collection.gold - before.gold, 280); assert.equal(p.collection.packs - before.packs, 2);
    const saved = JSON.stringify(p); assert.deepEqual(P.settle(p, run('reward-' + mode, mode)).collectionRewards, { gold: 0, packs: 0 }); assert.equal(JSON.stringify(p), saved);
    unchanged(p, () => P.settle(p, { ...run('bad'), wave: NaN }), 'invalid-run');
  }
});

test('new classes and collection crit freeze at run start while legacy and pure snapshots remain distinct', () => {
  const p = legacyProfile(); p.collection.cards[1].class = 10;
  const snap = P.snapshot(p, 'build'); assert.equal(snap.deckSystem, 1); assert.equal(snap.classes[1], 10);
  assert.equal(P.damageMultiplier(snap, 1), 1.27); assert.equal(snap.critChance, .1); assert.equal(snap.critDamage, 1.545);
  assert.equal(Object.isFrozen(snap.classes), true); p.collection.cards[1].class = 20; assert.equal(snap.classes[1], 10);
  assert.equal(P.snapshotValid(snap), true); assert.equal(P.snapshotValid({ ...snap, critDamage: 100 }), false);
  for (const mode of ['clear', 'multi']) assert.deepEqual(P.snapshot(p, mode), P.snapshot(legacyProfile(), mode));
  const legacy = { mode: 'build', growth: true, levelCap: 20, deck: [1, 2, 3, 4, 5], levels: { 1: 20, 2: 1, 3: 1, 4: 1, 5: 1 } };
  assert.equal(P.snapshotValid(legacy), true); assert.equal(P.damageMultiplier(legacy, 1), 2.52);
});

test('old-client upgrades after migration retain their exact equivalent collection credit without fractional loss', () => {
  const p = legacyProfile(); p.shards = 25;
  const first = P.upgrade(p, 1), second = P.upgrade(p, 1);
  assert.equal(first.cost, 10); assert.deepEqual(first.collectionRewards, { gold: 100, copies: 0 });
  assert.equal(second.cost, 15); assert.deepEqual(second.collectionRewards, { gold: 150, copies: 8 });
  assert.equal(p.levels[1], 3); assert.equal(p.collection.gold, 850); assert.equal(p.collection.cards[1].copies, 8);
  assert.equal(p.shards, 0); const saved = JSON.stringify(p); P.migrateCollection(p); assert.equal(JSON.stringify(p), saved);
});
