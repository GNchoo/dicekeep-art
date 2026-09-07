const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  for (const v of [{ tag: 'desk', w: 1240, h: 860 }, { tag: 'phone', w: 440, h: 956 }, { tag: 'phoneL', w: 956, h: 440 }]) {
    const ctx = await b.newContext({ viewport: { width: v.w, height: v.h }, isMobile: v.tag !== 'desk', hasTouch: v.tag !== 'desk' });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8137/index.html?unlock=all&net=off&v=' + Date.now());
    await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
    console.log(v.tag, 'ui-art', await p.evaluate(() => document.body.classList.contains('ui-art')), 'chest', await p.evaluate(() => !!(DKA.chest && DKA.chest.cv && DKA.chest.w > 8)), 'burst', await p.evaluate(() => !!(DKA.acquireBurst && DKA.acquireBurst.length)));
    await p.screenshot({ path: `art-${v.tag}-title.png` });
    await p.click('#ov-btn'); await sleep(400);
    await p.screenshot({ path: `art-${v.tag}-lobby.png` });
    await p.evaluate(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); DK.muted = true; DKstartInf('clear'); DK.gold = 90000; });
    await sleep(600); await p.evaluate(() => DKchest()); await p.waitForFunction(() => !!DK.heldDie, null, { timeout: 15000 }); await p.evaluate(() => DKplace(0)); await sleep(300);
    await p.evaluate(() => { DK.selTower = DK.towers[0]; DKsync(); }); await sleep(300);
    await p.screenshot({ path: `art-${v.tag}-hud-info.png` });
    await p.evaluate(() => { DK.selTower = null; DKsync(); DKacquire(20); }); await sleep(450);
    await p.screenshot({ path: `art-${v.tag}-acquire20.png` });
    await sleep(1500); await p.evaluate(() => DKacquire(8)); await sleep(350);
    await p.screenshot({ path: `art-${v.tag}-acquire8.png` });
    await sleep(1500); await p.evaluate(() => { DK.lives = 0; DKend(false); }); await sleep(400);
    await p.screenshot({ path: `art-${v.tag}-result.png` });
    console.log(v.tag, 'errs', errs);
    await ctx.close();
  }
  await b.close();
})();
