// Real stylesheet order and isolated rewards; no account or purchase requests.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { launchBrowser } = require('./browser.cjs');
const base = new URL(process.env.E2E_BASE_URL || 'http://127.0.0.1:8137/');
assert.ok(['localhost', '127.0.0.1'].includes(base.hostname));
const out = path.resolve(process.env.E2E_OUTPUT_DIR || 'gen/e2e/mobile-rewards');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await launchBrowser();
  try {
    for (const [name, width, height] of [['phone',390,844],['small',320,640],['tablet',640,720],['landscape',844,390]]) {
      const page = await browser.newPage({ viewport:{width,height} });
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== base.origin) return route.abort();
        if (url.pathname === '/__mobile_rewards__') return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/rewards.css"><link rel="stylesheet" href="/menus.css"><link rel="stylesheet" href="/casual-theme.css"><link rel="stylesheet" href="/casual-rewards.css"><link rel="stylesheet" href="/menu-pages.css"></head><body><button id="btn-rewards-open">출석</button><script src="/rewards-ui.js"></script></body></html>`});
        return route.continue();
      });
      await page.goto(new URL('__mobile_rewards__',base).href);
      await page.evaluate(async () => {
        const view = {account:{linked:false},attendance:{nextDay:4,claimedToday:false,xp:20,rewards:[[100,3],[120,3],[140,4],[160,4],[180,5],[200,5],[300,10]].map(([gold,shards])=>({gold,shards}))},pass:{xp:388,premiumOwned:false,purchaseEnabled:false,tiers:Array.from({length:20},(_,i)=>({tier:i+1,requiredXp:(i+1)*100,free:{gold:100,shards:2,claimed:i===0},premium:{shards:10,claimed:false,...(i===9?{skinId:'royal'}:{})}}))},mail:[]};
        window.__rewardsFixture=view;
        window.__rewardsCommerce={configured:false,config:null};
        window.DKCOMMERCE={state:()=>__rewardsCommerce};
        DKREWARDSUI.configure({view,api:{current:()=>view,list:async()=>view,claimPass:async(tier,track)=>{view.pass.tiers[tier-1][track].claimed=true;}}});
        await DKREWARDSUI.open('pass',{view});
      });
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForFunction(()=>document.querySelector('.rw-pass-tier')?.getBoundingClientRect().width>0);
      const visibleRows = await page.locator('.rw-pass-tier').evaluateAll(rows=>{
        const area=document.querySelector('.rw-pass-list').getBoundingClientRect();
        return rows.filter(row=>{const r=row.getBoundingClientRect();return r.width&&r.top>=area.top-1&&r.bottom<=area.bottom+1;}).length;
      });
      await page.screenshot({path:path.join(out,name+'-pass.png')});
      assert.ok(visibleRows >= (name==='phone'?3:name==='small'?2:1),`${name}: several pass tiers are visible, found ${visibleRows}`);
      assert.equal(await page.locator('.rw-pass-tier').count(),20);
      assert.ok(await page.locator('[data-tier="2"]').evaluate(row=>{const r=row.getBoundingClientRect(),a=document.querySelector('.rw-pass-list').getBoundingClientRect();return r.top>=a.top-1&&r.bottom<=a.bottom+1;}),name+': first unclaimed earned stage is in the track');
      assert.match(await page.locator('.rw-next-tier').innerText(),/4단계.*12 XP/);
      assert.ok(await page.locator('#rewards-buy-pass').isDisabled());
      assert.equal(await page.locator('#rewards-buy-pass').innerText(),'프리미엄 판매 준비 중');
      await page.evaluate(()=>{__rewardsCommerce.configured=true;__rewardsCommerce.config={purchasesEnabled:true};DKREWARDSUI.render();});
      assert.equal(await page.locator('#rewards-buy-pass').innerText(),'로그인 후 구매 가능');
      assert.ok(await page.locator('#rewards-buy-pass').isDisabled());
      await page.evaluate(()=>{__rewardsCommerce.config.purchasesEnabled=false;DKREWARDSUI.render();});
      assert.equal(await page.locator('#rewards-buy-pass').innerText(),'프리미엄 판매 준비 중');
      await page.evaluate(()=>{__rewardsFixture.account.linked=true;__rewardsFixture.pass.purchaseEnabled=true;DKREWARDSUI.render();});
      assert.ok(await page.locator('#rewards-buy-pass').isDisabled(),name+': unavailable commerce overrides a stale enabled purchase view');
      await page.evaluate(()=>{__rewardsFixture.account.linked=false;__rewardsFixture.pass.purchaseEnabled=false;DKREWARDSUI.render();});
      assert.ok(await page.locator('[data-claim-pass="2:free"]').isEnabled());
      assert.ok(await page.locator('[data-claim-pass="2:premium"]').isDisabled());
      assert.match(await page.locator('[data-tier="2"] .rw-rewards').first().innerText(),/연구 골드 100.*성장 조각 2/s);
      await page.locator('.rw-pass-offer summary').click();
      assert.ok(await page.locator('#rewards-panel-pass').evaluate(panel=>panel.scrollHeight<=panel.clientHeight+1||['auto','scroll'].includes(getComputedStyle(panel).overflowY)),name+': expanded pass instructions have a scrollable viewport');
      await page.locator('.rw-pass-guidance summary').scrollIntoViewIfNeeded();
      assert.ok(await page.locator('.rw-pass-guidance summary').evaluate(summary=>{const r=summary.getBoundingClientRect(),d=document.querySelector('#rewards-dialog').getBoundingClientRect();return r.top>=d.top&&r.bottom<=d.bottom;}),name+': bottom XP instructions stay reachable');
      await page.locator('.rw-pass-offer summary').click();
      await page.screenshot({path:path.join(out,name+'-pass.png')});
      await page.click('[data-claim-pass="2:free"]');
      await page.waitForFunction(()=>document.querySelector('[data-claim-pass="2:free"]')?.textContent==='수령 완료');
      await page.click('#rewards-tab-attendance');
      assert.equal(await page.locator('.rw-day:visible').count(),7,name+': full attendance cycle is shown');
      assert.equal(await page.locator('.rw-day-done').count(),3);
      assert.ok(await page.locator('#rewards-attendance-claim').isEnabled());
      assert.ok(await page.locator('#rewards-attendance-claim').evaluate(button=>{const r=button.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.height>=44;}),name+': attendance action is inside the viewport with a touch target');
      assert.match(await page.locator('.rw-current-gift').innerText(),/160.*4/s);
      await page.screenshot({path:path.join(out,name+'-attendance.png')});
      await page.click('#rewards-tab-mail');
      assert.match(await page.locator('.rw-empty').innerText(),/로그인 후/);
      for(const selector of ['#rewards-dialog','.rw-body','.rw-panel']) assert.ok(await page.locator(selector).evaluate(node=>node.scrollWidth<=node.clientWidth+1),name+': no horizontal overflow '+selector);
      await page.close();
      console.log('PASS mobile rewards',name);
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
