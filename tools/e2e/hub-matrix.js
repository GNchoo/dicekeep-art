// 로비 허브 + 싱글/멀티 갈래 기기 매트릭스 감사. 전제: python3 serve.py(8137).
// 사용: node hub-matrix.js [--only=iphoneSE,foldOpen]  → hubm/<device>-<o>-<view>.png, hubm/report.json
const { chromium } = require('playwright-core');
const fs = require('fs');
const args = process.argv.slice(2);
const opt = (k) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : null; };
const ONLY = opt('only') ? opt('only').split(',') : null;
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
async function setSA(page, sa) {
  await page.evaluate(([t, r, b, l]) => { const st = document.documentElement.style; st.setProperty('--sa-t', t + 'px'); st.setProperty('--sa-r', r + 'px'); st.setProperty('--sa-b', b + 'px'); st.setProperty('--sa-l', l + 'px'); window.dispatchEvent(new Event('resize')); }, sa);
  await sleep(250);
}
const TITLE = { hub: '주사위 성채', single: '싱글플레이', multi: '멀티플레이' };
// 한 갈래 감사: 반환 { fails:[], info:{} }
const AUDIT = ([view, sa]) => {
  const [saT, saR, saB, saL] = sa;
  const TITLE = { hub: '주사위 성채', single: '싱글플레이', multi: '멀티플레이' };
  const fails = [], info = {};
  const R = el => el.getBoundingClientRect();
  const vis = el => { if (!el) return false; const r = R(el); const cs = getComputedStyle(el); if (r.width <= 0 || r.height <= 0 || cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; for (let p = el.parentElement; p; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden') return false; } return true; };
  const inter = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const box = document.getElementById('lobby-box');
  info.view = box.dataset.view; info.phase = window.DK && DK.phase;
  if (box.dataset.view !== view) fails.push(`view=${box.dataset.view} expected ${view}`);
  // 1. 가로 넘침
  if (document.documentElement.scrollWidth > innerWidth) fails.push(`doc hscroll ${document.documentElement.scrollWidth}>${innerWidth}`);
  if (box.scrollWidth > box.clientWidth + 1) fails.push(`box hscroll ${box.scrollWidth}>${box.clientWidth}`);
  // 2. 상자 높이 / 스크롤
  const br = R(box);
  info.box = { h: Math.round(br.height), top: Math.round(br.top), bottom: Math.round(br.bottom), scrollH: box.scrollHeight, clientH: box.clientHeight, scrollTop: box.scrollTop };
  const scrollable = box.scrollHeight > box.clientHeight + 1;
  info.scrollable = scrollable;
  if (br.height > innerHeight - 16 + 0.5) {
    const firstKid = Array.from(box.children).find(vis);
    const fr = firstKid && R(firstKid);
    if (!(scrollable && box.scrollTop === 0 && fr && fr.top >= br.top - 1 && fr.bottom <= br.bottom + 1)) fails.push(`box too tall ${Math.round(br.height)} > ${innerHeight - 16} (scrollable=${scrollable} scrollTop=${box.scrollTop})`);
  }
  if (br.top < -0.5 || br.bottom > innerHeight + 0.5) fails.push(`box outside viewport [${Math.round(br.top)},${Math.round(br.bottom)}] vh=${innerHeight}`);
  if (scrollable && box.scrollTop !== 0) fails.push(`box scrollTop ${box.scrollTop} != 0 on open`);
  // 3. 버튼
  const cur = document.getElementById('lobby-' + view);
  const btns = Array.from(cur.querySelectorAll('.big-btn')).filter(vis);
  info.btns = [];
  const safe = { l: saL, t: saT, r: innerWidth - saR, b: innerHeight - saB };
  for (const el of btns) {
    const r = R(el);
    const name = el.id;
    const rec = { id: name, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] };
    const inVp = r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5;
    const inBoxVis = r.top >= br.top - 0.5 && r.bottom <= br.bottom + 0.5;
    if (!inVp || !inBoxVis) {
      if (scrollable && r.bottom > br.bottom - 0.5 && r.left >= -0.5 && r.right <= innerWidth + 0.5) { rec.belowFold = true; fails.push(`below-fold(scroll) ${name} [${rec.rect}] boxBottom=${Math.round(br.bottom)}`); }
      else fails.push(`outside-viewport ${name} [${rec.rect}] vp=${innerWidth}x${innerHeight}`);
    } else {
      if (r.left < safe.l - 0.5 || r.right > safe.r + 0.5 || r.top < safe.t - 0.5 || r.bottom > safe.b + 0.5) fails.push(`outside-safe-area ${name} [${rec.rect}] sa=${sa}`);
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (getComputedStyle(el).pointerEvents === 'none') { rec.peNone = true; if (hit && !el.parentElement.contains(hit) && hit !== el.parentElement) fails.push(`covered(pe-none) ${name} by ${hit.id || hit.className}`); }   // net=off 멀티 버튼: pointer-events:none 은 설계
      else if (!hit || (hit !== el && !el.contains(hit))) fails.push(`covered ${name} by ${hit ? (hit.id || hit.className || hit.tagName) : 'null'}`);
    }
    // 글줄 수: 아이콘(.bi) 제외한 텍스트 노드 사각형을 줄로 묶는다. 라벨(큰 글자) 1줄 + small 1줄 허용, 3줄+ 실패
    const lineCount = (nodes) => { const rects = []; for (const n of nodes) { const rg = document.createRange(); rg.selectNodeContents(n); rects.push(...Array.from(rg.getClientRects()).filter(q => q.width > 2 && q.height > 2)); } rects.sort((a, b) => a.top - b.top); const lines = []; for (const q of rects) { const L = lines[lines.length - 1]; if (L && q.top < L.bottom - 3) L.bottom = Math.max(L.bottom, q.bottom); else lines.push({ top: q.top, bottom: q.bottom }); } return lines.length; };
    const labelNodes = Array.from(el.childNodes).filter(n => n.nodeType === 3 && n.textContent.trim());
    const smallEl = el.querySelector('small');
    const labelLines = lineCount(labelNodes), smallLines = smallEl ? lineCount([smallEl]) : 0;
    const all = lineCount([...labelNodes, ...(smallEl ? [smallEl] : [])]);
    rec.lines = { label: labelLines, small: smallLines, all };
    const fs = parseFloat(getComputedStyle(el).fontSize);
    rec.hVsFont = +(r.height / fs).toFixed(2);
    if (all >= 3 || labelLines >= 2) fails.push(`wrapped ${name} label=${labelLines} small=${smallLines} all=${all} h=${Math.round(r.height)} fs=${fs}`);
    info.btns.push(rec);
  }
  // 4. 뒤로/제목/설정
  const back = document.getElementById('lobby-back'), set = document.getElementById('lobby-settings'), h1 = document.getElementById('lobby-title');
  const backVis = vis(back);
  info.back = backVis; info.title = h1.textContent;
  if (view === 'hub' ? backVis : !backVis) fails.push(`lobby-back ${backVis ? 'visible' : 'hidden'} on ${view}`);
  if (h1.textContent !== TITLE[view]) fails.push(`title "${h1.textContent}" != "${TITLE[view]}"`);
  if (!vis(set)) fails.push('lobby-settings not visible');
  else {
    const sr = R(set);
    if (backVis && inter(sr, R(back))) fails.push('settings overlaps back');
    // h1 텍스트 실제 글리프 범위와 비교 (h1 상자는 폭 100%)
    const rg = document.createRange(); rg.selectNodeContents(h1); const tr = Array.from(rg.getClientRects()).filter(q => q.width > 2);
    for (const q of tr) if (inter(sr, q)) fails.push(`settings overlaps h1 text [${Math.round(q.left)},${Math.round(q.top)},${Math.round(q.right)},${Math.round(q.bottom)}] vs [${Math.round(sr.left)},${Math.round(sr.top)},${Math.round(sr.right)},${Math.round(sr.bottom)}]`);
    if (backVis) for (const q of tr) if (inter(R(back), q)) fails.push(`back overlaps h1 text`);
    if (sr.right > innerWidth + 0.5 || sr.top < -0.5) fails.push(`settings outside viewport`);
    const hit = document.elementFromPoint(sr.left + sr.width / 2, sr.top + sr.height / 2);
    if (!hit || (hit !== set && !set.contains(hit))) fails.push(`settings covered by ${hit ? (hit.id || hit.className) : 'null'}`);
  }
  if (backVis) { const rr = R(back); const hit = document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2); if (!hit || (hit !== back && !back.contains(hit))) fails.push(`back covered by ${hit ? (hit.id || hit.className) : 'null'}`); }
  // 5. 갈래별 필수 요소 보임
  const need = { hub: ['#hub-single', '#hub-multi', '#btn-shop', '#lobby-hub .gem-chip'], single: ['#btn-inf-clear', '#btn-infinity', '#lobby-inf', '#btn-stage-select', '#lobby-progress'], multi: ['#mp-name', '#mp-create', '#mp-join', '#mp-quick', '#mp-status'] }[view];
  for (const s of need) { const e = document.querySelector(s); if (!e || !vis(e)) { if (s === '#mp-status' || s === '#lobby-progress' || s === '#lobby-inf') info['empty:' + s] = true; else fails.push(`missing ${s}`); } }
  info.btnCount = btns.length;
  return { fails, info };
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  fs.mkdirSync('hubm', { recursive: true });
  const report = [], errs = [];
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
      const key = `${d.id} ${o} ${w}x${h}`;
      const row = { device: d.id, o, w, h, sa: d.sa[o], views: {}, chain: {}, fails: [] };
      try {
        await p.goto(`http://localhost:8137/index.html?unlock=all&net=off&v=${Date.now()}`);
        await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
        await p.evaluate(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); localStorage.setItem('dk_rotateHint', '1'); DK.muted = true; });
        await setSA(p, d.sa[o]);
        await p.click('#ov-btn');
        await p.waitForFunction(() => DK.phase === 'lobby', null, { timeout: 10000 });
        await sleep(300);
        const audit = async (view) => {
          await sleep(200);
          const r = await p.evaluate(AUDIT, [view, d.sa[o]]);
          await p.screenshot({ path: `hubm/${d.id}-${o}-${view}.png` });
          row.views[view] = r;
          for (const f of r.fails) row.fails.push(`${view}: ${f}`);
        };
        await audit('hub');
        // 허브 → 싱글 (클릭) → DKAPP.back() 체인
        await p.click('#hub-single');
        await audit('single');
        const c1 = await p.evaluate(() => { const a = DKAPP.back(); return { ret: a, view: document.getElementById('lobby-box').dataset.view }; });
        row.chain.singleBack = c1;
        if (c1.ret !== true || c1.view !== 'hub') row.fails.push(`chain: single DKAPP.back() -> ${JSON.stringify(c1)} (expected true/hub)`);
        const c2 = await p.evaluate(() => { const a = DKAPP.back(); return { ret: a, view: document.getElementById('lobby-box').dataset.view, phase: DK.phase }; });
        row.chain.hubBack = c2;
        if (c2.ret !== false || c2.view !== 'hub' || c2.phase !== 'lobby') row.fails.push(`chain: hub DKAPP.back() -> ${JSON.stringify(c2)} (expected false/hub)`);
        // 싱글 → Escape → 허브
        await p.click('#hub-single'); await sleep(150);
        await p.keyboard.press('Escape'); await sleep(150);
        const c3 = await p.evaluate(() => ({ view: document.getElementById('lobby-box').dataset.view, back: document.getElementById('lobby-back').classList.contains('hidden') }));
        row.chain.escape = c3;
        if (c3.view !== 'hub' || !c3.back) row.fails.push(`chain: Escape from single -> ${JSON.stringify(c3)}`);
        // 허브 → 멀티 (클릭) → #lobby-back 클릭 → 허브
        await p.click('#hub-multi');
        await audit('multi');
        await p.click('#lobby-back'); await sleep(150);
        const c4 = await p.evaluate(() => ({ view: document.getElementById('lobby-box').dataset.view, title: document.getElementById('lobby-title').textContent }));
        row.chain.backBtn = c4;
        if (c4.view !== 'hub' || c4.title !== TITLE.hub) row.fails.push(`chain: #lobby-back from multi -> ${JSON.stringify(c4)}`);
      } catch (e) { row.fails.push(`CRASH ${e.message.split('\n')[0]}`); }
      row.fails.push(...perr.map(e => 'pageerror ' + e));
      report.push(row);
      if (row.fails.length) { errs.push(`${key}: ` + row.fails.join(' | ')); console.log('FAIL', key, '\n   ' + row.fails.join('\n   ')); }
      else console.log('ok  ', key, Object.entries(row.views).map(([v, r]) => `${v}:box${r.info.box.h}${r.info.scrollable ? '(scroll ' + r.info.box.scrollH + ')' : ''}`).join(' '));
      await ctx.close();
    }
  }
  fs.writeFileSync('hubm/report.json', JSON.stringify(report, null, 1));
  console.log('\n==== 실패 ' + errs.length + ' / ' + report.length + ' ====');
  for (const e of errs) console.log(e);
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})();
