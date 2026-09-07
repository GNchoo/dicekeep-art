import fs from'node:fs';import path from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
const dir=path.dirname(fileURLToPath(import.meta.url)),prefix='tools/art-review/directional-101/late-waves/';
const ledger=JSON.parse(fs.readFileSync(path.join(dir,'generation-ledger.json'))),catalog=JSON.parse(fs.readFileSync(path.join(dir,'../production-catalog.json'))).entries,jobs=JSON.parse(fs.readFileSync(path.join(dir,'parts-jobs.json'))),data=[];
for(const job of jobs.filter(j=>j.family==='flight')){const rec=ledger.requests.find(r=>r.id===job.id);if(!rec)continue;const ip=path.join(dir,'inspection',job.id+'-components.json');if(!fs.existsSync(ip))continue;const r=JSON.parse(fs.readFileSync(ip)),groups=Array.from({length:job.rows.length},()=>[]);for(const c of r.components.filter(c=>c.n>500))groups[Math.min(groups.length-1,Math.floor((c.bounds[1]+c.bounds[3]/2)/r.height*groups.length))].push(c);for(const g of groups)g.sort((a,b)=>a.bounds[0]-b.bounds[0]);data.push({job,rec,r,groups});}
const roi=(d,b)=>{const[x,y,w,h]=b,l=Math.max(0,x-1),t=Math.max(0,y-1);return[l/d.width,t/d.height,(Math.min(d.width,x+w+1.25)-l)/d.width,(Math.min(d.height,y+h+1.25)-t)/d.height];};
const sidePivots={w062:[[.935,.64],[.935,.64]],w064:[[.93,.59],[.93,.59]],w068:[[.92,.53],[.92,.53]],w096:[[.93,.43],[.93,.43]],w072:[[.737,.065],[.30,.045]],w076:[[.935,.52],[.065,.52]],w088:[[.93,.62],[.07,.62]]};
const frontPivots={w062:[[.93,.54],[.07,.54]],w064:[[.17,.05],[.87,.05]],w068:[[.93,.52],[.07,.52]],w096:[[.17,.05],[.87,.05]],w072:[[.84,.43],[.12,.43]],w076:[[.93,.52],[.07,.52]],w088:[[.94,.67],[.06,.67]]};
const socketY={w062:.56,w064:.38,w068:.45,w096:.43,w072:.43,w076:.47,w088:.49};
const circleSeeds=[[100,241],[190,241],[741,242],[827,242],[98,644],[194,644],[732,646],[822,646],[92,1052],[185,1052],[724,1053],[817,1053]];
const entries=[];
sidePivots.b080=[[.93,.45],[.07,.45]];sidePivots['b100-2']=[[.95,.47],[.055,.47]];
frontPivots.b080=[[.27,.035],[.73,.035]];frontPivots['b100-2']=[[.34,.035],[.69,.035]];
const bossSockets={b080:{side:[[.47,.49],[.47,.49]],front:[[.94,.42],[.38,.42]],back:[[.065,.405],[.635,.405]]},'b100-2':{side:[[.5,.46],[.5,.46]],front:[[.95,.425],[.41,.425]],back:[[.08,.415],[.72,.415]]}};
for(const e of catalog.filter(e=>e.wave>=61&&e.locomotion==='flight')){
 const views={};let complete=true;
 for(const name of['side','front','back']){
  const match=r=>r.assetId===e.assetId&&(r.view===name||r.view==='front-back'&&name!=='side'),d=data.find(d=>d.job.stage==='parts'&&d.job.rows.some(match));if(!d){complete=false;break;}
  const ri=d.job.rows.findIndex(match),col=d.job.layout==='front-back'&&name==='back'?3:0,row=d.groups[ri],expected=d.job.layout==='front-back'?6:3;if(row.length!==expected)throw new Error(e.assetId+' '+name+' unexpected components '+row.length);
  let bd=d,b=row[col];const wings=[row[col+1],row[col+2]],boss=e.role!=='normal',height=boss?255:210,top=boss?110:135;
  if(['w064','w096'].includes(e.assetId)){const correction=data.find(d=>d.job.id==='late-bird-bodies-correction');if(!correction)throw new Error('Reviewed bird body source required');bd=correction;b=correction.groups[e.assetId==='w064'?0:1][['side','front','back'].indexOf(name)];}
  const body={roi:e.assetId==='w062'&&name==='side'?[0,0,.315,.25]:roi(bd.r,b.bounds),target:{height,top,centerX:256},layer:0};if(bd!==d){body.source=prefix+bd.rec.source;body.sourceSha256=bd.rec.sha256;}
  if(e.assetId==='b080'&&name==='side')body.roi=[0,0,.34,.5];
  if(e.assetId==='w062'&&name!=='back'){const f='derived/w062-'+name+'-alpha.png';body.source=prefix+f;body.sourceSha256=createHash('sha256').update(fs.readFileSync(path.join(dir,f))).digest('hex');body.roi=[0,0,1,1];body.background='alpha';}
  const bodyW=height*b.bounds[2]/b.bounds[3],sy=socketY[e.assetId]??.46;
  views[name]={source:prefix+d.rec.source,sourceSha256:d.rec.sha256,background:'checkerboard',backgroundSeeds:d.job.id==='late-flight-02-front-back-parts'?circleSeeds:d.job.id==='late-boss-flight-01-side-parts'?[[211,600],[210,1260]]:[],pivot:[256,385],body,parts:wings.map((c,k)=>{
   let pivot=name==='side'?sidePivots[e.assetId]?.[k]:frontPivots[e.assetId]?.[k];if(!pivot)throw new Error('Need measured wing root '+e.assetId+' '+name);
   let flipX=false,mean=0,amplitude=k?45:-45;
   if(name==='side'){flipX=['w072','w076','w088','b080','b100-2'].includes(e.assetId)&&k===1;amplitude=48;mean=0;}
   else if(['w064','w096','b080','b100-2'].includes(e.assetId)){mean=k?45:-45;amplitude=k?-45:45;}
   else {flipX=true;mean=k?10:-10;amplitude=k?-42:42;}
   const bird=['w064','w096'].includes(e.assetId),sx=name==='side'?(k?.47:.43):name==='front'?(k?(bird?.25:.18):(bird?.75:.82)):(k?(bird?.75:.82):(bird?.25:.18));
   if(name==='back'){flipX=!flipX;mean=-mean;amplitude=-amplitude;}
   const span=Math.max(...[[0,0],[c.bounds[2],0],[0,c.bounds[3]],[c.bounds[2],c.bounds[3]]].map(p=>Math.hypot(p[0]-pivot[0]*c.bounds[2],p[1]-pivot[1]*c.bounds[3]))),scale=(boss?210:165)/span;
   return{id:k?'rightWing':'leftWing',type:'wing',roi:roi(d.r,c.bounds),socketNormalized:bossSockets[e.assetId]?.[name]?.[k]??[sx,sy],sourcePivot:pivot,scale,angleDeg:[mean,amplitude],phase:0,layer:name==='side'?k?1:-1:-1,flipX};
  }),wingReview:'Shoulder root pivots identified independently from elbow/claw tips in source art. Full independently articulated left/right wings; final visual approval separate.'};
 }
 if(complete)entries.push({assetId:e.assetId,wave:e.wave,role:e.role,locomotion:'flight',cell:e.role==='normal'?256:512,referenceHeight:300,cycleStride:0,cycleSeconds:.8,reviewApproved:false,views});
}
fs.writeFileSync(path.join(dir,'flight-rigs.json'),JSON.stringify({version:1,canonicalCell:512,assetVersion:93,entries},null,2)+'\n');console.log('Wrote '+entries.length+' unapproved flight rigs.');
