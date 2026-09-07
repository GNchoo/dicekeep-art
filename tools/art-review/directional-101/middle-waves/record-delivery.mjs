// Records already reviewed, built and checked outputs. Does not grant approval.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const dir='tools/art-review/directional-101/middle-waves';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const folders=['middle-directional','middle-ground-next','middle-glider','middle-membrane','middle-winged-mounts'];
const outputs=folders.map(folder=>{
  const output=`gen/${folder}`,manifestPath=`${output}/directional-art.json`,qaPath=`${output}/directional-qa.json`,movingPath=`${output}/directional-moving-qa.json`;
  const manifest=JSON.parse(fs.readFileSync(manifestPath)),qa=JSON.parse(fs.readFileSync(qaPath)),moving=JSON.parse(fs.readFileSync(movingPath));
  const entries=Object.values(manifest.entries);
  if(entries.some(e=>e.ready!==true)||hash(qa.config)!==qa.configSha256||moving.manifestSha256!==hash(manifestPath))throw Error('stale or unapproved delivery '+folder);
  return{output,entries:entries.map(e=>e.assetId),config:qa.config,configSha256:qa.configSha256,manifestSha256:hash(manifestPath),qaSha256:hash(qaPath),movingQaSha256:hash(movingPath),ready:entries.length,validatedCommand:`node tools/check-directional-art.mjs ${output} --require-ready`,movingCommand:`node tools/preview-directional-motion.mjs ${output}`};
});
const ids=outputs.flatMap(o=>o.entries);if(new Set(ids).size!==27||ids.length!==27)throw Error('expected exactly 27 unique authored deliveries');
const record={version:1,scope:'Middle-wave assets authored and visually reviewed by pipeline_review; integration/promotion is performed separately by root.',reviewRecord:`${dir}/reviewed-entries.json`,generationLedger:`${dir}/generation-ledger.json`,generationRequests:JSON.parse(fs.readFileSync(`${dir}/generation-ledger.json`)).requests.length,checks:{requireReadyPassed:true,decodedImages:324,decodedPng:243,decodedGif:81,inlineFallbacks:81,sourceViews:81},outputs,delegatedEntries:{'b050':'root','b050-2':'root','w043':'root','w054':'root','b060-2':'art_direction','w056':'test_harness'},limitations:['Static texture and body poses with authored independent limb or wing articulation; no claim of unique hand-drawn full-body repaint per frame.','Moving-review travel speed is a QA presentation speed; actual game speed and multiplayer checks are integration responsibilities.','The initial prepare-*.mjs scripts are construction aids; final reviewed *-rigs.json files and their hashes are authoritative.']};
fs.writeFileSync(`${dir}/delivery-index.json`,JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({ready:ids.length,outputs:outputs.length,generationRequests:record.generationRequests}));
