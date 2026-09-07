import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadRaw} from '../../lib/sheet.mjs';import {extractPart} from '../../rig-walk.mjs';import {sha256} from '../../lib/directional-rig.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(dir,'../../..'),base='tools/art-review/directional-101/';
const sources={};for(const id of ['swamp-special-01-side-parts','swamp-special-01-front-back-parts','swamp-back-body-correction']){const source=base+id+'.png';sources[id]={source,sourceSha256:sha256(fs.readFileSync(path.join(repo,source))),raw:await loadRaw(path.join(repo,source),{background:'checkerboard'})};}
const entries=[];
for(const [row,wave] of [21,24,29].entries()){
 const e={assetId:'w0'+wave,wave,role:'normal',locomotion:wave===24?'flight':'slither',cell:256,referenceHeight:320,cycleStride:wave===24?0:140,cycleSeconds:.8,reviewApproved:false,views:{}};
 for(const name of ['side','front','back']){
  const src=sources[name==='side'?'swamp-special-01-side-parts':'swamp-special-01-front-back-parts'];
  const rows=name==='side'?[[0,.33],[.33,.66],[.66,1]]:[[0,.33],[.33,.64],[.64,1]],r=rows[row];
  const cols=name==='side'?[[0,.36],[.38,.65],[.68,1]]:name==='front'?[[0,.20],[.22,.36],[.36,.49]]:[[.50,.69],[.70,.82],[.83,1]];
  const rois=cols.map(([a,b])=>[a,r[0],b-a,r[1]-r[0]]);
  if(wave===29&&name==='front')rois[1]=[.70,r[0],.12,r[1]-r[0]]; // Trailing body shows dorsal scales above the raised face.
  const cut=[];for(let k=0;k<3;k++)cut.push(await extractPart(src.raw,rois[k],e.assetId+' '+name+' '+k));
  let head=cut[0],bodySource=null,bodyRoi=rois[0];
  if(wave===29&&name==='back'){bodySource=sources['swamp-back-body-correction'];bodyRoi=[0,.75,1,.25];head=await extractPart(bodySource.raw,bodyRoi,'snake rear corrected head');}
  const h=wave===24?(name==='side'?180:220):(name==='side'?110:110),top=wave===24?(name==='side'?195:180):name==='side'?285:name==='front'?295:120;
  const bw=h*head.width/head.height,cx=wave===24?256:name==='side'?365:256,body={roi:bodyRoi,target:[cx-bw/2,top,bw,h],layer:10};
  if(bodySource)Object.assign(body,{source:bodySource.source,sourceSha256:bodySource.sourceSha256,background:'checkerboard'});
  const parts=[];
  if(wave===24){for(const left of [true,false]){const k=left?1:2;parts.push({id:left?'leftWing':'rightWing',type:'wing',roi:rois[k],socket:[bw*(name==='side'?(left?.55:.68):(left?.34:.66)),h*.43],sourcePivot:left?[.94,.96]:[.06,.96],scale:175/cut[k].height,angleDeg:left?[-25,45]:[25,-45],phase:0,layer:0});}}
  else for(let i=0;i<3;i++){const k=i===2?2:1,height=i===2?120:135;parts.push({id:'segment'+(i+1),type:'segment',roi:rois[k],sourceJoints:{start:[.5,i===2?.2:.3],end:[.5,i===2?.85:.7]},socket:[bw*(name==='side'?.10:.5),h*(name==='side'?.85:name==='front'?.50:.88)],scale:height/cut[k].height,angleDeg:[name==='side'?180:name==='front'?-90:90,12],phase:i/3,layer:3-i});}
  e.views[name]={source:src.source,sourceSha256:src.sourceSha256,background:'checkerboard',pivot:[256,430],body,parts};
  console.log(e.assetId,name,cut.map(p=>p.sourceBounds));
 }
 entries.push(e);
}
fs.writeFileSync(path.join(dir,'swamp-special-rigs.json'),JSON.stringify({version:1,canonicalCell:512,assetVersion:93,entries},null,2)+'\n');
