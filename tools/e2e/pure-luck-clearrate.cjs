// 순수운빨(clear)의 절대 클리어율을 측정한다 — "기존과 같은가"(baseline)가 아니라 "몇 %인가".
// 씨앗을 바꿔가며 101웨이브 완주까지 런을 끝까지 돌리고, 완주한 비율을 센다.
//   E2E_BASE_URL=http://localhost:8137/ node tools/e2e/pure-luck-clearrate.cjs [--runs=40] [--policy=greedy|naive] [--seed0=1]
//
// 클리어율은 '봇의 실력'에 딸린 값이다. 사람의 클리어율이 아니라, 아래 정책으로 두는 봇의 클리어율이다.
//   naive  — 빈 자리에 놓고, 자리가 없으면 같은 눈에만 합친다. 판매를 못 해 판이 차면 멈춘다(기존 대조 봇).
//   greedy — 합체 우선 → 빈 자리 → 판이 차면 가장 약한 타워를 팔고 더 센 눈을 놓는다. 못 놓을 약한 눈은 바로 판다.
//   player — greedy 에 더해 골드를 파워업(6눈이 7★+ 전부를 올린다)과 확률강화에 먼저 쓴다. 게임이 의도한 수단을 다 쓴다.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');

const repo = path.resolve(__dirname, '../..');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/pure-luck-clearrate'));
const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1];
const RUNS = Number(arg('runs')) || 40;
const SEED0 = Number(arg('seed0')) || 1;
const POLICIES = (arg('policy') || 'greedy,naive').split(',').filter(Boolean);
const TUNE = { reserve: Number(arg('reserve')) || 3, enhMax: Number(arg('enhmax')) || 10, powerFirst: arg('powerfirst') === '1' };
// 밸런스 손잡이를 측정 시점에만 덮어쓴다 (content.js 는 건드리지 않는다). 미지정이면 저장소 값 그대로.
const LATE_EXP = arg('lateexp') ? Number(arg('lateexp')) : null;
const BOSS_LIMIT = arg('bosslimit') ? Number(arg('bosslimit')) : null;   // 보스 제한시간(초)
const HP_EXP = arg('hpexp') ? Number(arg('hpexp')) : null;               // 기본 체력 곡선의 밑 (저장소 값 1.08)
const LATE_FROM = arg('latefrom') ? Number(arg('latefrom')) : null;      // 후반 곡선이 걸리기 시작하는 웨이브 (저장소 값 90)
const CLEAR_WAVE = 101;
const base = (process.env.E2E_BASE_URL || 'http://localhost:8137/').replace(/\/?$/, '/');
fs.mkdirSync(out, { recursive: true });

// ── 페이지 안에서 도는 봇 ────────────────────────────────────────────────
// 게임의 공개 훅(DKchest/DKplace/판매 버튼)만 쓴다. 규칙(7★ 이상 판매 불가 등)은 게임 코드가 그대로 판정한다.
function playRun({ seed, policy, clearWave, tune, lateExp, bossLimit, hpExp, lateFrom }) {
  tune = tune || { reserve: 3, enhMax: 10, powerFirst: false };
  if (lateExp != null) DKCONTENT.INFINITY.lateExp = lateExp;         // 후반 곡선의 밑 (1 미만이면 감산)
  if (lateFrom != null) DKCONTENT.INFINITY.lateFrom = lateFrom;      // 후반 곡선 시작 웨이브
  if (bossLimit != null) DKCONTENT.INFINITY.bossTimeLimit = bossLimit; // 보스 제한시간
  if (hpExp != null && !DKCONTENT.INFINITY.__hpExpPatched) {           // 기본 체력 곡선의 밑만 갈아끼운다
    const INF = DKCONTENT.INFINITY, orig = INF.wave;
    INF.__hpExpPatched = 1;
    INF.wave = function (w, gauntlet) {
      const r = orig.call(this, w, gauntlet);
      const late = gauntlet && w > this.lateFrom ? Math.pow(this.lateExp, w - this.lateFrom) : 1;
      r.hpMult = +Math.min(1e120, 1.8 * Math.pow(hpExp, w - 1) * late).toFixed(3);
      return r;
    };
  }
  DKSAVE.progression = DKPROGRESSION.defaultProfile();   // 갓 시작한 무과금 계정
  DKSAVE.gems = 0;
  globalThis.__pureSeed(seed);
  DKstartInf('clear');
  DK.paused = true;                                       // rAF 를 멈추고 아래에서 고정 dt 로 직접 돌린다

  const DT = 1 / 60, MAX_TICKS = 1500000;                 // 게임 내 약 7시간 — 101웨이브에 충분한 여유
  const N = __pureQA.SPOTS().length;
  const emptySpot = () => { for (let i = 0; i < N; i++) if (!__pureQA.towerAt(i)) return i; return -1; };
  const weakestSellable = () => {                          // 인피니티는 7★ 이상 판매 불가
    let w = null;
    for (const t of DK.towers) if (t.face < 7 && (!w || t.face < w.face || (t.face === w.face && t.lvl < w.lvl))) w = t;
    return w;
  };
  const clickSell = el => { const b = document.getElementById(el); if (!b) return false; b.disabled = false; b.click(); return true; };
  const sellTower = t => { DK.selTower = t; clickSell('sell-btn'); DK.selTower = null; };
  const CHEST = 160;                                       // 상자 값은 고정 (INFINITY.chest.cost)
  const powerCost = lv => 150 + 150 * lv;                  // DICE_POWER.cost
  const enhCost = f => Math.round((160 + 90 * f) / 10) * 10;
  let powerUps = 0, enhanced = 0, enhBoom = 0;

  // 손에 든 눈을 처리한다. true = 손이 비었다(계속 진행 가능), false = 어떻게 해도 못 놓는다.
  const resolveHeld = () => {
    const f = DK.heldDie;
    if (!f) return true;
    let merge = null;                                      // 1) 같은 눈 합체 (레벨 높은 쪽부터 — 3레벨을 빨리 만든다)
    for (const t of DK.towers) if (t.face === f && t.lvl < 3 && (!merge || t.lvl > merge.lvl)) merge = t;
    if (merge && DKplace(merge.spot) !== false) return true;
    const spot = emptySpot();                              // 2) 빈 석단
    if (spot >= 0 && DKplace(spot) !== false) return true;
    if (policy === 'naive') return false;                  // 기존 대조 봇은 여기서 멈춘다
    const weak = weakestSellable();                        // 3) 판이 찼다 — 더 센 눈이면 약한 타워를 판다
    if (weak && f > weak.face) {
      sellTower(weak);
      const freed = emptySpot();
      if (freed >= 0 && DKplace(freed) !== false) return true;
    }
    if (f < 7) { clickSell('held-sell'); return !DK.heldDie; }   // 4) 약한 눈은 바로 판다
    return false;                                          // 7★ 이상인데 판이 꽉 찬 교착 (게임 규칙상 사람도 같다)
  };
  // 판이 전부 3레벨로 차면 뽑기 자체가 막힌다(canPlaceAnywhere). 약한 타워를 하나 팔아 자리를 낸다.
  const makeRoom = () => {
    if (policy === 'naive' || emptySpot() >= 0 || DK.towers.some(t => t.lvl < 3)) return;
    const weak = weakestSellable();
    if (weak) sellTower(weak);
  };

  // player 정책: 뽑기보다 먼저 골드를 쓰는 곳. 게임이 이미 갖춘 수단만 쓴다.
  //  1) 6눈 파워업 — powerLv 가 7★ 이상을 6눈 트랙에 묶어 두므로, 판의 강한 타워 전부가 같이 세진다.
  //  2) 확률강화 — 레벨을 유지한 채 눈이 오른다. 눈이 낮을수록 싸고 성공률이 높아 낮은 눈부터 올린다.
  //  3) 남은 골드로 상자.
  const doEnhance = () => {
    // 확률강화: 레벨을 유지한 채 눈이 오르고, 눈 피해는 1.28^k 로 지수 성장한다. 낮은 눈일수록 싸고 안전하다.
    for (let g = 0; g < 20; g++) {
      let pick = null;
      for (const t of DK.towers) if (t.lvl === 3 && t.face <= tune.enhMax && (!pick || t.face < pick.face)) pick = t;
      if (!pick || DK.gold < enhCost(pick.face) + CHEST) break;
      DK.selTower = pick;
      const before = DK.towers.length;
      const r = DKenhance();
      DK.selTower = null;
      if (!r) break;
      enhanced++;
      if (DK.towers.length < before) enhBoom++;
    }
  };
  const doPower = () => {
    // 6눈 트랙이 7★ 이상 전부를 올린다 (powerLv 가 face>6 을 6눈에 묶는다). Lv10 이면 피해 2.5배.
    for (let g = 0; g < 40; g++) {
      const lv6 = DK.inf.power[6] || 0;
      if (lv6 < 10 && DK.gold >= powerCost(lv6) + CHEST * tune.reserve) { if (DKupgrade(6) === false) break; powerUps++; continue; }
      break;
    }
    for (let f = 1; f <= 5; f++) {
      if (!DK.towers.some(t => t.face === f && t.lvl === 3)) continue;
      for (let g = 0; g < 20; g++) {
        const lv = DK.inf.power[f] || 0;
        if (lv < 10 && DK.gold >= powerCost(lv) + CHEST * tune.reserve * 3) { if (DKupgrade(f) === false) break; powerUps++; continue; }
        break;
      }
    }
  };
  const investGold = () => {
    if (policy !== 'player') return;
    if (tune.powerFirst) { doPower(); doEnhance(); } else { doEnhance(); doPower(); }
  };

  let ticks = 0, sold = 0, stuck = 0;
  const goldBefore = () => DK.gold;
  while (DK.phase === 'playing' && !DK.inf.cleared && DK.inf.doneW < clearWave && ticks < MAX_TICKS) {
    if (!DK.heldDie && DKSLOT.active) __pureQA.finishSlot();   // 보스 보상 대기열도 여기서 손에 온다
    if (DK.heldDie && !resolveHeld()) stuck++;
    makeRoom();
    investGold();
    let guard = 0;
    while (DK.phase === 'playing' && !DK.heldDie && DK.gold >= __pureQA.chestCost() && guard++ < 60) {
      const before = goldBefore();
      if (!DKchest()) break;
      __pureQA.finishSlot();
      if (!resolveHeld()) { stuck++; break; }
      if (DK.gold >= before) break;                            // 안전장치: 골드가 안 줄면 무한루프
      sold++;
    }
    if (!DK.waveActive && !DK.spawnQ.length && !DK.enemies.length) __pureQA.startWave();
    __pureQA.update(DT);
    ticks++;
  }
  const towers = DK.towers.map(t => `${t.face}★Lv${t.lvl}`).sort();
  return {
    seed, policy, lateExp: DKCONTENT.INFINITY.lateExp, lateFrom: DKCONTENT.INFINITY.lateFrom, bossLimit: DKCONTENT.INFINITY.bossTimeLimit, hpExp, ticks, cleared: !!DK.inf.cleared, doneW: DK.inf.doneW, wave: DK.wave,
    lives: DK.lives, kills: DK.inf.kills, chests: DK.inf.chests, phase: DK.phase, stuck,
    hitTickCap: ticks >= MAX_TICKS, heldStuck: DK.heldDie, towers,
    maxFace: DK.towers.reduce((m, t) => Math.max(m, t.face), 0),
    // 왜 끝났는가 — 보스 제한시간(320초) 초과 / 보스가 한계선 통과 / 목숨 소진
    reason: DK.inf.bossTimeout ? 'bossTimeout' : DK.inf.bossLeak ? 'bossLeak' : DK.inf.cleared ? 'cleared' : DK.lives <= 0 ? 'lives' : 'stopped',
    powerUps, enhanced, enhBoom, power: Object.assign({}, DK.inf.power), gold: Math.round(DK.gold),
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
    let state = 1;
    globalThis.__pureSeed = seed => { state = seed >>> 0; };
    Math.random = () => {                                   // mulberry32 — 씨앗 고정 난수
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
    assert.equal(original.split(anchor).length, 2, '테스트 훅 삽입 지점');
    const hook = 'window.__pureQA={update,finishSlot,startWave,chestCost,towerAt,SPOTS:()=>SPOTS};\n';
    await route.fulfill({ response, body: original.replace(anchor, hook + anchor) });
  });
  const url = new URL('index.html', base);
  url.searchParams.set('net', 'off');
  url.searchParams.set('v', Date.now());
  await page.goto(url.href);
  await page.waitForFunction(() => window.DK && DK.phase === 'title' && window.DKPROGRESSION, null, { timeout: 120000 });
  await page.click('#ov-btn');
  await page.evaluate(() => { DK.muted = true; });
  return { page, context };
}

const pct = (n, d) => d ? (100 * n / d) : 0;
function summarize(rows) {
  const n = rows.length, cleared = rows.filter(r => r.cleared).length;
  const waves = rows.map(r => r.doneW).sort((a, b) => a - b);
  const at = q => waves[Math.min(waves.length - 1, Math.floor(q * (waves.length - 1)))];
  // 이항 비율의 95% 신뢰구간 (Wilson) — 표본이 작을 때 정직하게 폭을 밝힌다
  const p = cleared / n, z = 1.96, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return {
    runs: n, cleared, clearRate: +pct(cleared, n).toFixed(1),
    ci95: [+Math.max(0, 100 * (c - half)).toFixed(1), +Math.min(100, 100 * (c + half)).toFixed(1)],
    waveMedian: at(0.5), waveMin: waves[0], waveMax: waves[waves.length - 1],
    waveP25: at(0.25), waveP75: at(0.75),
    mean: +(waves.reduce((s, w) => s + w, 0) / n).toFixed(1),
    stuckRuns: rows.filter(r => r.heldStuck).length, tickCapped: rows.filter(r => r.hitTickCap).length,
    reasons: rows.reduce((m, r) => (m[r.reason] = (m[r.reason] || 0) + 1, m), {}),
    // 어디서 죽는가 — 10웨이브 구간 분포
    histogram: Array.from({ length: 11 }, (_, i) => ({ upTo: i * 10 + 10, runs: waves.filter(w => w > i * 10 && w <= i * 10 + 10).length })).filter(b => b.runs),
  };
}

(async () => {
  const browser = await launchBrowser();
  const errors = [];
  const report = {
    scope: `순수운빨(clear) 절대 클리어율 측정. 봇 정책별 ${RUNS} 런 × 최대 ${CLEAR_WAVE}웨이브.`,
    caveat: '사람의 클리어율이 아니라 명시된 봇 정책의 클리어율이다. 확률강화(도박)는 쓰지 않는다.',
    base, runs: RUNS, seed0: SEED0, policies: POLICIES, clearWave: CLEAR_WAVE, lateExp: LATE_EXP, bossLimit: BOSS_LIMIT, hpExp: HP_EXP, lateFrom: LATE_FROM, tune: TUNE,
    started: new Date().toISOString(), byPolicy: {}, rows: [],
  };
  try {
    const { page, context } = await openGame(browser, errors);
    try {
      for (const policy of POLICIES) {
        const rows = [];
        for (let i = 0; i < RUNS; i++) {
          const seed = SEED0 + i * 7919;                    // 씨앗을 성기게 흩어 인접 씨앗의 상관을 피한다
          await page.evaluate(() => { try { DKlobby(); } catch (e) { /* 첫 런 */ } });
          const t0 = Date.now();
          const r = await page.evaluate(playRun, { seed, policy, clearWave: CLEAR_WAVE, tune: TUNE, lateExp: LATE_EXP, bossLimit: BOSS_LIMIT, hpExp: HP_EXP, lateFrom: LATE_FROM });
          r.ms = Date.now() - t0;
          rows.push(r); report.rows.push(r);
          console.log(`[${policy}] ${String(i + 1).padStart(3)}/${RUNS} 씨앗 ${seed} → ${r.cleared ? '클리어' : `${r.doneW}웨이브`} (${r.reason} · 상자 ${r.chests} · 최고 ${r.maxFace}★ · 파워업 ${r.powerUps} · 강화 ${r.enhanced}/소멸 ${r.enhBoom} · ${(r.ms / 1000).toFixed(1)}s)`);
        }
        report.byPolicy[policy] = summarize(rows);
        const s = report.byPolicy[policy];
        console.log(`\n== ${policy}: 클리어율 ${s.clearRate}% (${s.cleared}/${s.runs}, 95% 신뢰구간 ${s.ci95[0]}~${s.ci95[1]}%) · 중앙값 ${s.waveMedian}웨이브 ==\n`);
      }
      assert.deepEqual(errors, [], '브라우저 오류');
    } finally { await context.close(); }
  } finally {
    report.finished = new Date().toISOString();
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  for (const policy of POLICIES) {
    const s = report.byPolicy[policy];
    console.log(`${policy}: 클리어율 ${s.clearRate}% · 중앙값 ${s.waveMedian}웨이브 · 사분위 ${s.waveP25}~${s.waveP75} · 최고 ${s.waveMax}`);
  }
  console.log('보고서', path.join(out, 'report.json'));
})().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
