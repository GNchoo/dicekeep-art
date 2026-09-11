// 순수운빨에서 "우리가 일부러 바꾼 것 말고는 아무것도 안 바뀌었다" 를 기준 리비전과 대조해 확인한다.
// 메운디에서 옮겨 온 표(뽑기 확률·타워·경제·로스터·상성표)는 한 톨도 달라지면 안 되고,
// 의도한 변경들(후반 체력 곡선, 보스 상성 면제, 상자 밴드, 태초 공속)은 정확히 그만큼만 달라야 한다.
//
// 뽑기 '순서' 는 더 이상 대조하지 않는다. 광역 명중 부호 수정(9b64b15) 으로 1~9웨이브에서
// 폭발 타워가 큰 적을 실제로 맞히게 되면서 처치 수가 늘었고(씨앗 20260909 에서 102 → 103),
// 골드가 달라져 상자를 사는 시점이 밀린다. 전투와 뽑기가 같은 난수 줄기를 쓰므로 그 뒤로는
// 등급 순서가 어긋나는 게 정상이다 — 확률 자체가 바뀐 게 아니다.
// 뽑기 확률은 chest 표(이식분 비교)와 chestFaceOdds(눈별 ppm)로 직접 고정하고,
// 광역 명중 동작 자체는 tools/e2e/splash-hit.cjs 가 실제 보스 웨이브로 따로 검증한다.
// 클리어율을 재는 도구가 아니다 — 그건 tools/e2e/pure-luck-clearrate.cjs 다.
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
const WAVES = Number((process.argv.find(a => a.startsWith('--waves=')) || '').split('=')[1]) || 9;
// 런 전체 대조는 보스가 끼는 순간부터 일부러 갈린다 (보스가 상성 없이 1배로 받게 바꿨다).
// 첫 보스는 10웨이브(bossEvery)이므로 그 앞 구간에서만 전투·뽑기·경제가 그대로임을 증명한다.
const TRACE_LIMIT = 9;
const SEEDS = [20260909, 777, 31337, 4242, 99999];
if (WAVES > TRACE_LIMIT) throw new Error(`--waves 는 ${TRACE_LIMIT} 이하여야 한다: 보스 웨이브부터는 기준 리비전과 일부러 다르다`);
fs.mkdirSync(out, { recursive: true });

const report = { scope: '메운디 이식분은 그대로인지, 의도한 변경만 갈리는지 기준 리비전과 대조. 절대 클리어율 측정이 아니다.', current: CURRENT, baseline: BASELINE, waves: WAVES, seeds: SEEDS, started: new Date().toISOString(), rows: [], pass: false };


// 메운디에서 옮겨 온 표들. 두 리비전에서 한 톨도 달라지면 안 된다.
// (상성표 자체도 여기 포함된다 — 바꾼 것은 "보스에게 적용하지 않는다" 이지 표가 아니다.)
function portedTables() {
  const INF = DKCONTENT.INFINITY, C = INF.chest, DP = DKCONTENT.DICE_POWER;
  const TD = window.DKTD || null;
  const bossWaves = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  return {
    // chest 의 sides 는 의도적으로 갈린다 (아래 '의도한 변경 ③'). 나머지는 그대로여야 한다.
    chest: { table: C.table, kinds: C.kinds, min: C.min, cost: C.cost(0), costLate: C.cost(50) },
    economy: { startGold: INF.startGold, lives: INF.lives, fieldCap: INF.fieldCap, capDmg: INF.capDmg,
               intermission: INF.intermission, bossEvery: INF.bossEvery, eliteEvery: INF.eliteEvery,
               bossTimeLimit: INF.bossTimeLimit, clearWave: INF.clearWave, rangeBonus: INF.rangeBonus },
    bossReward: bossWaves.map(w => INF.bossReward(w)),
    enhance: { maxFace: INF.enhance.maxFace, cost: [1, 6, 12, 19].map(f => INF.enhance.cost(f)),
               odds: [1, 6, 12, 19].map(f => INF.enhance.odds(f)) },
    power: DP ? { maxLv: DP.maxLv, cost: [0, 5, 9].map(l => DP.cost(l)), dmgMult: [0, 5, 10].map(l => DP.dmgMult(l)),
                  rangeAdd: [0, 5, 10].map(l => DP.rangeAdd(l)), special: DP.special } : null,
    towers: TD ? Array.from({ length: 20 }, (_, i) => i + 1).map(f => ({
      f, dmg: TD[f].dmg, rate: TD[f].rate, range: TD[f].range, atk: TD[f].atk || null, perk: TD[f].perk || null,
      splash: TD[f].splash || 0 })) : null,
    sizeMult: INF.sizeMult, sizeSeq: INF.sizeSeq.join(''),
    armor: [30, 33, 60, 66, 90, 99].map(w => INF.armor(w)),
    countOf: [1, 25, 50, 75, 101].map(w => INF.countOf(w, 'M')),
    roster: INF.getRoster().map(r => [r.id || null, r.cls, !!r.boss, !!r.tank]),
    // 곡선은 후반만 일부러 바꿨다 — 앞 구간은 여기서 같이 본다.
    curveEarly: [1, 10, 25, 40, 50, 60].map(w => INF.wave(w, true).hpMult),
  };
}

// 상자 한 개에서 각 눈이 나올 확률 — 등급 표와 등급별 주사위 범위에서 직접 계산한다.
function chestFaceOdds() {
  const C = DKCONTENT.INFINITY.chest;
  const p = f => {
    let acc = 0;
    for (const [k, w] of C.table) {
      const lo = C.min[k] || 1, hi = C.sides[k] || 6;
      if (f >= lo && f <= hi) acc += w / (hi - lo + 1);
    }
    return +(acc * 1e6).toFixed(2);   // ppm
  };
  return { sides: C.sides, f13: p(13), f17: p(17), f18: p(18), f19: p(19), f20: p(20) };
}

// 20★ 이 19★ 보다 1대1 피해가 센가 — towerDmg/towerRate 로 실제 값을 잰다.
function topDpsProbe() {
  if (!window.DKTD || !window.__pureQA || !__pureQA.towerDmg) return null;
  DKlobby(); DKstartInf('clear'); DK.paused = true;
  DK.inf.power[6] = 10;
  const dps = f => {
    const t = { face: f, def: DKTD[f], lvl: 1, spot: 0, x: 0, y: 0, cd: 0, skin: 0 };
    return Math.round(__pureQA.towerDmg(t) / __pureQA.towerRate(t));
  };
  return { f18: dps(18), f19: dps(19), f20: dps(20) };
}

// 보스가 상성을 받는가 — 이 리비전의 실제 동작을 damageEnemy 로 직접 확인한다.
function bossMatchupProbe() {
  if (!window.DKdamage || !window.DKTD) return null;
  DKstartInf ? DKstartInf('clear') : null;
  DK.paused = true;
  const hit = (isBoss, cls, face) => {
    const HP = 1e9, e = { hp: HP, max: HP, dead: false, armor: 0, sizeClass: cls, isBoss, stunT: 0, flashT: 0, gold: 0, def: { gold: 0 } };
    DKdamage(e, 1000, { def: DKTD[face], face });
    return +((HP - e.hp) / 1000).toFixed(4);
  };
  return { bossExpS: hit(true, 'S', 2), mobExpS: hit(false, 'S', 2), bossVibL: hit(true, 'L', 1), mobVibL: hit(false, 'L', 1) };
}

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
    // 순서 대조는 하지 않지만(머리말 참고) 원인을 읽으려면 남아 있어야 한다.
    draws, gradeHash: hash(draws.map(d => d[0]).join(',')),
    // 곡선 자체도 같이 기록해 둔다 (수치가 바뀌면 해시보다 원인을 읽기 쉽다).
    // 후반 곡선은 의도적으로 낮췄으므로 시작 웨이브 앞뒤를 나눠 기록한다.
    lateFrom: DKCONTENT.INFINITY.lateFrom, lateExp: DKCONTENT.INFINITY.lateExp,
    curveEarly: [1, 10, 25, 40, 50, 60].map(w => DKCONTENT.INFINITY.wave(w, true).hpMult),
    curveLate: [70, 80, 90, 100, 101].map(w => DKCONTENT.INFINITY.wave(w, true).hpMult),
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
    const hook = 'window.__pureQA={update,finishSlot,startWave,chestCost,towerAt,towerDmg,towerRate,SPOTS:()=>SPOTS};\n';
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
        console.log(`씨앗 ${seed}: 현재 ${a.waveReached}웨이브/목숨 ${a.lives}/처치 ${a.kills} · 기준 ${b.waveReached}웨이브/목숨 ${b.lives}/처치 ${b.kills} → ${same ? '완전 동일' : `처치 편차 ${(killDrift * 100).toFixed(1)}% (광역 수정 반영분)`}`);
        // 첫 보스(10웨이브) 앞 구간은 전투·뽑기·경제가 전부 그대로여야 한다.
        assert.deepEqual(a.curveEarly, b.curveEarly, `씨앗 ${seed}: ${a.lateFrom}웨이브까지의 체력 곡선`);
        assert.equal(a.drawCount, b.drawCount, `씨앗 ${seed}: 뽑기 횟수`);
        // 뽑은 눈이 그 등급의 밴드 안인지는 양쪽 다 구조적으로 성립해야 한다 (순서는 위 머리말 참고).
        const BAND = { d1: [1, 1], d4: [1, 4], d6: [1, 6], d8: [1, 8], d12: [1, 12], d20: [1, 20], epic: [14, 17], myth: [18, 19], primal: [20, 20] };
        a.draws.forEach(([kind, final], i) => assert.ok(BAND[kind] && final >= BAND[kind][0] && final <= BAND[kind][1],
          `씨앗 ${seed}: ${i}번째 뽑기 ${kind} 가 밴드 밖의 ${final} 을 뱉었다`));
        assert.equal(a.waveReached, b.waveReached, `씨앗 ${seed}: 도달 웨이브`);
        assert.equal(a.lives, b.lives, `씨앗 ${seed}: 남은 목숨`);
        assert.equal(a.phase, b.phase, `씨앗 ${seed}: 런 상태`);
        assert.ok(killDrift < 0.05, `씨앗 ${seed}: 처치 수 편차 ${(killDrift * 100).toFixed(1)}% (허용 5% — 광역 명중 수정으로 실제 전투가 달라진다)`);
        assert.ok(a.drawCount > 0 && a.ticks > 100, `씨앗 ${seed}: 런이 실제로 진행되어야 한다`);
        // 후반 곡선은 의도적으로 낮췄다. 공식과 맞는지, 그리고 반드시 가벼워졌는지 둘 다 본다.
        const LATE_WAVES = [70, 80, 90, 100, 101];
        assert.deepEqual(a.curveLate, LATE_WAVES.map(w => +Math.min(1e120, 1.8 * Math.pow(1.08, w - 1) * Math.pow(a.lateExp, Math.max(0, w - a.lateFrom))).toFixed(3)),
          `씨앗 ${seed}: 후반 체력 곡선이 lateFrom ${a.lateFrom} · lateExp ${a.lateExp} 공식과 일치`);
        a.curveLate.forEach((hp, i) => assert.ok(hp < b.curveLate[i],
          `씨앗 ${seed}: ${LATE_WAVES[i]}웨이브 체력이 기준(${b.curveLate[i]})보다 가벼워야 한다 — 현재 ${hp}`));
      }
      // ── 메운디 이식분: 두 리비전에서 완전히 같아야 한다 ─────────────────────
      const curTables = await cur.page.evaluate(portedTables);
      const baseTables = await base.page.evaluate(portedTables);
      report.tables = { current: curTables, baseline: baseTables };
      const keys = Object.keys(curTables).filter(k => curTables[k] !== null && baseTables[k] !== null);
      report.tableKeys = keys;
      assert.ok(keys.length >= 10, `대조한 표가 너무 적다 (${keys.length}종) — 훅이 빠졌는지 확인하라`);
      for (const k of keys) assert.deepEqual(curTables[k], baseTables[k], `메운디 이식분 "${k}" 가 기준 리비전과 달라졌다`);
      console.log(`이식분 ${keys.length}종 동일: ${keys.join(' · ')}`);

      // ── 의도한 변경 ①: 보스는 상성을 받지 않는다 (기준 리비전은 받는다) ──────
      const curProbe = await cur.page.evaluate(bossMatchupProbe);
      const baseProbe = await base.page.evaluate(bossMatchupProbe);
      report.bossMatchup = { current: curProbe, baseline: baseProbe };
      assert.deepEqual([curProbe.bossExpS, curProbe.bossVibL], [1, 1], '현재: 보스는 상성 배수를 받지 않는다');
      assert.deepEqual([curProbe.mobExpS, curProbe.mobVibL], [0.5, 0.25], '현재: 잡몹은 상성 배수를 그대로 받는다');
      assert.deepEqual([baseProbe.bossExpS, baseProbe.bossVibL], [0.5, 0.25], '기준: 보스도 상성을 받았다 (변경 전 동작 확인)');
      console.log(`보스 상성 — 기준 ${baseProbe.bossExpS}·${baseProbe.bossVibL} → 현재 ${curProbe.bossExpS}·${curProbe.bossVibL} (잡몹은 ${curProbe.mobExpS}·${curProbe.mobVibL} 그대로)`);

      // ── 의도한 변경 ③: 최상위가 더 흔했던 역전을 없앴다 (에픽 14~17 · 신화 18~19) ──
      const curOdds = await cur.page.evaluate(chestFaceOdds);
      const baseOdds = await base.page.evaluate(chestFaceOdds);
      report.chestFaceOdds = { current: curOdds, baseline: baseOdds };
      assert.deepEqual([baseOdds.sides.epic, baseOdds.sides.myth], [20, 20], '기준: 에픽·신화 주사위가 20까지 나왔다');
      assert.deepEqual([curOdds.sides.epic, curOdds.sides.myth], [17, 19], '현재: 에픽 14~17 · 신화 18~19');
      assert.ok(baseOdds.f20 > baseOdds.f19, `기준: 20★ 이 19★ 보다 흔했다 (${baseOdds.f20} > ${baseOdds.f19} ppm)`);
      assert.ok(curOdds.f20 < curOdds.f19 && curOdds.f19 <= curOdds.f17,
        `현재: 17★ ≥ 19★ > 20★ 순으로 희귀해야 한다 (${curOdds.f17} / ${curOdds.f19} / ${curOdds.f20} ppm)`);
      console.log(`상자 눈 확률(ppm) — 17★ ${curOdds.f17} · 18★ ${curOdds.f18} · 19★ ${curOdds.f19} · 20★ ${curOdds.f20} (기준 20★ ${baseOdds.f20})`);

      // ── 의도한 변경 ④: 태초(20★)가 1대1 피해에서도 가장 세다 ────────────────
      const curDps = await cur.page.evaluate(topDpsProbe);
      const baseDps = await base.page.evaluate(topDpsProbe);
      report.topDps = { current: curDps, baseline: baseDps };
      assert.ok(baseDps.f20 < baseDps.f19, `기준: 20★ 이 19★ 보다 약했다 (${baseDps.f20} < ${baseDps.f19})`);
      assert.ok(curDps.f20 > curDps.f19 && curDps.f19 > curDps.f18,
        `현재: 18★ < 19★ < 20★ 순으로 세야 한다 (${curDps.f18} / ${curDps.f19} / ${curDps.f20})`);
      console.log(`1대1 DPS — 18★ ${curDps.f18} · 19★ ${curDps.f19} · 20★ ${curDps.f20} (기준 20★ ${baseDps.f20})`);

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
  console.log('PASS 순수운빨 —', SEEDS.length, '씨앗 ×', WAVES, '웨이브 · 이식분 동일 · 의도한 변경만 갈림;', path.join(out, 'report.json'));
})().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
