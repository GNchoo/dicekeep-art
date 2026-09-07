// Separate already generated body/wisps without repainting any source pixel.
import fs from'node:fs';import path from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';import sharp from'sharp';import{loadRaw,foregroundMask}from'../../../lib/sheet.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),prefix='tools/art-review/directional-101/late-waves/',file=path.join(dir,'sources/t10-mixed-01-turnaround.png');
const hash=b=>createHash('sha256').update(b).digest('hex'),sha=hash(fs.readFileSync(file));
if(sha!=='146b0f78e2aad87cc3d3545a1c8ae543861110cbfa772c5619287df111acd212')throw new Error('Reviewed original SHA changed');
const raw=await loadRaw(file,{background:'checkerboard'}),mask=foregroundMask(raw),seen=new Uint8Array(mask.length),components=[];
for(let p=0;p<mask.length;p++){if(!mask[p]||seen[p])continue;const q=[p],pixels=[];seen[p]=1;let x0=raw.W,y0=raw.H,x1=0,y1=0;while(q.length){const v=q.pop(),x=v%raw.W,y=Math.floor(v/raw.W);pixels.push(v);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);for(const next of[x?v-1:-1,x<raw.W-1?v+1:-1,y?v-raw.W:-1,y<raw.H-1?v+raw.W:-1])if(next>=0&&mask[next]&&!seen[next]){seen[next]=1;q.push(next);}}if(pixels.length>500&&y0>600&&y1<1120)components.push({pixels,bounds:[x0,y0,x1-x0+1,y1-y0+1]});}
const views={},records=[];fs.mkdirSync(path.join(dir,'derived'),{recursive:true});
for(const[index,name]of['side','front','back'].entries()){
 const group=components.filter(c=>Math.floor((c.bounds[0]+c.bounds[2]/2)/raw.W*3)===index).sort((a,b)=>b.pixels.length-a.pixels.length),[body,...wisps]=group,[bx,by,bw,bh]=body.bounds;
 if(wisps.length<2||wisps.length>4)throw new Error('Unexpected reviewed wisp count '+name);
 const atlas=Buffer.alloc(512*512*4),parts=[],partsRecord=[];
 for(const[cIndex,c]of group.entries()){
  const[x,y,w,h]=c.bounds,left=cIndex?430:Math.round((400-w)/2),top=cIndex?20+(cIndex-1)*120:Math.round((512-h)/2);
  for(const p of c.pixels){const sx=p%raw.W-x,sy=Math.floor(p/raw.W)-y,dx=left+(name==='side'?w-1-sx:sx),dy=top+sy;raw.data.copy(atlas,(dy*512+dx)*4,p*4,p*4+4);}
  if(cIndex){const relativeX=x+w/2-bx,relativeY=y+h/2-by;parts.push({id:'wisp'+cIndex,type:'appendage',roi:[.80,(top-4)/512,.20,(h+8)/512],socket:[(name==='side'?bw-relativeX:relativeX)*300/bh,relativeY*300/bh],sourcePivot:[.5,.5],scale:300/bh,angleDeg:[0,12],phase:(cIndex-1)/wisps.length,layer:1});}
  partsRecord.push({component:cIndex===0?'body':'wisp'+cIndex,originalBounds:c.bounds,pixels:c.pixels.length,atlasBounds:[left,top,w,h],flipX:name==='side'});
 }
 const out='derived/w092-'+name+'-parts.png',bytes=await sharp(atlas,{raw:{width:512,height:512,channels:4}}).png().toBuffer();fs.writeFileSync(path.join(dir,out),bytes);
 views[name]={source:prefix+out,sourceSha256:hash(bytes),background:'checkerboard',pivot:[256,390],body:{roi:[0,0,.78,1],target:{height:300,top:80,centerX:256},layer:0},parts};records.push({view:name,source:'sources/t10-mixed-01-turnaround.png',sourceSha256:sha,output:out,outputSha256:hash(bytes),parts:partsRecord});
}
fs.writeFileSync(path.join(dir,'eye-extraction.json'),JSON.stringify({method:'Neutral edge-connected background flood, connected-component isolation, original pixels repacked without rescaling; side parts normalized by horizontal flip.',records},null,2)+'\n');
fs.writeFileSync(path.join(dir,'eye-rig.json'),JSON.stringify({assetId:'w092',wave:92,role:'normal',locomotion:'float',cell:256,referenceHeight:300,cycleStride:0,cycleSeconds:1.6,hover:{lift:10,roll:1.5},reviewApproved:false,views},null,2)+'\n');console.log('Prepared all three eye views with independent original wisps; zero image generation calls.');
