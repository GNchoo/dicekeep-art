import fs from'node:fs';import path from'node:path';import{fileURLToPath}from'node:url';import{loadRaw,foregroundMask}from'../../../lib/sheet.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),prefix='tools/art-review/directional-101/late-waves/';
const ledger=JSON.parse(fs.readFileSync(path.join(dir,'generation-ledger.json'))),catalog=JSON.parse(fs.readFileSync(path.join(dir,'../production-catalog.json'))).entries;
const ids=['w063','w065','w066','w069'],sourceIds=['late-biped-01-side-parts','late-biped-01-front-back-parts'];
const data=[];
for(const id of sourceIds){const rec=ledger.requests.find(r=>r.id===id),file=path.join(dir,rec.source),raw=await loadRaw(file,{background:'checkerboard'}),inspection=JSON.parse(fs.readFileSync(path.join(dir,'inspection',id+'-components.json')));const groups=Array.from({length:4},()=>[]);for(const c of inspection.components.filter(c=>c.n>500)){const y=c.bounds[1]+c.bounds[3]/2;groups[Math.min(3,Math.floor(y/raw.H*4))].push(c);}for(const row of groups)row.sort((a,b)=>a.bounds[0]-b.bounds[0]);data.push({rec,raw,mask:foregroundMask(raw),groups});}
const roi=(r,b)=>{const[x,y,w,h]=b,p=4,l=Math.max(0,x-p),t=Math.max(0,y-p),right=Math.min(r.W,x+w+p),bottom=Math.min(r.H,y+h+p);return[l/r.W,t/r.H,(right-l)/r.W,(bottom-t)/r.H];};
// The source y landmarks are visibly authored cap/knee/ankle/sole. The x
// landmarks follow each isolated leg's actual silhouette at those heights.
const joints=(raw,mask,bounds,ys)=>{const[x,y,w,h]=bounds,o={};for(const[key,fy]of Object.entries(ys)){let lo=w,hi=0;for(let yy=Math.max(0,Math.round(fy*(h-1))-1);yy<=Math.min(h-1,Math.round(fy*(h-1))+1);yy++)for(let xx=0;xx<w;xx++)if(mask[(y+yy)*raw.W+x+xx]){lo=Math.min(lo,xx);hi=Math.max(hi,xx);}if(lo>hi)throw new Error('Joint row has no part');o[key]=[(lo+hi+1)/2/w,fy];}return o;};
const entries=[];
for(let i=0;i<ids.length;i++){
 const e=catalog.find(e=>e.assetId===ids[i]),views={};
 for(const[name,col,di]of[['side',0,0],['front',0,1],['back',3,1]]){
  const d=data[di],row=d.groups[i];if(row.length!==(di===0?3:6))throw new Error('Unexpected component count '+ids[i]+' '+name);
  const b=row[col],legs=[row[col+1],row[col+2]],bodyH=220,top=90;
  const ys=name==='side'?{hip:.10,knee:[.44,.46,.43,.45][i],ankle:.84,sole:.995}:{hip:.10,knee:.51,ankle:.86,sole:.995};
  views[name]={source:prefix+d.rec.source,sourceSha256:d.rec.sha256,background:'checkerboard',pivot:[256,430],body:{roi:roi(d.raw,b.bounds),target:{height:bodyH,top,centerX:256},layer:10},parts:legs.map((c,k)=>{
   const sx=name==='side'?[.46,.62][k]:name==='front'?[.61,.39][k]:[.39,.61][k],sy=.86;
   return{id:k?'rightLeg':'leftLeg',type:'leg',roi:roi(d.raw,c.bounds),sourceJoints:joints(d.raw,d.mask,c.bounds,ys),socketNormalized:[sx,sy],socketRoiNormalized:[sx-.07,sy-.06,.14,.12],calibrate:{groundY:430,maximumStanceAngle:168},phase:k*.5,layer:name==='side'?k?1:-2:1,upperLayer:-3,bend:1,proximalFeather:.15,proximalEdgeFeather:.09};
  }),jointReview:'Caps/knee/ankle y landmarks reviewed in authored stone legs; x centers measured at those rows. Original source SHA pins ROI and landmarks.'};
 }
 entries.push({assetId:e.assetId,wave:e.wave,role:e.role,locomotion:'legged',cell:256,referenceHeight:350,cycleStride:160,reviewApproved:false,gait:{stanceDuty:.5,lift:25,pelvis:'support'},views});
}
fs.writeFileSync(path.join(dir,'biped-rigs.json'),JSON.stringify({version:1,canonicalCell:512,assetVersion:93,entries},null,2)+'\n');console.log('Wrote '+entries.length+' unapproved biped entries.');
