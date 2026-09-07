const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1240, height: 860 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8137/index.html?unlock=all&net=off&v=' + Date.now());
  await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
  await p.click('#ov-btn'); await sleep(300);
  await p.evaluate(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); DK.muted = true; DKstartInf('clear'); DK.gold = 90000; });
  await sleep(500);
  // 1) 메뉴: ≡ → 열림 + 일시정지, 닫기 → 재개
  await p.click('#exit-btn'); await sleep(200);
  const m1 = await p.evaluate(() => ({ open: !document.getElementById('menu').classList.contains('hidden'), paused: DK.paused, pauseTxt: document.getElementById('menu-pause').textContent, note: document.getElementById('menu-note').textContent.slice(0, 20) }));
  await p.screenshot({ path: 'menu-open.png' });
  const w0 = await p.evaluate(() => DK.time); await sleep(600); const w1 = await p.evaluate(() => DK.time);
  await p.click('#menu-pause'); await sleep(100); const paused2 = await p.evaluate(() => DK.paused);
  await p.keyboard.press('Escape'); await sleep(100);
  const m2 = await p.evaluate(() => ({ open: !document.getElementById('menu').classList.contains('hidden'), paused: DK.paused, phase: DK.phase }));
  console.log('menu', JSON.stringify(m1), 'time frozen', w0 === w1, 'toggle', paused2, 'after esc', JSON.stringify(m2));
  // 2) 손에 든 주사위 바로 판매
  await p.evaluate(() => DKchest()); await p.waitForFunction(() => !!DK.heldDie, null, { timeout: 15000 });
  const g0 = await p.evaluate(() => DK.gold);
  const sellVisible = await p.evaluate(() => !document.getElementById('held-sell').classList.contains('hidden') && document.getElementById('held-sell').textContent);
  await p.click('#held-sell'); await sleep(100);
  console.log('held-sell', sellVisible, 'gold +', (await p.evaluate(() => DK.gold)) - g0, 'held', await p.evaluate(() => DK.heldDie));
  // 3) 보류 상태 문구
  await p.evaluate(() => DKchest()); await p.waitForFunction(() => !!DK.heldDie, null, { timeout: 15000 });
  await p.evaluate(() => { DK.dieFocus = false; DKsync(); });
  console.log('parked', await p.evaluate(() => ({ name: document.getElementById('held-name').textContent, cost: document.getElementById('roll-cost').textContent, cls: document.getElementById('held-info').className })));
  // 4) 보스 타이머 실시간
  await p.evaluate(() => { DK.heldDie = 0; DK.wave = 9; DKsync(); }); await p.click('#wave-btn'); await sleep(3000);
  const t1 = await p.evaluate(() => document.getElementById('wave-val').textContent); await sleep(1100); const t2 = await p.evaluate(() => document.getElementById('wave-val').textContent);
  console.log('boss chip', t1, '→', t2, 'changed', t1 !== t2);
  // 5) 포기
  await p.click('#exit-btn'); await sleep(100); await p.click('#menu-quit'); await sleep(300);
  console.log('quit', await p.evaluate(() => DK.phase), 'errs', errs);
  await b.close();
})();
