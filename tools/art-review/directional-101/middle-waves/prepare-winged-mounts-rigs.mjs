// Initial measured atlas assembly. Final hand-reviewed winged-mounts-rigs.json is authoritative.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const dir='tools/art-review/directional-101/middle-waves';
const entries=[44,48].map((wave,row)=>{
  const entry={assetId:`w0${wave}`,wave,role:'normal',locomotion:'flight',cell:256,referenceHeight:360,cycleStride:0,cycleSeconds:.85,reviewApproved:false,views:{}};
  for(const name of ['side','front','back']){
    const id=`winged-mounts-${name}-parts${name==='front'?'':'-clean'}`,source=`${dir}/${id}.png`;
    const measurements=JSON.parse(fs.readFileSync(`${dir}/measurements/${id}.json`));
    const part=col=>measurements.find(m=>m.row===row&&m.col===col);
    const side=name==='side',back=name==='back';
    entry.views[name]={source,sourceSha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),background:'checkerboard',pivot:[256,400],
      body:{roi:part(0).roi,target:{height:280,top:90,centerX:256},layer:10},
      parts:[0,1].map(i=>{
        const col=side||back?i+1:2-i;
        return{id:i?'rightWing':'leftWing',type:'wing',roi:part(col).roi,
          socketNormalized:side?[.66+i*.035,.67]:[back?(i?.75:.25):(i?.25:.75),back?.51:.55],
          sourcePivot:side?[.14,.08]:back?[i?.40:.60,.10]:[i?.80:.20,.10],
          scale:side?.52:.48,
          angleDeg:side?[i?45:53,40]:back?(i?[-45,-40]:[45,40]):(i?[45,40]:[-45,-40]),
          phase:0,layer:side?(i?1:-1):-1,...(side?{flipX:true}:{})};
      }),
      jointReview:'Authored single feathered wings pivot at the proximal shoulder cap; body layer covers the closed socket. Physical left/right wing identity mirrors screen side between front and rear, with synchronous upstroke at phase 0.25. Every body and wing keeps one fixed size across the four poses.'};
    if(side&&wave===48)entry.views[name].backgroundSeeds=[[420,739],[416,884]];
  }
  return entry;
});
fs.writeFileSync(`${dir}/winged-mounts-rigs.json`,JSON.stringify({version:1,canonicalCell:512,assetVersion:93,entries},null,2)+'\n');
