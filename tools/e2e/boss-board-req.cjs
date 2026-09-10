// "6눈 파워업을 풀강(Lv10)했을 때, 몇 개의 고★ 타워가 있어야 보스를 시간 안에 잡는가"를 실제로 재는 도구.
// DPS 산수가 아니라 진짜 보스 웨이브를 띄우고 제한시간(bossTimeLimit) 안에 죽는지 본다 —
// 사거리·조준·탄 비행·보스 등장 연출·방어력·상성·특전이 전부 반영된다.
//   E2E_BASE_URL=http://localhost:8137/ node tools/e2e/boss-board-req.cjs [--waves=90,100] [--faces=15,16,...] [--levels=1,2,3]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');

const repo = path.resolve(__dirname, '../..');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/boss-board-req'));
const arg = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1];
const list = (v, d) => (v ? v.split(',').map(Number) : d);
const WAVES = list(arg('waves'), [90, 100, 101]);
const FACES = list(arg('faces'), [15, 16, 17, 18, 19, 20]);
const LEVELS = list(arg('levels'), [1, 2, 3]);
const POWER6 = Number(arg('power6') ?? 10);
// 나머지 석단을 채울 평범한 타워 (예: --filler=10:2 → 10★ Lv2). 미지정이면 빈칸으로 둔다.
const FILLER = arg('filler') ? { face: Number(arg('filler').split(':')[0]), lvl: Number(arg('filler').split(':')[1] || 1) } : null;
const POWER6_IN = POWER6;
const base = (process.env.E2E_BASE_URL || 'http://localhost:8137/').replace(/\/?$/, '/');
fs.mkdirSync(out, { recursive: true });

// 판 하나를 깔고 그 보스 웨이브를 끝까지 돌린다. 제한시간 안에 보스를 전부 죽이면 성공.
function tryBoard({ wave, face, lvl, count, power6, filler }) {
  DKSAVE.progression = DKPROGRESSION.defaultProfile();
  DKlobby();
  DKstartInf('clear');
  DK.paused = true;
  DK.inf.power[6] = power6;                       // 7★ 이상은 6눈 트랙을 따른다 (powerLv)
  const spots = __pureQA.SPOTS();
  if (count > spots.length) return { wave, face, lvl, count, power6, killed: false, reason: 'over-spots', seconds: 0, limit: 0, remainHp: 0, peakHp: 0, lives: DK.lives };
  DK.towers = Array.from({ length: count }, (_, i) => ({
    face, def: DKTD[face], lvl, spot: i, x: spots[i][0], y: spots[i][1], cd: 0, skin: 0,
  }));
  if (filler) for (let i = count; i < spots.length; i++) {   // 나머지 칸은 평범한 타워로 채운다
    DK.towers.push({ face: filler.face, def: DKTD[filler.face], lvl: filler.lvl, spot: i, x: spots[i][0], y: spots[i][1], cd: 0, skin: 0 });
  }
  DK.gold = 0;                                     // 뽑기 없음 — 판을 고정해 둔 채로만 본다
  DK.wave = wave - 1;
  __pureQA.startWave();
  const DT = 1 / 60, LIMIT = DKCONTENT.INFINITY.bossTimeLimit;
  const MAX = Math.ceil((LIMIT + 60) / DT);
  let ticks = 0, peakHp = 0;
  const bossesLeft = () => DK.enemies.filter(e => e.isBoss && !e.dead).length;
  while (ticks < MAX) {
    __pureQA.update(DT);
    ticks++;
    const hp = DK.enemies.filter(e => e.isBoss).reduce((s, e) => s + e.hp, 0);
    if (hp > peakHp) peakHp = hp;
    if (DK.phase !== 'playing') break;                       // 시간초과·목숨 소진
    if (!bossesLeft() && !DK.spawnQ.length && ticks > 120) break;   // 전멸
  }
  const killed = DK.phase === 'playing' && bossesLeft() === 0;
  return {
    wave, face, lvl, count, power6, filler, killed,
    seconds: +(ticks * DT).toFixed(1), limit: LIMIT,
    reason: DK.inf.bossTimeout ? 'bossTimeout' : DK.inf.bossLeak ? 'bossLeak' : killed ? 'killed' : DK.lives <= 0 ? 'lives' : 'unresolved',
    remainHp: Math.round(DK.enemies.filter(e => e.isBoss).reduce((s, e) => s + e.hp, 0)),
    peakHp: Math.round(peakHp), lives: DK.lives,
  };
}

async function openGame(browser, errors) {
  const context = await browser.newContext({ viewport: { width: 1240, height: 860 } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    localStorage.setItem('dk_coachDone', '1');
    localStorage.setItem('dk_infHelpSeen', '1');
    let state = 20260909;
    globalThis.__pureSeed = s => { state = s >>> 0; };
    Math.random = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  });
  await page.route('**/game.js*', async route => {
    const response = await route.fetch(), original = await response.text();
    const anchor = 'window.DK = S;';
    assert.equal(original.split(anchor).length, 2, '테스트 훅 삽입 지점');
    const hook = 'window.__pureQA={update,startWave,SPOTS:()=>SPOTS};\n';
    await route.fulfill({ response, body: original.replace(anchor, hook + anchor) });
  });
  const url = new URL('index.html', base);
  url.searchParams.set('net', 'off');
  url.searchParams.set('v', '1');
  await page.goto(url.href);
  await page.waitForFunction(() => window.DK && DK.phase === 'title' && window.DKPROGRESSION, null, { timeout: 120000 });
  await page.click('#ov-btn');
  await page.evaluate(() => { DK.muted = true; });
  return { page, context };
}

(async () => {
  const browser = await launchBrowser();
  const errors = [];
  const report = { scope: '보스 웨이브를 실제로 돌려 필요한 판 크기를 잰다 (DPS 산수 아님).', base, power6: POWER6, waves: WAVES, faces: FACES, levels: LEVELS, rows: [], need: {} };
  try {
    const { page, context } = await openGame(browser, errors);
    try {
      // 석단 수는 로비에서 읽으면 기본값(10)이 나온다 — 인피니티 아레나를 띄운 뒤에 읽어야 15가 나온다.
      const spots = await page.evaluate(() => { DKstartInf('clear'); DK.paused = true; const n = __pureQA.SPOTS().length; DKlobby(); return n; });
      report.spots = spots;
      console.log('인피니티 아레나 석단', spots, '칸 · 6눈 파워업 Lv' + POWER6_IN);
      const bossWaves = await page.evaluate(ws => ws.filter(w => DKCONTENT.INFINITY.isBossWave(w)), WAVES);
      const skipped = WAVES.filter(w => !bossWaves.includes(w));
      if (skipped.length) console.log('보스 웨이브가 아니라 건너뜀:', skipped.join(', '));
      report.skippedWaves = skipped;
      for (const wave of bossWaves) {
        for (const lvl of LEVELS) {
          for (const face of FACES) {
            // 필요한 최소 개수를 이분 탐색한다 (1~석단 수).
            let lo = 0, hi = spots, best = null, probes = [];
            while (lo <= hi) {
              const mid = (lo + hi) >> 1;
              const r = await page.evaluate(tryBoard, { wave, face, lvl, count: mid, power6: POWER6, filler: FILLER });
              probes.push({ count: mid, killed: r.killed, seconds: r.seconds, reason: r.reason });
              report.rows.push(r);
              if (r.killed) { best = r; hi = mid - 1; } else lo = mid + 1;
            }
            const key = `w${wave}·${face}★Lv${lvl}${FILLER ? `+${FILLER.face}★Lv${FILLER.lvl}채움` : ''}`;
            report.need[key] = best ? { count: best.count, seconds: best.seconds, of: spots } : { count: null, of: spots };
            console.log(`${key.padEnd(16)} → ${best ? `${best.count}개 / ${spots}칸 (${best.seconds}초)` : `${spots}칸을 다 채워도 실패`}   [${probes.map(p => p.count + (p.killed ? '✓' : '✗')).join(' ')}]`);
          }
        }
      }
      assert.deepEqual(errors, [], '브라우저 오류');
    } finally { await context.close(); }
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log('보고서', path.join(out, 'report.json'));
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; });
