// Actual baked flight/hover/slither frames over fixed grid. No contact claim.
import fs from'node:fs';import path from'node:path';import sharp from'sharp';import{createHash}from'node:crypto';
const root=path.resolve(process.argv[2]),bytes=fs.readFileSync(path.join(root,'directional-art.json')),manifest=JSON.parse(bytes),hash=b=>createHash('sha256').update(b).digest('hex'),directions=[['RIGHT','side',1,0],['LEFT','side',-1,0],['DOWN','front',0,1],['UP','back',0,-1]],report={manifestSha256:hash(bytes),method:'Actual baked PNGs. Four directions and three cycles; fixed 256px review cell, deliberately uniform 60 review px/cycle translation. Not a gameplay-speed or foot-contact test.',entries:[]};
for(const[id,e]of Object.entries(manifest.entries)){
 if(e.locomotion==='legged')continue;
 const frames={},n=e.views.side.frames,panel=480,width=panel*2,output=[];
 for(const[v,d]of Object.entries(e.views)){frames[v]=[];for(let i=0;i<n;i++)frames[v].push(await sharp(path.join(root,d.sheet)).extract({left:i%d.cols*d.cell,top:Math.floor(i/d.cols)*d.cell,width:d.cell,height:d.cell}).resize(256,256).png().toBuffer());}
 for(let i=0;i<n*3;i++){
  const comps=[],phase=i/n,move=(phase-(3-1/n)/2)*60;let svg='';
  for(const[k,[name,v,dx,dy]]of directions.entries()){
   const ox=k%2*panel,oy=Math.floor(k/2)*panel;for(let p=20;p<panel;p+=20)svg+=`<path d="M${ox+p} ${oy+50}V${oy+panel-10}M${ox+10} ${oy+p+40}H${ox+panel-10}" stroke="#3d5356"/>`;
   svg+=`<text x="${ox+15}" y="${oy+25}" fill="white" font-size="17">${id} ${name} / ${e.locomotion} / pose ${i%n+1}</text>`;
   const sprite=v==='side'&&dx<0?await sharp(frames[v][i%n]).flop().png().toBuffer():frames[v][i%n];
   comps.push({input:sprite,left:Math.round(ox+112+move*dx),top:Math.round(oy+135+move*dy)});
  }
  const bg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}"><rect width="100%" height="100%" fill="#253438"/>${svg}</svg>`);
  output.push(await sharp(bg).composite(comps).png().toBuffer());
 }
 const reset=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}"><rect width="100%" height="100%" fill="#253438"/><text x="480" y="480" text-anchor="middle" fill="white" font-size="30">RESET TO START — REVIEW LOOP</text></svg>`);output.push(await sharp(reset).png().toBuffer());
 const raw=await sharp({create:{width,height:width*output.length,channels:4,background:'#253438'}}).composite(output.map((input,i)=>({input,left:0,top:i*width}))).raw().toBuffer(),gif=await sharp(raw,{raw:{width,height:width*output.length,channels:4,pageHeight:width}}).gif({loop:0,effort:3,delay:[...Array(n*3).fill(e.locomotion==='float'?300:150),600]}).toBuffer(),file='review/'+id+'-moving.gif';
 fs.writeFileSync(path.join(root,file),gif);fs.writeFileSync(path.join(root,'review',id+'-moving.png'),output[0]);report.entries.push({assetId:id,locomotion:e.locomotion,gif:file,gifSha256:hash(gif),motionFrames:n*3,resetFrames:1,contactCheck:'not applicable; no articulated walking feet'});console.log('previewed '+id);
}
report.passed=report.entries.length>0;fs.writeFileSync(path.join(root,'directional-other-motion-qa.json'),JSON.stringify(report,null,2)+'\n');
