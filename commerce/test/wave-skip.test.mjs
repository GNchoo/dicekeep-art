import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';

test('overlap tickets retain their capability on resume and settle a fast legitimate run exactly once', async () => {
  const f = await fixture(), a = await f.login(), other = await f.login('other');
  const started = await f.call('/runs/start', { mode: 'build', waveSkip: 1 }, a.token);
  assert.equal(started.status, 200);
  assert.equal(started.body.waveSkip, 1);
  assert.equal((await f.storage.get('run:' + started.body.ticket)).waveSkip, 1);
  const resumed = await f.call('/runs/resume', { ticket: started.body.ticket }, a.token);
  assert.equal(resumed.body.waveSkip, 1);
  assert.equal(resumed.body.startedAt, started.body.startedAt);
  f.state.now += 30000;
  const report = { ticket: started.body.ticket, wave: 101, startedWave: 101, kills: 3000, won: true, elapsed: 99999 };
  assert.equal((await f.call('/runs/settle', report, other.token)).status, 404);
  const result = await f.call('/runs/settle', report, a.token);
  assert.equal(result.status, 200);
  assert.equal(result.body.profile.records.build.runs[0].elapsed, 30);
  assert.equal((await f.call('/runs/settle', report, a.token)).body.duplicate, true);
  assert.equal((await f.call('/runs/settle', { ...report, startedWave: 100 }, a.token)).body.error, 'run-conflict');
});

test('overlap bounds reject impossible launch and kill counts while legacy tickets retain their timing rules', async () => {
  const f = await fixture(), a = await f.login();
  for (const value of [0, 2, true, '1']) assert.equal((await f.call('/runs/start', { mode: 'build', waveSkip: value }, a.token)).status, 400);
  assert.equal((await f.call('/runs/start', { mode: 'duel', waveSkip: 1 }, a.token)).status, 400);
  const started = await f.call('/runs/start', { mode: 'extreme', waveSkip: 1 }, a.token);
  assert.equal(started.status, 200);
  const ticket = started.body.ticket, report = { ticket, wave: 0, startedWave: 1, kills: 0, won: false };
  assert.equal((await f.call('/runs/settle', { ticket, wave: 0, kills: 0, won: false }, a.token)).status, 400);
  assert.equal((await f.call('/runs/settle', { ...report, kills: 1 }, a.token)).body.error, 'run-time-invalid');
  f.state.now += 1000;
  assert.equal((await f.call('/runs/settle', { ...report, wave: 1000000, startedWave: 1000000 }, a.token)).body.error, 'run-time-invalid');
  assert.equal((await f.call('/runs/settle', { ...report, startedWave: 12 }, a.token)).body.error, 'run-time-invalid');
  assert.equal((await f.call('/runs/settle', { ...report, kills: 18 }, a.token)).body.error, 'run-time-invalid');
  f.state.now += 29000;
  assert.equal((await f.call('/runs/settle', { ...report, kills: 37 }, a.token)).body.error, 'run-time-invalid');
  assert.equal((await f.call('/runs/settle', { ...report, startedWave: 1.5 }, a.token)).status, 400);
  assert.equal((await f.call('/runs/settle', { ...report, wave: 2, startedWave: 1 }, a.token)).status, 400);
  assert.equal((await f.call('/runs/settle', { ...report, wave: 1, kills: 36 }, a.token)).status, 200);

  const pure = (await f.call('/runs/start', { mode: 'clear', waveSkip: 1 }, a.token)).body.ticket;
  f.state.now += 30000;
  assert.equal((await f.call('/runs/settle', { ticket: pure, wave: 101, startedWave: 102, kills: 0, won: true }, a.token)).status, 400);
  assert.equal((await f.call('/runs/settle', { ticket: pure, wave: 1, startedWave: 1, kills: 79, won: false }, a.token)).status, 200);

  const legacy = (await f.call('/runs/start', { mode: 'build' }, a.token)).body.ticket;
  f.state.now += 30000;
  assert.equal((await f.call('/runs/settle', { ticket: legacy, wave: 101, kills: 3000, won: true }, a.token)).body.error, 'run-time-invalid');
  assert.equal((await f.call('/runs/settle', { ticket: legacy, wave: 1, startedWave: 1, kills: 0, won: false }, a.token)).body.error, 'unexpected-field');
  assert.equal((await f.call('/runs/settle', { ticket: legacy, wave: 1, kills: 0, won: false }, a.token)).status, 200);
});

test('authenticated legacy resume can enable overlap without replacing its frozen run or upgrading a battle ticket', async () => {
  const f = await fixture(), a = await f.login(), other = await f.login('other');
  const started = (await f.call('/runs/start', { mode: 'extreme' }, a.token)).body;
  const key = 'run:' + started.ticket, before = await f.storage.get(key);
  assert.equal((await f.call('/runs/resume', { ticket: started.ticket }, a.token)).body.waveSkip, undefined);
  assert.equal((await f.call('/runs/resume', { ticket: started.ticket, waveSkip: 1 }, other.token)).status, 404);
  assert.deepEqual(await f.storage.get(key), before);
  const resumed = await f.call('/runs/resume', { ticket: started.ticket, waveSkip: 1 }, a.token);
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.waveSkip, 1);
  assert.equal(resumed.body.ticket, started.ticket);
  assert.equal(resumed.body.startedAt, started.startedAt);
  assert.deepEqual(resumed.body.snapshot, started.snapshot);
  assert.deepEqual(await f.storage.get(key), { ...before, waveSkip: 1 });
  f.state.now += 30000;
  assert.equal((await f.call('/runs/settle', { ticket: started.ticket, wave: 101, startedWave: 101, kills: 3000, won: false }, a.token)).status, 200);
  assert.equal((await f.call('/runs/resume', { ticket: started.ticket, waveSkip: 1 }, a.token)).status, 409);

  const battle = { ...before, id: 'b'.repeat(64), mode: 'coop' };
  await f.storage.put('run:' + battle.id, battle);
  assert.equal((await f.call('/runs/resume', { ticket: battle.id, waveSkip: 1 }, a.token)).status, 400);
  assert.deepEqual(await f.storage.get('run:' + battle.id), battle);
});
