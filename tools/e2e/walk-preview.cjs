// Review evidence: the actual DKA loader frames at the game's 5 fps, enlarged 3x.
const fs = require('node:fs');
const sharp = require('sharp');
const { launchBrowser, gameUrl, outputPath } = require('./browser.cjs');
(async () => {
  const browser = await launchBrowser();
  try {
    const p = await browser.newPage({ viewport: { width: 1240, height: 860 } });
    await p.goto(gameUrl());
    await p.waitForFunction(() => window.DK && DK.phase === 'title', null, { timeout: 120000 });
    const buffers=[];
    for(let phase=0;phase<4;phase++) {
      const data=await p.evaluate((phase)=>{
        const cv=document.createElement('canvas'); cv.width=1050;cv.height=800;
        const g=cv.getContext('2d'); g.fillStyle='#253337';g.fillRect(0,0,cv.width,cv.height);
        g.fillStyle='#edf1de';g.font='bold 25px sans-serif';g.fillText('Infinity 1–9 · runtime walk frames',26,36);
        g.font='16px sans-serif';g.fillText('5 fps · 3× game height · grounded baseline / flying center anchor',26,64);
        for(let w=1;w<=9;w++){
          const m=DKCONTENT.INFINITY.monsters[w],a=DKA[`infW${w}Walk`];
          if(!Array.isArray(a)||a.length!==4)throw new Error(`missing W${w}`);
          const f=a[phase],x=((w-1)%3)*350,y=Math.floor((w-1)/3)*230+100;
          g.fillStyle='#edf1de';g.font='bold 18px sans-serif';g.fillText(`W${w}  ${m.name}`,x+20,y+20);
          g.fillStyle='#aebdbd';g.font='14px sans-serif';g.fillText(`${m.move} · ${DKCONTENT.INFINITY.artSize[m.cls]}px`,x+20,y+43);
          const h=DKCONTENT.INFINITY.artSize[m.cls]*3, width=f.w*h/f.h;
          const left=x+175-width/2,top=y+214-h;
          g.strokeStyle='#677578';g.beginPath();g.moveTo(x+18,y+215);g.lineTo(x+330,y+215);g.stroke();
          g.drawImage(f.cv,left,top,width,h);
        }
        return cv.toDataURL('image/png').split(',')[1];
      },phase);
      buffers.push(Buffer.from(data,'base64'));
    }
    fs.writeFileSync(outputPath('walk-preview.png'),buffers[0]);
    const raw=await sharp({create:{width:1050,height:3200,channels:4,background:'#253337'}})
      .composite(buffers.map((input,i)=>({input,left:0,top:i*800}))).raw().toBuffer();
    await sharp(raw,{raw:{width:1050,height:3200,channels:4,pageHeight:800}})
      .gif({delay:[200,200,200,200],loop:0,effort:7}).toFile(outputPath('walk-preview.gif'));
    console.log('PASS runtime preview: 9 sheets × 4 frames, 5 fps, 3× game height');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
