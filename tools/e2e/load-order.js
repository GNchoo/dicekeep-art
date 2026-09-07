// 로딩 순서: 키아트가 뜬 뒤 에셋 로딩 시작 (PNG 1.2초 지연)
const { chromium } = require('playwright-core');
const sharp = require('/home/user/dicekeep-art/node_modules/sharp');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  for (const [tag, vw, vh] of [['p', 393, 852], ['l', 852, 393]]) {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const reqs = [];
    await p.route('**/*', async (route) => { const u = route.request().url(); reqs.push({ u, t: Date.now() }); if (/\.png(\?|$)/.test(u)) await sleep(1200); await route.continue(); });
    const t0 = Date.now();
    await p.goto('http://localhost:8137/index.html?unlock=all&net=off&v=' + Date.now());
    await sleep(700);
    const a = await p.evaluate(() => ({ preload: document.getElementById('overlay-box').classList.contains('preload'), loadVis: getComputedStyle(document.getElementById('ov-load')).visibility, txt: document.getElementById('ov-load-txt').textContent }));
    const shot1 = await p.screenshot({ path: `load-${tag}-700.png` });
    await sleep(1500);
    const b2 = await p.evaluate(() => ({ preload: document.getElementById('overlay-box').classList.contains('preload'), loadVis: getComputedStyle(document.getElementById('ov-load')).visibility, txt: document.getElementById('ov-load-txt').textContent }));
    const shot2 = await p.screenshot({ path: `load-${tag}-2200.png` });
    const lum = async (buf) => { const { data, info } = await sharp(buf).resize(64).raw().toBuffer({ resolveWithObject: true }); let s = 0; for (let i = 0; i < data.length; i++) s += data[i]; return Math.round(s / data.length); };
    const keyIdx = reqs.findIndex(r => /title-keyart/.test(r.u)); const firstPng = reqs.findIndex(r => /\.png/.test(r.u) && !/gold|heart/.test(r.u));
    const pngBeforeKey = reqs.slice(0, keyIdx).filter(r => /\.png/.test(r.u)).length;
    console.log(tag, JSON.stringify({ at700: a, at2200: b2, lum700: await lum(shot1), lum2200: await lum(shot2), keyReqAt: reqs[keyIdx] ? reqs[keyIdx].t - t0 : -1, pngBeforeKey, firstPngAt: reqs[firstPng] ? reqs[firstPng].t - t0 : -1, key: reqs[keyIdx] && reqs[keyIdx].u.split('/').pop() }));
    await ctx.close();
  }
  await b.close();
})();
