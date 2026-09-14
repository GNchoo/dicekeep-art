// Actual v117 game + guest storage + rewards UI. Only the XP/finished-wave
// preconditions and a localStorage write failure are injected as test fixtures.
// No signed-in account, purchase, admin publication, or remote mutation is used.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || 'gen/e2e/rewards-integration');
const url = new URL('index.html', process.env.E2E_BASE_URL || 'http://127.0.0.1:8137/');
url.searchParams.set('v', '117'); url.searchParams.set('net', process.env.E2E_NET_URL || 'ws://127.0.0.1:8837');
const report = { pass: false, url: url.href, scope: 'Actual guest UI and DKSAVE integration; XP=200 and wave=10 are explicit fixtures, not measured gameplay.', cases: [] };
async function main() {
  fs.mkdirSync(out, { recursive: true }); const browser = await launchBrowser();
  try {
    for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
      const context = await browser.newContext({ viewport }), page = await context.newPage();
      const row = { name, pass: false, checks: [], errors: [], resourceErrors: [], blockedMutations: [] }; report.cases.push(row);
      const check = (label, actual, expected = true) => { assert.deepEqual(actual, expected, name + ': ' + label); row.checks.push(label); };
      page.on('pageerror', e => row.errors.push(e.message));
      page.on('response', r => { if (r.status() >= 400 && /\/(?:liveops-rules|rewards-client|rewards-ui|mail-admin|game)\.js|\/rewards\.css/.test(new URL(r.url()).pathname)) row.resourceErrors.push({ status: r.status(), path: new URL(r.url()).pathname }); });
      await context.route('**/*', route => {
        const request = route.request();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
          row.blockedMutations.push({ method: request.method(), path: new URL(request.url()).pathname }); return route.abort();
        }
        return route.continue();
      });
      await page.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
      async function boot(reload = false) {
        if (reload) await page.reload(); else await page.goto(url.href);
        await page.waitForFunction(() => window.DK?.phase === 'title' && window.DKREWARDS && window.DKREWARDSUI && window.DKSAVE?.liveops, null, { timeout: 120000 });
        await page.click('#ov-btn'); await page.waitForFunction(() => DK.phase === 'lobby');
        await page.evaluate(() => { DK.muted = true; DKlobbyView('hub'); });
      }
      const snapshot = () => page.evaluate(() => {
        const pick = s => s ? { gold: s.progression.collection.gold, shards: s.progression.shards, liveops: s.liveops } : null;
        return { memory: pick(DKSAVE), stored: pick(JSON.parse(localStorage.getItem('DKSAVE'))) };
      });
      const reject = (method, args = []) => page.evaluate(async ({ method, args }) => {
        try { await DKREWARDS[method](...args); return { ok: true }; }
        catch (e) { return { ok: false, code: e.code || null, message: e.message }; }
      }, { method, args });
      async function quota(enabled) {
        await page.evaluate(enabled => {
          if (enabled) {
            window.__rewardOriginalSetItem = Storage.prototype.setItem;
            Storage.prototype.setItem = function (key, value) {
              if (key === 'DKSAVE') throw new DOMException('Injected guest quota failure', 'QuotaExceededError');
              return window.__rewardOriginalSetItem.call(this, key, value);
            };
          } else if (window.__rewardOriginalSetItem) {
            Storage.prototype.setItem = window.__rewardOriginalSetItem; delete window.__rewardOriginalSetItem;
          }
        }, enabled);
      }
      async function noOverflow(label) {
        const d = await page.evaluate(() => {
          const el = document.getElementById('rewards-dialog'), b = el.getBoundingClientRect();
          return { open: el.open, width: el.clientWidth, scroll: el.scrollWidth, left: b.left, right: b.right, top: b.top, bottom: b.bottom, w: innerWidth, h: innerHeight };
        });
        check(label, d.open && d.scroll <= d.width + 1 && d.left >= -.5 && d.right <= d.w + .5 && d.top >= -.5 && d.bottom <= d.h + .5);
      }
      try {
        await boot();
        check('Actual game and rewards bridge boot as an unsigned guest', await page.evaluate(() => !DKCOMMERCE.linked() && DK.phase === 'lobby' && DKLIVEOPS.stateValid(DKSAVE.liveops)));
        const fresh = await snapshot(); check('Fresh guest starts without attendance or pass XP', { gold: fresh.memory.gold, shards: fresh.memory.shards, total: fresh.memory.liveops.attendance.total, xp: fresh.memory.liveops.pass.xp }, { gold: 1860, shards: 0, total: 0, xp: 0 });
        check('Lobby exposes the real rewards entry', await page.locator('#btn-rewards-open').isVisible());
        await page.click('#btn-rewards-open'); await page.waitForSelector('#rewards-attendance-claim');
        check('Attendance uses the actual seven-day view', await page.locator('.rw-day').count(), 7);
        check('Guest ownership and KST rule are visible', /게스트/.test(await page.locator('#rewards-account').innerText()) && /한국 시간/.test(await page.locator('.rw-intro').innerText()));
        await noOverflow('Attendance dialog fits the actual game viewport');

        const beforeFailure = await snapshot(); await quota(true);
        await page.click('#rewards-attendance-claim'); await page.waitForSelector('.rw-error');
        check('Quota failure explains that attendance remains unclaimed', /보상은 아직 수령하지 않았습니다/.test(await page.locator('#rewards-status').innerText()));
        check('Quota failure changes neither memory nor persisted wallet/attendance/XP', await snapshot(), beforeFailure);
        check('Failed attendance can be retried', !(await page.locator('#rewards-attendance-claim').isDisabled()));
        await quota(false);
        await page.evaluate(() => { const b = document.getElementById('rewards-attendance-claim'); b.click(); b.click(); b.dispatchEvent(new MouseEvent('click')); });
        await page.waitForFunction(() => document.getElementById('rewards-attendance-claim')?.textContent === '오늘 출석 완료');
        const attended = await snapshot();
        check('Actual repeated attendance clicks credit day one exactly once', { gold: attended.memory.gold - fresh.memory.gold, shards: attended.memory.shards - fresh.memory.shards, xp: attended.memory.liveops.pass.xp, total: attended.memory.liveops.attendance.total }, { gold: 100, shards: 3, xp: 20, total: 1 });
        check('Attendance wallet and marker commit together', attended.stored, attended.memory);
        check('A direct duplicate attendance claim is rejected', (await reject('claimAttendance')).code, 'already-claimed');
        check('Duplicate rejection preserves the wallet and pass XP', await snapshot(), attended);
        check('Only day one is marked claimed', await page.locator('.rw-day-done').count(), 1);
        await page.screenshot({ path: path.join(out, name + '-attendance.png') });

        await boot(true); check('Reload preserves day-one wallet, attendance and pass XP', (await snapshot()).memory, attended.memory);
        await page.click('#btn-rewards-open'); await page.waitForSelector('#rewards-attendance-claim');
        check('Reloaded attendance remains disabled', await page.locator('#rewards-attendance-claim').isDisabled());
        await page.evaluate(async () => {
          const stored = JSON.parse(localStorage.getItem('DKSAVE'));
          stored.liveops.pass.xp = 200; // explicit test-only progress precondition
          localStorage.setItem('DKSAVE', JSON.stringify(stored)); Object.assign(DKSAVE, stored);
          DKREWARDS.changed(); await DKREWARDSUI.open('pass');
        });
        await page.waitForSelector('[data-claim-pass="1:free"]');
        check('Actual XP fixture displays two earned tiers in a twenty-tier pass', await page.evaluate(() => document.querySelectorAll('.rw-pass-tier').length === 20 && document.querySelector('progress').value === 200));
        check('Unlocked free claims need no purchase while unreached tiers remain locked', !(await page.locator('[data-claim-pass="1:free"]').isDisabled()) && await page.locator('[data-claim-pass="3:free"]').isDisabled());
        check('Guest premium claims and purchase button stay disabled', await page.locator('[data-claim-pass="1:premium"]').isDisabled() && await page.locator('#rewards-buy-pass').isDisabled());
        const beforePremium = await snapshot(); check('Direct premium bypass is rejected', (await reject('claimPass', [1, 'premium'])).code, 'premium-required');
        check('Blocked premium leaves wallet and claims untouched', await snapshot(), beforePremium);
        await noOverflow('Free and premium pass columns fit the actual game viewport');
        await page.screenshot({ path: path.join(out, name + '-pass.png') });
        await page.click('[data-claim-pass="1:free"]');
        await page.waitForFunction(() => document.querySelector('[data-claim-pass="1:free"]')?.textContent === '수령 완료');
        const passOne = await snapshot();
        check('Free tier one grants 100 gold and two shards without changing XP', { gold: passOne.memory.gold - beforePremium.memory.gold, shards: passOne.memory.shards - beforePremium.memory.shards, xp: passOne.memory.liveops.pass.xp, claimed: passOne.memory.liveops.pass.freeClaimed }, { gold: 100, shards: 2, xp: 200, claimed: [1] });
        check('Direct duplicate free pass claim is rejected', (await reject('claimPass', [1, 'free'])).code, 'already-claimed');
        check('Duplicate pass claim leaves stored and live balances equal', await snapshot(), passOne);

        await quota(true); await page.click('[data-claim-pass="2:free"]'); await page.waitForSelector('.rw-error');
        check('Quota failure preserves the second free tier and both wallets', await snapshot(), passOne);
        check('Failed free tier remains available', !(await page.locator('[data-claim-pass="2:free"]').isDisabled()));
        await quota(false); await page.click('[data-claim-pass="2:free"]');
        await page.waitForFunction(() => document.querySelector('[data-claim-pass="2:free"]')?.textContent === '수령 완료');
        const passTwo = await snapshot();
        check('Retry credits the second free tier once', { gold: passTwo.memory.gold - passOne.memory.gold, shards: passTwo.memory.shards - passOne.memory.shards, claimed: passTwo.memory.liveops.pass.freeClaimed }, { gold: 100, shards: 2, claimed: [1, 2] });
        check('Pass wallet and markers commit together', passTwo.memory, passTwo.stored);
        check('Unreached tier rejects a direct call', (await reject('claimPass', [3, 'free'])).code, 'tier-locked');
        await page.click('#rewards-tab-mail');
        check('Guest mail explains login and exposes no admin entry', /로그인 후/.test(await page.locator('.rw-empty').innerText()) && await page.locator('#rewards-mail-admin').count() === 0);
        await noOverflow('Guest mail dialog fits the actual game viewport');
        await page.keyboard.press('Escape');
        check('Closing rewards returns focus to the lobby entry', await page.evaluate(() => !document.getElementById('rewards-dialog').open && document.activeElement.id === 'btn-rewards-open'));

        await page.evaluate(() => DKlobbyView('single')); await page.click('#btn-inf-clear');
        await page.waitForFunction(() => DK.phase === 'playing' && DK.inf, null, { timeout: 30000 });
        check('Actual pure-luck game starts after rewards interaction', await page.evaluate(() => DK.mode === 'infinity' && DK.inf.recordKey === 'clear' && !DK.inf.accountTicket && !DK.net));
        const beforeCombatClaim = await snapshot(), blocked = await reject('claimPass', [3, 'free']);
        check('Active combat refuses rewards claims at the lobby guard', blocked.ok === false && /로비/.test(blocked.message));
        check('Combat guard does not alter progression or liveops', await snapshot(), beforeCombatClaim);
        const runId = await page.evaluate(() => { DK.paused = true; DK.inf.doneW = 10; DK.wave = 11; DK.inf.kills = 0; const id = DK.inf.runId; DKend(false); return id; });
        await page.waitForFunction(() => DK.phase === 'over');
        const completed = await snapshot();
        check('Real guest run settlement adds wave XP once', { xp: completed.memory.liveops.pass.xp, recorded: completed.memory.liveops.xpRuns.includes(runId) }, { xp: 220, recorded: true });
        check('Game settlement persists the pass alongside its wallet', completed.memory, completed.stored);
        await page.evaluate(() => DKend(false)); check('Repeated game-end call cannot duplicate XP or currency', await snapshot(), completed);
        await page.click('#ov-btn'); await page.waitForFunction(() => DK.phase === 'lobby');
        await page.evaluate(() => DKlobbyView('hub')); await page.click('#btn-rewards-open'); await page.click('#rewards-tab-pass');
        await page.waitForFunction(() => document.querySelector('#rewards-dialog progress')?.value === 220);
        check('Lobby pass refreshes from the actual game settlement', await page.locator('[data-claim-pass="2:free"]').innerText(), '수령 완료');
        await page.screenshot({ path: path.join(out, name + '-after-game.png') });
        await boot(true); check('Final reload retains claims and real game XP', (await snapshot()).memory, completed.memory);
        check('No account, purchase or publication HTTP mutation was attempted', row.blockedMutations, []);
        check('All new production resources loaded successfully', row.resourceErrors, []);
        check('No uncaught browser errors', row.errors, []);
        row.pass = true; console.log('PASS actual rewards integration', name, row.checks.length, 'checks');
      } catch (e) {
        row.failure = e.stack || String(e); await page.screenshot({ path: path.join(out, name + '-failure.png') }).catch(() => {}); throw e;
      } finally { await context.close(); }
    }
    report.pass = true;
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
