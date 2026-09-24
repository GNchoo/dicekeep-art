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
      ['small-landscape', 568, 320], ['phone', 390, 844],
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
      await page.waitForTimeout(150);
      const measure = () => page.evaluate(() => {
        const canvas = document.getElementById('game');
        const rect = canvas.getBoundingClientRect();
        const stage = document.getElementById('stage').getBoundingClientRect();
        const hud = document.getElementById('hud').getBoundingClientRect();
        const scaleX = rect.width / canvas.width, scaleY = rect.height / canvas.height;
        const die = { x: rect.left + DKDIE.x * scaleX, y: rect.top + DKDIE.y * scaleY,
          radius: 48 * Math.min(scaleX, scaleY) };
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
        return { die, logs, rivals, hud: { left: hud.left, top: hud.top, right: hud.right, bottom: hud.bottom },
          stage: { left: stage.left, top: stage.top, right: stage.right, bottom: stage.bottom },
          state: DKDIE.state, slotPhase: DKSLOT.phase };
      });
      const visible = (layout, label) => {
        assert.equal(layout.state, 'tray', `${label}: physical die is waiting to be thrown`);
        assert.equal(layout.slotPhase, -1, `${label}: manual chest is pending`);
        assert.ok(layout.logs.length >= 2, `${label}: multiple messages are visible`);
        assert.ok(layout.logs.every(log => !log.coversDie), `${label}: die is not hidden by logs ${JSON.stringify(layout)}`);
        assert.ok(layout.logs.every(log => log.opacity > .8 && log.right - log.left > 10 && log.bottom - log.top > 10 &&
          log.left >= layout.stage.left - 1 && log.right <= layout.stage.right + 1 &&
          log.top >= layout.stage.top - 1 && log.bottom <= layout.stage.bottom + 1),
        `${label}: log cards remain readable inside the stage ${JSON.stringify(layout)}`);
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
        await page.waitForFunction(() => document.getElementById('wrap').classList.contains('xnarrow'));
        await page.waitForTimeout(150);
        visible(await measure(), 'pending die after landscape resize');
      }
      assert.deepEqual(errors, [], `${name}: no browser errors`);
      console.log('PASS pending die visible beside logs', name);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
