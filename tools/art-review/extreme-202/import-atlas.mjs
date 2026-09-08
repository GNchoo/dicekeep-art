// Decode original flat-magenta atlas into measured, padded, unchanged-color body cutouts.
// RGB bodies and approved limb pixels are never repainted by this utility.
import fs from 'node:fs';import path from 'node:path';import sharp from 'sharp';
import {sha256,prepareView} from '../../lib/directional-rig.mjs';
const dir='tools/art-review/extreme-202',groupId=process.argv[2];
const catalog=JSON.parse(fs.readFileSync(dir+'/catalog.json')),group=catalog.groups.find(g=>g.id===groupId);
if(!group)throw Error('unknown atlas');
const source=dir+'/sources/'+groupId+'.png',bytes=fs.readFileSync(source),meta=await sharp(bytes).metadata();
const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const hasRealTransparency=meta.hasAlpha&&data.some((n,i)=>i%4===3&&n<20);
const key=new Uint8Array(info.width*info.height);let removed=0;
for(let p=0;p<key.length;p++){const i=p*4,r=data[i],g=data[i+1],b=data[i+2];if(r>190&&b>190&&Math.min(r,b)-g>65&&r/b>.92&&r/b<1.1)key[p]=1;}
for(let p=0;p<key.length;p++){
 const i=p*4,[r,g,b]=[data[i],data[i+1],data[i+2]];let erase=!!key[p];
 // Remove only the two-pixel antialiased key fringe. Purple crystals inside
 // the body are preserved, rather than globally erased by a broad hue test.
 if(!erase&&Math.min(r,b)-g>18&&r>g*1.35&&b>g*1.35){const x=p%info.width,y=Math.floor(p/info.width);for(let dy=-2;dy<=2&&!erase;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<info.width&&yy<info.height&&key[yy*info.width+xx]){erase=true;break;}}}
 if(erase){data[i+3]=0;removed++;}
}
if(!hasRealTransparency&&removed<info.width*info.height*.1)throw Error('atlas has no valid alpha or magenta background');
const alpha=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
fs.writeFileSync(dir+'/sources/'+groupId+'-alpha.png',alpha);
// Measure each connected source core independently. Nonuniform generated rows
// can overlap vertically in different columns without any parts overlapping.
const labels=new Int32Array(key.length),queue=new Int32Array(key.length),components=[];let label=0;
for(let p=0;p<key.length;p++){
 if(labels[p]||data[p*4+3]<=28)continue;label++;let head=0,tail=1,n=0,x0=info.width,y0=info.height,x1=0,y1=0;queue[0]=p;labels[p]=label;
 while(head<tail){const q=queue[head++],x=q%info.width,y=Math.floor(q/info.width);n++;x0=Math.min(x0,x);x1=Math.max(x1,x+1);y0=Math.min(y0,y);y1=Math.max(y1,y+1);
  for(const [xx,yy]of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]])if(xx>=0&&yy>=0&&xx<info.width&&yy<info.height){const q2=yy*info.width+xx;if(!labels[q2]&&data[q2*4+3]>28){labels[q2]=label;queue[tail++]=q2;}}
 }
 if(n>200)components.push({label,n,x0,y0,x1,y1,cx:(x0+x1)/2,cy:(y0+y1)/2});
}
const expected=group.entries.length*3;
if(components.length<expected)throw Error(`expected ${expected} connected cores, observed ${components.length}`);
components.sort((a,b)=>b.n-a.n);const cores=components.slice(0,expected);for(const c of cores)c.labels=[c.label];
// Keep minor enclosed ornaments (e.g. antler pendants) under the same2% limit
// enforced by extractPart. A substantial second piece still rejects the atlas.
for(const extra of components.slice(expected)){const owner=cores.find(c=>extra.x0>=c.x0&&extra.x1<=c.x1&&extra.y0>=c.y0&&extra.y1<=c.y1&&extra.n<(c.n+extra.n)*.02);if(!owner)throw Error(`unassigned substantial disconnected fragment ${JSON.stringify(extra)}`);owner.labels.push(extra.label);}
cores.sort((a,b)=>a.cy-b.cy);const cells=[];
for(let i=0;i<cores.length;i+=group.cols)cells.push(...cores.slice(i,i+group.cols).sort((a,b)=>a.cx-b.cx));
const base=JSON.parse(fs.readFileSync(dir+'/base-rigs.json'));
const adjustments=fs.existsSync(dir+'/body-adjustments.json')?JSON.parse(fs.readFileSync(dir+'/body-adjustments.json')):{};
const measurements=[],entries=[];
fs.mkdirSync(dir+'/bodies/'+groupId,{recursive:true});fs.mkdirSync(dir+'/rigs',{recursive:true});fs.mkdirSync(dir+'/measurements',{recursive:true});
for(const [i,id]of group.entries.entries()){
 const e=structuredClone(base.entries.find(e=>e.assetId===id));
 for(const[vi,name]of ['side','front','back'].entries()){
  const c=group.cols===6?(i%2)*3+vi:vi,r=group.cols===6?Math.floor(i/2):i;
  const comp=cells[r*group.cols+c];if(!comp)throw Error(id+' '+name+' missing');
  const {x0,x1,y0,y1}=comp;if(x0===0||y0===0||x1===info.width||y1===info.height)throw Error(id+' source edge clipping');
  const cw=x1-x0+8,ch=y1-y0+8,isolated=Buffer.alloc(cw*ch*4);
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const p=y*info.width+x;if(comp.labels.includes(labels[p])){const j=((y-y0+4)*cw+x-x0+4)*4;data.copy(isolated,j,p*4,p*4+4);}}
  const crop=await sharp(isolated,{raw:{width:cw,height:ch,channels:4}}).png().toBuffer();
  const {data:cd,info:ci}=await sharp(crop).raw().toBuffer({resolveWithObject:true});let xa=ci.width,ya=ci.height,xb=0,yb=0,count=0,edge=0;
  for(let y=0;y<ci.height;y++)for(let x=0;x<ci.width;x++)if(cd[(y*ci.width+x)*4+3]>28){xa=Math.min(xa,x);ya=Math.min(ya,y);xb=Math.max(xb,x+1);yb=Math.max(yb,y+1);count++;if(x===0||y===0||x===ci.width-1||y===ci.height-1)edge++;}
  if(count<400)throw Error(id+' '+name+' empty');if(edge)throw Error(id+' '+name+' foreground touches measured cell boundary: '+edge);
  const file=dir+'/bodies/'+groupId+'/'+id+'-'+name+'.png';fs.writeFileSync(file,crop);
  const v=e.views[name],old=await prepareView({...e,wave:Number(e.baseRigId.slice(1,4)),assetId:e.baseRigId,role:e.baseRigId.endsWith('-2')?'secondary':e.baseRigId[0]==='b'?'boss':'normal',cell:e.baseRigId[0]==='b'?512:256},name,v,process.cwd());
  const target=v.body.target;const h=Array.isArray(target)?target[3]:target.height;const top=Array.isArray(target)?target[1]:target.top;const center=Array.isArray(target)?target[0]+target[2]/2:target.centerX??256;
  // Body source keeps authored aspect ratio. Original canonical height and center
  // remain fixed, so no frame-based stabilization or drift normalization occurs.
  v.body={...v.body,source:file,sourceSha256:sha256(crop),background:'alpha',backgroundSeeds:[],roi:[0,0,1,1],target:{height:h,top,centerX:center},flipX:false};
  Object.assign(v.body,adjustments[id]?.[name]||{});
  delete v.body.componentCount;
  measurements.push({assetId:id,view:name,sourceCell:[x0,y0,x1-x0,y1-y0],paddedBounds:[xa,ya,xb-xa,yb-ya],body:file,sha256:sha256(crop),foregroundPixels:count,boundaryPixels:edge,previousTarget:old.body?.target||target,newTarget:v.body.target,baseRigId:e.baseRigId});
 }
 entries.push(e);
}
fs.writeFileSync(dir+'/measurements/'+groupId+'.json',JSON.stringify({source,sourceSha256:sha256(bytes),actualWidth:info.width,actualHeight:info.height,originalHasAlpha:meta.hasAlpha,hasRealTransparency,magentaPixelsRemoved:removed,cols:group.cols,rows:group.rows,cells:measurements.length,measurements},null,2)+'\n');
fs.writeFileSync(dir+'/rigs/'+groupId+'.json',JSON.stringify({version:1,canonicalCell:512,assetVersion:101,entries},null,2)+'\n');
console.log(JSON.stringify({groupId,entries:entries.length,cells:measurements.length,width:info.width,height:info.height,originalHasAlpha:meta.hasAlpha,removed}));
