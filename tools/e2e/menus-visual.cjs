#!/usr/bin/env node
'use strict';

// Covers the menus omitted by the compact home/HUD check. Screenshots stay in gen/.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, gameUrl } = require('./browser.cjs');

const out = path.resolve(__dirname, '../../gen/e2e/casual-menus');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await launchBrowser();
  try {
    for (const [name, width, height] of [
      ['small', 320, 740], ['phone', 390, 844], ['desktop', 1280, 900],
    ]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        localStorage.setItem('dk_coachDone', '1');
        localStorage.setItem('dk_infHelpSeen', '1');
      });
      await page.goto(gameUrl());
      await page.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 });
      await page.evaluate(() => document.fonts.ready);
      const styles = await page.locator('link[rel="stylesheet"]').evaluateAll(links =>
        links.map(link => new URL(link.href).pathname.split('/').pop()));
      for (const sheet of ['casual-theme.css', 'casual-menus.css', 'casual-rewards.css', 'casual-hud.css']) {
        assert.ok(styles.includes(sheet), `${name}: ${sheet} is loaded`);
      }

      const capture = async (label, selector, { scrollContent = false } = {}) => {
        const layout = await page.locator(selector).evaluate(el => {
          const rect = el.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            horizontalOverflow: el.scrollWidth > el.clientWidth + 2,
            viewportOverflow: document.documentElement.scrollWidth > innerWidth + 2,
            inViewport: rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1,
          };
        });
        assert.ok(layout.width > 0 && layout.height > 0 && !layout.horizontalOverflow &&
          !layout.viewportOverflow && (scrollContent || layout.inViewport),
        `${name} ${label}: menu fits ${JSON.stringify(layout)}`);
        await page.screenshot({ path: path.join(out, `${name}-${label}.png`) });
      };

      await capture('title', '#overlay-box');
      await page.click('#ov-btn');
      await capture('home', '#lobby-box');
      await page.click('#hub-single');
      await capture('single', '#lobby-box');
      await page.click('#btn-deck-open');
      await capture('deck', '#deck-panel', { scrollContent: true });
      assert.equal(await page.locator('#btn-inf-clear').isVisible(), false, `${name}: deck is a separate view`);
      await page.click('#lobby-back');
      await page.click('#hub-multi');
      await capture('multi', '#lobby-box');
      await page.click('#lobby-back');
      await page.click('#btn-shop');
      await capture('shop', '.shop-body', { scrollContent: true });
      await page.click('#shop-back');
      await page.click('#lobby-settings');
      await capture('settings', '.settings-card');
      await page.click('#settings-close');
      await page.click('#hub-single');
      await page.click('#btn-stage-select');
      await capture('stages', '#stage-grid', { scrollContent: true });
      assert.deepEqual(errors, [], `${name}: no browser errors`);
      console.log('PASS menus visual', name);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
