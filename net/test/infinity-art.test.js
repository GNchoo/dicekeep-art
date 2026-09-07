import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse, byteLength } from '../src/proto.js';
import { createRoom, emptyLive, reduce } from '../src/room-core.js';
import { timingFor } from '../src/timing.js';

const source = fs.readFileSync(new URL('../../infinity-art.js', import.meta.url), 'utf8');
const sandbox = { URL, setTimeout, clearTimeout };
vm.runInNewContext(source, sandbox);
const Art = sandbox.DKDirectionalArt;
const plain = o => JSON.parse(JSON.stringify(o));
const flush = () => new Promise(resolve => setImmediate(resolve));
async function settle(cache) { for (let i = 0; i < 40; i++) { await flush(); if (!cache.state().running) return; } throw Error('loader did not settle'); }
function entry(id = 'w001', cell = 64) {
  return { assetId: id, wave: 1, role: 'normal', ready: true, locomotion: 'legged', referenceHeight: 512, cycleStride: 170,
    views: Object.fromEntries(['side', 'front', 'back'].map(view => [view, { still: `${id}-${view}.png`, sheet: `${id}-${view}-walk.png`,
      frames: 8, cols: 4, rows: 2, cell, scale: cell / 512, pivot: [cell / 2, cell * 0.9], fallback: 'data:image/webp;base64,UklGRg==' }])) };
}
function fakeCanvas() { return { width: 0, height: 0, getContext: () => ({ drawImage() {} }) }; }
function setup(entries = { w001: entry() }, extra = {}) {
  const requests = [];
  const cache = Art.create({ manifest: { version: 93, entries }, base: 'https://game.example/', makeCanvas: fakeCanvas,
    loadImage: async (url, r) => { requests.push(url); return { width: r.descriptor.cell * (r.kind === 'sheet' ? r.descriptor.cols : 1), height: r.descriptor.cell * (r.kind === 'sheet' ? r.descriptor.rows : 1) }; }, ...extra });
  return { cache, requests };
}
const summary = en => ({ t: 'sum', w: 20, dw: 19, l: 20, g: 400, k: 12, f: 200, sp: 1, hid: 0, b: null, o: 'l', tw: [[0, 7, 1], [14, 20, 3]], ll: 9999, en });

test('appearance retains roster wave, boss role and elite without a resident image', () => {
  assert.equal(Art.appearance(102, false, false), 1);
  assert.equal(Art.appearance(20, true, false), 121);
  assert.equal(Art.appearance(5, false, true), 261);
  assert.deepEqual(plain(Art.decodeAppearance(121)), { code: 121, wave: 20, role: 'secondary', elite: false, assetId: 'b020-2' });
  assert.equal(Art.decodeAppearance(261).assetId, 'w005');
  for (const bad of [0, -1, 1.5, 102, 202, 256, 266, 458, NaN]) assert.equal(Art.decodeAppearance(bad), null);
});

test('repeated slot10 secondary keeps its combat role within the reviewed nineteen boss assets', () => {
  const content = { window: {} };
  vm.runInNewContext(fs.readFileSync(new URL('../../content.js', import.meta.url), 'utf8'), content);
  const inf = content.window.DKCONTENT.INFINITY, assets = new Set();
  for (let wave = 1; wave <= 303; wave++) {
    if (!inf.isBossWave(wave)) continue;
    const count = inf.wave(wave, false).bosses;
    for (let k = 0; k < count; k++) {
      const a = Art.decodeAppearance(Art.appearance(wave, k === 1, false));
      assert.ok(a, `unrouted actual boss W${wave} role${k}`);
      assert.equal(a.role, k ? 'secondary' : 'boss'); assets.add(a.assetId);
      if (k && a.wave === 10) assert.equal(a.assetId, 'b010');
    }
  }
  assert.equal(assets.size, 19); assert.ok(!assets.has('b010-2'));
  const rows = Art.parseEnemyStream(Art.enemyStream([{ i: 1000, d: 120, h: 9, a: 111, p: .25 }]));
  assert.equal(rows[0].appearance.assetId, 'b010'); assert.equal(rows[0].appearance.role, 'secondary');
});

test('flight spectator cadence follows original movement clock through scale, slow and stop', () => {
  for (const sourceScale of [.6, 1, 1.8]) for (const slow of [0, .5, 1]) for (const speed of [1, 3]) {
    const dt = .1, sourceSpeed = 114 * (1 - slow) * speed, cycle = .8;
    const observedAdvance = sourceSpeed * dt * sourceScale;
    const originalAnimAdvance = dt * sourceSpeed / 38;
    assert.ok(Math.abs(Art.timePhaseAdvance(observedAdvance, sourceScale, cycle) - originalAnimAdvance / cycle) < 1e-12);
  }
  for (const args of [[NaN, 1, .8], [1, 0, .8], [1, 1, 0], [-1, 1, .8]]) assert.equal(Art.timePhaseAdvance(...args), 0);
});

test('direction hysteresis and circular phase preserve a walk through corners/wrap', () => {
  assert.equal(Art.direction(1, 0, 'front'), 'side');
  assert.equal(Art.direction(0, 1, 'side'), 'front');
  assert.equal(Art.direction(0, -1, 'side'), 'back');
  assert.equal(Art.direction(1, 1, 'back'), 'back');
  assert.equal(Art.direction(1.19, 1, 'back'), 'back');
  assert.equal(Art.direction(1.2, 1, 'front'), 'front');
  assert.equal(Art.direction(1.21, 1, 'front'), 'side');
  assert.equal(Art.direction(1, -1.2, 'side'), 'side');
  assert.equal(Art.direction(1, -1.21, 'side'), 'back');
  assert.equal(Art.direction(0, 0, 'front'), 'front');
  assert.ok(Math.abs(Art.phaseError(0.02, 0.98) - 0.04) < 1e-10);
  assert.ok(Math.abs(Art.phase(102, 100) - 0.02) < 1e-10);
});

test('only flight/float may use zero-stride time animation; negative/invalid cycles fail', () => {
  for (const locomotion of ['flight', 'float']) assert.ok(Art.validateEntry('w001', { ...entry(), locomotion, cycleStride: 0 }));
  for (const locomotion of ['legged', 'slither']) assert.equal(Art.validateEntry('w001', { ...entry(), locomotion, cycleStride: 0 }), null);
  assert.equal(Art.validateEntry('w001', { ...entry(), locomotion: 'flight', cycleStride: -1 }), null);
  assert.equal(Art.validateEntry('w001', { ...entry(), cycleSeconds: 0 }), null);
});

test('protocol 3 preserves optional numeric columns; old clients read unchanged first three', () => {
  const rows = [{ i: 9, d: 125, h: 8, a: 5, p: 0.5 }, { i: 1001, d: 20, h: 9, a: 121, p: 0.25 }];
  const en = Art.enemyStream(rows), parsed = parse(JSON.stringify(summary(en)));
  assert.equal(parsed.ok, true); assert.equal(parsed.m.en, en);
  assert.deepEqual(en.split(';').map(row => row.split(',').slice(0, 3).map(Number)), [[9, 125, 8], [1001, 20, 9]]);
  const decoded = Art.parseEnemyStream(en);
  assert.equal(decoded[1].appearance.role, 'secondary'); assert.equal(decoded[0].p, 0.5);
  assert.equal(Art.parseEnemyStream('9,125,8')[0].appearance, null);
  assert.equal(Art.parseEnemyStream('9,125,8,999')[0].appearance, null);
});

test('200 enemies survive phase budget pressure and legal long-distance appearance overflow', () => {
  for (const row of [{ i: 99, d: 9999, h: 9, a: 201, p: 0.999 }, { i: 1099, d: 100000, h: 9, a: 201, p: 0.999 }]) {
    const en = Art.enemyStream(Array(200).fill(row));
    assert.equal(en.split(';').length, 200); assert.ok(en.length <= 3000);
    assert.equal(parse(JSON.stringify(summary(en))).ok, true);
    assert.ok(byteLength(JSON.stringify(summary(en))) < 4000);
    assert.ok(en.split(';').every(s => s.split(',').length <= 4), 'remove phase before identity/population');
  }
});

test('hostile optional fields cannot select URLs or corrupt a valid legacy enemy', () => {
  assert.deepEqual(plain(Art.parseEnemyStream('1,2,3,http://evil;1,2,3,1,-1;1,2,10;1,100001,2')), []);
  const row = Art.parseEnemyStream('1,2,3,1,999')[0];
  assert.equal(row.a, 1); assert.equal(row.p, null);
});

test('unapproved/malformed entries are never requested', async () => {
  const bad = entry(); bad.views.front.scale = 0.25;
  const { cache, requests } = setup({ w001: { ...entry(), ready: false }, w002: { ...bad, assetId: 'w002' } });
  cache.demand([{ id: 'w001', view: 'side' }], ['w002']); await settle(cache);
  assert.equal(cache.state().approvedEntries, 0); assert.equal(requests.length, 0);
});

test('cache loads at most two at once, keeps pivots/scale, versions URLs and reuses a request', async () => {
  const { cache, requests } = setup();
  cache.demand([{ id: 'w001', view: 'front' }, { id: 'w001', view: 'front' }]); await settle(cache);
  assert.equal(requests.length, 4); assert.equal(new Set(requests).size, 4);
  assert.ok(requests.every(url => new URL(url).searchParams.get('v') === '93'));
  const f = cache.frame('w001', 'front', 0.5);
  assert.equal(f.view, 'front'); assert.equal(f.referenceHeight, 64); assert.deepEqual(plain(f.pivot), [32, 57.6]);
  assert.equal(cache.state().maxRunning, 2); assert.ok(cache.state().peakTrackedBytes <= 96 * 1024 * 1024);
  cache.demand([{ id: 'w001', view: 'front' }]); await settle(cache); assert.equal(requests.length, 4);
});

test('dead-frame pins survive demand change, then eviction releases their canvases', async () => {
  const { cache } = setup({ w001: entry(), w002: entry('w002') });
  cache.demand([{ id: 'w001', view: 'side' }]); await settle(cache);
  const corpse = cache.frame('w001', 'side', 0.25);
  cache.demand([{ id: 'w002', view: 'side' }], [], [corpse.cacheKey]); await settle(cache);
  assert.equal(corpse.cv.width, 64);
  cache.demand([{ id: 'w002', view: 'side' }]); await settle(cache);
  assert.equal(corpse.cv.width, 0); assert.equal(cache.frame('w001', 'side', 0), null);
  cache.clear(); assert.equal(cache.state().residentBytes, 0);
});

test('budget never grows to satisfy pinned sheets; same-character still remains available', async () => {
  const { cache } = setup({ w001: entry('w001', 128) }, { budget: 1024 * 1024 });
  cache.demand([{ id: 'w001', view: 'side' }]); await settle(cache);
  assert.ok(cache.state().trackedBytes <= cache.state().budget);
  assert.ok(cache.state().peakTrackedBytes <= cache.state().budget);
  const f = cache.frame('w001', 'side', 0.4);
  assert.ok(f); assert.equal(f.assetId, 'w001'); assert.match(f.cacheKey, /:still$/);
  assert.ok(cache.state().budgetSkips > 0);
});

test('bad grid fails without publishing partial frames and retry is bounded', async () => {
  let time = 0;
  const { cache } = setup({ w001: entry() }, { now: () => time, loadImage: async () => ({ width: 1, height: 1 }) });
  for (let i = 0; i < 6; i++) { cache.demand([{ id: 'w001', view: 'side' }]); await settle(cache); time += 30001; }
  assert.equal(cache.frame('w001', 'side', 0), null);
  assert.ok(cache.state().records.every(r => r.attempts <= 3)); assert.equal(cache.state().residentBytes, 0);
});

test('successful reloads do not exhaust future transient-failure recovery', async () => {
  let time = 0, fail = false;
  const { cache } = setup({ w001: entry() }, { now: () => time, loadImage: async (url, r) => {
    if (r.kind === 'sheet' && fail) throw Error('temporary network failure');
    return { width: r.descriptor.cell * (r.kind === 'sheet' ? r.descriptor.cols : 1), height: r.descriptor.cell * (r.kind === 'sheet' ? r.descriptor.rows : 1) };
  } });
  const sheet = () => cache.state().records.find(r => r.key === 'w001:side:sheet');
  const demand = async () => { cache.demand([{ id: 'w001', view: 'side' }]); await settle(cache); };
  for (let i = 0; i < 3; i++) { await demand(); assert.equal(sheet().status, 'ready'); cache.demand([]); }
  fail = true; await demand(); assert.equal(sheet().attempts, 4); assert.equal(sheet().consecutiveFailures, 1);
  fail = false; time += 29999; await demand(); assert.equal(sheet().status, 'failed');
  time += 2; await demand(); assert.equal(sheet().status, 'ready'); assert.equal(sheet().consecutiveFailures, 0); assert.equal(sheet().error, undefined);
  cache.demand([]); fail = true;
  for (let i = 0; i < 3; i++) { await demand(); time += 30001; }
  const attempts = sheet().attempts;
  assert.equal(sheet().consecutiveFailures, 3); fail = false; await demand();
  assert.equal(sheet().attempts, attempts); assert.equal(sheet().status, 'failed', 'three consecutive failures still bound automatic retries');
});

test('in-flight old generation cannot resurrect resources after clear', async () => {
  const pending = [];
  const { cache } = setup({ w001: entry() }, { loadImage: (url, r) => new Promise(resolve => pending.push(() => resolve({ width: r.descriptor.cell, height: r.descriptor.cell }))) });
  cache.demand([{ id: 'w001', view: 'side' }]); assert.equal(pending.length, 2);
  cache.clear(); pending.forEach(resolve => resolve()); await settle(cache);
  assert.equal(cache.state().residentBytes, 0); assert.equal(cache.state().reservedBytes, 0);
});

test('unchanged server relays extended enemy data only to watchers and preserves rank 7/20', () => {
  let now = 1700000000000, state = createRoom({ code: 'ABC234', now, timing: timingFor('') }), live = emptyLive(now);
  const step = ev => { const result = reduce({ state, live }, ev, now); state = result.state; live = result.live; return result; };
  for (const [pid, sid, op] of [['aaaa1111', 'sA', 'create'], ['bbbb2222', 'sB', 'join'], ['cccc3333', 'sC', 'join']]) {
    step({ k: 'open', sid, op }); step({ k: 'hello', sid, op, m: { t: 'hello', v: 3, ver: '89', op, pid, key: 'a'.repeat(32), name: pid } });
  }
  step({ k: 'msg', pid: 'aaaa1111', sid: 'sA', m: { t: 'start' } }); now = state.game.t0 + 1;
  step({ k: 'msg', pid: 'bbbb2222', sid: 'sB', m: { t: 'watch', pid: 'aaaa1111' } });
  const en = '9,125,8,5,128;1001,20,9,121,64';
  const msg = parse(JSON.stringify(summary(en))).m;
  const result = step({ k: 'msg', pid: 'aaaa1111', sid: 'sA', m: msg });
  const sends = result.effects.filter(e => e.send && e.send.m.t === 'sum').map(e => e.send);
  const watch = sends.find(s => Array.isArray(s.to)), light = sends.find(s => s.to === '*');
  assert.equal(watch.m.en, en); assert.equal(light.m.en, undefined);
  assert.deepEqual(watch.m.tw, [[0, 7, 1], [14, 20, 3]]);
  assert.equal(state.players.aaaa1111.status, 'alive');
});

test('boot decodes permanent 64px inline fallbacks before lazy network art and budgets them', async () => {
  const { cache, requests } = setup({ w001: entry('w001', 256), w002: entry('w002', 512) });
  await cache.init();
  assert.equal(requests.length, 6); assert.ok(requests.every(url => url.startsWith('data:image/webp;base64,')));
  assert.equal(cache.state().initialized, true); assert.equal(cache.state().residentBytes, 6 * 64 * 64 * 4);
  const f = cache.frame('w002', 'back', 0.7);
  assert.equal(f.w, 64); assert.equal(f.referenceHeight, 64); assert.deepEqual(plain(f.pivot), [32, 57.6]);
  assert.equal(f.view, 'back'); assert.match(f.cacheKey, /:fallback$/);
  cache.demand([], []); cache.clear();
  assert.equal(cache.frame('w002', 'back', 0), f); assert.ok(cache.state().records.filter(r => r.status === 'ready').every(r => r.pin));
  assert.ok(cache.state().peakTrackedBytes <= cache.state().budget); assert.equal(cache.state().maxRunning, 2);
  cache.dispose(); assert.equal(cache.state().residentBytes, 0); assert.equal(f.cv.width, 0);
});

test('approved identity keeps the requested-view inline still when all network images fail', async () => {
  const { cache } = setup({ w001: entry('w001', 256) }, { loadImage: async (url, r) => {
    if (!url.startsWith('data:')) throw Error('offline');
    return { width: 64, height: 64 };
  } });
  await cache.init(); cache.demand([{ id: 'w001', view: 'front' }]); await settle(cache);
  const f = cache.frame('w001', 'front', 0.75);
  assert.equal(f.assetId, 'w001'); assert.equal(f.view, 'front'); assert.match(f.cacheKey, /:fallback$/);
  assert.equal(cache.state().failures, 4);
});

test('bad approved metadata, broken inline decode and impossible fallback budgets block boot', async () => {
  const bad = entry(); delete bad.views.front.fallback;
  await assert.rejects(setup({ w001: bad }).cache.init(), /invalid approved/);
  await assert.rejects(setup(undefined, { loadImage: async () => ({ width: 1, height: 1 }) }).cache.init(), /inline character fallback failed/);
  const { cache, requests } = setup(undefined, { budget: 3 * 64 * 64 * 4 });
  await assert.rejects(cache.init(), /budget/); assert.equal(requests.length, 0);
});
