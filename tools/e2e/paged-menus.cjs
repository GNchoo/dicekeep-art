const assert=require('node:assert/strict'),fs=require('node:fs');
const {launchBrowser,gameUrl}=require('./browser.cjs');
const shopOnly=process.argv.includes('--shop-only'),supportOnly=process.argv.includes('--support-only'),gradeOnly=process.argv.includes('--grade-only'),gradeNotes=process.argv.includes('--grade-notes'),shopFailures=[];
assert.ok(['localhost','127.0.0.1'].includes(new URL(gameUrl()).hostname));
(async()=>{const browser=await launchBrowser();try{
 for(const [width,height] of (process.argv.includes('--phone')?[[320,740],[384,824]]:process.argv.includes('--iab')?[[1280,720]]:process.argv.includes('--desktop')?[[1024,768],[1280,720],[1366,768],[1440,900],[1240,860],[1600,900],[1280,800],[1280,801],[1280,820],[700,640]]:gradeNotes?[[320,740],[640,720],[824,384],[932,430]]:gradeOnly&&process.argv.includes('--remaining')?[[640,720],[824,384],[932,430]]:process.argv.includes('--landscape')?[[824,384],[932,430]]:shopOnly?[[320,740],[384,824],[500,900],[514,850],[540,780],[640,720],[824,384],[932,430],[1240,860]]:(supportOnly||gradeOnly)?[[320,740],[384,824],[500,900],[514,850],[540,780],[640,720],[824,384],[932,430]]:process.argv.includes('--remaining')?[[640,720],[702,896],[824,384],[932,430]]:[[320,740],[384,824],[500,900],[514,850],[540,780],[640,720],[702,896],[824,384],[932,430],[1280,720]])) {
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.goto(gameUrl());await page.waitForFunction(()=>window.DK?.phase==='title',null,{timeout:120000});await page.click('#ov-btn');
  const homeFrame=await page.locator('#lobby-box').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};});
  const fit=async(label,selector)=>{
   await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
   const result=await page.locator(selector).evaluate((el,homeFrame)=>{
    const r=el.getBoundingClientRect(),issues=[],offscreenControls=[];
    const scrolls=node=>/^(auto|scroll)$/.test(getComputedStyle(node).overflowY);
    const scrollParent=node=>{for(let parent=node.parentElement;parent&&el.contains(parent);parent=parent.parentElement)if(scrolls(parent)&&parent.scrollHeight>parent.clientHeight+2)return parent;return null;};
    const overflow=node=>{const y=node.scrollHeight>node.clientHeight+2&&!scrolls(node),x=node.scrollWidth>node.clientWidth+2;return x||y;};
    if(r.top<-2||r.left<-2||r.bottom>innerHeight+2||r.right>innerWidth+2)issues.push('window outside viewport');
    const frame=el.closest('.screen-box,.help-card,.rw-dialog');
    if(frame&&frame!==el){const q=frame.getBoundingClientRect();if(r.top<q.top-2||r.bottom>q.bottom+2||r.left<q.left-2||r.right>q.right+2)issues.push('page outside frame');}
    if(frame?.closest('.screen')){const q=frame.getBoundingClientRect();for(const key of ['left','top','width','height'])if(Math.abs(q[key]-homeFrame[key])>2)issues.push('main frame differs: '+key);}
    if(frame?.closest('#inf-help')){const q=frame.getBoundingClientRect();const tutorialWidth=matchMedia('(min-aspect-ratio:4/3) and (max-height:640px)').matches?720:500;if(Math.abs(q.width-Math.min(tutorialWidth,innerWidth-24))>2||Math.abs(q.height-Math.min(850,innerHeight-24))>2)issues.push('tutorial is not a full frame');}
    if(overflow(el))issues.push(`overflow ${el.clientWidth}x${el.clientHeight}/${el.scrollWidth}x${el.scrollHeight}`);
    for(const c of el.querySelectorAll('.rw-body,.rw-panel,.rw-pass-list,[data-dice-view],.menu-page-content,.help-scroll,ol,#stage-grid,.shop-body,.shop-catalog-view,.shop-policy-card,.shop-preview-page,.deck-tactics,.tactics-body,.tactic-chain,.dice-route,.current-deck,.deck-slot,.tree-node,.research-preview,.effect-card,.grade-tower-preview,.grade-overview,.grade-next,.grade-partner')) {
     if(c.getBoundingClientRect().height && overflow(c))issues.push('nested overflow '+(c.id||c.className||c.tagName)+` ${c.clientWidth}x${c.clientHeight}/${c.scrollWidth}x${c.scrollHeight}`);
     if(c.checkVisibility()&&scrolls(c)&&!scrollParent(c)){const q=c.getBoundingClientRect();if(q.top<r.top-2||q.bottom>r.bottom+2||q.left<r.left-2||q.right>r.right+2||q.top<-2||q.bottom>innerHeight+2)issues.push('scroll container outside frame: '+(c.id||c.className||c.tagName));}
    }
    for(const card of el.querySelectorAll('.dice-route,.deck-tactics,.menu-route-grid > button,.menu-subpage > header,.menu-reading-page,.help-step-copy,.help-visual-step,.rw-empty,.rw-day,.rw-pass-tier,.rw-pass-reward,.rw-mail,.theme-guide-card,.shop-policy-card,.commerce-product,.cosmetic-product,.shop-tower,.skin-face,.shop-account-guide article,.shop-account-hero,.supporter-card,.earn-detail,.grade-tower-preview,.grade-next,.grade-partner')) {
     const box=card.getBoundingClientRect();if(!box.width||!box.height||!card.checkVisibility()||card.closest('details:not([open])')&&!card.closest('summary'))continue;
     const walker=document.createTreeWalker(card,NodeFilter.SHOW_TEXT);
     for(let node;node=walker.nextNode();) {
      if(!node.textContent.trim())continue;
      if(node.parentElement.closest('details:not([open])')&&!node.parentElement.closest('summary'))continue;
      const range=document.createRange();range.selectNodeContents(node);
      for(const q of range.getClientRects())if(q.width&&q.height&&(q.bottom>box.bottom+2||q.right>box.right+2||q.left<box.left-2||q.top<box.top-2))issues.push('text outside card: '+node.textContent.trim());
     }
    }
    for(const card of el.querySelectorAll('.commerce-product,.cosmetic-product,.shop-tower,.rw-day,.rw-pass-reward,.rw-mail,.shop-account-guide article,.shop-account-hero,.supporter-card,.grade-tower-preview,.grade-next,.grade-partner,.grade-tactics,.grade-combo-pair,.deck-metrics > div,.research-numbers > span,.tree-node')) {
     if(!card.checkVisibility())continue;
     const parts=[...card.querySelectorAll('h3,h4,b,strong,p,small,span,em,button,.supporter-heading,.supporter-ability,.supporter-example,.supporter-purpose,.supporter-choice')].filter(n=>getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility!=='hidden').map(node=>{
      const rects=[];
      if(node.matches('button'))rects.push(node.getBoundingClientRect());
      else {const text=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);for(let n;n=text.nextNode();){if(!n.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(n);rects.push(...range.getClientRects());}}
      return {node,rects:rects.filter(q=>q.width&&q.height)};
     });
     for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++) {
      const a=parts[i],b=parts[j];if(a.node.contains(b.node)||b.node.contains(a.node))continue;
      if(a.rects.some(p=>b.rects.some(q=>Math.min(p.right,q.right)-Math.max(p.left,q.left)>1&&Math.min(p.bottom,q.bottom)-Math.max(p.top,q.top)>1)))issues.push((card.matches('.supporter-card')?'supporter':card.closest('#deck-panel')?'grade':'shop')+' overlap: '+a.node.textContent.trim()+' / '+b.node.textContent.trim());
     }
    }
    for(const body of el.querySelectorAll('.menu-page-content,[data-dice-view],.help-scroll,.rw-panel,.shop-catalog-view')) {
     const box=body.getBoundingClientRect();if(!box.width||!box.height)continue;
     const children=[...body.children].filter(c=>c.getBoundingClientRect().height);
     if(!children.some(c=>c.textContent.trim()||c.matches('img,canvas,svg')||c.querySelector('img,canvas,svg')))issues.push('body has no visible content');
     for(const child of children){const q=child.getBoundingClientRect();if(q.left<box.left-2||q.right>box.right+2||!scrolls(body)&&!scrollParent(body)&&(q.top<box.top-2||q.bottom>box.bottom+2))issues.push('content outside body: '+(child.id||child.className||child.tagName));}
    }
    for(const [index,b] of [...el.querySelectorAll('button,input,select')].entries()) {
     const q=b.getBoundingClientRect();if(!q.width||!q.height||!b.checkVisibility())continue;
     const parent=scrollParent(b),box=parent?.getBoundingClientRect();
     if(q.right>r.right+2||q.left<r.left-2||!parent&&(q.bottom>r.bottom+2||q.top<r.top-2))issues.push('clipped '+b.textContent.trim());
     if(box&&(q.top<box.top||q.bottom>box.bottom))offscreenControls.push(index);
    }
    for(const detail of el.querySelectorAll('.menu-reading-page > .rw-help'))if(detail.getBoundingClientRect().height&&!detail.open)issues.push('dedicated help body is collapsed');
    const stageHeights=[];
    for(const cell of el.querySelectorAll('.stage-cell')) {
     if(!cell.getBoundingClientRect().height)continue;
     stageHeights.push(cell.getBoundingClientRect().height);
     const n=Number(cell.querySelector('.stage-number')?.textContent),map=window.DKCONTENT.maps[n-1],svg=cell.querySelector('svg');
     if(svg?.querySelector('polyline')?.getAttribute('points')!==map.path.map(p=>p.join(',')).join(' '))issues.push('stage '+n+' preview path differs');
     if(svg?.querySelectorAll('circle').length!==map.spots.length+(map.spots2?.length||0)+map.portals.length+1)issues.push('stage '+n+' preview pads differ');
     const water=[...svg.querySelectorAll('rect')].slice(1).map(rect=>[Number(rect.getAttribute('y'))/64,Number(rect.getAttribute('x'))/64]);
     if(JSON.stringify(water)!==JSON.stringify(map.layout.water||[]))issues.push('stage '+n+' preview water differs');
    }
    if(stageHeights.length&&Math.max(...stageHeights)-Math.min(...stageHeights)>2)issues.push('stage card heights differ');
    return {issues,offscreenControls};
   },homeFrame);
   const issues=result.issues,controls=page.locator(selector).locator('button,input,select');
   for(const index of result.offscreenControls){
    const control=controls.nth(index);await control.scrollIntoViewIfNeeded();
    const reachable=await control.evaluate(node=>{const r=node.getBoundingClientRect(),x=(r.left+r.right)/2,y=(r.top+r.bottom)/2,hit=document.elementFromPoint(x,y);return x>=0&&x<=innerWidth&&y>=0&&y<=innerHeight&&!!hit&&(hit===node||node.contains(hit)||(node.matches(':disabled')||node.closest('#mp-block.off'))&&getComputedStyle(node).pointerEvents==='none'&&hit===node.parentElement);});
    if(!reachable)issues.push('scroll control is covered or unreachable: '+await control.textContent());
   }
   if(issues.length){fs.mkdirSync('gen/e2e/paged-menus',{recursive:true});await page.screenshot({path:`gen/e2e/paged-menus/${width}-failure.png`});}
   const unique=[...new Set(issues)];if(shopOnly&&unique.length)shopFailures.push({width,height,label,issues:unique});else assert.deepEqual(unique,[],`${width} ${label}`);
  };
  const pages=async(label,selector,nextSelector,expected)=>{
   let count=0;
   for(;count<60;){await fit(label+' page '+(++count),selector);const next=page.locator(nextSelector).last();if(!await next.count()||!await next.isVisible()||await next.isDisabled())break;await next.click();}
   assert.ok(count<60,label+' pagination terminates');if(expected!==undefined)assert.equal(count,expected,label+' page count');
  };
  const closePage=()=>page.locator('.menu-subpage > header button').click();
  const shopCatalog=async()=>{
   for(const [key,container] of [['materials','#commerce-products'],['themes','#cosmetic-products'],['account','.shop-account-guide']]){
    await page.click(`[data-shop-tab="${key}"]`);await fit('shop '+key,'#shop .screen-box');
    assert.equal(await page.locator(container+' > .page-controls').count(),0,key+' uses one native catalog');
    if(key!=='account')assert.equal(await page.locator(container+' > article').count(),key==='materials'?3:4,'all '+key+' products are discoverable');
   }
  };
  if(shopOnly){
   await page.click('#btn-shop');await shopCatalog();
   if(width===320){
    await page.click('[data-shop-tab="themes"]');
    for(const viewport of [{width:824,height:384},{width,height}]){
     const theme=await page.locator('.cosmetic-product:visible').first().getAttribute('data-theme');
     await page.setViewportSize(viewport);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     assert.ok(await page.locator(`.cosmetic-product[data-theme="${theme}"]`).isVisible(),'resizing keeps the previously first visible product');
    }
   }
   assert.deepEqual(errors,[]);console.log(shopFailures.some(f=>f.width===width)?'FAIL shop menus':'PASS shop menus',width,height);await page.close();continue;
  }
  if(supportOnly){
   await page.locator('[data-home-action="deck"]').click();await page.click('[data-open-dice="support"]');
   await fit('support','#deck-panel');
   assert.equal(await page.locator('#tree-supporters .supporter-card:visible').count(),3,'all three supporters are comparable');
   const choice=page.locator('#tree-supporters .supporter-card').last(),supporter=await choice.getAttribute('data-supporter');
   await choice.click();
   await page.waitForFunction(id=>document.querySelector(`.supporter-card[data-supporter="${id}"]`)?.getAttribute('aria-pressed')==='true',supporter);
   await fit('support after selection','#deck-panel');
   assert.equal(await page.locator('#tree-supporters .supporter-card:visible').count(),3,'selection re-render keeps all supporters');
   assert.equal(await page.locator('#tree-supporters > .page-controls').count(),0,'selection re-render does not add a pager');
   assert.deepEqual(errors,[]);console.log('PASS supporter menus',width,height);await page.close();continue;
  }
  await page.click('#lobby-settings');await fit('settings','#settings .help-card');await page.click('#settings-close');
  await page.locator('[data-home-action="deck"]').click();
  if(gradeNotes){
   await page.click('[data-dice-page="lineup"]');await page.click('[data-grade-page="3"]');await page.click('[data-grade="20"]');await fit('grade20 basic range','#deck-panel');
   assert.match(await page.locator('.grade-tower-copy').innerText(),/기본 사거리/);
   await page.click('[data-research-grade="20"]');await page.click('[data-detail-tab="performance"]');await fit('research basic range','#deck-panel');
   assert.match(await page.locator('#deck-detail .research-numbers').innerText(),/기본 사거리/);
   await page.click('[data-dice-page="combos"]');await page.locator('#dice-combos [data-analyze]').click();
   for(const tab of ['effects','basis']){await page.click(`[data-analysis-tab="${tab}"]`);await fit('grade note '+tab,'#deck-panel');}
   assert.match(await page.locator('.grade-analysis-effects').innerText(),/피해·공격속도·둔화 추가 피해는 각각 가장 강한 효과/);
   assert.match(await page.locator('.analysis-basis').innerText(),/기본 사거리 \+160/);
   assert.deepEqual(errors,[]);console.log('PASS grade notes',width,height);await page.close();continue;
  }
  for(const key of ['overview','lineup','catalog','combos']){await page.click(`[data-dice-page="${key}"]`);await fit(key,'#deck-panel');}
  await page.click('[data-dice-page="lineup"]');
  for(let i=0;i<4;i++){
   await page.click(`[data-grade-page="${i}"]`);
   assert.deepEqual(await page.locator('#deck-selected [data-grade]').evaluateAll(nodes=>nodes.map(node=>+node.dataset.grade)),Array.from({length:5},(_,j)=>i*5+j+1));
   for(let j=0;j<5;j++){await page.click(`[data-grade="${i*5+j+1}"]`);await fit('grade '+(i*5+j+1),'#deck-panel');}
  }
  assert.equal(await page.locator('#deck-save,#deck-use,#deck-equip').count(),0,'no five-kind lineup actions');
  await page.click('[data-dice-page="combos"]');
  for(let i=0;i<5;i++){
   await fit('synergy '+(i+1),'#deck-panel');
   assert.equal(await page.locator('#dice-combos [data-combo-card]').count(),2,'two towers are a placement example');
   await page.locator('#dice-combos [data-analyze]').click();
   for(const tab of ['placement','effects','basis']){await page.click(`[data-analysis-tab="${tab}"]`);await fit('synergy '+(i+1)+' '+tab,'#deck-panel');}
   assert.equal(await page.locator('#dice-analysis .formation-grid > div').count(),15,'all fifteen actual arena pads shown');
   await page.click('#dice-analysis [data-open-dice="combos"]');
   if(i<4)await page.click('#combo-next');else assert.ok(await page.locator('#combo-next').isDisabled());
  }
  await page.click('[data-dice-page="catalog"]');
  for(const family of ['engineering','nature','magic','order','chaos']){
   await page.click(`[data-family="${family}"]`);await fit(family,'#deck-panel');
  }
  await page.locator('[data-card="19"]').click();
  for(const label of ['숙련·해금','특성','각성','성능·연계']){await page.getByRole('button',{name:label,exact:true}).click();await fit(label,'#deck-panel');}
  await page.click('[data-dice-page="catalog"]');await page.click('[data-family="engineering"]');await page.click('[data-card="1"]');
  for(const label of ['숙련·해금','특성','각성','성능·연계']){await page.getByRole('button',{name:label,exact:true}).click();await fit('starter '+label,'#deck-panel');}
  await page.click('[data-dice-page="lineup"]');await page.click('[data-grade-page="1"]');await page.click('[data-grade="7"]');await page.click('[data-research-grade="7"]');await page.click('[data-detail-tab="performance"]');
  await pages('grade7 all research partners','#deck-panel','#partner-next',4);
  await page.click('[data-dice-page="overview"]');await page.click('[data-open-dice="support"]');await fit('support','#deck-panel');assert.equal(await page.locator('#tree-supporters .supporter-card').count(),3,'all three supporters are present');
  await page.click('[data-dice-page="overview"]');await page.click('[data-open-dice="earn"]');await pages('earn','#deck-panel','#earn-next',8);
  if(gradeOnly){assert.deepEqual(errors,[]);console.log('PASS grade menus',width,height);await page.close();continue;}
  await page.locator('#lobby-box [data-menu-target="battle"]').click();await fit('battle','#lobby-box');
  await page.click('#lobby-help');const helpCount=await page.locator('#inf-help li').count();
  await pages('tutorial','#inf-help .help-card','#inf-help .page-controls button',helpCount);await page.click('#help-close');
  await page.click('#lobby-help');await fit('tutorial reopened','#inf-help .help-card');
  assert.equal(await page.locator('#inf-help li .help-step-art').count(),helpCount,'one illustration per tutorial page after reopening');
  const helpIllustrations=(await page.locator('#inf-help .help-step-art').allTextContents()).join(' ');assert.doesNotMatch(helpIllustrations,/5종 덱/);assert.match(helpIllustrations,/20강 연계/);
  assert.equal(await page.locator('#inf-help .page-controls').count(),1,'one tutorial pager after reopening');await page.click('#help-close');
  await page.click('#theme-guide summary');await pages('monster themes','.menu-subpage','.menu-subpage > .page-controls button',20);await closePage();
  await page.getByRole('button',{name:'내 기록',exact:true}).click();await fit('records','.menu-subpage');assert.equal(await page.locator('.menu-subpage #lobby-inf,.menu-subpage #lobby-progress').count(),2,'both record panels are present');await closePage();
  await page.evaluate(()=>{document.querySelector('#run-resume-title').textContent='순수운빨 · 웨이브 24';document.querySelector('#run-resume-note').textContent='저장한 전투를 이어하거나 종료하고 참여 보상을 받으세요.';document.querySelector('#run-resume').classList.remove('hidden');});
  await page.click('#run-resume-open');await fit('saved battle','.menu-subpage');await closePage();await page.evaluate(()=>document.querySelector('#run-resume').classList.add('hidden'));
  const stagePageSize=await page.evaluate(()=>matchMedia('(min-aspect-ratio:4/3) and (max-height:640px)').matches?5:9);
  await page.click('#btn-stage-select');await pages('stages','#stage-select .screen-box','#stage-grid .page-controls button',Math.ceil(50/stagePageSize));
  for(const [selector,label,count] of [['.campaign-help summary','campaign guide',6],['.menu-help summary','region guide',5]]){
   await page.locator('#stage-select '+selector).click();await fit(label,'.menu-subpage');assert.equal(await page.locator('.menu-subpage .menu-page-content > *').count(),count,label+' preserves all topics');await closePage();
  }
  await page.locator('#stage-select [data-menu-target="shop"]').click();await fit('shop','#shop .screen-box');
  await shopCatalog();
  await page.click('[data-shop-tab="stage"]');
  for(const [key,container] of [['dice','#shop-towers'],['skins','#shop-skins']]){
   await page.click(`[data-stage-tab="${key}"]`);
   await fit('shop stage '+key,'#shop .screen-box');
   assert.equal(await page.locator(container+(key==='skins'?' .skin-face':' .shop-tower')).count(),6,'all six stage '+key+' groups are present');
   assert.equal(await page.locator(container+' > .page-controls').count(),0,'stage '+key+' uses native scrolling');
  }
  await page.click('[data-shop-policy]');const policyCount=await page.locator('.menu-subpage .shop-policy-card').count();
  await fit('shop policy','.menu-subpage');assert.ok(policyCount>1,'all policy sections are present together');await closePage();
  await page.click('[data-shop-tab="themes"]');
  await page.click('[data-preview="royal"]');await page.waitForSelector('.menu-subpage .shop-preview-page',{timeout:120000});
  assert.equal(await page.locator('.shop-preview-page canvas').count(),1,'one actual dice preview');
  assert.equal(await page.locator('#cosmetic-tower-preview figure').count(),20,'all tower previews');
  await pages('theme preview','.menu-subpage','#cosmetic-tower-preview .page-controls button',4);await closePage();

  await page.locator('#shop [data-menu-target="home"]').click();await page.click('#hub-multi');
  for(const mode of ['clear','extreme','duel','coop']){await page.selectOption('#mp-mode',mode);await fit('multiplayer '+mode,'#lobby-box');assert.ok((await page.locator('#mp-mode-info').innerText()).trim(),'multiplayer description visible');}
  await page.click('#lobby-back');
  await page.locator('[data-reward-tab="attendance"]').click();
  await page.waitForSelector('#rewards-panel-attendance .rw-day');await fit('attendance','#rewards-dialog');assert.equal(await page.locator('#rewards-panel-attendance .rw-day').count(),7,'all seven attendance rewards are present');
  await page.click('#rewards-tab-pass');
  await fit('pass','#rewards-dialog');assert.equal(await page.locator('#rewards-panel-pass .rw-pass-tier').count(),20,'all twenty pass tiers are present');
  assert.equal(await page.locator('#rewards-panel-pass [data-claim-pass]').count(),40,'free and premium claims stay separate at every tier');
  await page.locator('#rewards-panel-pass .rw-pass-offer summary').click();await fit('pass information','#rewards-dialog');assert.match(await page.locator('#rewards-panel-pass .rw-pass-offer details').innerText(),/자동 갱신 없음/);
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
 assert.deepEqual(shopFailures,[],'shop product text and controls do not overlap');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
