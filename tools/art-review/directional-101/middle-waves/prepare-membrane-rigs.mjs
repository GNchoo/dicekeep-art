import fs from 'node:fs';import{createHash}from'node:crypto';
const d='tools/art-review/directional-101/middle-waves';const e={assetId:'w036',wave:36,role:'normal',locomotion:'flight',cell:256,referenceHeight:360,cycleStride:0,cycleSeconds:.8,reviewApproved:false,views:{}};
for(const name of ['side','front','back']){
 const id='membrane-dragons-'+name+'-parts',source=d+'/'+id+'.png',m=JSON.parse(fs.readFileSync(d+'/measurements/'+id+'.json')),body=m.find(p=>p.row===0&&p.col===0),side=name==='side',back=name==='back';
 e.views[name]={source,sourceSha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),background:'checkerboard',pivot:[256,400],body:{roi:body.roi,target:{height:235,top:160,centerX:256},layer:0},parts:[0,1].map(i=>{const p=m.find(p=>p.row===0&&p.col===i+1);let root,angle,flip=false;
  if(side){root=i?[.06,.74]:[.95,.73];angle=[20,35];flip=i===1;}
  else if(back){root=[.2,.12];angle=i?[-55,-38]:[55,38];flip=i===0;}
  else{root=i?[.93,.73]:[.07,.74];angle=i?[25,38]:[-25,-38];}
  return{id:i?'rightWing':'leftWing',type:'wing',roi:p.roi,socketNormalized:side?[.60+i*.015,.58]:[back?(i?.78:.22):(i?.22:.78),.50],sourcePivot:root,scale:side?.65:.57,angleDeg:angle,phase:0,layer:side?(i?1:-1):-1,...(flip?{flipX:true}:{})};
 }),jointReview:'Independent membrane panels anchored at their authored shoulder joints; tucked creature limbs stay intact. Front leftWing is on screen right; back physical left is screen left. Single common canvas scale per part through all phases.'};
}
fs.writeFileSync(d+'/membrane-rigs.json',JSON.stringify({version:1,canonicalCell:512,assetVersion:93,entries:[e]},null,2)+'\n');
