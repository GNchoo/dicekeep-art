import fs from 'node:fs';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {loadRaw} from '../../../lib/sheet.mjs';
import {extractPart} from '../../../rig-walk.mjs';
const dir='tools/art-review/directional-101/middle-waves',config={version:1,canonicalCell:512,assetVersion:93,entries:[]};
const specifications=[
 {wave:43,height:425,stride:130,ground:460,views:{
  side:{height:300,top:25,sockets:[[.75,.79],[.75,.80],[.31,.77],[.31,.78]]},
  front:{height:300,top:25,sockets:[[.66,.83],[.34,.83],[.66,.74],[.34,.74]]},
  back:{height:330,top:25,sockets:[[.32,.57],[.68,.57],[.32,.72],[.68,.72]]}}},
 {wave:54,height:350,stride:100,ground:430,views:{
  side:{height:200,top:120,sockets:[[.66,.77],[.66,.78],[.27,.77],[.27,.78]]},
  front:{height:230,top:85,sockets:[[.65,.77],[.35,.77],[.65,.66],[.35,.66]]},
  back:{height:300,top:70,sockets:[[.32,.44],[.68,.44],[.32,.75],[.68,.75]]}}},
];
for(const [row,s]of specifications.entries()){
 const e={assetId:'w'+String(s.wave).padStart(3,'0'),wave:s.wave,role:'normal',locomotion:'legged',cell:256,referenceHeight:s.height,cycleStride:s.stride,reviewApproved:false,gait:{stanceDuty:.65,lift:16,pelvis:'fixed'},views:{}};
 for(const name of ['side','front','back']){
  const atlas='horse-puppy-'+name+'-parts-clean',source=dir+'/'+atlas+'.png',m=JSON.parse(fs.readFileSync(dir+'/measurements/'+atlas+'.json')).filter(p=>p.row===row),body=m.find(p=>p.col===0),spec=s.views[name],seeds=name==='side'&&row===0?[[500,272],[524,299]]:[],raw=await loadRaw(source,{background:'checkerboard',backgroundSeeds:seeds}),jointSets=[];
  for(let limb=0;limb<2;limb++){
   const region=m.find(p=>p.col===limb+1),part=await extractPart(raw,region.roi,e.assetId+'-'+name+'-'+limb),{data,info}=await sharp(Buffer.from(part.image.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   const ys=row===0?[.1,.57,.88,.995]:[.1,limb?.52:.49,limb?.84:.82,.995];
   jointSets.push(Object.fromEntries(ys.map((y,i)=>{const yy=Math.floor(y*(info.height-1)),xs=[];for(let x=0;x<info.width;x++)if(data[(yy*info.width+x)*4+3]>150)xs.push(x);if(!xs.length)throw Error('Empty joint band '+e.assetId+' '+name);return[['hip','knee','ankle','sole'][i],[(xs[0]+xs.at(-1))/2/info.width,y]];})));
  }
  const parts=['leftFore','rightFore','leftHind','rightHind'].map((id,i)=>{
   const hind=i>=2,near=name==='side'?i%2===1:name==='front'?!hind:hind,socket=spec.sockets[i];
   return{id,type:'leg',roi:m.find(p=>p.col===(hind?2:1)).roi,sourceJoints:jointSets[hind?1:0],socketNormalized:socket,socketRoiNormalized:[socket[0]-.055,socket[1]-.055,.11,.11],calibrate:{groundY:s.ground,maximumStanceAngle:166},phase:[.75,.25,0,.5][i],layer:near?1:-1,upperLayer:-3,bend:hind?-1:1,proximalFeather:.18,proximalEdgeFeather:.09,...(name==='front'&&i%2===0?{flipX:true}:{})};
  });
  const mean=spec.sockets.reduce((n,p)=>n+p[0],0)/4;
  e.views[name]={source,sourceSha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),background:'checkerboard',...(seeds.length?{backgroundSeeds:seeds}:{}),pivot:[256,s.ground],body:{roi:body.roi,target:{height:spec.height,top:spec.top,centerX:256-(mean-.5)*body.width/body.height*spec.height},layer:10},parts,jointReview:'Four physical horse/canine limbs with fore/hind texture columns and fixed 0/.25/.5/.75 phases. Rider boots remain part of mounted upper body. Measured original opaque cuff/knee/ankle/sole bands; front left limb textures reflect with their landmarks. Raw source hashes and original aspect retained.'};
 }
 config.entries.push(e);
}
fs.writeFileSync(dir+'/quads43-54-rigs.json',JSON.stringify(config,null,2)+'\n');
