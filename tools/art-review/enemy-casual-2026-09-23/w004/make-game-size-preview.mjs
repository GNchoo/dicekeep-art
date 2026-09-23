// Side-by-side release-size sanity check; drawHeight 42 comes from content.js S class.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, '../../../..');
const out = path.join(dir, 'w004-game-size-comparison.png');
const views = ['side','front','back'];
const W=1080,H=650, layers=[];
const bg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#393445"/><rect x="0" y="70" width="1080" height="178" fill="#cfc5ad"/><rect x="0" y="280" width="1080" height="350" fill="#cfc5ad"/><g fill="#201b22" font-family="Arial" font-size="18" font-weight="bold"><text x="20" y="34">W004 · 42px drawHeight · actual size above / 4× zoom below</text><text x="20" y="103">CURRENT</text><text x="20" y="198">CASUAL</text><text x="20" y="322">CURRENT</text><text x="20" y="468">CASUAL</text></g><g fill="#30283a" font-family="Arial" font-size="17" font-weight="bold"><text x="245" y="68">SIDE</text><text x="555" y="68">FRONT</text><text x="860" y="68">BACK</text></g></svg>`);
layers.push({input:bg,left:0,top:0});
for(let j=0;j<views.length;j++){
  const view=views[j], x=[260,560,860][j];
  for(const [kind,src,y,zoom] of [
    ['old',path.join(dir,`baseline-w004-${view}.webp`),137,1],
    ['new',path.join(repo,`gen/w004-casual-three-view-pilot/casual/enemies/inf/directional/w004-${view}.webp`),231,1],
    ['old',path.join(dir,`baseline-w004-${view}.webp`),438,4],
    ['new',path.join(repo,`gen/w004-casual-three-view-pilot/casual/enemies/inf/directional/w004-${view}.webp`),581,4],
  ]){
    const size=Math.round(256*42/328*zoom);
    const input=await sharp(src).resize(size,size,{kernel:zoom===4?'nearest':'lanczos3'}).png().toBuffer();
    layers.push({input,left:Math.round(x-size/2),top:Math.round(y-size*210/256)});
  }
}
await sharp({create:{width:W,height:H,channels:4,background:'#393445'}}).composite(layers).png().toFile(out);
console.log(out);
