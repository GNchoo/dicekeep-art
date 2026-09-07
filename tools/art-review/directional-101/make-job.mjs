import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const [groupId,stage='turnaround',view='side']=process.argv.slice(2);
const c=JSON.parse(fs.readFileSync(path.join(dir,'production-catalog.json'),'utf8'));
const custom={ 'forest-quad-02':['w014','w017','w018','w019'], 'forest-swamp-01':['w015','w022','w023','w027'], 'swamp-special-01':['w021','w024','w029'], 'early-boss-01':['b020','b020-2'], 'early-boss-02':['b030','b030-2'] };
const group=custom[groupId]?{id:groupId,assetIds:custom[groupId]}:c.groups.find(g=>g.id===groupId);
if(!group)throw new Error('Unknown group '+groupId);
const rows=group.assetIds.map(id=>c.entries.find(e=>e.assetId===id));
const id=group.id+'-'+(stage==='parts'?view+'-parts':stage);
const ratio=rows.length>=3?'TALL PORTRAIT 1:2 aspect ratio, requested1536x3072':rows.length===2?'TALL PORTRAIT 2:3 aspect ratio, requested2048x3072':'LANDSCAPE 2:1 aspect ratio, requested2400x1200';
const style='Hand-painted fantasy tower-defense game art, chunky readable proportions, expressive faces, crisp dark contours, soft painterly shading and broad midtones. Intact bodies, clean rounded bones for skeletons, no gore/blood/wounds/rot/exposed tissue/grotesque anatomy/photorealism. No text/labels/grids/scenery/floor/pedestal/shadows/checkerboard pattern. Genuine transparent background and generous EMPTY gutters. Same slightly elevated15degree camera throughout.';
const direction={side:'pure RIGHT-facing lateral profile',front:'TRUE FRONT facing viewer and moving screen DOWN, body recedes behind face and paws point toward viewer',back:'TRUE REAR facing away and moving screen UP, back of head/ears and rump, no face or eyes, rear paw heels face viewer'}[view];
function parts(e){
 let body='complete head+torso+tail+equipment';
 let a,b;
 if(e.locomotion==='flight'){
  body+=' with BOTH WINGS REMOVED; keep tucked feet and rider if present';
  a='one full LEFT wing extended at neutral midstroke, complete shoulder root and feathers or membrane';b='matching full RIGHT wing with clean shoulder root';
  if(e.family==='book'){body='complete book cover/spine/face with page wings removed';a='full LEFT fan of pages with broad hinge root';b='matching RIGHT page wing';}
  if(e.family==='glider'){body='pilot+harness+central wooden frame with outer cloth wings removed';a='full LEFT glider cloth wing and struts';b='matching RIGHT glider wing';}
 }else if(e.locomotion==='float'){
  body='intact head+upper torso+equipment/core with trailing lower cloth or energy removed';
  a='one long trailing cloth or energy appendage with substantial root';b='second matching trailing cloth or energy appendage';
 }else if(e.locomotion==='slither'){
  body='expressive HEAD plus SHORT neck root ONLY';
  a='one broad full BODY SEGMENT continuing head texture, smooth overlapping root/tip';b='one complete tapering TAIL SEGMENT; no open cross-sections';
 }else if(e.family==='glove'){
  body='full leather glove palm+cuff, all fingers removed cleanly';a='one full articulated long leather FINGER with three joints and round fingertip';b='one shorter full articulated THUMB; no human flesh';
 }else if(e.family==='arthropod'){
  body+=' with ALL walking legs removed, retain pincers/tail if specified';a='one connected articulated FRONT walking leg with three segments and foot';b='one connected articulated REAR walking leg; not separate fragments';
 }else if(e.gait==='quad'){
  body+=' with ALL FOUR LEGS REMOVED at shoulder/hip; retain rider if specified, no paws on body';
  a='one full FRONT LEG: rounded shoulder, elbow, wrist, complete paw/hoof, mostly extended neutral standing posture';
  b='one full HIND LEG: rounded thigh cap, knee/hock, complete paw/hoof, natural extended mammal or reptile anatomy';
 }else{
  body+=' with BOTH LEGS REMOVED at hips; no boots/paws on body. Coat/cape/tabard hem ends ABOVE KNEES';
  a='one full RIGHT LEG: rounded thigh cap, knee, ankle, full boot/paw/hoof, naturally EXTENDED standing posture, no permanent squat';
  b='one full LEFT LEG: same length/costume/thickness, entire hip-to-foot connected part, correct view projection';
 }
 return 'LEFT x0%-50%: ONE '+body+'. MIDDLE x54%-75%: '+a+'. RIGHT x79%-99%: '+b+'. All three isolated components, matching drawing scale. Intact painted surfaces beneath future sockets, no wounds/black holes. Never leave animated legs/wings attached to body. Parts are not tiny paw/wingtip fragments.';
}
const prefix='Use case: '+(stage==='parts'?'precise-object-edit':'stylized-concept')+'. Create ONE '+ratio+' atlas with exactly '+rows.length+' evenly spaced horizontal ROWS. ';
const layout=stage==='parts'?'Each row has THREE separated rigging components, all in '+direction+'. Reference turnaround fixes identity. This is not a walk-cycle sheet or complete-body lineup. ':
'THREE equal COLUMNS: RIGHT SIDE, FRONT toward screenDOWN, BACK toward screenUP. Same identity/costume/body scale across each row. Full intact neutral standing body with clear legs. '+(rows.some(e=>e.locomotion==='flight')?'Only the explicitly named flying creatures have wings, half-open. ':'No wings or extra flying creatures. ')+'Figures occupy80%height and fit completely in cells. Not an animation sequence. ';
const prompt=prefix+layout+style+'\n'+rows.map((e,i)=>'ROW '+(i+1)+' ONLY: '+e.description+(stage==='parts'?' '+parts(e):'')).join('\n')+'\nNo extra views, characters or inset pieces. Do not cross cell boundaries.';
fs.mkdirSync(path.join(dir,'prompts'),{recursive:true});
fs.writeFileSync(path.join(dir,'prompts',id+'.txt'),prompt+'\n');
console.log(JSON.stringify({id,stage,view,assetIds:group.assetIds,prompt,reference:group.id+'-turnaround.png'}));
