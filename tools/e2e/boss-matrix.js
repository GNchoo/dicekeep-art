// 보스 웨이브 HUD 기기 매트릭스: 칩에 타이머 없음, 말풍선에 타이머, 미니 버튼 같은 줄 판정(fitTopRow), 겹침. 사용: node boss-matrix.js [--only=id,id] [--urgent=id]
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const opt = (k) => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : null; };
const ONLY = opt('only') ? opt('only').split(',') : null;
const URGENT = opt('urgent') || 'iphone16';
const OUT = path.join(__dirname, 'bossm');
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
// 페이지 안에서 측정: (a) 칩 텍스트 (b) bossT (c) 같은 줄 / 필요 폭 (d) 겹침
const MEASURE = () => {
  const g = (id) => document.getElementById(id);
  const stage = g('stage'), stats = g('stats'), mini = g('mini-top');
  const sg = stage.getBoundingClientRect(), sr = stats.getBoundingClientRect(), mr = mini.getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(stats).columnGap) || 8;
  const chips = Array.from(stats.children).filter(c => !c.classList.contains('hidden') && c.offsetWidth);
  const chipsW = chips.reduce((a, c) => a + Math.max(c.offsetWidth, c.scrollWidth + 2), 0);
  const left = Math.max(0, sr.left - sg.left), right = Math.max(0, sg.right - mr.right);
  const need = left + chipsW + gap * Math.max(0, chips.length - 1) + 6 + mini.offsetWidth + right;
  const w = stage.clientWidth;
  const sameRow = Math.abs(mr.top - sr.top) < 6;
  let overlap = null;
  if (sameRow) {
    for (const c of chips) { const r = c.getBoundingClientRect(); if (r.right > mr.left + 0.5 && r.left < mr.right && r.bottom > mr.top && r.top < mr.bottom) overlap = `${c.id || c.className} right=${r.right.toFixed(1)} > mini.left=${mr.left.toFixed(1)}`; }
  }
  const clipped = chips.filter(c => c.scrollWidth > c.clientWidth + 1).map(c => `${c.id || c.className} sw=${c.scrollWidth} cw=${c.clientWidth}`);
  const minis = Array.from(mini.querySelectorAll('button')).filter(b => getComputedStyle(b).display !== 'none').map(b => b.id);
  return {
    chip: g('wave-val').textContent.trim(), bossT: +DK.inf.bossT.toFixed(1), wave: DK.wave,
    stageCls: stage.className, wrapCls: g('wrap').className, drop: stage.classList.contains('mini-drop'),
    stageW: w, need: +need.toFixed(1), fits: need <= w + 0.5, left: +left.toFixed(1), right: +right.toFixed(1), gap, chipsW: +chipsW.toFixed(1), nChips: chips.length, miniW: mini.offsetWidth, minis,
    statsTop: +sr.top.toFixed(1), miniTop: +mr.top.toFixed(1), statsRight: +Math.max(...chips.map(c => c.getBoundingClientRect().right)).toFixed(1), miniLeft: +mr.left.toFixed(1),
    sameRow, overlap, clipped, chatVisible: !g('chat-btn').classList.contains('hidden'),
  };
};
function judge(m, label) {
  const f = [];
  if (/보스/.test(m.chip) || /\d+:\d\d/.test(m.chip)) f.push(`(a) chip has timer/boss: "${m.chip}"`);
  if (!(m.bossT > 0)) f.push(`(b) bossT=${m.bossT}`);
  if (!m.sameRow && m.fits) f.push(`(c) dropped although fits: need=${m.need} <= stageW=${m.stageW} (statsTop=${m.statsTop} miniTop=${m.miniTop})`);
  if (m.sameRow && !m.fits) f.push(`(c) same row but does not fit: need=${m.need} > stageW=${m.stageW}`);
  if (m.sameRow !== !m.drop) f.push(`(c) class mini-drop=${m.drop} but sameRow=${m.sameRow}`);
  if (m.overlap) f.push(`(d) overlap ${m.overlap}`);
  if (m.clipped.length) f.push(`(d) chip clipped ${m.clipped.join(', ')}`);
  return f;
}
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  fs.mkdirSync(OUT, { recursive: true });
  const rows = [], fails = [];
  for (const d of DEVICES) {
    if (ONLY && !ONLY.includes(d.id)) continue;
    for (const o of ['p', 'l']) {
      if (o === 'l' && d.noLand) continue;
      const vw = o === 'p' ? d.w : d.h, vh = o === 'p' ? d.h : d.w;
      const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
      const p = await ctx.newPage();
      const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', dl => dl.accept());
      const tag = `${d.id}-${o}`;
      try {
        await p.goto('http://localhost:8137/index.html?unlock=all&net=off&v=' + Date.now() + Math.random());
        await p.waitForFunction(() => window.DK && window.DK.phase === 'title', null, { timeout: 120000 });
        await p.evaluate(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); localStorage.setItem('dk_rotateHint', '1'); DK.muted = true; });
        await p.click('#ov-btn'); await sleep(300);
        await setSA(p, d.sa[o]);
        await p.evaluate(() => { DKstartInf('clear'); DK.gold = 90000; DK.wave = 9; DKsync(); });
        await sleep(300);
        await setSA(p, d.sa[o]);
        await p.click('#wave-btn'); await sleep(2500);
        const m1 = await p.evaluate(MEASURE);
        await p.screenshot({ path: `${OUT}/${tag}.png`, clip: { x: 0, y: 0, width: vw, height: Math.min(vh, 220) } });
        const f1 = judge(m1);
        // 채팅 버튼(멀티) 보이게
        await p.evaluate(() => { document.getElementById('chat-btn').classList.remove('hidden'); DKsync(); window.dispatchEvent(new Event('resize')); });
        await sleep(700);
        const m2 = await p.evaluate(MEASURE);
        await p.screenshot({ path: `${OUT}/${tag}-chat.png`, clip: { x: 0, y: 0, width: vw, height: Math.min(vh, 220) } });
        const f2 = judge(m2).map(x => 'chat: ' + x);
        if (!m2.chatVisible) f2.push('chat: chat-btn not visible');
        let urgentShot = null;
        if (d.id === URGENT) {
          await p.evaluate(() => { document.getElementById('chat-btn').classList.add('hidden'); DKsync(); window.dispatchEvent(new Event('resize')); DK.inf.bossT = 12; });
          await sleep(700);
          urgentShot = `${OUT}/${tag}-urgent.png`;
          await p.screenshot({ path: urgentShot, clip: { x: 0, y: 0, width: vw, height: Math.min(vh, 220) } });
        }
        const fl = [...f1, ...f2, ...errs.map(e => 'pageerror ' + e)];
        rows.push({ tag, vw, vh, base: m1, chat: m2, fails: fl });
        const short = (m) => `${m.sameRow ? 'ROW' : 'DROP'} need=${m.need}/${m.stageW} chips=${m.chipsW}(${m.nChips}) mini=${m.miniW} l=${m.left} r=${m.right} gap=${m.gap} statsR=${m.statsRight} miniL=${m.miniLeft}`;
        console.log(`${fl.length ? 'FAIL' : 'ok  '} ${tag} ${vw}x${vh} [${m1.stageCls}] chip="${m1.chip}" bossT=${m1.bossT} | ${short(m1)} | chat: ${short(m2)}${fl.length ? '\n     ' + fl.join('\n     ') : ''}`);
        if (fl.length) fails.push(`${tag}: ${fl.join(' | ')}`);
      } catch (e) { console.log('CRASH', tag, e.message.split('\n')[0]); fails.push(`${tag}: CRASH ${e.message.split('\n')[0]}`); }
      await ctx.close();
    }
  }
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(rows, null, 1));
  console.log(`\n==== fails ${fails.length} / ${rows.length} ====`);
  for (const f of fails) console.log(f);
  await b.close();
})();
