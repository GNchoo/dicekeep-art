// 로비 허브 → 싱글 → 멀티, 배속 버튼 글자 숨김, 뒤로가기 체인. 사용: node hub-shot.js <prefix>
const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const prefix = process.argv[2] || 'hub';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  for (const [tag, vw, vh] of [['p', 393, 852], ['s', 360, 780], ['l', 852, 393], ['d', 1280, 800]]) {
    const mob = vw < 1000;
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: mob ? 2 : 1, isMobile: mob, hasTouch: mob });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8137/index.html?unlock=all&net=off&v=' + Date.now());
    await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
    await p.click('#ov-btn'); await sleep(300);
    await p.screenshot({ path: `${prefix}-${tag}-hub.png` });
    await p.click('#hub-single'); await sleep(250);
    await p.screenshot({ path: `${prefix}-${tag}-single.png` });
    const s1 = await p.evaluate(() => ({ view: document.getElementById('lobby-box').dataset.view, title: document.getElementById('lobby-title').textContent, back: !document.getElementById('lobby-back').classList.contains('hidden'), box: document.querySelector('#lobby .screen-box').getBoundingClientRect().height, scrollH: document.querySelector('#lobby .screen-box').scrollHeight }));
    await p.keyboard.press('Escape'); await sleep(150);
    const s2 = await p.evaluate(() => document.getElementById('lobby-box').dataset.view);
    await p.click('#hub-multi'); await sleep(250);
    await p.screenshot({ path: `${prefix}-${tag}-multi.png` });
    const s3 = await p.evaluate(() => ({ view: document.getElementById('lobby-box').dataset.view, backHook: DKAPP.back(), viewAfter: document.getElementById('lobby-box').dataset.view, hubBack: DKAPP.back() }));
    // 스테이지 선택 → 로비로 돌아오면 싱글 갈래
    await p.evaluate(() => DKlobbyView('single')); await p.click('#btn-stage-select'); await sleep(200); await p.click('#ss-back'); await sleep(200);
    const s4 = await p.evaluate(() => document.getElementById('lobby-box').dataset.view);
    // 배속 버튼: 글자 숨김 + 아이콘 즉시
    await p.evaluate(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); DK.muted = true; DKstartInf('clear'); });
    await sleep(300);
    const sp0 = await p.evaluate(() => { const b = document.getElementById('speed-btn'); const cs = getComputedStyle(b); return { fs: cs.fontSize, color: cs.color, icon: b.dataset.icon, bg: /icon-speed1/.test(cs.backgroundImage), cached: (window.__iconCache || []).length }; });
    await p.click('#speed-btn'); await sleep(30);
    const sp1 = await p.evaluate(() => { const b = document.getElementById('speed-btn'); const cs = getComputedStyle(b); return { fs: cs.fontSize, icon: b.dataset.icon, bg: /icon-speed2/.test(cs.backgroundImage), complete: (window.__iconCache || []).filter(i => i.complete && i.naturalWidth > 0).length }; });
    await p.screenshot({ path: `${prefix}-${tag}-speed.png`, clip: { x: Math.max(0, vw - 160), y: 0, width: 160, height: 60 } });
    console.log(tag, JSON.stringify({ s1, escBack: s2, s3, afterStage: s4, sp0, sp1 }), errs.length ? errs : '');
    await ctx.close();
  }
  await b.close();
})();
