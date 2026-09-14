const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser } = require('./browser.cjs');
const repo = path.resolve(__dirname, '../..'), out = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(repo, 'gen/e2e/run-resume'));
const url = new URL('index.html?net=off', process.env.E2E_BASE_URL || 'http://localhost:8137/').href;
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await launchBrowser(), report = { cases: [], pass: false };
  try {
    for (const schema of ['legacy', 'collection']) for (const [device, viewport] of [['desktop', { width: 1240, height: 860 }], ['phone', { width: 440, height: 956 }]]) {
      const name = schema + '-' + device, context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
      await page.route('**/game.js*', async route => {
        const r = await route.fetch(), s = await r.text();
        assert.ok(s.includes('window.DK = S;'), 'run-resume closure hook exists');
        const hook = 'window.__resumeQA={persistRun,readRunSave,restoreRunSave,spawnEnemy,buildInfinityWave,towerDmg,relayoutArena,update,laneLen}; window.DK = S;';
        await route.fulfill({ response: r, body: s.replace('window.DK = S;', hook) });
      });
      async function boot() {
        await page.goto(url); await page.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 });
        await page.click('#ov-btn'); await page.evaluate(() => DK.muted = true);
      }
      async function inspect() {
        return page.evaluate(() => {
          const S = DK, SLOT = DKSLOT;
          return { wave:S.wave,done:S.inf.doneW,kills:S.inf.kills,gold:S.gold,lives:S.lives,runId:S.inf.runId,
            snapshot:S.inf.growthSnapshot,queue:S.inf.queue,power:S.inf.power,deckPower:S.inf.deckPower,
            clocks:{waveT:S.waveT,autoT:S.autoT,time:S.time,bossT:S.inf.bossT},speed:S.speed,heldDie:S.heldDie,
            towers:S.towers.map(t=>({face:t.face,lvl:t.lvl,pips:t.pips,deckSystem:t.deckSystem,growthCarry:t.growthCarry,
              abilityT:t.abilityT,shotSerial:t.shotSerial,cd:t.cd,damage:__resumeQA.towerDmg(t),name:t.def.name,ability:t.def.ability})),
            enemies:S.enemies.map(e=>({hp:e.hp,max:e.max,slowT:e.slowT,poisonT:e.poisonT,poisonDps:e.poisonDps,fractureT:e.fractureT})),
            slot:{active:SLOT.active,final:SLOT.final,kind:SLOT.kind,phase:SLOT.phase,t:SLOT.t,t2:SLOT.t2,sndT:SLOT.sndT},
            refs:S.projs.every(q=>S.enemies.includes(q.tgt)&&S.towers.includes(q.src)),paused:S.paused,
            frozen:Object.isFrozen(S.inf.growthSnapshot)&&Object.isFrozen(S.inf.growthSnapshot.deck)&&Object.isFrozen(S.inf.growthSnapshot.levels)
              &&(!S.inf.growthSnapshot.classes||Object.isFrozen(S.inf.growthSnapshot.classes)) };
        });
      }
      async function geometry() {
        return page.evaluate(() => ({ mapKey:DK.mapKey,progress:DK.enemies.map(e=>e.dist/__resumeQA.laneLen(e)),
          finite:[...DK.towers,...DK.projs].every(x=>Number.isFinite(x.x)&&Number.isFinite(x.y)),
          definitions:DK.towers.every(t=>t.def.name===(DK.inf.growthSnapshot.deckSystem===1?DKDECKRULES.get(t.face).name:DKTD[t.face].name)) }));
      }
      try {
        await boot();
        const saved = await page.evaluate(schema => {
          const p = DKPROGRESSION.defaultProfile(), deck = schema === 'legacy' ? [1,2,3,4,6] : [1,6,11,14,20];
          if (schema === 'legacy') {
            // Explicit pre-collection frozen run; never attach legacy carry to a new snapshot.
            delete p.collection; p.levels[6] = 20; p.deck = deck;
            const oldSnapshot = DKPROGRESSION.snapshot(p, 'extreme');
            if ('deckSystem' in oldSnapshot || 'classes' in oldSnapshot) throw Error('legacy snapshot schema changed');
            DKSAVE.progression = DKPROGRESSION.sanitize(p);
            DKstartInf('extreme', null, { snapshot:oldSnapshot, ticket:null });
          } else {
            deck.forEach((id,i) => { p.levels[id]=1; Object.assign(p.collection.cards[id],{owned:true,class:DKDECKRULES.get(id).baseClass+i+1}); });
            if (!DKPROGRESSION.setPreset(p,0,deck).ok) throw Error('collection fixture deck invalid');
            DKSAVE.progression=p; DKstartInf('extreme');
            if (DK.inf.growthSnapshot.deckSystem!==1) throw Error('collection fixture uses old combat');
          }
          DK.paused=true; DK.gold=20000;
          (schema==='legacy'?[6]:deck).forEach((face,i) => {
            DK.heldDie=face; if (!DKplace(i)) throw Error('fixture placement failed');
            const t=DK.towers[i]; t.cd=.45+i*.15;
            if (schema==='legacy') { t.growthCarry=2.52; DK.inf.power[6]=7; }
            else {
              t.pips=[2,3,4,5,7][i]; t.abilityT=face===6?11.25:face===14?27.5:i+.125; t.shotSerial=7+i;
              for (let n=0;n<i;n++) if (!DKupgrade(face)) throw Error('fixture power upgrade failed');
            }
          });
          const frozen=JSON.stringify(DK.inf.growthSnapshot);
          if (schema==='collection') {
            for (const face of deck) DKSAVE.progression.collection.cards[face].class=20;
            DKPROGRESSION.setPreset(DKSAVE.progression,0,[1,2,3,4,5]);
          } else DKSAVE.progression.levels[6]=200;
          if (JSON.stringify(DK.inf.growthSnapshot)!==frozen) throw Error('profile changes rewrote frozen run');
          DK.wave=203; DK.inf.doneW=202; DK.inf.kills=12345; DK.waveActive=true;
          DK.waveT=12.25; DK.autoT=2.75; DK.time=43.125; DK.inf.bossT=77.5;
          __resumeQA.spawnEnemy(__resumeQA.buildInfinityWave(203)[0]);
          const e=DK.enemies[0],t=DK.towers[0]; e.dist=150; e.hp*=.6; e.slowT=.8;
          if (schema==='collection') { e.poisonT=2.25; e.poisonDps=17.5; e.fractureT=1.75; }
          DK.projs.push({kind:'dieBomb',x:t.x,y:t.y,tgt:e,src:t,spd:350,dmg:100,splash:50,trail:[],rot:.3,spin:.2});
          DK.inf.queue=[schema==='legacy'?'primal':'d20'];
          Object.assign(DKSLOT,{active:true,final:6,kind:schema==='legacy'?'d6':'d20',phase:0,t:.17,t2:.11,sndT:.03});
          if (!__resumeQA.persistRun()) throw Error('checkpoint not persisted');
          return __resumeQA.readRunSave(false);
        }, schema);
        assert.ok(saved && saved.enemies.length && saved.projs.length);
        const expected=await inspect(), initialGeometry=await geometry();
        assert.equal(saved.inf.growthSnapshot.deckSystem,schema==='collection'?1:undefined);
        assert.equal(expected.frozen,true);
        if (schema==='legacy') assert.equal(saved.towers[0].growthCarry,2.52);
        else {
          assert.deepEqual(saved.towers.map(t=>t.pips),[2,3,4,5,7]);
          assert.ok(saved.towers.every(t=>!('growthCarry' in t)), 'collection fixture has no legacy inherited multiplier');
          assert.deepEqual(Object.values(saved.inf.deckPower),[1,2,3,4,5]);
        }
        await page.click('#exit-btn'); await page.click('#menu-save');
        assert.ok(await page.locator('#run-resume').isVisible());
        await page.click('#btn-inf-build');
        assert.equal(await page.evaluate(()=>DK.phase),'lobby','new run cannot silently destroy saved run');
        await page.click('#btn-inf-clear');
        assert.equal(await page.evaluate(()=>DK.phase),'playing','pure mode remains available with unfinished growth run');
        assert.ok(await page.evaluate(()=>__resumeQA.readRunSave(false)));
        await boot(); await page.evaluate(()=>DKlobbyView('single'));
        await page.click('#run-resume-play'); await page.waitForFunction(()=>DK.phase==='playing');
        assert.deepEqual(await inspect(),expected,'logical combat state survives reload and UI resume');
        const restoredGeometry=await geometry();
        assert.ok(restoredGeometry.finite && restoredGeometry.definitions);
        restoredGeometry.progress.forEach((n,i)=>assert.ok(Math.abs(n-initialGeometry.progress[i])<1e-10,'path progress survives restore'));
        await page.setViewportSize({width:viewport.height,height:viewport.width});
        await page.waitForFunction(previous=>DK.mapKey!==previous,restoredGeometry.mapKey);
        assert.deepEqual(await inspect(),expected,'rotation preserves frozen classes/pips/powers/ability clocks and legacy growth');
        const rotated=await geometry();
        assert.ok(rotated.finite && rotated.definitions);
        rotated.progress.forEach((n,i)=>assert.ok(Math.abs(n-restoredGeometry.progress[i])<1e-10,'rotation preserves path progress'));
        const resaved=await page.evaluate(()=>{__resumeQA.persistRun();return __resumeQA.readRunSave(false);});
        assert.deepEqual(resaved.inf.growthSnapshot,saved.inf.growthSnapshot);
        assert.deepEqual(resaved.inf.deckPower,saved.inf.deckPower);
        assert.deepEqual(resaved.slot,saved.slot,'active roll clocks survive a second checkpoint');
        await page.screenshot({path:path.join(out,name+'.png')});
        await page.click('#menu-quit'); await page.waitForFunction(()=>DK.phase==='over');
        const settlement=await page.evaluate(()=>({saved:__resumeQA.readRunSave(false),shards:DKSAVE.progression.shards,count:DKSAVE.progression.records.extreme.runs.length}));
        assert.equal(settlement.saved,null); assert.equal(settlement.count,1); assert.ok(settlement.shards>0);
        await boot(); assert.equal(await page.evaluate(()=>DKSAVE.progression.shards),settlement.shards);
        const guards=await page.evaluate(saved=>{
          const text=JSON.stringify(saved),p=structuredClone(saved);p.projs[0].target=9999;
          const result=[DKRUNSAVE.decode(text,'another'),DKRUNSAVE.decode('{','guest'),DKRUNSAVE.decode(JSON.stringify({...saved,rules:'old'}),'guest'),DKRUNSAVE.decode(JSON.stringify(p),'guest')];
          if (saved.inf.growthSnapshot.deckSystem===1) {
            const badPips=structuredClone(saved);badPips.towers[0].pips=8;
            const badPower=structuredClone(saved);badPower.inf.deckPower[1]=6;
            const badClass=structuredClone(saved.inf.growthSnapshot);badClass.classes[1]=21;
            result.push(DKRUNSAVE.decode(JSON.stringify(badPips),'guest'),DKRUNSAVE.decode(JSON.stringify(badPower),'guest'),DKPROGRESSION.snapshotValid(badClass)?true:null);
          }
          return result;
        },saved);
        assert.deepEqual(guards,Array(schema==='collection'?7:4).fill(null));assert.deepEqual(errors,[]);
        report.cases.push({name,schema,pass:true,checks:['explicit version-specific frozen snapshot','profile changes do not alter active run','wave/status/HP/SP/queue/roll clocks restored','projectile references restored','rotation preserves logical state and path progress','second checkpoint preserves snapshot and roll','settlement removes checkpoint and pays once','owner/version/corruption guards',schema==='collection'?'classes/pips/card powers/abilities/cooldowns/shot counters/status timers retained':'old levels/powers/inherited growth and legacy definitions retained']});
        console.log('PASS',name);
      } catch(e) {await page.screenshot({path:path.join(out,name+'-failure.png')});throw e;}
      finally {await context.close();}
    }
    report.pass=true;
  } finally {fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
