#!/usr/bin/env node
'use strict';
// Run: node --test tools/cosmetic-test.cjs
// Asset IO is injected here; tools/e2e/cosmetics.cjs verifies real PNG/rendering.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create, normalize } = require('../cosmetics.js');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), PG = require('../progression.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function fixture(extra = {}) {
  const calls = [], activations = [], disposed = [], images = []; let active = 0, peak = 0, rolling = false;
  const manager = create({
    async decode(url) {
      calls.push(url); active++; peak = Math.max(peak, active);
      await sleep(1); active--;
      if (extra.fail && extra.fail(url)) throw Error('fixture missing image');
      const image = { width: 512, height: 512, closed: false, close() { this.closed = true; } }; images.push(image); return image;
    },
    trim(image) { image.close(); return { cv: { width: 256, height: 256 }, w: 256, h: 256 }; },
    yieldTask: () => Promise.resolve(),
  });
  manager.attach({ rolling: () => rolling,
    prepare: extra.prepare,
    activate: id => activations.push(id),
    evict: id => disposed.push(id),
    preview: extra.preview || ((id, pack) => ({ id, count: pack.towers.length })),
  });
  return { manager, calls, activations, disposed, images, peak: () => peak, roll: value => { rolling = value; } };
}
test('authority admits only known owned themes and always retains base', () => {
  assert.deepEqual(normalize({ owned: ['royal', 'royal', '__proto__', 'fake'], equipped: 'ember' }), { owned: ['base', 'royal'], equipped: 'base' });
});
test('base boot performs no premium work; free preview does not grant or equip', async () => {
  const f = fixture(); assert.equal(f.calls.length, 0);
  assert.deepEqual(await f.manager.preview('royal', {}), { id: 'royal', count: 20 });
  assert.deepEqual(f.manager.state().owned, ['base']); assert.equal(f.manager.current(), 'base');
  assert.equal(f.calls.length, 21); assert.equal(f.peak(), 2);
  assert.equal(f.calls.filter(url => /material-v101/.test(url)).length, 1);
  assert.equal(new Set(f.calls.filter(url => /\/t\d\d\.png/.test(url))).size, 20);
});
test('concurrent same-pack requests coalesce and concurrent packs never exceed two image decodes', async () => {
  const f = fixture();
  const [a, b] = await Promise.all([f.manager.load('royal'), f.manager.load('royal'), f.manager.load('frost')]);
  assert.equal(a, b); assert.equal(f.calls.length, 42); assert.equal(f.peak(), 2); assert.equal(f.manager.state().packs.length, 2);
});
test('LRU keeps the active pack and closes all evicted bitmaps/canvases', async () => {
  const f = fixture(); await f.manager.setAuthority({ owned: ['royal'], equipped: 'royal' });
  const frost = await f.manager.load('frost'); await f.manager.load('ember');
  assert.deepEqual(f.manager.state().packs, ['royal', 'ember']); assert.deepEqual(f.disposed, ['frost']);
  assert.equal(frost.material.closed, true); assert.ok(frost.towers.every(sp => sp.cv.width === 0 && sp.cv.height === 0));
  assert.equal(f.manager.current(), 'royal');
});
test('a preview yielding between draws keeps its source alive without allowing a third pack', async () => {
  let release, began; const gate = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { began = resolve; });
  const f = fixture({ preview: async () => { began(); await gate; return {}; } });
  await f.manager.setAuthority({ owned: ['royal'], equipped: 'royal' });
  const rendering = f.manager.preview('frost', {}); await ready;
  const frost = f.manager.pack('frost'); await assert.rejects(f.manager.load('ember'), /미리보기가 끝난/);
  assert.equal(frost.material.closed, false); assert.equal(f.manager.state().packs.length, 2);
  release(); await rendering; await f.manager.load('ember'); assert.equal(frost.material.closed, true);
});
test('unowned selection is rejected by normalization and rolling blocks activation', async () => {
  const f = fixture(); await f.manager.setAuthority({ owned: ['base'], equipped: 'royal' });
  assert.equal(f.calls.length, 0); assert.equal(f.manager.current(), 'base');
  f.roll(true); await f.manager.setAuthority({ owned: ['royal'], equipped: 'royal' });
  assert.equal(f.manager.canEquip(), false); assert.equal(f.manager.current(), 'base');
  f.roll(false); await f.manager.sync(); assert.equal(f.manager.current(), 'royal');
});
test('run snapshot keeps equipped appearance; logout/refund waits until an active roll settles', async () => {
  const f = fixture(); await f.manager.setAuthority({ owned: ['royal', 'frost'], equipped: 'royal' });
  assert.equal(f.manager.lockRun(), 'royal'); assert.equal(f.manager.canEquip(), false);
  await f.manager.setAuthority({ owned: ['royal', 'frost'], equipped: 'frost' }); assert.equal(f.manager.current(), 'royal');
  f.roll(true); await f.manager.setAuthority({ owned: ['base'], equipped: 'base' }); f.manager.tick(); assert.equal(f.manager.current(), 'royal');
  f.roll(false); f.manager.tick(); assert.equal(f.manager.current(), 'base');
  await f.manager.unlockRun(); assert.equal(f.manager.canEquip(), true);
});
test('authority revocation cancels a pending asynchronous activation', async () => {
  const f = fixture(); const request = f.manager.setAuthority({ owned: ['royal'], equipped: 'royal' });
  await sleep(4); await f.manager.setAuthority(null); await request;
  assert.equal(f.manager.current(), 'base'); assert.deepEqual(f.activations, []);
});
test('a run started during replacement-art loading remains on its base snapshot', async () => {
  const f = fixture(); await f.manager.setAuthority({ owned: ['royal'], equipped: 'royal' });
  const pending = f.manager.setAuthority({ owned: ['frost'], equipped: 'frost' });
  assert.equal(f.manager.current(), 'base'); assert.equal(f.manager.lockRun(), 'base'); await pending;
  assert.equal(f.manager.current(), 'base'); assert.equal(f.manager.state().runLocked, true);
  await f.manager.unlockRun(); assert.equal(f.manager.current(), 'frost');
});
test('missing or malformed pack stays unready, closes partial assets and does not replace active base', async () => {
  const f = fixture({ fail: url => /t03\.png/.test(url) });
  await assert.rejects(f.manager.load('royal'), /missing image/);
  assert.equal(f.manager.current(), 'base'); assert.deepEqual(f.manager.state().packs, []);
  assert.equal(f.manager.state().inFlight, 0); assert.equal(f.manager.state().loading.length, 0);
  assert.match(f.manager.state().failures.royal, /missing/); assert.ok(f.images.every(image => image.closed));
  await assert.rejects(f.manager.load('unknown'), /알 수 없는/);
  await assert.rejects(f.manager.debugUse('royal'), /로컬 검수/);
});
test('renderer preparation failure disposes its partial derivatives as well', async () => {
  const f = fixture({ prepare: () => { throw Error('prepare failed'); } });
  await assert.rejects(f.manager.load('frost'), /prepare failed/);
  assert.deepEqual(f.disposed, ['frost']); assert.ok(f.images.every(image => image.closed));
});

function clientFixture({ session = true, handler, native = false, purchases = [] } = {}) {
  const storage = new Map(), calls = [], elements = new Map();
  if (session) storage.set('dk_commerce_session_v1', JSON.stringify({ token: 'existing-session', accountId: 'account-A' }));
  const context = { console, URL, URLSearchParams, AbortController, AbortSignal, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto,
    DK: { phase: 'shop' }, DKPROGRESSION: PG, DKCOMMERCE_CONFIG: { url: 'https://fixture.invalid' },
    location: { href: 'https://fixture.invalid/index.html', search: '', pathname: '/index.html' },
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, { textContent: '', replaceChildren() {} }); return elements.get(id); } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    CustomEvent: class { constructor(type) { this.type = type; } }, dispatchEvent() {},
    async fetch(url, options = {}) {
      const endpoint = new URL(url).pathname, data = options.body ? JSON.parse(options.body) : null;
      calls.push({ endpoint, data, authorization: options.headers?.Authorization });
      const supplied = await handler?.(endpoint, data, options);
      if (supplied) return { ok: supplied.status == null || supplied.status < 400, status: supplied.status || 200, json: async () => supplied.body };
      let body;
      if (endpoint === '/config') body = { googleClientId: 'fixture', purchasesEnabled: false };
      else if (endpoint === '/profile') body = PG.defaultProfile();
      else if (endpoint === '/wallet') body = { free: 0, paid: 0, debt: 0 };
      else if (endpoint === '/cosmetics') body = { owned: ['base'], equipped: 'base' };
      else if (endpoint === '/auth/logout') body = { ok: true };
      else throw Error('Unexpected client fixture request ' + endpoint);
      return { ok: true, status: 200, json: async () => body };
    },
  };
  if (native) context.Capacitor = { getPlatform: () => 'android', Plugins: { DicekeepBilling: { addListener: async () => {}, restore: async () => ({ purchases }), signOut: async () => {} } } };
  context.window = context; vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../commerce-client.js'), 'utf8');
  vm.runInContext(source.replace('window.DKCOMMERCE = Object.freeze({', 'window.__authenticate = authenticate; window.DKCOMMERCE = Object.freeze({'), context);
  return { context, client: context.DKCOMMERCE, storage, calls, elements };
}
test('web restore retains pending orders and still credits later completed orders', async () => {
  const f = clientFixture({ handler(endpoint, data) {
    if (endpoint !== '/payments/toss/confirm') return;
    return data.orderId === 'paid' ? { body: { profile: PG.defaultProfile(), cosmetics: { owned: ['base', 'royal'], equipped: 'base' } } } : { status: 409, body: { code: data.orderId === 'abandoned' ? 'payment-not-confirmed' : 'payment-pending' } };
  } });
  f.storage.set('dk_commerce_orders_v1', JSON.stringify(['abandoned', 'pending', 'paid'].map(orderId => ({ orderId, owner: 'account-A' }))));
  await f.client.init(); await f.client.restore();
  assert.deepEqual(f.calls.filter(c => c.endpoint === '/payments/toss/confirm').map(c => c.data.orderId), ['abandoned', 'pending', 'paid']);
  assert.deepEqual(JSON.parse(f.storage.get('dk_commerce_orders_v1')).map(order => order.orderId), ['abandoned', 'pending']);
  assert.equal(f.calls.filter(c => c.endpoint === '/cosmetics').length, 2); assert.match(f.elements.get('commerce-status').textContent, /2건/);
});
test('late Google login reply cannot switch a playing guest run', async () => {
  let release; const response = new Promise(resolve => { release = resolve; });
  const f = clientFixture({ session: false, handler: endpoint => endpoint === '/auth/google' ? response : undefined });
  await f.client.init(); const pending = f.context.__authenticate('google-id-token');
  f.context.DK.phase = 'playing'; release({ body: { token: 'unused-new-session', accountId: 'account-A', profile: PG.defaultProfile() } });
  await assert.rejects(pending, /게임 또는 계정/); await sleep(0);
  assert.equal(f.client.linked(), false); assert.equal(f.client.profile(), null); assert.equal(f.storage.has('dk_commerce_session_v1'), false);
  assert.equal(f.calls.find(c => c.endpoint === '/auth/logout').authorization, 'Bearer unused-new-session');
});
test('logout invalidates an outstanding authentication generation', async () => {
  let release; const response = new Promise(resolve => { release = resolve; });
  const f = clientFixture({ session: false, handler: endpoint => endpoint === '/auth/google' ? response : undefined });
  await f.client.init(); const pending = f.context.__authenticate('google-id-token'); f.client.signOut();
  release({ body: { token: 'stale-session', accountId: 'account-A', profile: PG.defaultProfile() } });
  await assert.rejects(pending, /게임 또는 계정/); assert.equal(f.client.linked(), false);
});
test('successful web login reconciles revoked cosmetics before adopting an equipped theme', async () => {
  const f = clientFixture({ session: false, handler: endpoint => endpoint === '/auth/google' ? { body: { token: 'valid-session', accountId: 'account-A', profile: PG.defaultProfile(), cosmetics: { owned: ['base', 'royal'], equipped: 'royal' } } } : undefined });
  await f.client.init(); await f.context.__authenticate('google-id-token');
  assert.equal(f.client.linked(), true); assert.deepEqual(JSON.parse(JSON.stringify(f.client.state().cosmetics)), { owned: ['base'], equipped: 'base' });
  assert.equal(f.calls.filter(c => c.endpoint === '/cosmetics').length, 1);
  assert.ok(f.calls.findIndex(c => c.endpoint === '/cosmetics') < f.calls.findIndex(c => c.endpoint === '/profile'));
});
test('native restore processes a valid token after a token for a different game account', async () => {
  const purchases = ['other-account', 'valid'].map(purchaseToken => ({ purchaseToken, productId: 'dicekeep.skin_royal', state: 'PURCHASED' }));
  const f = clientFixture({ native: true, purchases, handler(endpoint, data) {
    if (endpoint !== '/payments/google/verify') return;
    return data.purchaseToken === 'other-account' ? { status: 409, body: { code: 'purchase-already-used' } } : { body: { profile: PG.defaultProfile(), cosmetics: { owned: ['base', 'royal'], equipped: 'base' } } };
  } });
  await f.client.init(); await assert.rejects(f.client.restore(), error => error.code === 'purchase-already-used');
  assert.deepEqual(f.calls.filter(c => c.endpoint === '/payments/google/verify').map(c => c.data.purchaseToken), ['other-account', 'valid']);
  assert.equal(f.calls.filter(c => c.endpoint === '/cosmetics').length, 2);
});
