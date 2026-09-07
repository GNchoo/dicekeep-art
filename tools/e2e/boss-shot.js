// 보스 웨이브 중 상단 HUD: 칩 길이·미니 버튼 줄·말풍선 확인. 사용: node boss-shot.js [prefix]
const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const prefix = process.argv[2] || 'boss';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const out = [];
  for (const [tag, vw, vh] of [['p393', 393, 852], ['p360', 360, 780], ['l852', 852, 393], ['l667', 667, 375]]) {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8137/index.html?unlock=all&net=off&v=' + Date.now());
    await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
    await p.click('#ov-btn'); await sleep(300);
    await p.evaluate(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); DK.muted = true; DKstartInf('clear'); DK.gold = 90000; DK.wave = 9; DKsync(); });
    await sleep(300);
    await p.click('#wave-btn'); await sleep(2500);
    const r = await p.evaluate(() => { const g = (id) => document.getElementById(id).getBoundingClientRect(); const s = g('stats'), m = g('mini-top'); return { bossT: Math.round(DK.inf.bossT), chip: document.getElementById('wave-val').textContent, drop: document.getElementById('stage').classList.contains('mini-drop'), statsRight: Math.round(s.right), miniLeft: Math.round(m.left), miniTop: Math.round(m.top), statsTop: Math.round(s.top), sameRow: Math.abs(m.top - s.top) < 6 }; });
    await p.screenshot({ path: `${prefix}-${tag}.png` });
    // 30초 미만 (깜빡임)
    await p.evaluate(() => { DK.inf.bossT = 12; }); await sleep(300);
    await p.screenshot({ path: `${prefix}-${tag}-urgent.png`, clip: { x: 0, y: 0, width: vw, height: Math.min(vh, 200) } });
    out.push({ tag, ...r, errs });
    console.log(tag, JSON.stringify({ ...r, errs }));
    await ctx.close();
  }
  await b.close();
})();
