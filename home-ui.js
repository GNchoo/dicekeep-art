(function(){
  'use strict';
  const R=window.DKREWARDS,N=window.DKREWARDNOTIFICATIONS,C=window.DKCOMMERCE,$=id=>document.getElementById(id);
  let hooks=null,ready=false,view=null,error='',timer=null,pending=null,dirty=true,lastCheck=-Infinity;
  let identity=C.linked()?C.state().accountId:'guest';const shown=new Set();
  const owner=()=>C.linked()?C.state().accountId:'guest';
  const now=()=>performance.now();
  const safe=()=>ready&&hooks?.canRefresh()&&!document.hidden;
  const put=(id,value)=>{const n=$(id);if(n)n.textContent=value;};
  const popupKey=()=>view?.attendance?.dayKey?owner()+'|'+view.attendance.dayKey:null;
  function render(){
    if(!hooks)return;
    const m=hooks.model(),p=m.profile;
    put('home-name',m.name||'성채 수호자');put('home-account',m.linked?'연결된 계정 · 온라인 저장':'게스트 · 이 기기에 저장');
    put('home-gold',p.collection.gold.toLocaleString());put('home-shards',p.shards.toLocaleString());put('lobby-gems',m.gems.toLocaleString());
    put('home-record',p.records.clear.best?'순수운빨 최고 '+p.records.clear.best+' 웨이브':'첫 전투에 도전하세요');
    const deck=$('home-deck'),key=p.deck.join(',')+'|'+p.deck.map(f=>p.tree.mastery[f]).join(',')+'|'+m.theme;
    if(deck&&deck.dataset.key!==key){
      deck.dataset.key=key;deck.replaceChildren();
      for(const face of p.deck){
        const b=document.createElement('button'),img=document.createElement('img'),label=document.createElement('b'),level=document.createElement('small');
        const name=window.DKDECKRULES.get(face).name.replace(' 주사위','');
        b.className='home-deck-card';b.type='button';b.dataset.face=face;b.setAttribute('aria-label',name+' · 덱 편성');
        img.src=hooks.icon(face);img.alt=name+' 타워';img.width=img.height=96;
        label.textContent='★'+face+' '+name;level.textContent='숙련 '+(p.tree.mastery[face]||0);
        b.append(img,label,level);b.onclick=()=>hooks.navigate('deck');deck.append(b);
      }
    }
    const counts=N.counts(view);
    for(const dot of document.querySelectorAll('[data-reward-dot]')){
      const kind=dot.dataset.rewardDot,available=counts[kind]||0;dot.hidden=!available;
      const b=dot.closest('button'),label={attendance:'출석',mail:'우편',pass:'성장 패스'}[kind];
      if(b){b.setAttribute('aria-label',label+(available?' · 받을 보상 '+available+'개':''));b.title=available?'받을 보상 '+available+'개':label;}
    }
    put('home-pass-progress',error?'보상 연결 재확인 중':view?Math.floor(view.pass.xp/100)+' / 20단계'+(counts.pass?' · 수령 가능':' · '+view.pass.xp+' XP'):'보상 확인 중…');
  }
  function maybeOpen(){
    if(!safe()||!view||!hooks.canAuto()||!N.counts(view).attendance)return;
    const key=popupKey();if(!key||shown.has(key))return;
    const openDialog=document.querySelector('dialog[open]');
    if(openDialog){
      if($('rewards-dialog')?.open&&$('rewards-tab-attendance')?.getAttribute('aria-selected')==='true')shown.add(key);
      return;
    }
    // open dispatches rewards:opened only after showModal succeeds.
    window.DKREWARDSUI.open('attendance',{automatic:true,view}).catch(()=>{});
  }
  function schedule(){
    clearTimeout(timer);if(!safe())return;
    let delay=60000;
    if(view){
      const serverNow=N.serverTime(view),boundaries=[view.nextDayAt,...(view.mail||[]).filter(m=>!m.claimed&&!m.expired).map(m=>m.expiresAt)].filter(n=>Number.isFinite(n)&&n>serverNow);
      if(boundaries.length)delay=Math.min(delay,Math.max(100,Math.min(...boundaries)-serverNow+100));
    }
    timer=setTimeout(()=>refresh(),delay);
  }
  async function refresh(force=true){
    if(!safe()){clearTimeout(timer);return null;}
    if(pending)return pending;
    if(!force&&!dirty&&now()-lastCheck<30000){render();maybeOpen();schedule();return view;}
    const who=owner();dirty=false;
    const task=(async()=>{
      try{
        const data=await R.list();if(who!==owner())return null;
        view=data;error='';lastCheck=now();render();maybeOpen();return data;
      }catch(e){if(who===owner()){view=null;error=e.message;dirty=true;render();}return null;}
      finally{schedule();}
    })();pending=task;
    try{return await task;}finally{if(pending===task)pending=null;if(who!==owner()&&safe())queueMicrotask(()=>refresh());}
  }
  function enter(){render();if(safe())refresh(false);else clearTimeout(timer);}
  window.DKHOME=Object.freeze({
    configure(options){hooks=options;for(const b of document.querySelectorAll('[data-home-action]'))b.onclick=()=>hooks.navigate(b.dataset.homeAction);render();},
    bootReady(){ready=true;enter();},enter,refresh,render
  });
  window.addEventListener('rewards:opened',e=>{if(e.detail?.tab==='attendance'){const key=popupKey();if(key)shown.add(key);}});
  window.addEventListener('rewards:updated',()=>{const data=R.current();if(data){view=data;error='';lastCheck=now();dirty=false;render();maybeOpen();schedule();}});
  window.addEventListener('rewards:change',()=>{view=R.current();dirty=!view;render();if(safe())refresh(false);});
  window.addEventListener('commerce:change',()=>{
    if(identity!==owner()){identity=owner();view=null;error='';dirty=true;render();if(safe())refresh();}
    else render();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else if(safe())refresh();});
  window.addEventListener('focus',()=>{if(safe())refresh();});
  // A deferred prompt may appear after another panel closes, never over that panel.
  document.addEventListener('close',()=>{if(safe())maybeOpen();},true);
})();
