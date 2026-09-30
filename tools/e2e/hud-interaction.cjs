#!/usr/bin/env node
'use strict';

// Observe actual pointer targets and saved reward tokens while HUD actions are busy.
// HUD_TEST_REF=HEAD pins the pre-fix browser sources to prove the regression first.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { launchBrowser, gameUrl, outputPath } = require('./browser.cjs');
const repo = path.resolve(__dirname, '../..'), out = outputPath('hud-interaction');
fs.mkdirSync(out, { recursive: true });
const ref = process.env.HUD_TEST_REF, sources = ref ? Object.fromEntries(cp.execFileSync('git', ['ls-tree', '--name-only', ref], { cwd: repo, encoding: 'utf8' }).trim().split(/\r?\n/).filter(f => /\.(js|css|html)$/.test(f)).map(f => [f, cp.execFileSync('git', ['show', ref + ':' + f], { cwd: repo, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })])) : null;
const report = { ref: ref || 'working tree', pass: false, cases: [], failures: [] };
const check = (value, expected, label) => {
  try { assert.deepEqual(value, expected, label); }
  catch (error) { report.failures.push({ label, actual: value, expected }); console.error('FAIL', label, JSON.stringify(value)); }
};
const intersects = (a, b) => a && b && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
const contains = (a, b) => b.left >= a.left - 1 && b.top >= a.top - 1 && b.right <= a.right + 1 && b.bottom <= a.bottom + 1;

async function boot(browser, viewport) {
  const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1');
    window.__hudInteractionClock = true;
  });
  await page.route('**/*', async route => {
    const file = new URL(route.request().url()).pathname.split('/').pop();
    if (file !== 'game.js' && !(sources && file in sources)) return route.continue();
    const response = await route.fetch(), source = sources?.[file] ?? await response.text();
    if (file !== 'game.js') return route.fulfill({ response, body: source });
    const anchor = 'window.DK = S;'; assert.equal(source.split(anchor).length, 2);
    await route.fulfill({ response, body: source.replace(anchor, `
      window.__hudInteraction={draw,ctx,fitStage,hudTopPx,clearLog,advancePresentation,pumpQueue,updateBossReward,
        updateDie,updateSlot,buildInfinityWave,activeTray,dieViewScale,SPOTS:()=>SPOTS,reward:()=>BOSS_REWARD,
        pulse:()=>{const paused=S.paused;S.paused=false;try{updateBossReward(0);}finally{S.paused=paused;}}};
      ` + anchor).replace('    updateBossReward(dt);', '    if(!window.__hudInteractionClock) updateBossReward(dt);') });
  });
  await page.goto(gameUrl()); await page.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 });
  await page.click('#ov-btn');
  return { page, context, errors };
}

const centerClick = async (page, selector) => {
  const r = await page.locator(selector).boundingBox();
  assert.ok(r?.width && r?.height, selector + ' has a pointer target');
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
};
const padClick = async (page, spot) => {
  const p = await page.evaluate(i => {
    const [x, y] = __hudInteraction.SPOTS()[i], cv = document.getElementById('game'), r = cv.getBoundingClientRect();
    return { x: r.left + x * r.width / cv.width, y: r.top + y * r.height / cv.height };
  }, spot);
  await page.mouse.click(p.x, p.y);
};

async function begin(page, state) {
  return page.evaluate(state => {
    const q = __hudInteraction; DKstartInf('clear'); DK.paused = true; DK.muted = true; DK.gold = 10000;
    DK.wave = 20; DK.inf.doneW = 19; DK.spawnQ = []; DK.waveActive = false; DK.autoT = 999;
    q.clearLog();
    DK.heldDie = 1; DKplace(7); DK.heldDie = 0;
    if (state === 'manual') {
      const chest = DKCONTENT.INFINITY.chest, draw = chest.draw;
      try { chest.draw = () => 'd8'; DKchest(); } finally { chest.draw = draw; }
      q.advancePresentation(2.3);
    } else if (state === 'held') { DK.heldDie = 4; DK.dieFocus = true; }
    else DK.selTower = DK.towers[0];
    window.__rewardDraws = 0;
    DKCONTENT.INFINITY.chest.drawBoss = () => ['d8', 'd12'][window.__rewardDraws++];
    for (const wave of [10, 20]) {
      const item = q.buildInfinityWave(wave).find(e => e.isBoss); if (!item) throw Error('boss fixture missing');
      DKspawnEnemy(item); const enemy = DK.enemies.at(-1); DKdamage(enemy, enemy.hp + 1e12);
    }
    DK.enemies = []; DK.fxs = []; DK.texts = []; DK.bannerT = 0; DK.shakeT = 0;
    DKsync(); q.fitStage(); q.pulse();
    return { queue: DK.inf.queue.slice(), draws: __rewardDraws, hidden: document.getElementById('boss-reward').classList.contains('hidden'), gold: DK.gold };
  }, state);
}

async function thrownResult(page) {
  await page.evaluate(() => { __hudInteraction.advancePresentation(4); DKsync(); });
  await centerClick(page, '#roll-btn');
  return page.evaluate(() => {
    const q = __hudInteraction;
    for (let i = 0; i < 900 && !DK.heldDie; i++) { q.updateDie(1 / 60); q.updateSlot(1 / 60); }
    return { held: DK.heldDie, queue: DK.inf.queue.slice(), gold: DK.gold, active: DKSLOT.active };
  });
}

async function layout(page, row) {
  await page.evaluate(() => {
    const q = __hudInteraction; DKstartInf('clear'); DK.paused = true; DK.muted = true;
    q.clearLog();
    for (let i = 1; i <= 4; i++) DKlog(`알림 ${i} · 뽑은 타워와 강화 결과를 확인하세요.`, 'sys');
    for (const el of document.querySelectorAll('#log-lines .log-line')) for (const a of el.getAnimations()) a.finish();
    DKsync(); q.fitStage();
  });
  const sample = await page.evaluate(() => {
    const q = __hudInteraction, cv = document.getElementById('game'), cr = cv.getBoundingClientRect(), g = q.ctx;
    const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const round = g.roundRect, text = g.fillText; let last = null, guide = null;
    g.roundRect = function(x, y, w, h, ...rest) { last = { x, y, w, h, m: g.getTransform() }; return round.call(this, x, y, w, h, ...rest); };
    g.fillText = function(value, ...rest) {
      if (/뽑|배치|웨이브.*시작/.test(String(value)) && last) {
        const corners = [[last.x, last.y], [last.x + last.w, last.y + last.h]].map(([x, y]) => ({ x: cr.left + (last.m.a * x + last.m.c * y + last.m.e) * cr.width / cv.width, y: cr.top + (last.m.b * x + last.m.d * y + last.m.f) * cr.height / cv.height }));
        guide = { left: corners[0].x, top: corners[0].y, right: corners[1].x, bottom: corners[1].y, message: String(value) };
      }
      return text.call(this, value, ...rest);
    };
    try { q.draw(); } finally { g.roundRect = round; g.fillText = text; }
    const logs = [...document.querySelectorAll('#log-lines .log-line')].filter(el => el.checkVisibility() && el.getBoundingClientRect().height);
    const latest = logs.at(-1), panel = document.getElementById('log-panel');
    return { inHud: !!panel.closest('#hud'), hud: box(document.getElementById('hud')), logs: box(panel), latest: latest && box(latest), latestText: latest?.textContent,
      retained: document.querySelectorAll('#log-lines .log-line').length, guide, canvas: box(cv),
      controls: ['roll-btn', 'dice-slot', 'inf-panel', 'mini-top', 'stats', 'wave-btn'].map(id => ({ id, ...box(document.getElementById(id)) })) };
  });
  row.layout = sample;
  check(sample.inHud, true, row.name + ': logs occupy the HUD, not the live map');
  check(sample.retained >= 4 && /알림 4/.test(sample.latestText || ''), true, row.name + ': latest message remains readable and earlier log DOM remains');
  check(!!sample.latest && sample.logs.top >= sample.hud.top - 1 && sample.logs.bottom <= sample.hud.bottom + 1, true, row.name + ': log row stays inside the HUD');
  for (const control of sample.controls) if (control.width && control.height) check(intersects(sample.logs, control), false, row.name + ': logs clear ' + control.id);
  check(!!sample.guide, true, row.name + ': initial instruction is rendered');
  if (sample.guide) {
    check(Math.abs((sample.guide.left + sample.guide.right) / 2 - (sample.canvas.left + sample.canvas.right) / 2) < 2, true, row.name + ': instruction remains centered');
    for (const id of ['mini-top', 'stats', 'wave-btn']) check(intersects(sample.guide, sample.controls.find(c => c.id === id)), false, row.name + ': instruction clears ' + id);
  }
  await page.evaluate(() => { DK.heldDie = 1; DKplace(7); DK.selTower = DK.towers[0]; DKsync(); __hudInteraction.fitStage(); });
  const selected = await page.evaluate(() => {
    const box = id => { const r = document.getElementById(id).getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
    return { info: box('info-panel'), logs: box('log-panel') };
  });
  check(intersects(selected.info, selected.logs), false, row.name + ': selected tower information reserves the log row');
  if (row.name === 'phone') {
    const keyboard = await page.evaluate(() => {
      const wrap = document.getElementById('wrap'), form = document.getElementById('chat-form');
      const box = id => { const r = document.getElementById(id).getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
      form.classList.remove('hidden'); wrap.style.setProperty('--kb', '0px');
      const before = box('chat-input'); wrap.style.setProperty('--kb', '180px');
      const sample = { before, after: box('chat-input'), info: box('info-panel'), logs: box('log-panel') };
      wrap.style.setProperty('--kb', '0px'); form.classList.add('hidden'); return sample;
    });
    row.keyboard = keyboard;
    check(Math.abs(keyboard.before.top - keyboard.after.top - 180) < 1, true, row.name + ': keyboard inset raises the actual chat input by 180px');
    check(intersects(keyboard.info, keyboard.logs), false, row.name + ': keyboard HUD keeps tower information clear of logs and chat');
  }
}

async function rewardLayout(page, row, label) {
  const sample = await page.evaluate(() => {
    const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return { panel: box(document.getElementById('boss-reward')), hud: box(document.getElementById('hud')),
      parts: ['.boss-reward-card', '#boss-reward-title', '#boss-reward-message', '#boss-reward-odds', '#boss-reward-open', '#boss-reward-art']
        .map(selector => ({ selector, ...box(document.querySelector(selector)) })) };
  });
  (row.rewardLayouts ||= []).push({ label, ...sample });
  check(intersects(sample.panel, sample.hud), false, row.name + ': ' + label + ' reward stays above the HUD');
  for (const part of sample.parts) check(contains(sample.panel, part) && part.width > 0 && part.height > 0, true,
    row.name + ': ' + label + ' ' + part.selector + ' stays inside the reward panel');
  const art = sample.parts.find(p => p.selector === '#boss-reward-art');
  check(art.width >= 60 && art.height >= 60, true, row.name + ': ' + label + ' reward art remains visible at least 60px');
}

async function rewards(page, row) {
  for (const state of ['manual', 'held', 'selected']) {
    const initial = await begin(page, state); row[state] = { initial };
    check(initial.queue, ['boss', 'boss'], row.name + ': two boss kills save two unopened rewards');
    check(initial.hidden && initial.draws === 0, true, row.name + ': rewards defer during ' + state);
    await page.screenshot({ path: path.join(out, row.name + '-' + state + '.png') });
    if (state === 'selected') {
      await centerClick(page, '#info-close');
      await page.evaluate(() => __hudInteraction.pulse());
      check(await page.evaluate(() => !DK.selTower && !document.getElementById('boss-reward').classList.contains('hidden')), true, row.name + ': reward becomes available after selection closes');
      continue;
    }
    let held = 4;
    if (state === 'manual') {
      const result = await thrownResult(page); row.manual.result = result; held = result.held;
      check(held >= 1 && held <= 8 && !result.active, true, row.name + ': actual throw settles without reward interception');
      check(result.queue, ['boss', 'boss'], row.name + ': throwing does not consume unopened rewards');
    }
    await padClick(page, 8);
    const placed = await page.evaluate(() => ({ face: DK.towers.find(t => t.spot === 8)?.face, held: DK.heldDie, queue: DK.inf.queue.slice(), draws: __rewardDraws }));
    row[state].placed = placed;
    check(placed, { face: held, held: 0, queue: ['boss', 'boss'], draws: 0 }, row.name + ': real pad click places ' + state + ' die before rewards');
    if (state !== 'manual' || placed.face !== held || placed.held) continue;
    for (const [i, kind] of ['d8', 'd12'].entries()) {
      await page.evaluate(() => __hudInteraction.pulse());
      await rewardLayout(page, row, 'unopened ' + kind);
      await centerClick(page, '#boss-reward-open'); await centerClick(page, '#boss-reward-open');
      const opened = await page.evaluate(() => ({ draws: __rewardDraws, queue: DK.inf.queue.slice() }));
      check(opened, { draws: i + 1, queue: i === 0 ? [kind, 'boss'] : [kind] }, row.name + ': duplicate taps open reward ' + (i + 1) + ' once');
      await page.evaluate(() => __hudInteraction.updateBossReward(1.25));
      await rewardLayout(page, row, 'opened ' + kind);
      await page.evaluate(() => { __hudInteraction.updateBossReward(3.1); __hudInteraction.pumpQueue(); __hudInteraction.pulse(); });
      check(await page.evaluate(() => ({ kind: DKSLOT.kind, active: DKSLOT.active, hidden: document.getElementById('boss-reward').classList.contains('hidden'), queue: DK.inf.queue.slice() })),
        { kind, active: true, hidden: true, queue: i === 0 ? ['boss'] : [] }, row.name + ': next overlay waits for the current reward die');
      const result = await thrownResult(page);
      check(result.held >= 1 && result.held <= (i === 0 ? 8 : 12), true, row.name + ': reward die settles physically');
      await padClick(page, 9 + i);
    }
    check(await page.evaluate(() => ({ queue: DK.inf.queue.slice(), draws: __rewardDraws, gold: DK.gold, held: DK.heldDie })),
      { queue: [], draws: 2, gold: initial.gold, held: 0 }, row.name + ': both rewards survive sequential input and never charge gold again');
  }
}

(async () => {
  const browser = await launchBrowser();
  try {
    for (const [name, width, height] of [['desktop', 1280, 720], ['landscape-phone', 844, 390], ['small-landscape', 568, 320], ['phone', 390, 844]]) {
      const row = { name, viewport: { width, height } }; report.cases.push(row);
      const { page, context, errors } = await boot(browser, row.viewport);
      try { await layout(page, row); await rewards(page, row); check(errors, [], name + ': no browser errors'); }
      finally { await context.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
    }
    assert.deepEqual(report.failures, [], 'HUD interaction regressions'); report.pass = true;
    console.log('PASS HUD interaction: live-map clearance, latest HUD logs, centered opening guide and two queued boss rewards across manual/held/selected input');
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
