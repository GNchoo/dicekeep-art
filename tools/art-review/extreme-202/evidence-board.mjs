import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import sharp from 'sharp';
import {sha256} from '../../lib/directional-rig.mjs';
const out='gen/extreme-202-final',dest='tools/art-review/extreme-202/evidence';
const context={window:{}};vm.runInNewContext(fs.readFileSync('directional-art.js','utf8'),context);
const before=context.window.INF_DIRECTIONAL_ART,after=JSON.parse(fs.readFileSync(out+'/directional-art.json'));
const ids=['w102','w123','w133','w138','w154','b171','w183','b201'];
fs.mkdirSync(dest,{recursive:true});
const W=1080,H=214,tiles=[],records=[];
for(const[row,id]of ids.entries()){
 const e=after.entries[id],old=before.entries[e.legacyAssetId];
 const label=`${id} ${e.name} — old ${e.legacyAssetId} SIDE / FRONT / BACK | NEW SIDE / FRONT / BACK`;
 tiles.push({input:Buffer.from(`<svg width="${W}" height="30"><text x="8" y="21" fill="white" font-family="Arial" font-size="15">${label}</text></svg>`),left:0,top:row*H});
 for(const[side,entry]of [old,e].entries())for(const[vi,v]of ['side','front','back'].entries()){
  const file=side?path.join(out,entry.views[v].still):entry.views[v].still;
  tiles.push({input:await sharp(file).resize(180,180).flatten({background:'#253438'}).png().toBuffer(),left:(side*3+vi)*180,top:row*H+30});
  records.push({id,version:side?'new':'old',view:v,file,sha256:sha256(fs.readFileSync(file))});
 }
}
await sharp({create:{width:W,height:H*ids.length,channels:4,background:'#253438'}}).composite(tiles).png().toFile(dest+'/old-new-three-view.png');
// Preserve the real final moving previews, not a new pose interpolation.
for(const id of ['w123','w138','w183','b201'])fs.copyFileSync(out+'/review/'+id+'-moving.gif',dest+'/'+id+'-moving.gif');
const reviewBoards=[];for(let n=1;n<=14;n++){const source=out+'/review/all-poses-'+n+'.png',file='all-poses-'+n+'.jpg';await sharp(source).jpeg({quality:88}).toFile(dest+'/'+file);reviewBoards.push({file,source,sourceSha256:sha256(fs.readFileSync(source)),derivation:'JPEG88 proof only; runtime and original source pixels unchanged.'});}
for(const name of ['directional-validation.json','directional-moving-qa.json'])fs.copyFileSync(out+'/'+name,dest+'/'+name);
const qaBytes=fs.readFileSync(out+'/directional-qa.json');fs.writeFileSync(dest+'/directional-qa.json.gz',zlib.gzipSync(qaBytes,{level:9}));
for(const id of ['w183','w138']){const file=id+'-motion-captures.png';if(fs.existsSync(out+'/review/'+file))fs.copyFileSync(out+'/review/'+file,dest+'/'+file);}
fs.writeFileSync(dest+'/manifest.json',JSON.stringify({scope:'Representative old/new neutral art comparison at equal source-cell scale; final moving GIFs replay the actual baked sheets. This board does not apply game-specific display sizes.',manifestSha256:sha256(fs.readFileSync(out+'/directional-art.json')),records,reviewBoards,compressedQA:{file:'directional-qa.json.gz',decodedSha256:sha256(qaBytes),encoding:'gzip JSON; complete per-frame provenance and image QA preserved'},validationFiles:['directional-validation.json','directional-moving-qa.json','directional-qa.json.gz'].map(file=>({file,sha256:sha256(fs.readFileSync(dest+'/'+file))})),files:fs.readdirSync(dest).filter(f=>/\.(png|jpg|gif)$/.test(f)).map(file=>({file,sha256:sha256(fs.readFileSync(dest+'/'+file))}))},null,2)+'\n');
console.log('Representative old/new board and four real moving GIFs saved.');
