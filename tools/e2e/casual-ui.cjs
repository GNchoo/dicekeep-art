#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, gameUrl } = require('./browser.cjs');

const out = path.resolve(__dirname, '../../gen/e2e/casual-ui');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await launchBrowser();
  try {
    for (const [name, width, height] of [['small', 320, 740], ['phone', 390, 844], ['desktop', 1280, 900]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        localStorage.setItem('dk_coachDone', '1');
        localStorage.setItem('dk_infHelpSeen', '1');
      });
      await page.goto(gameUrl());
      await page.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 });
      await page.click('#ov-btn');
      await page.screenshot({ path: path.join(out, `${name}-home.png`) });
      await page.click('#hub-single');
      await page.click('#btn-stage-select');
      const stageTitle = await page.locator('#stage-select .screen-head h2').evaluate(el => ({ visible: el.getBoundingClientRect().width > 0, clipped: el.scrollWidth > el.clientWidth + 1 }));
      assert.equal(stageTitle.visible && !stageTitle.clipped, true, `${name}: full stage title visible`);
      const stageRows = await page.locator('#stage-grid').evaluate(grid => {
        const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
        const cells = grid.querySelectorAll('.stage-cell');
        const first = cells[0].getBoundingClientRect();
        const next = cells[columns].getBoundingClientRect();
        return { firstBottom: first.bottom, nextTop: next.top, firstWidth: first.width, firstHeight: first.height };
      });
      assert.ok(stageRows.nextTop >= stageRows.firstBottom + 3, `${name}: stage rows do not overlap`);
      assert.ok(Math.abs(stageRows.firstWidth - stageRows.firstHeight) < 2, `${name}: stage cells stay square`);
      await page.screenshot({ path: path.join(out, `${name}-stages.png`) });

      await page.evaluate(() => { DKstartInf('clear'); DK.paused = true; DK.gold = 3600; DKsync(); });
      await page.waitForTimeout(150);
      const hud = await page.evaluate(() => {
        const rect = id => document.getElementById(id).getBoundingClientRect();
        const clipped = ['gold-val', 'lives-val', 'wave-val'].filter(id => {
          const el = document.getElementById(id); return el.scrollWidth > el.clientWidth + 1;
        });
        const icons = ['speed-btn', 'mute-btn', 'exit-btn'].map(id => getComputedStyle(document.getElementById(id)).backgroundImage);
        const bar = rect('hud'), action = rect('wave-btn');
        return { clipped, icons, barInside: bar.left >= -1 && bar.right <= innerWidth + 1 && bar.bottom <= innerHeight + 1,
          actionVisible: action.width >= 44 && action.height >= 44 && action.left >= 0 && action.right <= innerWidth + 1,
          overflow: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      assert.deepEqual(hud.clipped, [], `${name}: top counters are fully readable`);
      assert.ok(hud.icons.every(image => image.includes('url(')), `${name}: utility icons are rendered`);
      assert.ok(hud.barInside && hud.actionVisible && !hud.overflow, `${name}: HUD fits screen`);
      assert.deepEqual(errors, [], `${name}: no browser errors`);
      await page.screenshot({ path: path.join(out, `${name}-battle.png`) });
      console.log('PASS casual UI', name);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
