// keyart-before-assets verification: png +800ms, keyart jpg +1500ms; samples at 300/1200/2500/4000ms; plus fallback (abort / hang)
const { chromium } = require('playwright-core');
const sharp = require('/home/user/dicekeep-art/node_modules/sharp');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const SP = __dirname;
const lum = async (buf) => { const { data } = await sharp(buf).resize(64).raw().toBuffer({ resolveWithObject: true }); let s = 0; for (let i = 0; i < data.length; i++) s += data[i]; return Math.round(s / data.length); };
const isKey = (u) => /title-keyart-[pl]\.jpg/.test(u);
const isPng = (u) => /\.png(\?|$)/.test(u) && !/ui\/(gold|heart)\.png/.test(u);

async function run(b, tag, vw, vh, mode) {
  const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e))); const n404 = []; p.on('response', r => { if (r.status() === 404) n404.push(r.url().replace('http://localhost:8137/', '')); }); p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('console: ' + m.text()); });
  const reqs = []; let t0 = Date.now();
  p.on('request', r => reqs.push({ u: r.url().replace('http://localhost:8137/', ''), start: Date.now() - t0 }));
  p.on('requestfinished', r => { const e = reqs.find(x => x.u === r.url().replace('http://localhost:8137/', '') && x.end == null); if (e) e.end = Date.now() - t0; });
  p.on('requestfailed', r => { const e = reqs.find(x => x.u === r.url().replace('http://localhost:8137/', '') && x.end == null); if (e) { e.end = Date.now() - t0; e.failed = r.failure() && r.failure().errorText; } });
  await p.route('**/*', async (route) => {
    const u = route.request().url();
    if (isKey(u)) {
      if (mode === 'abort') return route.abort('failed');
      if (mode === 'hang') return; // never resolve
      await sleep(1500);
    } else if (/\.png(\?|$)/.test(u)) await sleep(800);
    await route.continue();
  });
  t0 = Date.now();
  p.goto('http://localhost:8137/index.html?unlock=all&net=off&v=' + Date.now()).catch(() => {});
  const samples = [];
  const times = mode === 'delay' ? [300, 1200, 2500, 4000] : [300, 2000, 3500, 4300, 5500, 8000];
  for (const at of times) {
    const w = at - (Date.now() - t0); if (w > 0) await sleep(w);
    const s = await p.evaluate(() => { const box = document.getElementById('overlay-box'), ld = document.getElementById('ov-load'), tx = document.getElementById('ov-load-txt'); return { cls: box ? [...box.classList].join(' ') : 'NOBOX', loadVis: ld ? getComputedStyle(ld).visibility : '-', txt: tx ? tx.textContent : '-', bar: (document.getElementById('ov-load-bar') || {}).style ? document.getElementById('ov-load-bar').style.width : '-', DK: !!window.DK, phase: window.DK && DK.phase } });
    const tS = Date.now() - t0;
    const shot = await p.screenshot({ path: `${SP}/lo2-${mode}-${tag}-${at}.png` });
    samples.push({ at, tS, ...s, lum: await lum(shot) });
  }
  // request analysis
  const key = reqs.filter(r => isKey(r.u));
  const keyEnd = key.length ? Math.max(...key.map(k => k.end == null ? Infinity : k.end)) : -1;
  const pngs = reqs.filter(r => isPng(r.u));
  const firstPng = pngs.length ? pngs.reduce((a, c) => c.start < a.start ? c : a) : null;
  const pngBeforeKeyDone = pngs.filter(r => r.start < keyEnd).map(r => `${r.u}@${r.start}`);
  const order = reqs.slice(0, 14).map(r => `${r.u.split('?')[0]} s${r.start} e${r.end}${r.failed ? ' FAIL:' + r.failed : ''}`);
  console.log(`\n=== ${mode} ${tag} ${vw}x${vh} ===`);
  console.log('first requests:', JSON.stringify(order, null, 0));
  console.log('keyart:', JSON.stringify(key), 'keyEnd', keyEnd);
  console.log('png count', pngs.length, 'firstPng', firstPng && `${firstPng.u} s${firstPng.start}`, 'pngBeforeKeyDone', pngBeforeKeyDone.length, pngBeforeKeyDone.slice(0, 5));
  for (const s of samples) console.log('sample', JSON.stringify(s));
  console.log('errors', errs, '404s', n404.length, n404.slice(0, 4));
  await ctx.close();
}
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const mode = process.argv[2] || 'delay';
  for (const [tag, vw, vh] of [['p', 393, 852], ['l', 852, 393]]) await run(b, tag, vw, vh, mode);
  await b.close();
})();
