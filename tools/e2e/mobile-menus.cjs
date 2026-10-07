// Exercise the real menu cascade and navigation, including scrollable collections.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {launchBrowser,gameUrl,outputPath}=require('./browser.cjs');
(async()=>{const browser=await launchBrowser(),report=[];try{
 for(const [width,height] of [[390,844],[583,1280],[844,390],[320,740]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(gameUrl(false));await page.waitForFunction(()=>window.DK?.phase==='title',null,{timeout:120000});await page.click('#ov-btn');
  await page.click('#btn-shop');
  assert.equal(await page.locator('#shop .menu-currency').count(),3,'three actual currencies explain their use');
  for(const key of ['materials','themes','stage','account']){
   await page.click(`[data-shop-tab="${key}"]`);
   const area=await page.locator(`[data-shop-view="${key}"]`).evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,overflowX:el.scrollWidth-el.clientWidth};});
   assert.ok(area.w>0&&area.h>80&&area.x>=-1&&area.y>=-1&&area.right<=width+1&&area.bottom<=height+1&&area.overflowX<=2,`${width} ${key}: usable catalog stays in frame ${JSON.stringify(area)}`);
   if(key==='materials')assert.equal(await page.locator('#commerce-products .commerce-product').count(),3,'all real materials and pass are in one catalog');
   if(key==='themes')assert.equal(await page.locator('#cosmetic-products .cosmetic-product').count(),4,'all four actual themes are discoverable');
   if(key==='stage'){
    assert.equal(await page.locator('#shop-towers .shop-tower').count(),6,'all six campaign dice are discoverable');
    await page.locator('#shop-towers .shop-tower').nth(3).locator('button').click();
    assert.equal(await page.locator('[data-currency="gems"] b').innerText(),String(await page.evaluate(()=>DKSAVE.gems)),'actual stage purchase immediately updates the visible balance');
   }
   await page.screenshot({path:outputPath(`mobile-menus/${width}-shop-${key}.png`)});
  }
  await page.evaluate(()=>{window.__walletBefore={gold:DKSAVE.progression.collection.gold,shards:DKSAVE.progression.shards};DKSAVE.progression.collection.gold=1e9;DKSAVE.progression.shards=1e9;DKMENUPAGES.refresh();});
  for(const key of ['gold','shards']){
   const chip=page.locator(`[data-currency="${key}"]`);
   assert.equal(await chip.locator('b').innerText(),'10억','large valid balances use readable units');
   assert.match(await chip.getAttribute('aria-label'),/1,000,000,000/,'exact balance remains accessible');
   assert.ok(await chip.locator('b').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'large balance stays inside its chip');
  }
  await page.evaluate(()=>{Object.assign(DKSAVE.progression.collection,{gold:__walletBefore.gold});DKSAVE.progression.shards=__walletBefore.shards;DKMENUPAGES.refresh();});
  await page.locator('.menu-currency[data-currency="gold"]').click();
  assert.equal(await page.locator('[data-dice-view="catalog"]').isVisible(),true,'research currency opens the actual research menu');
  for(const key of ['overview','lineup','catalog','combos']){await page.click(`[data-dice-page="${key}"]`);await page.screenshot({path:outputPath(`mobile-menus/${width}-dice-${key}.png`)});}
  await page.click('[data-dice-page="overview"]');await page.click('[data-open-dice="support"]');
  assert.equal(await page.locator('.supporter-card').count(),3,'three free supporters are comparable');
  const overlap=await page.locator('.supporter-card').evaluateAll(nodes=>{const boxes=nodes.map(n=>n.getBoundingClientRect());return boxes.some((a,i)=>boxes.some((b,j)=>j>i&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1));});
  assert.equal(overlap,false,'supporter choices never overlap');
  await page.screenshot({path:outputPath(`mobile-menus/${width}-support.png`)});
  await page.locator('#lobby-box [data-menu-target="battle"]').click();await page.screenshot({path:outputPath(`mobile-menus/${width}-single.png`)});
  await page.click('#btn-stage-select');await page.screenshot({path:outputPath(`mobile-menus/${width}-campaign.png`)});
  await page.click('#ss-back');await page.click('#lobby-back');await page.click('#hub-multi');await page.screenshot({path:outputPath(`mobile-menus/${width}-multi.png`)});
  assert.deepEqual(errors,[],`${width}: no menu error`);report.push({width,height,pass:true});console.log('PASS mobile menus',width,height);await page.close();
 }
}finally{fs.writeFileSync(outputPath('mobile-menus/report.json'),JSON.stringify(report,null,2));await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
