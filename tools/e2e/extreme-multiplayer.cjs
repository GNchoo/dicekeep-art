const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');
const out = path.resolve(process.env.E2E_OUTPUT_DIR || 'gen/e2e/extreme-multiplayer'); fs.mkdirSync(out, { recursive: true });
const net = process.env.NET || 'ws://localhost:8788', base = process.env.E2E_BASE_URL || 'http://localhost:8137/';
(async () => {
  const browser = await launchBrowser(), pages = [], errors = [], report = { checks: [], pass: false };
  try {
    for (let i = 0; i < 3; i++) {
      const context = await browser.newContext({ viewport: i === 1 ? { width: 440, height: 956 } : { width: 1240, height: 860 } });
      const p = await context.newPage(); pages.push(p); p.on('pageerror', e => errors.push(e.message));
      if (i === 2) await p.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' }; });
      await p.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
      await p.route('**/game.js*', async route => { const r = await route.fetch(); await route.fulfill({ response: r, body: (await r.text()).replace('window.DK = S;', 'window.__mpRecovery={persistRun,readRunSave};\nwindow.DK = S;') }); });
      await p.goto(new URL('index.html?net=' + encodeURIComponent(net), base).href);
      await p.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 }); await p.click('#ov-btn');
      await p.evaluate(() => { DK.muted = true; DKlobbyView('multi'); }); await p.selectOption('#mp-mode', 'extreme'); await p.fill('#mp-name', '복구' + i);
    }
    let [a,b,c] = pages;
    await a.click('#mp-create'); await a.waitForFunction(() => DK.phase === 'mpRoom'); const code = await a.evaluate(() => DKNET.code);
    for (const p of [b,c]) { await p.click('#mp-join'); await p.fill('#mp-code', code); await p.click('#mp-join-go'); await p.waitForFunction(() => DK.phase === 'mpRoom'); }
    await a.waitForFunction(() => DKNET.members().length === 3); await a.click('#mp-start');
    for (const p of pages) await p.waitForFunction(() => DK.phase === 'playing' && DK.net?.mode === 'extreme');
    const before = await b.evaluate(() => {
      DK.paused = true; DK.wave = 205; DK.inf.doneW = DK.net.doneW = 204; DK.inf.kills = 70; DK.waveActive = false; DK.autoT = 500;
      DK.heldDie = 6; DKplace(0); DK.towers[0].growthCarry = 2.52; DK.inf.power[6] = 8;
      DKNET.done(204); DKNET.sum(DKMP.summary(false)); __mpRecovery.persistRun();
      return { id: DK.inf.runId, t0: DK.net.t0, pid: DK.net.pid, gold: DK.gold, size: DK.towers.length };
    });
    await b.reload(); await b.waitForFunction(() => window.DK?.phase === 'title' && DKNET.inRoom(), null, { timeout: 120000 }); await b.click('#ov-btn');
    await b.waitForFunction(() => DK.phase === 'playing' && DK.towers.length === 1, null, { timeout: 20000 });
    const after = await b.evaluate(() => ({ id: DK.inf.runId, t0: DK.net.t0, pid: DK.net.pid, gold: DK.gold, size: DK.towers.length,
      done: DK.inf.doneW, status: DK.net.status, power: DK.inf.power[6], carry: DK.towers[0].growthCarry, snapshot: DK.inf.growthSnapshot.growth }));
    assert.deepEqual(after, { ...before, done: 204, status: 'alive', power: 8, carry: 2.52, snapshot: true });
    assert.equal(await a.evaluate(pid => DKNET.members().find(p => p.pid === pid).status, before.pid), 'alive');
    report.checks.push('three actual clients; phone reload restores board/power/growth/run ID and original room clock; no death report');
    await b.screenshot({ path: path.join(out, 'phone-restored.png') });
    const nativeBefore = await c.evaluate(() => {
      DK.paused=true; DK.wave=203; DK.inf.doneW=DK.net.doneW=202; DK.autoT=500; DK.waveActive=false;
      DK.heldDie=6;DKplace(0);__mpRecovery.persistRun();DKNET.done(202);
      return { id:DK.inf.runId,pid:DK.net.pid,t0:DK.net.t0 };
    });
    const storageState = await c.context().storageState(); await c.context().close();
    const restarted = await browser.newContext({ storageState, viewport:{width:1240,height:860} }); c=await restarted.newPage();
    c.on('pageerror', e=>errors.push(e.message));
    await c.addInitScript(()=>{window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'android'};});
    await c.goto(new URL('index.html?net='+encodeURIComponent(net),base).href);
    await c.waitForFunction(()=>window.DK?.phase==='title'&&DKNET.inRoom(),null,{timeout:120000});await c.click('#ov-btn');
    await c.waitForFunction(()=>DK.phase==='playing'&&DK.towers.length===1);
    assert.deepEqual(await c.evaluate(()=>({id:DK.inf.runId,pid:DK.net.pid,t0:DK.net.t0})),nativeBefore);
    report.checks.push('native storage simulation: completely new browser context restores persistent room identity and board within grace period');
    for (const [i,p] of [[0,a],[1,b],[2,c]]) await p.evaluate(i => {
      DK.wave = 205 + i; DK.inf.doneW = DK.net.doneW = 204; DK.inf.kills = [50,70,60][i];
      DKNET.done(204); DKNET.sum(DKMP.summary(false)); DKMP.die('quit');
    }, i);
    await a.waitForFunction(() => DKNET.state === 'ended');
    const rank = await a.evaluate(() => DKNET.room.game.ranking);
    assert.equal(rank[0].pid, before.pid); assert.ok(rank.every(r => r.wave === 204));
    assert.equal(await b.evaluate(() => __mpRecovery.readRunSave(true)), null);
    assert.equal(await b.evaluate(() => DKSAVE.progression.records.extremeMulti.runs.length), 1);
    report.checks.push('equal completed waves rank by kills regardless of started wave; ending settles once and removes recovery');
    assert.deepEqual(errors, []); report.pass = true; console.log('PASS extreme multiplayer', report.checks);
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
