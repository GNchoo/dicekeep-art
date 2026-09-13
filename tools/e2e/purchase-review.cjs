// Local UI review only. All account/payment responses are fixtures; no provider is contacted.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');
const PG = require('../../progression.js');
const base = process.env.E2E_BASE_URL || 'http://localhost:8137/';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const out = path.resolve(process.env.E2E_OUTPUT_DIR || 'gen/e2e/purchase-review');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const { PRODUCTS } = await import('../../commerce/src/catalog.mjs');
  const browser = await launchBrowser(), rows = [];
  try {
    for (const [tag, viewport] of [['phone', { width: 440, height: 956 }], ['desktop', { width: 1240, height: 860 }]]) {
      const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [];
      let orders = 0;
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => localStorage.setItem('dk_commerce_session_v1', JSON.stringify({ token: 'qa-review', accountId: 'qa-only' })));
      await page.route('**/commerce-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: "window.DKCOMMERCE_CONFIG={url:location.origin+'/__review_fixture'};" }));
      await page.route('**/__review_fixture/**', async r => {
        const endpoint = new URL(r.request().url()).pathname.split('/__review_fixture')[1];
        const data = {
          '/config': { purchasesEnabled: true, providers: { web: true }, products: PRODUCTS.filter(p => p.available !== false), paymentMode: 'test' },
          '/profile': PG.defaultProfile(), '/wallet': { free: 0, paid: 0, debt: 0 }, '/cosmetics': { owned: ['base'], equipped: 'base' },
        };
        if (endpoint === '/orders') { orders++; return r.fulfill({ status: 409, json: { error: 'purchases-disabled' } }); }
        assert.ok(data[endpoint], 'unexpected fixture endpoint: ' + endpoint);
        await r.fulfill({ json: data[endpoint] });
      });
      await page.goto(base); await page.waitForFunction(() => window.DK && DK.phase === 'title');
      await page.click('#ov-btn'); await page.click('#btn-shop');
      const buy = page.locator('[data-sku="shards200"]'); await buy.click();
      await page.waitForSelector('#purchase-review[open]');
      assert.match(await page.locator('#purchase-review-item').innerText(), /200/);
      assert.match(await page.locator('#purchase-review-price').innerText(), /1,100/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'purchase-review-cancel');
      const bounds = await page.locator('#purchase-review').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width);
      await page.screenshot({ path: path.join(out, `${tag}.png`) });
      await page.click('#purchase-review-cancel'); assert.equal(orders, 0);
      await buy.click(); await page.keyboard.press('Escape'); assert.equal(orders, 0);
      await buy.click(); await page.click('#purchase-review-confirm');
      await page.waitForFunction(() => document.getElementById('commerce-status').textContent.length > 0);
      assert.equal(orders, 1);
      await page.locator('[data-sku="skinRoyal"]').click();
      assert.match(await page.locator('#purchase-review-item').innerText(), /20종 타워 외형/);
      assert.match(await page.locator('#purchase-review-price').innerText(), /2,900/);
      await page.keyboard.press('Escape'); assert.equal(orders, 1); assert.deepEqual(errors, []);
      rows.push({ tag, orders, cancelCreatesOrder: false, pass: true });
      await context.close(); console.log('PASS purchase review', tag);
    }
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(rows, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
