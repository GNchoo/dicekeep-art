#!/usr/bin/env node
'use strict';

// Story dice still use the original mouse-flick physics, charge, enemy hit, and face settlement.
const assert = require('node:assert/strict');
const { launchBrowser, gameUrl } = require('./browser.cjs');

(async () => {
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1240, height: 860 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); });
    await page.route('**/game.js*', async route => {
      const response = await route.fetch();
      let source = await response.text();
      const strike = 'function strikeEnemiesWithDie() {';
      const anchor = 'window.DK = S;';
      assert.equal(source.split(strike).length, 2, 'enemy strike hook is unique');
      assert.equal(source.split(anchor).length, 2, 'game hook is unique');
      source = source.replace(strike, strike + ' window.__storyStrikes=(window.__storyStrikes||0)+1;');
      source = source.replace(anchor, `window.__storyQA={updateDie,spawnEnemy,putTarget(x,y){
        LANES=[buildLane('ground',[[x-80,y],[x+80,y]],'test target')];
        spawnEnemy({type:'slime',lane:0});
        const enemy=S.enemies.at(-1);enemy.dist=80;enemy.hp=enemy.max=1000000;
        return enemy;
      }};\n` + anchor);
      await route.fulfill({ response, body: source });
    });
    await page.goto(gameUrl());
    await page.waitForFunction(() => window.DK?.phase === 'title' && window.__storyQA, null, { timeout: 120000 });
    await page.click('#ov-btn');
    const start = await page.evaluate(() => {
      DKstart(1); DK.paused = true; DK.muted = true; DK.gold = 500;
      const canvas = document.querySelector('#game'), r = canvas.getBoundingClientRect();
      const x = r.left + DKDIE.x * r.width / canvas.width;
      const y = r.top + DKDIE.y * r.height / canvas.height;
      return { x, y, scale: r.width / canvas.width, target: document.elementFromPoint(x,y)?.id,
        mode: DK.mode, phase: DK.phase, gold: DK.gold, die: DKDIE.state };
    });
    assert.deepEqual([start.mode, start.phase, start.gold, start.die, start.target],
      ['stage', 'playing', 500, 'tray', 'game'], 'story die is ready on the unobstructed canvas');

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    assert.equal(await page.evaluate(() => DKDIE.state), 'grab', 'mouse physically picks up the story die');
    const dx = 200 * start.scale, dy = 145 * start.scale;
    await page.mouse.move(start.x + dx * .15, start.y - dy * .15);
    await page.mouse.move(start.x + dx, start.y - dy);
    await page.mouse.up();
    const thrown = await page.evaluate(() => ({ state: DKDIE.state, gold: DK.gold, vx: DKDIE.vx, vy: DKDIE.vy }));
    assert.equal(thrown.state, 'throw', 'mouse flick starts story physics: ' + JSON.stringify(thrown));
    assert.equal(thrown.gold, 460, 'story throw charges exactly 40G');
    assert.ok(Math.hypot(thrown.vx, thrown.vy) > 330, 'flick carries physical velocity');

    // Put a normal enemy on a short test lane at the next physical contact point.
    // This makes the collision deterministic without replacing physics or damageEnemy.
    const result = await page.evaluate(() => {
      const d = DKDIE, dt = 1 / 60;
      const nextZ = Math.max(0, d.z + (d.vz - 1650 * dt) * dt);
      const x = d.x + d.vx * dt, y = d.y + d.vy * dt - nextZ * .62;
      const enemy = __storyQA.putTarget(x, y), hp = enemy.hp;
      __storyQA.updateDie(dt);
      const hit = { calls: window.__storyStrikes || 0, hpBefore: hp, hpAfter: enemy.hp, hits: d.hits.length };
      for (let i = 0; i < 600 && !DK.heldDie; i++) __storyQA.updateDie(dt);
      return { hit, held: DK.heldDie, final: d.final, face: d.face, dieState: d.state,
        gold: DK.gold, slotActive: DKSLOT.active };
    });
    assert.ok(result.hit.calls > 0 && result.hit.hits > 0 && result.hit.hpAfter < result.hit.hpBefore,
      'story die still calls enemy strike and deals damage');
    assert.ok(result.held >= 1 && result.held <= 6, 'physical landing awards an unlocked story face');
    assert.equal(result.held, result.final, 'held face matches physical settlement');
    assert.equal(result.dieState, 'tray', 'die flies back to its tray after settlement');
    assert.equal(result.gold, 460, 'enemy hit and settlement do not charge the throw again');
    assert.equal(result.slotActive, false, 'story throw never occupies chest animation slot');
    assert.deepEqual(errors, [], 'no uncaught browser errors');
    console.log('PASS story physical throw', JSON.stringify({ thrown, result }));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
