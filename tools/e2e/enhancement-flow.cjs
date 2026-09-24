// 실제 강화 버튼을 통한 연속 강화와 고위험 확인 창을 검증한다.
// E2E_BASE_URL=http://localhost:8137/ node tools/e2e/enhancement-flow.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');

const repo = path.resolve(__dirname, '../..');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/enhancement-flow'));
const base = (process.env.E2E_BASE_URL || 'http://localhost:8137/').replace(/\/?$/, '/');
fs.mkdirSync(out, { recursive: true });
const report = { scope: '확률강화 연속 클릭, 고위험 확인, 결과 표시', base, checks: [], pass: false };

function check(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
  report.checks.push({ name });
  console.log('  PASS', name);
}

function match(name, actual, pattern) {
  assert.match(actual, pattern, name);
  report.checks.push({ name });
  console.log('  PASS', name);
}

const snapshot = page => page.evaluate(() => ({
  gold: DK.gold,
  spent: DK.inf.spent,
  count: DK.towers.length,
  face: DK.towers[0]?.face ?? null,
  selected: !!DK.selTower && DK.selTower === DK.towers[0],
  infoOpen: !document.getElementById('info-panel').classList.contains('hidden'),
}));
const setRoll = (page, value) => page.evaluate(v => { Math.random = () => v; }, value);
const confirmOpen = page => page.locator('#enhance-confirm').evaluate(dialog => dialog.open);

// A selector click follows a moving button and used to miss the sell-under-finger
// regression. Keep one physical screen coordinate through every result instead.
async function sameCoordinateRepeat(page, name, viewport) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    DK.muted = true; DKstartInf('clear'); DK.paused = true; DK.gold = 100000;
    DK.heldDie = 4; DK.dieFocus = true; DKplace(0);
    DK.selTower = DK.towers[0]; DKsync();
  });
  const rects = () => page.evaluate(() => Object.fromEntries(['move-btn', 'sell-btn', 'enhance-btn'].map(id => {
    const r = document.getElementById(id).getBoundingClientRect();
    return [id, { x: r.x, y: r.y, width: r.width, height: r.height }];
  })));
  const initial = await rects();
  const button = initial['enhance-btn'], point = { x: button.x + button.width / 2, y: button.y + button.height / 2 };
  check(`${name} 첫 선택부터 강화 버튼이 화면 안에 있다`,
    button.width >= 44 && button.height >= 44 && point.x < viewport.width && point.y < viewport.height, true);
  const stable = async label => {
    const current = await rects();
    for (const id of Object.keys(initial)) for (const key of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(current[id][key] - initial[id][key]) < 0.6,
        `${name} ${label} ${id}.${key} moved: ${initial[id][key]} → ${current[id][key]}`);
    }
    check(`${name} ${label} 기존 클릭 위치에는 여전히 강화 버튼이 있다`,
      await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.closest('button')?.id, point), 'enhance-btn');
  };
  for (const [roll, nextFace, label] of [[0.75, 4, '유지'], [0, 5, '성공'], [0, 6, '다음 성공'], [0, 7, '판매 불가 전환']]) {
    const before = await snapshot(page);
    await setRoll(page, roll);
    await page.mouse.click(point.x, point.y);
    const after = await snapshot(page);
    check(`${name} 같은 좌표로 ${label}했을 때 타워가 팔리지 않는다`,
      [after.face, after.count, after.selected, after.gold < before.gold], [nextFace, 1, true, true]);
    await stable(label);
  }
  await page.screenshot({ path: path.join(out, `stable-actions-${name}.png`) });
  await page.evaluate(() => {
    const tower = DK.selTower; tower.face = 19; tower.def = DKTD[19]; DKsync();
  });
  await stable('긴 고등급 이름');
  await setRoll(page, 0);
  await page.mouse.click(point.x, point.y);
  check(`${name} 고등급도 동일한 좌표로 확인창을 연다`, await confirmOpen(page), true);
  await page.click('#enhance-confirm-accept');
  check(`${name} 최고 등급까지 강화된다`, (await snapshot(page)).face, 20);
  await stable('최대 등급');
  check(`${name} 최대 등급 버튼은 같은 자리에 비활성화된다`, await page.locator('#enhance-btn').isDisabled(), true);
}

(async () => {
  const browser = await launchBrowser();
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1240, height: 860 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('dk_coachDone', '1');
      localStorage.setItem('dk_infHelpSeen', '1');
    });
    const url = new URL('index.html', base);
    url.searchParams.set('net', 'off');
    url.searchParams.set('v', Date.now());
    await page.goto(url.href);
    await page.waitForFunction(() => window.DK && DK.phase === 'title' && window.DKstartInf, null, { timeout: 120000 });
    await page.click('#ov-btn');

    for (const [name, viewport] of [
      ['desktop', { width: 1240, height: 860 }],
      ['phone-landscape', { width: 844, height: 390 }],
      ['phone-portrait', { width: 390, height: 844 }],
    ]) await sameCoordinateRepeat(page, name, viewport);
    await page.setViewportSize({ width: 1240, height: 860 });
    await page.waitForTimeout(250);

    // 배치 경로를 거쳐 타워를 만든 뒤 12★에서 시작한다.
    const costs = await page.evaluate(() => {
      DK.muted = true;
      DKstartInf('clear');
      DK.paused = true;
      DK.gold = 100000;
      DK.heldDie = 4;
      DK.dieFocus = true;
      DKplace(0);
      const tower = DK.towers[0];
      tower.face = 12;
      tower.def = DKTD[12];
      DK.selTower = tower;
      DKsync();
      return [12, 13].map(face => DKCONTENT.INFINITY.enhance.cost(face));
    });
    const [cost12, cost13] = costs;
    const initial = await snapshot(page);
    check('12★ 타워가 선택되어 강화 가능',
      [initial.count, initial.face, initial.selected, initial.infoOpen, await page.locator('#enhance-btn').isEnabled()],
      [1, 12, true, true, true]);

    // 12★는 소멸보다 성공 확률이 높다. 첫 시도는 유지, 다음은 성공으로 고정한다.
    await setRoll(page, 0.5);
    await page.click('#enhance-btn');
    const kept = await snapshot(page);
    check('12★ 유지 후에도 같은 타워와 정보창이 선택된 채 남는다',
      [kept.count, kept.face, kept.selected, kept.infoOpen, kept.gold, kept.spent - initial.spent],
      [1, 12, true, true, initial.gold - cost12, cost12]);
    check('12★ 강화는 확인 창 없이 즉시 실행된다', await confirmOpen(page), false);
    check('유지 결과가 선택 패널에 보인다', await page.locator('#enhance-result').isVisible(), true);
    match('유지 결과 문구', await page.locator('#enhance-result').innerText(), /유지|보류|그대로|변화 없음/);

    await setRoll(page, 0);
    await page.click('#enhance-btn');
    const upgraded = await snapshot(page);
    check('다시 누르면 성공하고 선택과 강화 버튼이 유지된다',
      [upgraded.count, upgraded.face, upgraded.selected, upgraded.infoOpen, upgraded.gold, upgraded.spent - kept.spent, await page.locator('#enhance-btn').isEnabled()],
      [1, 13, true, true, kept.gold - cost12, cost12, true]);
    check('성공 결과가 선택 패널에 보인다', await page.locator('#enhance-result').isVisible(), true);
    match('성공 결과 문구', await page.locator('#enhance-result').innerText(), /성공/);

    // 13★부터는 성공률이 소멸률보다 낮다. 창만 열거나 취소해도 골드가 그대로여야 한다.
    await page.click('#enhance-btn');
    check('13★ 강화는 확인 창을 연다', await confirmOpen(page), true);
    check('확인 대기 중에는 골드를 쓰지 않는다', (await snapshot(page)).gold, upgraded.gold);
    await page.click('#enhance-confirm-cancel');
    check('취소하면 확인 창이 닫힌다', await confirmOpen(page), false);
    const canceled = await snapshot(page);
    check('취소해도 타워·선택·골드·누적 비용이 그대로다', canceled, upgraded);

    await setRoll(page, 0.5);
    await page.click('#enhance-btn');
    check('다음 13★ 시도에서도 확인 창을 다시 연다', await confirmOpen(page), true);
    await page.click('#enhance-confirm-accept');
    const highKept = await snapshot(page);
    check('확인 한 번에 13★ 비용을 정확히 한 번 내고 유지된다',
      [await confirmOpen(page), highKept.count, highKept.face, highKept.selected, highKept.infoOpen, highKept.gold, highKept.spent - canceled.spent],
      [false, 1, 13, true, true, canceled.gold - cost13, cost13]);
    match('고위험 유지 결과 문구', await page.locator('#enhance-result').innerText(), /유지|보류|그대로|변화 없음/);

    await setRoll(page, 0.99);
    await page.click('#enhance-btn');
    check('소멸 위험 시도도 매번 확인을 요구한다', await confirmOpen(page), true);
    await page.click('#enhance-confirm-accept');
    const destroyed = await snapshot(page);
    check('소멸 시 타워와 선택이 사라지고 비용은 한 번만 차감된다',
      [destroyed.count, destroyed.face, destroyed.selected, destroyed.infoOpen, destroyed.gold, destroyed.spent - highKept.spent],
      [0, null, false, false, highKept.gold - cost13, cost13]);
    check('소멸 결과 배지가 화면에 보인다', await page.locator('#enhance-toast').isVisible(), true);
    match('소멸 결과 문구', await page.locator('#enhance-toast').innerText(), /소멸/);

    check('브라우저 오류가 없다', errors, []);
    await context.close();

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const mobile = await mobileContext.newPage();
    mobile.on('pageerror', error => errors.push(error.message));
    await mobile.addInitScript(() => {
      localStorage.setItem('dk_coachDone', '1');
      localStorage.setItem('dk_infHelpSeen', '1');
    });
    await mobile.goto(url.href);
    await mobile.waitForFunction(() => window.DK && DK.phase === 'title' && window.DKstartInf, null, { timeout: 120000 });
    await mobile.click('#ov-btn');
    await mobile.evaluate(() => {
      DK.muted = true; DKstartInf('clear'); DK.paused = true; DK.gold = 100000;
      DK.heldDie = 4; DK.dieFocus = true; DKplace(0);
      const tower = DK.towers[0]; tower.face = 13; tower.def = DKTD[13]; DK.selTower = tower; DKsync();
    });
    await mobile.click('#enhance-btn');
    check('휴대폰에서도 위험 확인 창이 열린다', await confirmOpen(mobile), true);
    const bounds = await mobile.locator('#enhance-confirm').evaluate(el => {
      const r = el.getBoundingClientRect();
      return { inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        actions: [...el.querySelectorAll('button')].every(button => {
          const b = button.getBoundingClientRect(); return b.width >= 44 && b.height >= 44 && b.left >= 0 && b.right <= innerWidth;
        }) };
    });
    check('휴대폰 확인 창과 취소·강화 버튼이 화면 안에 있다', bounds, { inside: true, actions: true });
    await mobile.click('#enhance-confirm-cancel');
    check('휴대폰에서 취소해도 비용을 쓰지 않는다', await mobile.evaluate(() => DK.gold), 100000);
    await mobileContext.close();
    check('휴대폰 브라우저 오류가 없다', errors, []);
    report.pass = true;
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log('PASS 확률강화 흐름', report.checks.length, '검사;', path.join(out, 'report.json'));
})().catch(error => { console.error('FAIL', error); process.exitCode = 1; });
