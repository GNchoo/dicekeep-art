import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRaw} from '../../lib/sheet.mjs';
import {extractPart} from '../../rig-walk.mjs';
import {sha256} from '../../lib/directional-rig.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(dir,'../../..');
const base='tools/art-review/directional-101/';
const sources={side:base+'t2-bird-01-side-parts.png',cross:base+'t2-bird-01-front-back-parts.png'};
const raws={};
for(const [k,f]of Object.entries(sources))raws[k]=await loadRaw(path.join(repo,f),{background:'checkerboard'});
const frames={side:{source:'side',rows:[[0,.5],[.5,1]],cols:[[0,.355],[.36,.67],[.672,1]]},front:{source:'cross',rows:[[0,.27],[.27,.523]],cols:[[0,.325],[.33,.66],[.67,1]]},back:{source:'cross',rows:[[.523,.744],[.744,1]],cols:[[0,.325],[.33,.66],[.67,1]]}};
const entries=[];
for(const [i,wave]of [12,16].entries()){
 const e={assetId:'w'+String(wave).padStart(3,'0'),wave,role:'normal',locomotion:'flight',cell:256,referenceHeight:300,cycleStride:0,cycleSeconds:.8,reviewApproved:false,views:{}};
 for(const [name,spec]of Object.entries(frames)){
  const [top,bottom]=spec.rows[i],raw=raws[spec.source];
  const split=(name==='front'?[575,557]:[556,562])[i];
  const columns=name==='side'?spec.cols:[[0,.325],[.33,split/raw.W],[(split+1)/raw.W,1]];
  const rois=columns.map(([left,right])=>[left,top,right-left,bottom-top]);
  const cut=[];
  for(let k=0;k<3;k++)cut.push(await extractPart(raw,rois[k],e.assetId+' '+name+' '+k));
  console.log(e.assetId,name,cut.map(p=>[p.width,p.height,p.sourceBounds]));
  const h=205,bw=h*cut[0].width/cut[0].height;
  const body={roi:rois[0],target:[256-bw/2,142,bw,h],layer:0};
  const wing=(k,left)=>({id:left?'leftWing':'rightWing',type:'wing',roi:rois[k],socket:[bw*(name==='side'?(left?.48:.41):(left?.21:.79)),h*.31],sourcePivot:[.09,.035],scale:175/cut[k].height,angleDeg:name==='side'?[45,52]:left?[45,52]:[-45,-52],phase:0,layer:name==='side'?(left?-1:1):-1,flipX:name==='side'||left});
  e.views[name]={source:sources[spec.source],sourceSha256:sha256(fs.readFileSync(path.join(repo,sources[spec.source]))),background:'checkerboard',pivot:[256,350],body,parts:[wing(1,true),wing(2,false)]};
 }
 entries.push(e);
}
fs.writeFileSync(path.join(dir,'pilot-bird-rigs.json'),JSON.stringify({version:1,canonicalCell:512,assetVersion:93,entries},null,2)+'\n');
