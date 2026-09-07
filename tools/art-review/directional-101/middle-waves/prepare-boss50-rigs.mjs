import fs from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {loadRaw} from '../../../lib/sheet.mjs';
import {extractPart} from '../../../rig-walk.mjs';
import {dir,measuredView,newBiped} from './biped-config-lib.mjs';
// Measured against the selected body/limb originals. Review approval is separate.
const config={version:1,canonicalCell:512,assetVersion:93,entries:[]};
for(let row=0;row<2;row++){
 const e=newBiped(50);e.assetId=row?'b050-2':'b050';e.role=row?'secondary':'boss';e.cell=512;
 e.views.side=measuredView('t5-boss-01-side-parts',row,{name:'side',sockets:row?[[.59,.62],[.76,.62]]:[[.48,.81],[.63,.81]],kneeY:row?.4:.45,ankleY:row?.8:.85});
 e.views.front=measuredView('t5-boss-01-front-parts-clean',row,{name:'front',sockets:row?[[.61,.65],[.39,.65]]:[[.63,.81],[.38,.81]],kneeY:row?.4:.45,ankleY:row?.75:.85});
 // Front atlas is screen-left, screen-right. Physical left appears screen-right.
 const frontSources=e.views.front.parts.map(p=>({roi:p.roi,sourceJoints:p.sourceJoints}));
 e.views.front.parts.forEach((p,i)=>Object.assign(p,frontSources[1-i]));
 e.views.front.jointReview+=' Front limb source columns swapped to retain outward boot/toe orientation for physical left/right.';
 e.views.back=measuredView('t5-boss-01-back-parts-clean',row,{name:'back',sockets:row?[[.39,.69],[.61,.69]]:[[.29,.83],[.46,.83]],kneeY:row?.4:.45,ankleY:row?.8:.85});
 config.entries.push(e);
}
const corrected='tools/art-review/directional-101/boss50-back-golem-correction.png';
if(fs.existsSync(corrected)){
 const raw=await loadRaw(corrected,{background:'checkerboard'}),rois=[[0,.5,.43,.5],[.44,.5,.23,.5],[.74,.5,.24,.5]],measure=[];
 for(let i=0;i<3;i++){
  const p=await extractPart(raw,rois[i],'boss50-back-corrected-'+i),{data,info}=await sharp(Buffer.from(p.image.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const ys=[.1,.36,.77,.995],joints=Object.fromEntries(ys.map((y,j)=>{const yy=Math.floor(y*(info.height-1)),xs=[];for(let x=0;x<info.width;x++)if(data[(yy*info.width+x)*4+3]>150)xs.push(x);return[['hip','knee','ankle','sole'][j],[(xs[0]+xs.at(-1))/2/info.width,y]];}));
  measure.push({roi:rois[i],width:p.width,height:p.height,sourceBounds:p.sourceBounds,sourceJoints:joints});
 }
 const v=config.entries[1].views.back;v.source=corrected;v.sourceSha256=createHash('sha256').update(fs.readFileSync(corrected)).digest('hex');v.body.roi=measure[0].roi;
 v.body.target.centerX=256;v.parts.forEach((p,i)=>{p.roi=measure[i+1].roi;p.sourceJoints=measure[i+1].sourceJoints;});
 v.jointReview='Targeted generated rear correction: closed brass cannon breeches, wide square stone heel boots; measured hip .1, rear knee hinge .36, ankle hinge .77, sole .995. Each x uses its own opaque source band. Fixed texture aspect and scale across all poses.';
 fs.writeFileSync(dir+'/boss50-back-measurements.json',JSON.stringify({source:corrected,sha256:v.sourceSha256,parts:measure},null,2)+'\n');
}
const sideCorrected='tools/art-review/directional-101/boss50-side-cannon-correction.png';
if(fs.existsSync(sideCorrected)){
 const raw=await loadRaw(sideCorrected,{background:'checkerboard'}),roi=[0,.5,.43,.5],body=await extractPart(raw,roi,'boss50-side-cannon-corrected'),v=config.entries[1].views.side;
 v.body.source=sideCorrected;v.body.sourceSha256=createHash('sha256').update(fs.readFileSync(sideCorrected)).digest('hex');v.body.background='checkerboard';v.body.roi=roi;
 v.body.target.centerX=256-(.635-.5)*body.width/body.height*300;
 v.parts.forEach((p,i)=>{p.socketNormalized=[i?.71:.56,.62];p.socketRoiNormalized=[p.socketNormalized[0]-.06,.56,.12,.12];});
 v.jointReview+=' Selected source-pinned side torso correction turns cannon forward/right with closed left breech. Existing leg textures preserved. Sockets remeasured against the changed torso bounds.';
}
fs.writeFileSync(dir+'/t5-boss-01-rigs.json',JSON.stringify(config,null,2)+'\n');
