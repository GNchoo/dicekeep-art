const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  for (const [tag, vw, vh] of [['p', 393, 852], ['s', 360, 780], ['l', 852, 393]]) {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8137/index.html?unlock=all&net=off&v=' + Date.now());
    await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
    await p.click('#ov-btn'); await sleep(300);
    await p.evaluate(() => DKlobbyView('single')); await p.click('#btn-stage-select'); await sleep(300);
    await p.screenshot({ path: `ss-${tag}-stage.png` });
    console.log(tag, 'banners', await p.evaluate(() => document.querySelectorAll('.inf-banner, #ss-inf-btn, #ss-inf-clear').length));
    await p.evaluate(() => DKlobby()); await sleep(200);
    await p.evaluate(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); DK.muted = true; DKstartInf('clear'); DK.gold = 90000; });
    await sleep(300);
    await p.evaluate(() => DKchest()); await p.waitForFunction(() => !!DK.heldDie, null, { timeout: 15000 }); await sleep(150);
    const r = await p.evaluate(() => { const g = (id) => document.getElementById(id).getBoundingClientRect(); const hi = g('held-info'), hs = g('held-sell'), tp = g('tower-panel'); return { sell: document.getElementById('held-sell').textContent, sellRight: Math.round(hs.right), infoRight: Math.round(hi.right), panelRight: Math.round(tp.right), inside: hs.right <= hi.right + 0.5 && hs.left >= hi.left - 0.5, sellW: Math.round(hs.width), infoW: Math.round(hi.width) }; });
    console.log(tag, 'held-sell', JSON.stringify(r), 'errs', errs);
    const hud = await p.$('#hud'); await hud.screenshot({ path: `ss-${tag}-hud.png` });
    await ctx.close();
  }
  await b.close();
})();
