const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  for (const [tag, vw, vh] of [['p', 393, 852], ['l', 852, 393]]) {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8137/index.html?unlock=all&net=off&v=' + Date.now());
    await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
    await p.click('#ov-btn'); await sleep(400);
    await p.screenshot({ path: `entry-${tag}-lobby.png` });
    await p.evaluate(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); DK.muted = true; DKstartInf('clear'); DK.gold = 90000; });
    await sleep(300);
    await p.click('#wave-btn'); await sleep(2500);
    await p.screenshot({ path: `entry-${tag}-wave.png` });
    const info = await p.evaluate(() => ({ p0: window.DKLANES ? DKLANES()[0].pts[0] : null, len: window.DKLANES ? Math.round(DKLANES()[0].len) : null, loopAt: window.DKLANES ? DKLANES()[0].loopAt : null, enemies: DK.enemies.slice(0, 3).map(e => [Math.round(e.x), Math.round(e.y)]), W: document.getElementById('game').width, H: document.getElementById('game').height }));
    console.log(tag, JSON.stringify(info));
    await p.click('#exit-btn'); await sleep(200);
    await p.screenshot({ path: `entry-${tag}-menu.png` });
    console.log(tag, 'errs', errs);
    await ctx.close();
  }
  await b.close();
})();
