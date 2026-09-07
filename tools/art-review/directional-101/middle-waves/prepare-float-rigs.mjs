import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {loadRaw} from '../../../lib/sheet.mjs';import {extractPart} from '../../../rig-walk.mjs';
const dir='tools/art-review/directional-101/middle-waves';
const defs=[['w052',52,'normal','t6-float-01-turnaround-clean.png',0,480],['w059',59,'normal','t6-float-01-turnaround.png',480,1024],['b060',60,'boss','t6-boss-01-turnaround.png',0,550]];
const config={version:1,canonicalCell:512,assetVersion:93,entries:[]},measures=[];
for(const[id,wave,role,filename,y0,y1]of defs){
 const source=dir+'/'+filename,raw=await loadRaw(source,{background:'checkerboard'}),sourceSha256=createHash('sha256').update(fs.readFileSync(source)).digest('hex'),pieces=[];
 for(let i=0;i<3;i++){
  const roi=[i/3,y0/raw.H,1/3,(y1-y0)/raw.H],part=await extractPart(raw,roi,id+'-'+['side','front','back'][i]);
  fs.writeFileSync(dir+'/measurements/'+part.name+'.png',Buffer.from(part.image.split(',')[1],'base64'));pieces.push({roi,...part});
 }
 // One source-pixel scale across all three view crops. Translate each root to the same ground reference.
 const scale=Math.min(400/Math.max(...pieces.map(p=>p.height)),430/Math.max(...pieces.map(p=>p.width)));
 const entry={assetId:id,wave,role,locomotion:'float',cell:role==='normal'?256:512,referenceHeight:400,cycleStride:0,cycleSeconds:1.6,reviewApproved:false,hover:{lift:8,roll:1.1},views:{}};
 pieces.forEach((part,i)=>{
  const width=part.width*scale,height=part.height*scale;
  entry.views[['side','front','back'][i]]={source,sourceSha256,background:'checkerboard',pivot:[256,460],body:{roi:part.roi,target:[256-width/2,460-height,width,height],layer:10},parts:[],jointReview:'Explicit float locomotion. Common source pixel scale across three views, constant full-cell geometry. Root placed at reviewed lower cloth/flame end, no walking or wing claim.'};
  measures.push({assetId:id,view:['side','front','back'][i],roi:part.roi,bounds:part.sourceBounds,scale,target:entry.views[['side','front','back'][i]].body.target});
 });config.entries.push(entry);
}
fs.writeFileSync(dir+'/float-rigs.json',JSON.stringify(config,null,2)+'\n');fs.writeFileSync(dir+'/measurements/float-parts.json',JSON.stringify(measures,null,2)+'\n');console.log(JSON.stringify(measures));

