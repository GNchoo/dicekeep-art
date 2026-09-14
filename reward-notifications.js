(function (root, factory) {
  const api=factory(); if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DKREWARDNOTIFICATIONS=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  function serverTime(view) {
    const clock=typeof performance==='object'?performance.now():Date.now();
    return Number.isFinite(view?.serverNow)?view.serverNow+(Number.isFinite(view.checkedAt)?Math.max(0,clock-view.checkedAt):0):Date.now();
  }
  function counts(view,now=serverTime(view)) {
    if(!view)return {attendance:0,mail:0,pass:0};
    const mail=view.account?.linked?(view.mail||[]).filter(m=>!m.claimed&&!m.expired&&(m.expiresAt==null||+new Date(m.expiresAt)>now)).length:0;
    const pass=(view.pass?.tiers||[]).reduce((n,t)=>n+(view.pass.xp>=t.requiredXp?
      Number(!!t.free&&!t.free.claimed)+Number(!!view.pass.premiumOwned&&!!t.premium&&!t.premium.claimed):0),0);
    return {attendance:view.attendance?.claimedToday===false?1:0,mail,pass};
  }
  return Object.freeze({counts,serverTime});
});
