const {launchBrowser,gameUrl}=require('./browser.cjs');
const fs=require('fs'),assert=require('assert/strict');
const out='gen/e2e/casual-menus';fs.mkdirSync(out,{recursive:true});
assert.ok(['localhost','127.0.0.1'].includes(new URL(gameUrl()).hostname),'Menu QA must use a local server');
(async()=>{const browser=await launchBrowser();try{
 for(const [name,width,height] of [['phone',390,844],['small',320,740],['desktop',1280,900]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');});
  await page.goto(gameUrl());await page.waitForFunction(()=>window.DK?.phase==='title',null,{timeout:120000});
  const shot=async(label,selector)=>{
   await page.screenshot({path:`${out}/${name}-${label}.png`});
   const box=await page.locator(selector).evaluate(el=>({sw:el.scrollWidth,cw:el.clientWidth}));
   assert.ok(box.sw<=box.cw+2,`${name} ${label} overflow ${JSON.stringify(box)}`);
  };
  await shot('title','#overlay-box'); await page.click('#ov-btn');await shot('home','#lobby-box');
  await page.click('#hub-single'); await shot('single','#lobby-box');
  await page.click('#btn-deck-open');await shot('deck','#deck-panel');
  assert.equal(await page.locator('#btn-inf-clear').isVisible(),false,'deck has its own uncluttered view');
  await page.click('#lobby-back');await page.click('#hub-multi');await shot('multi','#lobby-box');
  await page.click('#lobby-back');await page.click('#btn-shop');await shot('shop','.shop-body');
  await page.locator('#shop [data-menu-target="deck"]').click();
  assert.equal(await page.locator('#lobby-box').getAttribute('data-section'),'deck');
  await page.locator('#lobby-box [data-menu-target="shop"]').click();
  assert.equal(await page.evaluate(()=>DK.phase),'shop');
  await page.click('#shop-back');await page.click('#lobby-settings');await shot('settings','.settings-card');await page.click('#settings-close');
  await page.click('#hub-single');await page.click('#btn-stage-select');await shot('stages','#stage-grid');
  await page.click('#ss-back');
  await page.evaluate(()=>{DKstartInf('clear');DK.paused=true;DK.muted=true;DK.gold=99999;for(const i of [0,1,3]){DK.heldDie=1;DK.dieFocus=true;DKplace(i);}DKsync();});
  await page.screenshot({path:`${out}/${name}-combat.png`});
  assert.equal(await page.evaluate(()=>DK.towers.filter(t=>t.face===1&&t.skin===0).length),3);
  assert.deepEqual(errors,[]);console.log('PASS',name);await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
