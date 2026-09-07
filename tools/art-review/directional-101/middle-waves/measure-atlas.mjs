import fs from 'node:fs';import path from 'node:path';import sharp from 'sharp';import {loadRaw} from '../../../lib/sheet.mjs';import {extractPart} from '../../../rig-walk.mjs';
const dir='tools/art-review/directional-101/middle-waves',id=process.argv[2],cuts=JSON.parse(process.argv[3]),regions=JSON.parse(process.argv[4]||'[[0,0.44],[0.45,0.22],[0.73,0.23]]'),raw=await loadRaw(dir+'/'+id+'.png',{background:'checkerboard'}),result=[];
for(let row=0;row<cuts.length-1;row++)for(let col=0;col<regions.length;col++){
 const roi=[regions[col][0],cuts[row]/raw.H,regions[col][1],(cuts[row+1]-cuts[row])/raw.H],p=await extractPart(raw,roi,id+'-r'+row+'p'+col),bytes=Buffer.from(p.image.split(',')[1],'base64');fs.writeFileSync(dir+'/measurements/'+p.name+'.png',bytes);
 const{data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});const bands=[.1,.4,.45,.5,.55,.6,.65,.75,.8,.85,.9,.98,.995].map(y=>{const Y=Math.floor(y*(info.height-1)),xs=[];for(let x=0;x<info.width;x++)if(data[(Y*info.width+x)*4+3]>150)xs.push(x);return{y,center:xs.length?(xs[0]+xs.at(-1))/2/info.width:null};});
 result.push({name:p.name,row,col,roi,width:p.width,height:p.height,sourceBounds:p.sourceBounds,bands});
}
fs.writeFileSync(dir+'/measurements/'+id+'.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.map(({row,col,sourceBounds,bands})=>({row,col,sourceBounds,bands}))));
