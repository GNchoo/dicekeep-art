// Exercises every approved production sheet through the public art review UI.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {launchBrowser}=require('./browser.cjs');
const repo=path.resolve(__dirname,'../..'),out=path.join(repo,'gen/e2e/extreme-review');
const catalog=JSON.parse(fs.readFileSync(path.join(repo,'tools/art-review/extreme-202/catalog.json'),'utf8')).entries;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={pass:false,manifestSha256:sha(fs.readFileSync(path.join(repo,'extreme-art.js'))),entries:catalog.length,views:[],errors:[]};
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await launchBrowser();try{
    const page=await browser.newPage({viewport:{width:1240,height:900}});
    page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
    const url=new URL('tools/art-review/extreme-202/',(process.env.E2E_BASE_URL||'http://localhost:8138/').replace(/\/?$/,'/'));await page.goto(url.href);
    await page.waitForFunction(()=>document.getElementById('status').textContent==='111 / 111종 적용');
    for(let range=0;range<10;range++)for(const [dir,view]of[['right','side'],['down','front'],['up','back']]){
      await page.selectOption('#range',String(range));await page.click('[data-dir="'+dir+'"]');
      const start=102+range*10,end=range===9?202:start+9,expected=catalog.filter(e=>e.wave>=start&&e.wave<=end).map(e=>e.assetId);
      await page.waitForFunction(({ids,view})=>{const cs=[...document.querySelectorAll('#grid canvas')];return cs.length===ids.length&&cs.every(c=>c.dataset.ready==='true'&&c.dataset.view===view&&ids.includes(c.dataset.asset));},{ids:expected,view},{timeout:60000});
      const rows=await page.evaluate(async()=>{
        const result={};for(const c of document.querySelectorAll('#grid canvas'))result[c.dataset.asset]={id:c.dataset.asset,view:c.dataset.view,hashes:[]};
        for(let frame=0;frame<8;frame++){
          const slider=document.getElementById('frame');slider.value=String(frame);slider.dispatchEvent(new Event('input',{bubbles:true}));
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          for(const c of document.querySelectorAll('#grid canvas')){
            const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
            const digest=await crypto.subtle.digest('SHA-256',data);result[c.dataset.asset].hashes.push([...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join(''));
          }
        }return Object.values(result).map(r=>({...r,uniqueFrames:new Set(r.hashes).size}));
      });
      assert.deepEqual(rows.map(r=>r.id),expected);for(const row of rows)assert.ok(row.uniqueFrames>1,'Static animation '+row.id+':'+view);
      report.views.push(...rows);if([0,4,9].includes(range))await page.screenshot({path:path.join(out,'wave-'+start+'-'+view+'.png'),fullPage:true});
    }
    assert.equal(report.views.length,333);assert.equal(new Set(report.views.map(r=>r.id)).size,111);
    await page.click('#towers');for(const theme of ['royal','frost','ember']){
      await page.selectOption('#theme',theme);await page.evaluate(async()=>{for(const im of document.querySelectorAll('#towerGrid img')){im.loading='eager';await im.decode();}});
      assert.equal(await page.locator('#towerGrid img').count(),20);
    }
    assert.deepEqual(report.errors,[]);report.pass=true;
  }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
  console.log(JSON.stringify({pass:report.pass,appearances:report.entries,animatedViews:report.views.length,poseSamples:report.views.length*8,errors:report.errors.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
