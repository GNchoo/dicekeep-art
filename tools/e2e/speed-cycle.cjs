// Player speed selection and multiplayer summary integration.
const assert = require('node:assert/strict');
const { launchBrowser, gameUrl } = require('./browser.cjs');

(async () => {
  const browser = await launchBrowser(), errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1240, height: 860 } });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await context.addInitScript(() => {
      localStorage.setItem('dk_coachDone', '1');
      localStorage.setItem('dk_infHelpSeen', '1');
    });
    await page.goto(gameUrl());
    await page.waitForFunction(() => window.DK?.phase === 'title' && window.DKMP, null, { timeout: 120000 });
    await page.click('#ov-btn');
    const states = await page.evaluate(() => {
      DKstartInf('clear'); DK.paused = true;
      const b = document.querySelector('#speed-btn');
      const get = () => [DK.speed, b.textContent.trim(), b.dataset.icon];
      const values = [get()];
      for (let i = 0; i < 3; i++) { b.click(); values.push(get()); }
      DKMP.speed(3); // A saved pre-v151 x3 setting maps to the new fastest option.
      const legacy = get();
      DK.net = { mode: 'clear', timing: { clearWave: 101 }, doneW: 0 };
      const sent = DKMP.summary(false).sp;
      DK.net.mode = 'duel'; DKMP.speed(4);
      const battle = get();
      DK.net = null;
      return { values, legacy, sent, battle };
    });
    assert.deepEqual(states.values, [
      [1, 'x1', 'speed1'], [2, 'x2', 'speed2'], [4, 'x4', 'speed3'], [1, 'x1', 'speed1'],
    ]);
    assert.deepEqual(states.legacy, [4, 'x4', 'speed3']);
    assert.equal(states.sent, 4, 'network summary retains x4');
    assert.deepEqual(states.battle, [1, 'x1', 'speed1'], 'duel and coop stay x1');
    assert.deepEqual(errors, []);
    await context.close();
    console.log('speed-cycle: x1 → x2 → x4 → x1, old x3 → x4, network x4, battle x1 passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
