const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), vm = require('node:vm');
const { launchBrowser } = require('./browser.cjs');
const root = path.resolve(__dirname, '../..'), out = path.resolve(process.env.E2E_OUTPUT_DIR || 'gen/e2e/campaign'); fs.mkdirSync(out, { recursive: true });
const sandbox = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, 'content.js'), 'utf8'), sandbox);
const C = sandbox.window.DKCONTENT, report = { structural: [], browser: [], combat: [], pass: false };
for (const sd of C.stages) {
  const m = C.maps.find(m => m.key === sd.mapKey), l = C.buildLayout(m, sd.tier);
  assert.equal(l.lanes.length, sd.lanes, 'lane count stage ' + sd.n);
  assert.ok(l.spots.length >= 7 && new Set(l.spots.map(p => p.join(','))).size === l.spots.length);
  for (const p of l.spots) {
    assert.ok(p[0] >= 0 && p[0] <= 1024 && p[1] >= 0 && p[1] <= 576);
    assert.ok(!m.layout.water.some(([r,c]) => Math.floor(p[0]/64) === c && Math.floor(p[1]/64) === r), 'water/spot overlap');
    assert.ok(l.lanes.filter(x => x.kind.startsWith('ground')).every(x => C.pathDist(...p,x.pts) >= 28), 'ground/spot overlap');
  }
  for (const cells of [m.layout.mainCells,m.layout.secCells].filter(Boolean)) {
    assert.deepEqual(Array.from(cells.at(-1)), Array.from(m.layout.endCell));
    for (let i = 1; i < cells.length; i++) assert.equal(Math.abs(cells[i][0]-cells[i-1][0])+Math.abs(cells[i][1]-cells[i-1][1]),1,'path connected');
  }
  for (const lane of l.lanes) { assert.ok(C.pathLength(lane.pts)>100); assert.deepEqual(Array.from(lane.pts.at(-1)),Array.from(m.layout.end)); }
  report.structural.push({ stage: sd.n, lanes: l.lanes.length, spots: l.spots.length });
}
(async () => {
  const browser = await launchBrowser(), errors = [];
  try {
    for (const [tag, viewport] of [['desktop',{width:1240,height:860}],['phone',{width:440,height:956}]]) {
      const context = await browser.newContext({ viewport }), page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.route('**/game.js*',async route => {const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('window.DK = S;','window.__campaign={startWave,update,onStageClear,buildWave,spawnEnemy,stageUnlocked,buyTower,TOWER_COST};\nwindow.DK = S;')});});
      await page.goto(new URL('index.html?net=off',process.env.E2E_BASE_URL||'http://localhost:8137/').href);
      await page.waitForFunction(()=>window.DK?.phase==='title',null,{timeout:120000}); await page.click('#ov-btn');
      const checks = await page.evaluate(() => {
        DK.muted=true;const q=__campaign, result=[];
        if (!q.stageUnlocked(1)||q.stageUnlocked(2)) throw Error('new save lock');
        const growth=JSON.stringify(DKSAVE.progression);
        for(let n=1;n<=50;n++) {
          if(!q.stageUnlocked(n)) throw Error('next locked '+n);
          DKstart(n); DK.paused=true;
          for(let w=1;w<=DK.stageWaves;w++) {
            DK.wave=w;const wave=q.buildWave(w);
            if(!wave.length||wave.some(x=>!Number.isFinite(x.hpMult)||x.hpMult<=0||!Number.isFinite(x.t)))throw Error('invalid wave '+n);
            if(w===DK.stageWaves&&!wave.some(x=>x.isBoss))throw Error('missing final boss '+n);
          }
          for(let i=0;i<DKLANES().length;i++) {
            DK.enemies=[];q.spawnEnemy({type:'slime',lane:i});const e=DK.enemies[0], old=DK.lives;
            e.dist=DKLANES()[i].len+1;q.update(1/60);
            if(DK.lives!==old-e.def.dmg||DK.enemies.includes(e))throw Error('goal leak '+n);
          }
          const before=DKSAVE.gems; q.onStageClear();const first=DKSAVE.gems-before;
          q.onStageClear();if(DKSAVE.gems-before!==first)throw Error('duplicate clear');
          if(first!==DKCONTENT.stages[n-1].gem)throw Error('first reward');
          DKstart(n); const again=DKSAVE.gems;q.onStageClear();if(DKSAVE.gems-again!==Math.max(2,Math.ceil(first/3)))throw Error('repeat reward');
          result.push({stage:n,first,repeat:DKSAVE.gems-again});
        }
        if(JSON.stringify(DKSAVE.progression)!==growth)throw Error('campaign changed account progression');
        return result;
      });
      assert.equal(checks.length,50); report.browser.push({ tag, checks });
      await page.reload();await page.waitForFunction(()=>window.DK?.phase==='title');assert.equal(await page.evaluate(()=>DKSAVE.cleared.length),50);
      await page.click('#ov-btn');await page.evaluate(()=>DKlobbyView('single'));await page.click('#btn-stage-select');
      await page.locator('.campaign-help summary').click();
      const bounds=await page.evaluate(()=>[...document.querySelectorAll('.stage-cell')].every(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth+1;}));assert.ok(bounds);
      await page.screenshot({path:path.join(out,tag+'-campaign.png'),fullPage:true});
      if(tag==='desktop' && !process.argv.includes('--skip-combat')) {
        const rows=await page.evaluate(full=>{
          const rows=[],q=__campaign;let seed=20260913;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
          // Actual combat with a simple bot. Rolls use the game's face/cost function
          // every two simulation seconds, without physical throwing animation.
          if (full) { DKSAVE.cleared=[]; DKSAVE.gems=40; DKSAVE.unlockedTowers=[1,2,3]; }
          for(const n of full ? Array.from({length:50},(_,i)=>i+1) : [1,10,11,20,21,30,31,40,41,50]) {
            DKlobby();
            if (full) { for(const f of [6,4,5]) if(!DKSAVE.unlockedTowers.includes(f)) { if(DKSAVE.gems>=q.TOWER_COST[f])q.buyTower(f,q.TOWER_COST[f]);else break; } }
            else DKSAVE.unlockedTowers=n<11?[1,2,3]:[1,2,3,4,5,6];
            DKstart(n);DK.paused=true;DK.muted=true;
            let ticks=0;for(;ticks<120000&&DK.phase==='playing';ticks++) {
              if(ticks%120===0) {
                if(!DK.heldDie)DKroll();
                if(DK.heldDie) {
                  const spots=DKspots(), empty=spots.findIndex((_,i)=>!DK.towers.some(t=>t.spot===i)),merge=DK.towers.find(t=>t.face===DK.heldDie&&t.lvl<3);
                  if(empty>=0)DKplace(empty);else if(merge)DKplace(merge.spot);else{DK.selTower=DK.towers.slice().sort((a,b)=>a.face-b.face||a.lvl-b.lvl)[0];document.getElementById('sell-btn').click();}
                }
              }
              if(DK.wave===0)q.startWave();q.update(1/60);
            }
            rows.push({stage:n,phase:DK.phase,wave:DK.wave,lives:DK.lives,seconds:ticks/60,unlocked:DKSAVE.unlockedTowers.slice()});
            if(full && DK.phase!=='stageClear')break;
          }
          return rows;
        },process.argv.includes('--full-combat'));report.combat=rows; console.log('combat',rows);
        if(process.argv.includes('--full-combat')) assert.ok(rows.length===50 && rows.every(r=>r.phase==='stageClear'),'new free save completes all 50 in order');
      }
      await context.close();
    }
    assert.deepEqual(errors,[]);report.pass=true;console.log('PASS 50 campaign maps; 100 browser stage/reward cases');
  } finally {fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
