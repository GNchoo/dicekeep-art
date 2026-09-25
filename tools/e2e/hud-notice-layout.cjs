// The boss clock is painted on the canvas while reward notices are DOM nodes.
// Measure the actual rendered boxes together; CSS-only or source-formula checks miss overlap.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { launchBrowser, gameUrl, outputPath } = require('./browser.cjs');

const layouts = [
  { width: 514, height: 850, minTopFont: 14 }, // reported viewport, between tiny and <=480 rules
  { width: 480, height: 800, minTopFont: 13 },
  { width: 481, height: 850, minTopFont: 14 },
  { width: 390, height: 844, minTopFont: 13 },
  { width: 600, height: 900, minTopFont: 14 },
  { width: 768, height: 1024, minTopFont: 14 },
  { width: 850, height: 514, minTopFont: 12 },
  { width: 844, height: 390, minTopFont: 12 },
  { width: 667, height: 375, minTopFont: 12 },
];
const rectOverlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const noticeKey = id => id === 'enhance-toast' ? 'enhance' : 'chest';

(async () => {
  const browser = await launchBrowser();
  const results = [], errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 514, height: 850 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem('dk_coachDone', '1');
      localStorage.setItem('dk_infHelpSeen', '1');
    });
    await page.route('**/game.js*', async route => {
      const response = await route.fetch(), source = await response.text();
      const anchor = 'window.DK = S;';
      assert.equal(source.split(anchor).length, 2, 'one game QA hook anchor');
      await route.fulfill({ response, body: source.replace(anchor,
        'window.__hudNoticeQA = { draw, ctx, fitStage, stageNotice }; window.DK = S;') });
    });
    await page.goto(gameUrl());
    await page.waitForFunction(() => window.DK?.phase === 'title' && window.__hudNoticeQA, null, { timeout: 120000 });
    await page.click('#ov-btn');
    await page.evaluate(() => {
      DKstartInf('clear');
      DK.paused = true;
      DK.muted = true;
      DK.wave = 60;
      DK.waveActive = true;
      DK.inf.bossT = 240;
      DK.bannerT = 0;
      DKsync();
      __hudNoticeQA.fitStage();
    });
    await page.evaluate(() => document.fonts.ready);

    // The timer's last roundRect precedes its fillText in draw(). Record that
    // canvas rectangle with its live transform, then map it to CSS screen pixels.
    const measure = async () => page.evaluate(() => {
      const cv = document.getElementById('game'), g = __hudNoticeQA.ctx;
      const originalRound = g.roundRect, originalText = g.fillText;
      let lastRound = null, timer = null;
      g.roundRect = function(x, y, w, h, ...rest) {
        const m = g.getTransform();
        lastRound = { x, y, w, h, matrix: { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f } };
        return originalRound.call(this, x, y, w, h, ...rest);
      };
      g.fillText = function(value, ...rest) {
        const text = String(value);
        if (/^보스(?: 웨이브)?\s*\d+.*\d:\d{2}/.test(text) && lastRound) {
          timer = { ...lastRound, text, font: g.font };
        }
        return originalText.call(this, value, ...rest);
      };
      try { __hudNoticeQA.draw(); }
      finally { g.roundRect = originalRound; g.fillText = originalText; }
      const canvas = cv.getBoundingClientRect();
      const toCss = (x, y, m) => ({
        x: canvas.left + (m.a * x + m.c * y + m.e) * canvas.width / cv.width,
        y: canvas.top + (m.b * x + m.d * y + m.f) * canvas.height / cv.height,
      });
      const box = timer && (() => {
        const corners = [[timer.x, timer.y], [timer.x + timer.w, timer.y],
          [timer.x, timer.y + timer.h], [timer.x + timer.w, timer.y + timer.h]]
          .map(([x, y]) => toCss(x, y, timer.matrix));
        return { left: Math.min(...corners.map(p => p.x)), top: Math.min(...corners.map(p => p.y)),
          right: Math.max(...corners.map(p => p.x)), bottom: Math.max(...corners.map(p => p.y)) };
      })();
      const node = target => {
        const el = typeof target === 'string' ? document.getElementById(target) : target;
        if (!el) return null;
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom,
          width: r.width, height: r.height, font: parseFloat(cs.fontSize), visible: !!r.width && !!r.height,
          text: el.textContent };
      };
      return { width: innerWidth, height: innerHeight, stageClass: document.getElementById('stage').className,
        timer: box, timerText: timer?.text || '', timerFont: timer ? Number(timer.font.match(/([\d.]+)px/)?.[1] || 0) * canvas.width / cv.width : 0,
        gold: node('gold-val'), lives: node('lives-val'), wave: node('wave-val'),
        powerLevel: node(document.querySelector('.inf-lv')),
        powerCost: node(document.querySelector('.inf-cost')),
        rollButton: node('roll-btn'), waveButton: node('wave-btn'),
        stats: node('stats'), mini: node('mini-top'), chest: node('chest-reveal'), enhance: node('enhance-toast'),
        overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });

    for (const layout of layouts) {
      await page.setViewportSize({ width: layout.width, height: layout.height });
      await page.evaluate(() => { DK.inf.bossT = 240; DKsync(); __hudNoticeQA.fitStage(); });
      await page.waitForTimeout(100); // let ResizeObserver and CSS layout settle
      const sample = { layout, plain: await measure(), notices: {} };
      for (const [id, text, tag] of [
        ['enhance-toast', '★18 강화 성공', 'up'],
        ['chest-reveal', '전설 20면체 획득', 'mythic'],
      ]) {
        await page.evaluate(({ id, text, tag }) => __hudNoticeQA.stageNotice(id, text, tag, 3000), { id, text, tag });
        await page.waitForTimeout(260); // wait past the 220ms entrance animation
        sample.notices[id] = await measure();
        if (layout.width === 514) await page.screenshot({ path: outputPath(`hud-notice-layout-514-${id}.png`) });
      }
      results.push(sample);
      console.log(`${layout.width}x${layout.height} top=${[sample.plain.gold.font, sample.plain.lives.font, sample.plain.wave.font].join('/')}px timer=${JSON.stringify(sample.plain.timer)} overlaps=${Object.entries(sample.notices).map(([id, s]) => `${id}:${s.timer ? rectOverlap(s.timer, s[noticeKey(id)]).toFixed(1) : 'timer absent'}`).join(',')}`);
    }

    // Resize while a notice is already visible, including the 480px CSS boundary.
    await page.setViewportSize({ width: 514, height: 850 });
    await page.evaluate(() => { DKsync(); __hudNoticeQA.fitStage(); __hudNoticeQA.stageNotice('enhance-toast', '★18 강화 성공', 'up', 3000); });
    await page.waitForTimeout(260);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => __hudNoticeQA.fitStage());
    const resized = await measure();
    // Simulate a notched phone and inspect the first synchronous draw after reflow.
    await page.setViewportSize({ width: 514, height: 850 });
    await page.evaluate(() => {
      for (const [key, value] of Object.entries({ t: 28, r: 18, b: 20, l: 18 }))
        document.documentElement.style.setProperty(`--sa-${key}`, `${value}px`);
      __hudNoticeQA.fitStage();
      __hudNoticeQA.stageNotice('chest-reveal', '전설 20면체 획득', 'mythic', 3000);
    });
    const safeArea = await measure();
    fs.writeFileSync(outputPath('hud-notice-layout-report.json'), JSON.stringify({ results, resized, safeArea }, null, 2));

    for (const { layout, plain, notices } of results) {
      const label = `${layout.width}x${layout.height}`;
      assert.ok(plain.timer && /보스.*\d:\d{2}/.test(plain.timerText), `${label}: boss countdown is rendered`);
      assert.ok(plain.timer.left >= -1 && plain.timer.right <= layout.width + 1
        && plain.timer.top >= -1 && plain.timer.bottom <= layout.height + 1,
      `${label}: boss countdown stays inside viewport`);
      for (const id of ['gold', 'lives', 'wave']) {
        assert.ok(plain[id].font >= layout.minTopFont,
          `${label}: ${id} top HUD ${plain[id].font}px < ${layout.minTopFont}px`);
      }
      assert.equal(plain.overflow, false, `${label}: no horizontal overflow`);
      assert.ok(rectOverlap(plain.stats, plain.mini) <= 1, `${label}: resources and controls do not overlap`);
      for (const [id, state] of Object.entries(notices)) {
        const n = state[noticeKey(id)];
        assert.ok(n.visible, `${label}: ${id} is visible`);
        assert.ok(n.left >= -1 && n.right <= layout.width + 1 && n.top >= -1 && n.bottom <= layout.height + 1,
          `${label}: ${id} stays inside viewport`);
        assert.ok(state.timer && rectOverlap(state.timer, n) <= 1,
          `${label}: ${id} overlaps boss countdown by ${state.timer && rectOverlap(state.timer, n).toFixed(1)} CSS px²`);
        assert.ok(Math.abs(state.timer.top - plain.timer.top) < 1,
          `${label}: boss countdown does not move when ${id} appears`);
        assert.ok(rectOverlap(state.stats, n) <= 1,
          `${label}: ${id} overlaps top resources by ${rectOverlap(state.stats, n).toFixed(1)} CSS px²`);
        assert.ok(rectOverlap(state.mini, n) <= 1,
          `${label}: ${id} overlaps top controls by ${rectOverlap(state.mini, n).toFixed(1)} CSS px²`);
      }
    }
    assert.ok(resized.enhance.visible && resized.timer && rectOverlap(resized.timer, resized.enhance) <= 1,
      `notice must stay clear of boss timer after live resize: ${resized.timer && rectOverlap(resized.timer, resized.enhance).toFixed(1)} CSS px²`);
    assert.ok(safeArea.chest.visible && safeArea.timer && safeArea.stats.top >= 27 && safeArea.mini.top >= 27,
      'notched phone safe area reflows the notice and top HUD on the first draw');
    for (const [key, box] of [['timer', safeArea.timer], ['stats', safeArea.stats], ['mini', safeArea.mini]]) {
      assert.ok(rectOverlap(box, safeArea.chest) <= 1,
        `safe-area chest notice overlaps ${key} by ${rectOverlap(box, safeArea.chest).toFixed(1)} CSS px²`);
    }
    assert.deepEqual(errors, [], 'no page errors');
    console.log('PASS HUD and boss-notice layout', outputPath('hud-notice-layout-report.json'));
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; });
