import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const dir=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(dir,'../../../..');
const original=JSON.parse(fs.readFileSync(path.join(repo,'tools/art-review/directional-101/legacy-flight-rigs.json'),'utf8'));
const entry=structuredClone(original.entries.find(e=>e.assetId==='w004'));
if(!entry||entry.locomotion!=='flight')throw new Error('reviewed W004 flight rig missing');
entry.reviewApproved=true;
const approvedAtlasSha={
  side:'15179a50589f1184a103479208dafe7de49f34e59060cc9410e47449ae722f8f',
  front:'5c659895df953d29d93d4d697a510010be028847a60ed4a3ed0fb41d7c7dd865',
  back:'dd7828de277cea5f9491bf779a0fc36a02de8daa7b4859c5fcfc8901fe6e3d71',
};
const roi=([x,y,w,h],margin=9)=>[(x-margin)/2048,(y-margin)/1200,(w+margin*2)/2048,(h+margin*2)/1200];
const sockets={side:[[.43,.22],[.53,.22]],front:[[.13,.29],[.87,.29]],back:[[.13,.29],[.87,.29]]};
for(const name of ['side','front','back']){
  const source=`tools/art-review/enemy-casual-2026-09-23/w004/w004-${name}-puppet-casual-atlas.png`;
  const file=path.join(repo,source),sourceSha256=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if(sourceSha256!==approvedAtlasSha[name])throw new Error(`${name}: atlas differs from visually reviewed W004 pixels`);
  const packed=JSON.parse(fs.readFileSync(file.replace(/\.png$/,'.components.json'),'utf8'));
  const [body,upper,lower]=packed.pieces.map(p=>p.outputBounds);
  const upperHeight=packed.pieces[1].outputBounds[3],lowerHeight=packed.pieces[2].outputBounds[3];
  entry.views[name]={source,sourceSha256,background:'alpha',pivot:[255.5,420],assetVersion:128,
    body:{roi:roi(body,14),target:{height:205,top:185,centerX:256},layer:0},
    parts:[
      {id:'ravenLeftWing',type:'wing',roi:roi(lower),socketNormalized:sockets[name][0],sourcePivot:[.94,.72],scale:145/lowerHeight,angleDeg:[-6,43],phase:0,layer:-1},
      {id:'ravenRightWing',type:'wing',roi:roi(upper),socketNormalized:sockets[name][1],sourcePivot:[.06,.72],scale:145/upperHeight,angleDeg:[6,-43],phase:0,layer:-1},
    ]};
}
entry.reviewNotes='W004 raven scout in clean flat-cel style; amber eye, brown harness and lantern preserved; separate two-wing flight in three views.';
fs.writeFileSync(path.join(dir,'w004-directional-rig.json'),JSON.stringify({version:1,canonicalCell:512,assetVersion:93,entries:[entry]},null,2)+'\n');
console.log('wrote W004 rig');
