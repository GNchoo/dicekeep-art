import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const master=JSON.parse(fs.readFileSync(path.join(dir,'jobs.json'),'utf8'));
const definition=[{id:'t4-biped-01a-side-front-parts',reference:'t4-biped-01-turnaround.png',rows:[['w031','side'],['w031','front'],['w033','side'],['w033','front']]}];
const jobs=definition.map(job=>{
 const rows=job.rows.map(([assetId,view])=>({assetId,view,entry:master.flatMap(j=>j.entries).find(e=>e.assetId===assetId)}));
 const prompt=`Use case: precise-object-edit. The supplied image is an IDENTITY AND PAINTERLY STYLE REFERENCE ONLY. Create a NEW separate rigging-parts atlas, tall portrait1024x1536, exactly FOUR equal horizontal rows. Use ONLY the hooded goblin scout from reference row1 and round shield goblin from reference row2; ignore reference rows3 and4. No complete character turnarounds or walking sequence.\nEach row contains exactly THREE isolated components separated by very wide empty gutters. LEFT x0–50%: head, arms, equipment and torso with BOTH LEGS REMOVED at hips, full intact painted torso underside and natural rounded hip sockets. Keep all coat/tabard hems clearly ABOVE THE KNEES; there are no boots or leg stubs left attached to torso. MIDDLE x54–75%: ONE complete physical LEFT leg from rounded upper-thigh root through knee and ankle to whole boot. RIGHT x79–99%: ONE complete physical RIGHT leg, same length/thickness/costume. Legs are connected single painted pieces in a neutral nearly straight standing pose, never crouched. Their toes match the row view. Solid clothed hip roots with overlap texture, no black holes, no wounds, no sliced-open anatomy. Body and both legs drawn at the SAME character scale within each row.\n`+
 rows.map(({assetId,view,entry},i)=>`ROW${i+1}: ${assetId} ${entry.description} VIEW ${view==='side'?'PURE RIGHT-FACING PROFILE. Face, body and both boot toes point to the RIGHT EDGE; absolutely not left. Physical left leg is far-side, right leg is near-side.':'TRUE FRONT facing viewer, soles toward screen bottom. Physical left leg goes on screen-right when attached; right leg goes screen-left.'}`).join('\n')+
 '\nPreserve reference character design, armor and leather colors, chunky readable game proportions, clean hand-painted contours and rounded materials. Full parts stay completely in their row, no touching across gutters, no weapon crossing cell boundary. No text, labels, scenery, floor, extra pets, bats, familiars, inset views or fragments. GENUINE TRANSPARENT ALPHA background, not a painted checkerboard. No gore, rot, exposed flesh or photorealistic horror.';
 return {...job,kind:'parts',assetIds:[...new Set(rows.map(r=>r.assetId))],rows:rows.map(({assetId,view})=>({assetId,view})),prompt};
});
fs.mkdirSync(path.join(dir,'prompts'),{recursive:true});
for(const j of jobs)fs.writeFileSync(path.join(dir,'prompts',j.id+'.txt'),j.prompt+'\n');
fs.writeFileSync(path.join(dir,'parts-jobs.json'),JSON.stringify(jobs,null,2)+'\n');
console.log(JSON.stringify(jobs.map(({id,assetIds,rows})=>({id,assetIds,rows}))));
