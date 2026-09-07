import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const catalog=JSON.parse(fs.readFileSync(path.join(dir,'../production-catalog.json'))).entries.filter(e=>e.wave>=61);
const groups=['float','flight','biped','quad','slither'];
const entries=groups.flatMap(g=>JSON.parse(fs.readFileSync(path.join(dir,g+'-rigs.json'))).entries).sort((a,b)=>a.wave-b.wave||a.assetId.localeCompare(b.assetId));
if(entries.length!==45||new Set(entries.map(e=>e.assetId)).size!==45)throw Error('Expected 45 unique late-wave identities');
for(const e of entries){const c=catalog.find(c=>c.assetId===e.assetId);if(!c||e.role!==c.role||e.wave!==c.wave||!e.reviewApproved||Object.keys(e.views).sort().join(',')!=='back,front,side')throw Error('Incomplete / mismatched '+e.assetId);}
if(catalog.some(c=>!entries.some(e=>e.assetId===c.assetId)))throw Error('Missing late-wave identity');
fs.writeFileSync(path.join(dir,'all-rigs.json'),JSON.stringify({version:1,canonicalCell:512,assetVersion:93,entries},null,2)+'\n');
console.log('Combined 45 reviewed identities, 135 views.');
