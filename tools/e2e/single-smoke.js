const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errs = [], out = [];
  for (const v of [{ w: 1240, h: 860, tag: 'desk' }, { w: 440, h: 956, tag: 'phoneP' }]) {
    const ctx = await b.newContext({ viewport: { width: v.w, height: v.h } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(v.tag + ' ERR ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(v.tag + ' CONSOLE ' + m.text()); });
    await p.goto('http://localhost:8137/index.html?net=off&v=' + Date.now());
    await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
    await p.click('#ov-btn'); await p.waitForTimeout(500);
    const lobby = await p.evaluate(() => ({ phase: DK.phase, mpBlock: !!document.getElementById('mp-block'), off: document.getElementById('mp-block').classList.contains('off'), status: document.getElementById('mp-status').textContent, name: document.getElementById('mp-name').value }));
    out.push(v.tag + ' lobby ' + JSON.stringify(lobby));
    await p.evaluate(() => DKlobbyView('single')); await p.click('#btn-inf-clear'); await p.waitForTimeout(800);
    await p.evaluate(() => { DK.muted = true; localStorage.setItem('dk_coachDone', '1'); const c = document.getElementById('coach-skip'); if (c) c.click(); const h = document.getElementById('help-close'); if (h) h.click(); DK.gold = 900000; });
    await p.waitForTimeout(300);
    await p.click('#roll-btn');
    await p.waitForFunction(() => !!window.DK.heldDie, null, { timeout: 20000 });
    await p.evaluate(() => window.DKplace(0));
    await p.click('#wave-btn'); await p.waitForTimeout(2500);
    const st = await p.evaluate(() => ({ phase: DK.phase, wave: DK.wave, waveActive: DK.waveActive, enemies: DK.enemies.length, net: DK.net, btn: document.getElementById('wave-btn').textContent, speedHidden: document.getElementById('speed-btn').classList.contains('hidden'), rivalsHidden: document.getElementById('rivals').classList.contains('hidden'), wrap: document.getElementById('wrap').className }));
    out.push(v.tag + ' play ' + JSON.stringify(st));
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
    await p.click('#ov-btn'); await p.waitForTimeout(300);
    out.push(v.tag + ' back ' + await p.evaluate(() => DK.phase));
    await p.screenshot({ path: 'single-smoke-' + v.tag + '.png' });
    await ctx.close();
  }
  await b.close();
  console.log(out.join('\n'));
  console.log('ERRORS', errs.length, errs.slice(0, 10).join('\n'));
})();
