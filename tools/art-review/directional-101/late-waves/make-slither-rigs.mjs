// Split reviewed original pixels into overlapping head / band / tip pieces.
// No painted RGB is synthesized; every extraction retains source rectangle/SHA.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadRaw,foregroundMask} from '../../../lib/sheet.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),prefix='tools/art-review/directional-101/late-waves/';
const ledger=JSON.parse(fs.readFileSync(path.join(dir,'generation-ledger.json'))), data={};
for(const name of ['side','front-back']){
 const id='late-slither-01-'+name+'-parts',rec=ledger.requests.find(r=>r.id===id),raw=await loadRaw(path.join(dir,rec.source),{background:'checkerboard'});
 if(createHash('sha256').update(fs.readFileSync(path.join(dir,rec.source))).digest('hex')!==rec.sha256)throw Error('Source changed');
 const mask=foregroundMask(raw),rgba=Buffer.from(raw.data);for(let i=0;i<mask.length;i++)if(!mask[i])rgba[i*4+3]=0;
 data[name]={rec,raw,rgba,cc:Object.fromEntries(JSON.parse(fs.readFileSync(path.join(dir,'inspection',id+'-components.json'))).components.map(c=>[c.id,c.bounds]))};
}
const refs={
 w077:{side:[0,1,2],front:[1,4,0],back:[3,5,2]},
 w084:{side:[3,4,5],front:[6,11,7],back:[9,10,8]},
 w091:{side:[8,7,8],front:[12,14,12],back:[13,15,13]},
 w098:{side:[11,9,10],front:[18,21,20],back:[19,23,22]},
};
const records=[],entries=[];fs.mkdirSync(path.join(dir,'derived'),{recursive:true});
for(const [assetId,viewsRef]of Object.entries(refs)){
 const views={},tentacle=assetId==='w091';
 for(const [name,ids]of Object.entries(viewsRef)){
  const d=data[name==='side'?'side':'front-back'],pieces=[];
  for(let p=0;p<3;p++){
   // The original third tentacle view has the correct unadorned rear base.
   // The front/back atlas incorrectly repeated its front-facing pendant.
   const pd=tentacle&&name==='back'&&p===0?data.side:d,componentId=pd===d?ids[p]:6;
   const b=pd.cc[componentId],ys=tentacle?(p===0?[.64,1]:p===1?[.15,.50]:[0,.42]):p===0?[0,name==='side'?.55:.60]:p===1?[.16,.84]:[.32,1];
   const crop=[b[0],b[1]+Math.floor(b[3]*ys[0]),b[2],Math.ceil(b[3]*(ys[1]-ys[0]))];
   const cropPng=await sharp(pd.rgba,{raw:{width:pd.raw.W,height:pd.raw.H,channels:4}}).extract({left:crop[0],top:crop[1],width:crop[2],height:crop[3]}).png().toBuffer();
   const cut=await sharp(cropPng).trim({threshold:0,background:'#00000000'}).png().toBuffer();
   const meta=await sharp(cut).metadata(),pixels=await sharp(cut).ensureAlpha().raw().toBuffer();
   const rowJoint=fy=>{const y=Math.round((meta.height-1)*fy);let lo=meta.width,hi=-1;for(let x=0;x<meta.width;x++)if(pixels[(y*meta.width+x)*4+3]>28){lo=Math.min(lo,x);hi=Math.max(hi,x);}if(hi<lo)throw Error('Empty joint row');return{point:[(lo+hi+1)/2/meta.width,fy],width:hi-lo+1};};
   pieces.push({cut,w:meta.width,h:meta.height,source:pd.rec.source,sourceSha256:pd.rec.sha256,sourceComponent:componentId,sourceRect:crop,joints:p===0?null:{start:rowJoint(tentacle?.82:p===2?.10:.22),end:rowJoint(tentacle?.18:p===2?.88:.78)}});
  }
  const gap=12,W=pieces.reduce((n,p)=>n+p.w,gap)+gap*pieces.length,H=Math.max(...pieces.map(p=>p.h))+gap*2;
  let x=gap;const composites=[];for(const p of pieces){p.roi=[(x-2)/W,(gap-2)/H,(p.w+4)/W,(p.h+4)/H];composites.push({input:p.cut,left:x,top:gap});x+=p.w+gap;}
  const png=await sharp({create:{width:W,height:H,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(composites).png().toBuffer(),output='derived/'+assetId+'-'+name+'-slither-alpha.png',sha=createHash('sha256').update(png).digest('hex');
  fs.writeFileSync(path.join(dir,output),png);records.push({assetId,view:name,source:d.rec.source,sourceSha256:d.rec.sha256,output,outputSha256:sha,pieces:pieces.map(({cut,...p})=>p)});
  const bodyH=tentacle?95:145,bodyTop=tentacle?325:name==='side'?245:name==='front'?270:75,bodyW=bodyH*pieces[0].w/pieces[0].h;
  const body={roi:pieces[0].roi,target:{height:bodyH,top:bodyTop,centerX:tentacle?256:name==='side'?360:256},layer:10};
  const mean=tentacle?-90:name==='side'?180:name==='front'?-90:90,socket=tentacle?[bodyW*.5,bodyH*.30]:name==='side'?[bodyW*.14,bodyH*.87]:[bodyW*.5,bodyH*(name==='front'?.15:.8)];
  const band=pieces[1],tip=pieces[2],bandScale=(tentacle?50:name==='side'?52:60)/band.w,tipScale=tentacle?50/tip.joints.start.width:(name==='side'?135:110)/tip.h;
  views[name]={source:prefix+output,sourceSha256:sha,background:'alpha',pivot:[256,430],body,parts:[0,1,2].map((i)=>({id:'segment'+(i+1),type:'segment',roi:pieces[i===2?2:1].roi,sourceJoints:Object.fromEntries(Object.entries(pieces[i===2?2:1].joints).map(([k,v])=>[k,v.point])),socket,scale:i===2?tipScale:bandScale,angleDeg:[mean,tentacle?15:12],phase:i/3,layer:3-i})),jointReview:'Original RGB extraction with explicit overlapping bands; three phases and a traveling articulated chain. All-view raster and movement review required.'};
 }
 entries.push({assetId,wave:Number(assetId.slice(1)),role:'normal',locomotion:'slither',cell:256,referenceHeight:350,cycleStride:140,cycleSeconds:1,reviewApproved:false,views});
}
fs.writeFileSync(path.join(dir,'slither-extraction.json'),JSON.stringify({method:'Original RGBA edge-connected extraction, reviewed component rectangles cropped and padded; source RGB preserved. Overlap bands intentionally crop within the source body shaft.',records},null,2)+'\n');
fs.writeFileSync(path.join(dir,'slither-rigs.json'),JSON.stringify({version:1,canonicalCell:512,assetVersion:93,entries},null,2)+'\n');
console.log('Prepared '+entries.length+' unapproved slither rigs.');
