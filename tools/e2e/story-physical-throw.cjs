#!/usr/bin/env node
'use strict';

// Story dice still use the original mouse-flick physics, charge, enemy hit, and face settlement.
const assert = require('node:assert/strict');
const { launchBrowser, gameUrl } = require('./browser.cjs');
const { cameraFacingDieResult } = require('./camera-facing-die.cjs');

(async () => {
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1240, height: 860 } });
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => failed.push(`${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
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
      source = source.replace(anchor, `window.__storyQA={updateDie,physicalFaceValue,dieShape,POLY,FACES,m3apply,spawnEnemy,putTarget(x,y){
        LANES=[buildLane('ground',[[x-80,y],[x+80,y]],'test target')];
        spawnEnemy({type:'slime',lane:0});
        const enemy=S.enemies.at(-1);enemy.dist=80;enemy.hp=enemy.max=1000000;
        return enemy;
      }};\nwindow.__storyQA.cameraFace=${cameraFacingDieResult.toString()};\n` + anchor);
      await route.fulfill({ response, body: source });
    });
    await page.goto(gameUrl());
    try {
      await page.waitForFunction(() => window.DK?.phase === 'title' && window.__storyQA, null, { timeout: 20000 });
    } catch (error) {
      const state = await page.evaluate(() => ({ ready: document.readyState, phase: window.DK?.phase,
        hook: !!window.__storyQA, progression: typeof window.DKPROGRESSION,
        script: [...document.scripts].map(item => item.src).filter(Boolean).at(-1) }));
      throw new Error(`story game did not boot: ${JSON.stringify({ state, errors, failed })}`, { cause: error });
    }
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

    let thrown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const p = await page.evaluate(() => {
        const c = document.querySelector('#game'), r = c.getBoundingClientRect();
        return { x: r.left + DKDIE.x * r.width / c.width, y: r.top + DKDIE.y * r.height / c.height,
          scale: r.width / c.width };
      });
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      assert.equal(await page.evaluate(() => DKDIE.state), 'grab', 'mouse physically picks up the story die');
      const dx = (200 + 90 * attempt) * p.scale, dy = (145 + 55 * attempt) * p.scale;
      await page.mouse.move(p.x + dx * .15, p.y - dy * .15);
      await page.mouse.move(p.x + dx * .55, p.y - dy * .55);
      await page.mouse.move(p.x + dx, p.y - dy);
      await page.mouse.up();
      thrown = await page.evaluate(() => ({ state: DKDIE.state, gold: DK.gold, vx: DKDIE.vx, vy: DKDIE.vy }));
      if (thrown.state === 'throw') break;
      assert.deepEqual([thrown.state, thrown.gold], ['tray', 500], 'a gesture below speed threshold returns the die without charging');
    }
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
      let landing = null, settledVisible = null;
      for (let i = 0; i < 600 && !DK.heldDie; i++) {
        const state = d.state;
        __storyQA.updateDie(dt);
        if (!landing && state === 'throw' && d.state === 'settle')
          landing = { visible: __storyQA.physicalFaceValue('story', d.R, d.labels),
            cameraFace: __storyQA.cameraFace('story', d.R, d.labels, __storyQA).value,
            final: d.final, R: d.R.slice() };
        if (settledVisible === null && state === 'settle' && d.state === 'fly')
          settledVisible = { physical: __storyQA.physicalFaceValue('story', d.R, d.labels),
            cameraFace: __storyQA.cameraFace('story', d.R, d.labels, __storyQA).value };
      }
      return { hit, held: DK.heldDie, final: d.final, face: d.face, dieState: d.state,
        gold: DK.gold, slotActive: DKSLOT.active, landing,
        settledVisible };
    });
    assert.ok(result.hit.calls > 0 && result.hit.hits > 0 && result.hit.hpAfter < result.hit.hpBefore,
      'story die still calls enemy strike and deals damage');
    assert.ok(result.held >= 1 && result.held <= 6, 'physical landing awards an unlocked story face');
    assert.equal(result.held, result.final, 'held face matches physical settlement');
    assert.ok(result.landing, 'story die visibly landed before its reward was awarded');
    assert.deepEqual([result.landing.visible, result.landing.cameraFace, result.landing.final,
      result.settledVisible.physical, result.settledVisible.cameraFace],
    [result.held, result.held, result.held, result.held, result.held],
    'story reward and final visible pips match the camera-facing landing face');
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
