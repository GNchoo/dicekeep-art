// Consolidate the current release-selected rigs; modify only human knee direction.
import fs from 'node:fs';
import { expandConfig, sha256 } from './lib/directional-rig.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const releases=read('tools/art-review/directional-101/release-builds.json');
const catalogs=[read('tools/art-review/directional-101/production-catalog.json'),read('tools/art-review/extreme-202/catalog.json')];
const entries=[],selection=[],cache=new Map();
const exceptions=[{id:'w075',reason:'Avian exposed hock; backward bend is intentional.'},{id:'w176',reason:'Avian exposed hock; backward bend is intentional.'}];
for(let kind=0;kind<2;kind++)for(const c of catalogs[kind].entries){
  if(c.family!=='biped'||c.locomotion!=='legged')continue;
  if(exceptions.some(e=>e.id===c.assetId))continue;
  const source=kind?'tools/art-review/extreme-202/all-rigs.json':releases.builds.find(b=>b.assetIds.includes(c.assetId)).config.path;
  if(!cache.has(source))cache.set(source,expandConfig(read(source)));
  const original=cache.get(source).entries.find(e=>e.assetId===c.assetId),side=original.views.side;
  if(side.legacyRig)continue; // Five correct legacy side views; front/back use the supplemental config.
  if(side.parts.filter(p=>p.type==='leg').length!==2||side.parts.filter(p=>p.type==='leg').some(p=>p.bend!==1))throw Error('unexpected biped '+c.assetId);
  const entry=structuredClone(original),directions=[];
  entry.anatomy='biped';entry.reviewApproved=false;
  for(const [view,v]of Object.entries(entry.views)){
    const legs=v.parts.filter(p=>p.type==='leg');if(legs.length!==2||legs.some(p=>p.bend!==1))throw Error('unexpected legs '+c.assetId+':'+view);
    for(const leg of legs)leg.bend=-1;
    directions.push({view,priorVersion:v.assetVersion??(kind?101:93),flippedLegs:legs.filter(p=>p.flipX).map(p=>p.id)});
    v.assetVersion=110;
  }
  // Exact structural comparison proves source pictures, roots, feet, gait and
  // source-joint landmarks are unchanged by the config transformation.
  const restored=structuredClone(entry);if(original.anatomy===undefined)delete restored.anatomy;else restored.anatomy=original.anatomy;
  restored.reviewApproved=original.reviewApproved;if(original.reviewApproved===undefined)delete restored.reviewApproved;
  for(const [name,v]of Object.entries(restored.views)){for(const leg of v.parts.filter(p=>p.type==='leg'))leg.bend=1;if(original.views[name].assetVersion===undefined)delete v.assetVersion;else v.assetVersion=original.views[name].assetVersion;}
  if(JSON.stringify(restored)!==JSON.stringify(original))throw Error('unexpected config change '+c.assetId);
  entries.push(entry);selection.push({id:c.assetId,kind:kind?'extreme':'original',source,sourceSha256:sha256(fs.readFileSync(source)),directions});
}
if(entries.length!==98||selection.filter(x=>x.kind==='original').length!==46)throw Error('unexpected correction scope');
const out='tools/art-review/biped-knees-110';fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(out+'/rigs.json',JSON.stringify({version:1,canonicalCell:512,assetVersion:110,entries},null,2)+'\n');
fs.writeFileSync(out+'/selection.json',JSON.stringify({version:110,scope:'Only bend +1 → -1, biped anatomy guard and per-view cache version; previous front-foot mirrors retained. Two avian hocks excluded.',exceptions,selection},null,2)+'\n');
console.log('Prepared98 biped corrections,588 knees, original source/feet/stride preserved.');
