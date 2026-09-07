import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath}from'node:url';
import{createHash}from'node:crypto';
const dir=path.dirname(fileURLToPath(import.meta.url)),parent=path.dirname(dir);
const catalog=JSON.parse(fs.readFileSync(path.join(parent,'production-catalog.json'),'utf8'));
const entries=catalog.entries.filter(e=>e.wave>=61);
const originalGroups=catalog.groups.filter(g=>g.assetIds.every(id=>entries.some(e=>e.assetId===id)));
// Remaining neutral sheets share layout even when anatomies differ. Already
// generated groups stay unchanged so their request/prompt provenance is stable.
const mergedIds=new Set(['t8-reptile-01','t8-slither-01','t9-quad-01','t9-slither-01','t10-slither-01','t10-float-01']);
const groups=[...originalGroups.filter(g=>!mergedIds.has(g.id)),
 {id:'t8-t9-mixed-01',assetIds:['w071','w077','w082','w084']},
 {id:'t10-mixed-01',assetIds:['w091','w092','w098']}];
const styleReference=path.join(parent,'forest-quad-01-turnaround.png');
const style='STYLE: Hand-painted fantasy tower-defense character art, chunky readable game proportions, expressive but composed faces, crisp dark contours, soft painterly shading, broad visible midtones. The provided forest creature sheet is a STYLE/CAMERA reference only; do not copy its animals, costumes, arrangement or square aspect ratio. These are NEW explicitly described creatures. Intact complete bodies, clean rounded bones where relevant. No gore, blood, wounds, rot, exposed tissue, grotesque anatomy, huge horror teeth, realistic horror, photographs or pixel art. True transparent background if possible. No text, labels, numerals, grid lines, floor, pedestal, scenery, cast shadows or drawn checkerboard. Generous empty gutters between every figure.';
fs.mkdirSync(path.join(dir,'prompts'),{recursive:true});
const jobs=groups.map(g=>{
 const rows=g.assetIds.map(id=>entries.find(e=>e.assetId===id)),count=rows.length;
 const ratio=count>=3?'TALL PORTRAIT 1:2 aspect ratio':count===2?'TALL PORTRAIT 2:3 aspect ratio':'LANDSCAPE 2:1 aspect ratio';
 const layout=`Create ONE ${ratio} character TURNAROUND ATLAS, largest supported resolution. Exactly ${count} horizontal ROWS and exactly THREE COLUMNS. ${count*3} complete figures total. Columns in this exact left-to-right order: RIGHT-facing pure lateral SIDE profile; TRUE FRONT looking toward viewer (screen-down travel); TRUE BACK facing away (screen-up travel), showing back of head, no visible face/eyes. All are the SAME camera elevation, slightly elevated 15 degrees. No additional angles, inset portraits or walk poses. Every row is one unique character shown in its three views, with identical costume, colors, proportions and equipment. Full intact neutral standing body, legs naturally extended rather than crouching; for fliers use neutral wings half-open and tucked feet. Camera projection must be consistent, the front/rear are not mirrored 3/4 views. Entire body and accessories fit fully within its cell, occupying about 80% cell height. All three views on each row have the same body/head size, ground baseline and relative proportions. Do not crop toes, horns, weapon tips, tails or wings.`;
 const descriptions=rows.map((e,i)=>`ROW ${i+1}, character ${e.assetId}, ONLY this exact design: ${e.description}${e.gait==='biped'?' Natural upright anatomy with visibly extended legs, clear knees and ankles, no permanent squat. If wearing cape, coat or tabard, it ends above knees to keep legs clear.':''}${e.gait==='quad'?' Horizontal full quadruped trunk from shoulder through pelvis, four complete natural legs with anatomical shoulder/hip roots, clear hocks where appropriate; never a front bust with legs glued to chest.':''}`).join('\n');
 const prompt=layout+'\n'+style+'\n'+descriptions+'\nDo not add extra characters or reuse a different row\'s anatomy. The three views of each row must depict one coherent complete character.';
 const id=g.id+'-turnaround';fs.writeFileSync(path.join(dir,'prompts',id+'.txt'),prompt+'\n');
 return{id,groupId:g.id,stage:'turnaround',assetIds:g.assetIds,rows:count,requestedAspect:ratio,prompt,promptFile:'prompts/'+id+'.txt',reference:styleReference.replaceAll('\\','/'),referenceSha256:createHash('sha256').update(fs.readFileSync(styleReference)).digest('hex')};
});
fs.writeFileSync(path.join(dir,'jobs.json'),JSON.stringify({owner:'art_direction',waveRange:[61,101],entries:entries.length,roles:entries.reduce((o,e)=>(o[e.role]=(o[e.role]||0)+1,o),{}),jobs},null,2)+'\n');
console.log(JSON.stringify({entries:entries.length,groups:jobs.length,jobs:jobs.map(j=>({id:j.id,assetIds:j.assetIds,rows:j.rows}))},null,2));
