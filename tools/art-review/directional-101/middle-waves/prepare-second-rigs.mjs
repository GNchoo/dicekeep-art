import fs from 'node:fs';import{createHash}from'node:crypto';const d='tools/art-review/directional-101/middle-waves';
const source=d+'/t4-biped-01b-side-front-parts.png',m=JSON.parse(fs.readFileSync(d+'/measurements/t4-biped-01b-side-front-parts.json')),c={version:1,canonicalCell:512,assetVersion:93,entries:[]};
const sockets=[[[.36,.82],[.52,.82]],[[.66,.84],[.37,.84]],[[.38,.80],[.52,.80]],[[.65,.82],[.36,.82]]];
for(let k=0;k<2;k++){
 const e={assetId:'w0'+(34+k),wave:34+k,role:'normal',locomotion:'legged',cell:256,referenceHeight:425,cycleStride:160,reviewApproved:false,gait:{stanceDuty:.5,lift:25,pelvis:'support'},views:{}};
 for(let v=0;v<2;v++){
  const row=k*2+v,ys=[.1,k?.45:.4,v?.85:.8,.995];
  e.views[v?'front':'side']={source,sourceSha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),background:'checkerboard',pivot:[256,460],body:{roi:m[row*3].roi,target:{height:300,top:35,centerX:256},layer:10},parts:[0,1].map(i=>{const part=m[row*3+1+i],s=sockets[row][i];return{id:i?'rightLeg':'leftLeg',type:'leg',roi:part.roi,sourceJoints:Object.fromEntries(['hip','knee','ankle','sole'].map((n,j)=>[n,[part.bands.find(b=>b.y===ys[j]).center,ys[j]]])),socketNormalized:s,socketRoiNormalized:[s[0]-.06,s[1]-.06,.12,.12],calibrate:{groundY:460,maximumStanceAngle:168},phase:i*.5,layer:i?1:-2,upperLayer:-3,bend:1,proximalFeather:.18,proximalEdgeFeather:.09};}),jointReview:'Source knee at visible pants knee fold, W34 y.40, W35 y.45; ankle before rounded toe, each x independently measured. Both side toes authored right without mirroring.'};
 }c.entries.push(e);
}
fs.writeFileSync(d+'/t4-biped-01b-rigs.json',JSON.stringify(c,null,2)+'\n');
