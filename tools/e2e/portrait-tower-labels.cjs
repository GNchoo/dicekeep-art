// Verify readable tower labels on a fully occupied portrait arena.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, gameUrl, outputPath } = require('./browser.cjs');

const out = path.dirname(outputPath('portrait-tower-labels/report.json'));
fs.mkdirSync(out, { recursive: true });

async function inspect(page, name, width, height, baseTowers = false) {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => __towerLabelQA.fitStage());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(key => DK.mapKey === key, name === 'landscape' ? 'cInf' : 'cInfP');
  const result = await page.evaluate(baseTowers => {
    DK.paused = true;
    DK.muted = true;
    DK.heldDie = 0;
    DK.enemies = [];
    DK.corpses = [];
    DK.fxs = [];
    DK.projs = [];
    DK.texts = [];
    DK.towers = DKspots().map(([x, y], spot) => {
      const face = baseTowers ? 1 + (spot % 6) : 7 + (spot % 14);
      return { face, def: DKTD[face], lvl: spot % 3 + 1, spot, x, y, skin: 0, cd: 0 };
    });
    const rects = [], texts = [];
    const g = __towerLabelQA.ctx;
    const original = g.roundRect, originalText = g.fillText;
    g.roundRect = function (x, y, w, h, r) {
      rects.push({ x, y, w, h });
      return original.call(this, x, y, w, h, r);
    };
    g.fillText = function (str, x, y, ...rest) {
      texts.push({ str: String(str), x, y, font: g.font, width: g.measureText(str).width });
      return originalText.call(this, str, x, y, ...rest);
    };
    try { __towerLabelQA.draw(); } finally { g.roundRect = original; g.fillText = originalText; }
    const portrait = DK.mapKey === 'cInfP';
    const labels = DK.towers.map(t => rects.find(r =>
      Math.abs(r.x + r.w / 2 - t.x) < 0.01 &&
      Math.abs(r.y + r.h / 2 - (t.y + (portrait ? 17 : -112))) < 0.01));
    const dots = portrait ? [] : DK.towers.map(t => rects.find(r =>
      Math.abs(r.x + r.w / 2 - t.x) < 0.01 &&
      Math.abs(r.y + r.h / 2 - (t.y + 15)) < 0.01));
    const scale = g.canvas.getBoundingClientRect().width / g.canvas.width;
    const labelText = DK.towers.map(t => texts.filter(a => Math.abs(a.y - (t.y + 17.5)) < 0.01
      && Math.abs(a.x - t.x) < 50));
    const overlaps = [];
    for (const a of labels) for (const b of portrait ? labels : dots) {
      if (!a || !b || a === b) continue;
      const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (dx > 0 && dy > 0) overlaps.push({ a, b, dx, dy });
    }
    const nextRowClearance = portrait ? DK.towers.map((t, i) => {
      const next = DK.towers[i + 3];
      return next ? (next.y + 11 - __towerLabelQA.towerSpr(next.face, next.skin).h)
        - (labels[i].y + labels[i].h) : null;
    }).filter(x => x !== null) : [];
    const renderedText = portrait ? labelText.flat() : [];
    const minCssFont = renderedText.length
      ? Math.min(...renderedText.map(a => Number(/(\d+)px/.exec(a.font)?.[1] || 0) * scale)) : null;
    const textOutside = portrait ? labelText.flatMap((parts, i) => parts.filter(a => {
      const r = labels[i];
      return !r || a.x - a.width / 2 < r.x + 3 || a.x + a.width / 2 > r.x + r.w - 3;
    })) : [];
    return { mapKey: DK.mapKey, towers: DK.towers.length, labels: labels.filter(Boolean).length,
      dots: dots.filter(Boolean).length, overlaps, nextRowClearance, minCssFont,
      textOutside, textParts: labelText.map(x => x.map(t => t.str)), scale };
  }, baseTowers);
  assert.equal(result.towers, 15, `${name}: all tower cells occupied`);
  assert.equal(result.labels, 15, `${name}: all labels drawn`);
  assert.deepEqual(result.overlaps, [], `${name}: label plaques do not overlap`);
  if (name !== 'landscape') {
    assert.ok(result.nextRowClearance.every(gap => gap >= 0),
      `${name}: labels do not cover the next row's sprite`);
    assert.ok(result.minCssFont >= 12.5, `${name}: label text is at least 12.5 CSS px`);
    assert.deepEqual(result.textOutside, [], `${name}: text fits in each plaque`);
    assert.ok(result.textParts.every(parts => parts.length === (baseTowers ? 1 : 2)),
      `${name}: both grade and level remain visible`);
  } else assert.equal(result.dots, 15, 'landscape keeps its level dots');
  await page.screenshot({ path: outputPath(`portrait-tower-labels/${name}.png`) });
  return { name, width, height, mapKey: result.mapKey, towers: result.towers,
    labels: result.labels, levelPills: result.dots,
    minimumNextRowClearance: result.nextRowClearance.length ? Math.min(...result.nextRowClearance) : null,
    minCssFont: result.minCssFont, stageScale: result.scale, overlapCount: result.overlaps.length,
    textParts: result.textParts.slice(0, 3) };
}

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1240, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.route('**/game.js*', async route => {
      const response = await route.fetch(), source = await response.text();
      const anchor = 'window.DK = S;';
      assert.ok(source.includes(anchor), 'game hook exists');
      await route.fulfill({ response, body: source.replace(anchor,
        'window.__towerLabelQA={ctx,draw,towerSpr,fitStage}; window.DK = S;') });
    });
    await page.addInitScript(() => {
      localStorage.setItem('dk_coachDone', '1');
      localStorage.setItem('dk_infHelpSeen', '1');
    });
    await page.goto(gameUrl());
    await page.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 });
    await page.evaluate(() => { DKstartInf('clear'); DK.paused = true; });
    const report = [];
    report.push(await inspect(page, 'portrait-440', 440, 956));
    report.push(await inspect(page, 'portrait-390', 390, 844));
    report.push(await inspect(page, 'portrait-320', 320, 700));
    report.push(await inspect(page, 'portrait-base-390', 390, 844, true));
    report.push(await inspect(page, 'landscape', 1240, 860));
    assert.deepEqual(errors, [], 'no browser errors');
    fs.writeFileSync(outputPath('portrait-tower-labels/report.json'), JSON.stringify(report, null, 2));
    console.log('PASS portrait tower labels', JSON.stringify(report));
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
