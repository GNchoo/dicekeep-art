import LR from './liveops-rules.mjs';
import PG from './progression.mjs';
import {requireThat,int,fields,list,random,sha} from './common.mjs';
import {ensurePassState,premiumOwned,grantPremiumReward} from './pass-economy.mjs';

export const MAIL_LIMITS=Object.freeze({title:80,body:2000,gold:10000,shards:500,defaultDays:30,previewMinutes:10});
const requestId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{8,128}$/.test(id);
const mailId=id=>typeof id==='string'&&/^mail_[a-f0-9]{32}$/.test(id);
export function ensureLiveops(a){a.liveops=LR.sanitize(a.liveops);a.mailClaims||={};ensurePassState(a);return a;}
function cleanMail(b,now){
  const title=typeof b.title==='string'?b.title.trim():'',body=typeof b.body==='string'?b.body.replace(/\r\n?/g,'\n').trim():'';
  requireThat(title.length>0&&title.length<=MAIL_LIMITS.title&&body.length>0&&body.length<=MAIL_LIMITS.body&&
    !/[<>\x00-\x1f\x7f]/.test(title)&&!/[<>\x00-\x08\x0b-\x1f\x7f]/.test(body),'invalid-mail');
  const reward=b.reward||{gold:0,shards:0};fields(reward,['gold','shards']);
  requireThat(int(reward.gold,0,MAIL_LIMITS.gold)&&int(reward.shards,0,MAIL_LIMITS.shards),'invalid-mail-reward');
  const expiresAt=b.expiresAt===undefined?now+MAIL_LIMITS.defaultDays*86400000:b.expiresAt;
  requireThat(expiresAt===null||int(expiresAt,now+1,now+366*86400000),'invalid-mail-expiry');
  return{title,body,reward:{gold:reward.gold,shards:reward.shards},expiresAt};
}
const eligible=(a,m)=>a.createdAt<=m.audienceAt&&(a.accountSequence||0)<=(m.audienceSequence||0);
export class Liveops {
  constructor(ledger,helpers){this.ledger=ledger;this.storage=ledger.storage;this.env=ledger.env;this.now=ledger.now;Object.assign(this,helpers);}
  view(a){ensureLiveops(a);return LR.view(a.liveops,{now:this.now(),premium:premiumOwned(a)});}
  awardXp(a,run,result){ensureLiveops(a);const xp=LR.awardRunXp(a.liveops,run,result);requireThat(xp.ok,xp.reason||'invalid-liveops-run',409);a.liveops=xp.nextState;return xp.xpAdded;}
  async isAdmin(a){
    const allowed=list(this.env.ADMIN_ACCOUNT_IDS);
    if(allowed.includes(a.id)||allowed.includes('account:'+a.id)||a.googleSubjectHash&&allowed.includes('sha256:'+a.googleSubjectHash))return true;
    if(!a.googleSubjectHash)return false;
    for(const value of allowed)if(value.startsWith('google:')&&await sha('google:'+value.slice(7))===a.googleSubjectHash)return true;
    return false;
  }
  async admin(id){const a=await this.storage.get('account:'+id);requireThat(a&&await this.isAdmin(a),'admin-required',403);return a;}
  async inbox(a,storage=this.storage){
    const rows=await storage.list({prefix:'mail:'}),now=this.now();
    return [...rows.values()].filter(m=>m.status==='published'&&eligible(a,m)&&(m.expiresAt===null||m.expiresAt>now)).sort((a,b)=>b.publishedAt-a.publishedAt||a.id.localeCompare(b.id)).map(m=>({
      id:m.id,title:m.title,body:m.body,reward:m.reward,publishedAt:m.publishedAt,audienceAt:m.audienceAt,expiresAt:m.expiresAt,claimed:!!a.mailClaims?.[m.id]
    }));
  }
  async fullView(a,storage=this.storage){return{...this.ledger.accountView(a),inbox:await this.inbox(a,storage),canAdmin:await this.isAdmin(a),serverNow:this.now()};}
  async get(id){await this.ledger.refreshCosmetics(id);const a=await this.storage.get('account:'+id);return this.fullView(a);}
  grant(a,reward,kind='free'){
    const deposited=Math.min(reward.gold||0,PG.MAX_GOLD-a.profile.collection.gold),reserve=(reward.gold||0)-deposited;
    requireThat(Number.isSafeInteger((a.profile.tree.reserveGold||0)+reserve),'wallet-limit',409);
    a.profile.collection.gold+=deposited;a.profile.tree.reserveGold=(a.profile.tree.reserveGold||0)+reserve;
    const paid=this.credit(a,reward.shards||0,kind);
    return{reward:{gold:reward.gold||0,shards:paid.credited,...(reward.skinId?{skinId:reward.skinId}:{})},earnedReward:reward,debtPaid:paid.debtPaid};
  }
  async claim(id,kind,b){
    const allowed=kind==='attendance'?['day','requestId']:kind==='mail'?['id','requestId']:['tier','track','requestId'];fields(b,allowed);
    requireThat(requestId(b.requestId),'invalid-request-id');
    if(kind==='attendance')requireThat(typeof b.day==='string','invalid-day');
    if(kind==='mail')requireThat(mailId(b.id),'invalid-mail-id');
    if(kind==='pass'&&b.track==='premium')await this.ledger.refreshCosmetics(id);
    const fingerprint=await sha(JSON.stringify([kind,b.day??null,b.id??null,b.tier??null,b.track??null]));
    return this.storage.transaction(async tx=>{
      const a=ensureLiveops(await tx.get('account:'+id)),key='liveops-action:'+id+':'+b.requestId,prior=await tx.get(key);
      if(prior){requireThat(prior.fingerprint===fingerprint,'request-id-conflict',409);return{...await this.fullView(a,tx),...prior.result,reward:{gold:0,shards:0},earnedReward:{gold:0,shards:0},debtPaid:0,xpAdded:0,duplicate:true};}
      let changed,reward;
      if(kind==='mail'){
        const mail=await tx.get('mail:'+b.id);requireThat(mail?.status==='published'&&eligible(a,mail),'mail-unavailable',404);
        requireThat(mail.expiresAt===null||mail.expiresAt>this.now(),'mail-expired',409);requireThat(!a.mailClaims[b.id],'already-claimed',409);
        a.mailClaims[b.id]={at:this.now(),reward:mail.reward};reward=mail.reward;
      }else{
        changed=kind==='attendance'?LR.claimAttendance(a.liveops,this.now(),b.day):LR.claimPass(a.liveops,{tier:b.tier,track:b.track,premium:premiumOwned(a)});
        requireThat(changed.ok,changed.reason,409);a.liveops=changed.nextState;reward=changed.reward;
      }
      const paid=kind==='pass'&&b.track==='premium'?grantPremiumReward(a,'founders',reward,{credit:this.credit,cosmetics:this.cosmetics}):null;
      const grant=paid?{reward:{...reward,shards:paid.credited},earnedReward:reward,debtPaid:paid.debtPaid}:this.grant(a,reward);
      const result={ok:true,...grant,xpAdded:changed?.xpAdded||0,duplicate:false};
      await tx.put('account:'+id,a);await tx.put(key,{fingerprint,result,at:this.now()});
      return{...await this.fullView(a,tx),...result};
    });
  }
  async adminList(id){await this.admin(id);return{mails:[...(await this.storage.list({prefix:'mail:'})).values()].sort((a,b)=>b.createdAt-a.createdAt),serverNow:this.now()};}
  async adminGet(id,target){await this.admin(id);requireThat(mailId(target),'invalid-mail-id');const mail=await this.storage.get('mail:'+target);requireThat(mail,'mail-not-found',404);return{mail,serverNow:this.now()};}
  async audit(tx,actor,action,mail,extra={}){await tx.put('mail-audit:'+mail.id+':'+String(this.now()).padStart(16,'0')+':'+random(8),{actor,action,mailId:mail.id,revision:mail.revision,at:this.now(),...extra});}
  async adminAction(id,action,b){
    await this.admin(id);
    fields(b,action==='draft'?['id','title','body','reward','expiresAt','requestId']:action==='preview'?['id']:action==='publish'?['id','requestId','previewToken']:['id','requestId']);
    if(action!=='preview')requireThat(requestId(b.requestId),'invalid-request-id');
    if(action!=='draft'||b.id!==undefined)requireThat(mailId(b.id),'invalid-mail-id');
    const cleaned=action==='draft'?cleanMail(b,this.now()):null;
    const fingerprint=await sha(JSON.stringify([action,b.id??null,b.title??null,b.body??null,b.reward??null,b.expiresAt===undefined?'default':b.expiresAt,b.previewToken??null]));
    return this.storage.transaction(async tx=>{
      const key='admin-action:'+id+':'+b.requestId,prior=action!=='preview'&&await tx.get(key);
      if(prior){requireThat(prior.fingerprint===fingerprint,'request-id-conflict',409);return{...prior.result,serverNow:this.now(),duplicate:true};}
      let mail=b.id?await tx.get('mail:'+b.id):null,result;
      if(action==='draft'){
        requireThat(!b.id||mail,'mail-not-found',404);requireThat(!mail||mail.status==='draft','mail-not-draft',409);
        mail={...(mail||{id:'mail_'+random(16),createdAt:this.now(),createdBy:id,status:'draft'}),...cleaned,revision:(mail?.revision||0)+1,updatedAt:this.now(),updatedBy:id};
        delete mail.preview;await this.audit(tx,id,'draft',mail);result={ok:true,mail,duplicate:false};
      }else{
        requireThat(mail,'mail-not-found',404);
        if(action==='preview'){
          requireThat(mail.status==='draft','mail-not-draft',409);
          const audienceAt=this.now(),audienceSequence=await tx.get('account-sequence')||0;
          const recipients=[...(await tx.list({prefix:'account:'})).values()].filter(a=>a.createdAt<=audienceAt&&(a.accountSequence||0)<=audienceSequence);
          const total={gold:recipients.length*mail.reward.gold,shards:recipients.length*mail.reward.shards};requireThat(Object.values(total).every(Number.isSafeInteger),'mail-total-limit',409);
          mail.preview={token:random(),actor:id,revision:mail.revision,audienceAt,audienceSequence,recipientCount:recipients.length,total,expiresAt:this.now()+MAIL_LIMITS.previewMinutes*60000};
          await this.audit(tx,id,'preview',mail,{recipientCount:recipients.length,total});
          result={mail,previewToken:mail.preview.token,audienceAt,recipientCount:recipients.length,total,serverNow:this.now()};
        }else if(action==='publish'){
          requireThat(mail.status==='draft','mail-not-draft',409);const preview=mail.preview;
          requireThat(preview&&b.previewToken===preview.token&&preview.actor===id&&preview.revision===mail.revision&&preview.expiresAt>this.now(),'preview-required',409);
          requireThat(mail.expiresAt===null||mail.expiresAt>this.now(),'mail-expired',409);
          mail={...mail,status:'published',publishedAt:this.now(),publishedBy:id,audienceAt:preview.audienceAt,audienceSequence:preview.audienceSequence,recipientCount:preview.recipientCount,total:preview.total};
          delete mail.preview;await this.audit(tx,id,'publish',mail,{recipientCount:mail.recipientCount,total:mail.total});result={ok:true,mail,duplicate:false};
        }else{
          requireThat(['draft','published'].includes(mail.status),'mail-already-cancelled',409);
          mail={...mail,status:'cancelled',cancelledAt:this.now(),cancelledBy:id};delete mail.preview;
          await this.audit(tx,id,'cancel',mail);result={ok:true,mail,duplicate:false};
        }
      }
      result.serverNow=this.now();await tx.put('mail:'+mail.id,mail);if(action!=='preview')await tx.put(key,{fingerprint,result,at:this.now()});return result;
    });
  }
}
