(function () {
  'use strict';
  const C = window.DKCOMMERCE;
  let dialog, list, form, status, previewBox, current = null, preview = null, busy = false, authorized = false, account = null, generation = 0, draftAttempt = null;
  const attempts = new Map();
  const text = (tag, value, cls) => { const n=document.createElement(tag); n.textContent=value; if(cls)n.className=cls; return n; };
  const button = (label, action, id) => { const n=text('button',label); n.type='button'; n.onclick=action; if(id)n.id=id; return n; };
  const date = at => at === null ? '기한 없음' : new Date(at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}) + ' (한국 시간)';
  function create() {
    if (dialog) return;
    dialog=document.createElement('dialog'); dialog.id='mail-admin'; dialog.setAttribute('aria-labelledby','mail-admin-title');
    const header=text('header',''), title=text('h2','전체 보상 우편 관리'); title.id='mail-admin-title';
    header.append(title,button('닫기',()=>dialog.close(),'mail-admin-close'));
    status=text('p','','mail-admin-status'); status.id='mail-admin-status'; status.setAttribute('role','status');
    list=text('div','','mail-admin-list'); list.id='mail-admin-list';
    form=document.createElement('form'); form.id='mail-admin-form';
    form.innerHTML='<label>제목 (80자 이내)<input name="title" maxlength="80" required></label><label>내용 (2,000자 이내)<textarea name="body" maxlength="2000" required rows="4"></textarea></label><div class="mail-admin-fields"><label>연구 골드<input name="gold" type="number" min="0" max="10000" step="1" value="100" required></label><label>성장 조각<input name="shards" type="number" min="0" max="500" step="1" value="3" required></label></div><label>수령 기한<select name="days"><option value="30">지금부터 30일</option><option value="7">지금부터 7일</option><option value="0">기한 없음</option><option value="keep" hidden>기존 기한 유지</option></select></label>';
    const save=text('button','초안 저장'); save.type='submit'; save.id='mail-admin-save'; form.append(save);
    form.onsubmit=e=>{e.preventDefault();saveDraft();}; form.oninput=()=>{preview=null;draftAttempt=null;previewBox.replaceChildren();};
    previewBox=text('section','','mail-admin-preview'); previewBox.id='mail-admin-preview';
    const actions=text('div','','mail-admin-actions'); actions.append(button('새 우편 작성',()=>edit(null),'mail-admin-new'),button('목록 새로고침',()=>run(reload),'mail-admin-refresh'));
    dialog.append(header,text('p','미리보기 시점에 생성되어 있는 모든 계정에 보냅니다. 초안 저장 후 대상 인원과 내용을 확인해야 발송할 수 있습니다.'),actions,status,list,form,previewBox);
    document.body.append(dialog);
    dialog.addEventListener('close',()=>{generation++;preview=null;});
  }
  function edit(mail) {
    if (busy || !authorized) return;
    current=mail;preview=null;draftAttempt=null;previewBox.replaceChildren();
    for (const name of ['title','body']) form.elements[name].value=mail?.[name]||'';
    form.elements.gold.value=mail?.reward.gold??100; form.elements.shards.value=mail?.reward.shards??3;
    form.elements.days.value=mail?'keep':'30';
    form.hidden=!!mail&&mail.status!=='draft';
    if(mail?.status==='published') showPublished(mail);
    status.textContent=mail ? '선택한 우편: '+mail.id : '새 우편 초안';
  }
  function showPublished(mail) {
    previewBox.replaceChildren(text('h3',mail.title),text('p',mail.body,'mail-admin-body'),text('p',`${mail.recipientCount}명 · 연구 골드 ${mail.reward.gold} / 성장 조각 ${mail.reward.shards} (1인당)`),text('p','발송 '+date(mail.publishedAt)+' · 수령 기한 '+date(mail.expiresAt)),text('p','발송자 '+mail.publishedBy));
    previewBox.append(button('미수령 우편 회수',()=>{
      if(window.confirm('아직 받지 않은 사용자의 수령을 막습니다. 이미 받은 보상은 유지됩니다. 이 우편을 회수할까요?')) run(async()=>{await api('cancel',{id:mail.id});await reload();form.hidden=true;previewBox.replaceChildren(text('p','회수했습니다. 기존 수령 보상은 유지됩니다.'));});
    },'mail-admin-cancel'));
  }
  function ensureOwner() { if (!C.linked() || C.state().accountId!==account) throw Error('계정이 바뀌었습니다. 우편 관리 화면을 다시 열어 주세요.'); }
  async function api(action,payload) {
    ensureOwner(); const key=JSON.stringify([account,action,payload]);
    if(!attempts.has(key))attempts.set(key,crypto.randomUUID());
    const result=await C.adminMail(action,{...payload,...(action==='preview'?{}:{requestId:attempts.get(key)})});
    ensureOwner();attempts.delete(key);return result;
  }
  async function run(action) {
    if(busy || !authorized)return; busy=true;status.textContent='처리 중…';
    for(const n of dialog.querySelectorAll('button,input,textarea,select')) if(n.id!=='mail-admin-close')n.disabled=true;
    try{ensureOwner();await action();}catch(e){status.textContent=C.errorText(e);}
    finally{busy=false;for(const n of dialog.querySelectorAll('button,input,textarea,select'))n.disabled=false;}
  }
  async function reload() {
    const result=await C.adminMail('list');ensureOwner();list.replaceChildren();
    for(const mail of result.mails||[]) {
      const label={draft:'초안',published:'발송 완료',cancelled:'회수'}[mail.status]||mail.status;
      const b=button(label+' · '+mail.title,()=>edit(mail));b.dataset.mailId=mail.id;list.append(b);
    }
    if(!list.children.length)list.append(text('p','작성한 우편이 없습니다.'));
    status.textContent='운영 계정: '+account;
  }
  async function saveDraft() {
    if(!form.reportValidity())return;
    const title=form.elements.title.value.trim(),body=form.elements.body.value.trim(),gold=Number(form.elements.gold.value),shards=Number(form.elements.shards.value),days=form.elements.days.value;
    // Get authoritative time before constructing a relative expiry; client clock never sets the date.
    await run(async()=>{
      if(!draftAttempt) {
        const now=(await C.loadLiveops()).serverNow;ensureOwner();
        const expiresAt=days==='keep'?current.expiresAt:days==='0'?null:now+Number(days)*86400000;
        draftAttempt={...(current?{id:current.id}:{}),title,body,reward:{gold,shards},expiresAt};
      }
      const result=await api('draft',draftAttempt);draftAttempt=null;
      current=result.mail;form.elements.days.value='keep';await reload();
      previewBox.replaceChildren(text('p','초안을 저장했습니다. 발송 대상과 보상 총량을 확인해 주세요.'));
      previewBox.append(button('발송 미리보기',()=>run(showPreview),'mail-admin-preview-button'));
      status.textContent='초안 저장 완료 · 아직 발송되지 않았습니다.';
    });
  }
  async function showPreview() {
    const result=await api('preview',{id:current.id});preview=result;const m=result.mail;
    previewBox.replaceChildren(text('h3','발송 전 최종 확인'),text('h4',m.title),text('p',m.body,'mail-admin-body'),
      text('p',`대상 ${result.recipientCount.toLocaleString()}명 · ${date(result.audienceAt)}까지 생성된 계정`),
      text('p',`1인당 연구 골드 ${m.reward.gold} + 성장 조각 ${m.reward.shards}`),
      text('p',`전체 지급 예정: 골드 ${result.total.gold.toLocaleString()} / 조각 ${result.total.shards.toLocaleString()}`),text('p','수령 기한 '+date(m.expiresAt)),text('p','이 미리보기는 10분 동안 유효합니다. 발송 후 이미 수령한 보상은 회수되지 않습니다.'));
    previewBox.append(button(result.recipientCount+'명에게 발송',()=>run(async()=>{
      if(!preview)throw Error('미리보기를 다시 확인해 주세요.');
      const sent=await api('publish',{id:m.id,previewToken:preview.previewToken});preview=null;current=sent.mail;form.hidden=true;await reload();showPublished(sent.mail);status.textContent='발송 완료 · 대상 계정의 우편함에 전달했습니다.';
    }),'mail-admin-publish'));
    status.textContent='아직 발송되지 않았습니다. 내용과 대상을 확인해 주세요.';
  }
  async function open() {
    create();if(busy)return;if(!dialog.open)dialog.showModal();const token=++generation;authorized=false;dialog.querySelector('.mail-admin-actions').hidden=true;status.textContent='운영 권한을 확인하고 있습니다…';list.replaceChildren();form.hidden=true;previewBox.replaceChildren();
    try{
      account=C.state().accountId;const view=await C.loadLiveops();ensureOwner();
      if(token!==generation)return;if(!view.canAdmin)throw Error('운영자 권한이 없습니다.');
      authorized=true;dialog.querySelector('.mail-admin-actions').hidden=false;await reload();edit(null);
    }catch(e){status.textContent=C.errorText(e);}
  }
  window.DKMAILADMIN=Object.freeze({open,close:()=>dialog?.close()});
  window.addEventListener('commerce:change',()=>{if(dialog?.open&&C.state().accountId!==account){generation++;preview=null;dialog.close();}});
})();
