import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, paidToss } from './helpers.mjs';
import PG from '../src/progression.mjs';

test('research mastery debits free then paid shards transactionally and concurrent request IDs apply exactly once', async () => {
  const f = await fixture(), a = await f.login(); await paidToss(f, a, 'shards200');
  const key = 'account:' + a.accountId, p = await f.storage.get(key);
  p.wallet.free = 3; p.profile.shards += 3; p.profile.tree.mastery[1] = 2; await f.storage.put(key, p);
  const action = { type: 'treeUpgrade', face: 1, requestId: 'tree-research-one' };
  const replies = await Promise.all([f.call('/profile/action', action, a.token), f.call('/profile/action', action, a.token)]);
  assert.ok(replies.every(r => r.status === 200)); assert.equal(replies.filter(r => r.body.duplicate).length, 1);
  assert.deepEqual((await f.call('/wallet', undefined, a.token)).body, { free: 0, paid: 193, debt: 0 });
  const after = (await f.call('/profile', undefined, a.token)).body;
  assert.equal(after.tree.mastery[1], 3); assert.equal(after.collection.gold, 1860 - 240);
  assert.equal((await f.call('/profile/action', { ...action, face: 2 }, a.token)).body.error, 'request-id-conflict');
  const before = await f.storage.get(key);
  assert.equal((await f.call('/profile/action', { ...action, requestId: 'tree-inject-cost', cost: { shards: 0, gold: 0 } }, a.token)).status, 400);
  assert.deepEqual(await f.storage.get(key), before);
});
test('unlock prerequisites and mastery/awakening gates are server authoritative and failed actions do not consume resources', async () => {
  const f = await fixture(), a = await f.login(), key = 'account:' + a.accountId;
  const before = await f.storage.get(key);
  for (const [type, face, reason] of [['treeUnlock', 20, 'prerequisite'], ['treeUpgrade', 20, 'locked'], ['treeAwaken', 1, 'mastery-required']]) {
    assert.equal((await f.call('/profile/action', { type, face, requestId: 'gate-' + type }, a.token)).body.error, reason);
  }
  assert.deepEqual(await f.storage.get(key), before);
  const unlock = (await f.call('/profile/action', { type: 'treeUnlock', face: 7, requestId: 'unlock-research7' }, a.token)).body;
  assert.equal(unlock.profile.collection.cards[7].owned, true); assert.deepEqual(unlock.cost, { gold: 120, shards: 0 });
  assert.equal((await f.call('/profile/action', { type: 'treeUnlock', face: 10, requestId: 'unlock-research10' }, a.token)).body.error, 'insufficient-shards');
});
test('talents and supporters switch freely, their request fingerprints differ, and saved run snapshots stay frozen', async () => {
  const f = await fixture(), a = await f.login(), key = 'account:' + a.accountId;
  const p = await f.storage.get(key); p.profile.tree.mastery[1] = 3; p.profile.shards = 15; p.wallet.free = 15; await f.storage.put(key, p);
  const talent = { type: 'treeTalent', face: 1, choice: 'force', requestId: 'talent-force-one' };
  assert.equal((await f.call('/profile/action', talent, a.token)).status, 200);
  assert.equal((await f.call('/profile/action', { ...talent, choice: 'insight' }, a.token)).body.error, 'request-id-conflict');
  const awaken = (await f.call('/profile/action', { type: 'treeAwaken', face: 1, requestId: 'awaken-research1' }, a.token)).body;
  assert.equal(awaken.profile.tree.awakenings[1], true); assert.equal(awaken.profile.shards, 0);
  const s = (await f.call('/runs/start', { mode: 'build' }, a.token)).body;
  assert.equal(s.snapshot.treeVersion, 1); assert.equal(s.snapshot.talents[1], 'force'); assert.equal(s.snapshot.awakenings[1], true);
  assert.equal((await f.call('/profile/action', { ...talent, choice: 'insight', requestId: 'talent-insight-one' }, a.token)).status, 200);
  const support = { type: 'setSupporter', id: 'crusher', requestId: 'supporter-select1' };
  const changed = await f.call('/profile/action', support, a.token); assert.equal(changed.status, 200); assert.equal(changed.body.profile.tree.supporter, 'crusher');
  assert.equal((await f.call('/profile/action', { ...support, id: 'barrage' }, a.token)).body.error, 'request-id-conflict');
  const resumed = (await f.call('/runs/resume', { ticket: s.ticket }, a.token)).body;
  assert.deepEqual(resumed.snapshot, s.snapshot); assert.equal(resumed.profile.tree.talents[1], 'insight');
  assert.equal(PG.snapshotValid(resumed.snapshot), true); assert.equal(resumed.profile.tree.supporter, 'crusher');
  const relogin = await f.login(); assert.equal(relogin.profile.tree.awakenings[1], true); assert.equal(relogin.profile.tree.supporter, 'crusher');
});
test('settlement pays deterministic research gold and existing free shards once, including concurrent retries', async () => {
  const f = await fixture(), a = await f.login(), ticket = (await f.call('/runs/start', { mode: 'clear' }, a.token)).body.ticket;
  f.state.now += 300000;
  const request = { ticket, wave: 25, kills: 100, won: false };
  const replies = await Promise.all([f.call('/runs/settle', request, a.token), f.call('/runs/settle', request, a.token)]);
  assert.ok(replies.every(r => r.status === 200)); assert.equal(replies.reduce((sum, r) => sum + r.body.shards, 0), 45);
  assert.equal(replies.reduce((sum, r) => sum + r.body.collectionRewards.gold, 0), 1120);
  assert.equal(replies.reduce((sum, r) => sum + r.body.collectionRewards.packs, 0), 0);
  const p = (await f.call('/profile', undefined, a.token)).body; assert.equal(p.collection.packs, 0); assert.equal(p.collection.gold, 2980);
  assert.equal((await f.call('/runs/settle', { ...request, wave: 26 }, a.token)).body.error, 'run-conflict');
});
test('paid and free growth share identical research nodes, refund debt blocks growth but pure snapshots remain identical', async () => {
  const f = await fixture(), a = await f.login(), b = await f.login('free-user'); await paidToss(f, a, 'shards200');
  const paidKey = 'account:' + a.accountId, freeKey = 'account:' + b.accountId;
  const paid = await f.storage.get(paidKey), free = await f.storage.get(freeKey);
  free.wallet.free = 200; free.profile.shards = 200; free.profile.collection.rng = paid.profile.collection.rng;
  paid.profile.tree.mastery[1] = 2; free.profile.tree.mastery[1] = 2; await f.storage.put(paidKey, paid); await f.storage.put(freeKey, free);
  const action = { type: 'treeUpgrade', face: 1, requestId: 'same-research-cost' };
  const pa = (await f.call('/profile/action', action, a.token)).body, fb = (await f.call('/profile/action', action, b.token)).body;
  assert.deepEqual(pa.cost, fb.cost); assert.deepEqual(pa.profile.tree, fb.profile.tree); assert.equal(pa.profile.shards, fb.profile.shards);
  assert.deepEqual(PG.snapshot(pa.profile, 'clear'), PG.snapshot(fb.profile, 'clear'));
  const debt = await f.storage.get(paidKey); debt.wallet.debt = 1; await f.storage.put(paidKey, debt);
  assert.equal((await f.call('/profile/action', { type: 'treeTalent', face: 1, choice: 'force', requestId: 'refund-talent-one' }, a.token)).body.error, 'refund-debt');
  assert.equal((await f.call('/runs/start', { mode: 'build' }, a.token)).body.error, 'refund-debt');
  assert.equal((await f.call('/runs/start', { mode: 'clear' }, a.token)).status, 200);
});
