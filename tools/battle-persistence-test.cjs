const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../progression.js');
const SAVE = require('../run-save.js');

const modes = ['duel', 'coop'];
const clone = value => JSON.parse(JSON.stringify(value));
const run = (mode, id = mode) => ({ id, mode, wave: 500, kills: 5000, won: true, date: '2026-09-14', elapsed: 400 });
function profile() {
  const p = P.defaultProfile();
  P.setPreset(p, 0, [6, 5, 4, 3, 2]);
  p.tree.mastery[6] = 3; p.tree.talents[6] = 'force'; p.tree.awakenings[6] = true;
  p.tree.supporter = 'crusher';
  return p;
}
function fixture(mode, multiplayer = modes.includes(mode)) {
  const p = profile(), snapshot = P.snapshot(p, mode), matchId = 'ABCD:123:456';
  const tower = { face: 6, lvl: 1, spot: 0, cd: .25, deckSystem: 1, pips: 7, abilityT: 12, shotSerial: 4 };
  const enemy = { def: { id: 'm1' }, hp: 20, max: 100, dist: 30, lane: 0, poisonT: 2, poisonDps: 3, transferred: true };
  const s = { gold: 234, lives: 12, wave: 7, waveActive: true, autoT: 1, waveT: 3, heldDie: 6, time: 78, speed: 1,
    towers: [tower], enemies: [enemy], projs: [{ tgt: enemy, src: tower, dmg: 5, trail: [] }], spawnQ: [],
    inf: { mode, growthSnapshot: snapshot, runId: 'saved-run', recordKey: multiplayer && !modes.includes(mode) ? 'extremeMulti' : mode,
      clearWave: mode === 'build' ? 101 : 0, doneW: 6, kills: 230, power: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      deckPower: Object.fromEntries(snapshot.deck.map(id => [id, 2])), bossT: 1, accountTicket: null, queue: ['d6'], supporterCooldown: 20, supporterUses: 2 } };
  const meta = { owner: 'local', savedAt: 1234, elapsed: 78, size: [400, 800], lanes: [900], match: multiplayer ? { code: 'ABCD', pid: 'player1', t0: 123 } : null };
  if (modes.includes(mode)) {
    Object.assign(s.inf, { battleModeVersion: 1, battleApplied: [matchId + ':1'], battleBossRound: 2, battleDirty: true });
    Object.assign(meta.match, { matchId, transport: { matchId, seq: 3, outbox: [
      { t: 'battle', matchId, seq: 1, kind: 'kill', count: 5, transferred: false, attempted: true },
      { t: 'battle', matchId, seq: 2, kind: 'leak', count: 1, boss: true },
      { t: 'battle', matchId, seq: 3, kind: 'assist' },
    ] } });
  }
  return { s, slot: { kind: 'd6', active: false }, meta };
}
const capture = mode => { const f = fixture(mode); return SAVE.capture(f.s, f.slot, f.meta); };

test('duel freezes normalized stats while coop preserves earned growth and both cap at 20', () => {
  const p = profile();
  for (const mode of modes) {
    const s = P.snapshot(p, mode);
    assert.equal(P.snapshotValid(s), true); assert.equal(P.growsIn(mode), true); assert.equal(s.levelCap, 20);
    assert.equal(s.treeVersion, 1); assert.equal(s.supporter, 'crusher'); assert.deepEqual(s.deck, [6, 5, 4, 3, 2]);
    assert.equal(P.damageMultiplier(s, 6), mode === 'duel' ? 1 : 1.09 * 1.1);
    const before = clone(s); p.tree.mastery[6] = 4;
    assert.deepEqual(clone(s), before); p.tree.mastery[6] = 3;
    for (const key of ['deck', 'mastery', 'talents', 'awakenings', 'levels']) assert.ok(Object.isFrozen(s[key]));
  }
  delete p.tree; delete p.collection; p.levels[6] = 200;
  for (const mode of modes) assert.equal(P.damageMultiplier(P.snapshot(p, mode), 6), mode === 'duel' ? 1 : 2.52);
});

test('old profiles gain empty trial records without changing investments, records or snapshots', () => {
  const p = profile(); P.settle(p, { ...run('build'), wave: 101 });
  delete p.records.duel; delete p.records.coop;
  const before = clone(p), snapshot = clone(P.snapshot(P.sanitize(p), 'build'));
  const migrated = P.sanitize(p);
  assert.deepEqual({ ...migrated.records, duel: undefined, coop: undefined }, { ...before.records, duel: undefined, coop: undefined });
  for (const key of ['shards', 'levels', 'deck', 'collection', 'tree', 'settled', 'legacy']) assert.deepEqual(migrated[key], before[key]);
  for (const mode of modes) assert.deepEqual(migrated.records[mode], { best: 0, clears: 0, runs: [], milestones: [], gemMilestones: [] });
  assert.deepEqual(clone(P.snapshot(migrated, 'build')), snapshot);
  assert.deepEqual(P.sanitize(migrated), migrated);
});

test('trial settlement records victories without any currency, pack or milestone rewards; duplicates do nothing', () => {
  for (const schema of ['tree', 'collection', 'legacy']) for (const mode of modes) {
    const p = profile(); if (schema !== 'tree') delete p.tree; if (schema === 'legacy') delete p.collection;
    const before = clone(p), result = P.settle(p, run(mode));
    assert.equal(result.ok, true); assert.equal(result.shards, 0); assert.equal(result.earnedShards, 0);
    assert.deepEqual(result.collectionRewards, { gold: 0, packs: 0 }); assert.deepEqual(result.newly, []);
    assert.equal(p.shards, before.shards); assert.deepEqual(p.collection, before.collection); assert.deepEqual(p.tree, before.tree);
    assert.equal(p.records[mode].best, 500); assert.equal(p.records[mode].clears, 1);
    assert.deepEqual(p.records[mode].runs, [run(mode)]); assert.deepEqual(p.records[mode].milestones, []);
    const settled = clone(p), duplicate = P.settle(p, { ...run(mode), wave: 99999 });
    assert.equal(duplicate.duplicate, true); assert.equal(duplicate.shards, 0); assert.deepEqual(p, settled);
  }
});

test('trial save round trip retains the board, frozen growth, outbox and event deduplication state together', () => {
  for (const mode of modes) {
    const f = fixture(mode), p = SAVE.capture(f.s, f.slot, f.meta), encoded = SAVE.encode(p);
    const decoded = SAVE.decode(encoded, 'local'); assert.deepEqual(decoded, p); assert.equal(SAVE.decode(encoded, 'other'), null);
    f.s.inf.battleApplied.push('not-saved'); f.meta.match.transport.outbox.length = 0;
    assert.equal(p.inf.battleApplied.length, 1); assert.equal(p.match.transport.outbox.length, 3);
    const defs = { 6: { name: 'tower' } }, hydrated = SAVE.hydrate(decoded, defs);
    assert.deepEqual(hydrated.inf, p.inf); assert.equal(hydrated.projs[0].tgt, hydrated.enemies[0]);
    assert.equal(hydrated.projs[0].src, hydrated.towers[0]); assert.equal(hydrated.towers[0].def, defs[6]);
    assert.equal(hydrated.enemies[0].transferred, true); assert.equal(hydrated.inf.supporterCooldown, 20);
  }
});

test('trial saves reject wrong matches, missing protocol state, duplicate actions and malformed reports', () => {
  const mutations = [
    p => { p.match = null; }, p => { delete p.match.transport; }, p => { p.match.transport.matchId = 'another'; },
    p => { p.inf.battleModeVersion = 2; }, p => { p.inf.recordKey = 'extremeMulti'; }, p => { p.inf.clearWave = 101; },
    p => { p.inf.battleBossRound = -.5; }, p => { p.inf.battleApplied.push(p.inf.battleApplied[0]); },
    p => { p.inf.battleApplied = ['another:1']; }, p => { p.inf.battleApplied = Array.from({ length: 129 }, (_, i) => p.match.matchId + ':' + i); },
    p => { p.inf.accountTicket = 'invalid-ticket'; }, p => { p.inf.growthSnapshot.mode = 'build'; },
    p => { p.match.transport.outbox[1].seq = 1; }, p => { p.match.transport.outbox[1].seq = 4; },
    p => { p.match.transport.outbox[0].matchId = 'another'; }, p => { p.match.transport.outbox[0].count = 101; },
    p => { delete p.match.transport.outbox[0].transferred; }, p => { p.match.transport.outbox[1].boss = 1; },
    p => { p.match.transport.outbox[2].count = 1; }, p => { p.match.transport.seq = Infinity; },
  ];
  for (const mode of modes) for (const mutate of mutations) {
    const p = capture(mode); mutate(p); assert.equal(SAVE.valid(p), false, mode + ': ' + mutate.toString());
    assert.equal(SAVE.decode(JSON.stringify(p), 'local'), null);
  }
  const largest = capture('coop'); largest.inf.battleApplied = Array.from({ length: 128 }, (_, i) => largest.match.matchId + ':' + i);
  largest.match.transport.seq = 256;
  largest.match.transport.outbox = Array.from({ length: 256 }, (_, i) => ({ t: 'battle', matchId: largest.match.matchId, seq: i + 1, kind: 'assist' }));
  assert.equal(SAVE.valid(largest), true);
  largest.match.transport.outbox.push({ ...largest.match.transport.outbox[0], seq: 257 }); assert.equal(SAVE.valid(largest), false);
});

test('long-idle towers preserve negative cooldowns on reload and remain immediately ready to fire', () => {
  for (const mode of ['build', 'extreme', 'duel', 'coop']) {
    const f = fixture(mode); f.s.towers[0].cd = -100.5;
    const saved = SAVE.capture(f.s, f.slot, f.meta), restored = SAVE.hydrate(SAVE.decode(SAVE.encode(saved), 'local'), { 6: {} });
    assert.equal(restored.towers[0].cd, -100.5);
    assert.ok(restored.towers[0].cd <= 0, 'recovery must not add a positive attack delay to an already-ready tower');
    for (const cd of [-1e12, -.001, 0, 1e6]) { const p = clone(saved); p.towers[0].cd = cd; assert.equal(SAVE.valid(p), true); }
    for (const cd of [-1e12 - 1, 1e6 + 1, -Infinity, Infinity, NaN]) {
      const p = clone(saved); p.towers[0].cd = cd; assert.equal(SAVE.valid(p), false);
    }
  }
});

test('growth-105 solo and extreme multiplayer checkpoints remain valid without new battle fields', () => {
  assert.equal(SAVE.RULES, 'growth-105');
  for (const [mode, multi] of [['build', false], ['extreme', false], ['extreme', true]]) {
    const f = fixture(mode, multi), saved = SAVE.capture(f.s, f.slot, f.meta);
    assert.equal(saved.inf.battleModeVersion, undefined); assert.deepEqual(SAVE.decode(SAVE.encode(saved), 'local'), saved);
  }
});

test('account battle checkpoint retains its settlement ticket through reload', () => {
  const p = capture('coop'); p.owner = 'account:reward-test'; p.inf.accountTicket = 'a'.repeat(64);
  assert.equal(SAVE.valid(p), true); assert.equal(SAVE.decode(JSON.stringify(p), p.owner).inf.accountTicket, p.inf.accountTicket);
});
