// Rare-die labels must not wrap the first-wave button onto a third phone HUD row.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { launchBrowser, gameUrl, outputPath } = require('./browser.cjs');

(async () => {
  const browser = await launchBrowser(), errors = [], results = [];
  fs.mkdirSync(outputPath('galaxy-hud'), { recursive: true });
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/game.js*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace('window.DK = S;',
        'window.__galaxyQA = { fitStage, advancePresentation }; window.DK = S;') });
    });
    await page.goto(gameUrl());
    await page.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 });
    for (const [width, height] of [[360,800],[384,824],[430,932],[514,850],[824,384]]) {
      await page.setViewportSize({ width, height });
      for (const kind of ['d8','d12','d20','epic','myth','primal']) {
        await page.evaluate(kind => {
          DKstartInf('clear'); DK.paused = true; DK.muted = true;
          const chest = DKCONTENT.INFINITY.chest, draw = chest.draw;
          try { chest.draw = () => kind; DKchest(); } finally { chest.draw = draw; }
          __galaxyQA.advancePresentation(2.3); DKsync(); __galaxyQA.fitStage();
        }, kind);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(100);
        const sample = await page.evaluate(() => {
          const rect = id => {
            const el = document.getElementById(id), r = el.getBoundingClientRect();
            return { x:r.x, y:r.y, w:r.width, h:r.height, right:r.right, bottom:r.bottom,
              font:parseFloat(getComputedStyle(el).fontSize), scroll:el.scrollWidth, client:el.clientWidth };
          };
          return { hud:rect('hud'), dice:rect('dice-panel'), roll:rect('roll-btn'), cost:rect('roll-cost'),
            wave:rect('wave-btn'), power:rect('inf-panel'),
            label:document.getElementById('roll-btn').textContent,
            overflow:document.documentElement.scrollWidth > innerWidth };
        });
        const label = `${width}x${height} ${kind}`;
        assert.match(sample.label, /던지기/, `${label}: actual manual-throw state`);
        assert.equal(sample.overflow, false, `${label}: no page overflow`);
        for (const item of [sample.dice,sample.roll,sample.wave,sample.power]) {
          assert.ok(item.x >= 0 && item.right <= width + 1 && item.y >= 0 && item.bottom <= height + 1,
            `${label}: HUD control stays on screen ${JSON.stringify(item)}`);
          assert.ok(item.y >= sample.hud.y && item.bottom <= sample.hud.bottom,
            `${label}: HUD contains its controls`);
        }
        assert.ok(sample.wave.y < sample.dice.bottom && sample.wave.bottom > sample.dice.y,
          `${label}: wave action stays on the dice row`);
        assert.ok(sample.wave.x >= sample.dice.right, `${label}: wave and dice do not overlap`);
        assert.ok(sample.cost.scroll <= sample.cost.client + 1, `${label}: subtitle fits its button`);
        if (width <= 480 && height > width) {
          assert.ok(sample.roll.font >= 15 && sample.cost.font >= 13, `${label}: readable throw text`);
          assert.ok(sample.power.y >= Math.max(sample.dice.bottom,sample.wave.bottom), `${label}: separate power row`);
        }
        if (kind === 'd8') await page.screenshot({ path:outputPath(`galaxy-hud/${width}-ready.png`) });
        await page.click('#wave-btn');
        await page.waitForFunction(() => getComputedStyle(document.getElementById('right-panel')).display === 'none');
        assert.equal(await page.locator('#wave-btn').isVisible(), false, `${label}: first start removes wave control`);
        results.push({ width,height,kind,...sample });
      }
      console.log(`PASS ${width}x${height}: six rare grades fit before first start; no empty action column afterward`);
    }
    assert.deepEqual(errors, [], 'no page errors');
    fs.writeFileSync(outputPath('galaxy-hud/report.json'), JSON.stringify(results,null,2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
