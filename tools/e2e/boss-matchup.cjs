// 순수운빨의 모든 타워는 적의 크기와 보스 여부에 관계없이 같은 기본 피해를 준다.
// 실제 damageEnemy(window.DKdamage)로 1~20눈 전부를 검사하고, 방어력 감산은 유지되는지 확인한다.
//   E2E_BASE_URL=http://localhost:8137/ node tools/e2e/boss-matchup.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');

const repo = path.resolve(__dirname, '../..');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/boss-matchup'));
const base = (process.env.E2E_BASE_URL || 'http://localhost:8137/').replace(/\/?$/, '/');
fs.mkdirSync(out, { recursive: true });
const report = { scope: '1~20눈의 피해는 적 크기·보스 여부와 무관하며 방어력은 유지된다.', base, checks: [], pass: false };

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
      const HP = 1e9, DMG = 1000;
      const hit = (isBoss, cls, face, armor = 0) => {
        const e = { hp: HP, max: HP, dead: false, armor, sizeClass: cls, isBoss, stunT: 0, flashT: 0, gold: 0, def: { gold: 0 } };
        DKdamage(e, DMG, face == null ? null : { def: DKTD[face], face });
        return +(HP - e.hp).toFixed(4);
      };
      const rows = [];
      for (let face = 1; face <= 20; face++) for (const cls of ['S', 'M', 'L']) for (const isBoss of [false, true]) {
        rows.push({ face, cls, isBoss, bare: hit(isBoss, cls, face), armored: hit(isBoss, cls, face, 37) });
      }
      const absentClass = Array.from({ length: 20 }, (_, i) => i + 1).flatMap(face =>
        [false, true].map(isBoss => ({ face, isBoss, damage: hit(isBoss, undefined, face) })));
      const noSource = [false, true].flatMap(isBoss => ['S', 'M', 'L', undefined].map(cls =>
        ({ isBoss, cls: cls || null, bare: hit(isBoss, cls, null), armored: hit(isBoss, cls, null, 37) })));
      const selected = { face: 18, def: DKTD[18], lvl: 1, spot: 0, x: 200, y: 200, cd: 0, skin: 0 };
      DK.towers.push(selected);
      DK.selTower = selected;
      DKsync();
      const badge = document.getElementById('info-atk');
      const uiAttackBadgeVisible = !!(badge && badge.getClientRects().length);
      DK.wave = 57;
      DK.waveActive = false;
      DKsync();
      document.getElementById('wave-btn').click();
      const announcement = DK.texts.map(t => t.str).filter(s => s.includes('웨이브 58'));
      return { rows, absentClass, noSource, uiAttackBadgeVisible, announcedWave: DK.wave, announcement, mode: DK.mode,
        faces: Object.keys(DKTD).map(Number).filter(f => f >= 1 && f <= 20) };
    });

    const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); report.checks.push({ name, pass: true }); console.log('  PASS', name); };

    check('인피니티 런에서 검사한다', result.mode, 'infinity');
    check('1~20눈 정의가 모두 존재한다', result.faces, Array.from({ length: 20 }, (_, i) => i + 1));
    check('1~20눈 × S/M/L × 일반/보스 120조합을 검사한다', result.rows.length, 120);
    report.rows = result.rows;
    report.absentClass = result.absentClass;
    report.noSource = result.noSource;
    check('모든 크기·보스 여부에서 원 피해 1000 그대로 적용',
      result.rows.filter(r => r.bare !== 1000).map(r => `${r.face}눈/${r.cls}/${r.isBoss ? 'boss' : 'mob'}=${r.bare}`), []);
    check('방어 37은 963 피해로 감산, 14~17★ 에픽만 방어 무시',
      result.rows.filter(r => r.armored !== (r.face >= 14 && r.face <= 17 ? 1000 : 963))
        .map(r => `${r.face}눈/${r.cls}/${r.isBoss ? 'boss' : 'mob'}=${r.armored}`), []);
    check('크기 정보가 없는 기존 적도 모든 눈에서 원 피해 유지',
      result.absentClass.filter(r => r.damage !== 1000).map(r => `${r.face}눈/${r.isBoss ? 'boss' : 'mob'}=${r.damage}`), []);
    check('발사 주체가 없는 피해도 크기와 무관하고 방어는 감산',
      result.noSource.filter(r => r.bare !== 1000 || r.armored !== 963)
        .map(r => `${r.cls}/${r.isBoss ? 'boss' : 'mob'}=${r.bare}/${r.armored}`), []);
    check('선택한 타워 정보에 제거된 공격형 배지가 표시되지 않는다', result.uiAttackBadgeVisible, false);
    check('실제 웨이브 버튼으로 58웨이브를 예고한다', result.announcedWave, 58);
    check('58웨이브 예고 텍스트가 실제로 표시된다', result.announcement.length > 0, true);
    check('웨이브 예고에도 피해 상성으로 오해할 크기·공격형 문구가 없다',
      result.announcement.filter(text => /소형|중형|대형|진동형|폭발형|일반형/.test(text)), []);
    assert.deepEqual(errors, [], '브라우저 오류');
    report.pass = true;
    await context.close();
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log('PASS 전 타워 크기 상성 제거', report.checks.length, '검사;', path.join(out, 'report.json'));
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; });
