// 여러 뷰포트에서 타이틀 화면 + 로비 스크린샷. 사용: node title-vp.js <prefix>
const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const prefix = process.argv[2] || 'vp';
const VPS = [['360x780', 360, 780], ['393x852', 393, 852], ['440x956', 440, 956], ['820x1180', 820, 1180], ['754x836', 754, 836], ['852x393', 852, 393], ['667x375', 667, 375], ['1280x800', 1280, 800]];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  for (const [tag, vw, vh] of VPS) {
    const mob = vw < 1000;
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: mob ? 2 : 1, isMobile: mob, hasTouch: mob });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8137/index.html?unlock=all&net=off&v=' + Date.now());
    await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
    await sleep(250);
    await p.screenshot({ path: `${prefix}-${tag}-title.png` });
    const t = await p.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); const h = r('ov-title'), s = r('ov-sub'), bt = r('ov-btn'); const bg = getComputedStyle(document.getElementById('overlay')).backgroundImage; return { titleShown: h.height > 0, subShown: s.height > 0, btn: [Math.round(bt.top), Math.round(bt.bottom)], img: /keyart-p/.test(bg) ? 'p' : /keyart-l/.test(bg) ? 'l' : '?', ox: document.documentElement.scrollWidth > innerWidth }; });
    console.log(tag, JSON.stringify(t), errs.length ? errs : '');
    await p.click('#ov-btn'); await sleep(300);
    await p.screenshot({ path: `${prefix}-${tag}-lobby.png` });
    await ctx.close();
  }
  await b.close();
})();
