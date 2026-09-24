// Visual/layout regression checks against real local CSS, scripts and artwork.
// Account views and all claims are in-memory fixtures; external requests are blocked.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');

const base = new URL(process.env.E2E_BASE_URL || 'http://127.0.0.1:8137/');
assert.ok(['localhost', '127.0.0.1'].includes(base.hostname), 'Visual QA requires a local server');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || 'gen/e2e/rewards-visual');
const report = { pass: false, scope: 'Local artwork and real rewards UI; isolated views and claims, no external account or payment.', checks: [], screenshots: [], errors: [], blocked: [] };
const check = (name, condition) => { assert.ok(condition, name); report.checks.push(name); };
const viewports = [ ['phone', { width: 390, height: 844 }], ['small', { width: 320, height: 640 }], ['desktop', { width: 1280, height: 900 }] ];

function fixture({ linked = false, xp = 0, premiumOwned = false, nextDay = 1, mail = [] } = {}) {
  const now = Date.parse('2026-09-15T00:00:00Z');
  return {
    account: { linked, label: linked ? '성채 수호자' : undefined }, serverNow: now,
    attendance: { nextDay, dayKey: '2026-09-15', claimedToday: false, xp: 20,
      rewards: [[100, 3], [120, 3], [140, 4], [160, 4], [180, 5], [200, 5], [300, 10]].map(([gold, shards]) => ({ gold, shards })) },
    mail,
    pass: { xp, premiumOwned, purchaseEnabled: false, priceLabel: '2,900원',
      tiers: Array.from({ length: 20 }, (_, i) => ({ tier: i + 1, requiredXp: (i + 1) * 100,
        free: { gold: 100, shards: 2, claimed: xp > 0 && i === 0 },
        premium: { shards: 10, claimed: false, ...(i === 9 ? { skinId: 'royal' } : {}) } })) },
  };
}

function mails() {
  return [
    { id: 'welcome', title: '성채의 새로운 여정을 응원합니다', body: '출석과 전투를 꾸준히 즐기며 모든 다이스를 만나 보세요.\n감사의 마음을 담은 선물을 보내 드립니다.', reward: { gold: 500, shards: 12 }, createdAt: '2026-09-15T00:00:00Z', expiresAt: '2026-09-22T00:00:00Z', expired: false, claimed: false },
    { id: 'received', title: '이미 받은 업데이트 선물', body: '새로운 성채에서 즐거운 시간을 보내세요.', reward: { gold: 200, shards: 5 }, createdAt: '2026-09-14T00:00:00Z', expiresAt: null, expired: false, claimed: true },
    { id: 'expired', title: '기간이 지난 주말 선물', body: '다음 선물에서 다시 만나요.', reward: { gold: 100 }, createdAt: '2026-09-01T00:00:00Z', expiresAt: '2026-09-08T00:00:00Z', expired: true, claimed: false },
  ];
}

async function protect(context, fixturePage = false) {
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base.origin || !['GET', 'HEAD'].includes(request.method())) {
      report.blocked.push({ url: request.url(), method: request.method() }); return route.abort();
    }
    if (fixturePage && url.pathname === '/__rewards_visual__') {
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/rewards.css"><link rel="stylesheet" href="/casual-theme.css"><link rel="stylesheet" href="/casual-rewards.css"></head><body><button id="btn-rewards-open">성채 보상</button><script src="/reward-notifications.js"></script><script src="/rewards-ui.js"></script></body></html>` });
    }
    return route.continue();
  });
}

function observe(page) {
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && /\/ui\/rewards\//.test(response.url())) report.errors.push(`${response.status()} ${response.url()}`);
  });
}

async function setView(page, value, tab) {
  await page.evaluate(async ({ value, tab }) => {
    window.__visual = { view: value, claims: [] };
    const f = __visual, copy = () => structuredClone(f.view);
    const api = {
      current: copy, async list() { return copy(); },
      async claimAttendance() { f.claims.push('attendance'); f.view.attendance.claimedToday = true; },
      async claimMail(id) { f.claims.push('mail:' + id); f.view.mail.find(mail => mail.id === id).claimed = true; },
      async claimPass(tier, track) { f.claims.push(`pass:${tier}:${track}`); f.view.pass.tiers.find(row => row.tier === tier)[track].claimed = true; },
      async buyPass() { throw Error('Payments are not part of visual QA'); },
    };
    DKREWARDSUI.configure({ api, view: copy() });
    await DKREWARDSUI.open(tab, { view: copy() });
  }, { value, tab });
  await page.waitForSelector(`#rewards-panel-${tab}`);
}

async function artReady(page, scope = '#rewards-dialog') {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(selector => [...document.querySelectorAll(selector + ' img')].every(img => img.complete), scope);
  return page.locator(scope).evaluate(async container => {
    const images = [...container.querySelectorAll('img')].map(img => ({ src: img.getAttribute('src'), loaded: img.naturalWidth > 0, rendered: img.getBoundingClientRect().width > 0 }));
    const backgrounds = new Set();
    for (const node of [container, ...container.querySelectorAll('*')]) {
      if (!node.getBoundingClientRect().width) continue;
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(node, pseudo);
        for (const match of style.backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
          if (/\/ui\/rewards\//.test(match[1])) backgrounds.add(match[1]);
        }
      }
    }
    const painted = await Promise.all([...backgrounds].map(src => new Promise(resolve => {
      const img = new Image(); img.onload = () => resolve({ src, loaded: img.naturalWidth > 0, rendered: true });
      img.onerror = () => resolve({ src, loaded: false, rendered: true }); img.src = src;
    })));
    return [...images, ...painted];
  });
}

async function capture(page, name) {
  const images = await artReady(page);
  // Await finite transitions instead of photographing a half-selected tab.
  await page.locator('#rewards-dialog').evaluate(async dialog => {
    await Promise.all(dialog.getAnimations({ subtree: true }).filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => {})));
  });
  check(name + ': illustrated artwork loads', images.length > 0 && images.every(img => img.loaded && img.rendered));
  const layout = await page.evaluate(() => {
    const dialog = document.getElementById('rewards-dialog'), box = dialog.getBoundingClientRect();
    const nodes = [dialog, ...dialog.querySelectorAll('.rw-body,.rw-panel,.rw-attendance,.rw-day,.rw-mail,.rw-pass-tier')];
    return { inside: box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1,
      overflowing: nodes.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => ({ className: node.className, width: node.clientWidth, scroll: node.scrollWidth })) };
  });
  check(name + ': dialog stays inside viewport', layout.inside);
  check(name + ': cards and text have no horizontal overflow ' + JSON.stringify(layout.overflowing), layout.overflowing.length === 0);
  await page.screenshot({ path: path.join(out, name + '.png') });
  report.screenshots.push(name + '.png');
}

async function fixtureCase(browser, name, viewport) {
  const context = await browser.newContext({ viewport });
  try {
    await protect(context, true); const page = await context.newPage(); observe(page);
    await page.goto(new URL('__rewards_visual__', base).href); await page.waitForFunction(() => window.DKREWARDSUI);
    await setView(page, fixture(), 'attendance');
    check(name + ': seven attendance rewards remain', await page.locator('.rw-day').count() === 7);
    check(name + ': each attendance reward uses actual art', await page.locator('.rw-day img').count() >= 7);
    check(name + ': placeholder diamond/star removed', !(await page.locator('.rw-day').allTextContents()).some(text => /[◇✦]/.test(text)));
    check(name + ': initial attendance claim is fully inside dialog and viewport', await page.locator('#rewards-attendance-claim').evaluate(button => {
      const r = button.getBoundingClientRect(), d = document.getElementById('rewards-dialog').getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.left >= Math.max(0, d.left) && r.right <= Math.min(innerWidth, d.right) && r.top >= Math.max(0, d.top) && r.bottom <= Math.min(innerHeight, d.bottom);
    }));
    await capture(page, name + '-attendance');
    for (const day of [6, 7]) {
      const content = page.locator(`.rw-day[data-day="${day}"] .rw-rewards`);
      await content.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
      check(name + ': day ' + day + ' reward info can be read above attendance action', await content.evaluate(node => {
        const r = node.getBoundingClientRect(), body = document.querySelector('.rw-body').getBoundingClientRect(), action = document.querySelector('.rw-attendance-action').getBoundingClientRect();
        return r.top >= body.top - 1 && r.bottom <= Math.min(body.bottom, action.top) + 1 && /골드/.test(node.textContent) && /조각/.test(node.textContent);
      }));
    }
    await page.locator('.rw-body').evaluate(node => { node.scrollTop = node.scrollHeight; });
    await capture(page, name + '-attendance-final-reward');
    await setView(page, fixture({ nextDay: 4 }), 'attendance');
    check(name + ': previous attendance rewards are visibly claimed', await page.locator('.rw-day-done').count() === 3 && (await page.locator('.rw-day-current').innerText()).includes('4회차'));
    await capture(page, name + '-attendance-progress');
    await setView(page, fixture(), 'mail');
    check(name + ': guest mailbox explains login', /로그인/.test(await page.locator('.rw-empty').innerText()));
    await capture(page, name + '-mail-guest');
    await setView(page, fixture({ linked: true, mail: mails() }), 'mail');
    check(name + ': only eligible mail can be claimed', await page.locator('[data-claim-mail="welcome"]').isEnabled() && await page.locator('[data-claim-mail="received"]').isDisabled() && await page.locator('[data-claim-mail="expired"]').isDisabled());
    await capture(page, name + '-mail-linked');
    if (name === 'phone') {
      await page.click('[data-claim-mail="welcome"]');
      await page.waitForFunction(() => document.querySelector('[data-claim-mail="welcome"]').disabled);
      check('Redesigned mail claims exactly one local fixture reward', await page.evaluate(() => __visual.claims.join(',') === 'mail:welcome'));
    }
    await setView(page, fixture(), 'pass');
    check(name + ': both reward tracks preserve all 20 stages', await page.locator('.rw-pass-tier').count() === 20 && await page.locator('[data-claim-pass]').count() === 40);
    check(name + ': unreached free rewards and guest purchase disabled', await page.locator('[data-claim-pass="1:free"]').isDisabled() && await page.locator('#rewards-buy-pass').isDisabled());
    await capture(page, name + '-pass-zero');
    await setView(page, fixture({ linked: true, xp: 450 }), 'pass');
    check(name + ': earned free and optional premium states distinct', await page.locator('[data-claim-pass="1:free"]').isDisabled() && await page.locator('[data-claim-pass="2:free"]').isEnabled() && await page.locator('[data-claim-pass="2:premium"]').isDisabled());
    await capture(page, name + '-pass-progress');
    if (name === 'phone') {
      await page.click('[data-claim-pass="2:free"]'); await page.waitForFunction(() => document.querySelector('[data-claim-pass="2:free"]').disabled);
      check('Redesigned free pass claims without a payment', await page.evaluate(() => __visual.claims.join(',') === 'pass:2:free'));
      await page.locator('[data-tier="20"]').scrollIntoViewIfNeeded(); await capture(page, name + '-pass-final-tier');
      for (const title of ['경험치는 어떻게 모으나요?', '구매 및 보상 안내']) {
        await page.evaluate(title => {
          const summary = [...document.querySelectorAll('.rw-help summary')].find(node => node.textContent === title);
          window.__visualHelpToggle = new Promise(resolve => summary.parentElement.addEventListener('toggle', () => resolve(), { once: true }));
        }, title);
        await page.locator('.rw-help summary').filter({ hasText: title }).click();
        await page.evaluate(() => window.__visualHelpToggle);
      }
      await page.evaluate(() => DKREWARDSUI.open('pass'));
      check('Expanded XP and purchase explanations survive a rewards refresh', await page.locator('.rw-help[open]').count() === 2 && /자동 갱신 없음/.test(await page.locator('.rw-pass-offer .rw-help').innerText()));
      await page.locator('.rw-body').evaluate(node => { node.scrollTop = 0; });
      await capture(page, name + '-pass-expanded-help');
    }
    await setView(page, fixture({ linked: true, xp: 1050, premiumOwned: true }), 'pass');
    check(name + ': owned premium reward is available at reached stage', await page.locator('[data-claim-pass="10:premium"]').isEnabled());
    await page.locator('[data-tier="10"]').scrollIntoViewIfNeeded(); await capture(page, name + '-pass-owned-royal');
  } finally { await context.close(); }
}

async function actualGuest(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await protect(context); await context.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
    const page = await context.newPage(); observe(page);
    const url = new URL('index.html', base); url.searchParams.set('net', 'off'); url.searchParams.set('v', Date.now());
    await page.goto(url.href);
    await page.waitForFunction(() => window.DK?.phase === 'title' && !!window.DKREWARDS?.current(), null, { timeout: 120000 });
    check('Real guest sees the title before the attendance panel', await page.evaluate(() => !document.getElementById('rewards-dialog')?.open));
    await page.click('#ov-btn');
    await page.waitForFunction(() => window.DK?.phase === 'lobby' && document.getElementById('rewards-dialog')?.open && !document.getElementById('rewards-attendance-claim')?.disabled);
    check('Real guest connection automatically opens attendance after Start', await page.locator('#rewards-tab-attendance').getAttribute('aria-selected') === 'true');
    check('Visual redesign does not automatically claim rewards', await page.evaluate(() => DKSAVE.liveops.attendance.total === 0 && DKSAVE.liveops.pass.xp === 0));
    await capture(page, 'actual-guest-startup');
    await page.click('#rewards-close');
    const images = await artReady(page, '#lobby-hub');
    const rewardImages = images.filter(img => /ui\/rewards\//.test(img.src));
    check('Home shortcuts use the same loaded illustrated reward icons', rewardImages.length >= 3 && rewardImages.every(img => img.loaded && img.rendered));
    await page.screenshot({ path: path.join(out, 'actual-guest-home.png') }); report.screenshots.push('actual-guest-home.png');
  } finally { await context.close(); }
}

async function main() {
  fs.mkdirSync(out, { recursive: true }); const browser = await launchBrowser({ startupRewards: true });
  try {
    for (const [name, viewport] of viewports) await fixtureCase(browser, name, viewport);
    await actualGuest(browser);
    check('No uncaught errors or failed reward artwork requests', report.errors.length === 0);
    check('No requests to external services or account/payment mutations', report.blocked.length === 0);
    report.pass = true; console.log('PASS rewards visual:', report.checks.length, 'checks,', report.screenshots.length, 'screenshots');
  } catch (error) { report.failure = error.stack; throw error; }
  finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
