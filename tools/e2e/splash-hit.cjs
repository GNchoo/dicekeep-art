// 광역(폭발) 타워가 조준해서 맞힌 대상에게 반드시 피해를 준다.
// 예전에는 projHit 의 광역 판정이 부호를 잘못 써서 "자기 자신까지의 거리" 가 0 이 아니라
// 0.8×크기 로 나왔다. 그래서 큰 적일수록 면역이 되어, 대형 보스(크기 120)에게는
// 2·6·7~16 눈의 폭발이 통째로 빗나갔다 (10웨이브 보스를 9★·8★ 로 못 잡던 증상).
//   E2E_BASE_URL=http://localhost:8137/ node tools/e2e/splash-hit.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');

const repo = path.resolve(__dirname, '../..');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/splash-hit'));
const base = (process.env.E2E_BASE_URL || 'http://localhost:8137/').replace(/\/?$/, '/');
fs.mkdirSync(out, { recursive: true });
const report = { scope: '광역 타워가 조준한 대상을 반드시 때린다', base, rows: [], checks: [], pass: false };

// 한 보스 웨이브에 그 눈의 타워만 깔고, 제한시간 안에 보스 체력이 줄어드는지 본다.
function probe({ wave, face, lvl, count }) {
  DKSAVE.progression = DKPROGRESSION.defaultProfile();
  DKlobby(); DKstartInf('clear'); DK.paused = true;
  const spots = __splashQA.SPOTS();
  DK.towers = Array.from({ length: count }, (_, i) => ({
    face, def: DKTD[face], lvl, spot: i, x: spots[i][0], y: spots[i][1], cd: 0, skin: 0,
  }));
  DK.gold = 0;
  DK.wave = wave - 1;
  __splashQA.startWave();
  const DT = 1 / 60;
  let ticks = 0, hurtAt = -1, seen = null, killed = false;
  while (ticks < 60 * 150 && DK.phase === 'playing') {
    __splashQA.update(DT); ticks++;
    const b = DK.enemies.find(e => e.isBoss);
    if (b) {
      seen = { size: b.sizeClass, defSize: b.def.size, max: b.max };
      // 한 방에 죽는 조합도 있다 — 죽은 것도 "피해가 들어갔다" 로 센다.
      if (b.hp < b.max || b.dead) { hurtAt = +(ticks / 60).toFixed(1); killed = !!b.dead; break; }
    } else if (seen && ticks > 180) {
      // 보스가 목록에서 사라졌다면 죽어서 치워진 것이다.
      hurtAt = +(ticks / 60).toFixed(1); killed = true; break;
    }
  }
  return { wave, face, lvl, count, hurtAt, killed, size: seen ? seen.size : null, bossSize: seen ? seen.defSize : null,
           splash: DKTD[face].splash || 0, perk: DKTD[face].perk || null, phase: DK.phase };
}

(async () => {
  const browser = await launchBrowser();
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1240, height: 860 } });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
    await page.route('**/game.js*', async route => {
      const res = await route.fetch(), src = await res.text();
      const anchor = 'window.DK = S;';
      assert.equal(src.split(anchor).length, 2, '테스트 훅 삽입 지점');
      await route.fulfill({ response: res, body: src.replace(anchor, 'window.__splashQA={update,startWave,SPOTS:()=>SPOTS};\n' + anchor) });
    });
    const url = new URL('index.html', base);
    url.searchParams.set('net', 'off'); url.searchParams.set('v', '1');
    await page.goto(url.href);
    await page.waitForFunction(() => window.DK && DK.phase === 'title' && window.__splashQA, null, { timeout: 120000 });
    await page.click('#ov-btn');
    await page.evaluate(() => { DK.muted = true; });

    // 보스 크기 세 종류를 모두 훑는다 (대형이 가장 크고 예전에 가장 심하게 면역이었다)
    const waves = await page.evaluate(() => {
      const INF = DKCONTENT.INFINITY, byCls = {};
      for (let w = 10; w <= 100; w += 10) if (INF.isBossWave(w)) { const c = INF.sizeOf(w); if (!byCls[c]) byCls[c] = w; }
      return byCls;
    });
    report.waves = waves;
    console.log('보스 크기별 웨이브:', JSON.stringify(waves));

    const FACES = [2, 6, 7, 9, 11, 13, 16, 19];   // 전부 폭발형(광역) — 예전에 대형 보스에 면역이던 구간 포함
    const failures = [];
    for (const [cls, wave] of Object.entries(waves)) {
      for (const face of FACES) {
        const r = await page.evaluate(probe, { wave, face, lvl: 3, count: 6 });
        report.rows.push({ cls, ...r });
        const ok = r.hurtAt >= 0;
        console.log(`  ${cls} 보스(w${wave}) × ${face}★ Lv3 ×6 → ${ok ? `${r.hurtAt}초에 첫 피해${r.killed ? ' (즉사)' : ''}` : '피해 없음'} (크기 ${r.bossSize} · 광역 ${r.splash})`);
        if (!ok) failures.push(`${cls} 보스 × ${face}★`);
      }
    }
    const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); report.checks.push({ name }); console.log('  PASS', name); };
    check('모든 크기의 보스가 모든 광역 타워에게 피해를 받는다', failures, []);
    check('보스 크기 세 종류를 다 훑었다', Object.keys(waves).sort(), ['L', 'M', 'S']);

    // 반증: 광역 반경이 0 에 가까우면 조준 대상만 맞아야 하므로, 판정이 켜져 있다는 뜻
    check('검사가 실제로 보스를 상대했다 (체력이 있는 보스)', report.rows.every(r => r.bossSize > 0), true);

    assert.deepEqual(errors, [], '브라우저 오류');
    report.pass = true;
    await context.close();
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log('PASS 광역 명중', report.checks.length, '검사 ·', report.rows.length, '조합;', path.join(out, 'report.json'));
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; });
