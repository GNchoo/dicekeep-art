const assert = require('node:assert/strict');
const { launchBrowser, gameUrl, outputPath } = require('./browser.cjs');
(async () => {
  const b = await launchBrowser();
  try {
  const errs = [], diagnostics = [], out = [];
  for (const v of [{ w: 1240, h: 860, tag: 'desk' }, { w: 440, h: 956, tag: 'phoneP' }]) {
    const ctx = await b.newContext({ viewport: { width: v.w, height: v.h } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(v.tag + ' ERR ' + e.message));
    p.on('console', m => { if (m.type() === 'error') diagnostics.push(v.tag + ' CONSOLE ' + m.text()); });
    await p.goto(gameUrl(false));
    await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
    await p.click('#ov-btn'); await p.waitForTimeout(500);
    const lobby = await p.evaluate(() => ({ phase: DK.phase, mpBlock: !!document.getElementById('mp-block'), off: document.getElementById('mp-block').classList.contains('off'), status: document.getElementById('mp-status').textContent, name: document.getElementById('mp-name').value }));
    out.push(v.tag + ' lobby ' + JSON.stringify(lobby));
    assert.equal(lobby.phase, 'lobby', v.tag + ': title must enter lobby');
    await p.evaluate(() => DKlobbyView('single')); await p.click('#btn-inf-clear'); await p.waitForTimeout(800);
    await p.evaluate(() => { DK.muted = true; localStorage.setItem('dk_coachDone', '1'); const c = document.getElementById('coach-skip'); if (c) c.click(); const h = document.getElementById('help-close'); if (h) h.click(); DK.gold = 900000; });
    await p.waitForTimeout(300);
    await p.click('#roll-btn');
    await p.waitForFunction(() => !!window.DK.heldDie, null, { timeout: 20000 });
    await p.evaluate(() => window.DKplace(0));
    await p.click('#wave-btn'); await p.waitForTimeout(2500);
    const st = await p.evaluate(() => ({ phase: DK.phase, wave: DK.wave, waveActive: DK.waveActive, enemies: DK.enemies.length, net: DK.net, btn: document.getElementById('wave-btn').textContent, speedHidden: document.getElementById('speed-btn').classList.contains('hidden'), rivalsHidden: document.getElementById('rivals').classList.contains('hidden'), wrap: document.getElementById('wrap').className }));
    out.push(v.tag + ' play ' + JSON.stringify(st));
    assert.equal(st.phase, 'playing', v.tag + ': infinity must be playing');
    assert.equal(st.wave, 1, v.tag + ': first wave must start');
    assert.ok(st.waveActive && st.enemies > 0, v.tag + ': first wave must spawn enemies');
    assert.ok(!st.net, v.tag + ': must remain in single-player mode');
    // 웨이브 자동 진행 (autoT) 확인
    await p.evaluate(() => { DK.spawnQ = []; });
    await p.waitForTimeout(500);
    const st2 = await p.evaluate(() => ({ waveActive: DK.waveActive, autoT: Math.round(DK.autoT * 10) / 10, btn: document.getElementById('wave-btn').textContent }));
    out.push(v.tag + ' after-wave ' + JSON.stringify(st2));
    // 포기 → 결과 → 로비
    await p.evaluate(() => { DK.lives = 0; });
    p.once('dialog', d => d.accept());
    await p.click('#exit-btn'); await p.waitForTimeout(200); await p.click('#menu-quit'); await p.waitForTimeout(600);
    const ov = await p.evaluate(() => ({ phase: DK.phase, title: document.getElementById('ov-title').textContent, overlay: !document.getElementById('overlay').classList.contains('hidden') }));
    out.push(v.tag + ' over ' + JSON.stringify(ov));
    assert.equal(ov.phase, 'over', v.tag + ': quitting must show results');
    assert.ok(ov.overlay, v.tag + ': results overlay must be visible');
    await p.click('#ov-btn'); await p.waitForTimeout(300);
    const back = await p.evaluate(() => DK.phase);
    out.push(v.tag + ' back ' + back);
    assert.equal(back, 'lobby', v.tag + ': results must return to lobby');
    await p.screenshot({ path: outputPath('single-smoke-' + v.tag + '.png') });
    await ctx.close();
  }
  console.log(out.join('\n'));
  console.log('CONSOLE DIAGNOSTICS', diagnostics.length, diagnostics.slice(0, 5).join('\n'));
  console.log('ERRORS', errs.length, errs.slice(0, 10).join('\n'));
  assert.equal(errs.length, 0, 'uncaught page errors: ' + errs.join('\n'));
  } finally { await b.close(); }
})().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
