// Regenerate W008's isolated 3-view flight rig from the reviewed transparent atlases.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, '../../../..');
const original = JSON.parse(fs.readFileSync(path.join(repo, 'tools/art-review/directional-101/legacy-flight-rigs.json'), 'utf8'));
const entry = structuredClone(original.entries.find(e => e.assetId === 'w008'));
if (!entry || entry.locomotion !== 'flight') throw new Error('reviewed W008 flight rig missing');
entry.reviewApproved = true;
// Approval is for these visually reviewed atlas bytes, not a future rerun of
// ImageGen or an edited alpha mask. Re-review before changing any pin.
const approvedAtlasSha = {
  side: 'ffd1eef3f57af15b75f5e4374fd70c808b86430730c7a45c41b45a31f3195d3c',
  front: '91165757c83100240db2448a736fe8f5e8714a1c64b9df8db47ef1dea3e301d1',
  back: '311732a586c4c24415c3faee0938b79de3c5ed57ca628e4586941f74fffa6d21',
};

const boxToRoi = (box, margin = 10) => {
  const [x,y,w,h] = box;
  return [(x-margin)/2048, (y-margin)/1024, (w+margin*2)/2048, (h+margin*2)/1024];
};
const unite = boxes => {
  const x0=Math.min(...boxes.map(b=>b[0])), y0=Math.min(...boxes.map(b=>b[1]));
  const x1=Math.max(...boxes.map(b=>b[0]+b[2])), y1=Math.max(...boxes.map(b=>b[1]+b[3]));
  return [x0,y0,x1-x0,y1-y0];
};
const layout = {
  side: { leader: [[.51,.20],[.58,.21]], low: [[.09,.70],[.23,.70]], high: [[.79,.04],[.89,.04]], wingScale: [.26,.29], smallScale: [.10,.11] },
  front: { leader: [[.40,.22],[.65,.22]], low: [[.07,.56],[.23,.56]], high: [[.78,.08],[.94,.08]], wingScale: [.29,.30], smallScale: [.11,.115] },
  back: { leader: [[.40,.17],[.65,.17]], low: [[.07,.56],[.22,.56]], high: [[.79,.06],[.94,.06]], wingScale: [.35,.35], smallScale: [.135,.135] },
};
for (const name of ['side','front','back']) {
  const source = `tools/art-review/enemy-casual-2026-09-23/w008/w008-${name}-puppet-casual-atlas.png`;
  const file = path.join(repo, source);
  const sourceSha256 = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (sourceSha256 !== approvedAtlasSha[name]) throw new Error(`${name}: source differs from visually reviewed W008 atlas`);
  const packed = JSON.parse(fs.readFileSync(file.replace(/\.png$/, '.components.json'), 'utf8'));
  const pieces = packed.pieces;
  const bodyBox = unite(pieces.slice(0,3).map(p=>p.outputBounds));
  const wingRoi = pieces.slice(3).map(p=>boxToRoi(p.outputBounds, 9));
  const L=layout[name], parts=[];
  for (const [prefix, sockets, scales] of [
    ['leader',L.leader,L.wingScale],
    ['followerLow',L.low,L.smallScale],
    ['followerHigh',L.high,L.smallScale],
  ]) {
    for (let i=0;i<2;i++) parts.push({
      id:prefix+(i===0?'LeftWing':'RightWing'), type:'wing', roi:wingRoi[i],
      socketNormalized:sockets[i], sourcePivot:i===0?[.96,.96]:[.04,.96],
      scale:scales[i], angleDeg:i===0?[-20,42]:[20,-42], phase:0, layer:-1,
    });
  }
  entry.views[name] = {
    source, sourceSha256, background:'alpha', pivot:[256,400], assetVersion:127,
    body:{roi:boxToRoi(bodyBox,14),target:{height:170,top:200,centerX:256},layer:0,componentCount:3},
    parts,
  };
}
entry.reviewNotes = 'New transparent flat-cel W008 three-bee swarm in side/front/back; one leader and two smaller followers, six independently flapping wings; runtime promotion only after game-size review.';
const config={version:1,canonicalCell:512,assetVersion:93,entries:[entry]};
fs.writeFileSync(path.join(dir,'w008-directional-rig.json'),JSON.stringify(config,null,2)+'\n');
console.log('wrote',path.join(dir,'w008-directional-rig.json'));
