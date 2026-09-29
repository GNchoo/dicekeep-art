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
    const opener=document.activeElement;
    const siblings=[...parent.children].filter(el=>!el.inert);siblings.forEach(el=>el.inert=true);
    const status=parent.querySelector('#commerce-status'),statusOrigin=status&&document.createComment('menu-status');if(status){status.before(statusOrigin);page.append(status);status.inert=false;}
    const close=()=>{nodes.forEach((node,i)=>{origins[i].replaceWith(node);node.removeAttribute('data-page-hidden');});if(status)statusOrigin.replaceWith(status);siblings.forEach(el=>el.inert=false);page.remove();opener?.focus({preventScroll:true});};
    head.append(button('← 뒤로',close),h);let index=0;
    const prev=button('이전',()=>{index--;paint();}),next=button('다음',()=>{index++;paint();}),count=document.createElement('span');
    const paint=()=>{nodes.forEach((node,i)=>node.toggleAttribute('data-page-hidden',i!==index));prev.disabled=index===0;next.disabled=index===nodes.length-1;count.textContent=`${index+1} / ${nodes.length}`;};
    content.append(...nodes);controls.append(prev,count,next);controls.hidden=nodes.length<2;page.prepend(head,content,controls);parent.append(page);paint();head.firstChild.focus({preventScroll:true});
    page.addEventListener('click',e=>{if(e.target.closest('#run-resume-play,#run-resume-end'))close();});
    page.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}});
  }
  function listPages(container,selector,size=1) {
    if(!container)return;
    const nav=document.createElement('nav');nav.className='page-controls';container.append(nav);
    let index=0;
    const prev=button('이전',()=>{index--;paint();}),next=button('다음',()=>{index++;paint();}),count=document.createElement('span');nav.append(prev,count,next);
    function paint(){if(!container.contains(nav))container.append(nav);const items=[...container.querySelectorAll(selector)],n=typeof size==='function'?size():size,total=Math.max(1,Math.ceil(items.length/n));index=Math.min(index,total-1);items.forEach((node,i)=>node.toggleAttribute('data-page-hidden',Math.floor(i/n)!==index));prev.disabled=index===0;next.disabled=index===total-1;const label=`${index+1} / ${total}`;if(count.textContent!==label)count.textContent=label;nav.hidden=items.length<=n;}
    const observer=new MutationObserver(paint);observer.observe(container,{childList:true,subtree:true});window.addEventListener('resize',paint);paint();
    return ()=>{observer.disconnect();window.removeEventListener('resize',paint);};
  }
  function routes(container,entries) {
    const hub=document.createElement('div');hub.className='menu-route-grid';
    entries.forEach(([label,detail,read])=>{const b=button('',()=>open(label,read()));const strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=label;small.textContent=detail;b.append(strong,small);hub.append(b);});container.append(hub);
  }
  const shop=$('#shop .shop-body'),stored=document.createElement('div');stored.className='menu-source';
  stored.append(...shop.childNodes);shop.append(stored);shop.after($('#commerce-status'));
  const accountInfo=document.createElement('div'),account=stored.querySelector('.shop-account');
  accountInfo.append($('#commerce-account'),$('#commerce-account-id'),account.querySelector('.commerce-account-actions'),$('#commerce-google'));account.prepend(accountInfo);
  routes(shop,[
    ['성장 재료','상품과 가격 확인',()=>[document.getElementById('commerce-products')]],
    ['테마 스킨','외형 미리보기 · 장착',()=>[document.getElementById('cosmetic-products')]],
    ['계정 관리','로그인 · 구매 복원',()=>[...stored.querySelector('.shop-account').children].filter(n=>n.tagName!=='SUMMARY')],
    ['스테이지 주사위','젬으로 확정 해금',()=>[$('#shop-towers')]],
    ['스테이지 스킨','눈별 외형 장착',()=>[$('#shop-skins')]],
    ['이용 안내','판매 상태 · 개인정보',()=>[stored.querySelector('#commerce-availability'),...stored.querySelectorAll('#commerce-shop > .commerce-policy')]]
  ]);
  listPages($('#commerce-products'),'.commerce-product',1);
  listPages($('#cosmetic-products'),'.cosmetic-product',1);
  listPages($('#shop-towers'),'.shop-tower',1);
  listPages($('#shop-skins'),'.skin-face',1);
  listPages($('#stage-grid'),'.stage-cell',()=>innerWidth>innerHeight?5:9);
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
    const summary=e.target.closest('summary');if(!summary||!summary.closest('.screen,.rw-dialog'))return;
    const details=summary.parentElement;
    e.preventDefault();
    const nodes=details.id==='theme-guide'?[...details.querySelectorAll('.theme-guide-card')]:[...details.children].filter(n=>n!==summary).flatMap(n=>n.matches('ol,ul,#tier-legend')?[...n.children]:[n]);
    open(summary.textContent.trim(),nodes);
  });
  window.DKMENUPAGES={open,listPages,help:()=>{disposeHelp?.();disposeHelp=listPages($('#inf-help .help-scroll ol'),'li',1);}};
})();
