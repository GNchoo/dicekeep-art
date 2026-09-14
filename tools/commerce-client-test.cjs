// No real login, provider SDK or payment request is made by this suite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const P = require('../progression.js');
const repo = path.resolve(__dirname, '..');
const client = fs.readFileSync(path.join(repo, 'commerce-client.js'), 'utf8');
const paymentReturn = fs.readFileSync(path.join(repo, 'payment-return.js'), 'utf8');
console.log('commerce-client SHA256', crypto.createHash('sha256').update(client).digest('hex'));
console.log('VM tests use fake API/provider functions only; browser tests block every external request.');
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const profile = shards => Object.assign(P.defaultProfile(), { shards });
const accountSession = { token: 'test-only-token', accountId: 'test-account-A', obfuscatedAccountId: 'test-obfuscated-A' };
const products = [{ sku: 'shards600', kind: 'currency', shards: 600, amount: 9900, currency: 'KRW', playProductId: 'test.shards600' }];
const config = { purchasesEnabled: true, paymentMode: 'test', googleClientId: 'test-google-client', products };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function fixture({ configured = true, linked = true, native = false, router, purchase } = {}) {
  const memory = new Map(), calls = [], loaded = [], payments = [], nativeCalls = [], events = [], elements = new Map();
  const localStorage = { getItem: k => memory.get(k) || null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) };
  if (linked) localStorage.setItem('dk_commerce_session_v1', JSON.stringify(accountSession));
  localStorage.setItem('DKSAVE', JSON.stringify({ progression: profile(35), gems: 7 }));
  function element() { return { textContent: '', disabled: false, listeners: {}, replaceChildren() {}, remove() {}, addEventListener(type, fn) { this.listeners[type] = fn; } }; }
  for (const id of ['commerce-status', 'commerce-google', 'payment-retry']) elements.set(id, element());
  const location = new URL('https://game.invalid/payment.html');
  const listeners = {};
  const sandbox = {
    DKCOMMERCE_CONFIG: { url: configured ? 'https://commerce.invalid' : '' }, DK: { phase: 'lobby' },
    localStorage, location, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, console,
    crypto: { randomUUID: () => 'test-' + crypto.randomUUID() },
    CustomEvent: class { constructor(type) { this.type = type; } },
    document: { getElementById: id => elements.get(id), createElement: element, head: { appendChild(el) { loaded.push(el.src); queueMicrotask(() => el.onload()); } } },
    history: { replaceState(_a, _b, value) { location.href = new URL(value, location).href; } },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatchEvent(event) { events.push(event.type); for (const fn of listeners[event.type] || []) fn(event); },
    google: { accounts: { id: { initialize(value) { sandbox.googleCallback = value.callback; }, renderButton() {}, disableAutoSelect() {} } } },
    TossPayments(key) { return { payment(customer) { return { async requestPayment(args) { payments.push({ key, customer, args: copy(args) }); } }; } }; },
    async fetch(url, options) {
      const call = { path: new URL(url).pathname, method: options.method, headers: copy(options.headers), data: options.body && JSON.parse(options.body) }; calls.push(call);
      let result = router && await router(call, sandbox);
      if (result === undefined) result = call.path === '/config' ? { body: config } : call.path === '/profile' ? { body: { profile: profile(700) } } : call.path === '/wallet' ? { body: { free: 700, paid: 0, debt: 0 } } : call.path === '/cosmetics' ? { body: { owned: ['base'], equipped: 'base' } } : { status: 500, body: { error: 'unmocked-path' } };
      const status = result.status || 200; return { ok: status >= 200 && status < 300, status, json: async () => copy(result.body) };
    },
  };
  if (native) sandbox.Capacitor = { getPlatform: () => 'android', Plugins: { DicekeepBilling: {
    async addListener(name, fn) { sandbox.purchaseListener = fn; return { remove() {} }; },
    async purchase(args) { nativeCalls.push(copy(args)); return purchase || { productId: 'test.shards600', purchaseToken: 'test-token', state: 'PURCHASED' }; },
    async restore() { return { purchases: sandbox.restorePurchases || [] }; },
    async products() { return { products: [] }; },
    async signIn() { return { idToken: 'test-id-token' }; },
  } } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const filename of ['deck-rules.js', 'tree-rules.js', 'progression.js']) vm.runInContext(fs.readFileSync(path.join(repo, filename), 'utf8'), sandbox, { filename });
  vm.runInContext(client, sandbox, { filename: 'commerce-client.js' });
  return { C: sandbox.DKCOMMERCE, sandbox, calls, loaded, payments, nativeCalls, elements, memory, localStorage, location, events };
}

test('unconfigured client never calls API, Google or Toss, and cannot buy/login', async () => {
  const f = fixture({ configured: false, linked: false }); await f.C.init();
  assert.equal(f.C.state().configured, false); assert.equal(f.C.linked(), false);
  await assert.rejects(f.C.buy('shards600')); await assert.rejects(f.C.signIn());
  assert.deepEqual(f.calls, []); assert.deepEqual(f.loaded, []); assert.equal(f.C.profile(), null);
});

test('session is authenticated to mock server; an order uses server amount and grants nothing', async () => {
  const f = fixture({ router(call) {
    if (call.path === '/orders') return { body: { orderId: 'server-order-1', amount: 7777, currency: 'KRW', clientKey: 'test-toss-key', customerKey: 'test-customer', orderName: 'server product' } };
  } });
  await f.C.init(); assert.equal(f.C.profile().shards, 700);
  await f.C.buy('shards600');
  assert.equal(f.C.profile().shards, 700); assert.equal(f.C.state().busy, false);
  assert.deepEqual(f.calls.find(c => c.path === '/orders').data, { sku: 'shards600', platform: 'web' });
  assert.equal(f.calls.find(c => c.path === '/orders').headers.Authorization, 'Bearer test-only-token');
  assert.equal(f.payments.length, 1); assert.deepEqual(f.payments[0].args.amount, { currency: 'KRW', value: 7777 });
  assert.equal(f.payments[0].args.orderId, 'server-order-1');
  assert.deepEqual(f.loaded, ['https://js.tosspayments.com/v2/standard']);
});

test('return ignores query amount/shards; pending grants zero; same order confirmation is not locally added twice', async () => {
  let phase = 'pending';
  const f = fixture({ router(call) {
    if (call.path === '/payments/toss/confirm') return phase === 'pending'
      ? { status: 409, body: { code: 'pending' } }
      : { body: { profile: profile(1300), shards: 600, duplicate: phase === 'duplicate' } };
  } });
  await f.C.init();
  const redirect = 'https://game.invalid/payment.html?paymentKey=test-key&orderId=server-order&amount=1&shards=999999';
  f.location.href = redirect; await assert.rejects(f.C.completeWebPayment()); assert.equal(f.C.profile().shards, 700);
  assert.ok(f.location.search.includes('orderId=server-order'));
  phase = 'approved'; await f.C.completeWebPayment(); assert.equal(f.C.profile().shards, 1300); assert.equal(f.location.search, '');
  phase = 'duplicate'; f.location.href = redirect; await f.C.completeWebPayment(); assert.equal(f.C.profile().shards, 1300);
  assert.deepEqual(f.calls.filter(c => c.path === '/payments/toss/confirm').map(c => c.data), Array(2).fill({ paymentKey: 'test-key', orderId: 'server-order' }));
  const reloaded = fixture({ router(call) { if (call.path === '/payments/toss/confirm') return { body: { profile: profile(1300), shards: 600, duplicate: true } }; } });
  await reloaded.C.init(); reloaded.location.href = redirect; await reloaded.C.completeWebPayment();
  assert.equal(reloaded.C.profile().shards, 1300);
  assert.deepEqual(reloaded.calls.find(c => c.path === '/payments/toss/confirm').data, { paymentKey: 'test-key', orderId: 'server-order' });
  f.location.href = 'https://game.invalid/payment.html?result=fail&paymentKey=test-key&orderId=server-order';
  await f.C.completeWebPayment(); assert.equal(f.calls.filter(c => c.path === '/payments/toss/confirm').length, 2);
});

test('payment return retry disables while pending and retries original identifiers after failure', async () => {
  const gate = deferred(); let first = true;
  const f = fixture({ router(call) { if (call.path === '/payments/toss/confirm') { if (first) { first = false; return gate.promise; } return { body: { profile: profile(1300), shards: 600 } }; } } });
  await f.C.init(); f.location.search = '?paymentKey=test-retry-key&orderId=test-retry-order&amount=10000000';
  vm.runInContext(paymentReturn, f.sandbox, { filename: 'payment-return.js' });
  const button = f.elements.get('payment-retry');
  const waiting = button.listeners.click.call(button); assert.equal(button.disabled, true);
  gate.resolve({ status: 503, body: { error: 'temporary' } }); await waiting;
  assert.equal(button.disabled, false); assert.equal(f.C.profile().shards, 700);
  await button.listeners.click.call(button); assert.equal(button.disabled, false); assert.equal(f.C.profile().shards, 1300);
  assert.deepEqual(f.calls.filter(c => c.path === '/payments/toss/confirm').map(c => c.data), Array(2).fill({ paymentKey: 'test-retry-key', orderId: 'test-retry-order' }));
});

test('Android pending purchase is not verified or granted; SDK gets server product/account', async () => {
  const f = fixture({ native: true, purchase: { productId: 'test.shards600', purchaseToken: 'test-token', state: 'PENDING' }, router(call) {
    if (call.path === '/orders') return { body: { productId: 'server.product', obfuscatedAccountId: 'server-account' } };
  } });
  await f.C.init(); await f.C.buy('shards600');
  assert.deepEqual(f.nativeCalls, [{ productId: 'server.product', accountId: 'server-account' }]);
  assert.equal(f.calls.some(c => c.path === '/payments/google/verify'), false);
  assert.equal(f.C.profile().shards, 700); assert.deepEqual(f.loaded, []);
});

test('Android grants only returned verified profile, never native callback or response shard arithmetic', async () => {
  const gate = deferred();
  const f = fixture({ native: true, router(call) {
    if (call.path === '/orders') return { body: { productId: 'test.shards600', obfuscatedAccountId: 'server-account' } };
    if (call.path === '/payments/google/verify') return gate.promise;
  } });
  await f.C.init(); const buying = f.C.buy('shards600');
  while (!f.calls.some(c => c.path === '/payments/google/verify')) await new Promise(r => setImmediate(r));
  assert.equal(f.C.profile().shards, 700);
  gate.resolve({ body: { profile: profile(760), shards: 999999, consumePending: true } }); await buying;
  assert.equal(f.C.profile().shards, 760);
  assert.deepEqual(f.calls.find(c => c.path === '/payments/google/verify').data, { purchaseToken: 'test-token', productId: 'test.shards600' });
});

test('rejected Android verification and duplicate restored purchase cannot create local credits', async () => {
  let rejected = true;
  const f = fixture({ native: true, router(call) {
    if (call.path === '/orders') return { body: { productId: 'test.shards600', obfuscatedAccountId: 'server-account' } };
    if (call.path === '/payments/google/verify') return rejected ? { status: 409, body: { code: 'account-mismatch' } } : { body: { profile: profile(760), shards: 60, duplicate: true } };
    if (call.path === '/profile' && !rejected) return { body: { profile: profile(760) } };
  } });
  await f.C.init(); await assert.rejects(f.C.buy('shards600')); assert.equal(f.C.profile().shards, 700);
  rejected = false; const p = { purchaseToken: 'test-token', productId: 'test.shards600', state: 1 };
  f.sandbox.restorePurchases = [p, p]; await f.C.restore(); assert.equal(f.C.profile().shards, 760);
});

test('account run settlement waits for server, persists retry and removes it only after acknowledgement', async () => {
  let unavailable = true;
  const f = fixture({ router(call) {
    if (call.path === '/runs/settle') return unavailable ? { status: 503, body: { code: 'temporary' } } : { body: { profile: profile(745), shards: 45 } };
  } });
  await f.C.init(); const guest = f.localStorage.getItem('DKSAVE');
  await assert.rejects(f.C.finishRun('test-ticket', { wave: 25 }));
  assert.equal(f.C.profile().shards, 700); assert.equal(JSON.parse(f.localStorage.getItem('dk_commerce_pending_v1')).length, 1);
  unavailable = false; await f.C.retryPending(); assert.equal(f.C.profile().shards, 745);
  assert.deepEqual(JSON.parse(f.localStorage.getItem('dk_commerce_pending_v1')), []);
  f.C.signOut(); assert.equal(f.C.profile(), null); assert.equal(f.C.linked(), false);
  assert.equal(f.localStorage.getItem('DKSAVE'), guest);
});

function rewardBridge(f) {
  const L=require('../liveops-rules.js');
  Object.assign(f.sandbox,{DKLIVEOPS:L,structuredClone,navigator:{}});
  vm.runInContext(fs.readFileSync(path.join(repo,'rewards-client.js'),'utf8'),f.sandbox,{filename:'rewards-client.js'});
  const R=f.sandbox.DKREWARDS;
  R.configure({canClaim:()=>f.sandbox.DK.phase==='lobby',readGuest:()=>({...JSON.parse(f.localStorage.getItem('DKSAVE')),liveops:L.defaultState()}),commitGuest:()=>{throw Error('account operation touched guest save');}});
  return R;
}
function liveopsFixture() {
  const L=require('../liveops-rules.js'),now=Date.parse('2030-01-02T03:00:00Z');
  return {profile:profile(703),wallet:{free:703,paid:0,debt:0},cosmetics:{owned:['base'],equipped:'base'},liveops:L.view(L.defaultState(),{now}),inbox:[],canAdmin:false,serverNow:now};
}
test('reward bridge uses displayed server day, adopts only server balances, and leaves guest data untouched',async()=>{
  const value=liveopsFixture();
  const f=fixture({router:call=>['/liveops','/attendance/claim'].includes(call.path)?{body:value}:undefined});await f.C.init();const R=rewardBridge(f),saved=f.localStorage.getItem('DKSAVE');
  await R.list();await R.claimAttendance();const call=f.calls.find(c=>c.path==='/attendance/claim');
  assert.equal(call.data.day,'2030-01-02');assert.ok(call.data.requestId);assert.match(call.headers.Authorization,/Bearer /);
  assert.equal(f.C.profile().shards,703);assert.equal(f.localStorage.getItem('DKSAVE'),saved);
  await assert.rejects(R.buyPass(),/준비/);assert.equal(f.calls.filter(c=>c.path==='/orders').length,0);
});
test('logout or entering combat during reward lookup cannot redirect a claim to another context',async()=>{
  for(const change of ['logout','combat']) {
    const wait=deferred();const f=fixture({router:call=>call.path==='/liveops'?wait.promise:call.path==='/auth/logout'?{body:{ok:true}}:undefined});
    await f.C.init();const R=rewardBridge(f),pending=R.claimAttendance();
    if(change==='logout')f.C.signOut();else f.sandbox.DK.phase='playing';
    wait.resolve({body:liveopsFixture()});await assert.rejects(pending);
    assert.equal(f.calls.filter(c=>c.path==='/attendance/claim').length,0);
  }
});
test('Android pass purchase stays disabled until actual store product price is available',async()=>{
  const pass={sku:'passFounders',kind:'pass',passId:'founders',playProductId:'dicekeep.pass_founders',amount:2900,shards:0};
  const f=fixture({native:true,router:call=>call.path==='/config'?{body:{...config,products:[pass]}}:call.path==='/liveops'?{body:liveopsFixture()}:undefined});
  await f.C.init();const R=rewardBridge(f);assert.equal((await R.list()).pass.purchaseEnabled,false);await assert.rejects(R.buyPass(),/준비/);assert.equal(f.nativeCalls.length,0);
});
test('operator API sends only the preview id, keeps publish token, and cannot bypass server authorization',async()=>{
  const f=fixture({router:call=>call.path.startsWith('/admin/mail/')?{status:403,body:{error:'admin-required'}}:undefined});await f.C.init();
  await assert.rejects(f.C.adminMail('preview',{id:'mail_test',requestId:'ignored'}));
  assert.deepEqual(f.calls.at(-1).data,{id:'mail_test'});
  await assert.rejects(f.C.adminMail('publish',{id:'mail_test',previewToken:'server-token',requestId:'fixed-request'}));
  assert.deepEqual(f.calls.at(-1).data,{id:'mail_test',previewToken:'server-token',requestId:'fixed-request'});
  assert.equal(f.C.profile().shards,700);await assert.rejects(f.C.adminMail('delete',{}));
});

test('battle proofs persist before the board is cleared; pending service failures do not block the next match or lose old claims', async () => {
  let ready=false;
  const f=fixture({router(call){
    if(call.path==='/runs/settle')return ready?{body:{profile:profile(750),shards:50}}:{status:503,body:{error:'battle-result-pending'}};
    if(call.path==='/runs/start')return{body:{ticket:'next-ticket',profile:profile(700),snapshot:P.snapshot(profile(700),'coop')}};
  }});
  await f.C.init();const guest=f.localStorage.getItem('DKSAVE');
  const battle={code:'ABC234',matchId:'ABC234:1:2',pid:'aaaa1111',key:'a'.repeat(32)};
  for(let i=0;i<40;i++)f.C.queueRun('battle-ticket-'+i,{battle});
  assert.equal(JSON.parse(f.localStorage.getItem('dk_commerce_pending_v1')).length,40,'no silent 32-run discard');
  const started=await f.C.startRun('coop',{battle});assert.equal(started.ticket,'next-ticket');
  assert.deepEqual(f.calls.find(x=>x.path==='/runs/start').data,{mode:'coop',battle});
  assert.equal(JSON.parse(f.localStorage.getItem('dk_commerce_pending_v1')).length,40);
  const setter=f.localStorage.setItem;f.localStorage.setItem=()=>{throw Error('quota');};
  assert.throws(()=>f.C.queueRun('unqueued',{battle}),/저장 공간/,'synchronous failure lets game preserve its checkpoint');
  f.localStorage.setItem=setter;ready=true;await f.C.retryPending();
  assert.equal(JSON.parse(f.localStorage.getItem('dk_commerce_pending_v1')).length,0);assert.equal(f.C.profile().shards,750);assert.equal(f.localStorage.getItem('DKSAVE'),guest);
});

test('logout ignores a late account action response instead of resurrecting that profile', async () => {
  const gate = deferred();
  const f = fixture({ router(call) { if (call.path === '/profile/action') return gate.promise; } });
  await f.C.init(); const guest = f.localStorage.getItem('DKSAVE');
  const action = f.C.action('upgrade', { face: 1 }); f.C.signOut();
  gate.resolve({ body: { profile: profile(900) } }); await action.catch(() => {});
  assert.equal(f.C.linked(), false); assert.equal(f.C.profile(), null, 'stale response must not become the active guest/account profile');
  assert.equal(f.localStorage.getItem('DKSAVE'), guest);
});

test('logout ignores an in-flight refresh response', async () => {
  const gate = deferred(); let delay = false;
  const f = fixture({ router(call) { if (call.path === '/profile' && delay) return gate.promise; } });
  await f.C.init(); delay = true;
  const refreshing = f.C.refresh(); f.C.signOut(); gate.resolve({ body: { profile: profile(1200) } });
  await refreshing.catch(() => {}); assert.equal(f.C.profile(), null); assert.equal(f.C.linked(), false);
});

test('interrupted web order persists per owner and restore reconfirms the same order without a query price', async () => {
  let approved = false;
  const f = fixture({ router(call) {
    if (call.path === '/orders') return { body: { orderId: 'persisted-order', amount: 9900, currency: 'KRW', clientKey: 'test-key', customerKey: 'customer', orderName: 'test' } };
    if (call.path === '/payments/toss/confirm') return approved ? { body: { profile: profile(1300), shards: 600 } } : { status: 409, body: { code: 'payment-not-complete' } };
    if (call.path === '/profile' && approved) return { body: { profile: profile(1300) } };
  } });
  await f.C.init(); await f.C.buy('shards600');
  const saved = JSON.parse(f.localStorage.getItem('dk_commerce_orders_v1'));
  assert.deepEqual(saved, [{ owner: 'test-account-A', orderId: 'persisted-order' }]);
  saved.push({ owner: 'other-account', orderId: 'other-order' }); f.localStorage.setItem('dk_commerce_orders_v1', JSON.stringify(saved));
  await f.C.restore(); assert.equal(f.C.profile().shards, 700);
  assert.equal(JSON.parse(f.localStorage.getItem('dk_commerce_orders_v1')).length, 2);
  approved = true; await f.C.restore(); assert.equal(f.C.profile().shards, 1300);
  assert.deepEqual(f.calls.filter(c => c.path === '/payments/toss/confirm').map(c => c.data), Array(2).fill({ orderId: 'persisted-order' }));
  assert.deepEqual(JSON.parse(f.localStorage.getItem('dk_commerce_orders_v1')), [{ owner: 'other-account', orderId: 'other-order' }]);
});

test('phone/desktop shop UI is disabled offline; mock account profile never overwrites guest SAVE', { skip: process.env.COMMERCE_VM_ONLY === '1', timeout: 300000 }, async () => {
  const { launchBrowser } = require('./e2e/browser.cjs');
  const browser = await launchBrowser();
  const output = path.join(repo, 'gen/e2e/commerce-client'); fs.mkdirSync(output, { recursive: true });
  const summary = { scope: 'Local actual game and shop; all account/API data are fixtures. Every real external request is blocked.', clientSha256: crypto.createHash('sha256').update(client).digest('hex'), cases: [], pass: false };
  const base = (process.env.E2E_BASE_URL || 'http://localhost:8138/').replace(/\/?$/, '/');
  const uiSource = fs.readFileSync(path.join(repo, 'commerce-ui.js'), 'utf8');
  try {
    for (const [name, viewport] of [['phone', { width: 440, height: 956 }], ['desktop', { width: 1240, height: 860 }]]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage(); let configured = false, account = profile(700);
      const row = { name, viewport, api: [], externalBlocked: [], pageErrors: [], checks: [] }; summary.cases.push(row);
      const dir = path.join(output, name); fs.mkdirSync(dir, { recursive: true });
      page.on('pageerror', e => row.pageErrors.push(e.message));
      await page.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
      await page.route('**/*', async route => {
        const req = route.request(), u = new URL(req.url());
        if (u.hostname === 'commerce.invalid') {
          const data = req.postDataJSON(); row.api.push({ path: u.pathname, data, authorization: req.headers().authorization });
          let body, status = 200;
          if (u.pathname === '/config') body = config;
          else if (u.pathname === '/profile') body = { profile: account };
          else if (u.pathname === '/wallet') body = { wallet: { free: account.shards, paid: 0, debt: 0 } };
          else if (u.pathname === '/cosmetics') body = { cosmetics: { owned: ['classic'], equipped: 'classic' } };
          else if (u.pathname === '/liveops') { const L=require('../liveops-rules.js');body={profile:account,wallet:{free:account.shards,paid:0,debt:0},liveops:L.view(L.defaultState()),inbox:[],canAdmin:false,serverNow:Date.now()}; }
          else if (u.pathname === '/profile/action') { account = profile(690); account.tree.mastery[1] = 3; body = { profile: account }; }
          else { status = 500; body = { error: 'unexpected mock path' }; }
          return route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' }, body: JSON.stringify(body) });
        }
        if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) { row.externalBlocked.push(req.url()); return route.abort('blockedbyclient'); }
        return route.continue();
      });
      await page.route('**/commerce-config.js*', route => route.fulfill({ contentType: 'application/javascript', body: 'window.DKCOMMERCE_CONFIG={url:' + JSON.stringify(configured ? 'https://commerce.invalid' : '') + '};' }));
      await page.route('**/commerce-client.js*', route => route.fulfill({ contentType: 'application/javascript', body: client }));
      await page.route('**/commerce-ui.js*', route => route.fulfill({ contentType: 'application/javascript', body: uiSource }));
      const readyShop = async () => {
        await page.waitForFunction(() => window.DK && DK.phase === 'title', null, { timeout: 120000 });
        await page.click('#ov-btn'); await page.evaluate(() => { DK.muted = true; });
        await page.click('#btn-shop'); await page.waitForSelector('#commerce-products [data-sku]');
      };
      try {
        await page.goto(new URL('index.html?net=off&v=commerce-test', base).href); await readyShop();
        const off = await page.evaluate(() => ({ configured: DKCOMMERCE.state().configured, disabled: [...document.querySelectorAll('#commerce-products [data-sku]')].every(b => b.disabled), count: document.querySelectorAll('#commerce-products [data-sku]').length, signinDisabled: document.getElementById('commerce-signin').disabled, scripts: [...document.scripts].map(s => s.src).filter(s => /accounts\.google|tosspayments/.test(s)) }));
        assert.deepEqual(off, { configured: false, disabled: true, count: 2, signinDisabled: true, scripts: [] });
        assert.deepEqual(row.api, []); row.checks.push('unconfigured: all 3 purchase buttons/login disabled; API and provider SDK requests zero');
        await page.locator('#commerce-shop').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(dir, 'shop-unconfigured.png') });
        const guest = profile(35); guest.deck = [2, 3, 4, 5, 6]; guest.collection.presets[0].faces = guest.deck.slice();
        await page.evaluate(({ guest, session }) => {
          DKSAVE.progression = guest; localStorage.setItem('DKSAVE', JSON.stringify(DKSAVE));
          localStorage.setItem('dk_commerce_session_v1', JSON.stringify(session));
        }, { guest, session: accountSession });
        configured = true; await page.reload(); await readyShop();
        await page.waitForFunction(() => DKCOMMERCE.profile() && DKCOMMERCE.profile().shards === 700);
        assert.deepEqual(await page.evaluate(() => ({ account: DKCOMMERCE.profile().shards, guest: DKSAVE.progression.shards, saved: JSON.parse(localStorage.getItem('DKSAVE')).progression.shards })), { account: 700, guest: 35, saved: 35 });
        await page.evaluate(() => DKCOMMERCE.action('treeUpgrade', { face: 1 }));
        assert.deepEqual(await page.evaluate(() => ({ account: DKCOMMERCE.profile().shards, guest: DKSAVE.progression.shards, saved: JSON.parse(localStorage.getItem('DKSAVE')).progression.shards })), { account: 690, guest: 35, saved: 35 });
        row.checks.push('server account profile and action remain separate from in-memory/localStorage guest SAVE');
        const boxes = await page.evaluate(() => [...document.querySelectorAll('#commerce-products [data-sku]')].map(button => {
          const r = button.getBoundingClientRect(), card = button.closest('article').getBoundingClientRect();
          return { disabled: button.disabled, text: button.textContent, fits: r.width > 0 && r.x >= 0 && r.right <= innerWidth + 1 && r.x >= card.x - 1 && r.right <= card.right + 1 };
        }));
        assert.ok(boxes.length && boxes.every(b => !b.disabled && b.fits)); row.productButtons = boxes;
        row.checks.push('configured mock account price/button fits actual viewport');
        await page.locator('#commerce-shop').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(dir, 'shop-mock-account.png') });
        await page.click('#commerce-signout');
        assert.deepEqual(await page.evaluate(() => ({ linked: DKCOMMERCE.linked(), account: DKCOMMERCE.profile(), guest: DKSAVE.progression, saved: JSON.parse(localStorage.getItem('DKSAVE')).progression })), { linked: false, account: null, guest, saved: guest });
        await page.click('#shop-back'); await page.evaluate(() => DKlobbyView('single')); await page.click('#btn-deck-open');
        assert.equal((await page.textContent('#deck-shards')).trim(), '35');
        row.checks.push('logout restores the original guest deck/wallet in actual collection UI');
        await page.screenshot({ path: path.join(dir, 'guest-restored.png') });
        assert.deepEqual(row.externalBlocked, []); assert.deepEqual(row.pageErrors, []);
        assert.ok(row.api.filter(c => c.path !== '/config').every(c => c.authorization === 'Bearer test-only-token'));
        row.checks.push('no external SDK/login/payment request; no uncaught page error'); row.pass = true;
      } catch (error) { row.failure = error.stack; await page.screenshot({ path: path.join(dir, 'failure.png') }).catch(() => {}); throw error; }
      finally { await context.close(); }
    }
    summary.pass = true;
  } finally { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(summary, null, 2)); await browser.close(); }
});
