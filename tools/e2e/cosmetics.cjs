#!/usr/bin/env node
'use strict';
// Real local HTTP art/rendering; a mocked account API supplies test entitlements.
// The game response gains closure exports only, without changing render/combat logic.
// --unready injects one HTTP 503 to check fail-closed missing-art behavior.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');
const PG = require('../../progression.js');
const repo = path.resolve(__dirname, '../..'), out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/cosmetics'));
const base = (process.env.E2E_BASE_URL || 'http://localhost:8138/').replace(/\/?$/, '/');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname), 'mock-account QA is restricted to localhost');
const unready = process.argv.includes('--unready'), themes = ['royal', 'frost', 'ember'];
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const report = { scope: 'Real HTTP code/PNG and actual game render. Test-only account responses and selected roll results; no real login, charge or persistent entitlement. No combat odds claim.', url: base, unready, started: new Date().toISOString(), viewports: [], pass: false };
fs.mkdirSync(out, { recursive: true });
function save() { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
function check(row, name, actual, expected = true) { assert.deepEqual(actual, expected, name); row.checks.push({ name, pass: true }); save(); }
async function tick(page, count = 2) { await page.evaluate(n => new Promise(resolve => { function frame() { if (--n <= 0) resolve(); else requestAnimationFrame(frame); } requestAnimationFrame(frame); }), count); }
async function run(browser, name, viewport) {
  const row = { name, viewport, checks: [], errors: [], assets: [], themes: [] }; report.viewports.push(row); save();
  const dir = path.join(out, name); fs.mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport }), page = await context.newPage();
  row.sources = [];
  for (const file of ['index.html', 'game.js', 'content.js', 'cosmetics.js', 'commerce-client.js', 'commerce-ui.js', 'style.css']) {
    const response = await page.request.get(new URL(file, base).href), bytes = await response.body();
    assert.equal(response.status(), 200); assert.equal(sha(bytes), sha(fs.readFileSync(path.join(repo, file))), 'actual HTTP source ' + file);
    row.sources.push({ path: file, sha256: sha(bytes), status: response.status() });
  }
  let authority = { owned: ['base', 'royal'], equipped: 'base' }; const actions = [];
  const products = [{ sku: 'shards60', kind: 'currency', shards: 60, amount: 1100 }, { sku: 'shards600', kind: 'currency', shards: 600, amount: 9900 }, { sku: 'shards2000', kind: 'currency', shards: 2000, amount: 33000 }, ...themes.map(id => ({ sku: 'skin' + id[0].toUpperCase() + id.slice(1), kind: 'cosmetic', skinId: id, amount: 4900, playProductId: 'dicekeep.skin_' + id }))];
  page.on('pageerror', error => row.errors.push(error.message));
  page.on('response', response => {
    if (!/\/(?:dice\/skins|casual\/towers\/skins)\/(royal|frost|ember)\//.test(response.url())) return;
    const url = new URL(response.url()); row.assets.push({ path: url.pathname.replace(/^\//, ''), status: response.status() });
  });
  await page.addInitScript(() => {
    localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1');
    localStorage.setItem('dk_commerce_session_v1', JSON.stringify({ token: 'local-QA-fixture', accountId: 'qa-account' }));
    window.__towerDraws = new Set();
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      if (this.canvas.id === 'game' && window.DKCOSMETICS) {
        const pack = DKCOSMETICS.pack(DKCOSMETICS.current());
        const index = pack && pack.scaledTowers && pack.scaledTowers.findIndex(sp => sp.cv === image);
        if (index >= 0) __towerDraws.add(pack.id + ':' + (index + 1));
      }
      return original.call(this, image, ...args);
    };
  });
  await page.route('**/commerce-config.js*', route => route.fulfill({ contentType: 'application/javascript', body: "window.DKCOMMERCE_CONFIG={url:location.origin+'/__cosmetic_fixture'};" }));
  if (unready) await page.route('**/dice/skins/royal/material-v101.png*', route => route.fulfill({ status: 503, body: 'QA unavailable material' }));
  await page.route('**/__cosmetic_fixture/**', async route => {
    const endpoint = new URL(route.request().url()).pathname.split('/__cosmetic_fixture')[1];
    let body;
    if (endpoint === '/config') body = { purchasesEnabled: false, googleClientId: 'fixture', products, paymentMode: 'disabled' };
    else if (endpoint === '/profile') body = PG.defaultProfile();
    else if (endpoint === '/wallet') body = { free: 0, paid: 0, debt: 0 };
    else if (endpoint === '/cosmetics') body = authority;
    else if (endpoint === '/auth/logout') body = { ok: true };
    else if (endpoint === '/profile/action') {
      const action = route.request().postDataJSON(); actions.push(action);
      if (action.type !== 'skinEquip' || !authority.owned.includes(action.skinId)) return route.fulfill({ status: 403, json: { code: 'skin-not-owned' } });
      authority = { ...authority, equipped: action.skinId }; body = { profile: PG.defaultProfile(), cosmetics: authority };
    } else { row.errors.push('Unexpected commerce operation in no-payment QA: ' + endpoint); return route.fulfill({ status: 400, json: { error: 'unexpected-test-operation' } }); }
    await route.fulfill({ json: body });
  });
  await page.route('**/game.js*', async route => {
    const response = await route.fetch(), source = await response.text(); row.gameSha256 = sha(source);
    assert.equal(row.gameSha256, sha(fs.readFileSync(path.join(repo, 'game.js'))), 'HTTP game matches current source');
    const anchor = 'window.DK = S;'; assert.equal(source.split(anchor).length, 2);
    await route.fulfill({ response, body: source.replace(anchor, 'window.__cosmeticQA={rollDie,diceMaterial,drawPolyDie,drawCube,slotTargetR,POLY,TRAY_TILT,m3mul,faceTopR,ROLL_SHOW};\n' + anchor) });
  });
  const url = new URL('index.html', base); url.searchParams.set('net', 'off'); url.searchParams.set('unlock', 'all'); url.searchParams.set('v', Date.now());
  try {
    await page.goto(url.href); await page.waitForFunction(() => window.DK && DK.phase === 'title', null, { timeout: 120000 });
    check(row, 'boot does not request premium assets', row.assets.length, 0);
    await page.click('#ov-btn'); await page.evaluate(() => { DK.muted = true; }); await page.click('#btn-shop');
    check(row, 'three currency products and three cosmetic purchase bundles', await page.locator('#commerce-products .commerce-product').count(), 3);
    check(row, 'four cosmetic cards include base', await page.locator('#cosmetic-products .cosmetic-product').count(), 4);
    check(row, 'unowned frost cannot be equipped', await page.locator('[data-equip="frost"]').count(), 0);
    const guest = await page.evaluate(() => JSON.stringify(DKSAVE.progression));
    if (unready) {
      await page.click('[data-preview="royal"]');
      await page.waitForFunction(() => document.getElementById('cosmetic-preview-status').textContent.includes('준비되지'));
      check(row, 'missing art never equips or produces a partial pack', await page.evaluate(() => ({ active: DKCOSMETICS.current(), packs: DKCOSMETICS.state().packs })), { active: 'base', packs: [] });
      await page.screenshot({ path: path.join(dir, 'unready-shop.png'), fullPage: true });
    } else {
      for (const theme of themes) {
        await page.click(`[data-preview="${theme}"]`);
        await page.waitForFunction(() => document.querySelectorAll('#cosmetic-tower-preview figure').length === 20);
        check(row, theme + ' free preview preserves equipped appearance', await page.evaluate(() => DKCOSMETICS.current()), 'base');
        check(row, theme + ' preview includes 20 decoded unique tower icons', await page.evaluate(() => { const images = [...document.querySelectorAll('#cosmetic-tower-preview img')]; return images.length === 20 && new Set(images.map(img => img.src)).size === 20 && images.every(img => img.complete && img.naturalWidth > 0); }));
        await page.locator('#cosmetic-preview').screenshot({ path: path.join(dir, theme + '-shop-preview.png') });
        await page.click('#cosmetic-preview-close');
      }
      check(row, 'preview never changes guest progression', await page.evaluate(() => JSON.stringify(DKSAVE.progression)), guest);
      authority = { owned: ['base', ...themes], equipped: 'base' }; await page.evaluate(() => DKCOMMERCE.refresh());
      row.baseCombat = await page.evaluate(() => {
        DKstartInf('clear'); DK.paused = true;
        const values = Array.from({ length: 20 }, (_, i) => [1, 2, 3].map(lvl => { const t = { face: i + 1, def: DKTD[i + 1], lvl }; return { damage: DKtowerDamage(t), range: DKrange(t), rate: t.def.rate, perk: t.def.perk }; }));
        DKlobby(); return values;
      });
      await page.click('#btn-shop');
      for (const theme of themes) {
        await page.click(`[data-equip="${theme}"]`); await page.waitForFunction(id => DKCOSMETICS.current() === id, theme);
        const item = { id: theme, rolls: [] }; row.themes.push(item);
        item.pack = await page.evaluate(() => ({ ...DKCOSMETICS.state(), ...DKcosmeticRender.stats() }));
        check(row, theme + ' obeys bounded pack/decode/material caches', item.pack.packs.length <= 2 && item.pack.peak <= 2 && item.pack.materialSets <= 2 && item.pack.textures <= 104);
        await page.evaluate(() => { DKstartInf('clear'); DK.paused = true; DK.waveActive = false; DK.spawnQ = []; DK.inf.queue = []; DK.towers = []; DK.fxs = []; DK.texts = []; __cosmeticQA.ROLL_SHOW.t = 0; });
        check(row, theme + ' snapshot is fixed for the run', await page.evaluate(() => ({ snapshot: DK.cosmeticSnapshot, canEquip: DKCOSMETICS.canEquip() })), { snapshot: theme, canEquip: false });
        check(row, theme + ' 20 tower damage/range/rate/perk values remain identical at all three levels', await page.evaluate(() => Array.from({ length: 20 }, (_, i) => [1, 2, 3].map(lvl => { const t = { face: i + 1, def: DKTD[i + 1], lvl }; return { damage: DKtowerDamage(t), range: DKrange(t), rate: t.def.rate, perk: t.def.perk }; }))), row.baseCombat);
        item.towers = await page.evaluate(() => {
          const expected = [];
          for (let face = 1; face <= 20; face++) {
            const sp = DKtowerSpr(face); expected.push({ face, theme: sp.cosmeticTheme, sourceFace: sp.cosmeticFace, size: [sp.w, sp.h], dedicated: sp.dedicated });
            if (face <= DKspots().length) { DK.heldDie = face; if (!DKplace(face - 1)) throw Error('Placement rejected ' + face); }
          }
          DK.heldDie = 0; DK.fxs = []; DK.texts = []; DKsync(); return expected;
        });
        check(row, theme + ' all 20 star levels select their own skin art', item.towers.every(t => t.theme === theme && t.sourceFace === t.face && t.dedicated && t.size[0] > 0));
        await tick(page, 3); await page.screenshot({ path: path.join(dir, theme + '-actual-towers.png') });
        item.observedTowers = await page.evaluate(id => [...__towerDraws].filter(key => key.startsWith(id + ':')), theme);
        // If a map has fewer than 20 places, use successive actual placements at the first place.
        for (const missing of item.towers.filter(t => !item.observedTowers.includes(theme + ':' + t.face))) {
          await page.evaluate(face => { DK.towers = []; DK.heldDie = face; DKplace(0); DK.fxs = []; DK.texts = []; }, missing.face); await tick(page);
        }
        item.observedTowers = await page.evaluate(id => [...__towerDraws].filter(key => key.startsWith(id + ':')), theme);
        check(row, theme + ' actual game drawImage observes all 20 tower sprites', item.observedTowers.length, 20);
        await page.evaluate(() => { DK.towers = []; DK.paused = false; DK.lives = 999; DK.gold = 999999; });
        for (const kind of ['d1', 'd4', 'd6', 'd8', 'd12', 'd20']) {
          const started = await page.evaluate(k => { DK.heldDie = 0; DKSLOT.active = false; DKDIE.state = 'tray'; DK.inf.queue = []; return __cosmeticQA.rollDie(k, k === 'd1' ? 1 : Number(k.slice(1))); }, kind);
          check(row, theme + ' ' + kind + ' actual roll starts', started);
          const before = await page.evaluate(() => DKSLOT.R.slice()); await tick(page, 4);
          const rotated = await page.evaluate(R => DKSLOT.R.some((v, i) => Math.abs(v - R[i]) > .001), before); check(row, theme + ' ' + kind + ' geometry rotates', rotated);
          await page.screenshot({ path: path.join(dir, theme + '-' + kind + '-rolling.png') });
          await page.waitForFunction(() => !DKSLOT.active && DK.heldDie > 0, null, { timeout: 15000 });
          const final = await page.evaluate(() => ({ face: DK.heldDie, active: DKCOSMETICS.current(), ...DKcosmeticRender.stats() }));
          check(row, theme + ' ' + kind + ' correct reward and unchanged skin', [final.face, final.active], [kind === 'd1' ? 1 : Number(kind.slice(1)), theme]);
          item.rolls.push({ kind, rotated, ...final });
        }
        const blocked = await page.evaluate(async () => { try { await DKCOMMERCE.action('skinEquip', { skinId: 'base' }); return false; } catch (e) { return /게임|굴리|장착/.test(e.message); } });
        check(row, theme + ' mid-run equip is blocked before the API request', blocked);
        await page.evaluate(() => { DK.paused = false; DKlobby(); }); await page.click('#btn-shop');
      }
      check(row, 'only three user equip actions reached mock server', actions.map(action => action.skinId), themes);
      authority = { owned: ['base'], equipped: 'base' }; await page.evaluate(() => DKCOMMERCE.refresh()); await tick(page);
      check(row, 'refund of last entitlement restores base', await page.evaluate(() => DKCOSMETICS.current()), 'base');
      await page.click('#commerce-signout');
      check(row, 'logout preserves guest file and clears account cosmetics', await page.evaluate(() => ({ owned: DKCOSMETICS.state().owned, equipped: DKCOSMETICS.state().equipped, guestHasCosmetics: Object.hasOwn(DKSAVE.progression, 'cosmetics') })), { owned: ['base'], equipped: 'base', guestHasCosmetics: false });
    }
    // Separate byte audit after actual decode/use, with at most two audit HTTP requests.
    // This avoids Chromium's occasional empty CDP body read for a consumed bitmap fetch.
    const loaded = [...new Set(row.assets.filter(asset => asset.status === 200).map(asset => asset.path))]; row.httpAudit = [];
    for (let start = 0; start < loaded.length; start += 2) await Promise.all(loaded.slice(start, start + 2).map(async relative => {
      const response = await page.request.get(new URL(relative + '?audit=101', base).href), bytes = await response.body();
      row.httpAudit.push({ path: relative, status: response.status(), bytes: bytes.length, sha256: sha(bytes), matchesRepository: sha(bytes) === sha(fs.readFileSync(path.join(repo, relative))) });
    }));
    check(row, 'all successful premium HTTP bytes match repository', row.httpAudit.every(asset => asset.status === 200 && asset.bytes > 0 && asset.matchesRepository));
    if (!unready) { check(row, 'all 63 authored premium PNGs loaded', new Set(row.assets.map(asset => asset.path)).size, 63); check(row, 'premium HTTP errors', row.assets.filter(asset => asset.status !== 200), []); }
    check(row, 'uncaught game errors', row.errors, []); row.pass = true; save();
  } catch (error) {
    row.diagnostic = await page.evaluate(() => ({ phase: window.DK && DK.phase, status: document.getElementById('cosmetic-preview-status')?.textContent, art: window.DKCOSMETICS && DKCOSMETICS.state() })).catch(() => null);
    await page.screenshot({ path: path.join(dir, 'failure.png') }).catch(() => {}); throw error;
  } finally { await context.close(); }
}
(async () => { const browser = await launchBrowser(); try { await run(browser, 'phone', { width: 440, height: 956 }); if (!unready) await run(browser, 'desktop', { width: 1280, height: 800 }); report.pass = true; } catch (e) { report.failure = e.stack; process.exitCode = 1; } finally { await browser.close(); report.finished = new Date().toISOString(); save(); console.log(JSON.stringify({ pass: report.pass, output: out, checks: report.viewports.map(row => ({ name: row.name, checks: row.checks.length, themes: row.themes.length, errors: row.errors })), failure: report.failure })); } })();
