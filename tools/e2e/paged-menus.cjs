const assert=require('node:assert/strict'),fs=require('node:fs');
const {launchBrowser,gameUrl}=require('./browser.cjs');
assert.ok(['localhost','127.0.0.1'].includes(new URL(gameUrl()).hostname));
(async()=>{const browser=await launchBrowser();try{
 for(const [width,height] of (process.argv.includes('--landscape')?[[824,384],[932,430]]:process.argv.includes('--remaining')?[[640,720],[702,896],[824,384],[932,430]]:[[320,740],[384,824],[500,900],[514,850],[540,780],[640,720],[702,896],[824,384],[932,430]])) {
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.goto(gameUrl());await page.waitForFunction(()=>window.DK?.phase==='title',null,{timeout:120000});await page.click('#ov-btn');
  const homeFrame=await page.locator('#lobby-box').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};});
  const fit=async(label,selector)=>{
   await page.evaluate(()=>document.fonts.ready);
   const issues=await page.locator(selector).evaluate((el,homeFrame)=>{
    const r=el.getBoundingClientRect(),issues=[];
    if(r.top<-2||r.left<-2||r.bottom>innerHeight+2||r.right>innerWidth+2)issues.push('window outside viewport');
    const frame=el.closest('.screen-box,.help-card,.rw-dialog');
    if(frame&&frame!==el){const q=frame.getBoundingClientRect();if(r.top<q.top-2||r.bottom>q.bottom+2||r.left<q.left-2||r.right>q.right+2)issues.push('page outside frame');}
    if(frame?.closest('.screen')){const q=frame.getBoundingClientRect();for(const key of ['left','top','width','height'])if(Math.abs(q[key]-homeFrame[key])>2)issues.push('main frame differs: '+key);}
    if(frame?.closest('#inf-help')){const q=frame.getBoundingClientRect();if(Math.abs(q.width-Math.min(innerWidth>innerHeight?720:500,innerWidth-24))>2||Math.abs(q.height-Math.min(850,innerHeight-24))>2)issues.push('tutorial is not a full frame');}
    if(el.scrollHeight>el.clientHeight+2||el.scrollWidth>el.clientWidth+2)issues.push(`overflow ${el.clientWidth}x${el.clientHeight}/${el.scrollWidth}x${el.scrollHeight}`);
    for(const c of el.querySelectorAll('.rw-body,.rw-panel,[data-dice-view],.menu-page-content,.help-scroll,ol,#stage-grid,.shop-body,.shop-catalog-view,.shop-policy-card,.shop-preview-page,.deck-tactics,.tactics-body,.tactic-chain,.dice-route,.current-deck,.deck-slot,.tree-node,.research-preview,.effect-card')) {
     if(c.getBoundingClientRect().height && (c.scrollHeight>c.clientHeight+2||c.scrollWidth>c.clientWidth+2))issues.push('nested overflow '+(c.id||c.className||c.tagName));
    }
    for(const card of el.querySelectorAll('.dice-route,.deck-tactics,.menu-route-grid > button,.menu-subpage > header,.menu-reading-page,.help-step-copy,.help-visual-step,.rw-empty,.theme-guide-card,.shop-policy-card,.commerce-product,.cosmetic-product,.supporter-card,.earn-detail')) {
     const box=card.getBoundingClientRect();if(!box.width||!box.height||!card.checkVisibility()||card.closest('details:not([open])')&&!card.closest('summary'))continue;
     const walker=document.createTreeWalker(card,NodeFilter.SHOW_TEXT);
     for(let node;node=walker.nextNode();) {
      if(!node.textContent.trim())continue;
      if(node.parentElement.closest('details:not([open])')&&!node.parentElement.closest('summary'))continue;
      const range=document.createRange();range.selectNodeContents(node);
      for(const q of range.getClientRects())if(q.width&&q.height&&(q.bottom>box.bottom+2||q.right>box.right+2||q.left<box.left-2||q.top<box.top-2))issues.push('text outside card: '+node.textContent.trim());
     }
    }
    for(const body of el.querySelectorAll('.menu-page-content,[data-dice-view],.help-scroll,.rw-panel,.shop-catalog-view')) {
     const box=body.getBoundingClientRect();if(!box.width||!box.height)continue;
     const children=[...body.children].filter(c=>c.getBoundingClientRect().height);
     if(!children.some(c=>c.textContent.trim()||c.matches('img,canvas,svg')||c.querySelector('img,canvas,svg')))issues.push('body has no visible content');
     for(const child of children){const q=child.getBoundingClientRect();if(q.top<box.top-2||q.left<box.left-2||q.bottom>box.bottom+2||q.right>box.right+2)issues.push('content outside body: '+(child.id||child.className||child.tagName));}
    }
    for(const b of el.querySelectorAll('button,input,select')) {const q=b.getBoundingClientRect();if(!q.width||!q.height)continue;if(q.bottom>r.bottom+2||q.right>r.right+2||q.left<r.left-2||q.top<r.top-2)issues.push('clipped '+b.textContent.trim());}
    for(const detail of el.querySelectorAll('.menu-reading-page > .rw-help'))if(detail.getBoundingClientRect().height&&!detail.open)issues.push('dedicated help body is collapsed');
    for(const cell of el.querySelectorAll('.stage-cell')) {
     if(!cell.getBoundingClientRect().height)continue;
     const n=Number(cell.querySelector('.stage-number')?.textContent),map=window.DKCONTENT.maps[n-1],svg=cell.querySelector('svg');
     if(svg?.querySelector('polyline')?.getAttribute('points')!==map.path.map(p=>p.join(',')).join(' '))issues.push('stage '+n+' preview path differs');
     if(svg?.querySelectorAll('circle').length!==map.spots.length+(map.spots2?.length||0)+map.portals.length+1)issues.push('stage '+n+' preview pads differ');
     const water=[...svg.querySelectorAll('rect')].slice(1).map(rect=>[Number(rect.getAttribute('y'))/64,Number(rect.getAttribute('x'))/64]);
     if(JSON.stringify(water)!==JSON.stringify(map.layout.water||[]))issues.push('stage '+n+' preview water differs');
    }
    return issues;
   },homeFrame);
   if(issues.length){fs.mkdirSync('gen/e2e/paged-menus',{recursive:true});await page.screenshot({path:`gen/e2e/paged-menus/${width}-failure.png`});}
   assert.deepEqual([...new Set(issues)],[],`${width} ${label}`);
  };
  const pages=async(label,selector,nextSelector,expected)=>{
   let count=0;
   for(;count<60;){await fit(label+' page '+(++count),selector);const next=page.locator(nextSelector).last();if(!await next.count()||!await next.isVisible()||await next.isDisabled())break;await next.click();}
   assert.ok(count<60,label+' pagination terminates');if(expected!==undefined)assert.equal(count,expected,label+' page count');
  };
  const closePage=()=>page.locator('.menu-subpage > header button').click();
  await page.click('#lobby-settings');await fit('settings','#settings .help-card');await page.click('#settings-close');
  await page.locator('[data-home-action="deck"]').click();
  for(const key of ['overview','lineup','catalog','combos']){await page.click(`[data-dice-page="${key}"]`);await fit(key,'#deck-panel');}
  await page.click('#combo-next');await fit('combo2','#deck-panel');await page.click('#combo-next');await fit('combo3','#deck-panel');assert.ok(await page.locator('#dice-apply-combo').isDisabled());
  await page.locator('#dice-combos [data-analyze]').click();
  for(const tab of ['placement','effects','basis']){await page.click(`[data-analysis-tab="${tab}"]`);await fit('analysis '+tab,'#deck-panel');if(tab==='effects')for(let i=1;i<5;i++){await page.click('#effect-next');await fit('effect '+i,'#deck-panel');}}
  await page.click('#dice-analysis .analysis-back');
  await page.click('[data-dice-page="catalog"]');
  for(const family of ['engineering','nature','magic','order','chaos']){
   await page.click(`[data-family="${family}"]`);await fit(family,'#deck-panel');
  }
  await page.locator('[data-card="19"]').click();
  for(const label of ['숙련·해금','특성','각성','성능·연계']){await page.getByRole('button',{name:label,exact:true}).click();await fit(label,'#deck-panel');}
  await page.click('[data-dice-page="catalog"]');await page.click('[data-family="engineering"]');await page.click('[data-card="1"]');
  for(const label of ['숙련·해금','특성','각성','성능·연계']){await page.getByRole('button',{name:label,exact:true}).click();await fit('starter '+label,'#deck-panel');}
  await page.click('[data-dice-page="overview"]');await page.click('[data-open-dice="support"]');await fit('support','#deck-panel');
  await page.click('[data-dice-page="overview"]');await page.click('[data-open-dice="earn"]');await pages('earn','#deck-panel','#earn-next',8);
  await page.locator('#lobby-box [data-menu-target="battle"]').click();await fit('battle','#lobby-box');
  await page.click('#lobby-help');const helpCount=await page.locator('#inf-help li').count();
  await pages('tutorial','#inf-help .help-card','#inf-help .page-controls button',helpCount);await page.click('#help-close');
  await page.click('#lobby-help');await fit('tutorial reopened','#inf-help .help-card');
  assert.equal(await page.locator('#inf-help li .help-step-art').count(),helpCount,'one illustration per tutorial page after reopening');
  assert.equal(await page.locator('#inf-help .page-controls').count(),1,'one tutorial pager after reopening');await page.click('#help-close');
  await page.click('#theme-guide summary');await pages('monster themes','.menu-subpage','.menu-subpage > .page-controls button',20);await closePage();
  await page.getByRole('button',{name:'내 기록',exact:true}).click();await pages('records','.menu-subpage','.menu-subpage > .page-controls button',2);await closePage();
  await page.evaluate(()=>{document.querySelector('#run-resume-title').textContent='순수운빨 · 웨이브 24';document.querySelector('#run-resume-note').textContent='저장한 전투를 이어하거나 종료하고 참여 보상을 받으세요.';document.querySelector('#run-resume').classList.remove('hidden');});
  await page.click('#run-resume-open');await fit('saved battle','.menu-subpage');await closePage();await page.evaluate(()=>document.querySelector('#run-resume').classList.add('hidden'));
  await page.click('#btn-stage-select');await pages('stages','#stage-select .screen-box','#stage-grid .page-controls button',Math.ceil(50/(width>height?5:9)));
  for(const [selector,label,count] of [['.campaign-help summary','campaign guide',6],['.menu-help summary','region guide',5]]){
   await page.locator('#stage-select '+selector).click();await pages(label,'.menu-subpage','.menu-subpage > .page-controls button',count);await closePage();
  }
  await page.locator('#stage-select [data-menu-target="shop"]').click();await fit('shop','#shop .screen-box');
  for(const [key,container] of [['materials','#commerce-products'],['themes','#cosmetic-products'],['account',null]]){
   await page.click(`[data-shop-tab="${key}"]`);await pages('shop '+key,'#shop .screen-box',container?container+' .page-controls button':'.no-pagination');
  }
  await page.click('[data-shop-tab="stage"]');
  for(const [key,container] of [['dice','#shop-towers'],['skins','#shop-skins']]){
   await page.click(`[data-stage-tab="${key}"]`);
   const count=key==='skins'?6:Math.ceil(await page.locator(container+' .shop-tower').count()/await page.locator(container+' .shop-tower:visible').count());
   await pages('shop stage '+key,'#shop .screen-box',container+' .page-controls button',count);
  }
  await page.click('[data-shop-policy]');const policyCount=await page.locator('.menu-subpage .shop-policy-card').count();
  await pages('shop policy','.menu-subpage','.menu-subpage .shop-policy-page .page-controls button',policyCount);await closePage();
  await page.click('[data-shop-tab="themes"]');const themePrev=page.locator('#cosmetic-products .page-controls button').first();while(!await themePrev.isDisabled())await themePrev.click();
  while(!await page.locator('[data-preview="royal"]').isVisible()){const next=page.locator('#cosmetic-products .page-controls button').last();assert.ok(!await next.isDisabled(),'royal preview is reachable');await next.click();}
  await page.click('[data-preview="royal"]');await page.waitForSelector('.menu-subpage .shop-preview-page',{timeout:120000});
  assert.equal(await page.locator('.shop-preview-page canvas').count(),1,'one actual dice preview');
  assert.equal(await page.locator('#cosmetic-tower-preview figure').count(),20,'all tower previews');
  await pages('theme preview','.menu-subpage','#cosmetic-tower-preview .page-controls button',4);await closePage();

  await page.locator('#shop [data-menu-target="home"]').click();await page.click('#hub-multi');
  for(const mode of ['clear','extreme','duel','coop']){await page.selectOption('#mp-mode',mode);await fit('multiplayer '+mode,'#lobby-box');assert.ok((await page.locator('#mp-mode-info').innerText()).trim(),'multiplayer description visible');}
  await page.click('#lobby-back');
  await page.locator('[data-reward-tab="attendance"]').click();
  for(let i=0;i<7;i++){await fit('attendance'+i,'#rewards-dialog');if(i<6)await page.locator('.rw-panel > .page-controls button').last().click();}
  await page.click('#rewards-tab-pass');
  for(let i=0;i<20;i++){await fit('pass'+i,'#rewards-dialog');if(i<19)await page.locator('.rw-panel > .page-controls button').last().click();}
  await page.getByRole('button',{name:'패스 안내 · 구매 정보',exact:true}).click();await pages('pass information','.menu-subpage','.menu-subpage > .page-controls button',3);await closePage();
  await page.click('#rewards-tab-mail');await fit('guest mail','#rewards-dialog');assert.ok((await page.locator('#rewards-panel-mail .rw-empty').innerText()).trim(),'guest mail guidance is present');
  await page.click('#rewards-close');
  {
   await page.evaluate(()=>{document.querySelector('#lobby').classList.add('hidden');document.querySelector('#mp-room').classList.remove('hidden');document.querySelector('#mp-slots').innerHTML=Array.from({length:4},()=>'<div class="mp-slot">플레이어 준비 완료</div>').join('');document.querySelector('#mp-start').classList.remove('hidden');document.querySelector('#mp-chat-lines').innerHTML=Array.from({length:30},()=>'<div class="mp-chat-line">'+('긴 대화 내용 '.repeat(12))+'</div>').join('');});
   await fit('room','#mp-room .screen-box');
   for(const name of ['진행 규칙','채팅']){
    await page.getByRole('button',{name,exact:true}).click();await fit(name,'.menu-subpage');
    if(name==='진행 규칙'){assert.ok(await page.locator('#mp-note').isVisible(),'room rules visible');assert.match(await page.locator('#mp-note').innerText(),/101웨이브/);}
    await closePage();
   }
  }
  assert.deepEqual(errors,[]);console.log('PASS paged menus',width,height);await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
