// 놓인 타워 옮기기: 빈 석단 이동, 점유 석단 교환, 덱의 끌기 합성을 검사한다.
// 실제 포인터 이벤트로 조작한다 (내부 함수를 직접 부르지 않는다).
//   E2E_BASE_URL=http://localhost:8137/ node tools/e2e/tower-move.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');

const repo = path.resolve(__dirname, '../..');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/tower-move'));
const base = (process.env.E2E_BASE_URL || 'http://localhost:8137/').replace(/\/?$/, '/');
fs.mkdirSync(out, { recursive: true });
const report = { scope: '타워 이동·교환', base, checks: [], pass: false };
const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); report.checks.push({ name }); console.log('  PASS', name); };

// 석단 idx 의 화면 좌표
const spotClient = (page, idx) => page.evaluate(i => {
  const s = DKspots()[i], cv = document.getElementById('game'), r = cv.getBoundingClientRect();
  return { x: r.left + s[0] * r.width / cv.width, y: r.top + s[1] * r.height / cv.height };
}, idx);

async function longPress(page, from, opts = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(opts.hold == null ? 520 : opts.hold);
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
    const url = new URL('index.html', base);
    url.searchParams.set('net', 'off'); url.searchParams.set('v', '1');
    await page.goto(url.href);
    await page.waitForFunction(() => window.DK && DK.phase === 'title' && window.DKMOVE, null, { timeout: 120000 });
    await page.click('#ov-btn');
    // 0번 석단에 타워 하나를 놓고 시작한다 (게임의 실제 배치 경로를 쓴다)
    await page.evaluate(() => {
      DK.muted = true; DKstartInf('clear'); DK.paused = true;
      DK.gold = 99999; DK.heldDie = 4; DK.dieFocus = true;
      DKplace(0);
      DKsync();
    });
    const at = i => spotClient(page, i);
    const state = () => page.evaluate(() => ({
      towers: DK.towers.map(t => ({ spot: t.spot, face: t.face, lvl: t.lvl, moving: !!t.moving, x: Math.round(t.x), y: Math.round(t.y) })),
      lifted: !!DKMOVE.tower, over: DKMOVE.overSpot, from: DKMOVE.fromSpot,
    }));

    check('시작: 0번 석단에 타워 하나', (await state()).towers, [{ spot: 0, face: 4, lvl: 1, moving: false, x: (await state()).towers[0].x, y: (await state()).towers[0].y }]);

    // ── 1. 잠깐 눌렀다 떼면 이동이 아니라 선택이다 ─────────────────────────
    const s0 = await at(0);
    await page.mouse.move(s0.x, s0.y); await page.mouse.down(); await page.waitForTimeout(120); await page.mouse.up();
    await page.waitForTimeout(120);
    check('짧게 누르면 떠오르지 않는다', (await state()).lifted, false);
    check('짧게 누르면 선택이 열린다', await page.evaluate(() => !!DK.selTower), true);
    await page.evaluate(() => { DK.selTower = null; DKsync(); });

    // ── 2. 길게 누르면 떠오르고 손끝을 따라온다 ───────────────────────────
    await longPress(page, s0);
    let st = await state();
    check('길게 누르면 떠오른다', [st.lifted, st.towers[0].moving], [true, true]);
    const s5 = await at(5);
    await page.mouse.move(s5.x, s5.y, { steps: 12 });
    st = await state();
    check('떠 있는 동안 빈 석단 위에서 놓을 자리가 잡힌다', st.over, 5);
    const follow = await page.evaluate(cli => { const cv = document.getElementById('game'), r = cv.getBoundingClientRect();
      const cx = (cli.x - r.left) * cv.width / r.width, cy = (cli.y - r.top) * cv.height / r.height;
      const t = DK.towers[0]; return { dx: Math.abs(t.x - cx), dy: Math.abs(t.y - (cy - 22)) }; }, s5);
    assert.ok(follow.dx < 2 && follow.dy < 2, `손끝을 따라와야 한다 (어긋남 ${follow.dx}, ${follow.dy})`);
    report.checks.push({ name: '떠 있는 타워가 손끝을 따라온다' }); console.log('  PASS 떠 있는 타워가 손끝을 따라온다');
    check('떠 있는 동안에는 사격하지 않는다 (moving 표시)', st.towers[0].moving, true);

    // ── 3. 빈 석단에 놓으면 옮겨진다 ─────────────────────────────────────
    await page.mouse.up();
    await page.waitForTimeout(120);
    st = await state();
    check('빈 석단에 놓으면 그 자리로 옮겨진다', [st.towers[0].spot, st.towers[0].moving, st.lifted], [5, false, false]);
    const s5c = await page.evaluate(() => { const s = DKspots()[5]; const t = DK.towers[0]; return [t.x === s[0], t.y === s[1]]; });
    check('좌표가 석단에 딱 맞는다', s5c, [true, true]);

    // ── 4. 점유된 석단에서는 두 타워의 자리를 교환한다 ───────────────────
    await page.evaluate(() => { DK.heldDie = 2; DK.dieFocus = true; DKplace(9); DKsync(); });
    check('두 번째 타워를 9번에 놓았다', (await state()).towers.length, 2);
    const s9 = await at(9), s5b = await at(5);
    await page.evaluate(() => {
      window.moveRefs = { first: DK.towers.find(t => t.face === 4), second: DK.towers.find(t => t.face === 2) };
      window.moveRefs.projectile = { src: window.moveRefs.first };
    });
    await longPress(page, s5b);
    await page.mouse.move(s9.x, s9.y, { steps: 12 });
    check('점유된 석단도 놓을 자리로 잡힌다', (await state()).over, 9);
    await page.mouse.up();
    await page.waitForTimeout(120);
    st = await state();
    check('점유된 곳에 놓으면 두 타워가 자리를 바꾼다',
      [st.towers.find(t => t.face === 4).spot, st.towers.find(t => t.face === 2).spot, st.towers.length, st.lifted],
      [9, 5, 2, false]);
    check('교환 후 기존 타워와 투사체 소유 참조가 유지된다', await page.evaluate(() => [
      DK.towers.includes(window.moveRefs.first), DK.towers.includes(window.moveRefs.second),
      window.moveRefs.projectile.src === window.moveRefs.first,
      DK.towers.every(t => { const s = DKspots()[t.spot]; return t.x === s[0] && t.y === s[1] && !t.moving; }),
    ]), [true, true, true, true]);
    // 다음 검사들은 원래 5번 타워 위치를 사용한다.
    await longPress(page, s9);
    await page.mouse.move(s5b.x, s5b.y, { steps: 12 });
    await page.mouse.up();
    check('다시 교환하면 원래 위치로 돌아간다',
      [(await state()).towers.find(t => t.face === 4).spot, (await state()).towers.find(t => t.face === 2).spot], [5, 9]);

    // ── 5. 주사위 배치 대기 중에도 길게 누르면 기존 타워를 옮긴다 ────────
    await page.evaluate(() => { DK.heldDie = 6; DK.dieFocus = true; DKsync(); });
    await longPress(page, s5b);
    check('주사위 배치 대기 중에도 길게 누르면 떠오른다',
      [!!(await state()).lifted, await page.evaluate(() => DK.heldDie)], [true, 6]);
    const s6 = await at(6);
    await page.mouse.move(s6.x, s6.y, { steps: 12 });
    check('보유 주사위 이동의 빈 석단 목표', (await state()).over, 6);
    await page.mouse.up();
    st = await state();
    check('타워는 5→6으로 옮겨지고 주사위는 그대로 대기한다',
      [st.towers.find(t => t.face === 4).spot, st.towers.length, st.lifted, await page.evaluate(() => DK.heldDie)],
      [6, 2, false, 6]);
    await page.mouse.click(s0.x, s0.y);
    st = await state();
    check('이동 후 빈 석단 짧은 탭은 보유 주사위를 배치한다',
      [st.towers.find(t => t.face === 6)?.spot, st.towers.length, await page.evaluate(() => DK.heldDie)],
      [0, 3, 0]);

    // ── 6. 떠오르기 전에 손이 크게 움직이면 이동이 아니다 ──────────────────
    await page.mouse.move(s6.x, s6.y); await page.mouse.down();
    await page.waitForTimeout(90);
    await page.mouse.move(s6.x + 90, s6.y + 60, { steps: 8 });
    await page.waitForTimeout(500);
    check('떠오르기 전에 끌면 이동이 아니다', (await state()).lifted, false);
    await page.mouse.up();

    // ── 7. 옮겨도 타워의 능력치는 그대로다 ────────────────────────────────
    const power = await page.evaluate(() => { const t = DK.towers.find(x => x.face === 4);
      return { dmg: Math.round(DKtowerDamage(t)), range: Math.round(DKrange(t)), lvl: t.lvl, face: t.face }; });
    const s3 = await at(3);
    await longPress(page, await at(6));
    await page.mouse.move(s3.x, s3.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(120);
    const power2 = await page.evaluate(() => { const t = DK.towers.find(x => x.face === 4);
      return { dmg: Math.round(DKtowerDamage(t)), range: Math.round(DKrange(t)), lvl: t.lvl, face: t.face, spot: t.spot }; });
    check('옮겨도 피해·사거리·레벨·눈이 그대로다', [power2.dmg, power2.range, power2.lvl, power2.face], [power.dmg, power.range, power.lvl, power.face]);
    check('옮긴 자리는 3번', power2.spot, 3);

    // ── 8. 정보창의 '이동' 버튼으로 옮기기 (길게 누르기 없이 탭 두 번) ──────
    const before = await state();
    const face4 = before.towers.find(t => t.face === 4);
    await page.evaluate(spot => { DK.selTower = DK.towers.find(t => t.spot === spot); DKsync(); }, face4.spot);
    check('타워를 선택하면 이동 버튼이 눌리는 상태다', await page.evaluate(() => {
      const b = document.getElementById('move-btn');
      return { exists: !!b, disabled: b.disabled, text: b.textContent, picking: b.classList.contains('picking') };
    }), { exists: true, disabled: false, text: '이동', picking: false });

    await page.click('#move-btn');
    check('이동을 누르면 자리 고르기로 바뀐다', await page.evaluate(() => {
      const b = document.getElementById('move-btn'), h = document.getElementById('hud-hint');
      return { picking: !!DKMOVE.picking, text: b.textContent, cls: b.classList.contains('picking'),
        hint: h.classList.contains('hidden') ? null : h.textContent };
    }), { picking: true, text: '이동 취소', cls: true, hint: '다른 석단을 선택해 주세요 — 타워가 있으면 자리를 바꿉니다.' });

    const s7 = await at(7);
    await page.mouse.click(s7.x, s7.y);
    await page.waitForTimeout(120);
    st = await state();
    const moved2 = st.towers.find(t => t.face === 4);
    check('빈 석단을 탭하면 그리로 옮겨진다', [moved2.spot, st.lifted, await page.evaluate(() => !!DKMOVE.picking)], [7, false, false]);

    // 이동 버튼은 점유 칸에서도 합성 없이 자리를 바꾼다.
    await page.evaluate(() => { DK.selTower = DK.towers.find(t => t.face === 4); DKsync(); });
    await page.click('#move-btn');
    await page.mouse.click(s9.x, s9.y);
    await page.waitForTimeout(120);
    check('이동 버튼으로 점유 칸을 고르면 바로 교환한다',
      [await page.evaluate(() => !!DKMOVE.picking), (await state()).towers.find(t => t.face === 4).spot,
        (await state()).towers.find(t => t.face === 2).spot, (await state()).towers.length],
      [false, 9, 7, 3]);

    // 다시 누르면 취소
    await page.click('#move-btn');
    check('이동 버튼으로 새 고르기를 시작한다', await page.evaluate(() => !!DKMOVE.picking), true);
    await page.click('#move-btn');
    check('이동 버튼을 다시 누르면 취소된다', await page.evaluate(() => !!DKMOVE.picking), false);

    // ── 9. 상자 주사위가 투척 대기 중이어도 타워 이동은 가능하다 ──────────────
    const pending = await page.evaluate(() => {
      const chest = DKCONTENT.INFINITY.chest, oldDraw = chest.draw;
      DK.gold = 99999;
      let kind;
      try { chest.draw = () => 'd8'; kind = DKchest(); }
      finally { chest.draw = oldDraw; }
      return { kind, active: DKSLOT.active, phase: DKSLOT.phase, held: DK.heldDie, die: DKDIE.state };
    });
    check('상자 주사위가 물리 투척을 기다린다', pending,
      { kind: 'd8', active: true, phase: -1, held: 0, die: 'tray' });
    await longPress(page, await at(9));
    check('상자 주사위 대기 중에도 기존 타워가 떠오른다', (await state()).lifted, true);
    await page.mouse.move(s6.x, s6.y, { steps: 12 });
    await page.mouse.up();
    st = await state();
    check('타워 이동 후에도 상자 주사위는 투척 대기 상태를 유지한다',
      [st.towers.find(t => t.face === 4).spot, st.lifted,
        await page.evaluate(() => [DKSLOT.active, DKSLOT.phase, DK.heldDie, DKDIE.state])],
      [6, false, [true, -1, 0, 'tray']]);

    // ── 10. 가득 찬 보드에서도 이동 버튼이 활성화되고 점유지끼리 교환한다 ────
    const full = await page.evaluate(() => {
      DKstartInf('clear'); DK.paused = true;
      for (let i = 0; i < DKspots().length; i++) {
        DK.heldDie = i % 2 ? 2 : 4; DK.dieFocus = true; DKplace(i);
      }
      window.fullMoveRefs = { first: DK.towers[0], last: DK.towers.at(-1) };
      DK.towers[0].lvl = 2;
      DK.selTower = DK.towers[0]; DKsync();
      return { spots: DKspots().length, towers: DK.towers.length, disabled: document.getElementById('move-btn').disabled };
    });
    check('가득 찬 보드에서 이동 버튼을 사용할 수 있다', full, { spots: 15, towers: 15, disabled: false });
    await page.click('#move-btn');
    await page.mouse.click((await at(full.spots - 1)).x, (await at(full.spots - 1)).y);
    check('가득 찬 보드에서 교환해도 객체·레벨·모든 석단 점유가 유지된다', await page.evaluate(() => {
      const a = window.fullMoveRefs.first, b = window.fullMoveRefs.last;
      return {
        firstSpot: a.spot, lastSpot: b.spot, firstLevel: a.lvl,
        sameObjects: DK.towers.includes(a) && DK.towers.includes(b),
        uniqueSpots: new Set(DK.towers.map(t => t.spot)).size,
        aligned: DK.towers.every(t => { const s = DKspots()[t.spot]; return t.x === s[0] && t.y === s[1]; }),
        picking: !!DKMOVE.picking,
      };
    }), { firstSpot: full.spots - 1, lastSpot: 0, firstLevel: 2, sameObjects: true, uniqueSpots: 15, aligned: true, picking: false });

    // ── 11. 덱의 명시적 이동은 같은 타워라도 교환, 끌기는 기존 합성 ────────
    await page.evaluate(() => {
      DKstartInf('build'); DK.paused = true;
      for (const i of [0, 1]) { DK.heldDie = 1; DK.dieFocus = true; DKplace(i); }
      window.deckMoveRefs = { first: DK.towers[0], second: DK.towers[1] };
      DK.selTower = DK.towers[0]; DKsync();
    });
    await page.click('#move-btn');
    const d1 = await at(1);
    await page.mouse.click(d1.x, d1.y);
    check('덱 이동 버튼은 같은 종류·눈금도 합성하지 않고 교환한다', await page.evaluate(() => ({
      count: DK.towers.length,
      firstSpot: window.deckMoveRefs.first.spot, secondSpot: window.deckMoveRefs.second.spot,
      firstPips: window.deckMoveRefs.first.pips, secondPips: window.deckMoveRefs.second.pips,
    })), { count: 2, firstSpot: 1, secondSpot: 0, firstPips: 1, secondPips: 1 });
    await longPress(page, d1);
    const d0 = await at(0);
    await page.mouse.move(d0.x, d0.y, { steps: 12 });
    await page.mouse.up();
    check('덱 끌기는 호환되는 두 타워를 기존대로 합성한다', await page.evaluate(() => ({
      count: DK.towers.length, pips: DK.towers[0]?.pips,
      targetRetained: DK.towers.includes(window.deckMoveRefs.second),
      sourceRemoved: !DK.towers.includes(window.deckMoveRefs.first),
      moving: !!DKMOVE.tower,
    })), { count: 1, pips: 2, targetRetained: true, sourceRemoved: true, moving: false });

    // ── 12. 모사 타워를 끌어 옮기면 기존 복제 동작도 유지한다 ─────────────
    await page.evaluate(() => {
      DKstartInf('build'); DK.paused = true;
      DK.heldDie = 13; DK.dieFocus = true; DKplace(0);
      DK.heldDie = 1; DK.dieFocus = true; DKplace(1);
      window.copyMoveRefs = { source: DK.towers[0], target: DK.towers[1] };
    });
    await longPress(page, await at(0));
    await page.mouse.move(d1.x, d1.y, { steps: 12 });
    await page.mouse.up();
    check('모사 끌기는 타워 교환 대신 기존 복제를 수행한다', await page.evaluate(() => ({
      count: DK.towers.length,
      sourceAtOriginal: window.copyMoveRefs.source.spot === 0,
      copiedFace: window.copyMoveRefs.source.face,
      targetUntouched: window.copyMoveRefs.target.face === 1 && window.copyMoveRefs.target.spot === 1,
      moving: !!DKMOVE.tower,
    })), { count: 2, sourceAtOriginal: true, copiedFace: 1, targetUntouched: true, moving: false });

    await page.evaluate(() => {
      DKstartInf('build'); DK.paused = true;
      DK.heldDie = 1; DK.dieFocus = true; DKplace(0);
      DK.heldDie = 2; DK.dieFocus = true; DKplace(1);
      window.incompatibleMoveRefs = { source: DK.towers[0], target: DK.towers[1] };
    });
    await longPress(page, await at(0));
    await page.mouse.move(d1.x, d1.y, { steps: 12 });
    await page.mouse.up();
    check('덱의 호환되지 않는 타워 끌기는 합성 대신 교환한다', await page.evaluate(() => ({
      count: DK.towers.length,
      sourceSpot: window.incompatibleMoveRefs.source.spot,
      targetSpot: window.incompatibleMoveRefs.target.spot,
      sourceFace: window.incompatibleMoveRefs.source.face,
      targetFace: window.incompatibleMoveRefs.target.face,
    })), { count: 2, sourceSpot: 1, targetSpot: 0, sourceFace: 1, targetFace: 2 });

    assert.deepEqual(errors, [], '브라우저 오류');
    report.pass = true;
    await context.close();
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log('PASS 타워 이동', report.checks.length, '검사;', path.join(out, 'report.json'));
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; });
