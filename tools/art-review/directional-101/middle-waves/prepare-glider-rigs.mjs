import fs from 'node:fs';import{createHash}from'node:crypto';
const d='tools/art-review/directional-101/middle-waves',id='glider-three-view-parts',source=d+'/'+id+'.png',m=JSON.parse(fs.readFileSync(d+'/measurements/'+id+'.json')),entry={assetId:'w032',wave:32,role:'normal',locomotion:'flight',cell:256,referenceHeight:330,cycleStride:0,cycleSeconds:1.2,reviewApproved:false,views:{}};
for(const [row,name]of ['side','front','back'].entries()){
 const body=m.find(p=>p.row===row&&p.col===(row===1?1:0)),wingCols=row===1?[0,2]:[1,2],h=230,w=body.width/body.height*h;
 const side=row===0,root=side?[.85,.05]:[.5,.055];
 entry.views[name]={source,sourceSha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),background:'checkerboard',backgroundSeeds:row===0?[[137,229]]:row===1?[[440,746],[568,746]]:[[104,1164],[217,1164]],pivot:[256,400],body:{roi:body.roi,target:{height:h,top:160,centerX:side?286:256},layer:0},parts:wingCols.map((col,i)=>{
  const p=m.find(p=>p.row===row&&p.col===col),left=i===0;
  return{id:left?'leftWing':'rightWing',type:'wing',roi:p.roi,socketNormalized:root,sourcePivot:left?[.94,.045]:[.055,.055],scale:.64,angleDeg:left?[35,12]:side?[35,12]:[-35,-12],phase:0,layer:side?(i?-1:1):-1,...(side&&!left?{flipX:true}:{})};
 }),jointReview:'Glider apex spar is the common root; canvas panels rotate slightly as the pilot banks. Tucked pilot feet are retained and are not walking supports. Original row 1 body appears in middle column; role-specific measured ROI used.'};
}
fs.writeFileSync(d+'/glider-rigs.json',JSON.stringify({version:1,canonicalCell:512,assetVersion:93,entries:[entry]},null,2)+'\n');
