// Read-only anatomy audit of release-selected biped rigs; no art is regenerated.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { expandConfig } from './lib/directional-rig.mjs';
import { solveLeg } from './rig-walk.mjs';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const releases=read('tools/art-review/directional-101/release-builds.json'),catalog=read('tools/art-review/directional-101/production-catalog.json');
const newer=read('tools/art-review/extreme-202/catalog.json'),cache=new Map();
const current={};for(const file of ['directional-art.js','extreme-art.js']){const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);Object.assign(current,Object.values(ctx.window)[0].entries);}
const config=p=>{if(!cache.has(p))cache.set(p,expandConfig(read(p)));return cache.get(p);};
const rows=[];
const avianHocks=new Set(['w075','w176']);
const earlyBipeds=new Set(['w002','w003','w005','w007','w009']);
for(const [kind,items] of [['original',catalog.entries],['extreme',newer.entries]])for(const item of items){
  if(item.family!=='biped'||item.locomotion!=='legged')continue;
  const originalSource=kind==='original'?releases.builds.find(b=>b.assetIds.includes(item.assetId))?.config.path:'tools/art-review/extreme-202/all-rigs.json';
  const row={id:item.assetId,name:item.name,kind,sources:{},views:{},viewStatus:{}};
  for(const name of ['side','front','back']){
    const corrected=current[item.assetId]?.views[name]?.assetVersion===110;
    const source=corrected?'tools/art-review/biped-knees-110/'+(earlyBipeds.has(item.assetId)?'legacy-front-back-rigs.json':'rigs.json'):originalSource;
    const entry=source&&config(source).entries.find(e=>e.assetId===item.assetId),v=entry?.views[name];row.sources[name]=source;
    if(!v){row.viewStatus[name]='unresolved';continue;}
    let limbs=(v.parts||[]).filter(p=>p.type==='leg').map(p=>({id:p.id,bend:p.bend}));
    if(v.legacyRig){const p=v.legacyRig,base=read(p.config).waves.find(w=>w.wave===p.wave),wave={...base,...p.overrides};
      limbs=['near','far'].map(id=>({id,bend:wave.kneeBend?.[id]??-1}));}
    row.views[name]=limbs.map(l=>({...l,kneeForward:solveLeg([0,0],[0,100],60,60,l.bend,item.assetId)[0]}));
    const joints=row.views[name];row.viewStatus[name]=joints.length!==2?'unresolved':avianHocks.has(item.assetId)&&joints.every(l=>l.kneeForward<0)?'avianHock':joints.every(l=>l.kneeForward>0)?'forward':joints.every(l=>l.kneeForward<0)?'backward':'mixed';
  }
  const states=Object.values(row.viewStatus);row.status=states.includes('unresolved')?'unresolved':states.every(s=>s==='avianHock')?'avianHock':states.every(s=>s==='forward')?'forward':states.every(s=>s==='backward')?'backward':'mixed';rows.push(row);
}
const statuses=['backward','forward','avianHock','mixed','unresolved'];
const summary=Object.fromEntries(['original','extreme'].map(kind=>[kind,Object.fromEntries(statuses.map(status=>[status,rows.filter(r=>r.kind===kind&&r.status===status).length]))]));
const viewSummary=Object.fromEntries(statuses.map(status=>[status,rows.flatMap(r=>Object.values(r.viewStatus)).filter(s=>s===status).length]));
const out=path.join(root,'gen/e2e/biped-knees');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify({scope:'Every side/front/back view of release-selected biped family; sagittal +X is forward. Identity is forward only when all three views are forward. Two avian hocks are explicit exceptions.',summary,viewSummary,rows},null,2));
console.log(JSON.stringify(summary));
for(const status of statuses)console.log(status,rows.filter(r=>r.status===status).map(r=>r.id).join(','));
if(process.argv.includes('--check')&&(rows.length!==105||rows.some(r=>!['forward','avianHock'].includes(r.status))||viewSummary.forward!==309||viewSummary.avianHock!==6))throw Error('Biped audit failed: inspect every side/front/back view, including early legacy bipeds.');
