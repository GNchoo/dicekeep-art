import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const [id,ids]=process.argv.slice(2);
if(!/^[a-z0-9-]+$/.test(id)||!ids)throw new Error('id and comma IDs required');
const catalog=JSON.parse(fs.readFileSync(path.join(dir,'production-catalog.json'),'utf8'));
const rows=ids.split(',').map(id=>catalog.entries.find(e=>e.assetId===id));
if(rows.some(e=>!e)||rows.length>4)throw new Error('unknown or more than4 rows');
const info=e=>{
 if(e.locomotion==='flight')return ['head+torso+tail+tucked feet+equipment, BOTH wings removed','full LEFT wing with substantial root and complete tip','full RIGHT wing with substantial root and complete tip'];
 if(e.locomotion==='slither')return ['head+SHORT neck ONLY','one broad mid-body SEGMENT with smooth overlap ends','one tapering TAIL segment, fully inside cell'];
 if(e.family==='arthropod')return ['complete head+carapace+abdomen+equipment, ALL walking legs removed; keep named pincers and tail','one connected articulated FRONT walking leg, entire root/knee/ankle/foot','one connected articulated HIND walking leg, entire root/knee/ankle/foot'];
 if(e.gait==='quad')return ['head+ENTIRE horizontal quadruped torso+tail+gear, ALL FOUR walking limbs removed including small paws. Full abdomen/rump behind shoulders, never a sitting humanoid bust','complete FORELEG shoulder/elbow/wrist/paw or webbed foot, naturally extended','complete HINDLEG hip/knee/ankle/paw or webbed foot, naturally extended'];
 return ['head+torso+arms+equipment with BOTH legs removed at hips; cloth hems above knees','full physical LEFT LEG hip/knee/ankle/boot naturally extended','full physical RIGHT LEG hip/knee/ankle/boot naturally extended'];
};
const prompt='Create ONE SQUARE production sprite-rigging atlas with exactly '+rows.length+' horizontal ROWS and SIX columns. Each row is ONE species. Columns1–3 contain FRONT components and columns4–6 BACK components. Each cell contains exactlyONE isolated part, plenty of empty gutters; no extra components. Front is absolutely straight-on, centered nose and chest, both eyes/ears same size, body recedes straight behind head. Back is absolutely away, centered spine and back of ears/head, no eyes/nose. NO diagonal torso or three-quarter camera. Back feet show HEELS; toes/claws point away. Preserve full connected leg parts in near-extended neutral posture, no permanent squat, rounded intact roots with no black holes/exposed flesh. Keep same costume and scale in front/back. Weapons/shields remain on the same physical hands and sides. All walking limbs/wings specified as removed must be fully absent from torso. No human arms on quadrupeds.\n'+rows.map((e,i)=>{const d=info(e);return 'ROW'+(i+1)+': '+e.description+' COL1 FRONT '+d[0]+'. COL2 FRONT '+d[1]+'. COL3 FRONT '+d[2]+'. COL4 BACK '+d[0]+'. COL5 BACK '+d[1]+'. COL6 BACK '+d[2]+'.';}).join('\n')+'\nCrisp dark contours, hand-painted fantasy tower-defense GAME CHARACTER art, broad readable midtones, intact healthy bodies, expressive approachable faces. No gore/blood/rot/wounds/grotesque detail or photorealism. Transparent background, no checker pattern, text, labels, scenery, grids, floor or shadows. All parts fully contained in cells.';
fs.writeFileSync(path.join(dir,'prompts',id+'.txt'),prompt+'\n');
console.log(JSON.stringify({id,prompt,assetIds:rows.map(e=>e.assetId),view:'front-back',stage:'parts'}));

