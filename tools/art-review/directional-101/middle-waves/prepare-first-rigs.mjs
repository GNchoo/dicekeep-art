import fs from 'node:fs';
import path from 'node:path';
const dir='tools/art-review/directional-101/middle-waves';
const file=dir+'/parts-jobs.json', jobs=JSON.parse(fs.readFileSync(file));
const id='t4-biped-01a-back-parts';
const prompt=`Use case: precise-object-edit. Reference1 is the original character identity turnaround; reference2 the corresponding separated torso and legs. Create ONE new isolated parts atlas, exactly TWO equal horizontal rows, THREE component columns, landscape1536x1024. Only the hooded goblin scout and shield goblin guard. TRUE BACK VIEW: back of head and clothing visible, faces hidden, boot heels face viewer. Slightly elevated game camera, same proportions, costume, rounded hand-painted fantasy game style as references. No walking sequence. Row1 hooded leather goblin scout with rolled map and dagger. Row2 green goblin guard with wooden shield and iron mace. Every row: LEFT50% complete head/torso/arms/equipment with BOTH LEGS REMOVED at hips. Body ends in CLOSED SOLID PAINTED SHORTS underneath short coat hem: no hollow tube, black interior, exposed cut or limb stubs. MIDDLE22% one complete physical LEFT leg, RIGHT22% one complete physical RIGHT leg. In back view physical left attaches screen-left; right attaches screen-right. Legs nearly straight vertical from upper thigh through knee and ankle to complete boot with heel visible. Single connected painted piece, same length and width. Keep top thigh cuff solid without dark hollow opening. Both boots face AWAY into image; no front toes or profile. Maintain same source scale for both body and limbs, head-to-hip body about1.4x leg length. Generous completely empty gutters between all parts/rows. All art fully inside its region. No words, labels, grid, extra pets, bat, floor, scenery, shadows, fragments. Genuine transparent alpha background, not painted checkerboard. Clean friendly game characters with no gore or photorealistic horror.`;
if(!jobs.some(j=>j.id===id))jobs.push({id,kind:'parts',assetIds:['w031','w033'],rows:[{assetId:'w031',view:'back'},{assetId:'w033',view:'back'}],references:['t4-biped-01-turnaround.png','t4-biped-01a-side-front-parts-clean.png'],prompt});
fs.writeFileSync(file,JSON.stringify(jobs,null,2)+'\n');fs.writeFileSync(dir+'/prompts/'+id+'.txt',prompt+'\n');
const measurement=JSON.parse(fs.readFileSync(dir+'/measurements/first-parts.json'));
const source=dir+'/t4-biped-01a-side-front-parts-clean.png';
const sourceSha256='21590a166e00074e0759362bcbb3009fbb62cc6aefaa0f6bcfa3f73e29d97976';
const config={version:1,canonicalCell:512,assetVersion:93,entries:[]};
const joints=[[[.555,.10],[.45,.50],[.375,.80],[.60,.995]],[[.399,.10],[.548,.50],[.632,.80],[.421,.995]],[[.510,.10],[.454,.50],[.403,.85],[.429,.995]],[[.480,.10],[.526,.50],[.571,.85],[.556,.995]],[[.549,.10],[.491,.50],[.416,.80],[.566,.995]],[[.483,.10],[.534,.50],[.591,.80],[.401,.995]],[[.554,.10],[.473,.50],[.392,.80],[.577,.995]],[[.463,.10],[.532,.50],[.606,.80],[.367,.995]]];
for(let species=0;species<2;species++){
 const entry={assetId:species?'w033':'w031',wave:species?33:31,role:'normal',locomotion:'legged',cell:256,referenceHeight:425,cycleStride:160,reviewApproved:false,gait:{stanceDuty:.5,lift:25,pelvis:'support'},views:{}};
 for(let v=0;v<2;v++){
  const row=species*2+v, name=v?'front':'side', body=measurement[row*3];
  const sockets= v? (species?[[.62,.78],[.35,.78]]:[[.57,.83],[.35,.83]]) : [[.42,.80],[.56,.80]];
  entry.views[name]={source,sourceSha256,background:'checkerboard',pivot:[256,460],body:{roi:body.roi,target:{height:300,top:35,centerX:256},layer:10},parts:[0,1].map(i=>({id:i?'rightLeg':'leftLeg',type:'leg',roi:measurement[row*3+1+i].roi,sourceJoints:Object.fromEntries(['hip','knee','ankle','sole'].map((n,k)=>[n,joints[row*2+i][k]])),...(v===0&&i===1?{flipX:true}:{}),socketNormalized:sockets[i],socketRoiNormalized:[sockets[i][0]-.06,sockets[i][1]-.06,.12,.12],calibrate:{groundY:460,maximumStanceAngle:168},phase:i*.5,layer:i?1:-2,upperLayer:-3,bend:1,proximalFeather:.18,proximalEdgeFeather:.09})),jointReview:'Original source joint centers individually measured at hip cuff, knee center and boot ankle. Side rightLeg artwork faces left and uses reviewed flipX, preserving physical identity. Partial pilot awaits back view and visual approval.'};
 }
 config.entries.push(entry);
}
fs.writeFileSync(dir+'/t4-biped-01a-rigs.json',JSON.stringify(config,null,2)+'\n');
