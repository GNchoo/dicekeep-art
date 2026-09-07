import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const dir=path.dirname(fileURLToPath(import.meta.url));
const entries=JSON.parse(fs.readFileSync(path.join(dir,'../production-catalog.json'))).entries;
const ledger=JSON.parse(fs.readFileSync(path.join(dir,'generation-ledger.json')));
const groups=[
 ['late-biped-01','biped',['w063','w065','w066','w069']],
 ['late-biped-02','biped',['w074','w075','w079','w081']],
 ['late-biped-03','biped',['w083','w086','w087','w089']],
 ['late-biped-04','biped',['w093','w094','w095','w097']],
 ['late-biped-05','biped',['w099','w101'],'all'],
 ['late-boss-biped-01','biped',['b090','b090-2']],
 ['late-boss-biped-02','biped',['b100'],'all'],
 ['late-quad-01','quad',['w067','w071','w073','w078']],
 ['late-quad-02','quad',['w082','b080-2']],
 ['late-flight-01','flight',['w062','w064','w068','w096']],
 ['late-flight-02','flight',['w072','w076','w088']],
 ['late-boss-flight-01','flight',['b080','b100-2']],
 ['late-slither-01','slither',['w077','w084','w091','w098']]
];
const camera={side:'PURE RIGHT-facing SIDE PROFILE. Face, body and toes point to the RIGHT edge. No left-facing body and no 3/4 view. The physical left limb is far, right limb is near.',front:'TRUE FRONT facing viewer. Centered bilateral symmetric body, face/ears equal size, no visible side flank. Toes point toward viewer. Physical left limb attaches screen-right; right limb screen-left.',back:'TRUE BACK facing directly away. Centered spine, back of head, no eyes or face, no side flank. Heels face viewer, toes point away. Physical left limb attaches screen-left; right limb screen-right.'};
const common='Match the referenced identities exactly: chunky readable hand-painted fantasy GAME characters, calm expressive faces, soft painterly shading and clean dark outlines. No photorealism, pixel art, gore, wounds, blood, rotten flesh, huge horror teeth or grotesque anatomy. Components are clean animation cutouts, not severed anatomy. No text, labels, grid lines, floors, ground shadows, scenery, extra components or drawn checkerboard. True transparent background if possible. Keep every component fully isolated with wide blank gutters; no item crosses any cell boundary. Same 15-degree elevated game camera in all views. Do not generate assembled characters or animation frames.';
const structure={
 biped:'THREE COMPONENTS per view: (1) complete head, arms, torso and held equipment with BOTH LEGS REMOVED precisely at the hips; no attached thigh/boot stumps. Shorten ALL coats, capes, skirts and tabards so the hem ends ABOVE THE KNEES, including in BACK view. Preserve an intact closed painted pelvis with natural rounded sockets, never an empty hole. (2) one complete physical LEFT leg from rounded upper-thigh overlap root through knee and ankle to the entire boot/hoof/foot. (3) one complete physical RIGHT leg, same natural length and width. Each leg is ONE connected piece in a nearly straight neutral standing posture, not bent into a squat. Full leg length must plausibly match the torso. Keep the root rounded and textured for smooth overlap.',
 quad:'THREE COMPONENTS per view: (1) head, neck, complete HORIZONTAL QUADRUPED torso from shoulders through full rump, costume and exactly one tail, with ALL FOUR LEGS REMOVED at their anatomical roots. Keep the full furry/scaled flank, visible shoulder and wide pelvis; never a human upright bust or front-only chest. Closed natural painted underside, no holes/stumps. (2) one complete FORELEG with a rounded shoulder root, elbow, ankle and full paw/hoof, in nearly straight neutral stance. (3) one complete HINDLEG with a wide rounded haunch root, natural forward knee then hock, ankle and full paw/hoof. Do not mistake hock for knee or make a second foreleg. All parts share anatomical character scale and overlap texture. Front/back limbs must face directly front/back, not side.',
 flight:'THREE COMPONENTS per view: (1) full head, compact torso, collar/costume, tucked feet and tail with BOTH WINGS COMPLETELY REMOVED at shoulder roots. No closed wing feathers remain on body. No standing legs. (2) one complete physical LEFT wing with rounded shoulder root, broad fully visible membrane/feather/page fan, unfolded in a relaxed DOWNWARD diagonal from its root toward its outer tip. (3) one complete physical RIGHT wing of matching length and detail, also fully unfolded. Each wing must be ONE connected painted object, including all feather/page lobes. Fairy wings combine both lobes of that side into one connected wing root. Book has blank page fans, no writing. Wings must be generous enough to plausibly carry body, rooted at shoulders/spine. No extra feet, loose feathers or isolated wing fragment.',
 slither:'THREE COMPONENTS per view: (1) creature head and SHORT neck only (for the purple tentacle: magical basal curl with eye charm), remove the long trunk so it can be articulated; preserve exact identity. (2) ONE short straight body band/segment with intact painted overlap caps at BOTH ENDS, no head and no tip; vertically arranged top-to-bottom, length about 1.5 times width, may be reused twice in a chain. (3) ONE elongated tapering tail/tentacle tip, uncurled and nearly straight top-to-bottom, a smooth rounded connection root at TOP and finished narrow tip at BOTTOM. Keep all three components same trunk thickness and costume colors; no detached armor fragments. FRONT components show the front/underside marks; BACK shows dorsal/back markings, no eyes. These are intact magical/armored surfaces, no wounds or open cut flesh.'
};
const jobs=[];
for(const [id,family,assetIds,mode] of groups){
 const references=[...new Set(assetIds.map(a=>path.join(dir,ledger.requests.find(r=>r.stage==='turnaround'&&r.assetIds.includes(a)).source).replaceAll('\\','/')))];
 const refs=references.map((file,i)=>`REFERENCE ${i+1}: ${ledger.requests.find(r=>path.resolve(dir,r.source)===path.resolve(file)).assetIds.map((a,j)=>`row ${j+1} = ${a}`).join('; ')}.`).join('\n');
 for(const kind of mode==='all'?['all']:['side','front-back']){
  let layout,rows;
  if(kind==='all'){
   rows=assetIds.flatMap(assetId=>['side','front','back'].map(view=>({assetId,view})));
   layout=`Create ONE TALL PORTRAIT 1:2 rigging PARTS atlas, highest resolution. Exactly ${rows.length} equal horizontal ROWS and THREE separated COLUMNS. In each row, component1 at x0–48%, component2 x52–74%, component3 x78–99%.`;
  }else if(kind==='side'){
   rows=assetIds.map(assetId=>({assetId,view:'side'}));
   layout=`Create ONE ${assetIds.length>=3?'TALL PORTRAIT 1:2':'TALL PORTRAIT 2:3'} rigging PARTS atlas, highest resolution. Exactly ${rows.length} equal horizontal ROWS and THREE separated COLUMNS. Component1 x0–48%, component2 x52–74%, component3 x78–99%.`;
  }else{
   rows=assetIds.map(assetId=>({assetId,view:'front-back'}));
   layout=`Create ONE ${assetIds.length>=3?'SQUARE':'LANDSCAPE 3:2'} rigging PARTS atlas, highest resolution. Exactly ${rows.length} equal horizontal ROWS and SIX EQUAL separated COLUMNS. Each row is ONE creature: columns1/2/3 its FRONT component1/2/3; columns4/5/6 its BACK component1/2/3. Exactly ${rows.length*6} isolated components total. Equal-width columns with wide blank gutters.`;
  }
  const desc=rows.map((r,i)=>{const e=entries.find(e=>e.assetId===r.assetId);return`ROW ${i+1}: ${r.assetId}: ${e.description} ${r.view==='front-back'?'Columns1–3: '+camera.front+' Columns4–6: '+camera.back:camera[r.view]}`;}).join('\n');
  const prompt=[layout,common,structure[family],refs,desc,'Keep torso and limb scale coherent. The purpose is individually movable components; no assembled full characters anywhere.'].join('\n');
  const job={id:id+'-'+kind+'-parts',stage:'parts',family,assetIds,rows,layout:kind,references,referencesSha256:references.map(p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')),promptFile:'prompts/'+id+'-'+kind+'-parts.txt',prompt};
  fs.writeFileSync(path.join(dir,job.promptFile),prompt+'\n');jobs.push(job);
 }
}
fs.writeFileSync(path.join(dir,'parts-jobs.json'),JSON.stringify(jobs,null,2)+'\n');console.log(JSON.stringify(jobs.map(({id,assetIds})=>({id,assetIds})),null,2));
