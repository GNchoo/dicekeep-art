// Runtime still and animation smoke for the six-species v128 review page.
// Start the local server, then run: node tools/e2e/casual-enemies-page.cjs
const { launchBrowser, outputPath } = require('./browser.cjs');
const path = require('node:path');
const fs = require('node:fs');

const output = outputPath('casual-enemies-page');
fs.mkdirSync(output, { recursive: true });
const base = (process.env.E2E_BASE_URL || 'http://localhost:8137/').replace(/\/?$/, '/');

(async()=>{
  const browser=await launchBrowser();
  try{
    for(const [name,viewport] of [['desktop',{width:1200,height:900}],['phone',{width:390,height:844}]]){
      const page=await browser.newPage({viewport});
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
      await page.goto(new URL('docs/casual-enemies-v128.html', base).href);
      await page.waitForFunction(()=>document.querySelectorAll('.view canvas[width="180"]').length===18,null,{timeout:30000});
      const state=await page.evaluate(()=>({cards:document.querySelectorAll('.card').length,views:document.querySelectorAll('.view canvas[width="180"]').length,stages:document.querySelectorAll('.stage[width]').length,overflow:document.documentElement.scrollWidth-innerWidth,failures:[...document.querySelectorAll('.error')].map(e=>e.textContent),title:document.title}));
      for(let i=1;i<=6;i++){
        const card=page.locator(`.card:nth-child(${i})`), stage=card.locator('.stage'), toggle=card.locator('.motion-toggle');
        const still=await stage.evaluate(c=>c.toDataURL());
        await toggle.click();
        await page.waitForFunction(([index,before])=>document.querySelector(`.card:nth-child(${index}) .stage`).toDataURL()!==before,[i,still],{timeout:15000});
        const frameA=await stage.evaluate(c=>c.toDataURL());
        await page.waitForTimeout(280);
        const frameB=await stage.evaluate(c=>c.toDataURL());
        if(frameA===frameB)throw Error(`${name} card ${i} sheet animation did not advance`);
        await toggle.click();
        await page.waitForTimeout(40);
        const frozen=await stage.evaluate(c=>c.toDataURL());
        await page.waitForTimeout(180);
        if(frozen!==await stage.evaluate(c=>c.toDataURL()))throw Error(`${name} card ${i} animation did not pause`);
      }
      const skeleton=page.locator('.card:nth-child(2)');
      await skeleton.locator('.motion-toggle').click();
      await Promise.all([page.waitForResponse(r=>r.url().includes('w002-front-walk-4x2.webp')&&r.ok()),skeleton.locator('.directions button[data-view="front"]').click()]);
      await Promise.all([page.waitForResponse(r=>r.url().includes('w002-back-walk-4x2.webp')&&r.ok()),skeleton.locator('.directions button[data-view="back"]').click()]);
      await skeleton.locator('.motion-toggle').click();
      await page.locator('.card:nth-child(6) .directions button[data-view="back"]').click();
      await page.screenshot({path:path.join(output,`casual-enemies-${name}.png`),fullPage:true});
      for(let i=1;i<=6;i++)await page.locator(`.card:nth-child(${i}) .motion-toggle`).click();
      await page.waitForTimeout(300);
      await page.screenshot({path:path.join(output,`casual-enemies-${name}-moving.png`),fullPage:true});
      console.log(name,state,errors);
      if(state.cards!==6||state.views!==18||state.stages!==6||state.overflow>0||state.failures.length||errors.length)throw Error(`${name} page smoke failed`);
      await page.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
