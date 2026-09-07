import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadRaw} from '../../lib/sheet.mjs';import {extractPart} from '../../rig-walk.mjs';import {sha256} from '../../lib/directional-rig.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(dir,'../../..'),base='tools/art-review/directional-101/',sources={};
for(const id of ['t3-arthropod-01-side-parts','t3-arthropod-01-front-back-parts','swamp-back-body-correction']){const source=base+id+'.png';sources[id]={source,sourceSha256:sha256(fs.readFileSync(path.join(repo,source))),raw:await loadRaw(path.join(repo,source),{background:'checkerboard'})};}
const entries=[];
for(const [row,wave] of [25,26,28].entries()){
 const count=wave===28?3:4,e={assetId:'w0'+wave,wave,role:'normal',locomotion:'legged',anatomy:'arthropod',cell:256,referenceHeight:350,cycleStride:80,reviewApproved:false,gait:{stanceDuty:.65,lift:13,pelvis:'fixed'},views:{}};
 for(const name of ['side','front','back']){
  const src=sources[name==='side'?'t3-arthropod-01-side-parts':'t3-arthropod-01-front-back-parts'],r=[[0,.333],[.333,.665],[.665,1]][row];
  const cols=name==='side'?[[0,.44],[.445,.67],[.70,1]]:name==='front'?[[0,.225],[.24,.33],[.34,.49]]:[[.51,.70],[.72,.80],[.84,1]];
  const rois=cols.map(([a,b])=>[a,r[0],b-a,r[1]-r[0]]),cuts=[];for(let k=0;k<3;k++)cuts.push(await extractPart(src.raw,rois[k],e.assetId+' '+name+' '+k));
  let bodySource=null,bodyRoi=rois[0],bodyPart=cuts[0];
  if(name==='back'){bodySource=sources['swamp-back-body-correction'];const br=[[0,.255],[.255,.505],[.505,.755]][row];bodyRoi=[0,br[0],1,br[1]-br[0]];bodyPart=await extractPart(bodySource.raw,bodyRoi,e.assetId+' genuine rear body');}
  const h=wave===26?(name==='side'?285:290):name==='side'?180:205,top=wave===26?100:165,bw=h*bodyPart.width/bodyPart.height;
  const body={roi:bodyRoi,target:[256-bw/2,top,bw,h],layer:10};if(bodySource)Object.assign(body,{source:bodySource.source,sourceSha256:bodySource.sourceSha256,background:'checkerboard'});
  const parts=[];
  // Cylindrical carapace legs in the front atlas have a continuous downward
  // hip/knee/ankle axis; the rejected side leg root folds above its hip.
  const legSrc=name==='side'?sources['t3-arthropod-01-front-back-parts']:src;
  const sideLegRoi=[.34,r[0],.15,r[1]-r[0]];
  if(name==='side')Object.assign(body,{source:src.source,sourceSha256:src.sourceSha256,background:'checkerboard'});
  for(let i=0;i<count;i++)for(const left of [true,false]){
   const screenRight=name==='front'?left:!left,k=name==='side'?1:2;
   let u,v,ground;
   if(name==='side'){u=(wave===25?.86:wave===26?.65:.70)-i*(wave===25?.07:.12);v=(wave===26?.63:.79)-i*.035;ground=430-(left?5:0);}
   else{const depth=i/(count-1);u=screenRight?.67:.33;v=name==='front'?.85-depth*.20:.23+depth*.35;ground=name==='front'?435-depth*24:405+depth*30;}
   const sx=bw*u,sy=h*v,spread=name==='side'?.50-i/(count-1):((screenRight?1:-1)*(.43+i*.06)),axis=[spread,Math.sqrt(1-spread*spread)];
   const joints={hip:[.15,.08],knee:[.62,.41],ankle:[.90,.82],sole:[.93,.998]};
   parts.push({id:(left?'leftLeg':'rightLeg')+(i+1),type:'leg',roi:name==='side'?sideLegRoi:rois[k],sourceJoints:joints,flipX:name!=='side'&&!screenRight,socket:[sx,sy],socketRoi:[sx-13,sy-13,26,26],heightAxis:axis,calibrate:{groundY:ground,maximumStanceAngle:166},phase:(i/count+(left?0:.5))%1,layer:name==='side'?(left?-1:2):name==='front'?3-i:i,upperLayer:-5,proximalFeather:.18,proximalEdgeFeather:.08,bend:1});
  }
  e.views[name]={source:legSrc.source,sourceSha256:legSrc.sourceSha256,background:'checkerboard',pivot:[256,430],body,parts};console.log(e.assetId,name,cuts.map(c=>c.sourceBounds));
 }
 entries.push(e);
}
fs.writeFileSync(path.join(dir,'swamp-arthropod-rigs.json'),JSON.stringify({version:1,canonicalCell:512,assetVersion:93,entries},null,2)+'\n');
