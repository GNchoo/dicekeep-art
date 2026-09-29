const assert=require('node:assert/strict'),fs=require('node:fs');
const {launchBrowser,gameUrl}=require('./browser.cjs');
assert.ok(['localhost','127.0.0.1'].includes(new URL(gameUrl()).hostname));
(async()=>{const browser=await launchBrowser();try{
 for(const [width,height] of (process.argv.includes('--landscape')?[[824,384],[932,430]]:[[320,740],[384,824],[514,850],[702,896],[824,384],[932,430]])) {
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.goto(gameUrl());await page.waitForFunction(()=>window.DK?.phase==='title',null,{timeout:120000});await page.click('#ov-btn');
  const fit=async(label,selector)=>{
   await page.evaluate(()=>document.fonts.ready);
   const issues=await page.locator(selector).evaluate(el=>{
    const r=el.getBoundingClientRect(),issues=[];
    if(el.scrollHeight>el.clientHeight+2||el.scrollWidth>el.clientWidth+2)issues.push(`overflow ${el.clientWidth}x${el.clientHeight}/${el.scrollWidth}x${el.scrollHeight}`);
    for(const c of el.querySelectorAll('.rw-body,.rw-panel,[data-dice-view],.menu-page-content,.help-scroll,ol,#stage-grid,.shop-body')) {
     if(c.getBoundingClientRect().height && (c.scrollHeight>c.clientHeight+2||c.scrollWidth>c.clientWidth+2))issues.push('nested overflow '+(c.id||c.className||c.tagName));
    }
    for(const b of el.querySelectorAll('button,input,select')) {const q=b.getBoundingClientRect();if(!q.width||!q.height)continue;if(q.bottom>r.bottom+2||q.right>r.right+2||q.left<r.left-2||q.top<r.top-2)issues.push('clipped '+b.textContent.trim());}
    return issues;
   });
   if(issues.length){fs.mkdirSync('gen/e2e/paged-menus',{recursive:true});await page.screenshot({path:`gen/e2e/paged-menus/${width}-failure.png`});}
   assert.deepEqual(issues,[],`${width} ${label}`);
  };
  await page.locator('[data-home-action="deck"]').click();
  for(const key of ['overview','lineup','catalog','combos']){await page.click(`[data-dice-page="${key}"]`);await fit(key,'#deck-panel');}
  await page.click('#combo-next');await fit('combo2','#deck-panel');await page.click('#combo-next');await fit('combo3','#deck-panel');assert.ok(await page.locator('#dice-apply-combo').isDisabled());
  await page.click('[data-dice-page="catalog"]');
  for(const family of ['engineering','nature','magic','order','chaos']){
   await page.click(`[data-family="${family}"]`);await fit(family,'#deck-panel');
  }
  await page.locator('[data-card="19"]').click();
  for(const label of ['숙련·해금','특성','각성']){await page.getByRole('button',{name:label,exact:true}).click();await fit(label,'#deck-panel');}
  await page.click('[data-dice-page="overview"]');await page.click('[data-open-dice="support"]');await fit('support','#deck-panel');
  await page.click('[data-dice-page="overview"]');await page.click('[data-open-dice="earn"]');await fit('earn','#deck-panel');
  await page.locator('#lobby-box [data-menu-target="battle"]').click();await fit('battle','#lobby-box');
  await page.click('#lobby-help');await fit('tutorial','#inf-help .help-card');
  for(let i=1;i<await page.locator('#inf-help li').count();i++){await page.locator('#inf-help .page-controls button').last().click();await fit('tutorial page','#inf-help .help-card');}
  assert.ok(await page.locator('#inf-help .page-controls button').last().isDisabled());
  await page.click('#help-close');await page.click('#btn-stage-select');await fit('stages','#stage-select .screen-box');
  await page.locator('#stage-grid .page-controls button').last().click();await fit('stages2','#stage-select .screen-box');
  await page.locator('#stage-select [data-menu-target="shop"]').click();await fit('shop','#shop .screen-box');
  await page.getByRole('button',{name:'성장 재료 상품과 가격 확인'}).click();await fit('product','.menu-subpage');
  await page.locator('.menu-subpage > header button').click();
  if(width===320||width===824)for(const name of ['계정 관리 로그인 · 구매 복원','테마 스킨 외형 미리보기 · 장착','스테이지 주사위 젬으로 확정 해금','스테이지 스킨 눈별 외형 장착','이용 안내 판매 상태 · 개인정보']) {
   await page.getByRole('button',{name,exact:true}).click();
   for(let i=0;i<60;i++){await fit(name+i,'.menu-subpage');const next=page.locator('.menu-subpage .page-controls:visible button').last();if(!await next.count()||await next.isDisabled())break;await next.click();assert.ok(i<59,'pagination terminates');}
   await page.locator('.menu-subpage > header button').click();
  }

  await page.locator('#shop [data-menu-target="home"]').click();await page.click('#hub-multi');await fit('multi','#lobby-box');await page.click('#lobby-back');
  await page.locator('[data-reward-tab="attendance"]').click();
  for(let i=0;i<7;i++){await fit('attendance'+i,'#rewards-dialog');if(i<6)await page.locator('.rw-panel > .page-controls button').last().click();}
  await page.click('#rewards-tab-pass');
  for(let i=0;i<20;i++){await fit('pass'+i,'#rewards-dialog');if(i<19)await page.locator('.rw-panel > .page-controls button').last().click();}
  await page.click('#rewards-close');
  if(width===320||width===824){
   await page.evaluate(()=>{document.querySelector('#lobby').classList.add('hidden');document.querySelector('#mp-room').classList.remove('hidden');document.querySelector('#mp-slots').innerHTML=Array.from({length:4},()=>'<div class="mp-slot">플레이어 준비 완료</div>').join('');document.querySelector('#mp-start').classList.remove('hidden');document.querySelector('#mp-chat-lines').innerHTML=Array.from({length:30},()=>'<div class="mp-chat-line">'+('긴 대화 내용 '.repeat(12))+'</div>').join('');});
   await fit('room','#mp-room .screen-box');
   for(const name of ['진행 규칙','채팅']){await page.getByRole('button',{name,exact:true}).click();await fit(name,'.menu-subpage');await page.locator('.menu-subpage > header button').click();}
  }
  assert.deepEqual(errors,[]);console.log('PASS paged menus',width,height);await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
