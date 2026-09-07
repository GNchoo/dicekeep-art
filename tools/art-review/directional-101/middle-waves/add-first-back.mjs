import fs from 'node:fs';import {createHash} from 'node:crypto';import sharp from 'sharp';import {loadRaw} from '../../../lib/sheet.mjs';import {extractPart} from '../../../rig-walk.mjs';
const dir='tools/art-review/directional-101/middle-waves',source=dir+'/t4-biped-01a-back-parts-clean.png',raw=await loadRaw(source,{background:'checkerboard'}),sourceSha256=createHash('sha256').update(fs.readFileSync(source)).digest('hex');
const cfg=JSON.parse(fs.readFileSync(dir+'/t4-biped-01a-rigs.json')),measure=[];
for(let row=0;row<2;row++){
 const rois=[[0,row*.5,.44,.5],[.48,row*.5,.19,.5],[.77,row*.5,.20,.5]],parts=[];
 for(let i=0;i<3;i++){const p=await extractPart(raw,rois[i],'back-row'+row+'-part'+i);fs.writeFileSync(dir+'/measurements/'+p.name+'.png',Buffer.from(p.image.split(',')[1],'base64'));parts.push(p);}
 const sockets=row?[[.39,.81],[.58,.81]]:[[.36,.83],[.61,.83]],legs=[];
 for(let i=0;i<2;i++){
  const p=parts[i+1],{data,info}=await sharp(Buffer.from(p.image.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true}),ys=[.1,.51,.82,.995],joints={};
  ys.forEach((y,k)=>{const Y=Math.floor((info.height-1)*y),xs=[];for(let x=0;x<info.width;x++)if(data[(Y*info.width+x)*4+3]>150)xs.push(x);if(!xs.length)throw Error('joint row empty');joints[['hip','knee','ankle','sole'][k]]=[(xs[0]+xs.at(-1))/2/info.width,y];});
  legs.push({id:i?'rightLeg':'leftLeg',type:'leg',roi:rois[i+1],sourceJoints:joints,socketNormalized:sockets[i],socketRoiNormalized:[sockets[i][0]-.06,sockets[i][1]-.06,.12,.12],calibrate:{groundY:460,maximumStanceAngle:168},phase:i*.5,layer:i?1:-2,upperLayer:-3,bend:1,proximalFeather:.18,proximalEdgeFeather:.09});
  measure.push({assetId:cfg.entries[row].assetId,part:legs.at(-1).id,roi:rois[i+1],bounds:p.sourceBounds,joints});
 }
 cfg.entries[row].views.back={source,sourceSha256,background:'checkerboard',pivot:[256,460],body:{roi:rois[0],target:{height:300,top:35,centerX:256},layer:10},parts:legs,jointReview:'Back artwork reviewed for heel rear seam and consistent plain leather cuff; x centers measured on each individual cuff/knee/ankle/sole row. Physical left is screen-left. No reused front-facing boots.'};
}
fs.writeFileSync(dir+'/t4-biped-01a-rigs.json',JSON.stringify(cfg,null,2)+'\n');fs.writeFileSync(dir+'/measurements/back-first-parts.json',JSON.stringify(measure,null,2)+'\n');console.log(JSON.stringify(measure));
