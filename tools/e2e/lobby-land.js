const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  for (const v of [{ tag: '956x440', w: 956, h: 440 }, { tag: '844x390', w: 844, h: 390 }, { tag: '667x375', w: 667, h: 375 }, { tag: '1180x820', w: 1180, h: 820 }]) {
    const ctx = await b.newContext({ viewport: { width: v.w, height: v.h }, isMobile: v.w < 1000, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto('http://localhost:8137/index.html?unlock=all&net=ws%3A%2F%2Flocalhost%3A8787&v=' + Date.now());
    await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
    await p.click('#ov-btn'); await sleep(400);
    const m = await p.evaluate(() => { const b = document.querySelector('#lobby .screen-box'); return { scroll: b.scrollHeight - b.clientHeight, box: [Math.round(b.getBoundingClientRect().width), Math.round(b.getBoundingClientRect().height)] }; });
    console.log(v.tag, JSON.stringify(m));
    await p.screenshot({ path: `lobby-${v.tag}.png` });
    await ctx.close();
  }
  await b.close();
})();
