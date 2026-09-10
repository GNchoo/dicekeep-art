// 보스는 상성 없이 1배로 받는다 — 잡몹은 상성을 그대로 받는다.
// 순수운빨은 뽑은 눈이 전부라, 보스 크기와 공격형이 안 맞아 판이 통째로 막히면 운빨이 아니게 된다.
// 실제 damageEnemy(window.DKdamage)를 통해 확인한다 (산수 재구현이 아니라 게임 코드 그대로).
//   E2E_BASE_URL=http://localhost:8137/ node tools/e2e/boss-matchup.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');

const repo = path.resolve(__dirname, '../..');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/boss-matchup'));
const base = (process.env.E2E_BASE_URL || 'http://localhost:8137/').replace(/\/?$/, '/');
fs.mkdirSync(out, { recursive: true });
const report = { scope: '보스는 상성 배수를 받지 않고, 잡몹은 받는다.', base, checks: [], pass: false };

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
    url.searchParams.set('net', 'off');
    url.searchParams.set('v', '1');
    await page.goto(url.href);
    await page.waitForFunction(() => window.DK && DK.phase === 'title' && window.DKdamage, null, { timeout: 120000 });
    await page.click('#ov-btn');

    const result = await page.evaluate(() => {
      DKstartInf('clear');
      DK.paused = true;
      const INF = DKCONTENT.INFINITY, HP = 1e9, DMG = 1000;
      // 방어력·에픽 락다운·스턴이 섞이지 않게 방어 0 · 폭발형/진동형/일반형만 본다.
      const hit = (isBoss, cls, face) => {
        const e = { hp: HP, max: HP, dead: false, armor: 0, sizeClass: cls, isBoss, stunT: 0, flashT: 0, gold: 0, def: { gold: 0 } };
        DKdamage(e, DMG, { def: DKTD[face], face });
        return +((HP - e.hp) / DMG).toFixed(4);   // 실제로 들어간 배수
      };
      const FACES = { vib: 1, exp: 2, norm: 3 };   // 1눈 진동형 · 2눈 폭발형 · 3눈 일반형
      const rows = [];
      for (const [atk, face] of Object.entries(FACES)) {
        for (const cls of ['S', 'M', 'L']) {
          rows.push({ atk, face, cls, boss: hit(true, cls, face), mob: hit(false, cls, face), table: INF.sizeMult[atk][cls] });
        }
      }
      // 히든 타워(7★ 이상)도 같은지 — 실제로 문제가 됐던 구간
      const stars = [];
      for (const face of [15, 19, 20]) for (const cls of ['S', 'M', 'L']) {
        stars.push({ face, atk: DKTD[face].atk, cls, boss: hit(true, cls, face), mob: hit(false, cls, face), table: INF.sizeMult[DKTD[face].atk][cls] });
      }
      return { rows, stars, mode: DK.mode };
    });

    const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); report.checks.push({ name, pass: true }); console.log('  PASS', name); };

    check('인피니티 런에서 검사한다', result.mode, 'infinity');
    // 1) 보스는 공격형·크기와 무관하게 정확히 1배
    check('보스는 모든 공격형 × 모든 크기에서 1배로 받는다',
      result.rows.filter(r => r.boss !== 1).map(r => `${r.atk}×${r.cls}=${r.boss}`), []);
    check('히든 타워(15·19·20★)도 보스에게 1배로 들어간다',
      result.stars.filter(r => r.boss !== 1).map(r => `${r.face}★×${r.cls}=${r.boss}`), []);
    // 2) 잡몹은 상성표 그대로 (검사가 헛돌지 않는지 — 표와 어긋나면 잡는다)
    check('잡몹은 상성표 배수를 그대로 받는다',
      result.rows.filter(r => r.mob !== r.table).map(r => `${r.atk}×${r.cls}=${r.mob}≠${r.table}`), []);
    check('히든 타워도 잡몹에는 상성이 걸린다',
      result.stars.filter(r => r.mob !== r.table).map(r => `${r.face}★×${r.cls}=${r.mob}≠${r.table}`), []);
    // 3) 반증: 상성이 실제로 1이 아닌 조합이 있어야 위 검사가 의미가 있다
    check('상성이 1이 아닌 조합이 실제로 존재한다 (검사 민감도)',
      result.rows.some(r => r.table !== 1) && result.stars.some(r => r.table !== 1), true);
    // 4) 문제가 됐던 바로 그 조합: 소형 보스 × 폭발형 15★
    const s15 = result.stars.find(r => r.face === 15 && r.cls === 'S');
    check('소형 보스 × 폭발형 15★ — 보스 1배 / 잡몹 0.5배', [s15.boss, s15.mob, s15.atk], [1, 0.5, 'exp']);

    report.rows = result.rows; report.stars = result.stars;
    assert.deepEqual(errors, [], '브라우저 오류');
    report.pass = true;
    await context.close();
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log('PASS 보스 상성 면제', report.checks.length, '검사;', path.join(out, 'report.json'));
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; });
