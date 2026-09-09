// 순수운빨의 난이도(=클리어율)가 성장·상거래 도입 전과 같은지 확인한다.
// 같은 씨앗·같은 봇으로 두 리비전을 각각 돌려 웨이브 진행과 뽑기 흐름을 통째로 대조한다.
// 클리어율을 새로 측정하는 것이 아니라, 곡선·뽑기·전투가 그대로임을 보여 "유지"를 증명하는 쪽이다.
//   E2E_BASE_URL=http://localhost:8137/ E2E_BASELINE_URL=http://localhost:8138/ node tools/e2e/pure-luck-baseline.cjs [--waves=30]
// 기준 리비전은 모드 분리 직전(성장·상거래 도입 전)을 별도 포트로 띄워 둔다.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');

const repo = path.resolve(__dirname, '../..');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/pure-luck-baseline'));
const CURRENT = (process.env.E2E_BASE_URL || 'http://localhost:8137/').replace(/\/?$/, '/');
const BASELINE = (process.env.E2E_BASELINE_URL || 'http://localhost:8138/').replace(/\/?$/, '/');
const WAVES = Number((process.argv.find(a => a.startsWith('--waves=')) || '').split('=')[1]) || 30;
const SEEDS = [20260909, 777, 31337, 4242, 99999];
fs.mkdirSync(out, { recursive: true });

const report = { scope: '두 리비전을 같은 씨앗으로 구동해 순수운빨 진행이 같은지 대조. 절대 클리어율 측정이 아니다.', current: CURRENT, baseline: BASELINE, waves: WAVES, seeds: SEEDS, started: new Date().toISOString(), rows: [], pass: false };

// 계정 상태를 전혀 건드리지 않는 봇. 기준 리비전에는 성장·상거래가 없으므로 양쪽에서 똑같이 돌아간다.
function playRun({ seed, waves }) {
  const hash = str => { let h1 = 0x811c9dc5, h2 = 0x01000193; for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0; h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0; } return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + ':' + str.length; };
  globalThis.__pureSeed(seed);
  DKstartInf('clear');
  DK.paused = true;
  const trace = [], draws = [];
  const DT = 1 / 60, MAX_TICKS = 400000;
  let ticks = 0;
  const spend = () => {
    let guard = 0;
    while (DK.phase === 'playing' && !DK.heldDie && DK.gold >= __pureQA.chestCost() && guard++ < 40) {
      if (!DKchest()) break;
      __pureQA.finishSlot();
      const face = DK.heldDie;
      draws.push([DKSLOT.kind, DKSLOT.final, face]);
      const spots = __pureQA.SPOTS();
      let placed = false;
      for (let i = 0; i < spots.length && !placed; i++) if (!__pureQA.towerAt(i)) placed = DKplace(i) !== false;
      if (!placed) for (let i = 0; i < spots.length && !placed; i++) { const t = __pureQA.towerAt(i); if (t && t.face === face) placed = DKplace(i) !== false; }
      if (!placed) break;
    }
  };
  const row = () => {
    const towers = DK.towers.map(t => [t.spot, t.face, t.lvl]).sort((a, b) => a[0] - b[0]);
    const hp = DK.enemies.reduce((sum, e) => sum + Math.round(e.hp * 1000), 0);
    return [DK.wave, Math.round(DK.gold), DK.lives, DK.inf.kills, DK.inf.chests, DK.enemies.length, hp, DK.heldDie, JSON.stringify(towers)].join('|');
  };
  // 완료 웨이브 카운터(S.inf.doneW)는 최신 리비전에만 있다. 두 리비전에 모두 있는 DK.wave 로 멈춘다.
  while (DK.phase === 'playing' && DK.wave < waves && ticks < MAX_TICKS) {
    spend();
    if (!DK.waveActive && !DK.spawnQ.length && !DK.enemies.length) { trace.push('W' + row()); __pureQA.startWave(); }
    __pureQA.update(DT);
    ticks++;
    if (ticks % 60 === 0) trace.push(row());
  }
  trace.push('END' + row() + '|' + DK.phase);
  return {
    seed, ticks, waveReached: DK.wave, phase: DK.phase, lives: DK.lives, kills: DK.inf.kills,
    drawCount: draws.length, drawHash: hash(JSON.stringify(draws)), traceHash: hash(trace.join('\n')),
    // 곡선 자체도 같이 기록해 둔다 (수치가 바뀌면 해시보다 원인을 읽기 쉽다).
    curve: [1, 25, 50, 75, 90, 101].map(w => DKCONTENT.INFINITY.wave(w, true).hpMult),
  };
}

async function openGame(browser, base, rows) {
  const context = await browser.newContext({ viewport: { width: 1240, height: 860 } });
  const page = await context.newPage();
  page.on('pageerror', e => rows.errors.push(base + ' ' + e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    localStorage.setItem('dk_coachDone', '1');
    localStorage.setItem('dk_infHelpSeen', '1');
    let state = 1;
    globalThis.__pureSeed = seed => { state = seed >>> 0; };
    Math.random = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
  await page.route('**/game.js*', async route => {
    const response = await route.fetch(), original = await response.text();
    const anchor = 'window.DK = S;';
    assert.equal(original.split(anchor).length, 2, base + ': 테스트 훅 삽입 지점');
    const hook = 'window.__pureQA={update,finishSlot,startWave,chestCost,towerAt,SPOTS:()=>SPOTS};\n';
    await route.fulfill({ response, body: original.replace(anchor, hook + anchor) });
  });
  const url = new URL('index.html', base);
  url.searchParams.set('net', 'off');
  url.searchParams.set('v', Date.now());
  await page.goto(url.href);
  await page.waitForFunction(() => window.DK && DK.phase === 'title', null, { timeout: 120000 });
  await page.click('#ov-btn');
  await page.evaluate(() => { DK.muted = true; });
  return { page, context };
}

(async () => {
  const browser = await launchBrowser();
  const rows = { errors: [] };
  try {
    const cur = await openGame(browser, CURRENT, rows);
    const base = await openGame(browser, BASELINE, rows);
    try {
      for (const seed of SEEDS) {
        await cur.page.evaluate(() => { try { DKlobby(); } catch (e) { /* 첫 런 */ } });
        await base.page.evaluate(() => { try { DKlobby(); } catch (e) { /* 첫 런 */ } });
        const a = await cur.page.evaluate(playRun, { seed, waves: WAVES });
        const b = await base.page.evaluate(playRun, { seed, waves: WAVES });
        const killDrift = Math.abs(a.kills - b.kills) / Math.max(1, b.kills);
        const same = a.traceHash === b.traceHash;
        report.rows.push({ seed, current: a, baseline: b, identicalTrace: same, killDrift: +killDrift.toFixed(4) });
        console.log(`씨앗 ${seed}: 현재 ${a.waveReached}웨이브/목숨 ${a.lives}/처치 ${a.kills} · 기준 ${b.waveReached}웨이브/목숨 ${b.lives}/처치 ${b.kills} → ${same ? '완전 동일' : `처치 편차 ${(killDrift * 100).toFixed(1)}%`}`);
        // 난이도를 결정하는 값은 정확히 같아야 한다.
        assert.deepEqual(a.curve, b.curve, `씨앗 ${seed}: 웨이브 체력 곡선`);
        assert.equal(a.drawHash, b.drawHash, `씨앗 ${seed}: 뽑기 결과 순서 (등급·눈)`);
        assert.equal(a.drawCount, b.drawCount, `씨앗 ${seed}: 뽑기 횟수`);
        // 런 결과도 같아야 한다. 프레임 단위 타이밍은 미세하게 어긋날 수 있어 처치 수만 여유를 둔다.
        assert.equal(a.waveReached, b.waveReached, `씨앗 ${seed}: 도달 웨이브`);
        assert.equal(a.lives, b.lives, `씨앗 ${seed}: 남은 목숨`);
        assert.equal(a.phase, b.phase, `씨앗 ${seed}: 런 상태`);
        assert.ok(killDrift < 0.02, `씨앗 ${seed}: 처치 수 편차 ${(killDrift * 100).toFixed(1)}% (허용 2%)`);
        assert.ok(a.drawCount > 0 && a.ticks > 100, `씨앗 ${seed}: 런이 실제로 진행되어야 한다`);
      }
      assert.deepEqual(rows.errors, [], '브라우저 오류');
      // 클리어 판정은 두 리비전에서 다르다 (기준: 101 진입 = 클리어 / 현재: 101 완주 = 클리어).
      // 의도된 변경이므로 여기서 고정해 두고, 다시 바뀌면 이 검사가 잡는다.
      report.clearRule = await cur.page.evaluate(() => {
        DKlobby(); DKstartInf('clear'); DK.paused = true;
        DK.wave = 101; DK.inf.doneW = 100;
        const onEnter = DK.inf.cleared;
        DK.inf.doneW = 101;
        return { line: DK.inf.clearWave, clearedOnEntering101: !!onEnter };
      });
      assert.deepEqual(report.clearRule, { line: 101, clearedOnEntering101: false }, '현재 규칙: 101웨이브를 완주해야 클리어');
      report.pass = true;
    } finally { await cur.context.close(); await base.context.close(); }
  } finally {
    report.finished = new Date().toISOString();
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log('PASS 순수운빨 난이도 유지 —', SEEDS.length, '씨앗 ×', WAVES, '웨이브;', path.join(out, 'report.json'));
})().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
