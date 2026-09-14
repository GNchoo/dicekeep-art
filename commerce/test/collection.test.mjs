import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, paidToss } from './helpers.mjs';
import { sha } from '../src/common.mjs';
import PG from '../src/progression.mjs';

test('legacy collection migration is transactional, preserves paid/free/debt and keeps the old active snapshot', async () => {
  const f = await fixture(), login = await f.login(), key = 'account:' + login.accountId;
  const a = await f.storage.get(key); delete a.profile.collection; a.profile.levels[1] = 21;
  a.profile.shards = 90; a.wallet = { free: 30, paid: 60, debt: 9 };
  const oldSnapshot = PG.snapshot(a.profile, 'build'), ticket = 'f'.repeat(64); a.activeRun = ticket;
  await f.storage.put('run:' + ticket, { id: ticket, accountId: login.accountId, mode: 'build', snapshot: oldSnapshot, startedAt: f.state.now });
  await f.storage.put(key, a);
  const calls = await Promise.all([f.call('/profile', undefined, login.token), f.call('/wallet', undefined, login.token)]);
  assert.ok(calls.every(r => r.status === 200));
  const migrated = await f.storage.get(key);
  assert.deepEqual(migrated.wallet, a.wallet); assert.deepEqual(migrated.profile.levels, a.profile.levels);
  assert.equal(migrated.profile.collection.cards[1].class, 14); assert.equal(migrated.profile.collection.gold, 1700);
  assert.deepEqual((await f.storage.get('run:' + ticket)).snapshot, oldSnapshot);
  const second = await f.login(); assert.deepEqual(second.profile.collection, migrated.profile.collection); assert.deepEqual(second.wallet, a.wallet);
});

test('fixed crafting spends free before paid, uses server quantities and identical requests charge only once', async () => {
  const f = await fixture(), a = await f.login(); await paidToss(f, a, 'shards200');
  const ticket = (await f.call('/runs/start', { mode: 'clear' }, a.token)).body.ticket; f.state.now += 60000;
  await f.call('/runs/settle', { ticket, wave: 10, kills: 20, won: false }, a.token);
  assert.deepEqual((await f.call('/wallet', undefined, a.token)).body, { free: 20, paid: 200, debt: 0 });
  const action = { type: 'craft', face: 20, requestId: 'craft-fixed-one' };
  const replies = await Promise.all([f.call('/profile/action', action, a.token), f.call('/profile/action', action, a.token)]);
  assert.ok(replies.every(r => r.status === 200)); assert.equal(replies.filter(r => r.body.duplicate).length, 1);
  let profile = (await f.call('/profile', undefined, a.token)).body;
  assert.equal(profile.collection.cards[20].owned, true); assert.equal(profile.collection.cards[20].copies, 0);
  assert.deepEqual((await f.call('/wallet', undefined, a.token)).body, { free: 0, paid: 200, debt: 0 });
  assert.equal((await f.call('/profile/action', { ...action, face: 19 }, a.token)).body.error, 'request-id-conflict');
  assert.equal((await f.call('/profile/action', { ...action, requestId: 'craft-fixed-two', copies: 999 }, a.token)).status, 400);
  await f.call('/profile/action', { ...action, requestId: 'craft-fixed-two' }, a.token);
  profile = (await f.call('/profile', undefined, a.token)).body;
  assert.equal(profile.collection.cards[20].copies, 1); assert.equal(profile.shards, 180);
  assert.deepEqual((await f.call('/wallet', undefined, a.token)).body, { free: 0, paid: 180, debt: 0 });
});

test('free pack actions reject client seed/rewards and atomically persist one opening for concurrent retries', async () => {
  const f = await fixture(), a = await f.login(), action = { type: 'openPack', requestId: 'supply-open-one' };
  for (const extra of [{ seed: 10 }, { rng: 1 }, { rewards: [20] }, { copies: 100 }, { packs: 999 }]) assert.equal((await f.call('/profile/action', { ...action, ...extra }, a.token)).status, 400);
  const result = await Promise.all([f.call('/profile/action', action, a.token), f.call('/profile/action', action, a.token)]);
  assert.ok(result.every(r => r.status === 200)); assert.deepEqual(result[0].body.cards, result[1].body.cards);
  assert.equal(result[0].body.cards.length, 5);
  const after = (await f.call('/profile', undefined, a.token)).body;
  assert.equal(after.collection.packs, 2); assert.equal(after.collection.opened, 1); assert.equal(after.collection.gold, 720);
  assert.deepEqual((await f.call('/wallet', undefined, a.token)).body, { free: 0, paid: 0, debt: 0 });
  assert.equal((await f.call('/orders', { sku: 'supply-pack', platform: 'web' }, a.token)).body.error, 'unknown-product');
});

test('class upgrades spend only collection resources and preset activation persists without changing a running snapshot', async () => {
  const f = await fixture(), a = await f.login(), key = 'account:' + a.accountId;
  const stored = await f.storage.get(key); stored.profile.collection.cards[1].copies = 2; stored.profile.collection.gold = 60; await f.storage.put(key, stored);
  const started = (await f.call('/runs/start', { mode: 'build' }, a.token)).body;
  assert.equal(started.snapshot.deckSystem, 1); assert.equal(started.snapshot.classes[1], 1);
  const request = { type: 'classUp', face: 1, requestId: 'class-upgrade-one' };
  const replies = await Promise.all([f.call('/profile/action', request, a.token), f.call('/profile/action', request, a.token)]);
  assert.ok(replies.every(r => r.status === 200)); assert.equal(replies[0].body.profile.collection.cards[1].class, 2);
  assert.equal(replies[0].body.profile.collection.gold, 0); assert.equal(replies[0].body.profile.shards, 0);
  const deck = [6, 5, 4, 3, 2];
  assert.equal((await f.call('/profile/action', { type: 'setPreset', index: 1, deck, requestId: 'preset-save-one' }, a.token)).status, 200);
  const active = (await f.call('/profile/action', { type: 'activatePreset', index: 1, requestId: 'preset-activate-one' }, a.token)).body;
  assert.deepEqual(active.profile.deck, deck); assert.equal(active.profile.collection.activePreset, 1);
  const resume = (await f.call('/runs/resume', { ticket: started.ticket }, a.token)).body;
  assert.deepEqual(resume.snapshot, started.snapshot);
  assert.equal((await f.call('/profile/action', { type: 'setPreset', index: 2, deck: [20, 1, 2, 3, 4], requestId: 'preset-locked-one' }, a.token)).body.error, 'invalid-deck');
  const relogin = await f.login(); assert.deepEqual(relogin.profile.deck, deck);
});

test('server settlement durably credits free packs and gold only once while keeping old shard rewards', async () => {
  const f = await fixture(), a = await f.login(), ticket = (await f.call('/runs/start', { mode: 'clear' }, a.token)).body.ticket;
  f.state.now += 300000;
  const request = { ticket, wave: 25, kills: 100, won: false };
  const replies = await Promise.all([f.call('/runs/settle', request, a.token), f.call('/runs/settle', request, a.token)]);
  assert.ok(replies.every(r => r.status === 200)); assert.equal(replies.reduce((sum, r) => sum + r.body.shards, 0), 45);
  assert.equal(replies.reduce((sum, r) => sum + r.body.collectionRewards.packs, 0), 2);
  const p = (await f.call('/profile', undefined, a.token)).body; assert.equal(p.collection.packs, 5); assert.equal(p.collection.gold, 880);
  assert.equal((await f.call('/runs/settle', { ...request, wave: 26 }, a.token)).body.error, 'run-conflict');
});

test('new API preserves old action fingerprints and refund debt still blocks paid-growth spending', async () => {
  const f = await fixture(), a = await f.login(), fingerprint = await sha(JSON.stringify(['upgrade', 1, null, null]));
  await f.storage.put(`action:${a.accountId}:historic-upgrade-id`, { fingerprint, result: { ok: true, face: 1, level: 2, cost: 10 }, at: f.state.now });
  const old = await f.call('/profile/action', { type: 'upgrade', face: 1, requestId: 'historic-upgrade-id' }, a.token);
  assert.equal(old.status, 200); assert.equal(old.body.duplicate, true);
  const key = 'account:' + a.accountId, stored = await f.storage.get(key); stored.wallet.debt = 10; await f.storage.put(key, stored);
  assert.equal((await f.call('/profile/action', { type: 'craft', face: 20, requestId: 'debt-craft-test' }, a.token)).body.error, 'refund-debt');
  assert.equal((await f.call('/runs/start', { mode: 'clear' }, a.token)).status, 200);
});
