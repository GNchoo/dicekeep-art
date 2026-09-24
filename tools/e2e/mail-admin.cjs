// Isolated HTTP fixtures exercise the production admin UI and commerce adapter.
// Every browser request is intercepted; no live mail, account, or payment is used.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { launchBrowser } = require('./browser.cjs');
const root = path.resolve(__dirname, '../..'), out = path.resolve(process.env.E2E_OUTPUT_DIR || 'gen/e2e/mail-admin');
const sources = Object.fromEntries(['style.css', 'mail-admin.css', 'mail-admin.js', 'commerce-client.js', 'rewards.css', 'rewards-ui.js', 'casual-theme.css', 'casual-rewards.css'].map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
const clone = value => JSON.parse(JSON.stringify(value));
async function until(predicate, label) { const end = Date.now() + 10000; while (!predicate()) { if (Date.now() > end) throw Error('Timed out: ' + label); await new Promise(resolve => setTimeout(resolve, 10)); } }
async function main() {
  fs.mkdirSync(out, { recursive: true }); const browser = await launchBrowser(), checks = [], errors = [];
  const fixture = { now: Date.parse('2026-09-14T00:00:00Z'), canAdmin: false, mails: [], requests: [], previews: [], failDraft: 0, failCancel: 0, hold: null, release: null, seq: 0, confirmations: 0 };
  const check = (label, value) => { assert.ok(value, label); checks.push(label); };
  const requests = action => fixture.requests.filter(r => r.action === action);
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => { fixture.confirmations++; dialog.accept(); });
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url()), endpoint = url.pathname.replace('/fixture-commerce', '');
      const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === '/__mail_admin_fixture__') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><button id="fixture-open">운영 우편 관리</button><p id="commerce-status"></p></body></html>' });
      const artRoot = path.join(root, 'ui', 'rewards') + path.sep;
      const artPath = path.resolve(root, '.' + url.pathname);
      if (req.method() === 'GET' && artPath.startsWith(artRoot) && fs.existsSync(artPath)) return route.fulfill({ path: artPath });
      if (!url.pathname.startsWith('/fixture-commerce/')) { errors.push('Unexpected request: ' + req.url()); return send({ error: 'unexpected-fixture-route' }, 404); }
      const payload = req.postData() ? JSON.parse(req.postData()) : null, action = endpoint.startsWith('/admin/mail/') ? endpoint.slice('/admin/mail/'.length) : endpoint;
      fixture.requests.push({ action, method: req.method(), payload: clone(payload), authorization: req.headers().authorization || null });
      if (fixture.hold === action) await new Promise(resolve => { fixture.release = resolve; });
      if (endpoint === '/config') return send({ purchasesEnabled: false, products: [], providers: { web: false } });
      if (endpoint === '/cosmetics') return send({ owned: ['base'], equipped: 'base' });
      if (endpoint === '/profile') return send({ profile: { shards: 0, fixtureOnly: true } });
      if (endpoint === '/wallet') return send({ shards: 0 });
      if (endpoint === '/auth/logout') return send({ ok: true });
      if (endpoint === '/liveops') return send({ canAdmin: fixture.canAdmin, serverNow: fixture.now });
      if (!endpoint.startsWith('/admin/mail/')) { errors.push('Unexpected commerce operation: ' + endpoint); return send({ code: 'unexpected-fixture-operation' }, 404); }
      if (!fixture.canAdmin) return send({ code: 'forbidden', message: '운영자 권한이 없습니다.' }, 403);
      if (action === 'list') return send({ mails: clone(fixture.mails) });
      if (action === 'draft') {
        if (fixture.failDraft-- > 0) return send({ code: 'temporary', message: '초안 저장 응답을 확인하지 못했습니다.' }, 503);
        const existing = fixture.mails.find(m => m.id === payload.id), mail = { id: existing?.id || 'mail-' + (++fixture.seq), status: 'draft', title: payload.title, body: payload.body, reward: payload.reward, expiresAt: payload.expiresAt, createdAt: fixture.now };
        if (existing) Object.assign(existing, mail); else fixture.mails.push(mail); return send({ mail: clone(mail) });
      }
      if (action === 'preview') {
        if (Object.keys(payload).some(key => key !== 'id')) return send({ code: 'invalid-preview-fields' }, 400);
        const mail = fixture.mails.find(m => m.id === payload.id);
        const preview = { mail: clone(mail), recipientCount: 7, audienceAt: fixture.now, total: { gold: mail.reward.gold * 7, shards: mail.reward.shards * 7 }, previewToken: 'preview-fixture-' + (fixture.previews.length + 1) };
        fixture.previews.push(preview); return send(preview);
      }
      if (action === 'publish') {
        const preview = fixture.previews.find(p => p.previewToken === payload.previewToken && p.mail.id === payload.id), mail = fixture.mails.find(m => m.id === payload.id);
        if (!preview) return send({ code: 'preview-stale' }, 409);
        Object.assign(mail, { status: 'published', recipientCount: preview.recipientCount, publishedAt: fixture.now, publishedBy: 'fixture-admin', audienceAt: preview.audienceAt });
        return send({ mail: clone(mail) });
      }
      if (action === 'cancel') {
        if (fixture.failCancel-- > 0) return send({ code: 'temporary', message: '회수 응답을 확인하지 못했습니다.' }, 503);
        const mail = fixture.mails.find(m => m.id === payload.id); mail.status = 'cancelled'; return send({ mail: clone(mail) });
      }
      errors.push('Unexpected admin operation: ' + action); return send({ code: 'unexpected-fixture-operation' }, 404);
    });
    await page.goto('http://127.0.0.1:8137/__mail_admin_fixture__');
    for (const file of ['style.css', 'mail-admin.css', 'rewards.css', 'casual-theme.css', 'casual-rewards.css']) await page.addStyleTag({ content: sources[file] });
    await page.evaluate(() => {
      localStorage.setItem('dk_commerce_session_v1', JSON.stringify({ token: 'fixture-token-only', accountId: 'fixture-admin', expiresAt: 4102444800000 }));
      window.DKCOMMERCE_CONFIG = { url: 'http://127.0.0.1:8137/fixture-commerce' };
      window.DKPROGRESSION = { sanitize: profile => structuredClone(profile) }; window.DK = { phase: 'lobby', gold: 123, lives: 7 };
      window.__beforeGame = JSON.stringify(DK);
      window.DKREWARDS = { current: () => ({ account: { linked: true }, canAdmin: false, mail: [] }), list: async () => DKREWARDS.current() };
    });
    await page.addScriptTag({ content: sources['commerce-client.js'] }); await page.evaluate(() => DKCOMMERCE.init());
    await page.addScriptTag({ content: sources['mail-admin.js'] }); await page.addScriptTag({ content: sources['rewards-ui.js'] });
    await page.evaluate(() => { document.getElementById('fixture-open').onclick = () => DKMAILADMIN.open(); });
    await page.evaluate(() => DKREWARDSUI.open('mail'));
    check('Non-admin reward view has no admin entry', await page.locator('#rewards-mail-admin').count() === 0); await page.evaluate(() => DKREWARDSUI.close());
    await page.click('#fixture-open'); await page.waitForFunction(() => document.getElementById('mail-admin-status').textContent.includes('권한이 없습니다'));
    check('Unauthorized direct open hides form', !(await page.locator('#mail-admin-form').isVisible()));
    check('Unauthorized direct open hides management actions', !(await page.locator('.mail-admin-actions').isVisible()));
    const denied = await page.evaluate(() => DKCOMMERCE.adminMail('list').then(() => null, e => ({ code: e.code, status: e.status })));
    check('Server 403 is preserved by actual commerce adapter', denied.code === 'forbidden' && denied.status === 403);
    await page.keyboard.press('Escape'); check('Admin dialog Escape restores opener focus', await page.evaluate(() => !document.getElementById('mail-admin').open && document.activeElement.id === 'fixture-open'));
    fixture.canAdmin = true; await page.click('#fixture-open'); await page.waitForSelector('#mail-admin-form:visible');
    check('Authorized empty list is explicit', /작성한 우편이 없습니다/.test(await page.locator('#mail-admin-list').innerText()));
    const title = '<img src=x onerror="window.__injected=true">', body = '<script>window.__injected=true</script>\n' + '긴우편내용'.repeat(100);
    await page.fill('#mail-admin-form [name=title]', title); await page.fill('#mail-admin-form [name=body]', body);
    await page.fill('#mail-admin-form [name=gold]', '100'); await page.fill('#mail-admin-form [name=shards]', '3'); await page.selectOption('#mail-admin-form [name=days]', '7');
    fixture.failDraft = 1; await page.click('#mail-admin-save'); await page.waitForFunction(() => document.getElementById('mail-admin-status').textContent.includes('응답을 확인하지'));
    check('Draft failure leaves retry available', !(await page.locator('#mail-admin-save').isDisabled()));
    const firstDraft = clone(requests('draft').at(-1)); fixture.now += 60000;
    await page.click('#mail-admin-save'); await page.waitForSelector('#mail-admin-preview-button');
    const secondDraft = requests('draft').at(-1);
    check('Uncertain draft retry preserves request id and exact expiry payload', JSON.stringify(secondDraft.payload) === JSON.stringify(firstDraft.payload));
    check('Draft expiry uses server time', firstDraft.payload.expiresAt === Date.parse('2026-09-14T00:00:00Z') + 7 * 86400000);
    check('Draft uses POST with idempotency key', secondDraft.method === 'POST' && /^[a-f0-9-]{36}$/.test(secondDraft.payload.requestId));
    check('Saving a draft does not publish', requests('publish').length === 0 && fixture.mails[0].status === 'draft');
    await page.click('#mail-admin-preview-button'); await page.waitForSelector('#mail-admin-publish');
    check('Preview request contains only id and excludes requestId', JSON.stringify(Object.keys(requests('preview').at(-1).payload)) === '["id"]');
    check('Preview shows fixed audience and totals', /대상 7명/.test(await page.locator('#mail-admin-preview').innerText()) && /골드 700 \/ 조각 21/.test(await page.locator('#mail-admin-preview').innerText()));
    check('Preview and list render untrusted content as text', await page.evaluate(() => !window.__injected && !document.querySelector('#mail-admin img,#mail-admin script') && document.querySelector('#mail-admin-preview h4').textContent.startsWith('<img')));
    const fits = await page.evaluate(() => { const d = document.getElementById('mail-admin'), r = d.getBoundingClientRect(); return d.scrollWidth <= d.clientWidth + 1 && r.left >= 0 && r.right <= innerWidth; });
    check('Long 390px admin form and preview have no horizontal overflow', fits);
    await page.screenshot({ path: path.join(out, 'preview-390.png') });
    await page.fill('#mail-admin-form [name=body]', body + '\n편집한 내용');
    check('Editing invalidates preview and removes publish action', await page.locator('#mail-admin-publish').count() === 0);
    await page.click('#mail-admin-save'); await page.waitForSelector('#mail-admin-preview-button'); await page.click('#mail-admin-preview-button'); await page.waitForSelector('#mail-admin-publish');
    const confirmed = fixture.previews.at(-1); fixture.hold = 'publish';
    await page.evaluate(() => { const b = document.getElementById('mail-admin-publish'); b.click(); b.dispatchEvent(new MouseEvent('click')); });
    await until(() => fixture.release && requests('publish').length === 1, 'held publish');
    check('Publish double click sends one request', requests('publish').length === 1);
    check('Publish uses latest preview token and explicit target draft', requests('publish')[0].payload.previewToken === confirmed.previewToken && requests('publish')[0].payload.id === confirmed.mail.id);
    check('Publish action stays disabled while pending', await page.locator('#mail-admin-publish').isDisabled());
    fixture.hold = null; fixture.release(); fixture.release = null;
    await page.waitForSelector('#mail-admin-cancel');
    check('Published message hides draft editing form', !(await page.locator('#mail-admin-form').isVisible()));
    check('Published receipt includes audience and issuer', /7명/.test(await page.locator('#mail-admin-preview').innerText()) && /발송자 fixture-admin/.test(await page.locator('#mail-admin-preview').innerText()));
    fixture.failCancel = 1; await page.click('#mail-admin-cancel'); await page.waitForFunction(() => document.getElementById('mail-admin-status').textContent.includes('회수 응답'));
    const cancelAttempt = requests('cancel')[0].payload.requestId; fixture.hold = 'cancel';
    await page.evaluate(() => { const b = document.getElementById('mail-admin-cancel'); b.click(); b.dispatchEvent(new MouseEvent('click')); });
    await until(() => fixture.release && requests('cancel').length === 2, 'held cancel retry');
    check('Cancel retry reuses the uncertain attempt id', requests('cancel')[1].payload.requestId === cancelAttempt);
    check('Cancel duplicates cannot issue extra requests while pending', requests('cancel').length === 2);
    fixture.hold = null; fixture.release(); fixture.release = null;
    await page.waitForFunction(() => document.getElementById('mail-admin-preview').textContent.includes('회수했습니다'));
    check('Cancellation states already claimed rewards remain', /기존 수령 보상은 유지/.test(await page.locator('#mail-admin-preview').innerText()));
    fixture.canAdmin = false; await page.click('#mail-admin-refresh'); await page.waitForFunction(() => document.getElementById('mail-admin-status').textContent.includes('권한이 없습니다'));
    check('Revoked permission surfaces server refusal', /운영자 권한이 없습니다/.test(await page.locator('#mail-admin-status').innerText()));
    fixture.canAdmin = true; await page.evaluate(() => DKMAILADMIN.close()); fixture.hold = '/liveops';
    await page.click('#fixture-open'); await until(() => !!fixture.release, 'held owner lookup');
    await page.evaluate(() => DKCOMMERCE.signOut());
    check('Account change closes admin immediately', await page.evaluate(() => !document.getElementById('mail-admin').open));
    fixture.hold = null; fixture.release(); fixture.release = null;
    await page.waitForTimeout(30);
    check('Late owner reply cannot reopen editor', await page.evaluate(() => !document.getElementById('mail-admin').open && document.getElementById('mail-admin-form').hidden));
    check('Game state is unchanged', await page.evaluate(() => JSON.stringify(DK) === __beforeGame));
    check('No payment endpoint was called', fixture.requests.every(r => !/order|payment|billing/.test(r.action)));
    check('Every admin request used fixture bearer authentication', fixture.requests.filter(r => !r.action.startsWith('/')).every(r => r.authorization === 'Bearer fixture-token-only'));
    check('No script errors or unexpected network requests: ' + JSON.stringify(errors), errors.length === 0);
    await context.close();
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ pass: true, isolated: true, actualAdapter: true, checks, errors, confirmations: fixture.confirmations, requests: fixture.requests, sourceHashes: Object.fromEntries(Object.entries(sources).map(([file, body]) => [file, crypto.createHash('sha256').update(body).digest('hex')])) }, null, 2));
    console.log('PASS mail admin:', checks.length, 'checks');
  } finally { if (fixture.release) fixture.release(); await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
