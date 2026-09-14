const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const L = require('../liveops-rules.js');
const clone = value => JSON.parse(JSON.stringify(value));
const settled = { ok: true, duplicate: false };
const now = '2026-09-14T15:00:00.000Z';
const solo = (id, wave = 101) => ({ id, mode: 'build', wave });
const battle = (id, seconds, mode = 'coop') => ({ id, mode, rewardVersion: 1, activeSeconds: seconds, elapsed: seconds });
function xpState(xp) { const s = L.defaultState(); s.pass.xp = xp; return s; }

test('default state and exported schedules have independent immutable data', () => {
  const first = L.defaultState(), second = L.defaultState();
  assert.equal(L.stateValid(first), true); assert.deepEqual(first, L.sanitize(null));
  first.pass.freeClaimed.push(1); first.xpRuns.push('changed');
  assert.deepEqual(second.pass.freeClaimed, []); assert.deepEqual(second.xpRuns, []);
  assert.equal(L.ATTENDANCE.length, 7); assert.equal(L.PASS.tiers, 20);
  assert.equal(L.PASS.priceKRW, 2900); assert.equal(L.PASS.subscription, false); assert.equal(L.PASS.expiresAt, null);
  assert.ok(Object.isFrozen(L) && Object.isFrozen(L.PASS) && Object.isFrozen(L.PASS.free) && Object.isFrozen(L.ATTENDANCE[0]));
});

test('KST midnight is stable across UTC offsets, years and leap days', () => {
  assert.equal(L.dayKey('2026-09-14T14:59:59.999Z'), '2026-09-14');
  assert.equal(L.dayKey(now), '2026-09-15');
  assert.equal(L.dayKey('2026-09-15T00:00:00+09:00'), '2026-09-15');
  assert.equal(L.dayKey(new Date(now)), '2026-09-15');
  assert.equal(L.dayKey(Date.parse(now)), '2026-09-15');
  assert.equal(L.dayKey('2026-12-31T15:00:00Z'), '2027-01-01');
  assert.equal(L.dayKey('2028-02-28T15:00:00Z'), '2028-02-29');
  for (const value of [NaN, Infinity, null, {}, '', 'garbage', '2026-09-15', '2026-09-15T00:00:00', new Date(NaN)]) assert.equal(L.dayKey(value), null);
});

test('attendance uses seven claims, preserves progress over gaps and grants only a small fourteen-claim total', () => {
  let state = L.defaultState(), gold = 0, shards = 0;
  for (let i = 0; i < 14; i++) {
    const date = Date.UTC(2026, 8, 1 + i * 3), before = clone(state), r = L.claimAttendance(state, date);
    assert.equal(r.ok, true); assert.equal(r.cycleDay, i % 7 + 1); assert.equal(r.xpAdded, 20);
    assert.deepEqual(state, before); assert.equal(L.stateValid(r.nextState), true);
    gold += r.reward.gold; shards += r.reward.shards; state = r.nextState;
    assert.equal(L.claimAttendance(state, date).reason, 'already-claimed');
  }
  assert.equal(state.attendance.total, 14); assert.equal(state.pass.xp, 280);
  assert.deepEqual({ gold, shards }, { gold: 2400, shards: 68 });
  for (const tier of [1, 2]) { const r = L.claimPass(state, { tier, track: 'free' }); state = r.nextState; gold += r.reward.gold; shards += r.reward.shards; }
  assert.deepEqual({ gold, shards }, { gold: 2600, shards: 72 });
  assert.equal(shards / 1440, .05); assert.equal(L.view(state, { now: '2027-01-01T00:00:00Z' }).attendance.cycleDay, 1);
});

test('expected attendance day prevents a stale request from claiming the next day and clock rollback never pays', () => {
  const state = L.defaultState(), before = clone(state);
  assert.equal(L.claimAttendance(state, now, '2026-09-14').reason, 'day-mismatch');
  assert.equal(L.claimAttendance(state, now, 'not-a-day').reason, 'day-mismatch');
  assert.equal(L.claimAttendance(state, 'bad').reason, 'invalid-time');
  assert.deepEqual(state, before);
  const r = L.claimAttendance(state, now, '2026-09-15'); assert.equal(r.ok, true);
  assert.equal(L.claimAttendance(r.nextState, '2026-09-14T00:00:00Z').reason, 'clock-before-last-claim');
  assert.equal(L.view(r.nextState, { now: '2026-09-14T00:00:00Z' }).attendance.canClaim, false);
  assert.equal(L.claimAttendance(r.nextState, '2026-10-01T00:00:00Z').cycleDay, 2);
  const max = clone(r.nextState); max.attendance.total = L.MAX_ATTENDANCE;
  assert.equal(L.claimAttendance(max, '2027-01-01T00:00:00Z').reason, 'attendance-limit');
});

test('run XP is computed from settled mode progress, with campaign and malformed input excluded', () => {
  assert.equal(L.xpForRun(solo('zero', 0)), 0);
  assert.equal(L.xpForRun(solo('one', 1)), 2);
  assert.equal(L.xpForRun(solo('clear', 101)), 202);
  assert.equal(L.xpForRun(solo('cap', 100000)), 400);
  for (const mode of ['clear', 'build', 'extreme', 'multi', 'extremeMulti']) assert.equal(L.xpForRun({ ...solo('mode'), mode }), 202);
  assert.equal(L.xpForRun({ id: 'legacy', mode: 'duel' }), 0);
  const invalid = [null, {}, solo('', 5), solo('fraction', 1.5), solo('negative', -1), solo('infinite', Infinity),
    { ...solo('campaign'), mode: 'campaign' }, { ...solo('mixed'), rewardVersion: 1, activeSeconds: 60 },
    { ...battle('version', 60), rewardVersion: 2 }, { ...battle('elapsed', 60), elapsed: 59 }, battle('negative', -1), battle('fraction', .5), battle('max', 6001)];
  for (const run of invalid) assert.equal(L.xpForRun(run), null);
});

test('run XP requires actual settlement and protects retries without mutating caller data', () => {
  const state = L.defaultState(), run = solo('settled-once'), before = clone(state);
  for (const result of [undefined, null, {}, { ok: false, duplicate: false }, { ok: true }, { ok: true, duplicate: 0 }]) {
    assert.equal(L.awardRunXp(state, run, result).reason, 'unsettled-run'); assert.deepEqual(state, before);
  }
  const r = L.awardRunXp(state, run, settled); assert.equal(r.ok, true); assert.equal(r.xpAdded, 202);
  assert.deepEqual(r.reward, { gold: 0, shards: 0 }); assert.deepEqual(state, before);
  const duplicate = L.awardRunXp(r.nextState, run, settled); assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.xpAdded, 0); assert.deepEqual(duplicate.nextState, r.nextState);
  const serverDuplicate = L.awardRunXp(state, run, { ok: true, duplicate: true });
  assert.equal(serverDuplicate.xpAdded, 0); assert.deepEqual(serverDuplicate.nextState, state);
});

test('verified battle XP is floored by active seconds and equal for support, damage, wins and losses', () => {
  for (const [seconds, xp] of [[0,0],[1,0],[3,0],[4,1],[59,14],[60,15],[457,114],[6000,1500]]) {
    for (const mode of ['duel', 'coop']) {
      const support = L.awardRunXp(L.defaultState(), { ...battle('s', seconds, mode), kills: 0, won: false }, settled);
      const attack = L.awardRunXp(L.defaultState(), { ...battle('s', seconds, mode), kills: 500, won: true }, settled);
      assert.equal(support.xpAdded, xp); assert.deepEqual(support, attack);
    }
  }
  const legacy = L.awardRunXp(L.defaultState(), { id: 'old-battle', mode: 'coop' }, settled);
  assert.equal(legacy.ok, true); assert.equal(legacy.xpAdded, 0);
});

test('actual progression settlements award XP once while preserving the existing wallet calculation', () => {
  const P = require('../progression.js'), profile = P.defaultProfile(); let state = L.defaultState();
  const cases = [{ ...solo('pg-solo'), kills: 500, won: true, date: '2026-09-15', elapsed: 2200 },
    { ...battle('pg-coop', 457), wave: 35, kills: 0, won: true, date: '2026-09-15' }];
  for (const run of cases) {
    const result = P.settle(profile, run), wallet = clone(profile), awarded = L.awardRunXp(state, run, result);
    assert.equal(result.ok, true); assert.equal(awarded.xpAdded, run.mode === 'build' ? 202 : 114);
    assert.deepEqual(profile, wallet); state = awarded.nextState;
    const replay = L.awardRunXp(state, run, P.settle(profile, run));
    assert.equal(replay.duplicate, true); assert.equal(replay.xpAdded, 0); assert.deepEqual(replay.nextState, state);
  }
  assert.equal(state.pass.xp, 316);
});

test('XP cap, bounded replay history and attendance continue safely after pass completion', () => {
  let state = xpState(1990);
  const near = L.awardRunXp(state, solo('finish'), settled); assert.equal(near.xpAdded, 10); assert.equal(near.earnedXp, 202); state = near.nextState;
  for (let i = 0; i < 70; i++) state = L.awardRunXp(state, solo('later-' + i), settled).nextState;
  assert.equal(state.pass.xp, 2000); assert.equal(state.xpRuns.length, 64); assert.equal(state.xpRuns[0], 'later-69');
  assert.equal(L.awardRunXp(state, solo('finish'), settled).xpAdded, 0);
  const attendance = L.claimAttendance(state, now); assert.equal(attendance.xpAdded, 0);
  assert.deepEqual(attendance.reward, { gold: 100, shards: 3 }); assert.equal(attendance.nextState.attendance.total, 1);
  const view = L.view(attendance.nextState, { now }); assert.equal(view.pass.nextTierXp, null); assert.equal(view.pass.xpInTier, 100);
});

test('free pass rewards claim any unlocked tier exactly once and total 2000 gold plus 40 shards', () => {
  let state = xpState(2000), total = { gold: 0, shards: 0 };
  assert.equal(L.claimPass(xpState(99), { tier: 1, track: 'free' }).reason, 'tier-locked');
  for (let tier = 20; tier > 0; tier--) {
    const before = clone(state), r = L.claimPass(state, { tier, track: 'free' });
    assert.equal(r.ok, true); assert.deepEqual(state, before); state = r.nextState;
    total.gold += r.reward.gold; total.shards += r.reward.shards;
    assert.equal(L.claimPass(state, { tier, track: 'free' }).reason, 'already-claimed');
  }
  assert.deepEqual(total, { gold: 2000, shards: 40 });
  assert.deepEqual(state.pass.freeClaimed, Array.from({ length: 20 }, (_, i) => i + 1));
});

test('premium purchase is external, retroactive and grants 200 shards plus royal only at tier ten', () => {
  let state = xpState(2000), gold = 0, shards = 0, skins = [];
  for (const premium of [false, 1, 'true', null]) assert.equal(L.claimPass(state, { tier: 1, track: 'premium', premium }).reason, 'premium-required');
  const before = clone(state); assert.equal(L.view(state, { now, premium: true }).pass.owned, true); assert.deepEqual(state, before);
  for (let tier = 1; tier <= 20; tier++) {
    const r = L.claimPass(state, { tier, track: 'premium', premium: true }); assert.equal(r.ok, true); state = r.nextState;
    gold += r.reward.gold; shards += r.reward.shards; if (r.reward.skinId) skins.push([tier, r.reward.skinId]);
  }
  assert.deepEqual({ gold, shards, skins }, { gold: 0, shards: 200, skins: [[10, 'royal']] });
  assert.deepEqual(state.pass.freeClaimed, []);
  assert.equal(L.claimPass(state, { tier: 10, track: 'premium', premium: true }).reason, 'already-claimed');
  assert.equal(L.claimPass(state, { tier: 10, track: 'free' }).ok, true);
});

test('malformed state and requests fail without partial changes; sanitizer repairs only known current fields', () => {
  const good = xpState(200), badStates = [null, {}, { ...good, version: 2 }, { ...good, pass: { ...good.pass, xp: NaN } },
    { ...good, attendance: { total: 1, lastDay: '2026-02-30' } }, { ...good, attendance: { total: 0, lastDay: '2026-09-14' } },
    { ...good, pass: { ...good.pass, freeClaimed: [3] } }, { ...good, pass: { ...good.pass, premiumClaimed: [1,1] } }, { ...good, xpRuns: ['same','same'] }];
  for (const state of badStates) {
    assert.equal(L.stateValid(state), false); assert.equal(L.claimAttendance(state, now).reason, 'invalid-state');
    assert.equal(L.claimPass(state, { tier: 1, track: 'free' }).reason, 'invalid-state');
    assert.equal(L.awardRunXp(state, solo('no'), settled).reason, 'invalid-state'); assert.equal(L.view(state, { now }), null);
    assert.equal(L.stateValid(L.sanitize(state)), true);
  }
  const dirty = { version: 1, attendance: { total: 8.7, lastDay: '2028-02-29' }, pass: { id: 'founders', xp: 259.9,
    freeClaimed: [2,1,1,3,-1,'2'], premiumClaimed: [2,20] }, xpRuns: ['ok','ok','',null,'\n'], ignored: 'discard' };
  const clean = L.sanitize(dirty);
  assert.deepEqual(clean, { version: 1, attendance: { total: 8, lastDay: '2028-02-29' }, pass: { id: 'founders', xp: 259,
    freeClaimed: [1,2], premiumClaimed: [2] }, xpRuns: ['ok'] });
  clean.pass.freeClaimed.push(10); assert.deepEqual(dirty.pass.freeClaimed, [2,1,1,3,-1,'2']);
  assert.deepEqual(L.sanitize({ version: 99, pass: { id: 'founders', xp: 2000 } }), L.defaultState());
  for (const options of [null, [], {}, { tier: 0, track: 'free' }, { tier: 21, track: 'free' }, { tier: 1.5, track: 'free' }, { tier: 1, track: 'paid' }]) assert.equal(L.claimPass(good, options).reason, 'invalid-tier');
  assert.equal(L.view(good, null), null); assert.equal(L.view(good, { now: 'bad' }), null);
});

test('browser UMD agrees with CommonJS and views cannot change stored state or public schedules', () => {
  const context = { window: {} }; vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../liveops-rules.js'), 'utf8'), context);
  const B = context.window.DKLIVEOPS, state = xpState(1000), before = clone(state);
  const expected = L.view(state, { now, premium: true }); assert.deepEqual(clone(B.view(clone(state), { now, premium: true })), expected);
  const view = L.view(state, { now, premium: true });
  view.attendance.cycle[0].gold = 999; view.pass.tiers[0].free.reward.shards = 999; view.pass.free.gold = 999;
  assert.deepEqual(state, before); assert.equal(L.ATTENDANCE[0].gold, 100); assert.equal(L.PASS.free.gold, 100);
  assert.deepEqual(clone(B.claimAttendance(B.defaultState(), Date.parse(now), '2026-09-15')), L.claimAttendance(L.defaultState(), Date.parse(now), '2026-09-15'));
});
