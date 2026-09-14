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
      await p.route('**/game.js*', async route => { const r = await route.fetch(); await route.fulfill({ response: r, body: (await r.text()).replace('window.DK = S;', 'window.__mpRecovery={persistRun,readRunSave,saveSave,towerAwakened,withView,badgeLabels:t=>{const labels=[],original=ctx.fillText;ctx.fillText=txt=>labels.push(txt);try{drawStarBadge(t);}finally{ctx.fillText=original;}return labels;}};\nwindow.DK = S;') }); });
      await p.goto(new URL('index.html?net=' + encodeURIComponent(net), base).href);
      await p.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 }); await p.click('#ov-btn');
      await p.evaluate(i => {
        DK.muted = true;
        const P=DKPROGRESSION.defaultProfile(),deck=[1,4,6,14,19];
        for(const id of deck){P.levels[id]=1;Object.assign(P.collection.cards[id],{owned:true,class:DKDECKRULES.get(id).baseClass});P.tree.mastery[id]=3;P.tree.talents[id]=id===6?'insight':'force';P.tree.awakenings[id]=!(i===1&&id===6);}
        P.tree.supporter=['barrage','supply','crusher'][i];
        if(!DKPROGRESSION.setPreset(P,0,deck).ok)throw Error('tree multiplayer fixture deck rejected');
        DKSAVE.progression=P;__mpRecovery.saveSave(); DKlobbyView('multi');
        window.__receivedSummaries=[];DKNET.on('sum',m=>window.__receivedSummaries.push(m));
      },i); await p.selectOption('#mp-mode', 'extreme'); await p.fill('#mp-name', '복구' + i);
    }
    let [a,b,c] = pages;
    await a.click('#mp-create'); await a.waitForFunction(() => DK.phase === 'mpRoom'); const code = await a.evaluate(() => DKNET.code);
    for (const p of [b,c]) { await p.click('#mp-join'); await p.fill('#mp-code', code); await p.click('#mp-join-go'); await p.waitForFunction(() => DK.phase === 'mpRoom'); }
    await a.waitForFunction(() => DKNET.members().length === 3); await a.click('#mp-start');
    for (const p of pages) { await p.waitForFunction(() => DK.phase === 'playing' && DK.net?.mode === 'extreme'); await p.evaluate(()=>{DK.paused=true;});assert.equal(await p.evaluate(()=>DK.inf.growthSnapshot.treeVersion),1); }
    report.checks.push('all three clients start an explicit tree-version run with mastery, chosen talents, researched awakening and a free supporter');
    const before = await b.evaluate(() => {
      DK.paused = true; DK.wave = 205; DK.inf.doneW = DK.net.doneW = 204; DK.inf.kills = 70; DK.waveActive = false; DK.autoT = 500;
      for(const [face,pips,spot,abilityT] of [[6,7,0,5.5],[14,3,1,17.25],[19,2,4,0]]){DK.heldDie=face;DKplace(spot);const t=DK.towers.find(t=>t.spot===spot);t.pips=pips;t.abilityT=abilityT;}
      DK.inf.deckPower[6]=4;DK.inf.deckPower[14]=2;
      DK.inf.supporterCooldown=12.5;DK.inf.supporterUses=3;
      DKNET.done(204); DKNET.sum(DKMP.summary(false)); __mpRecovery.persistRun();
      return { id: DK.inf.runId, t0: DK.net.t0, pid: DK.net.pid, gold: DK.gold, size: DK.towers.length, powers:DK.inf.deckPower,
        towers:DK.towers.map(t=>[t.face,t.pips,t.abilityT]), classes:DK.inf.growthSnapshot.classes, critDamage:DK.inf.growthSnapshot.critDamage,
        tree:{version:DK.inf.growthSnapshot.treeVersion,mastery:DK.inf.growthSnapshot.mastery,talents:DK.inf.growthSnapshot.talents,awakenings:DK.inf.growthSnapshot.awakenings,supporter:DK.inf.growthSnapshot.supporter,cooldown:DK.inf.supporterCooldown,uses:DK.inf.supporterUses},
        frozen:['mastery','talents','awakenings'].every(key=>Object.isFrozen(DK.inf.growthSnapshot[key])) };
    });
    await a.waitForFunction(pid=>window.__receivedSummaries.some(m=>m.pid===pid&&m.ds===1&&m.tw?.length===3),before.pid);
    const relayed=await a.evaluate(pid=>window.__receivedSummaries.filter(m=>m.pid===pid&&m.tw?.length===3).at(-1),before.pid);
    assert.equal(relayed.ds,1);assert.deepEqual(relayed.tw,[[0,6,1,7],[1,14,1,3],[4,19,1,2]]);
    report.checks.push('real DKNET client serializer and server relay preserve ds:1 and four-field 7/3/2 pip tuples');
    await a.evaluate(()=>{DK.heldDie=14;if(!DKplace(0))throw Error('local awakened growth fixture rejected');DK.towers[0].pips=7;DK.towers[0].abilityT=0;});
    await a.evaluate(pid=>DKMP.view(pid),before.pid);
    await a.waitForFunction(()=>DKMP.viewState().towers.length===3&&DKMP.viewState().towers.some(t=>t.face===6&&t.pips===7));
    assert.deepEqual(await a.evaluate(()=>DKMP.viewState().towers.map(t=>[t.face,t.pips,t.deckSystem,t.def.name])),[[6,7,1,'축재 주사위'],[14,3,1,'새싹 주사위'],[19,2,1,'군집 주사위']]);
    assert.equal(before.tree.awakenings[6],false,'sender deliberately has no income awakening');
    assert.deepEqual(await a.evaluate(()=>{let result;__mpRecovery.withView(()=>{const t=DK.towers.find(t=>t.face===6);result={localResearch:DK.inf.growthSnapshot.awakenings[6],awake:__mpRecovery.towerAwakened(t),labels:__mpRecovery.badgeLabels(t)};});return result;}),{localResearch:true,awake:false,labels:['7눈금']},'real spectator draw never infers a remote awakening from the local account');
    report.checks.push('spectator with local income awakening renders an unresearched remote seven-pip income tower without a false awakening label or ring');
    assert.deepEqual(await a.evaluate(()=>{const t=DK.towers[0],gold=DK.gold,awake=__mpRecovery.towerAwakened(t);DKdeckTick(12);return{awake,income:DK.gold-gold,face:t.face,pips:t.pips};}),{awake:true,income:70,face:14,pips:7},'watching a remote board must not disable the local awakened growth income');
    report.checks.push('local seven-pip awakened growth continues its 12-second SP production while watching another player');
    await a.screenshot({path:path.join(out,'desktop-spectator-pips.png')});await a.evaluate(()=>DKMP.viewExit());
    report.checks.push('desktop spectator of portrait sender reconstructs new card names and pips rather than legacy star levels');
    await b.reload(); await b.waitForFunction(() => window.DK?.phase === 'title' && DKNET.inRoom(), null, { timeout: 120000 }); await b.click('#ov-btn');
    await b.waitForFunction(() => DK.phase === 'playing' && DK.towers.length === 3, null, { timeout: 20000 }); await b.evaluate(()=>{DK.paused=true;});
    const after = await b.evaluate(() => ({ id: DK.inf.runId, t0: DK.net.t0, pid: DK.net.pid, gold: DK.gold, size: DK.towers.length,
      done: DK.inf.doneW, status: DK.net.status, powers:DK.inf.deckPower,towers:DK.towers.map(t=>[t.face,t.pips,t.abilityT]),
      classes:DK.inf.growthSnapshot.classes,critDamage:DK.inf.growthSnapshot.critDamage, snapshot: DK.inf.growthSnapshot.deckSystem,
      tree:{version:DK.inf.growthSnapshot.treeVersion,mastery:DK.inf.growthSnapshot.mastery,talents:DK.inf.growthSnapshot.talents,awakenings:DK.inf.growthSnapshot.awakenings,supporter:DK.inf.growthSnapshot.supporter,cooldown:DK.inf.supporterCooldown,uses:DK.inf.supporterUses},
      frozen:['mastery','talents','awakenings'].every(key=>Object.isFrozen(DK.inf.growthSnapshot[key])) }));
    assert.deepEqual(after, { ...before, done: 204, status: 'alive', snapshot: 1 });
    assert.equal(after.frozen,true);assert.equal(after.tree.mastery[6],3);assert.equal(after.tree.talents[6],'insight');assert.equal(after.tree.awakenings[6],false);assert.equal(after.tree.awakenings[14],true);assert.equal(after.tree.supporter,'supply');
    assert.equal(await a.evaluate(pid => DKNET.members().find(p => p.pid === pid).status, before.pid), 'alive');
    report.checks.push('three actual clients; phone reload restores pips, five card powers, ability timers, frozen classes/critical and original room/run identity without death report');
    report.checks.push('phone reconnect retains frozen tree mastery/talents/awakening and the chosen supporter with 12.5 seconds cooldown and three uses, without granting another skill use');
    await b.screenshot({ path: path.join(out, 'phone-restored.png') });
    const nativeBefore = await c.evaluate(() => {
      DK.paused=true; DK.wave=203; DK.inf.doneW=DK.net.doneW=202; DK.autoT=500; DK.waveActive=false;
      DK.heldDie=14;DKplace(0);DK.towers[0].pips=4;DK.towers[0].abilityT=23.5;DK.inf.deckPower[14]=3;DKNET.done(202);
      DK.inf.supporterCooldown=21.25;DK.inf.supporterUses=2;__mpRecovery.persistRun();
      return { id:DK.inf.runId,pid:DK.net.pid,t0:DK.net.t0,pips:DK.towers[0].pips,abilityT:DK.towers[0].abilityT,power:DK.inf.deckPower[14],
        tree:{version:DK.inf.growthSnapshot.treeVersion,mastery:DK.inf.growthSnapshot.mastery,talents:DK.inf.growthSnapshot.talents,awakenings:DK.inf.growthSnapshot.awakenings,supporter:DK.inf.growthSnapshot.supporter,cooldown:DK.inf.supporterCooldown,uses:DK.inf.supporterUses} };
    });
    const storageState = await c.context().storageState(); await c.context().close();
    const restarted = await browser.newContext({ storageState, viewport:{width:1240,height:860} }); c=await restarted.newPage();
    c.on('pageerror', e=>errors.push(e.message));
    await c.addInitScript(()=>{window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'android'};});
    await c.goto(new URL('index.html?net='+encodeURIComponent(net),base).href);
    await c.waitForFunction(()=>window.DK?.phase==='title'&&DKNET.inRoom(),null,{timeout:120000});await c.click('#ov-btn');
    await c.waitForFunction(()=>DK.phase==='playing'&&DK.towers.length===1);
    await c.evaluate(()=>{DK.paused=true;});
    assert.deepEqual(await c.evaluate(()=>({id:DK.inf.runId,pid:DK.net.pid,t0:DK.net.t0,pips:DK.towers[0].pips,abilityT:DK.towers[0].abilityT,power:DK.inf.deckPower[14],
      tree:{version:DK.inf.growthSnapshot.treeVersion,mastery:DK.inf.growthSnapshot.mastery,talents:DK.inf.growthSnapshot.talents,awakenings:DK.inf.growthSnapshot.awakenings,supporter:DK.inf.growthSnapshot.supporter,cooldown:DK.inf.supporterCooldown,uses:DK.inf.supporterUses}})),nativeBefore);
    report.checks.push('native storage simulation: completely new browser context restores persistent room identity and board within grace period');
    report.checks.push('new native browser context also restores mastery/talent/awakening maps and crusher supporter with its partially elapsed cooldown and previous use count');
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
