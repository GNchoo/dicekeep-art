// 주사위 손실 회귀: ① 굴리는 중 손패 보존 ② 보스 2마리 → 보상 2회 ③ 손에 든 채 보상 → 유지·배치 후 자동 굴림 ④ 굴리는 중 R 연타 → 골드 불변 ⑤ 큐는 굴림 성공 시에만 소비
const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 1240, height: 860 } })).newPage();
  const errs = []; const check = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) errs.push(m); };
  p.on('pageerror', e => check(false, 'pageerror ' + e.message));
  await p.goto('http://localhost:8137/index.html?unlock=all&net=off&v=' + Date.now());
  await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
  await p.evaluate(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
  await p.click('#ov-btn'); await sleep(300);
  await p.evaluate(() => { DKstartInf('endless'); DK.muted = true; DK.gold = 1e9; });
  await sleep(300);
  // ① 굴리는 중 다른 경로로 손패가 들어와도 덮어쓰지 않는다
  await p.evaluate(() => { DKchest(); DK.heldDie = 8; });
  await sleep(1800);
  const r1 = await p.evaluate(() => ({ held: DK.heldDie, slot: DKSLOT.active, final: DKSLOT.final }));
  check(r1.held === 8 && r1.slot === true, '① 손패 8 보존 · 슬롯 완성 대기 ' + JSON.stringify(r1));
  await p.evaluate(() => DKplace(0)); await sleep(1000);
  const r1b = await p.evaluate(() => ({ held: DK.heldDie, slot: DKSLOT.active, final: DKSLOT.final }));
  check(r1b.held === r1.final && !r1b.slot, '① 배치 후 굴린 결과가 손에 옴 ' + JSON.stringify(r1b));
  await p.evaluate(() => DKplace(1)); await sleep(300);
  // ④ 굴리는 중 R 연타 → 골드 불변, 큐 불변
  const r4 = await p.evaluate(async () => {
    DKchest(); const g = DK.gold, q = DKqueue().length;
    for (let i = 0; i < 5; i++) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
    DKchest(); DKchest();
    return { dg: DK.gold - g, dq: DKqueue().length - q, slot: DKSLOT.active };
  });
  check(r4.dg === 0 && r4.dq === 0 && r4.slot, '④ 굴리는 중 뽑기 차단 ' + JSON.stringify(r4));
  await sleep(1500); await p.evaluate(() => DKplace(2)); await sleep(300);
  // ③ 손에 든 채 보상 큐 → 손패 유지, 배치하면 자동 굴림
  await p.evaluate(() => { DKchest(); });
  await sleep(1500);
  const held3 = await p.evaluate(() => DK.heldDie);
  await p.evaluate(() => { DKqueue().push('d20'); });
  await sleep(600);
  const r3 = await p.evaluate(() => ({ held: DK.heldDie, slot: DKSLOT.active, q: DKqueue().length }));
  check(r3.held === held3 && !r3.slot && r3.q === 1, '③ 손패 유지·큐 대기 ' + JSON.stringify(r3));
  await p.evaluate(() => DKplace(3)); await sleep(1600);
  const r3b = await p.evaluate(() => ({ held: DK.heldDie, slot: DKSLOT.active, q: DKqueue().length }));
  check(r3b.held > 0 && r3b.q === 0, '③ 배치 후 큐가 굴러 손에 옴 ' + JSON.stringify(r3b));
  await p.evaluate(() => DKplace(4)); await sleep(300);
  // ⑤ 굴림이 실패하면 큐를 소비하지 않는다
  const r5 = await p.evaluate(async () => {
    DKqueue().push('d20'); const c = DKCONTENT.INFINITY.chest; DKCONTENT.INFINITY.chest = null;
    await new Promise(r => setTimeout(r, 300));
    const q = DKqueue().length; DKCONTENT.INFINITY.chest = c; return q;
  });
  check(r5 === 1, '⑤ 실패 시 큐 보존 (' + r5 + ')');
  await sleep(1600); await p.evaluate(() => { if (DK.heldDie) DKplace(5); }); await sleep(300);
  // ② 웨이브 20 보스 2마리 → 보상 2회
  await p.evaluate(() => { DK.wave = 19; DK.autoT = 0.01; DK.waveActive = false; });
  await p.waitForFunction(() => DK.wave === 20 && DK.enemies.filter(e => e.isBoss).length >= 2, null, { timeout: 30000 }).catch(() => check(false, '② 보스 2마리 스폰 안 됨'));
  const r2 = await p.evaluate(() => { const q0 = DKqueue().length, g0 = DK.gold; const bs = DK.enemies.filter(e => e.isBoss && !e.dead); const n = bs.length; for (const e of bs) DKdamage(e, 1e12); return { n, dq: DKqueue().length - q0, dg: DK.gold - g0, logs: DKlogs().slice(-2) }; });
  check(r2.n === 2 && r2.dq === 2, '② 보스 2마리 → 보상 2회 ' + JSON.stringify(r2));
  console.log('\n==== 실패 ' + errs.length + ' ====');
  await b.close(); process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
