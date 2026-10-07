(function () {
  'use strict';
  const $=s=>document.querySelector(s);
  const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.className='back-btn';b.textContent=text;b.onclick=fn;return b;};
  // Reuse the real controls, so opening a detail page never duplicates purchase/research handlers.
  function open(title,nodes) {
    nodes=nodes.filter(Boolean);if(!nodes.length)return;
    const parent=nodes[0].closest('.screen-box,.help-card,.rw-dialog')||document.body;
    const page=document.createElement('section');page.className='menu-subpage';page.setAttribute('aria-label',title);
    const head=document.createElement('header'),h=document.createElement('h3');h.textContent=title;
    const content=document.createElement('div');content.className='menu-page-content commerce-shop';
    const controls=document.createElement('nav');controls.className='page-controls';controls.setAttribute('aria-label',title+' 페이지');
    const origins=nodes.map(node=>{const marker=document.createComment('menu-page');node.before(marker);return marker;});
    const detailStates=nodes.filter(n=>n.matches('details')).map(n=>[n,n.open]);
    const opener=document.activeElement;
    const siblings=[...parent.children].filter(el=>!el.inert);siblings.forEach(el=>el.inert=true);
    const status=parent.querySelector('#commerce-status'),statusOrigin=status&&document.createComment('menu-status');if(status){status.before(statusOrigin);page.append(status);status.inert=false;}
    const close=()=>{nodes.forEach((node,i)=>{origins[i].replaceWith(node);node.removeAttribute('data-page-hidden');});detailStates.forEach(([node,opened])=>node.open=opened);if(status)statusOrigin.replaceWith(status);siblings.forEach(el=>el.inert=false);page.remove();opener?.focus({preventScroll:true});};
    head.append(button('← 뒤로',close),h);let index=0;
    const prev=button('이전',()=>{index--;paint();}),next=button('다음',()=>{index++;paint();}),count=document.createElement('span');
    const paged=nodes.some(node=>node.matches('.theme-guide-card'));
    const paint=()=>{nodes.forEach((node,i)=>node.toggleAttribute('data-page-hidden',paged&&i!==index));prev.disabled=index===0;next.disabled=index===nodes.length-1;count.textContent=`${index+1} / ${nodes.length}`;};
    for(const node of nodes){
      if(node.matches('p,li,.tier-pill,.rw-help')){
        const card=document.createElement('article');card.className='menu-reading-page';if(node.matches('.rw-help'))node.open=true;
        const figure=document.createElement('figure');figure.className='menu-topic-art';
        const text=node.textContent,icons=/우편/.test(title)?['ui/rewards/mail.webp']:/경험치|패스/.test(title+text)?['ui/rewards/growth-pass.webp','ui/rewards/growth-shards.webp']:/함께/.test(title)?['ui/icon-users.png','ui/icon-trophy.png']:/지역|캠페인/.test(title)?['ui/icon-stage.png','ui/icon-dice.png','ui/icon-gem.png']:['ui/icon-dice.png'];
        const mapIndex=/지역/.test(title)?nodes.indexOf(node)*10:/캠페인/.test(title)?Math.max(0,nodes.indexOf(node)-1)*10:-1;
        const map=mapIndex>=0?$('#stage-grid')?.children[mapIndex]?.querySelector('svg'):null;
        if(map)figure.append(map.cloneNode(true));else for(const src of icons){const img=document.createElement('img');img.src=src;img.alt='';figure.append(img);}card.append(figure,node);content.append(card);
      }else content.append(node);
    }
    const pages=[...content.children];
    const show=()=>{paint();pages.forEach((node,i)=>node.toggleAttribute('data-page-hidden',paged&&i!==index));};
    prev.onclick=()=>{index--;show();};next.onclick=()=>{index++;show();};
    controls.append(prev,count,next);controls.hidden=!paged||nodes.length<2;page.prepend(head,content,controls);parent.append(page);show();head.firstChild.focus({preventScroll:true});
    page.addEventListener('click',e=>{if(e.target.closest('#run-resume-play,#run-resume-end'))close();});
    page.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}});
  }
  function listPages(container,selector,size=1) {
    if(!container)return;
    const nav=document.createElement('nav');nav.className='page-controls';container.append(nav);
    let index=0,lastSize;
    const prev=button('이전',()=>{index--;paint();}),next=button('다음',()=>{index++;paint();}),count=document.createElement('span');nav.append(prev,count,next);
    function paint(){if(!container.contains(nav))container.append(nav);const items=[...container.querySelectorAll(selector)],n=typeof size==='function'?size():size,total=Math.max(1,Math.ceil(items.length/n));if(lastSize&&lastSize!==n)index=Math.floor(index*lastSize/n);lastSize=n;index=Math.min(index,total-1);items.forEach((node,i)=>node.toggleAttribute('data-page-hidden',Math.floor(i/n)!==index));prev.disabled=index===0;next.disabled=index===total-1;const label=`${index+1} / ${total}`;if(count.textContent!==label)count.textContent=label;nav.hidden=items.length<=n;
      if(container.id==='stage-grid')container.style.setProperty('--page-rows',Math.ceil(Math.min(n,items.length-index*n)/(matchMedia('(min-aspect-ratio:4/3) and (max-height:640px)').matches?5:3)));
      if(container.matches('#commerce-products,#cosmetic-products,#shop-towers,.shop-account-guide')){const visible=Math.max(1,Math.min(n,items.length-index*n));container.style.setProperty('--shop-page-size',visible);container.dataset.shopPageSize=String(visible);}
    }
    const observer=new MutationObserver(paint);observer.observe(container,{childList:true,subtree:true});const bounds=new ResizeObserver(paint);bounds.observe(container);window.addEventListener('resize',paint);paint();
    return ()=>{observer.disconnect();bounds.disconnect();window.removeEventListener('resize',paint);nav.remove();};
  }
  const shop=$('#shop .shop-body'),stored=document.createElement('div');stored.className='menu-source';
  stored.append(...shop.childNodes);shop.append(stored);shop.after($('#commerce-status'));
  const account=stored.querySelector('.shop-account'),policy=document.createElement('section');policy.className='shop-policy-page';
  [$('#commerce-availability'),...account.querySelectorAll('.commerce-policy:not(#commerce-account-id)'),...stored.querySelectorAll('#commerce-shop > .commerce-policy')].forEach(node=>{const card=document.createElement('article');card.className='shop-policy-card';const img=document.createElement('img');img.src='ui/icon-help.png';img.alt='';card.append(img,node);policy.append(card);});stored.append(policy);
  const storefront=document.createElement('section');storefront.className='shop-storefront';storefront.setAttribute('aria-label','성채 상점');
  const tabs=document.createElement('nav');tabs.className='shop-category-tabs';tabs.setAttribute('aria-label','상점 분류');
  const banner=stored.querySelector('.menu-shop-banner');banner.classList.add('shop-category-banner');
  const wallet=document.createElement('nav');wallet.className='menu-wallet';wallet.setAttribute('aria-label','보유 재화와 사용처');
  for(const [key,label,src] of [['gold','연구 골드','ui/gold.png'],['shards','성장 조각','ui/rewards/growth-shards.webp'],['gems','스테이지 젬','ui/icon-gem.png']]){
    const item=button('',()=>{if(key==='gems')select('stage');else{window.DKlobby();$('#lobby-box [data-menu-target="deck"]').click();window.DKDECKUI?.open('catalog');}});
    item.className='menu-currency';item.dataset.currency=key;item.innerHTML=`<img src="${src}" alt=""><span><small>${label}</small><b>0</b></span>`;wallet.append(item);
  }
  const views=document.createElement('div');views.className='shop-catalog-views';
  const categories=[['materials','연구 재료','ui/rewards/growth-shards.webp','원하는 타워의 능력을 높이세요','연구 골드는 전투에서, 성장 조각은 전투·출석으로 모을 수 있어요.'],['themes','성채 외형','casual/towers/skins/royal/t20.png','나의 성채를 고르는 즐거움','주사위 6종과 1~20강 타워의 모습이 함께 바뀝니다.'],['stage','스테이지','ui/icon-dice.png','캠페인에서 쓸 주사위','스테이지 전용 6종 주사위 · 투기장의 20강 등장과는 별개예요.'],['account','계정·저장','ui/icon-users.png','진행과 구매를 확인하기','저장 상태와 전투 기록 · 계정 연결과 구매 복원']];
  for(const [key,label,icon,title,detail] of categories){const tab=button(label,()=>select(key));tab.dataset.shopTab=key;tabs.append(tab);const view=document.createElement('section');view.className='shop-catalog-view';view.dataset.shopView=key;view.hidden=true;view.setAttribute('aria-label',label);views.append(view);}
  views.querySelector('[data-shop-view="materials"]').append($('#commerce-products'));
  const freeRoute=button('출석·패스 보상 보기',()=>window.DKREWARDSUI?.open('attendance'));freeRoute.className='shop-free-route';
  freeRoute.innerHTML='<img src="ui/rewards/attendance-chest.webp" alt=""><span><b>플레이로 모으는 연구 재료</b><small>출석과 성장 패스의 무료 보상을 확인하세요.</small></span><strong>보상 보기</strong>';
  views.querySelector('[data-shop-view="materials"]').append(freeRoute);
  views.querySelector('[data-shop-view="themes"]').append($('#cosmetic-products'));
  const stage=views.querySelector('[data-shop-view="stage"]'),stageTabs=document.createElement('nav');stageTabs.className='shop-stage-tabs';stageTabs.setAttribute('aria-label','스테이지 상품 분류');
  const stageSelect=kind=>{stage.dataset.stageKind=kind;stageTabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.stageTab===kind)));stage.querySelector('#shop-towers').hidden=kind!=='dice';stage.querySelector('#shop-skins').hidden=kind!=='skins';};
  for(const [key,label] of [['dice','주사위 해금'],['skins','타워 외형']]){const tab=button(label,()=>stageSelect(key));tab.dataset.stageTab=key;stageTabs.append(tab);}stage.append(stageTabs,$('#shop-towers'),$('#shop-skins'));stageSelect('dice');
  const accountPage=views.querySelector('[data-shop-view="account"]');accountPage.classList.add('shop-account-page');
  const accountHero=document.createElement('div');accountHero.className='shop-account-hero';accountHero.innerHTML='<img src="casual/towers/skins/royal/t12.png" loading="lazy" alt=""><div><small>진행 보관함</small><h3>나의 성채</h3></div>';accountHero.lastChild.append($('#commerce-account'),$('#commerce-account-id'));accountPage.append(accountHero,account.querySelector('.commerce-account-actions'),$('#commerce-google'));
  const accountState=document.createElement('p');accountState.className='shop-account-state';accountPage.append(accountState);
  const recordBoard=document.createElement('section');recordBoard.className='shop-account-records';recordBoard.innerHTML='<h3>내 최고 기록</h3><div></div>';accountPage.append(recordBoard);
  const accountGuide=document.createElement('div');accountGuide.className='shop-account-guide';accountGuide.innerHTML='<article><img src="ui/icon-dice.png" alt=""><div><b>게스트 진행</b><p>현재 기기에 무료 진행을 저장합니다.</p></div></article><article><img src="ui/icon-users.png" alt=""><div><b>계정 진행</b><p>연결 후 온라인으로 저장합니다. 게스트 진행과 자동 합산되지 않습니다.</p></div></article><article><img src="ui/icon-chest.png" alt=""><div><b>구매·잔액 확인</b><p>같은 계정의 구매와 잔액을 다시 확인합니다.</p></div></article>';accountPage.append(accountGuide);
  const utilities=document.createElement('footer');utilities.className='shop-utilities';const notice=document.createElement('span');notice.id='shop-sale-state';const policyButton=button('판매·개인정보 안내',()=>open('상점 이용 안내',[policy]));policyButton.dataset.shopPolicy='';utilities.append(notice,policyButton);
  storefront.append(wallet,tabs,banner,views,utilities);shop.append(storefront);
  function refreshWallet(){
    const p=window.DKCOMMERCE?.profile()||window.DKSAVE?.progression,values={gold:p?.collection?.gold||0,shards:p?.shards||0,gems:window.DKSAVE?.gems||0};
    for(const item of wallet.children){const amount=Number(values[item.dataset.currency]),exact=amount.toLocaleString('ko-KR');item.querySelector('b').textContent=amount.toLocaleString('ko-KR',amount>=10000?{notation:'compact',maximumFractionDigits:1}:undefined);item.title=item.querySelector('small').textContent+' '+exact;item.setAttribute('aria-label',item.title);}
    const state=window.DKCOMMERCE?.state();accountState.textContent=!state?.configured?'계정 연결은 준비 중입니다. 현재 기기의 진행은 계속 자동 저장됩니다.':state.ready?'계정 진행과 기기 진행은 별도로 보관됩니다.':'계정 연결 후 온라인으로 진행을 보관할 수 있습니다.';
    recordBoard.lastChild.innerHTML=[['clear','순수운빨'],['build','성장·조합'],['extreme','극한']].map(([key,label])=>`<article><small>${label}</small><b>${Number(p?.records?.[key]?.best)||0}<span>웨이브</span></b></article>`).join('');
  }
  function select(key){storefront.dataset.category=key;$('#shop .gem-chip').hidden=true;tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.shopTab===key)));views.querySelectorAll('[data-shop-view]').forEach(view=>view.hidden=view.dataset.shopView!==key);const entry=categories.find(c=>c[0]===key);banner.querySelector('img').src=entry[2];banner.querySelector('small').textContent=entry[1];banner.querySelector('h3').textContent=entry[3];banner.querySelector('p').textContent=entry[4];refreshWallet();}
  for(const event of ['commerce:change','rewards:change','rewards:updated'])window.addEventListener(event,refreshWallet);
  select('materials');window.DKrenderCommerce?.();
  listPages($('#stage-grid'),'.stage-cell',()=>matchMedia('(min-aspect-ratio:4/3) and (max-height:640px)').matches?5:9);
  const campaignLinks=document.createElement('div');campaignLinks.className='campaign-links';campaignLinks.append($('#stage-select .campaign-help'),$('#stage-select .menu-help'));$('#stage-grid').before(campaignLinks);
  // Long help lists become individual pages; the text is preserved rather than truncated.
  let disposeHelp;
  const single=$('#lobby-single'),links=document.createElement('div');links.className='menu-battle-links';
  const records=document.createElement('div');records.className='menu-source';records.append($('#lobby-inf'),$('#lobby-progress'));single.append(records);
  links.append($('#lobby-help'),$('#theme-guide'),button('내 기록',()=>open('내 전투 기록',[...records.children])));single.append(links);
  single.querySelector('.inf-btns').append($('#btn-stage-select'));
  const resume=$('#run-resume'),resumeSource=document.createElement('div');resumeSource.className='menu-source';resumeSource.append(resume);single.append(resumeSource);
  const resumeButton=button('저장한 전투',()=>open('저장한 전투',[resume]));resumeButton.id='run-resume-open';resumeButton.hidden=resume.classList.contains('hidden');links.prepend(resumeButton);
  new MutationObserver(()=>resumeButton.hidden=resume.classList.contains('hidden')).observe(resume,{attributes:true,attributeFilter:['class']});
  const room=$('#mp-room .screen-box'),roomSource=document.createElement('div');roomSource.className='menu-source';
  const chat=$('#mp-chat'),note=$('#mp-note');roomSource.append(note,chat);room.append(roomSource);
  const roomLinks=document.createElement('div');roomLinks.className='menu-battle-links';roomLinks.append(button('진행 규칙',()=>open('함께하기 규칙',[note])),button('채팅',()=>open('대기실 채팅',[chat])));room.append(roomLinks);
  listPages($('#mp-chat-lines'),'.mp-chat-line',1);

  document.addEventListener('click',e=>{
    const summary=e.target.closest('summary');if(!summary||!summary.closest('.screen')||summary.closest('.rw-help'))return;
    const details=summary.parentElement;
    e.preventDefault();
    const nodes=details.id==='theme-guide'?[...details.querySelectorAll('.theme-guide-card')]:[...details.children].filter(n=>n!==summary).flatMap(n=>n.matches('ol,ul,#tier-legend')?[...n.children]:[n]);
    open((summary.querySelector('strong')||summary).textContent.trim(),nodes);
  });
  window.DKMENUPAGES={open,listPages,refresh:refreshWallet,help:()=>{disposeHelp?.();const list=$('#inf-help .help-scroll ol');
    const images=[['ui/icon-chest.png','ui/icon-dice.png','ui/icon-wave.png'],['ui/icon-dice.png','ui/icon-enhance.png'],['ui/icon-dice.png','ui/icon-chest.png']];
    for(const li of list.children){if(li.matches('nav')||li.querySelector(':scope > .help-step-art'))continue;const figure=document.createElement('figure');figure.className='help-step-art';
      const label=li.querySelector('b')?.textContent||'',srcs=/보상 대기/.test(label)?['ui/rewards/attendance-chest.webp','ui/icon-dice.png']:/보상|성장/.test(label)?['ui/rewards/attendance-chest.webp','ui/rewards/growth-shards.webp']:/함께|협동|대전/.test(label)?['ui/icon-users.png','ui/icon-trophy.png']:/파워업|강화|합성|각성/.test(label)?['ui/icon-dice.png','ui/icon-enhance.png']:/판매|SP/.test(label)?['ui/icon-dice.png','ui/icon-sell.png']:/패배|라운드/.test(label)?['ui/icon-wave.png','ui/icon-trophy.png']:images[Math.min([...list.children].indexOf(li),2)];
      const captions=/시작/.test(label)?['1. 뽑기','2. 석단에 배치','3. 웨이브 시작']:/보상 대기/.test(label)?['상자를 터치','던지고 배치']:/강화/.test(label)?['타워 선택','확률강화 도전']:/판매/.test(label)?['타워 선택','판매하고 골드 회수']:/파워업/.test(label)?['종류 선택','같은 종류 전체 강화']:/패배/.test(label)?['필드에 적이 쌓임','목숨 감소']:/라운드/.test(label)?['정해진 시간마다','다음 웨이브 출현']:/협동|대전/.test(label)?['대전 · 상대에게 적 보내기','협동 · 공동 목숨 지키기']:/함께/.test(label)?['각자 보드에서 전투','완주·탈락 순위 경쟁']:/성장 보상/.test(label)?['전투에 참여','연구 재료 획득']:/합성/.test(label)?['같은 종류·같은 눈금','눈금 +1']:/서포터/.test(label)?['전투 전 1명 선택','능력 버튼으로 사용']:/각성/.test(label)?['각성 연구 완료','7눈금 능력 변경']:/5종/.test(label)?['5가지 종류 편성','각각 20% 소환']:/소환/.test(label)?['SP로 소환','빈 석단에 배치']:/모드/.test(label)?['순수운빨 · 101웨이브','성장·극한 · 20강 연계']:/조합/.test(label)?['역할을 연결','배치로 연계']:/클래스|트리/.test(label)?['계정에서 연구','전투 시작 때 적용']:['주사위 결과 확인','타워 배치'];
      for(const [i,src] of srcs.entries()){const step=document.createElement('div');step.className='help-visual-step';const img=document.createElement('img');img.src=src;img.alt='';const caption=document.createElement('b');caption.textContent=captions[i]||captions.at(-1);step.append(img,caption);figure.append(step);}const copy=document.createElement('div');copy.className='help-step-copy';copy.append(...li.childNodes);li.append(figure,copy);
    }
    disposeHelp=listPages(list,'li',1);
  }};
})();
