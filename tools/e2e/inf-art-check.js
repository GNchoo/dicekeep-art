// 인피니티 새 그림(INF_ART_READY) 확인: 웨이브 1~N 을 돌며 첫 적을 0.4초 간격으로 확대 캡처 (걷기 프레임·방향·후광·크기 비교).
//   사용: node inf-art-check.js [maxWave=6]   → inf-w01-a.png … (확대), inf-w01-wide.png (전체), 콘솔에 이름·art 키·프레임 크기
const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MAX = +(process.argv[2] || 6);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1240, height: 860 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text() + ' ' + (m.location() && m.location().url || '')); });
  p.on('response', r => { if (r.status() === 404) errs.push('404 ' + r.url().replace(/^.*\/dicekeep\//, '')); });
  await p.goto('http://localhost:8137/index.html?unlock=all&net=off&v=' + Date.now());
  await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
  await p.click('#ov-btn'); await sleep(300);
  await p.evaluate(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); DK.muted = true; DKstartInf('clear'); DK.gold = 90000; });
  await sleep(600);
  await p.evaluate(() => { const c = document.getElementById('coach-skip'); if (c) c.click(); const h = document.getElementById('help-close'); if (h) h.click(); });
  // 로더 상태: 새 그림 키가 A 에 있는지
  const loaded = await p.evaluate(() => { const o = {}; for (const k of Object.keys(DKA)) if (/^infW/.test(k)) { const a = DKA[k]; o[k] = Array.isArray(a) ? `sheet×${a.length} ${a[0] && a[0].w}×${a[0] && a[0].h}` : a && a.cv ? `${a.w}×${a.h}` : String(a); } return o; });
  console.log('loaded', JSON.stringify(loaded));
  for (let w = 1; w <= MAX; w++) {
    await p.evaluate((w) => { DK.enemies = []; DK.spawnQ = []; DK.waveActive = false; DK.wave = w - 1; DK.autoT = 0; if (window.DKsync) DKsync(); document.getElementById('wave-btn').disabled = false; }, w);
    await p.click('#wave-btn');
    await p.waitForFunction(() => DK.enemies.length > 0, null, { timeout: 15000 });
    await p.waitForFunction(() => DK.enemies[0] && DK.enemies[0].dist >= 220, null, { timeout: 20000 });   // 입구 모퉁이를 돌아 화면 안쪽으로
    const info = await p.evaluate(() => { const e = DK.enemies[0]; const fr = (() => { if (e.artWalk) { const a = DKA[e.artWalk]; return a[0]; } if (e.art) return DKA[e.art]; return null; })(); return { wave: DK.wave, n: DK.enemies.length, name: e.name, art: e.art, artWalk: e.artWalk, size: e.def.size, cls: e.sizeClass, move: e.move, fr: fr ? [fr.w, fr.h] : null, face: e.face }; });
    console.log('w' + w, JSON.stringify(info));
    for (let k = 0; k < 3; k++) {
      const c = await p.evaluate(() => {
        const e = DK.enemies[0]; if (!e) return null;
        const lane = DKLANES()[e.lane || 0]; let pos = null;
        for (const s of lane.segs) { if (e.dist <= s.acc + s.len) { const t = Math.max(0, (e.dist - s.acc) / s.len); pos = { x: s.ax + (s.bx - s.ax) * t, y: s.ay + (s.by - s.ay) * t }; break; } }
        if (!pos) { const s = lane.segs[lane.segs.length - 1]; pos = { x: s.bx, y: s.by }; }
        const cv = document.getElementById('game'); const r = cv.getBoundingClientRect();
        return { x: r.left + pos.x * r.width / cv.width, y: r.top + pos.y * r.height / cv.height, face: e.face, animT: e.animT, dist: e.dist };
      });
      if (!c) break;
      const clip = { x: Math.max(0, c.x - 200), y: Math.max(0, c.y - 170), width: 340, height: 240 };
      await p.screenshot({ path: `inf-w${String(w).padStart(2, '0')}-${'abc'[k]}.png`, clip });
      console.log(`  shot ${'abc'[k]} face=${c.face} animT=${c.animT.toFixed(2)} dist=${Math.round(c.dist)}`);
      await sleep(400);
    }
    await p.screenshot({ path: `inf-w${String(w).padStart(2, '0')}-wide.png` });
  }
  console.log('ERRORS', errs.length, errs.slice(0, 5).join('\n'));
  await b.close();
})();
