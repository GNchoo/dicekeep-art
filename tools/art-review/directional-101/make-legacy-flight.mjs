import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadRaw} from '../../lib/sheet.mjs';import {extractPart} from '../../rig-walk.mjs';import {sha256} from '../../lib/directional-rig.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(dir,'../../..'),source='tools/art-review/directional-101/legacy-flight-front-back-parts.png';
const raw=await loadRaw(path.join(repo,source),{background:'checkerboard'}),sha=sha256(fs.readFileSync(path.join(repo,source)));
const entries=[];
for(const wave of [4,8]){
 const e={assetId:'w00'+wave,wave,role:'normal',locomotion:'flight',cell:256,referenceHeight:wave===4?328:288,cycleStride:0,cycleSeconds:.8,reviewApproved:false,views:{}};
 const sheet='casual/enemies/inf/w00'+wave+'-walk-2x2.png';
 e.views.side={pivot:wave===4?[255.5,420]:[256,400],legacySheet:{reviewedExisting:true,source:sheet,sourceSha256:sha256(fs.readFileSync(path.join(repo,sheet))),cols:2,rows:2,frames:4,anchor:'center',stillFrame:0}};
 for(const name of ['front','back']){
  const row=wave===4?(name==='front'?[0,.275]:[.525,.76]):name==='front'?[.275,.525]:[.76,1];
  const cols=wave===4?[[0,.36],[.38,.65],[.69,1]]:[[0,.42],[.43,.66],[.70,1]];
  const rois=cols.map(([x,end])=>[x,row[0],end-x,row[1]-row[0]]);
  const cut=[];for(let k=0;k<3;k++)cut.push(await extractPart(raw,rois[k],e.assetId+' '+name+' '+k,{componentCount:k===0&&wave===8?3:1}));
  console.log(e.assetId,name,cut.map(p=>[p.width,p.height,p.sourceBounds,p.componentAreas]));
  const h=wave===4?205:170,bw=h*cut[0].width/cut[0].height,top=wave===4?185:200;
  const body={roi:rois[0],target:[256-bw/2,top,bw,h],layer:0,...(wave===8?{componentCount:3}:{})};
  const parts=[];
  const add=(tag,l,r,y,height)=>{for(const left of [true,false]){const k=left?1:2;parts.push({id:tag+(left?'LeftWing':'RightWing'),type:'wing',roi:rois[k],socket:[bw*(left?l:r),h*y],sourcePivot:wave===4?(left?[.88,.76]:[.12,.76]):(left?[.94,.96]:[.06,.96]),scale:height/cut[k].height,angleDeg:left?[-25,45]:[25,-45],phase:0,layer:-1});}};
  if(wave===4)add('raven',.18,.82,.25,185);else{add('leader',.35,.67,.25,145);add('followerLow',.075,.19,.70,58);add('followerHigh',.815,.945,.14,58);}
  e.views[name]={source,sourceSha256:sha,background:'checkerboard',pivot:wave===4?[255.5,420]:[256,400],body,parts};
 }
 entries.push(e);
}
fs.writeFileSync(path.join(dir,'legacy-flight-rigs.json'),JSON.stringify({version:1,canonicalCell:512,assetVersion:93,entries},null,2)+'\n');
