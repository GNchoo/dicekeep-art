const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const tag = process.argv[2] || 'before';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8137/index.html?unlock=all&net=off&v=' + Date.now());
  await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
  await p.click('#ov-btn'); await sleep(400);
  await p.screenshot({ path: `polish-${tag}-lobby.png` });
  await p.evaluate(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); DK.muted = true; DKstartInf('clear'); DK.gold = 90000; });
  await sleep(500);
  await p.screenshot({ path: `polish-${tag}-game.png` });
  // 굴리는 중 (중앙 연출 확인)
  await p.evaluate(() => DKchest()); await sleep(250);
  await p.screenshot({ path: `polish-${tag}-rolling.png` });
  await p.waitForFunction(() => !!DK.heldDie, null, { timeout: 15000 }); await sleep(120);
  await p.screenshot({ path: `polish-${tag}-held.png` });
  await p.evaluate(() => { DK.dieFocus = false; DKsync(); }); await sleep(100);
  await p.screenshot({ path: `polish-${tag}-parked.png` });
  const slot = await p.$('#dice-panel'); await slot.screenshot({ path: `polish-${tag}-slot.png` });
  const hud = await p.$('#hud'); await hud.screenshot({ path: `polish-${tag}-hud.png` });
  // 고성 뽑기: 큐브 굴림 + 획득 연출
  // 큐브(d6)가 나올 때까지 뽑기 (다른 종류는 바로 판매)
  for (let i = 0; i < 20; i++) { await p.evaluate(() => { DK.heldDie = 0; DK.dieFocus = true; DKsync(); DKchest(); }); const k = await p.evaluate(() => DKSLOT.kind); if (k === 'd6') break; await p.waitForFunction(() => !!DK.heldDie, null, { timeout: 15000 }); }
  await sleep(300);
  await p.screenshot({ path: `polish-${tag}-rolling2.png` });
  await p.waitForFunction(() => !!DK.heldDie, null, { timeout: 15000 }); await sleep(150);
  await p.screenshot({ path: `polish-${tag}-linger.png` });
  await p.click('#exit-btn'); await sleep(200);
  await p.screenshot({ path: `polish-${tag}-menu.png` });
  console.log('errs', errs);
  await b.close();
})();
