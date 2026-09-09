// Focused, actual HTTP/game capture. No response replacement or art injection.
// E2E_BASE_URL=https://dicekeep.cgn3731.workers.dev/ node gen/boss-front-footwork-runtime.cjs baseline
// E2E_BASE_URL=http://localhost:8138/ node gen/boss-front-footwork-runtime.cjs after --compare=baseline
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),sharp=require('sharp');
const {launchBrowser}=require('../tools/e2e/browser.cjs');
const repo=path.resolve(__dirname,'..'),root=path.join(__dirname,'e2e/boss-front-footwork');
const label=process.argv[2]||'baseline',opt=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.split('=').slice(1).join('=');
assert.match(label,/^[a-z0-9_-]+$/i);assert.ok(process.env.E2E_BASE_URL,'Explicit E2E_BASE_URL required');
const base=new URL(process.env.E2E_BASE_URL);assert.ok(/^https?:$/.test(base.protocol));if(!base.pathname.endsWith('/'))base.pathname+='/';
const ids=(opt('ids')||'b040,b040-2,b090,b090-2,b100,b141,b141-2,b191,b191-2,b201').split(',');
assert.ok(ids.every(id=>/^b\d{3}(?:-2)?$/.test(id)));assert.equal(new Set(ids).size,ids.length);
const out=path.join(root,label);assert.ok(!fs.existsSync(path.join(out,'report.json')),'Use a new label; preserve previous evidence');fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={version:1,label,startedAt:new Date().toISOString(),baseUrl:base.href,ids,viewport:{width:440,height:956},
  scope:'Original HTTP responses. Actual wave button spawns the selected boss. Public DK state isolates it, places it on real lane straights, and freezes authored phases for screenshots; original DKART.frame/drawImage are observed without changing their result. Natural downward movement is checked separately. No login, payment, remote net, saved entitlement, physics code, or artwork injection.',
  visualLimit:'Outward-facing toes and natural anatomical overlap require human review of the actual-render boards; frame/phase assertions alone do not certify anatomy.',
  checkerSha256:sha(fs.readFileSync(__filename)),expectedGameSha256:process.env.EXPECTED_GAME_SHA256||sha(fs.readFileSync(path.join(repo,'game.js'))),http:[],artResponses:[],actors:[],errors:[],optionalAudioErrors:[],pass:false};
const flush=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
function withoutData(value){return JSON.parse(JSON.stringify(value,(k,v)=>k==='fallback'&&typeof v==='string'?{sha256:sha(v)}:v));}
async function pin(url,file){
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(60000)});assert.equal(response.status,200,'HTTP '+url);
  const bytes=Buffer.from(await response.arrayBuffer()),destination=path.join(out,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes);
  const item={url,file,sha256:sha(bytes),bytes:bytes.length,status:200};report.http.push(item);return item;
}
async function board(files,destination,title){
  const w=240,h=224,pieces=[];
  for(let i=0;i<files.length;i++){
    const tile=await sharp(files[i]).resize({width:w-12,height:h-38,fit:'inside',withoutEnlargement:false,kernel:'nearest'}).png().toBuffer();
    const meta=await sharp(tile).metadata();pieces.push({input:tile,left:(i%4)*w+Math.floor((w-meta.width)/2),top:42+Math.floor(i/4)*h+30});
    pieces.push({input:Buffer.from(`<svg width="${w}" height="28"><text x="12" y="20" fill="#eee" font-size="15" font-family="Arial">Frame ${i+1} / phase ${((i+.25)/8).toFixed(3)}</text></svg>`),left:i%4*w,top:42+Math.floor(i/4)*h});
  }
  pieces.push({input:Buffer.from(`<svg width="${w*4}" height="40"><text x="12" y="27" fill="#fff" font-size="20" font-family="Arial">${title}</text></svg>`),left:0,top:0});
  await sharp({create:{width:w*4,height:42+h*2,channels:4,background:'#202730'}}).composite(pieces).png().toFile(destination);
}
async function comparisonGif(before,id){
  const old=before.actors.find(a=>a.id===id),now=report.actors.find(a=>a.id===id),clips=[old.captureClip,now.captureClip],scale=3;
  const x=Math.min(...clips.map(c=>c.left)),y=Math.min(...clips.map(c=>c.top)),cw=Math.max(...clips.map(c=>c.left+c.width))-x,ch=Math.max(...clips.map(c=>c.top+c.height))-y;
  const panel=Math.max(200,cw*scale+24),width=panel*2,height=ch*scale+88,frames=[];
  for(let index=0;index<8;index++){
    const composites=[];
    for(let n=0;n<2;n++){
      const c=clips[n],dir=n?out:path.join(root,before.label),input=await sharp(path.join(dir,`${id}-front-${index+1}.png`)).resize(c.width*scale,c.height*scale,{kernel:'nearest'}).png().toBuffer();
      composites.push({input,left:n*panel+12+(c.left-x)*scale,top:80+(c.top-y)*scale});
    }
    const bg=Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#202730"/><g fill="#fff" font-family="Arial"><text x="12" y="24" font-size="19">${id} DOWN · actual game poses ${index+1}/8</text><text x="12" y="45" font-size="12">Fixed screen crop ×3 · phase fixtures, review playback</text><text x="12" y="69" font-size="17">BEFORE</text><text x="${panel+12}" y="69" font-size="17">AFTER</text></g></svg>`);
    frames.push(await sharp(bg).composite(composites).png().toBuffer());
  }
  const raw=await sharp({create:{width,height:height*8,channels:4,background:'#202730'}}).composite(frames.map((input,i)=>({input,left:0,top:height*i}))).raw().toBuffer();
  const gif=await sharp(raw,{raw:{width,height:height*8,channels:4,pageHeight:height}}).gif({loop:0,delay:Array(8).fill(150),effort:4}).toBuffer();
  const file=id+'-before-after.gif';fs.writeFileSync(path.join(out,file),gif);fs.writeFileSync(path.join(out,id+'-before-after.png'),frames[0]);
  assert.equal((await sharp(gif,{animated:true}).metadata()).pages,8);
  return{id,file,sha256:sha(gif),frames:8,delayMs:150,commonScale:scale,source:'Existing actual-game screenshot crops; no redraw or art injection'};
}
function installObserver(){
  const original=DKART.frame,draw=CanvasRenderingContext2D.prototype.drawImage,lookup=new WeakMap(),bounds=new WeakMap(),serials=new WeakMap();let serial=0,sequence=0;
  window.__bossQA={rows:[],capture:null};
  DKART.frame=function(...args){const f=original.apply(this,args);if(f){if(!serials.has(f.cv))serials.set(f.cv,++serial);lookup.set(f.cv,{id:f.assetId,view:f.view,key:f.cacheKey,serial:serials.get(f.cv),phase:args[2],pivot:f.pivot,referenceHeight:f.referenceHeight});}return f;};
  CanvasRenderingContext2D.prototype.drawImage=function(source,...args){
    const value=draw.call(this,source,...args),f=lookup.get(source);
    if(this.canvas.id!=='game'||!f||f.id!==__bossQA.capture||!f.key.endsWith(':sheet'))return value;
    if(!bounds.has(source)){
      const a=source.getContext('2d').getImageData(0,0,source.width,source.height).data;let x0=source.width,y0=source.height,x1=0,y1=0,pixels=0;
      for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(a[(y*source.width+x)*4+3]>=16){pixels++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);}
      bounds.set(source,{x0,y0,x1,y1,pixels});
    }
    const a=bounds.get(source),m=this.getTransform(),rect=this.canvas.getBoundingClientRect();
    const [dx,dy,dw,dh]=args.length===4?args:[args[0],args[1],source.width,source.height];
    const points=[[a.x0,a.y0],[a.x1,a.y0],[a.x0,a.y1],[a.x1,a.y1]].map(([x,y])=>{x=dx+x*dw/source.width;y=dy+y*dh/source.height;return[m.a*x+m.c*y+m.e,m.b*x+m.d*y+m.f];});
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    const box={x:rect.x+Math.min(...xs)*rect.width/this.canvas.width,y:rect.y+Math.min(...ys)*rect.height/this.canvas.height,width:(Math.max(...xs)-Math.min(...xs))*rect.width/this.canvas.width,height:(Math.max(...ys)-Math.min(...ys))*rect.height/this.canvas.height};
    const e=DK.enemies.find(e=>e.artAssetId===f.id),lx=dx+f.pivot[0]*dw/source.width,ly=dy+f.pivot[1]*dh/source.height;
    const row={...f,sequence:++sequence,alphaPixels:a.pixels,box,drawHeight:e.drawHeight,dist:e.dist,walk:e.artWalkDistance,animT:e.animT,flipX:m.a*m.d-m.b*m.c<0,pivotResidual:Math.hypot(m.a*lx+m.c*ly,m.b*lx+m.d*ly),time:performance.now()};
    __bossQA.rows.push(row);if(__bossQA.rows.length>2500)__bossQA.rows.shift();return value;
  };
}
function moveTo({direction,fraction=.45}){
  const e=DK.enemies[0],l=DKLANES()[e.lane||0];
  const s=l.segs.find(s=>s.acc>=(l.loopAt||0)&&(direction==='down'?s.by-s.ay>50&&Math.abs(s.bx-s.ax)<1:direction==='up'?s.by-s.ay< -50&&Math.abs(s.bx-s.ax)<1:direction==='right'?s.bx-s.ax>50&&Math.abs(s.by-s.ay)<1:s.bx-s.ax< -50&&Math.abs(s.by-s.ay)<1));
  if(!s)throw Error('No real '+direction+' straight');e.dist=s.acc+s.len*fraction;e.entranceT=-1;e.stunT=e.slowT=e.flashT=0;
  __bossQA.rows=[];return{...s,lane:e.lane};
}
(async()=>{
  const browser=await launchBrowser();let page;
  try{
    page=await browser.newPage({viewport:report.viewport});const pending=[],artPending=[];
    page.on('pageerror',e=>report.errors.push('PAGE '+e.message));
    page.on('response',r=>{const url=new URL(r.url());
      if(url.pathname.endsWith('/game.js'))pending.push(r.body().then(b=>{report.gameSha256=sha(b);assert.equal(report.gameSha256,report.expectedGameSha256,'Actual HTTP game SHA');fs.writeFileSync(path.join(out,'game-http.js'),b);}));
      if(/\/casual\/bosses\/(?:inf\/directional|extreme)\//.test(url.pathname)&&r.status()===200)artPending.push(r.body().then(b=>report.artResponses.push({url:r.url(),sha256:sha(b),bytes:b.length,status:200})));
      if(r.status()>=400){const row={url:r.url(),status:r.status()};if(/\/audio\/bgm-(lobby|battle|boss)\.(ogg|mp3)$/.test(url.pathname)&&r.status()===404)report.optionalAudioErrors.push(row);else report.errors.push(row);}
    });
    page.on('requestfailed',r=>{if(/\/(casual|dice)\//.test(new URL(r.url()).pathname))report.errors.push({url:r.url(),failure:r.failure()});});
    await page.addInitScript(()=>{localStorage.setItem('dk_coachDone','1');localStorage.setItem('dk_infHelpSeen','1');});
    const url=new URL('index.html',base);url.searchParams.set('net','off');url.searchParams.set('unlock','all');url.searchParams.set('footworkQA',Date.now());
    await page.goto(url.href);await page.waitForFunction(()=>window.DK&&DK.phase==='title'&&window.DKART?.state().initialized,null,{timeout:120000});await Promise.all(pending);
    assert.equal(report.gameSha256,report.expectedGameSha256);
    report.entries=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>{const e=DKART.entry(id);if(!e)throw Error('No ready '+id);return[id,e];})),ids);
    fs.writeFileSync(path.join(out,'runtime-entries.json'),JSON.stringify(report.entries,null,2)+'\n');
    // Preserve runtime-selected PNG/WebP and explicit PNG alternatives when supplied.
    for(const id of ids)for(const [view,v]of Object.entries(report.entries[id].views)){
      assert.equal(v.frames,8,id+' frames');
      for(const [kind,file]of Object.entries(v).filter(([k,v])=>/^(still|sheet)(?:Png|Webp)?$/i.test(k)&&typeof v==='string'&&!v.startsWith('data:'))){
        const u=new URL(file,base),name=`assets/${id}-${view}-${kind}${path.extname(u.pathname)}`;await pin(u.href,name);
      }
    }
    report.entryMetadata=withoutData(report.entries);delete report.entries;flush();console.log('PINNED',report.http.length,'HTTP textures; game',report.gameSha256);
    await page.click('#ov-btn');await page.evaluate(()=>{DKstartInf('extreme');DK.muted=true;DK.speed=1;DK.lives=99999;});
    await page.waitForFunction(()=>DK.phase==='playing');await page.evaluate(installObserver);
    for(const id of ids){
      const wave=report.entryMetadata[id].wave,actor={id,wave,poses:[],directions:[]};report.actors.push(actor);
      await page.evaluate(w=>{__bossQA.capture=null;DK.paused=false;DK.enemies=[];DK.spawnQ=[];DK.towers=[];DK.projs=[];DK.wave=w-1;DK.waveActive=false;DK.autoT=0;DKsync();},wave);
      await page.click('#wave-btn');
      await page.evaluate(()=>{DK.spawnQ=DK.spawnQ.map(item=>({...item,t:0}));});
      await page.waitForFunction(id=>DK.enemies.some(e=>e.artAssetId===id),id,{timeout:20000});
      actor.spawn=await page.evaluate(id=>{const e=DK.enemies.find(e=>e.artAssetId===id);DK.spawnQ=[];DK.enemies=[e];e.hp=e.max=1e12;e.entranceT=-1;DK.paused=true;__bossQA.capture=id;return{id:e.artAssetId,wave:e.wave,role:e.bossRole,drawHeight:e.drawHeight,size:e.def.size,type:e.type,speed:e.def.speed,lane:e.lane};},id);
      assert.equal(actor.spawn.id,id);assert.equal(actor.spawn.wave,wave);
      actor.segment=await page.evaluate(moveTo,{direction:'down'});
      await page.waitForFunction(id=>__bossQA.rows.some(r=>r.id===id&&r.view==='front'),id,{timeout:30000});
      const files=[],screens=[];
      for(let index=0;index<8;index++){
        await page.evaluate(({id,index})=>{const e=DK.enemies[0],a=DKART.entry(id);e.artWalkDistance=(index+.25)/8*a.cycleStride*e.drawHeight/a.referenceHeight;__bossQA.rows=[];},{id,index});
        await page.waitForFunction(index=>__bossQA.rows.some(r=>r.view==='front'&&Math.floor(r.phase*8)===index),index,{timeout:10000});
        const row=await page.evaluate(()=>__bossQA.rows.at(-1));assert.equal(row.view,'front');assert.equal(Math.floor(row.phase*8),index);assert.equal(row.flipX,false);assert.ok(row.alphaPixels>0);assert.ok(row.pivotResidual<1e-7);
        const b=row.box;
        assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=report.viewport.width&&b.y+b.height<=report.viewport.height,'Full boss foreground on phone');
        const file=`${id}-front-${index+1}.png`;screens.push(await page.screenshot());files.push(path.join(out,file));actor.poses.push({index,...row,file});
        if(index===0)fs.writeFileSync(path.join(out,id+'-front-game.png'),screens[0]);
      }
      assert.equal(new Set(actor.poses.map(p=>p.serial)).size,8,'Eight distinct actual sheet canvases');
      // A fixed screen region and common display scale preserve root/foot drift.
      const boxes=actor.poses.map(p=>p.box),left=Math.max(0,Math.floor(Math.min(...boxes.map(b=>b.x))-12)),top=Math.max(0,Math.floor(Math.min(...boxes.map(b=>b.y))-12));
      actor.captureClip={left,top,width:Math.min(report.viewport.width,Math.ceil(Math.max(...boxes.map(b=>b.x+b.width))+12))-left,height:Math.min(report.viewport.height,Math.ceil(Math.max(...boxes.map(b=>b.y+b.height))+12))-top};
      for(let index=0;index<8;index++)await sharp(screens[index]).extract(actor.captureClip).png().toFile(files[index]);
      await board(files,path.join(out,id+'-front-board.png'),id+' DOWN / actual game / 8 phase fixtures');
      // Separate normal-time movement; no forced artDirection or per-frame phase.
      actor.naturalSegment=await page.evaluate(moveTo,{direction:'down',fraction:.12});
      await page.evaluate(()=>{__bossQA.rows=[];DK.paused=false;});
      await page.waitForFunction(()=>new Set(__bossQA.rows.filter(r=>r.view==='front').map(r=>r.serial)).size===8,null,{timeout:20000});
      actor.natural=await page.evaluate(()=>{DK.paused=true;const rows=__bossQA.rows.filter(r=>r.view==='front');return{first:rows[0],last:rows.at(-1),frames:new Set(rows.map(r=>r.serial)).size,observed:rows.length};});
      assert.ok(actor.natural.last.walk>actor.natural.first.walk);assert.ok(actor.natural.last.dist>actor.natural.first.dist);assert.equal(actor.natural.frames,8);
      for(const [direction,view]of [['right','side'],['left','side'],['up','back']]){
        await page.evaluate(moveTo,{direction});await page.evaluate(()=>{DK.paused=false;});
        await page.waitForFunction(({view,flip})=>__bossQA.rows.some(r=>r.view===view&&r.flipX===flip),{view,flip:direction==='left'},{timeout:30000});
        const row=await page.evaluate(()=>{DK.paused=true;return __bossQA.rows.at(-1);});assert.equal(row.view,view);assert.equal(row.flipX,direction==='left');actor.directions.push({direction,...row});
      }
      flush();console.log('ACTOR PASS',id,'front8, natural8, right/left/up');
    }
    await Promise.all(artPending);
    report.versionRequests=[];
    for(const id of ids)for(const view of ['front','side','back']){
      const e=report.entryMetadata[id],v=e.views[view],pathname=new URL(v.sheet,base).pathname,expected=String(v.assetVersion??e.assetVersion);
      const requests=report.artResponses.filter(r=>new URL(r.url).pathname===pathname);
      assert.ok(requests.length,'Actual browser sheet request '+id+' '+view);
      const pinned=report.http.find(r=>r.file.startsWith(`assets/${id}-${view}-sheet.`));
      for(const r of requests){assert.equal(new URL(r.url).searchParams.get('v'),expected,id+' '+view+' request version');assert.equal(r.sha256,pinned.sha256,id+' '+view+' actually loaded HTTP bytes');}
      report.versionRequests.push({id,view,version:expected,requests:requests.length,sha256:pinned.sha256});
    }
    if(opt('compare')){
      const before=JSON.parse(fs.readFileSync(path.join(root,opt('compare'),'report.json'),'utf8'));report.comparison={label:before.label,sideBackFiles:0,metadata:0,frontFilesChanged:[],frontFallbacksChanged:0};
      for(const id of ids){
        const a=before.entryMetadata[id],b=report.entryMetadata[id];assert.ok(a,'Missing baseline '+id);
        for(const key of ['assetId','wave','role','locomotion','referenceHeight','cycleStride'])assert.deepEqual(b[key],a[key],id+' invariant '+key);
        for(const view of ['side','front','back'])for(const key of ['frames','cols','rows','cell','pivot','scale','referenceHeight'])assert.deepEqual(b.views[view][key],a.views[view][key],id+' '+view+' '+key);
        for(const view of ['side','back'])assert.deepEqual(b.views[view],a.views[view],id+' '+view+' complete metadata/fallback unchanged');
        const front=v=>Object.fromEntries(Object.entries(v).filter(([k])=>!['fallback','assetVersion'].includes(k)));
        assert.deepEqual(front(b.views.front),front(a.views.front),id+' front geometry/source paths unchanged');
        if(b.views.front.fallback.sha256!==a.views.front.fallback.sha256)report.comparison.frontFallbacksChanged++;
        assert.deepEqual(report.actors.find(r=>r.id===id).spawn,before.actors.find(r=>r.id===id).spawn,id+' runtime spawn fields unchanged');
        report.comparison.metadata++;
        for(const file of report.http.filter(r=>new RegExp('^assets/'+id+'-(?:side|front|back)-').test(r.file))){const old=before.http.find(r=>r.file===file.file);assert.ok(old,'Missing baseline file '+file.file);if(/-(side|back)-/.test(file.file)){assert.equal(file.sha256,old.sha256,file.file+' must be unchanged');report.comparison.sideBackFiles++;}else if(file.sha256!==old.sha256)report.comparison.frontFilesChanged.push(file.file);}
      }
      assert.equal(report.comparison.sideBackFiles,ids.length*4);
      report.comparison.gifs=[];for(const id of ['b040','b090','b201'].filter(id=>ids.includes(id)))report.comparison.gifs.push(await comparisonGif(before,id));
    }
    assert.deepEqual(report.errors,[]);report.pass=true;
  }catch(e){report.errors.push(e.stack||String(e));process.exitCode=1;}
  finally{report.finishedAt=new Date().toISOString();flush();await browser.close();console.log(JSON.stringify({pass:report.pass,actors:report.actors.length,pinnedFiles:report.http.length,gameSha256:report.gameSha256,out,errors:report.errors}));}
})();
