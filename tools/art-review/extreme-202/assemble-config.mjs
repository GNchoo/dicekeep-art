import fs from 'node:fs';import {sha256} from '../../lib/directional-rig.mjs';
const d='tools/art-review/extreme-202',catalog=JSON.parse(fs.readFileSync(d+'/catalog.json')),map=new Map(),origins={};
for(const group of catalog.groups){const p=d+'/rigs/'+group.id+'.json';if(!fs.existsSync(p))throw Error('missing prepared group '+group.id);const j=JSON.parse(fs.readFileSync(p));for(const e of j.entries){if(map.has(e.assetId)&&!group.corrections?.includes(e.assetId))throw Error('unapproved duplicate '+e.assetId);map.set(e.assetId,structuredClone(e));origins[e.assetId]={group:group.id,config:p,sha256:sha256(fs.readFileSync(p))};}}
if(map.size!==111||catalog.entries.some(e=>!map.has(e.assetId)))throw Error('111 unique approved slots required');
const entries=catalog.entries.map(c=>{const e=map.get(c.assetId);e.name=c.assetId==='w102'?'왕관 운반다람쥐':c.name;e.reviewApproved=false;return e;});
fs.writeFileSync(d+'/all-rigs.json',JSON.stringify({version:1,canonicalCell:512,assetVersion:101,entries},null,2)+'\n');
fs.writeFileSync(d+'/selection.json',JSON.stringify({version:101,entries:origins,scope:'Selected source group per final unique appearance; earlier rejected cores stay archived.'},null,2)+'\n');
console.log(JSON.stringify({entries:entries.length,roles:entries.reduce((m,e)=>(m[e.role]=(m[e.role]||0)+1,m),{}),locomotion:entries.reduce((m,e)=>(m[e.locomotion]=(m[e.locomotion]||0)+1,m),{})}));
