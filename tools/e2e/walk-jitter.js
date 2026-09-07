// 인피니티 걷기 시트가 게임 안에서 안정화됐는지: 로더가 만든 프레임(DKA.infW*Walk)마다 실루엣 발 y·무게중심 x·높이를 재서 칸끼리의 편차를 보고한다.
//   사용: node walk-jitter.js   → 시트마다 한 줄, 편차가 프레임 높이의 2% 를 넘으면 실패 (종료 1)
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.goto('http://localhost:8137/index.html?unlock=all&net=off&v=' + Date.now());
  await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
  const rows = await p.evaluate(() => {
    const out = [];
    for (const k of Object.keys(DKA)) {
      if (!/^infW\d+Walk$/.test(k) || !Array.isArray(DKA[k])) continue;
      const fr = DKA[k].map((f) => {
        const g = f.cv.getContext('2d'), d = g.getImageData(0, 0, f.w, f.h).data;
        let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, n = 0, sx = 0;
        for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { if (d[(y * f.w + x) * 4 + 3] <= 28) continue; n++; sx += x; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        return { w: f.w, h: f.h, foot: y1 + 1, top: y0, mx: sx / n, height: y1 - y0 + 1, n };
      });
      const span = (a) => Math.max(...a) - Math.min(...a);
      out.push({ key: k, dims: `${fr[0].w}×${fr[0].h}`, foot: span(fr.map((f) => f.foot)), mx: span(fr.map((f) => f.mx)), height: span(fr.map((f) => f.height)), area: span(fr.map((f) => f.n)) / Math.max(...fr.map((f) => f.n)), fh: fr[0].h });
    }
    return out;
  });
  let fail = 0;
  for (const r of rows) {
    const bad = r.foot / r.fh > 0.02 || r.mx / r.fh > 0.02;
    if (bad) fail++;
    console.log(`${r.key} ${r.dims}: 발 y 편차 ${r.foot}px · 중심 x 편차 ${r.mx.toFixed(1)}px · 높이 편차 ${r.height}px · 넓이 편차 ${(r.area * 100).toFixed(0)}%${bad ? '  ← 흔들림' : '  · 안정'}`);
  }
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
