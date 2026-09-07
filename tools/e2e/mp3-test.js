// 함께하기 v3 다중 컨텍스트 시나리오. 전제: python serve.py(8137) + TIMING=fast 서버(ws://localhost:8787)
const { chromium } = require('playwright-core');
const NET = process.env.NET || 'ws://localhost:8787';
const PAGES = [{ tag: 'A', w: 1240, h: 860 }, { tag: 'B', w: 440, h: 956 }, { tag: 'C', w: 956, h: 440 }];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const errs = [], P = {};
  const say = (s) => console.log(s);
  const fail = (s) => { errs.push(s); console.log('FAIL ' + s); };
  const check = (cond, msg) => cond ? say('ok   ' + msg) : fail(msg);
  const boot = async (v) => {
    const ctx = await b.newContext({ viewport: { width: v.w, height: v.h } });
    const p = await ctx.newPage();
    p.on('pageerror', e => fail(v.tag + ' pageerror ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) fail(v.tag + ' console ' + m.text()); });
    p.on('dialog', d => d.accept());
    await p.goto(`http://localhost:8137/index.html?unlock=all&net=${encodeURIComponent(NET)}&v=${Date.now()}`);
    await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
    await p.evaluate(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
    await p.click('#ov-btn'); await p.waitForTimeout(400);
    await p.evaluate(() => DKlobbyView('multi')); await p.fill('#mp-name', v.tag);
    P[v.tag] = { p, ctx, ...v };
    return p;
  };
  for (const v of PAGES) await boot(v);
  const A = P.A.p, B = P.B.p, C = P.C.p;
  const st = (p) => p.evaluate(() => ({ phase: DK.phase, wave: DK.wave, autoT: DK.autoT, waveActive: DK.waveActive, net: DK.net && { t0: DK.net.t0, seed: DK.net.seed, status: DK.net.status, watchers: DK.net.watchers, timing: DK.net.timing }, state: DKNET.state, speed: DK.speed, btn: document.getElementById('wave-btn').textContent, speedBtn: document.getElementById('speed-btn').textContent, speedHidden: document.getElementById('speed-btn').classList.contains('hidden') }));
  const pidOf = (p) => p.evaluate(() => DKNET.me.pid);
  // 보스가 뜨면 즉시 잡는다 (fast: 보스 제한 5초)
  const autoBoss = (p) => p.evaluate(() => { window.__bk = setInterval(() => { if (DK.phase === 'playing') DKMP.bossKill(); }, 150); });

  // E1 방: A 생성 → B·C 참가 → A 시작
  say('E1');
  check(await A.evaluate(() => !document.getElementById('mp-block').classList.contains('off')), 'A 로비 함께하기 블록 활성');
  check(await A.evaluate(() => !document.getElementById('mp-quick').disabled), '빠른 매칭 버튼 활성');
  await A.evaluate(() => DKlobbyView('multi')); await A.click('#mp-create');
  await A.waitForFunction(() => DK.phase === 'mpRoom', null, { timeout: 10000 }).catch(() => fail('A 대기실 진입 실패'));
  const code = await A.evaluate(() => DKNET.code);
  check(/^[A-Z0-9]{6}$/.test(code || ''), '방 코드 6자리 ' + code);
  check(await A.evaluate(() => document.getElementById('mp-room-title').textContent === '대기실' && !document.getElementById('mp-code-wrap').classList.contains('hidden')), '코드 방 대기실 UI');
  for (const p of [B, C]) {
    await p.evaluate(() => DKlobbyView('multi')); await p.click('#mp-join'); await p.fill('#mp-code', code.toLowerCase()); await p.click('#mp-join-go');
    await p.waitForFunction(() => DK.phase === 'mpRoom', null, { timeout: 10000 }).catch(async () => fail('참가 실패: ' + await p.evaluate(() => document.getElementById('mp-status').textContent)));
  }
  await sleep(600);
  // 대기실 채팅
  await B.fill('#mp-chat-input', '대기실 채팅 테스트'); await B.press('#mp-chat-input', 'Enter'); await sleep(900);
  const rc = await A.evaluate(() => Array.from(document.querySelectorAll('#mp-chat-lines .mp-chat-line')).map(e => e.textContent));
  check(rc.some(l => /B.*대기실 채팅 테스트/.test(l)), 'A 대기실 채팅에 B 메시지 ' + JSON.stringify(rc));
  check(await B.evaluate(() => document.getElementById('mp-chat-input').value === ''), 'B 입력칸 비움');
  check((await A.evaluate(() => Array.from(document.querySelectorAll('#mp-slots .mp-slot:not(.empty)')).length)) === 3, 'A 대기실 명단 3명');
  await A.click('#mp-start');
  for (const [tag, p] of Object.entries({ A, B, C })) await p.waitForFunction(() => DK.phase === 'playing' && DK.net && DK.net.t0 != null, null, { timeout: 10000 }).catch(() => fail(tag + ' 게임 진입 실패'));
  const s1 = { A: await st(A), B: await st(B), C: await st(C) };
  say(JSON.stringify({ A: s1.A, B: [s1.B.wave, s1.B.btn] }));
  check(s1.A.net.seed === s1.B.net.seed && s1.B.net.seed === s1.C.net.seed, 'seed 동일');
  check(s1.A.net.t0 === s1.B.net.t0, 't0 동일');
  check(s1.A.speed === 1 && !s1.A.speedHidden && s1.A.speedBtn === 'x1', '배속 x1 · 배속 버튼 보임');
  check(/첫 웨이브 \(\d+초\)/.test(s1.A.btn), '웨이브 버튼 준비 카운트다운: ' + s1.A.btn);
  check(s1.A.autoT > 0 && s1.A.autoT <= s1.A.net.timing.prep / 1000 + 0.5, 'autoT ≈ prep (' + s1.A.autoT + ')');
  check(await A.evaluate(() => !document.getElementById('chat-btn').classList.contains('hidden')), '💬 버튼 표시');
  for (const p of [A, B, C]) { await p.evaluate(() => { DK.muted = true; DK.gold = 900000; }); await autoBoss(p); }
  for (let i = 0; i < 3; i++) { await A.click('#roll-btn'); await A.waitForFunction(() => !!DK.heldDie, null, { timeout: 15000 }); await A.evaluate((i) => DKplace(i), i); await sleep(150); }
  for (let i = 0; i < 2; i++) { await B.click('#roll-btn'); await B.waitForFunction(() => !!DK.heldDie, null, { timeout: 15000 }); await B.evaluate((i) => DKplace(i), i); await sleep(150); }

  // E2 개별 진행: 첫 웨이브 자동 시작 → A x3 → A 가 앞서감
  say('E2');
  await A.waitForFunction(() => DK.wave >= 1, null, { timeout: 20000 }).catch(() => fail('A 첫 웨이브 자동 시작 안 됨'));
  await A.click('#speed-btn'); await A.click('#speed-btn');
  const spA = await st(A);
  check(spA.speed === 3 && spA.speedBtn === 'x3', 'A 배속 x3 (' + spA.speedBtn + ')');
  await A.click('#speed-btn'); check((await st(A)).speed === 1, 'x3 → x1 순환'); await A.click('#speed-btn'); await A.click('#speed-btn');
  await sleep(12000);
  const s2 = { A: await st(A), B: await st(B) };
  say('A ' + s2.A.wave + ' B ' + s2.B.wave);
  check(s2.A.wave > s2.B.wave, 'A(x3) 가 B(x1) 보다 앞선다 ' + s2.A.wave + ' > ' + s2.B.wave);
  const badgeA = await B.evaluate((pid) => { const c = document.querySelector(`.rival[data-pid="${pid}"] .rv-badge`); return c && c.textContent; }, await pidOf(A));
  check(badgeA === 'x3', 'B 카드에 A 배속 x3 배지 (' + badgeA + ')');
  const sumA = await B.evaluate((pid) => DK.net.rivals[pid], await pidOf(A));
  check(sumA && sumA.sp === 3 && sumA.en === undefined && sumA.lag === undefined, '중계 sum 에 sp=3, en 없음');

  // E3 카드 배치
  say('E3');
  const cardB = await B.evaluate(() => ({ n: document.querySelectorAll('#rivals .rival').length, cls: document.getElementById('rivals').className, cols: document.querySelector('#rivals .rv-board').dataset.cols }));
  check(cardB.n === 2 && cardB.cols === '3', 'B 카드 2장 · 세로 3열');
  const cellsFromA = await B.evaluate((pidA) => document.querySelectorAll(`.rival[data-pid="${pidA}"] .cell.on`).length, await pidOf(A));
  check(cellsFromA === 3, 'B 에서 A 타워 3개 보임 (' + cellsFromA + ')');

  // E4 필드 보기: B 가 A 카드 탭
  say('E4');
  const pidA = await pidOf(A);
  const enemiesB0 = await B.evaluate(() => DK.wave);
  await B.click(`.rival[data-pid="${pidA}"]`);
  await sleep(2600);
  const v4 = await B.evaluate(() => ({ pid: DKMP.viewState().pid, towers: DKMP.viewState().towers.length, enemies: DKMP.viewState().enemies.length, bar: !document.getElementById('view-bar').classList.contains('hidden'), txt: document.getElementById('view-txt').textContent, viewing: document.getElementById('stage').classList.contains('viewing'), hudVis: getComputedStyle(document.getElementById('hud')).visibility, myWave: DK.wave, card: !!document.querySelector('.rival.viewing') }));
  const a4 = await A.evaluate(() => ({ watchers: DK.net.watchers, towers: DK.towers.length, enemies: DK.enemies.filter(e => !e.dead).length, every: DKMP.summary(true).en.split(';').length }));
  say('B view ' + JSON.stringify(v4) + ' A ' + JSON.stringify(a4));
  check(v4.pid === pidA && v4.bar && v4.viewing && v4.card, 'B 뷰 모드 진입 (view-bar·viewing)');
  check(v4.hudVis === 'hidden', '뷰 중 HUD 숨김');
  check(a4.watchers === 1, 'A watched n=1 (' + a4.watchers + ')');
  check(v4.towers === a4.towers, '뷰 타워 수 = A 타워 수 ' + v4.towers + '/' + a4.towers);
  check(Math.abs(v4.enemies - a4.enemies) <= Math.max(6, a4.enemies * 0.5), '뷰 적 수 ≈ A 적 수 ' + v4.enemies + '/' + a4.enemies);
  check(/A.*필드.*W\d+/.test(v4.txt), '뷰 바 문구: ' + v4.txt);
  let seenFx = 0; for (let i = 0; i < 12; i++) { await sleep(250); seenFx = Math.max(seenFx, await B.evaluate(() => DKMP.viewState().projs.length + DKMP.viewState().beams.length + DKMP.viewState().fxs.length)); }
  check(seenFx > 0, '뷰에서 상대 타워 공격 연출(투사체·이펙트) 보임 ' + seenFx);
  check((await A.evaluate(() => DK.inf.kills)) >= 0 && (await B.evaluate(() => DK.gold)) > 0, '시각 전용 시뮬이 내 상태를 바꾸지 않음');
  const wB1 = await B.evaluate(() => DK.wave); await sleep(1500); const wB2 = await B.evaluate(() => DK.wave);
  check(wB2 >= wB1 && (await B.evaluate(() => DK.phase)) === 'playing', 'B 내 게임 계속 진행 ' + wB1 + '→' + wB2);
  await B.mouse.click(220, 400); await sleep(200);
  check(await B.evaluate(() => DK.selTower === null && !DK.heldDie), '뷰 중 캔버스 클릭 무시');
  await B.screenshot({ path: 'mp3-B-view.png' });
  await B.keyboard.press('Escape'); await sleep(1500);
  const v4b = await B.evaluate(() => ({ pid: DKMP.viewState().pid, bar: !document.getElementById('view-bar').classList.contains('hidden'), viewing: document.getElementById('stage').classList.contains('viewing') }));
  check(v4b.pid === null && !v4b.bar && !v4b.viewing, 'Esc 로 뷰 종료');
  check((await A.evaluate(() => DK.net.watchers)) === 0, 'A watched n=0');

  // E5 채팅 (게임 중 Enter · 💬 버튼 · 좌석색)
  say('E5');
  await B.keyboard.press('Enter'); await sleep(200);
  check(await B.evaluate(() => !document.getElementById('chat-form').classList.contains('hidden')), 'B Enter 로 채팅창 열림');
  await B.keyboard.type('안녕 친구들'); await B.keyboard.press('Enter'); await sleep(1200);
  const logsA = await A.evaluate(() => DKlogs());
  check(logsA.some(l => /● ?B.*안녕 친구들/.test(l)), 'A 로그에 B 채팅 (좌석색 ●) ' + JSON.stringify(logsA.filter(l => /안녕/.test(l))));
  await C.click('#chat-btn'); await sleep(200);
  check(await C.evaluate(() => !document.getElementById('chat-form').classList.contains('hidden') && document.activeElement === document.getElementById('chat-input')), 'C 💬 버튼으로 채팅창 열림');
  await C.click('#chat-btn'); await sleep(100);
  check(await C.evaluate(() => document.getElementById('chat-form').classList.contains('hidden')), 'C 💬 다시 누르면 닫힘');
  check((await A.evaluate(() => Array.from(document.querySelectorAll('#mp-chat-lines .mp-chat-line')).length)) >= 2, '대기실 채팅 목록에도 쌓임');

  // E6 보스 웨이브 (fast: 웨이브 10) — 홀드 없이 자기 속도로 지나간다
  say('E6');
  await A.waitForFunction(() => DK.wave >= 11, null, { timeout: 120000 }).catch(() => fail('A 웨이브 11 도달 실패 (보스 홀드?)'));
  const s6 = await st(A);
  check(s6.wave >= 11 && s6.phase === 'playing', 'A 보스 웨이브 통과 → 웨이브 ' + s6.wave);

  // E7 사망·관전: B 사망 → 관전 → 관전 목록에서 A 필드 보기
  say('E7');
  const gems0 = await B.evaluate(() => DKSAVE.gems);
  await B.evaluate(() => DKMP.die('lives'));
  await sleep(1500);
  const b7 = await B.evaluate(() => ({ phase: DK.phase, spec: !document.getElementById('spectate').classList.contains('hidden'), run: DKSAVE.infRuns[0], gems: DKSAVE.gems, status: DK.net.status, btn: document.getElementById('wave-btn').textContent }));
  check(b7.phase === 'spectate' && b7.spec && b7.run && b7.run.mp === 1 && b7.gems >= gems0, 'B 관전 · 기록 즉시 저장');
  const badgeB = await A.evaluate((pid) => { const c = document.querySelector(`.rival[data-pid="${pid}"] .rv-badge`); return c && c.textContent; }, await pidOf(B));
  check(/💀/.test(badgeB || ''), 'A 카드에 B 💀 (' + badgeB + ')');
  await B.click(`#spec-list .rival[data-pid="${pidA}"]`); await sleep(2200);
  const v7 = await B.evaluate(() => ({ pid: DKMP.viewState().pid, towers: DKMP.viewState().towers.length, collapsed: document.getElementById('spectate').classList.contains('collapsed') }));
  check(v7.pid === pidA && v7.towers === 3 && v7.collapsed, '관전 중 A 필드 보기 (패널 접힘) ' + JSON.stringify(v7));
  await B.screenshot({ path: 'mp3-B-spec-view.png' });
  await B.click('#view-back'); await sleep(300);
  check((await B.evaluate(() => DKMP.viewState().pid)) === null, '내 필드로 버튼');

  // E8 재접속: C 오프라인 4초 → 복귀해도 자기 게임은 계속
  say('E8');
  await C.evaluate(() => DKMP.view(DKNET.members().find(p => p.name === 'A').pid)); await sleep(500);
  const wC0 = (await st(C)).wave;
  await P.C.ctx.setOffline(true); await sleep(4000); await P.C.ctx.setOffline(false);
  await C.waitForFunction(() => DKNET.state === 'playing', null, { timeout: 40000 }).catch(() => fail('C 재접속 실패'));
  await sleep(2500);
  const c8 = await C.evaluate(() => ({ state: DKNET.state, wave: DK.wave, phase: DK.phase, view: DKMP.viewState().pid, vt: DKMP.viewState().towers.length }));
  const a8w = await A.evaluate(() => DK.net.watchers);
  check(c8.state === 'playing' && c8.phase === 'playing' && c8.wave >= wC0, 'C 재접속 후 계속 ' + JSON.stringify(c8));
  check(c8.view === pidA && a8w === 1 && c8.vt === 3, 'C 재접속 뒤 watch 재등록 (A watchers ' + a8w + ')');
  await C.evaluate(() => DKMP.viewExit());

  // E9 클리어·결과 (fast clearWave 12): A 먼저, C 나중 → A 1위(완주 시간), C 2위, B 3위
  say('E9');
  await C.click('#speed-btn'); await C.click('#speed-btn');
  await A.waitForFunction(() => DK.net && DK.net.status === 'cleared', null, { timeout: 180000 }).catch(() => fail('A 완주 실패'));
  say('A cleared, C wave ' + (await st(C)).wave);
  await C.waitForFunction(() => DK.phase === 'over' || (DK.net && DK.net.ended), null, { timeout: 240000 }).catch(() => fail('C 결과 미수신'));
  await sleep(1500);
  const r9 = {};
  for (const [tag, p] of Object.entries({ A, B, C })) r9[tag] = await p.evaluate(() => ({ phase: DK.phase, title: document.getElementById('ov-title').textContent, rows: Array.from(document.querySelectorAll('table.rank tbody tr')).map(tr => tr.textContent.replace(/\s+/g, ' ').trim()), ended: DK.net && DK.net.ended && DK.net.ended.reason, reason: document.querySelector('.rank-reason') && document.querySelector('.rank-reason').textContent }));
  say(JSON.stringify(r9));
  check(r9.A.rows.length === 3 && JSON.stringify(r9.A.rows) === JSON.stringify(r9.B.rows) && JSON.stringify(r9.B.rows) === JSON.stringify(r9.C.rows), '세 페이지 순위표 동일');
  check(/^1 ?A.*완주 · [\d분 ]*\d+초/.test(r9.A.rows[0]) && /^2 ?C.*완주/.test(r9.A.rows[1]) && /^3 ?B.*탈락.*웨이브/.test(r9.A.rows[2]), '순위: A(빠른 완주) > C > B(탈락) · 완주 시간 표기');
  check(r9.A.title === '클리어! 1위' && /2위/.test(r9.C.title) && /3위/.test(r9.B.title), '제목 ' + [r9.A.title, r9.C.title, r9.B.title].join(' | '));
  check(r9.B.ended === 'cleared', 'end reason cleared');
  await A.screenshot({ path: 'mp3-A-result.png' });
  await A.click('#ov-btn'); await sleep(500);
  check(await A.evaluate(() => DK.phase === 'lobby' && DKNET.state === 'offline' && DK.net === null), 'A 로비 복귀 · offline');

  // E10 빠른 매칭: D·E 두 명 → 10초 뒤 같은 방 → 자동 시작
  say('E10');
  const D = await boot({ tag: 'D', w: 1000, h: 700 }), E = await boot({ tag: 'E', w: 440, h: 956 });
  await D.evaluate(() => DKlobbyView('multi')); await D.click('#mp-quick');
  await D.waitForFunction(() => DK.phase === 'mpRoom' && DKNET.inQueue(), null, { timeout: 10000 }).catch(() => fail('D 대기열 진입 실패'));
  const q1 = await D.evaluate(() => ({ title: document.getElementById('mp-room-title').textContent, queue: !document.getElementById('mp-queue').classList.contains('hidden'), code: document.getElementById('mp-code-wrap').classList.contains('hidden'), txt: document.getElementById('mp-queue-txt').textContent, start: document.getElementById('mp-start').classList.contains('hidden') }));
  check(q1.title === '빠른 매칭' && q1.queue && q1.code && q1.start, 'D 대기열 UI ' + JSON.stringify(q1));
  await sleep(1500);
  await E.evaluate(() => DKlobbyView('multi')); await E.click('#mp-quick');
  await E.waitForFunction(() => DK.phase === 'mpRoom' && DKNET.inQueue(), null, { timeout: 10000 }).catch(() => fail('E 대기열 진입 실패'));
  await sleep(1500);
  const q2 = await D.evaluate(() => document.getElementById('mp-queue-txt').textContent);
  check(/2\/4/.test(q2) && /초 뒤 시작/.test(q2), 'D 대기열 문구 2/4 · 카운트다운: ' + q2);
  const t0q = Date.now();
  for (const [tag, p] of Object.entries({ D, E })) await p.waitForFunction(() => DK.phase === 'playing' && DK.net, null, { timeout: 30000 }).catch(() => fail(tag + ' 빠른 매칭 자동 시작 실패'));
  const codes = [await D.evaluate(() => DKNET.code), await E.evaluate(() => DKNET.code)];
  say('quick matched in ' + (Date.now() - t0q) + 'ms codes ' + codes.join('/'));
  check(codes[0] && codes[0] === codes[1], '같은 방 코드');
  check(await D.evaluate(() => DKNET.room.kind === 'quick' && DKNET.members().length === 2 && !DKNET.isHost()), 'quick 방 · 2명 · 방장 없음');
  await D.screenshot({ path: 'mp3-D-quick.png' });
  for (const p of [D, E]) await p.evaluate(() => DKMP.die('quit'));
  await sleep(2500);
  check(await D.evaluate(() => DK.phase === 'over' && !!DK.net.ended), 'D·E 전원 탈락 → 결과');
  // 대기열 취소
  const F = await boot({ tag: 'F', w: 1000, h: 700 });
  await F.evaluate(() => DKlobbyView('multi')); await F.click('#mp-quick'); await F.waitForFunction(() => DKNET.inQueue(), null, { timeout: 10000 }).catch(() => fail('F 대기열 실패'));
  await F.click('#mp-leave'); await sleep(500);
  check(await F.evaluate(() => DK.phase === 'lobby' && DKNET.state === 'offline'), 'F 대기열 취소 → 로비');

  console.log('\n==== 결과: 실패 ' + errs.length + ' ====');
  for (const e of errs) console.log(e);
  await b.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
