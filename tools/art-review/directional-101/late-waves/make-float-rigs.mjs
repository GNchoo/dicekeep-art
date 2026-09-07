import fs from 'node:fs';import path from 'node:path';import{fileURLToPath}from'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),rel='tools/art-review/directional-101/late-waves/';
const catalog=JSON.parse(fs.readFileSync(path.join(dir,'../production-catalog.json'))).entries,ledger=JSON.parse(fs.readFileSync(path.join(dir,'generation-ledger.json')));
const specs=[
 ['w061','t7-float-01-turnaround',[[0,0,1/3,1],[1/3,0,1/3,1],[2/3,0,1/3,1]]],
 ['b070','t7-boss-01-turnaround',[[0,0,.30,.51],[.30,0,.37,.51],[.67,0,.33,.51]]],
 ['b070-2','t7-boss-01-turnaround',[[0,.51,.27,.49],[.27,.51,.39,.49],[.66,.51,.34,.49]]],
 ['w085','t9-float-01-turnaround',[[0,0,1/3,1],[1/3,0,1/3,1],[2/3,0,1/3,1]]]
];
const entries=specs.map(([assetId,id,rois])=>{const e=catalog.find(e=>e.assetId===assetId),src=ledger.requests.find(r=>r.id===id);return{assetId,wave:e.wave,role:e.role,locomotion:'float',cell:e.role==='normal'?256:512,referenceHeight:300,cycleStride:0,cycleSeconds:1.6,hover:{lift:10,roll:1.5},reviewApproved:false,views:Object.fromEntries(['side','front','back'].map((v,i)=>[v,{source:rel+src.source,sourceSha256:src.sha256,background:'checkerboard',backgroundSeeds:assetId==='b070'?(v==='side'?[[89,514]]:[]):[],pivot:[256,390],body:{roi:rois[i],target:{height:300,top:80,centerX:256},layer:0},parts:[]}]))};});
const eyeFile=path.join(dir,'eye-rig.json');if(fs.existsSync(eyeFile))entries.push(JSON.parse(fs.readFileSync(eyeFile)));
fs.writeFileSync(path.join(dir,'float-rigs.json'),JSON.stringify({version:1,canonicalCell:512,assetVersion:93,entries},null,2)+'\n');
console.log('Wrote '+entries.length+' explicit hover entries (not walk approval).');
