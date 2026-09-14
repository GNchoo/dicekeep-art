// Actual collection UI in fresh, isolated browser contexts. Only this test's game
// response exports closure access for resource fixtures; production files and
// existing user sessions are untouched. No payment/account endpoint is invoked.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { launchBrowser, gameUrl } = require('./browser.cjs');

const repo = path.resolve(__dirname, '../..');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/deck-collection'));
const url = new URL(gameUrl(false));
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'collection QA must use a local game server');
fs.mkdirSync(out, { recursive: true });
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const report = {
  scope: 'Actual local guest collection UI, persisted resource changes, saved deck isolation and desktop/mobile viewport rendering. Resource balances are explicit test fixtures, not earned rewards; pack RNG is not replaced. No existing browser session or real payment is used.',
  url: url.href, started: new Date().toISOString(), viewports: [], passed: false,
};
const check = (row, name, actual, expected) => { assert.deepEqual(actual, expected, name); row.checks.push({ name, passed: true }); };
const card = (page, id) => page.locator(`#deck-grid [data-card="${id}"]`);
const slot = (page, index) => page.locator(`#deck-selected [data-slot="${index}"]`);
const preset = (page, index) => page.locator(`#deck-presets [data-preset="${index}"]`);
const profile = page => page.evaluate(() => JSON.parse(JSON.stringify(__collectionQA.getSAVE().progression)));
const draft = page => page.locator('#deck-selected [data-slot]').evaluateAll(els => els
  .sort((a, b) => +a.dataset.slot - +b.dataset.slot).map(el => +el.dataset.face));

async function ready(page) {
  await page.waitForFunction(() => window.__collectionQAError || (window.DK?.phase === 'title' && window.__collectionQA && window.DKPROGRESSION && window.DKDECKRULES), null, { timeout: 120000 });
  const error = await page.evaluate(() => window.__collectionQAError);
  if (error) throw new Error(error);
}

async function openCollection(page) {
  await page.click('#ov-btn');
  await page.evaluate(() => DKlobbyView('single'));
  await page.click('#btn-deck-open');
  await page.waitForSelector('#deck-presets [data-preset="0"]');
}

async function equip(page, index, id) {
  await slot(page, index).click();
  await card(page, id).click();
  await page.locator('#deck-equip').click();
}

// Only resource preconditions are prepared here. Upgrades, crafting, packs and
// deck writes below all use visible production buttons and their real handlers.
async function resources(page, values) {
  await page.evaluate(values => {
    const p = __collectionQA.getSAVE().progression;
    if (values.shards !== undefined) p.shards = values.shards;
    if (values.gold !== undefined) p.collection.gold = values.gold;
    if (values.face !== undefined) p.collection.cards[values.face].copies = values.copies;
    __collectionQA.saveSave();
    __collectionQA.renderDeck(true);
  }, values);
}

async function layout(page, row, name) {
  const result = await page.evaluate(() => {
    const issues = [], boxes = [];
    for (const selector of ['#deck-panel', '#deck-presets', '#deck-selected', '.deck-actions', '.deck-filters', '#deck-grid', '#deck-detail']) {
      const element = document.querySelector(selector), r = element.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      boxes.push({ selector, x: r.x, y: r.y, width: r.width, height: r.height, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth });
      if (r.left < -1 || r.right > innerWidth + 1) issues.push('outside viewport: ' + selector);
      if (element.scrollWidth > element.clientWidth + 1) issues.push('horizontal overflow: ' + selector);
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('page horizontal overflow');
    return { viewport: [innerWidth, innerHeight], boxes, issues };
  });
  row.layouts.push({ name, ...result });
  check(row, name + ': no horizontal overflow', result.issues, []);
}

async function imagesAndFilters(page, row) {
  const rules = await page.evaluate(() => DKDECKRULES.catalog.map(c => ({ id: c.id, rarity: c.rarity, tags: c.tags })));
  const initial = await profile(page);
  const expected = (filter, rarity) => rules.filter(c => (rarity === 'all' || c.rarity === rarity)
    && (filter === 'all' || filter === 'owned' && initial.collection.cards[c.id].owned
      || filter === 'locked' && !initial.collection.cards[c.id].owned || c.tags.includes(filter))).map(c => c.id).sort((a, b) => a - b);
  for (const [filter, rarity] of [['owned', 'all'], ['locked', 'all'], ['공격', 'all'], ['제어', 'all'], ['지원', 'all'], ['운영', 'all'], ['all', 'common'], ['all', 'rare'], ['all', 'unique'], ['all', 'legendary'], ['지원', 'rare']]) {
    await page.selectOption('#deck-filter', filter); await page.selectOption('#deck-rarity', rarity);
    const actual = await page.locator('#deck-grid [data-card]').evaluateAll(els => els.map(el => +el.dataset.card).sort((a, b) => a - b));
    check(row, `filter ${filter}/${rarity} matches the catalog and ownership`, actual, expected(filter, rarity));
  }
  await page.selectOption('#deck-filter', 'all'); await page.selectOption('#deck-rarity', 'all');
  row.icons = [];
  for (let id = 1; id <= 20; id++) {
    await card(page, id).scrollIntoViewIfNeeded();
    await page.waitForFunction(id => {
      const img = document.querySelector(`#deck-grid [data-card="${id}"] img`);
      return img?.complete && img.naturalWidth > 0;
    }, id, { timeout: 15000 });
    const image = await card(page, id).locator('img').first().evaluate(async img => {
      await img.decode(); return { src: img.currentSrc || img.src, width: img.naturalWidth, height: img.naturalHeight };
    });
    row.icons.push({ id, ...image });
  }
  check(row, 'all 20 real collection icons decode', row.icons.length, 20);
}

async function decks(page, row) {
  await equip(page, 0, 6);
  check(row, 'placing an owned sixth type replaces the selected slot', await draft(page), [6, 2, 3, 4, 5]);
  await equip(page, 0, 2);
  check(row, 'equipping an already selected type swaps slots without duplicates', await draft(page), [2, 6, 3, 4, 5]);
  await page.click('#deck-save');
  let p = await profile(page);
  check(row, 'active preset save keeps five distinct owned types', { deck: p.deck, preset: p.collection.presets[0].faces }, { deck: [2, 6, 3, 4, 5], preset: [2, 6, 3, 4, 5] });
  check(row, 'deck save writes local storage', await page.evaluate(() => JSON.parse(localStorage.getItem('DKSAVE')).progression.deck), p.deck);

  await preset(page, 1).click();
  await equip(page, 4, 6);
  await page.click('#deck-save');
  p = await profile(page);
  check(row, 'saving an inactive preset does not activate it or overwrite the current deck',
    { active: p.collection.activePreset, deck: p.deck, other: p.collection.presets[1].faces },
    { active: 0, deck: [2, 6, 3, 4, 5], other: [1, 2, 3, 4, 6] });
  await page.click('#deck-use');
  p = await profile(page);
  check(row, 'use preset changes only the active selection and compatibility deck',
    { active: p.collection.activePreset, deck: p.deck, preserved: p.collection.presets[0].faces },
    { active: 1, deck: [1, 2, 3, 4, 6], preserved: [2, 6, 3, 4, 5] });

  await equip(page, 0, 3);
  const unsaved = await draft(page), before = await profile(page);
  if (!await preset(page, 2).isDisabled()) await preset(page, 2).click();
  check(row, 'dirty draft prevents silently switching to another preset', await draft(page), unsaved);
  check(row, 'blocked switch leaves stored decks unchanged', await profile(page), before);
  await page.click('#deck-reset');
  check(row, 'reset restores the saved preset', await draft(page), [1, 2, 3, 4, 6]);
  await preset(page, 2).click();
  check(row, 'clean draft may switch to a different saved preset', await draft(page), [1, 2, 3, 4, 5]);
  check(row, 'viewing a preset alone never changes the active deck', (await profile(page)).collection.activePreset, 1);
  await preset(page, 1).click();
}

async function growth(page, row) {
  await card(page, 1).click();
  check(row, 'class button is disabled without duplicate cards', await page.locator('#deck-class-up').isDisabled(), true);
  const cost = await page.evaluate(() => DKPROGRESSION.classUpgradeCost(1, __collectionQA.getSAVE().progression.collection.cards[1].class));
  await resources(page, { face: 1, copies: cost.copies, gold: cost.gold - 1 });
  await card(page, 1).click();
  check(row, 'class button is disabled with enough cards but insufficient gold', await page.locator('#deck-class-up').isDisabled(), true);
  await resources(page, { face: 1, copies: cost.copies - 1, gold: cost.gold });
  await card(page, 1).click();
  check(row, 'class button is disabled with enough gold but insufficient cards', await page.locator('#deck-class-up').isDisabled(), true);
  await resources(page, { face: 1, copies: cost.copies, gold: cost.gold });
  await card(page, 1).click();
  let before = await profile(page);
  await page.click('#deck-class-up');
  let after = await profile(page);
  check(row, 'class upgrade debits exact cards and gold once',
    { card: after.collection.cards[1], gold: after.collection.gold, shards: after.shards },
    { card: { ...before.collection.cards[1], class: before.collection.cards[1].class + 1, copies: 0 }, gold: 0, shards: before.shards });
  check(row, 'class upgrade persists and next unaffordable upgrade is disabled',
    { card: await page.evaluate(() => JSON.parse(localStorage.getItem('DKSAVE')).progression.collection.cards[1]), disabled: await page.locator('#deck-class-up').isDisabled() },
    { card: after.collection.cards[1], disabled: true });

  await resources(page, { shards: 20 });
  await card(page, 13).click();
  const craft = await page.evaluate(() => DKPROGRESSION.craftCost(13));
  check(row, 'fixed craft price is 20 shards', craft.shards, 20);
  before = await profile(page);
  await page.click('#deck-craft');
  after = await profile(page);
  check(row, 'selected card crafting grants the known card and consumes fixed shards without RNG',
    { owned: after.collection.cards[13].owned, copies: after.collection.cards[13].copies, shards: after.shards, rng: after.collection.rng, packs: after.collection.packs, gold: after.collection.gold },
    { owned: true, copies: craft.copies - 1, shards: 0, rng: before.collection.rng, packs: before.collection.packs, gold: before.collection.gold });
  for (let id = 1; id <= 20; id++) if (id !== 13) assert.deepEqual(after.collection.cards[id], before.collection.cards[id], 'craft changed another card ' + id);
  check(row, 'craft becomes disabled when shards are depleted', await page.locator('#deck-craft').isDisabled(), true);
  row.craft = { face: 13, shardsSpent: 20, copies: craft.copies, rngUnchanged: true };
}

async function pack(page, row) {
  const before = await profile(page);
  await page.click('#deck-open-pack');
  await page.waitForFunction(() => document.querySelectorAll('#deck-pack-result [data-reward-face]').length === 5);
  const after = await profile(page);
  const awards = await page.locator('#deck-pack-result [data-reward-face]').evaluateAll(els => els.map(el => ({ face: +el.dataset.rewardFace, text: el.textContent })));
  const actualDelta = {}, displayed = {};
  for (let id = 1; id <= 20; id++) {
    const a = after.collection.cards[id], b = before.collection.cards[id];
    const delta = a.copies - b.copies + Number(a.owned) - Number(b.owned);
    if (delta) actualDelta[id] = delta;
  }
  for (const award of awards) displayed[award.face] = (displayed[award.face] || 0) + 1;
  check(row, 'free pack reveals five actual awards matching inventory changes', displayed, actualDelta);
  check(row, 'free pack consumes one earned pack and adds its specified gold',
    { packs: after.collection.packs, opened: after.collection.opened, gold: after.collection.gold, shards: after.shards },
    { packs: before.collection.packs - 1, opened: before.collection.opened + 1, gold: before.collection.gold + 120, shards: before.shards });
  assert.notEqual(after.collection.rng, before.collection.rng, 'real pack generator must advance');
  for (const award of awards) {
    const name = await page.evaluate(id => DKDECKRULES.get(id).name.replace(' 주사위', ''), award.face);
    assert.ok(award.text.includes(name), 'revealed award name must match its identity');
  }
  row.pack = { awards, beforePacks: before.collection.packs, afterPacks: after.collection.packs, inventoryDelta: actualDelta, rngAdvanced: true };
}

async function viewport(browser, tag, size) {
  const row = { tag, viewport: size, checks: [], layouts: [], errors: [], dialogs: [], screenshots: [], passed: false };
  report.viewports.push(row);
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', e => row.errors.push(e.stack || e.message));
  page.on('dialog', async dialog => { row.dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
  await page.route('**/game.js*', async route => {
    try {
      const response = await route.fetch(), original = await response.text(), hash = sha(original);
      if (report.gameSha256 && report.gameSha256 !== hash) throw new Error('Game source changed during collection QA; rerun a stable candidate');
      report.gameSha256 = hash;
      const anchor = 'window.DK = S;';
      assert.equal(original.split(anchor).length, 2, 'unique game closure hook');
      const hook = 'window.__collectionQA={getSAVE:()=>SAVE,saveSave,renderDeck};\n';
      await route.fulfill({ response, body: original.replace(anchor, hook + anchor) });
    } catch (error) {
      row.errors.push('test route: ' + error.message);
      await route.fulfill({ contentType: 'application/javascript', body: 'window.__collectionQAError=' + JSON.stringify(error.message) + ';' });
    }
  });
  try {
    await page.goto(url.href); await ready(page); await openCollection(page);
    const initial = await profile(page);
    check(row, 'fresh guest starts with six owned types and three free packs',
      { owned: Object.values(initial.collection.cards).filter(c => c.owned).length, packs: initial.collection.packs }, { owned: 6, packs: 3 });
    check(row, 'collection exposes five slots and three free presets',
      { slots: await page.locator('#deck-selected [data-slot]').count(), presets: await page.locator('#deck-presets [data-preset]').count() }, { slots: 5, presets: 3 });
    check(row, 'network and linked commerce are off in the fresh test context', await page.evaluate(() => ({ net: !!DKNET.CFG.url, linked: DKCOMMERCE.linked() })), { net: false, linked: false });
    await layout(page, row, 'initial collection');
    await imagesAndFilters(page, row);
    await decks(page, row);
    await growth(page, row);
    await pack(page, row);
    await layout(page, row, 'collection after actions');
    for (const [name, selector] of [['overview', '.deck-heading'], ['awards', '#deck-pack-result'], ['catalog', '#deck-grid [data-card="1"]'], ['detail', '#deck-detail']]) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      const file = path.join(out, `${tag}-${name}.png`);
      await page.screenshot({ path: file }); row.screenshots.push(file);
    }
    const saved = await profile(page);
    await page.reload(); await ready(page); await openCollection(page);
    check(row, 'all collection and preset changes survive page reload', await profile(page), saved);
    await layout(page, row, 'collection after reload');
    check(row, 'no uncaught page errors', row.errors, []);
    row.passed = true;
    console.log('PASS collection', tag, row.checks.length, 'checks');
  } catch (error) {
    row.failure = error.stack || String(error);
    await page.screenshot({ path: path.join(out, `${tag}-failure.png`) }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

(async () => {
  const browser = await launchBrowser();
  try {
    for (const [tag, size] of [['desktop', { width: 1366, height: 900 }], ['phone', { width: 390, height: 844 }]]) await viewport(browser, tag, size);
    report.passed = true;
  } finally {
    report.finished = new Date().toISOString();
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
