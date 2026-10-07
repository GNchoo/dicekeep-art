// Player-facing regressions: optional help, overlapping wave skips, readable phone controls and
// a visible focus marker on the tower selected through an actual pointer tap.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { launchBrowser, gameUrl, outputPath } = require('./browser.cjs');

(async () => {
  const browser = await launchBrowser(), results = [], errors = [];
  try {
    const page = await browser.newPage({viewport:{width:384,height:824}});
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/game.js*', async route => {
      const response = await route.fetch(), source = await response.text();
      await route.fulfill({ response, body: source.replace('window.DK = S;',
        'window.__controlsQA = { draw, ctx, fitStage, syncWaveBtn, towerSpr, openingCost:()=>S.mode === "infinity" ? chestCost() : ROLL_COST }; window.DK = S;') });
    });
    await page.goto(gameUrl());
    await page.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 });
    assert.deepEqual(await page.evaluate(() => ['dk_coachDone','dk_infHelpSeen'].map(k=>localStorage.getItem(k))),
      [null,null], 'first visit has no tutorial-completion bypass');
    const firstDraw = await page.evaluate(() => {
      DKstartInf('clear'); DK.paused=true; DK.muted=true;
      const chest=DKCONTENT.INFINITY.chest, draw=chest.draw;
      try { chest.draw=()=> 'd8'; DKchest(); }
      finally { chest.draw=draw; }
      return {kind:DKSLOT.kind,phase:DKSLOT.phase,held:DK.heldDie};
    });
    assert.deepEqual(firstDraw,{kind:'d8',phase:-1,held:0},'first relic draw waits for the player to throw');
    await page.waitForTimeout(650); // Older automatic coaching started after 500 ms.
    assert.equal(await page.locator('#coach').isVisible(),false,'a first relic draw never opens automatic coaching');
    assert.equal(await page.locator('#inf-help').isVisible(),false,'help never opens automatically on the first run');
    await page.click('#help-btn');
    assert.equal(await page.locator('#inf-help').isVisible(),true,'player can open tutorial from the HUD');
    while (!/8면체 이상.*직접 던/.test(await page.locator('#inf-help').innerText()) && !await page.locator('#inf-help .page-controls button').last().isDisabled()) await page.locator('#inf-help .page-controls button').last().click();
    assert.match(await page.locator('#inf-help').innerText(),/8면체 이상.*직접 던/,'optional tutorial explains manual rare throws on its own page');
    await page.click('#help-close');
    await page.click('#exit-btn');
    await page.click('#menu-help');
    assert.equal(await page.locator('#inf-help').isVisible(),true,'player can open tutorial from the menu');
    await page.click('#help-close');
    assert.equal(await page.locator('#inf-help').isVisible(),false,'tutorial closes without changing the draw');
    assert.deepEqual(await page.evaluate(()=>({kind:DKSLOT.kind,phase:DKSLOT.phase,held:DK.heldDie})),firstDraw,
      'viewing the tutorial leaves the waiting relic die intact');
    await page.evaluate(()=>DKlobby());
    await page.click('#hub-single');
    await page.click('#lobby-help');
    assert.equal(await page.locator('#inf-help').isVisible(),true,'tutorial is available before starting a game');
    assert.equal(await page.evaluate(()=>DK.phase),'lobby','viewing the tutorial does not start a run');
    await page.click('#help-close');
    console.log('PASS first visit: relic throw remains intact and tutorials open only by player choice');
    for(const mode of ['clear','build','extreme','stage']) {
      await page.evaluate(mode=>{
        if(mode==='stage') DKstart(1); else DKstartInf(mode);
        DK.paused=true; DK.muted=true; DKsync();
      },mode);
      assert.equal(await page.locator('#wave-btn').isVisible(),true,`${mode}: new run offers one start button`);
      assert.equal(await page.locator('#wave-btn').isEnabled(),true,`${mode}: first start is enabled`);
      const highlights=()=>page.evaluate(()=>['roll-btn','wave-btn'].map(id=>document.getElementById(id).classList.contains('opening-guide')));
      assert.deepEqual(await highlights(),[true,false],`${mode}: initial draw is highlighted`);
      await page.evaluate(()=>{DK.gold=__controlsQA.openingCost();DKsync();});
      assert.deepEqual(await highlights(),[true,false],`${mode}: exact price still highlights draw`);
      await page.evaluate(()=>{DK.gold--;DKsync();});
      assert.deepEqual(await highlights(),[false,true],`${mode}: insufficient draw funds highlights start`);
      await page.evaluate(()=>{DK.heldDie=1;DKsync();});
      assert.deepEqual(await highlights(),[false,false],`${mode}: placement comes before start guidance`);
      await page.evaluate(()=>{DK.heldDie=0;DKsync();});
      await page.click('#wave-btn');
      assert.deepEqual(await highlights(),[false,false],`${mode}: no guidance after wave begins`);
      await page.evaluate(()=>{DK.gold=10000;DKsync();});
      assert.deepEqual(await highlights(),[false,false],`${mode}: later income never restarts guidance`);
      assert.equal(await page.evaluate(()=>DK.wave),1,`${mode}: one click starts wave 1`);
      assert.equal(await page.locator('#wave-btn').isVisible(),true,`${mode}: the wave action remains available`);
      assert.equal(await page.locator('#wave-btn').textContent(),'웨이브 스킵',`${mode}: start changes to skip`);
      await page.waitForFunction(()=>!document.getElementById('wave-btn').disabled);
      const pending = await page.evaluate(()=>DK.spawnQ.length);
      await page.click('#wave-btn');
      assert.equal(await page.evaluate(()=>DK.wave),2,`${mode}: another click starts wave 2 immediately`);
      assert.ok(await page.evaluate(n=>DK.spawnQ.length>n,pending),`${mode}: the previous spawns remain queued`);
    }
    for (const [width, height] of [[360,800],[390,844],[430,932],[844,390],[1280,900]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(() => {
        DKstartInf('clear'); DK.paused = true; DK.muted = true; DK.gold = 99999;
        DK.towers = DKspots().map(([x,y],spot) => {
          const face = spot < 6 ? 1 : 7 + spot % 14;
          return {face,def:DKTD[face],lvl:1,spot,x,y,skin:0,cd:0};
        });
        DK.fxs=[]; DK.texts=[]; DK.enemies=[]; DKsync(); __controlsQA.fitStage();
      });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      const wave = await page.evaluate(() => {
        const samples = [];
        for (const [active, time, wave] of [[true,0,2],[true,79,2],[true,131,2],[true,139,2],[false,0,0],[false,0,2]]) {
          DK.waveActive=active; DK.waveT=time; DK.wave=wave; DK.autoT=5;
          __controlsQA.syncWaveBtn();
          const b=document.getElementById('wave-btn'), r=b.getBoundingClientRect();
          samples.push({label:b.textContent,x:r.x,y:r.y,w:r.width,h:r.height,
            visible:r.width>0&&r.height>0,disabled:b.disabled,first:wave===0&&!active});
        }
        return samples;
      });
      for (const item of wave) {
        assert.ok(!/\d/.test(item.label), `${width}: lower wave action has no duplicate timer`);
        assert.equal(item.visible,true,`${width}: start and skip use the same visible action`);
        assert.equal(item.disabled,false,`${width}: the wave action is enabled during combat and intermission`);
        assert.equal(item.label,item.first?'웨이브 시작':'웨이브 스킵',`${width}: the action describes the next wave`);
      }
      const position = await page.evaluate(() => {
        DK.wave=2; DK.waveActive=true; DK.waveT=25; DK.selTower=null; DKsync();
        const t=DK.towers[4], cv=document.getElementById('game'), r=cv.getBoundingClientRect();
        const sample = () => {
          const sp=__controlsQA.towerSpr(t.face,t.skin), g=__controlsQA.ctx;
          const pixels=g.getImageData(Math.floor(t.x-80),Math.floor(t.y-sp.h-25),160,sp.h+60).data;
          let n=0;
          // Include antialiased edge pixels when the canvas is upscaled on desktop.
          for(let i=0;i<pixels.length;i+=4) if(pixels[i+1]>190&&pixels[i+2]>210&&pixels[i+1]-pixels[i]>45&&pixels[i+2]-pixels[i]>50) n++;
          return n;
        };
        __controlsQA.draw(); window.__focusPixels=sample;
        return {x:r.x+t.x*r.width/cv.width,y:r.y+t.y*r.height/cv.height,before:sample(),pixelArea:(r.width/cv.width)**2};
      });
      await page.mouse.click(position.x,position.y);
      const measured = await page.evaluate(() => {
        __controlsQA.draw();
        const ids=['gold-val','lives-val','wave-val','roll-btn','wave-btn','inf-face-1','info-name','info-body','move-btn','sell-btn','enhance-btn','enhance-odds','info-close'];
        const nodes = ids.map(id => {
          const el=document.getElementById(id),r=el.getBoundingClientRect(),cs=getComputedStyle(el);
          return {id,font:parseFloat(cs.fontSize),x:r.x,y:r.y,w:r.width,h:r.height,visible:r.width>0&&r.height>0};
        });
        for(const selector of ['.inf-lv','.inf-cost']) {
          const el=document.querySelector(selector);nodes.push({id:selector,font:parseFloat(getComputedStyle(el).fontSize)});
        }
        return {selected:DK.selTower?.spot,focus:__focusPixels(),nodes,overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.equal(measured.selected,4,`${width}: tap selects the intended tower`);
      await page.screenshot({path:outputPath(`mobile-controls/${width}-selected.png`)});
      assert.ok((measured.focus-position.before)*position.pixelArea>100,
        `${width}: selected tower gains at least 100 CSS pixels of bright focus (${position.before} -> ${measured.focus})`);
      assert.equal(measured.overflow,false,`${width}: no horizontal page overflow`);
      const portrait=height>width;
      if(portrait) {
        const minFonts={'gold-val':15,'lives-val':15,'wave-val':13,'roll-btn':14,'wave-btn':14,'info-name':15,
          'info-body':13,'move-btn':14,'sell-btn':14,'enhance-btn':14,'enhance-odds':12,'.inf-lv':12,'.inf-cost':12};
        for(const [id,min] of Object.entries(minFonts)) {
          const el=measured.nodes.find(n=>n.id===id);
          assert.ok(el.font>=min,`${width}: ${id} ${el.font}px must be >=${min}px`);
        }
        for(const id of ['move-btn','sell-btn','enhance-btn','info-close']) {
          const r=measured.nodes.find(n=>n.id===id);
          assert.ok(r.w>=40&&r.h>=40,`${width}: ${id} touch target ${r.w}x${r.h}`);
          assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=width+.5&&r.y+r.h<=height+.5,`${width}: ${id} stays in view`);
        }
      }
      await page.click('#info-close');
      await page.screenshot({path:outputPath(`mobile-controls/${width}-hud.png`)});
      results.push({width,height,wave,measured});
      console.log(`PASS ${width}x${height}: wave start/skip, selection${portrait?', readable phone HUD':''}`);
    }
    assert.deepEqual(errors,[],'no page errors');
    fs.writeFileSync(outputPath('mobile-controls/report.json'),JSON.stringify(results,null,2));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
