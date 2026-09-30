// Local browser QA for the deterministic dice tree. Resource balances below are
// explicit fixtures; every tested progression/deck write uses the real UI.
// Isolated browser contexts never touch the user's session or payment account.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, gameUrl } = require('./browser.cjs');
const repo = path.resolve(__dirname, '../..');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/tree-collection'));
const layoutOnly = process.argv.includes('--layout-only');
const url = new URL(gameUrl(false));
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'tree QA requires a local game server');
fs.mkdirSync(out, { recursive: true });
const report = { url: url.href, started: new Date().toISOString(), cases: [], pass: false,
  scope: 'Fresh isolated local guest accounts; deterministic tree actions through visible buttons, persisted profile and deck state, actual icons, desktop/mobile geometry. Test resources are fixtures, not earned rewards. No purchase/account endpoint is used.' };
const card = (page, id) => page.locator(`#deck-grid [data-card="${id}"]`);
const slot = (page, index) => page.locator(`#deck-selected [data-slot="${index}"]`);
const preset = (page, index) => page.locator(`#deck-presets [data-preset="${index}"]`);
const profile = page => page.evaluate(() => JSON.parse(JSON.stringify(__treeUIQA.getSAVE().progression)));
const draft = page => page.locator('#deck-selected [data-slot]').evaluateAll(els => els
  .sort((a, b) => +a.dataset.slot - +b.dataset.slot).map(el => +el.dataset.face));
const check = (row, name, actual, expected) => { assert.deepEqual(actual, expected, name); row.checks.push(name); };
async function ready(page) {
  await page.waitForFunction(() => window.__treeUIQAError || (window.DK?.phase === 'title' && window.__treeUIQA && window.DKPROGRESSION && window.DKDECKRULES), null, { timeout: 120000 });
  const error = await page.evaluate(() => window.__treeUIQAError); if (error) throw Error(error);
}
async function openCollection(page) {
  await page.click('#ov-btn'); await page.evaluate(() => DKlobbyView('single'));
  await page.click('#lobby-box [data-menu-target=deck]'); await page.click('[data-dice-page=lineup]'); await page.waitForSelector('#deck-presets [data-preset="0"]');
}
async function catalog(page,id) { await page.click('[data-dice-page=catalog]'); const family=await page.evaluate(id=>DKTREERULES.families.find(f=>f.cards.includes(id)).id,id); await page.click(`[data-family="${family}"]`); }
async function openCard(page,id) { await catalog(page,id); await card(page,id).click(); }
async function support(page) { await page.click('[data-dice-page=overview]'); await page.click('[data-open-dice=support]'); }
async function equip(page, index, id) { await page.click('[data-dice-page=lineup]'); await slot(page, index).click(); await openCard(page, id); await page.click('#deck-equip'); }
async function resources(page, values) {
  await page.evaluate(values => {
    const p = __treeUIQA.getSAVE().progression;
    if (values.shards !== undefined) p.shards = values.shards;
    if (values.gold !== undefined) p.collection.gold = values.gold;
    __treeUIQA.saveSave(); __treeUIQA.renderDeck(true);
  }, values);
}
async function layout(page, row, name) {
  const result = await page.evaluate(() => {
    const issues = [], boxes = [];
    for (const selector of ['#deck-panel', '#deck-presets', '#deck-selected', '.deck-actions', '.deck-filters', '#deck-grid', '#deck-detail', '#tree-families', '#tree-supporters']) {
      const e = document.querySelector(selector); if (!e) continue;
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
      boxes.push({ selector, x: r.x, width: r.width, scrollWidth: e.scrollWidth, clientWidth: e.clientWidth });
      if (r.left < -1 || r.right > innerWidth + 1) issues.push('outside viewport: ' + selector);
      if (e.scrollWidth > e.clientWidth + 1) issues.push('horizontal overflow: ' + selector);
    }
    const detail = document.querySelector('#deck-detail')?.getBoundingClientRect(), grid = document.querySelector('#deck-grid')?.getBoundingClientRect();
    if (detail?.width && grid?.width && detail.bottom > grid.top + 1) issues.push('selected detail obscures tree nodes');
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('page horizontal overflow');
    return { viewport: [innerWidth, innerHeight], boxes, issues };
  });
  row.layouts.push({ name, ...result }); check(row, name + ': no horizontal overflow', result.issues, []);
}
async function decks(page, row) {
  check(row, 'five cards have five readable roles', await page.locator('#deck-synergy .deck-roles b').allTextContents(), ['2','2','1','0','0']);
  check(row, 'initial direct and boss DPS match combat formula', await page.locator('#deck-synergy .deck-metrics b').evaluateAll(els=>els.map(el=>parseFloat(el.textContent.replace(/,/g,'')))), [372.2,372.2]);
  await equip(page, 0, 6); check(row, 'owned card replaces selected slot', await draft(page), [6, 2, 3, 4, 5]);
  check(row, 'economic replacement lowers direct damage and warns before saving', {score:await page.locator('#deck-synergy .deck-metrics b').first().evaluate(el=>parseFloat(el.textContent)),down:await page.locator('#deck-synergy .metric-down').count()}, {score:299,down:2});
  await equip(page, 0, 2); check(row, 'already equipped card swaps without duplicates', await draft(page), [2, 6, 3, 4, 5]);
  await page.click('#deck-save');
  let p = await profile(page);
  check(row, 'active preset save persists its five distinct identities', { deck: p.deck, preset: p.collection.presets[0].faces }, { deck: [2, 6, 3, 4, 5], preset: [2, 6, 3, 4, 5] });
  await preset(page, 1).click(); await equip(page, 4, 6); await page.click('#deck-save'); p = await profile(page);
  check(row, 'inactive preset save preserves active deck', { active: p.collection.activePreset, deck: p.deck, other: p.collection.presets[1].faces }, { active: 0, deck: [2, 6, 3, 4, 5], other: [1, 2, 3, 4, 6] });
  await page.click('[data-dice-page=overview]');
  check(row, 'overview identifies browsed inactive deck', /덱 2 · 미사용/.test(await page.locator('.current-deck').innerText()), true);
  await page.locator('.current-deck').click();check(row, 'overview opens the exact deck it shows', await draft(page), [1,2,3,4,6]);
  await page.click('#deck-use'); p = await profile(page);
  check(row, 'activate preset preserves other saved decks', { active: p.collection.activePreset, deck: p.deck, preserved: p.collection.presets[0].faces }, { active: 1, deck: [1, 2, 3, 4, 6], preserved: [2, 6, 3, 4, 5] });
  await equip(page, 0, 3); const unsaved = await draft(page), before = await profile(page);
  if (!await preset(page, 2).isDisabled()) await preset(page, 2).click();
  check(row, 'dirty draft blocks silent preset switch', await draft(page), unsaved);
  check(row, 'blocked preset switch preserves stored profile', await profile(page), before);
  await page.click('#deck-reset'); check(row, 'cancel restores saved deck', await draft(page), [1, 2, 3, 4, 6]);
  await preset(page, 2).click(); check(row, 'clean draft can browse another preset', await draft(page), [1, 2, 3, 4, 5]);
  check(row, 'browsing preset does not activate it', (await profile(page)).collection.activePreset, 1);
  await preset(page, 1).click();
}
async function treeActions(page, row) {
  await page.click('[data-dice-page=catalog]');
  const families = await page.evaluate(() => DKTREERULES.families);
  check(row, 'tree exposes five distinct four-card families', { families: families.length, cards: new Set(families.flatMap(f => f.cards)).size }, { families: 5, cards: 20 });
  for (const f of families) {
    await page.locator(`#tree-families [data-family="${f.id}"]`).click();
    check(row, f.name + ' filter displays its four cards in prerequisite order', await page.locator('#deck-grid [data-card]').evaluateAll(els => els.map(el => +el.dataset.card)), f.cards);
  }

  row.icons = [];
  for (let id = 1; id <= 20; id++) {
    await catalog(page,id);
    await page.waitForFunction(id => { const img = document.querySelector(`#deck-grid [data-card="${id}"] img`); return img?.complete && img.naturalWidth > 0; }, id);
    const icon = await card(page, id).locator('img').first().evaluate(async img => { await img.decode(); return { src: img.currentSrc || img.src, width: img.naturalWidth, height: img.naturalHeight }; });
    row.icons.push({ id, ...icon });
  }
  check(row, 'all 20 tower-identity thumbnails are individually distinct', new Set(row.icons.map(i => i.src)).size, 20);
  check(row, 'all 20 thumbnails decode with visible dimensions', row.icons.every(i => i.width > 0 && i.height > 0), true);
  // Keep the report readable; screenshots retain the actual images.
  row.icons = row.icons.map(({ src, ...icon }) => ({ ...icon, kind: src.startsWith('data:image/') ? 'generated tower thumbnail' : src }));
  const beforeChoice = await profile(page);
  check(row, 'all three supporters are available without currency', await page.locator('#tree-supporters [data-supporter]').count(), 3);
  await support(page);
  for (const id of ['crusher', 'barrage', 'supply']) {
    await page.locator(`#tree-supporters [data-supporter="${id}"]`).click();
    const after = await profile(page);
    check(row, 'supporter ' + id + ' selected and persisted for free', { supporter: after.tree.supporter, gold: after.collection.gold, shards: after.shards }, { supporter: id, gold: beforeChoice.collection.gold, shards: beforeChoice.shards });
  }
  for (const f of families) {
    const last = f.cards[f.cards.length - 1], initial = await profile(page);
    if (!initial.collection.cards[last].owned && !initial.collection.cards[f.cards.at(-2)].owned) {
      await resources(page, { gold: 100000, shards: 100000 }); await openCard(page, last);
      check(row, f.name + ' final card remains locked before its prerequisite', await page.locator('#tree-unlock').isDisabled(), true);
    }
    for (const id of f.cards) {
      if ((await profile(page)).collection.cards[id].owned) continue;
      const cost = await page.evaluate(id => DKTREERULES.unlockCost(id), id);
      await resources(page, { gold: cost.gold - 1, shards: cost.shards }); await openCard(page, id);
      check(row, 'card ' + id + ' unlock disabled below exact gold cost', await page.locator('#tree-unlock').isDisabled(), true);
      if (cost.shards) {
        await resources(page, { gold: cost.gold, shards: cost.shards - 1 }); await openCard(page, id);
        check(row, 'card ' + id + ' unlock disabled below exact shard cost', await page.locator('#tree-unlock').isDisabled(), true);
      }
      await resources(page, { gold: cost.gold, shards: cost.shards }); await openCard(page, id);
      const before = await profile(page); await page.click('#tree-unlock'); const after = await profile(page);
      check(row, 'card ' + id + ' deterministic unlock spends exact shown resources', { owned: after.collection.cards[id].owned, gold: after.collection.gold, shards: after.shards, mastery: after.tree.mastery[id], rng: after.collection.rng, packs: after.collection.packs }, { owned: true, gold: 0, shards: 0, mastery: 0, rng: before.collection.rng, packs: before.collection.packs });
      for (let other = 1; other <= 20; other++) if (other !== id) assert.deepEqual(after.collection.cards[other], before.collection.cards[other], 'unlock changed unrelated card ' + other);
    }
  }
  check(row, 'all 20 types can be acquired through their five tree paths', Object.values((await profile(page)).collection.cards).filter(c => c.owned).length, 20);
  await openCard(page, 1);
  check(row, 'talent requires mastery 2', await page.locator('[data-talent="force"]').isDisabled(), true);
  check(row, 'awakening requires mastery 3', await page.locator('#tree-awaken').isDisabled(), true);
  for (let level = 0; level < 5; level++) {
    const cost = await page.evaluate(level => DKTREERULES.masteryCost(level), level);
    await resources(page, { gold: cost.gold - 1, shards: cost.shards }); await openCard(page, 1);
    check(row, 'mastery ' + (level + 1) + ' disabled below gold cost', await page.locator('#tree-upgrade').isDisabled(), true);
    await resources(page, { gold: cost.gold, shards: cost.shards }); await openCard(page, 1);
    const before = await profile(page); await page.click('#tree-upgrade'); const after = await profile(page);
    check(row, 'mastery ' + (level + 1) + ' exact deterministic debit', { mastery: after.tree.mastery[1], gold: after.collection.gold, shards: after.shards, rng: after.collection.rng }, { mastery: level + 1, gold: 0, shards: 0, rng: before.collection.rng });
    const rendered = await page.locator('.research-numbers b').first().textContent();
    const expected = await page.evaluate(() => {const p=__treeUIQA.getSAVE().progression;const st=DKDECKRULES.stats({face:1,pips:3},{treeVersion:1,...p.tree});return (st.dmg/st.rate).toLocaleString('ko-KR',{maximumFractionDigits:1});});
    check(row, 'research comparison refreshes after mastery '+(level+1), rendered.split(' → ')[0], expected);

    if (level + 1 === 2) {
      const baseline = await profile(page);
      await page.getByRole('button',{name:'특성',exact:true}).click();
      for (const talent of ['force', 'insight', 'force']) {
        await page.locator(`[data-talent="${talent}"]`).click();
        const changed = await profile(page);
        check(row, 'talent ' + talent + ' freely selected with no resource charge', { talent: changed.tree.talents[1], gold: changed.collection.gold, shards: changed.shards }, { talent, gold: baseline.collection.gold, shards: baseline.shards });
      }
      check(row, 'mastery 2 still cannot unlock awakening', await page.locator('#tree-awaken').isDisabled(), true);
    }
    if (level + 1 === 3) {
      const awaken = await page.evaluate(() => DKTREERULES.awakeningCost(1));
      await resources(page, { gold: awaken.gold, shards: awaken.shards }); await openCard(page, 1);
      await page.getByRole('button',{name:'각성',exact:true}).click(); await page.click('#tree-awaken'); const awakened = await profile(page);
      check(row, 'mastery 3 awakening unlock debits exact one-time cost', { unlocked: awakened.tree.awakenings[1], gold: awakened.collection.gold, shards: awakened.shards }, { unlocked: true, gold: 0, shards: 0 });
      check(row, 'unlocked awakening cannot be charged twice', await page.locator('#tree-awaken').isDisabled(), true);
      check(row, 'detail explains seven-pip awakening trigger', /7\s*눈금/.test(await page.locator('#deck-detail').innerText()), true);
    }
  }
  check(row, 'mastery is capped at five in the UI', await page.locator('#tree-upgrade').isDisabled(), true);
  // A progression choice must not throw away an unrelated unsaved deck edit.
  await equip(page, 0, 4); const pending = await draft(page); await support(page); await page.locator('#tree-supporters [data-supporter="crusher"]').click();
  check(row, 'supporter choice preserves an unsaved deck draft', await draft(page), pending);
  await page.click('[data-dice-page=lineup]'); await page.click('#deck-reset');
  for(const [i,id] of [7,18,14,13,6].entries())await equip(page,i,id);
  check(row, 'support guide preserves solitary tower condition and avoids double signs', {condition:/고독은 이웃을 비우세요/.test(await page.locator('#deck-synergy .deck-tactics').innerText()),negative:/−17.2%/.test(await page.locator('#deck-synergy .tactic-chain > strong').innerText()),doubleSign:/\+[-−]/.test(await page.locator('#deck-synergy .tactic-chain > strong').innerText())}, {condition:true,negative:true,doubleSign:false});
  check(row, 'negative solitary formation never draws a false support connection', await page.locator('#deck-synergy .tactic-pair b').allTextContents(), ['고독']);
  await page.click('#deck-reset');
  check(row, 'random pack and duplicate-card upgrade UI is retired for tree profiles', { packs: await page.locator('#deck-open-pack:visible').count(), classes: await page.locator('#deck-class-up:visible').count(), craft: await page.locator('#deck-craft:visible').count() }, { packs: 0, classes: 0, craft: 0 });
}
async function viewport(browser, tag, size) {
  const row = { tag, viewport: size, checks: [], layouts: [], errors: [], screenshots: [], pass: false }; report.cases.push(row);
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 }); const page = await context.newPage();
  page.on('pageerror', e => row.errors.push(e.stack || e.message));
  page.on('dialog', async dialog => { row.errors.push('unexpected dialog: ' + dialog.message()); await dialog.dismiss(); });
  await page.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
  await page.route('**/game.js*', async route => {
    try {
      const response = await route.fetch(), source = await response.text(), anchor = 'window.DK = S;';
      assert.equal(source.split(anchor).length, 2, 'unique game closure hook');
      await route.fulfill({ response, body: source.replace(anchor, 'window.__treeUIQA={getSAVE:()=>SAVE,saveSave,renderDeck};\n' + anchor) });
    } catch (error) { await route.fulfill({ contentType: 'application/javascript', body: 'window.__treeUIQAError=' + JSON.stringify(error.message) + ';' }); }
  });
  try {
    await page.goto(url.href); await ready(page); await openCollection(page);
    check(row, 'new profile has tree version 1', (await profile(page)).tree?.version, 1);
    check(row, 'five slots and three free deck presets', { slots: await page.locator('#deck-selected [data-slot]').count(), presets: await page.locator('#deck-presets [data-preset]').count() }, { slots: 5, presets: 3 });
    check(row, 'fresh test context has no network or linked commerce', await page.evaluate(() => ({ net: !!DKNET.CFG.url, linked: DKCOMMERCE.linked() })), { net: false, linked: false });
    await layout(page, row, 'initial tree');
    if (layoutOnly) {
      await openCard(page, 20); await layout(page, row, 'locked-card detail');
      await catalog(page,20); await layout(page, row, 'last tree node remains unobscured');
      await openCard(page, 1);
    } else { await decks(page, row); await treeActions(page, row); }
    await layout(page, row, 'after tree actions');
    for (const [name, selector] of [['overview', '.deck-heading'], ['supporters', '#tree-supporters'], ['tree', '#deck-grid'], ['detail', '#deck-detail']]) {
      if (!await page.locator(selector).count()) continue;
      if(name==='supporters')await support(page); if(name==='tree')await catalog(page,1); if(name==='detail')await openCard(page,1); if(!await page.locator(selector).isVisible())continue; const file = path.join(out, tag + (layoutOnly ? '-initial-' : '-') + name + '.png');
      await page.screenshot({ path: file }); row.screenshots.push(file);
    }
    if (!layoutOnly) {
      const saved = await profile(page); await page.reload(); await ready(page); await openCollection(page);
      check(row, 'all tree, resources, supporter and preset changes survive reload', await profile(page), saved);
      await layout(page, row, 'after reload');
    }
    check(row, 'no uncaught browser errors', row.errors, []);
    row.pass = true; console.log('PASS tree collection', tag, row.checks.length, 'checks');
  } catch (error) { row.failure = error.stack || String(error); await page.screenshot({ path: path.join(out, tag + '-failure.png') }).catch(() => {}); throw error; }
  finally { await context.close(); }
}
(async () => {
  const browser = await launchBrowser();
  try { for (const [tag, size] of [['desktop', { width: 1366, height: 900 }], ['phone', { width: 390, height: 844 }]]) await viewport(browser, tag, size); report.pass = true; }
  finally { fs.writeFileSync(path.join(out, layoutOnly ? 'layout-report.json' : 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
