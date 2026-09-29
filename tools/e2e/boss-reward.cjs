// Real pointer input, responsive rendering, and reward queue integration.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, gameUrl, outputPath } = require('./browser.cjs');
const out = outputPath('boss-reward'); fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await launchBrowser(), report = [];
  try {
    for (const viewport of [{width:932,height:430},{width:430,height:932}]) {
      const context = await browser.newContext({ viewport, hasTouch:true, deviceScaleFactor:1 });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => { localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1'); });
      await page.route('**/game.js*', async route => {
        const response = await route.fetch(), source = await response.text();
        assert.equal(source.split('window.DK = S;').length,2);
        await route.fulfill({response,body:source.replace('window.DK = S;',
          'window.__bossQA={buildInfinityWave,updateBossReward,reward:()=>BOSS_REWARD};window.DK = S;')
          .replace('    updateBossReward(dt);','    if(!window.__freezeBoss) updateBossReward(dt);')});
      });
      await page.goto(gameUrl());
      await page.waitForFunction(()=>window.DK?.phase==='title',null,{timeout:120000});
      for (const kind of ['d8','d12','d20']) {
        const initial = await page.evaluate(kind => {
          DKlobby(); DKstartInf('clear'); DK.muted=true; DK.speed=4;
          for (const [i,face] of [1,3,6,7,12,17,20].entries()) { DK.heldDie=face; DKplace(i); }
          DK.heldDie=4; DK.fxs=[]; DK.texts=[]; DK.spawnQ=[]; DK.waveActive=false;
          window.__freezeBoss=true; window.__bossDraws=0;
          DKCONTENT.INFINITY.chest.drawBoss=()=>{window.__bossDraws++;return kind;};
          DK.wave=10;
          const item=__bossQA.buildInfinityWave(10).find(x=>x.isBoss);
          if(!item)throw Error('boss wave missing');
          DKspawnEnemy(item); const e=DK.enemies.at(-1); DKdamage(e,e.hp*100+1e9);
          DKspawnEnemy(__bossQA.buildInfinityWave(1)[0]);
          const live=DK.enemies.at(-1);live.hp=live.maxHp=1e9;live.dist=400;
          DK.waveActive=true;DK.gold=100000;
          __bossQA.updateBossReward(0);
          return {queue:DK.inf.queue.slice(),time:DK.time,waveT:DK.waveT,dist:live.dist,draws:__bossDraws};
        },kind);
        assert.deepEqual(initial.queue,['boss']); assert.equal(initial.draws,0);
        await page.waitForTimeout(130);
        const live=await page.evaluate(()=>({time:DK.time,waveT:DK.waveT,dist:DK.enemies.at(-1).dist,inert:document.getElementById('wrap').inert}));
        assert.ok(live.time>initial.time&&live.waveT>initial.waveT&&live.dist>initial.dist,'unopened reward keeps combat, wave clock and monsters advancing');
        assert.equal(live.inert,false,'reward leaves combat controls interactive');
        const safe=await page.evaluate(()=>{const panel=document.querySelector('#boss-reward').getBoundingClientRect(),hud=document.querySelector('#hud').getBoundingClientRect();return {bottom:panel.bottom,hudTop:hud.top,inside:[...document.querySelectorAll('#boss-reward-title,#boss-reward-open,#boss-reward-message,#boss-reward-odds')].every(e=>{const r=e.getBoundingClientRect();return r.top>=panel.top&&r.bottom<=panel.bottom+1;})};});
        assert.ok(safe.inside&&safe.bottom<=safe.hudTop,'reward labels stay between the timer and bottom HUD');
        const button=page.locator('#boss-reward-open'); await button.tap();
        const target=await button.boundingBox(); await page.touchscreen.tap(target.x+target.width/2,target.y+target.height/2);
        const openingTime=await page.evaluate(()=>DK.time);
        await page.waitForTimeout(130);
        assert.ok(await page.evaluate(t=>DK.time>t,openingTime),'opening animation keeps combat running');
        const state=await page.evaluate(()=>{
          __bossQA.reward().t=1.25; __bossQA.updateBossReward(0);
          DKAPP.back();
          const ids=['boss-reward-title','boss-reward-open','boss-reward-message','boss-reward-odds'];
          return {queue:DK.inf.queue.slice(),draws:__bossDraws,held:DK.heldDie,paused:DK.paused,
            menu:!document.getElementById('menu').classList.contains('hidden'),
            boxes:ids.map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return{id,x:r.x,y:r.y,right:r.right,bottom:r.bottom,font:parseFloat(getComputedStyle(e).fontSize)};})};
        });
        assert.deepEqual(state.queue,[kind]); assert.equal(state.draws,1); assert.equal(state.held,4);
        assert.equal(state.paused,false); assert.equal(state.menu,false);
        for(const box of state.boxes){assert.ok(box.x>=0&&box.y>=0&&box.right<=viewport.width+1&&box.bottom<=viewport.height+1,JSON.stringify(box));}
        assert.ok(state.boxes.find(b=>b.id==='boss-reward-message').font>=18);
        await page.screenshot({path:path.join(out,`${viewport.width}-${kind}.png`)});
        await page.evaluate(()=>{__bossQA.reward().t=3.1;__bossQA.updateBossReward(0);window.__freezeBoss=false;});
        await page.waitForFunction(()=>document.getElementById('boss-reward').classList.contains('hidden'));
        assert.equal(await page.evaluate(()=>document.getElementById('wrap').inert),false);
        await page.click('#exit-btn');
        const menuTime=await page.evaluate(()=>DK.time);await page.waitForTimeout(130);
        assert.ok(await page.evaluate(t=>!DK.paused&&DK.time>t,menuTime),'menu never pauses combat');
        assert.equal(await page.locator('#menu-pause').count(),0);
        await page.click('#menu-resume');
        await page.evaluate(()=>{DK.heldDie=0;});
        await page.waitForFunction(kind=>DKSLOT.active&&DKSLOT.kind===kind&&DKSLOT.phase===-1,kind);
        report.push({viewport,kind,...state});
      }
      await page.click('#exit-btn');
      await page.evaluate(()=>DKend(false));
      assert.equal(await page.locator('#menu').isVisible(),false,'run ending closes the live menu');
      assert.deepEqual(errors,[]); await context.close();
    }
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
    console.log('PASS boss reward: 6 landscape/portrait reveals, real touch, duplicate taps, uninterrupted combat/menu, native back, layout and dice queue');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
