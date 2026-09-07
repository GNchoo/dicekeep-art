// E11 새로고침 복귀: 대기실에서 새로고침 → 같은 방으로 / 플레이 중 새로고침 → 탈락(reload) 후 관전 복귀
const { chromium } = require('playwright-core');
const NET = process.env.NET || 'ws://localhost:8787';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errs = []; const check = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) errs.push(m); };
  const mk = async (tag, w, h) => { const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage(); p.on('pageerror', e => check(false, tag + ' pageerror ' + e.message)); return { ctx, p, tag }; };
  const boot = async (p, name) => { await p.goto(`http://localhost:8137/index.html?unlock=all&net=${encodeURIComponent(NET)}&name=${name}&v=${Date.now()}`); await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 }); await p.evaluate(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); }); await sleep(600); await p.click('#ov-btn'); await sleep(400); };
  const A = await mk('A', 1240, 860), B = await mk('B', 956, 440);
  await boot(A.p, 'A'); await boot(B.p, 'B');
  await A.p.evaluate(() => DKlobbyView('multi')); await A.p.click('#mp-create'); await A.p.waitForFunction(() => DK.phase === 'mpRoom', null, { timeout: 10000 });
  const code = await A.p.evaluate(() => DKNET.code);
  // 대기실 새로고침 복귀 (A)
  await A.p.reload(); await A.p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 }); await sleep(1500);
  await A.p.click('#ov-btn'); await sleep(800);
  const a1 = await A.p.evaluate(() => ({ phase: DK.phase, code: DKNET.code, state: DKNET.state, n: DKNET.members().length }));
  console.log('A after lobby reload', JSON.stringify(a1));
  check(a1.phase === 'mpRoom' && a1.code === code && a1.state === 'lobby', 'A 대기실 새로고침 → 같은 방 복귀');
  // B 참가, 시작
  await B.p.evaluate(() => DKlobbyView('multi')); await B.p.click('#mp-join'); await B.p.fill('#mp-code', code); await B.p.click('#mp-join-go');
  await B.p.waitForFunction(() => DK.phase === 'mpRoom', null, { timeout: 10000 }); await sleep(500);
  await A.p.click('#mp-start');
  for (const x of [A, B]) await x.p.waitForFunction(() => DK.phase === 'playing' && DK.net && DK.net.t0 != null, null, { timeout: 10000 });
  await B.p.waitForFunction(() => DK.wave >= 2, null, { timeout: 60000 });
  await sleep(2500); // sum 이 dk_mp_run 을 저장할 시간
  const gems0 = await B.p.evaluate(() => DKSAVE.gems);
  // 플레이 중 새로고침 (B)
  await B.p.reload(); await B.p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 }); await sleep(1500);
  await B.p.click('#ov-btn'); await sleep(1500);
  const b1 = await B.p.evaluate(() => ({ phase: DK.phase, state: DKNET.state, status: DK.net && DK.net.status, spec: !document.getElementById('spectate').classList.contains('hidden'), run: DKSAVE.infRuns[0], gems: DKSAVE.gems, title: document.getElementById('spec-title').textContent }));
  console.log('B after play reload', JSON.stringify(b1));
  check(b1.phase === 'spectate' && b1.spec && b1.status === 'dead', 'B 플레이 중 새로고침 → 탈락 후 관전');
  check(b1.run && b1.run.mp === 1 && b1.run.wave >= 1, 'B 기록 저장 (wave ' + (b1.run && b1.run.wave) + ')');
  const badge = await A.p.evaluate((pid) => { const c = document.querySelector(`.rival[data-pid="${pid}"] .rv-badge`); return c && c.textContent; }, await B.p.evaluate(() => DKNET.me.pid));
  check(/💀/.test(badge || ''), 'A 카드에 B 💀 (' + badge + ')');
  // A 혼자 남아 계속 진행하는지
  const w0 = await A.p.evaluate(() => DK.wave); await sleep(5000); const w1 = await A.p.evaluate(() => DK.wave);
  check(w1 >= w0 && await A.p.evaluate(() => DK.phase === 'playing'), 'A 혼자 남아도 계속 진행 ' + w0 + '→' + w1);
  // 탭 복제(같은 좌석) 흉내: 같은 sessionStorage 로 새 페이지 → 앞 탭 4001
  await B.p.screenshot({ path: 'mp-B-reload-spectate.png' });
  await A.p.screenshot({ path: 'mp-A-solo.png' });
  console.log('\n==== 실패 ' + errs.length + ' ====');
  await b.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
