#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { launchBrowser, gameUrl, outputPath } = require('./browser.cjs');

(async () => {
  const browser = await launchBrowser();
  try {
    for (const [name, width, height] of [
      ['near-square', 1225, 1280], ['landscape-phone', 844, 390],
      ['small-landscape', 568, 320], ['phone', 390, 844], ['small-phone', 320, 740],
    ]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        localStorage.setItem('dk_coachDone', '1');
        localStorage.setItem('dk_infHelpSeen', '1');
      });
      await page.route('**/game.js*', async route => {
        const response = await route.fetch(), source = await response.text();
        const anchor = 'window.DK = S;';
        assert.equal(source.split(anchor).length, 2);
        await route.fulfill({ response, body: source.replace(anchor, 'window.__dieViewScale=dieViewScale; window.__manualBounds=dieBounds; ' + anchor) });
      });
      await page.goto(gameUrl());
      await page.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 });
      await page.click('#ov-btn');
      await page.evaluate(() => {
        DKstartInf('clear');
        DK.paused = true;
        DK.gold = 1000;
        const chest = DKCONTENT.INFINITY.chest;
        const draw = chest.draw;
        try { chest.draw = () => 'd8'; DKchest(); } finally { chest.draw = draw; }
        DKlog('뽑기 완료 · 던지기 전에 주사위를 확인하세요', 'sys');
        DKlog('8면체 획득 · 주사위를 끌어 던지세요', 'gacha');
      });
      await page.waitForFunction(() => document.querySelector('#roll-btn')?.classList.contains('manual-roll'), null, { timeout: 10000 });
      const measure = () => page.evaluate(() => {
        const canvas = document.getElementById('game');
        const rect = canvas.getBoundingClientRect();
        const stage = document.getElementById('stage').getBoundingClientRect();
        const hud = document.getElementById('hud').getBoundingClientRect();
        const scaleX = rect.width / canvas.width, scaleY = rect.height / canvas.height;
        const die = { x: rect.left + DKDIE.x * scaleX, y: rect.top + DKDIE.y * scaleY,
          radius: 48 * __dieViewScale() * Math.min(scaleX, scaleY) };
        const logs = [...document.querySelectorAll('#log-panel .log-line')]
          .filter(el => getComputedStyle(el).display !== 'none').map(el => {
          const r = el.getBoundingClientRect();
          const nearX = Math.max(r.left, Math.min(die.x, r.right));
          const nearY = Math.max(r.top, Math.min(die.y, r.bottom));
          return { text: el.textContent, left: r.left, top: r.top, right: r.right, bottom: r.bottom,
            opacity: Number(getComputedStyle(el).opacity),
            coversDie: Math.hypot(die.x - nearX, die.y - nearY) < die.radius };
          });
        const rivals = [...document.querySelectorAll('#rivals .rival')].map(el => {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        });
        return { die, logs, rivals, inHud: !!document.getElementById('log-panel').closest('#hud'),
          retained: document.querySelectorAll('#log-lines .log-line').length,
          hud: { left: hud.left, top: hud.top, right: hud.right, bottom: hud.bottom },
          stage: { left: stage.left, top: stage.top, right: stage.right, bottom: stage.bottom },
          state: DKDIE.state, slotPhase: DKSLOT.phase };
      });
      const visible = (layout, label) => {
        assert.equal(layout.state, 'tray', `${label}: physical die is waiting to be thrown`);
        assert.equal(layout.slotPhase, -1, `${label}: manual chest is pending`);
        assert.ok(layout.logs.length >= 1 && layout.retained >= 2, `${label}: latest message is visible and earlier messages remain in the log`);
        assert.equal(layout.inHud, true, `${label}: notifications occupy the HUD`);
        assert.ok(layout.logs.every(log => !log.coversDie), `${label}: die is not hidden by logs ${JSON.stringify(layout)}`);
        assert.ok(layout.logs.every(log => log.opacity > .8 && log.right - log.left > 10 && log.bottom - log.top > 10 &&
          log.left >= layout.hud.left - 1 && log.right <= layout.hud.right + 1 &&
          log.top >= layout.hud.top - 1 && log.bottom <= layout.hud.bottom + 1),
        `${label}: latest notification remains readable inside the HUD ${JSON.stringify(layout)}`);
        const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        assert.ok(layout.die.y + layout.die.radius < layout.hud.top - 4,
          `${label}: pending die clears the bottom controls ${JSON.stringify(layout)}`);
        assert.ok(layout.logs.every(log => layout.rivals.every(rival => !overlap(log, rival))),
          `${label}: logs do not cover rival cards ${JSON.stringify(layout)}`);
      };
      const finishEntrance = () => page.evaluate(() => {
        for (const el of document.querySelectorAll('#log-lines .log-line')) {
          for (const animation of el.getAnimations()) if (animation.animationName === 'logIn') animation.finish();
        }
      });
      await finishEntrance();
      const layout = await measure();
      await page.screenshot({ path: outputPath(path.join('manual-die-log', `${name}.png`)) });
      visible(layout, name);
      await page.locator('#stage').evaluate(stage => {
        stage.classList.add('mp');
        const rivals = document.getElementById('rivals');
        rivals.className = document.getElementById('wrap').classList.contains('over') ? 'lay-col' : 'lay-strip';
        rivals.style.setProperty('--rv-h', '64px');
        rivals.innerHTML = `<div class="rival${rivals.classList.contains('lay-strip') ? ' zoom' : ''}">상대 정보</div>`;
        if (innerWidth <= 568) {
          document.getElementById('log-lines').replaceChildren();
          const long = '상대의 긴 채팅을 계속 표시해도 주사위와 카드가 보이는지 확인합니다. '.repeat(5).slice(0, 120);
          for (let i = 0; i < 3; i++) DKlog(long, 'chat', `플레이어${i + 1}`);
        }
      });
      await page.waitForTimeout(250);
      await finishEntrance();
      await page.screenshot({ path: outputPath(path.join('manual-die-log', `${name}-multi.png`)) });
      visible(await measure(), `${name} multiplayer layout`);
      if (name === 'landscape-phone') {
        await page.locator('#stage').evaluate(stage => {
          stage.classList.remove('mp');
          document.getElementById('rivals').replaceChildren();
        });
        await page.setViewportSize({ width: 568, height: 320 });
        await page.waitForFunction(() => document.getElementById('wrap').classList.contains('narrow'));
        await page.waitForFunction(() => document.querySelector('#roll-btn')?.classList.contains('manual-roll'), null, { timeout: 10000 });
        visible(await measure(), 'pending die after landscape resize');
      }
      if (name === 'phone' || name === 'small-phone') {
        await page.evaluate(() => {
          document.getElementById('stage').classList.remove('mp');
          document.getElementById('rivals').replaceChildren();
          DKthrow(500, 200);
          const canvas = document.getElementById('game'), r = canvas.getBoundingClientRect();
          const log = document.getElementById('log-lines').lastElementChild.getBoundingClientRect();
          DKDIE.x = ((log.left + log.right) / 2 - r.left) * canvas.width / r.width;
          DKDIE.y = Math.min(__manualBounds().bottom,
            ((log.top + log.bottom) / 2 - r.top) * canvas.height / r.height);
          DKDIE.z = 0;
        });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const layer = await page.evaluate(() => {
          const die = document.getElementById('physical-die'), main = document.getElementById('game');
          const css = getComputedStyle(die);
          return { visible: css.display !== 'none',
            pointerEvents: css.pointerEvents, size: [die.width, die.height], mainSize: [main.width, main.height],
            alpha: die.getContext('2d').getImageData(Math.round(DKDIE.x), Math.round(DKDIE.y), 1, 1).data[3] };
        });
        assert.ok(layer.visible && layer.alpha > 240, `${name}: thrown die remains opaque at the HUD boundary`);
        assert.ok((await measure()).logs.every(log => !log.coversDie), `${name}: collision bounds keep the thrown die clear of HUD notifications`);
        assert.equal(layer.pointerEvents, 'none', `${name}: visible die layer cannot swallow game input`);
        assert.deepEqual(layer.size, layer.mainSize, `${name}: die rendering and collision coordinates agree`);
        await page.screenshot({ path: outputPath(path.join('manual-die-log', `${name}-hud-boundary.png`)) });
        await page.evaluate(() => { DK.phase = 'lobby'; });
        await page.waitForFunction(() => document.getElementById('physical-die').classList.contains('hidden'));
        assert.equal(await page.locator('#physical-die').evaluate(el =>
          el.getContext('2d').getImageData(Math.round(DKDIE.x), Math.round(DKDIE.y), 1, 1).data[3]), 0,
        `${name}: leaving play clears the die layer`);
      }
      assert.deepEqual(errors, [], `${name}: no browser errors`);
      console.log('PASS pending die visible beside logs', name);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
