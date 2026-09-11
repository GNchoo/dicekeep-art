// 놓인 타워 옮기기: 잠깐 누르고 있으면 떠올라 손끝을 따라오고, 빈 석단에 놓으면 옮겨진다.
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
const report = { scope: '타워 길게 눌러 이동', base, checks: [], pass: false };
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

    // ── 4. 이미 타워가 있는 석단에는 놓을 수 없다 (제자리로) ───────────────
    await page.evaluate(() => { DK.heldDie = 2; DK.dieFocus = true; DKplace(9); DKsync(); });
    check('두 번째 타워를 9번에 놓았다', (await state()).towers.length, 2);
    const s9 = await at(9), s5b = await at(5);
    await longPress(page, s5b);
    await page.mouse.move(s9.x, s9.y, { steps: 12 });
    check('점유된 석단은 놓을 자리로 잡히지 않는다', (await state()).over, -1);
    await page.mouse.up();
    await page.waitForTimeout(120);
    st = await state();
    const moved = st.towers.find(t => t.face === 4);
    check('점유된 곳에 놓으면 제자리로 돌아온다', [moved.spot, moved.moving], [5, false]);

    // ── 5. 손에 주사위를 들고 있으면 이동이 시작되지 않는다 (배치 우선) ─────
    await page.evaluate(() => { DK.heldDie = 6; DK.dieFocus = true; DKsync(); });
    await longPress(page, s5b);
    check('주사위를 든 동안에는 떠오르지 않는다', (await state()).lifted, false);
    await page.mouse.up();
    await page.evaluate(() => { DK.heldDie = 0; DKsync(); });

    // ── 6. 떠오르기 전에 손이 크게 움직이면 이동이 아니다 ──────────────────
    await page.mouse.move(s5b.x, s5b.y); await page.mouse.down();
    await page.waitForTimeout(90);
    await page.mouse.move(s5b.x + 90, s5b.y + 60, { steps: 8 });
    await page.waitForTimeout(500);
    check('떠오르기 전에 끌면 이동이 아니다', (await state()).lifted, false);
    await page.mouse.up();

    // ── 7. 옮겨도 타워의 능력치는 그대로다 ────────────────────────────────
    const power = await page.evaluate(() => { const t = DK.towers.find(x => x.face === 4);
      return { dmg: Math.round(DKtowerDamage(t)), range: Math.round(DKrange(t)), lvl: t.lvl, face: t.face }; });
    const s3 = await at(3);
    await longPress(page, await at(5));
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
    }), { picking: true, text: '이동 취소', cls: true, hint: '타워를 놓을 곳을 선택해 주세요 — 빈 석단을 누르면 옮겨집니다.' });

    const s7 = await at(7);
    await page.mouse.click(s7.x, s7.y);
    await page.waitForTimeout(120);
    st = await state();
    const moved2 = st.towers.find(t => t.face === 4);
    check('빈 석단을 탭하면 그리로 옮겨진다', [moved2.spot, st.lifted, await page.evaluate(() => !!DKMOVE.picking)], [7, false, false]);

    // 점유된 칸을 고르면 고르기가 유지된다
    await page.evaluate(() => { DK.selTower = DK.towers.find(t => t.face === 4); DKsync(); });
    await page.click('#move-btn');
    await page.mouse.click(s9.x, s9.y);
    await page.waitForTimeout(120);
    check('점유된 칸을 고르면 옮기지 않고 고르기를 유지한다',
      [await page.evaluate(() => !!DKMOVE.picking), (await state()).towers.find(t => t.face === 4).spot], [true, 7]);

    // 다시 누르면 취소
    await page.click('#move-btn');
    check('이동 버튼을 다시 누르면 취소된다', await page.evaluate(() => !!DKMOVE.picking), false);

    assert.deepEqual(errors, [], '브라우저 오류');
    report.pass = true;
    await context.close();
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log('PASS 타워 이동', report.checks.length, '검사;', path.join(out, 'report.json'));
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; });
