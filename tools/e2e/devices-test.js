// 기기 매트릭스 레이아웃 감사. 전제: python3 serve.py(8137). 멀티 시나리오(--mp)는 ws://localhost:8787 (dev-server 또는 wrangler).
// 사용: node devices-test.js [--only=iphoneSE,foldOpen] [--scen=lobby,infPlay] [--mp] [--shots]
const { chromium } = require('playwright-core');
const fs = require('fs');
const args = process.argv.slice(2);
const opt = (k) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : null; };
const ONLY = opt('only') ? opt('only').split(',') : null, SCEN = opt('scen') ? opt('scen').split(',') : null, MP = args.includes('--mp'), SHOTS = args.includes('--shots') || true;
const DEVICES = [
  { id: 'iphoneSE', w: 375, h: 667, dpr: 2, sa: { p: [20, 0, 0, 0], l: [0, 0, 0, 0] } },
  { id: 'iphone16', w: 393, h: 852, dpr: 3, sa: { p: [59, 0, 34, 0], l: [0, 59, 21, 59] } },
  { id: 'iphone16pro', w: 402, h: 874, dpr: 3, sa: { p: [59, 0, 34, 0], l: [0, 59, 21, 59] } },
  { id: 'iphone15plus', w: 430, h: 932, dpr: 3, sa: { p: [59, 0, 34, 0], l: [0, 59, 21, 59] } },
  { id: 'iphone16promax', w: 440, h: 956, dpr: 3, sa: { p: [59, 0, 34, 0], l: [0, 59, 21, 59] } },
  { id: 'galaxyS26', w: 360, h: 780, dpr: 3, sa: { p: [32, 0, 24, 0], l: [0, 32, 24, 32] } },
  { id: 'galaxyS26ultra', w: 384, h: 854, dpr: 3, sa: { p: [32, 0, 24, 0], l: [0, 32, 24, 32] } },
  { id: 'galaxyA', w: 412, h: 915, dpr: 2.6, sa: { p: [28, 0, 24, 0], l: [0, 28, 24, 28] } },
  { id: 'galaxyA360', w: 360, h: 800, dpr: 2, sa: { p: [28, 0, 24, 0], l: [0, 28, 24, 28] } },
  { id: 'foldCover', w: 384, h: 968, dpr: 3, sa: { p: [32, 0, 24, 0], l: [0, 32, 24, 32] } },
  { id: 'foldCover2', w: 360, h: 840, dpr: 3, sa: { p: [32, 0, 24, 0], l: [0, 32, 24, 32] } },
  { id: 'foldOpen', w: 754, h: 836, dpr: 2.5, sa: { p: [32, 0, 24, 0], l: [0, 32, 24, 32] } },
  { id: 'foldOpen2', w: 640, h: 745, dpr: 2.5, sa: { p: [32, 0, 24, 0], l: [0, 32, 24, 32] } },
  { id: 'flip', w: 360, h: 880, dpr: 3, sa: { p: [32, 0, 24, 0], l: [0, 32, 24, 32] } },
  { id: 'flipFlex', w: 360, h: 440, dpr: 3, sa: { p: [32, 0, 0, 0], l: [0, 32, 0, 32] }, noLand: true },
  { id: 'tablet', w: 820, h: 1180, dpr: 2, sa: { p: [24, 0, 20, 0], l: [24, 0, 20, 0] } },
];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const NET = 'ws://localhost:8787';

async function setSA(page, sa) {
  await page.evaluate(([t, r, b, l]) => { const st = document.documentElement.style; st.setProperty('--sa-t', t + 'px'); st.setProperty('--sa-r', r + 'px'); st.setProperty('--sa-b', b + 'px'); st.setProperty('--sa-l', l + 'px'); window.dispatchEvent(new Event('resize')); }, sa);
  await sleep(250);
}
const AUDIT = (sa) => {
  const [saT, saR, saB, saL] = sa;
  const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); if (r.width <= 0 || r.height <= 0 || cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; for (let p = el.parentElement; p; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden') return false; } return true; };
  const fails = [];
  const q = (s) => Array.from(document.querySelectorAll(s));
  const ovf = (sel) => { for (const e of q(sel)) if (vis(e) && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'auto' && getComputedStyle(e).overflowX !== 'scroll') fails.push(`hscroll ${sel} ${e.scrollWidth}>${e.clientWidth}`); };
  if (document.documentElement.scrollWidth > innerWidth + 1) fails.push('doc hscroll ' + document.documentElement.scrollWidth);
  ['#wrap', '#hud', '#stats', '#mini-top', '.screen:not(.hidden) .screen-box', '#overlay-box', '.help-card', '#mp-code-wrap', '#view-bar', '#log-panel'].forEach(ovf);
  const wrap = document.getElementById('wrap'), cls = wrap.className;
  const hud = document.getElementById('hud');
  if (hud && vis(hud)) {
    const kids = Array.from(hud.children).filter(e => vis(e) && e.id !== 'hud-break' && e.id !== 'rotate-hint' && e.id !== 'info-panel').map(e => ({ id: e.id, r: e.getBoundingClientRect() })).sort((a, b) => a.r.top - b.r.top);
    const rows = []; for (const k of kids) { const last = rows[rows.length - 1]; if (last && k.r.top < last.bottom - 4) { last.bottom = Math.max(last.bottom, k.r.bottom); last.ids.push(k.id); } else rows.push({ bottom: k.r.bottom, ids: [k.id] }); }
    const want = /over/.test(cls) ? (/xnarrow/.test(cls) ? 2 : 1) : /bleed/.test(cls) ? 2 : /side/.test(cls) ? null : 3;
    if (want && rows.length > want) fails.push(`hud rows ${rows.length} > ${want} [${cls}] ${rows.map(r => r.ids.join('+')).join(' / ')}`);
    if (hud.getBoundingClientRect().bottom > innerHeight + 1) fails.push('hud below viewport');
  }
  const box = { l: saL, t: saT, r: innerWidth - saR, b: innerHeight - saB };
  const SEL = 'button, input, .rival, #dice-slot, .chip, .inf-face, .stage-cell, .shop-row, #mp-code-big';
  const modal = ['#settings', '#inf-help', '#overlay', '.screen'].map(sel => q(sel).find(vis)).find(Boolean);   // 열린 모달이 있으면 그 안만 검사
  const infoOpen = vis(document.getElementById('info-panel'));
  for (const el of q(SEL)) {
    if (!vis(el)) continue;
    if (modal && !modal.contains(el)) continue;
    if (!modal && infoOpen && el.closest('#hud') && !el.closest('#info-panel')) continue;   // 타워 정보 카드가 HUD 를 덮는 것은 설계
    const r = el.getBoundingClientRect();
    const scroller = el.closest('.screen-box, .shop-body, .help-scroll, #ov-desc, #mp-chat-lines, #spec-list, .stage-grid');
    if (scroller && (r.bottom > scroller.getBoundingClientRect().bottom + 1 || r.top < scroller.getBoundingClientRect().top - 1)) continue;   // 스크롤 영역 안쪽은 스크롤로 닿는다
    const name = el.id || el.className || el.tagName;
    if (r.left < box.l - 1 || r.top < box.t - 1 || r.right > box.r + 1 || r.bottom > box.b + 1) fails.push(`outside ${name} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}] sa=${sa}`);
    if (el.tagName === 'BUTTON' && !el.disabled) { const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) fails.push(`covered ${name} by ${hit.id || hit.className}`); }
    const cs = getComputedStyle(el);
    if (cs.whiteSpace === 'nowrap' && cs.overflow !== 'hidden' && el.scrollWidth > el.clientWidth + 2) fails.push(`text-ovf ${name}`);
    if (el.tagName === 'BUTTON' && el.matches('#roll-btn, #wave-btn, .back-btn, #mp-copy, #help-close, #ov-btn, .big-btn, #mp-start')) {
      // 실제 글줄 수: 텍스트 노드들의 클라이언트 사각형 top 을 모은다 (padding 이 큰 버튼을 줄바꿈으로 오인하지 않게)
      const rg = document.createRange(); rg.selectNodeContents(el); const rects = Array.from(rg.getClientRects()).filter(r => r.width > 2 && r.height > 2).sort((a, b) => a.top - b.top);
      const lines = []; for (const r of rects) { const L = lines[lines.length - 1]; if (L && r.top < L.bottom - 3) L.bottom = Math.max(L.bottom, r.bottom); else lines.push({ bottom: r.bottom }); }
      const allow = el.matches('.big-btn, #roll-btn') ? 2 : 1;
      if (lines.length > allow) fails.push(`wrapped ${name} lines=${lines.length}`);
    }
  }
  const st = document.getElementById('stage').getBoundingClientRect(), cv = document.getElementById('game').getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  if (window.DK && DK.phase === 'playing') {
    const tol = /bleed/.test(cls) ? 1 : 6;   // 스테이지 모드는 #stage 테두리 2px
    if (Math.abs(st.width - cv.width) > tol || Math.abs(st.height - cv.height) > tol) fails.push(`canvas != stage (${Math.round(st.width)}x${Math.round(st.height)} vs ${Math.round(cv.width)}x${Math.round(cv.height)})`);
    if (/bleed/.test(cls)) {
      const ratio = innerWidth / innerHeight;
      const lb = /over/.test(cls) ? Math.max(wr.width - st.width, wr.height - st.height) : (wr.width - st.width);
      const allow = (ratio > 0.8 && ratio < 0.95) ? innerWidth * 0.16 : 12;
      if (lb > allow) fails.push(`letterbox ${Math.round(lb)} > ${Math.round(allow)} [${cls}] stage ${Math.round(st.width)}x${Math.round(st.height)} wrap ${Math.round(wr.width)}x${Math.round(wr.height)}`);
    }
    const s = document.getElementById('stats'), m = document.getElementById('mini-top');
    if (vis(s) && vis(m)) { const a = s.getBoundingClientRect(), b = m.getBoundingClientRect(); const chips = Array.from(s.children).filter(vis).map(c => c.getBoundingClientRect()); if (a.top < b.bottom && a.bottom > b.top && chips.some(c => c.right > b.left + 1)) fails.push(`stats x mini-top (${Math.round(chips[chips.length - 1].right)} > ${Math.round(b.left)})`); }
    const lp = document.getElementById('log-panel');
    if (lp && hud && vis(hud) && /over/.test(cls) && lp.getBoundingClientRect().bottom > hud.getBoundingClientRect().top + 1) fails.push('log over hud');
    const vb = document.getElementById('view-bar'); if (vb && vis(vb) && vis(m) && vb.getBoundingClientRect().right > m.getBoundingClientRect().left && vb.getBoundingClientRect().bottom > m.getBoundingClientRect().top) fails.push('view-bar x mini-top');
  }
  return fails;
};

const SCENARIOS = {
  title: async (p, ctx, fl) => { if (fl) { await p.evaluate(() => { document.getElementById('lobby').classList.add('hidden'); }); } },
  lobby: async (p, ctx, fl) => { if (!fl) await p.click('#ov-btn'); await sleep(300); },
  stageSelect: async (p, ctx, fl) => { if (!fl) await p.click('#ov-btn'); await sleep(200); await p.evaluate(() => DKlobbyView('single')); await p.click('#btn-stage-select'); await sleep(300); },
  shop: async (p, ctx, fl) => { if (!fl) await p.click('#ov-btn'); await sleep(200); await p.click('#btn-shop'); await sleep(300); },
  stagePlay: async (p, ctx, fl) => { if (!fl) await p.click('#ov-btn'); await sleep(200); await p.evaluate(() => { DK.muted = true; DKstart(3); DK.gold = 9000; }); await sleep(400); await p.evaluate(() => { DKroll(); DKplace(0); }); await sleep(400); },
  stageInfo: async (p, ctx, fl) => { await SCENARIOS.stagePlay(p, ctx, fl); await p.evaluate(() => { DK.selTower = DK.towers[0] || null; DKsync && DKsync(); }); await sleep(300); },
  infPlay: async (p, ctx, fl) => { if (!fl) await p.click('#ov-btn'); await sleep(200); await p.evaluate(() => { DK.muted = true; DKstartInf('clear'); DK.gold = 90000; }); await sleep(600); await p.evaluate(() => { const h = document.getElementById('help-close'); if (h) h.click(); }); await p.evaluate(() => DKchest()); await p.waitForFunction(() => !!DK.heldDie, null, { timeout: 15000 }).catch(() => {}); await p.evaluate(() => DKplace(0)); await p.click('#wave-btn').catch(() => {}); await sleep(1200); },
  infInfo: async (p, ctx, fl) => { await SCENARIOS.infPlay(p, ctx, fl); await p.evaluate(() => { DK.selTower = DK.towers[0] || null; DKsync && DKsync(); }); await sleep(300); },
  infHelp: async (p, ctx, fl) => { await SCENARIOS.infPlay(p, ctx, fl); await p.evaluate(() => DKhelp()); await sleep(300); },
  coach: async (p, ctx, fl) => { if (!fl) await p.click('#ov-btn'); await sleep(200); await p.evaluate(() => { localStorage.removeItem('dk_coachDone'); DK.muted = true; DKstartInf('clear'); }); await sleep(1200); },
  result: async (p, ctx, fl) => { await SCENARIOS.infPlay(p, ctx, fl); await p.evaluate(() => { DK.lives = 0; DKend(false); }); await sleep(500); },
};
const SCEN_MP = {
  mpRoomCode: async (p, ctx, fl) => { if (!fl) await p.click('#ov-btn'); await sleep(200); await p.fill('#mp-name', 'A'); await p.evaluate(() => DKlobbyView('multi')); await p.click('#mp-create'); await p.waitForFunction(() => DK.phase === 'mpRoom', null, { timeout: 10000 }); await sleep(300); },
  mpRoomQuick: async (p, ctx, fl) => { if (!fl) await p.click('#ov-btn'); await sleep(200); await p.fill('#mp-name', 'A'); await p.evaluate(() => DKlobbyView('multi')); await p.click('#mp-quick'); await p.waitForFunction(() => DK.phase === 'mpRoom', null, { timeout: 10000 }); await sleep(300); },
  mpPlay: async (p, ctx, fl) => { await mpPlay(p, ctx, fl); },
  mpView: async (p, ctx, fl) => { await mpPlay(p, ctx, fl); await p.evaluate(() => DKMP.view(DKNET.members().find(x => x.pid !== DKNET.me.pid).pid)); await sleep(1500); },
  mpSpectate: async (p, ctx, fl) => { await mpPlay(p, ctx, fl); await p.evaluate(() => DKMP.die('lives')); await sleep(800); },
  chat: async (p, ctx, fl) => { await mpPlay(p, ctx, fl); await p.evaluate(() => DKchatOpen()); await sleep(200); },
};
async function mpPlay(p, ctx, fl) {
  if (!fl) await p.click('#ov-btn'); await sleep(200); await p.fill('#mp-name', 'A'); await p.evaluate(() => DKlobbyView('multi')); await p.click('#mp-create');
  await p.waitForFunction(() => DK.phase === 'mpRoom', null, { timeout: 10000 });
  const code = await p.evaluate(() => DKNET.code);
  const b = await ctx.newPage(); await b.setViewportSize({ width: 800, height: 600 });
  await b.goto(`http://localhost:8137/index.html?unlock=all&net=${encodeURIComponent(NET)}&v=${Date.now()}`);
  await b.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
  await b.evaluate(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
  await b.click('#ov-btn'); await sleep(200); await b.fill('#mp-name', 'B'); await b.evaluate(() => DKlobbyView('multi')); await b.click('#mp-join'); await b.fill('#mp-code', code); await b.click('#mp-join-go');
  await b.waitForFunction(() => DK.phase === 'mpRoom', null, { timeout: 10000 });
  await sleep(300); await p.click('#mp-start');
  await p.waitForFunction(() => DK.phase === 'playing', null, { timeout: 10000 });
  await b.waitForFunction(() => DK.phase === 'playing', null, { timeout: 10000 });
  for (const q of [p, b]) { await q.evaluate(() => { DK.muted = true; DK.gold = 90000; }); await q.evaluate(() => DKchest()); await q.waitForFunction(() => !!DK.heldDie, null, { timeout: 15000 }).catch(() => {}); await q.evaluate(() => DKplace(0)); }
  await sleep(2500);
  ctx._b = b;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  fs.mkdirSync('devices', { recursive: true });
  const report = [], errs = [];
  const scenNames = Object.keys(MP ? SCEN_MP : SCENARIOS).filter(n => !SCEN || SCEN.includes(n));
  for (const d of DEVICES) {
    if (ONLY && !ONLY.includes(d.id)) continue;
    for (const o of ['p', 'l']) {
      if (o === 'l' && d.noLand) continue;
      const w = o === 'p' ? d.w : d.h, h = o === 'p' ? d.h : d.w;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
      const p = await ctx.newPage();
      const perr = [];
      p.on('pageerror', e => perr.push(e.message));
      p.on('dialog', dlg => dlg.accept());
      try {
        await p.goto(`http://localhost:8137/index.html?unlock=all&net=${MP ? encodeURIComponent(NET) : 'off'}&v=${Date.now()}`);
        await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
        await p.evaluate(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); localStorage.setItem('dk_rotateHint', '1'); DK.muted = true; });
        await setSA(p, d.sa[o]);
      } catch (e) { errs.push(`${d.id} ${o}: LOAD CRASH ${e.message.split('\n')[0]}`); console.log('CRASH load', d.id, o); await ctx.close(); continue; }
      let first = true;
      for (const sc of scenNames) {
        perr.length = 0;
        try {
          if (!first) { await p.evaluate(() => DKlobby()); await sleep(200); if (ctx._b) { await ctx._b.close().catch(() => {}); ctx._b = null; } }
          if (!first && sc !== 'title') { /* 시나리오는 로비에서 시작하므로 ov-btn 클릭을 건너뛴다 */ }
          const scen = (MP ? SCEN_MP : SCENARIOS)[sc];
          if (first) await scen(p, ctx); else await scen(p, ctx, true);
          first = false;
          await setSA(p, d.sa[o]);
          await sleep(250);
          const fails = await p.evaluate(AUDIT, d.sa[o]);
          fails.push(...perr.map(e => 'pageerror ' + e));
          const cls = await p.evaluate(() => ({ wrap: document.getElementById('wrap').className, stage: document.getElementById('stage').className, hud: document.getElementById('hud').className, W: window.DK && DK.mapKey, cv: [document.getElementById('game').width, document.getElementById('game').height] }));
          report.push({ device: d.id, o, w, h, sc, cls, fails });
          if (SHOTS) await p.screenshot({ path: `devices/${d.id}-${o}-${sc}.png` });
          if (fails.length) { errs.push(`${d.id} ${o} ${w}x${h} ${sc}: ` + fails.join(' | ')); console.log('FAIL', d.id, o, sc, fails.join(' | ')); }
          else console.log('ok  ', d.id, o, sc, cls.wrap, cls.cv.join('x'));
        } catch (e) { errs.push(`${d.id} ${o} ${sc}: CRASH ${e.message.split('\n')[0]}`); console.log('CRASH', d.id, o, sc, e.message.split('\n')[0]); first = false; }
      }
      if (ctx._b) await ctx._b.close().catch(() => {});
      await ctx.close();
    }
  }
  fs.writeFileSync('devices/report.json', JSON.stringify(report, null, 1));
  console.log('\n==== 실패 ' + errs.length + ' / ' + report.length + ' ====');
  for (const e of errs) console.log(e);
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})();
