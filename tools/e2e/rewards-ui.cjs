// Isolated UI fixtures only: no live account, commerce request, or payment.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');
const root = path.resolve(__dirname, '../..'), out = path.resolve(process.env.E2E_OUTPUT_DIR || 'gen/e2e/rewards-ui');
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await launchBrowser(), checks = [], errors = [];
  const check = (label, value) => { assert.ok(value, label); checks.push(label); };
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.abort());
    await page.setContent('<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><button id="btn-rewards-open">출석 · 우편 · 패스</button></body></html>');
    await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'style.css'), 'utf8') });
    await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'rewards.css'), 'utf8') });
    await page.evaluate(() => {
      window.DK = { phase: 'title', gold: 123, lives: 7 }; window.__beforeGame = JSON.stringify(DK);
      const view = { account: { linked: false }, attendance: { nextDay: 3, claimedToday: false, xp: 20, rewards: [[100, 3], [120, 3], [140, 4], [160, 4], [180, 5], [200, 5], [300, 10]].map(([gold, shards]) => ({ gold, shards })) },
        pass: { xp: 1050, premiumOwned: false, purchaseEnabled: false, priceLabel: '2,900원', tiers: Array.from({ length: 20 }, (_, i) => ({ tier: i + 1, requiredXp: (i + 1) * 100, free: { gold: 100, shards: 2, claimed: i === 0 }, premium: { shards: 10, skinId: i === 9 ? 'royal' : undefined, claimed: false } })) }, mail: [] };
      window.__fixture = { view, counts: { list: 0, attendance: 0, mail: 0, pass: 0, buy: 0, admin: 0 }, failList: false, failClaim: false, holdLoad: false, holdClaim: false };
      const f = __fixture, copy = () => JSON.parse(JSON.stringify(f.view));
      window.DKREWARDS = {
        current: copy,
        async list() { f.counts.list++; if (f.holdLoad) await new Promise(resolve => f.releaseLoad = resolve); if (f.failList) throw Error('연결이 끊겼습니다.'); return copy(); },
        async claimAttendance() { f.counts.attendance++; if (f.holdClaim) await new Promise(resolve => f.releaseClaim = resolve); if (f.failClaim) throw Error('보상 수령을 확인하지 못했습니다.'); f.view.attendance.claimedToday = true; f.view.pass.xp += 20; },
        async claimMail(id) { f.counts.mail++; f.view.mail.find(mail => mail.id === id).claimed = true; },
        async claimPass(tier, track) { f.counts.pass++; f.view.pass.tiers.find(item => item.tier === tier)[track].claimed = true; },
        async buyPass() { f.counts.buy++; f.view.pass.premiumOwned = true; },
      };
      window.DKMAILADMIN = { open() { f.counts.admin++; } };
    });
    await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'rewards-ui.js'), 'utf8') });
    const noOverflow = async label => {
      const dimensions = await page.evaluate(() => [...document.querySelectorAll('.rw-dialog[open]')].map(node => ({ width: node.clientWidth, scroll: node.scrollWidth, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, viewport: innerWidth })));
      check(label, dimensions.length && dimensions.every(d => d.scroll <= d.width + 1 && d.left >= 0 && d.right <= d.viewport));
    };
    await page.evaluate(() => { __fixture.holdLoad = true; });
    await page.click('#btn-rewards-open');
    check('Loading state announced', /불러오고/.test(await page.locator('#rewards-status').innerText()));
    check('Dialog starts with selected tab focused', await page.evaluate(() => document.activeElement.id === 'rewards-tab-attendance'));
    await page.evaluate(() => { __fixture.holdLoad = false; __fixture.releaseLoad(); });
    await page.waitForSelector('#rewards-attendance-claim');
    check('Seven cumulative attendance rewards', await page.locator('.rw-day').count() === 7);
    check('Current attendance and KST rule readable', (await page.locator('.rw-day-current').innerText()).includes('3회차') && (await page.locator('.rw-intro').innerText()).includes('한국 시간'));
    await noOverflow('Attendance fits 390px');
    await page.screenshot({ path: path.join(out, 'attendance-390.png') });
    await page.evaluate(() => { __fixture.holdClaim = true; const button = document.getElementById('rewards-attendance-claim'); button.click(); button.click(); button.dispatchEvent(new MouseEvent('click')); });
    check('Repeated attendance clicks issue one request', await page.evaluate(() => __fixture.counts.attendance === 1));
    check('Pending attendance is disabled', await page.locator('#rewards-attendance-claim').isDisabled());
    await page.evaluate(() => { __fixture.holdClaim = false; __fixture.releaseClaim(); });
    await page.waitForFunction(() => document.getElementById('rewards-attendance-claim').textContent === '오늘 출석 완료');
    check('Claimed attendance stays disabled', await page.locator('#rewards-attendance-claim').isDisabled());
    await page.click('#rewards-tab-mail');
    check('Guest mail explains account requirement', /로그인 후/.test(await page.locator('.rw-empty').innerText()));
    await page.click('#rewards-tab-pass');
    check('Free and premium tracks display 20 tiers', await page.locator('.rw-pass-tier').count() === 20 && await page.locator('[data-claim-pass]').count() === 40);
    check('Guest purchase is disabled', await page.locator('#rewards-buy-pass').isDisabled());
    check('Claimed, earned, locked, and unreached states are distinct', await page.locator('[data-claim-pass="1:free"]').innerText() === '수령 완료' && await page.locator('[data-claim-pass="2:free"]').innerText() === '보상 받기' && await page.locator('[data-claim-pass="2:premium"]').innerText() === '구매 필요' && await page.locator('[data-claim-pass="20:free"]').innerText() === '미달성');
    await noOverflow('Free/premium columns fit 390px');
    await page.screenshot({ path: path.join(out, 'pass-390.png') });
    await page.click('[data-claim-pass="2:free"]');
    await page.waitForFunction(() => document.querySelector('[data-claim-pass="2:free"]').textContent === '수령 완료');
    check('Free pass claim needs no purchase', await page.evaluate(() => __fixture.counts.pass === 1 && __fixture.counts.buy === 0));
    await page.keyboard.press('Escape');
    check('Escape closes and restores opener focus', await page.evaluate(() => !document.getElementById('rewards-dialog').open && document.activeElement.id === 'btn-rewards-open'));
    await page.evaluate(() => {
      __fixture.view.account = { linked: true, label: '연결된 계정' }; __fixture.view.canAdmin = true;
      __fixture.view.pass.purchaseEnabled = true;
      __fixture.view.mail = [
        { id: 'unsafe', title: '<img src=x onerror="window.__injected=true">', body: '<script>window.__injected=true</script>\n' + '긴본문'.repeat(60), gold: 500, shards: 12, createdAt: '2026-09-14T00:00:00Z', expiresAt: '2099-09-21T00:00:00Z', claimed: false },
        { id: 'claimed', title: '이미 받은 우편', body: '감사합니다.', gold: 100, createdAt: '2026-09-13T00:00:00Z', expiresAt: null, claimed: true },
        { id: 'expired', title: '만료된 우편', body: '지난 행사', shards: 3, createdAt: '2000-01-01T00:00:00Z', expiresAt: '2000-01-02T00:00:00Z', claimed: false },
        { id: 'server-time', title: '서버 시간 기준 우편', body: '기기 시계가 달라도 서버 판정을 따릅니다.', shards: 1, createdAt: '2000-01-01T00:00:00Z', expiresAt: '2000-01-02T00:00:00Z', expired: false, claimed: false },
      ]; return DKREWARDSUI.open('mail');
    });
    check('Mail title/body are inert text', await page.evaluate(() => !window.__injected && !document.querySelector('.rw-mail img,.rw-mail script') && document.querySelector('.rw-mail h4').textContent.startsWith('<img')));
    check('Claimed and expired mail cannot be claimed', await page.locator('[data-claim-mail="claimed"]').isDisabled() && await page.locator('[data-claim-mail="expired"]').isDisabled());
    check('Server expiry decision takes priority over device date', !(await page.locator('[data-claim-mail="server-time"]').isDisabled()));
    check('Mail shows issue and expiry dates', /발행.*2026.*만료.*2099/.test(await page.locator('.rw-mail-dates').first().innerText()));
    await noOverflow('Long untrusted mail fits 390px');
    await page.screenshot({ path: path.join(out, 'mail-390.png') });
    await page.click('#rewards-mail-admin'); check('Admin entry calls separate admin UI', await page.evaluate(() => __fixture.counts.admin === 1));
    await page.click('[data-claim-mail="unsafe"]'); await page.waitForFunction(() => document.querySelector('[data-claim-mail="unsafe"]').textContent === '수령 완료');
    check('Mail claims selected id once', await page.evaluate(() => __fixture.counts.mail === 1));
    await page.click('#rewards-tab-pass'); await page.click('#rewards-buy-pass');
    check('Purchase has an explicit review with no charge', await page.evaluate(() => document.getElementById('rewards-purchase-review').open && __fixture.counts.buy === 0));
    check('Purchase explains one-time/no expiry/retroactive rewards', /자동 갱신.*없/.test(await page.locator('#rewards-purchase-review').innerText()) && /이전에 달성/.test(await page.locator('#rewards-purchase-review').innerText()));
    await noOverflow('Purchase review fits 390px');
    await page.screenshot({ path: path.join(out, 'purchase-390.png') });
    await page.keyboard.press('Tab');
    check('Review traps keyboard focus', await page.evaluate(() => document.activeElement.closest('dialog')?.id === 'rewards-purchase-review'));
    await page.keyboard.press('Escape');
    check('Escape dismisses review without leaving rewards', await page.evaluate(() => !document.getElementById('rewards-purchase-review').open && document.getElementById('rewards-dialog').open && __fixture.counts.buy === 0));
    await page.click('#rewards-buy-pass'); await page.click('#rewards-buy-confirm');
    await page.waitForFunction(() => document.querySelector('.rw-pass-offer strong').textContent.includes('보유 중'));
    check('Confirmed mock purchase unlocks prior premium tier', await page.evaluate(() => __fixture.counts.buy === 1 && !document.querySelector('[data-claim-pass="10:premium"]').disabled));
    await page.click('[data-claim-pass="10:premium"]'); await page.waitForFunction(() => document.querySelector('[data-claim-pass="10:premium"]').textContent === '수령 완료');
    check('Royal tier reward rendered with its premium claim', (await page.locator('[data-tier="10"] .rw-premium').innerText()).includes('왕실 외형'));
    await page.evaluate(() => { __fixture.failList = true; dispatchEvent(new Event('rewards:change')); });
    await page.waitForSelector('.rw-error'); check('Connection error offers retry', await page.locator('.rw-retry').isVisible());
    await page.evaluate(() => { __fixture.failList = false; }); await page.click('.rw-retry'); await page.waitForFunction(() => !document.querySelector('.rw-error'));
    check('Retry clears connection error', !(await page.locator('#rewards-status').innerText()).includes('끊겼'));
    await page.evaluate(() => { __fixture.view.attendance.claimedToday = false; __fixture.failClaim = true; }); await page.evaluate(() => DKREWARDSUI.open('attendance')); await page.click('#rewards-attendance-claim');
    await page.waitForSelector('.rw-error'); check('Failed claim is visible and can be retried', !(await page.locator('#rewards-attendance-claim').isDisabled()));
    await page.evaluate(() => { __fixture.failClaim = false; }); await page.click('#rewards-attendance-claim'); await page.waitForFunction(() => document.getElementById('rewards-attendance-claim').textContent === '오늘 출석 완료');
    await page.click('#rewards-tab-attendance'); await page.keyboard.press('ArrowRight');
    check('Arrow key changes focused tab and active panel', await page.evaluate(() => document.activeElement.id === 'rewards-tab-mail' && document.getElementById('rewards-tab-mail').getAttribute('aria-selected') === 'true'));
    await page.evaluate(() => { __fixture.view.mail = []; dispatchEvent(new Event('rewards:change')); }); await page.waitForSelector('.rw-empty');
    check('Linked account empty mail state', /새 우편이 없습니다/.test(await page.locator('.rw-empty').innerText()));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.click('#rewards-tab-attendance'); await noOverflow('Attendance fits desktop'); await page.screenshot({ path: path.join(out, 'attendance-desktop.png') });
    await page.click('#rewards-tab-pass'); await noOverflow('Pass fits desktop');
    check('Game state untouched', await page.evaluate(() => JSON.stringify(DK) === __beforeGame));
    check('No page script errors', errors.length === 0);
    await context.close();
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ pass: true, isolated: true, checks, errors }, null, 2));
    console.log('PASS rewards UI:', checks.length, 'checks');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
