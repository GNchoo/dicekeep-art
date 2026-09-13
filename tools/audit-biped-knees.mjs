// Read-only anatomy audit of release-selected biped rigs; no art is regenerated.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandConfig } from './lib/directional-rig.mjs';
import { solveLeg } from './rig-walk.mjs';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const releases=read('tools/art-review/directional-101/release-builds.json'),catalog=read('tools/art-review/directional-101/production-catalog.json');
const newer=read('tools/art-review/extreme-202/catalog.json'),cache=new Map();
const config=p=>{if(!cache.has(p))cache.set(p,expandConfig(read(p)));return cache.get(p);};
const rows=[];
for(const [kind,items] of [['original',catalog.entries],['extreme',newer.entries]])for(const item of items){
  if(item.family!=='biped'||item.locomotion!=='legged')continue;
  const source=kind==='original'?releases.builds.find(b=>b.assetIds.includes(item.assetId))?.config.path:'tools/art-review/extreme-202/all-rigs.json';
  const entry=source&&config(source).entries.find(e=>e.assetId===item.assetId),view=entry?.views.side;
  const row={id:item.assetId,name:item.name,kind,source,views:{}};
  for(const [name,v] of Object.entries(entry?.views||{})){
    let limbs=(v.parts||[]).filter(p=>p.type==='leg').map(p=>({id:p.id,bend:p.bend}));
    if(v.legacyRig){const p=v.legacyRig,base=read(p.config).waves.find(w=>w.wave===p.wave),wave={...base,...p.overrides};
      limbs=['near','far'].map(id=>({id,bend:wave.kneeBend?.[id]??-1}));}
    row.views[name]=limbs.map(l=>({...l,kneeForward:solveLeg([0,0],[0,100],60,60,l.bend,item.assetId)[0]}));
  }
  const side=row.views.side||[];
  row.status=side.length!==2?'unresolved':side.every(l=>l.kneeForward<0)?'backward':side.every(l=>l.kneeForward>0)?'forward':'mixed';rows.push(row);
}
const summary=Object.fromEntries(['original','extreme'].map(kind=>[kind,Object.fromEntries(['backward','forward','mixed','unresolved'].map(status=>[status,rows.filter(r=>r.kind===kind&&r.status===status).length]))]));
const out=path.join(root,'gen/e2e/biped-knees');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify({scope:'Release-selected biped family only; sagittal +X is forward. Does not include intentionally digitigrade animal families.',summary,rows},null,2));
console.log(JSON.stringify(summary));
for(const status of ['backward','forward','mixed','unresolved'])console.log(status,rows.filter(r=>r.status===status).map(r=>r.id).join(','));
