// Standalone review artifact. All sprites and the renderer are embedded so the
// exported HTML works offline and does not connect to a paid generation service.
function motionPreview(data, source, originalTower) {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dicekeep · 모션 수정 확인 v109</title>
<style>*{box-sizing:border-box}body{margin:0;background:#171918;color:#ede9d8;font:15px system-ui,sans-serif}main{max-width:1440px;margin:auto;padding:32px}h1{font-size:28px;margin:0 0 10px}p{color:#b4b9b0;line-height:1.6}header{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}nav{display:flex;gap:10px;align-items:center}button,select{background:#303b33;color:#f1e8c9;border:1px solid #637a66;padding:10px 15px;border-radius:6px;font:inherit;cursor:pointer}section{margin-top:32px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}article{border:1px solid #39443a;border-radius:8px;overflow:hidden;background:#1e2420}h3{margin:14px 16px 4px;font-size:16px;font-weight:600}small{display:block;color:#a4ada3;margin:0 16px 8px}canvas{width:100%;height:auto;display:block}.towers{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.labels{display:flex;justify-content:space-around;color:#b4b9b0;font-size:12px;padding:0 0 8px}.note{font-size:13px;margin-top:26px}</style>
<main><header><div><h1>주사위 성채 · 기존 타워 + 발사빛 v109</h1><p>타워를 원래 상태로 복원했습니다. 오른쪽에만 발사 순간의 빛을 추가했습니다.</p></div><nav><button id="pause">일시정지</button><select id="view" aria-label="이동 방향"><option value="side">옆모습</option><option value="front">앞모습</option><option value="back">뒷모습</option></select><select id="speed" aria-label="재생 속도"><option value="1">기본 속도</option><option value=".5">절반 속도</option></select></nav></header>
<section><h2>몬스터와 보스</h2><div class="grid" id="actors"></div></section><section><h2>타워 발사 효과</h2><p>타워 형태와 기존 공격 모션은 양쪽이 같습니다. 투사체와 명중 효과도 원래 표현입니다.</p><div class="grid towers" id="towers"></div></section><p class="note">몬스터 양쪽은 동일한 원본 동작을 사용합니다. 타워에는 짧은 포구 섬광과 마법빛만 추가했습니다. 몬스터의 표시 크기는 비교하기 쉽게 통일했습니다. 생성 서비스나 추가 결제 없이 브라우저에서 재생됩니다.</p></main>
<script>${source}</script><script>
const DATA=${JSON.stringify(data).replace(/</g, '\\u003c')};
const images=new Map();async function img(src){if(images.has(src))return images.get(src);const im=new Image();im.src=src;await im.decode();images.set(src,im);return im;}
let time=0,paused=false,last=0;window.setPreviewTime=t=>{time=t;paused=true;render();};
document.getElementById('pause').onclick=()=>{paused=!paused;document.getElementById('pause').textContent=paused?'재생':'일시정지';};
function panel(parent,title,note,w,h){const a=document.createElement('article');a.innerHTML='<h3>'+title+'</h3><small>'+note+'</small><canvas width="'+w+'" height="'+h+'"></canvas><div class="labels"><span>원본</span><span>현재</span></div>';document.getElementById(parent).append(a);return a.querySelector('canvas');}
for(const e of DATA.actors)e.canvas=panel('actors',e.name,e.id+' · '+({legged:'보행',flight:'비행',float:'부유',slither:'기어가기'}[e.gait]||e.gait),600,300);
for(const t of DATA.towers)t.canvas=panel('towers',t.name,DKMOTION.family(t.face),480,280);
function ground(g,w,h){g.fillStyle='#222c25';g.fillRect(0,0,w,h);g.strokeStyle='#465246';g.lineWidth=1;g.beginPath();g.moveTo(12,h-45);g.lineTo(w-12,h-45);g.moveTo(w/2,15);g.lineTo(w/2,h-20);g.stroke();}
function render(){const view=document.getElementById('view').value,cycle=1.3,phase=(time/cycle)%1;
 for(const e of DATA.actors){const v=e.views[view],frame=v.loaded[Math.floor(phase*v.loaded.length)],g=e.canvas.getContext('2d');ground(g,600,300);const scale=Math.min((e.gait==='flight'?170:190)/v.referenceHeight,244/(v.bounds[2]-v.bounds[0]),210/(v.bounds[3]-v.bounds[1])),height=scale*v.referenceHeight,place={x:-v.pivot[0]*scale,y:-v.pivot[1]*scale,w:v.cell*scale,h:v.cell*scale};
  for(let side=0;side<2;side++){g.save();g.translate((side?450:150)-((v.bounds[0]+v.bounds[2])/2-v.pivot[0])*scale,255);if(side)DKMOTION.paintEnemy(g,frame,place);else g.drawImage(frame,place.x,place.y,place.w,place.h);g.restore();}}
 for(const t of DATA.towers){const g=t.canvas.getContext('2d');ground(g,480,280);const period=1.35,age=time%period,sp={...t,cv:t.loaded},tower={face:t.face,def:{color:t.color},x:0,y:-6,kick:Math.max(0,1-Math.floor(age*60)*.045),shotSerial:Math.floor(time/period)+1,muzzleAge:age};
  for(let side=0;side<2;side++){g.save();g.translate(side?330:110,235);g.scale(1.55,1.55);const ctx=g,TS_CX=sp.cx,TS_BASE_Y=sp.baseY;const legacyPaint=${originalTower};legacyPaint(tower,sp);if(side)DKMOTION.paintMuzzle(g,tower,sp,t.port);g.restore();}
  for(let side=0;side<2;side++){
    const origin=side?330:110,k=tower.kick*tower.kick,at=t.port?{x:(t.port[0]*sp.w-sp.cx)*(1+k*.07),y:(t.port[1]*sp.h-sp.baseY)*(1-k*.09)}:{x:0,y:-70},start={x:origin+at.x*1.55,y:235+at.y*1.55},end={x:origin+95,y:40},angle=Math.atan2(end.y-start.y,end.x-start.x);
    if(t.face===1||t.face===5){if(age<.16){const im=DATA.legacy[t.face===1?'laserBeam':'lightningArc'].loaded[0];if(im){g.save();g.translate(start.x,start.y);g.rotate(angle);g.globalAlpha=1-age/.16;g.drawImage(im,0,-6,Math.hypot(end.x-start.x,end.y-start.y),12);g.restore();}}continue;}
    if(age>=.44)continue;const u=Math.min(1,age/.23),pos={x:start.x+(end.x-start.x)*u,y:start.y+(end.y-start.y)*u};
    if(u<1){const key=t.face===2?'shell':t.face===3?'bolt':t.face===4?'frostShard':'dieBomb',im=DATA.legacy[key].loaded[0];g.save();g.translate(pos.x,pos.y);g.rotate(t.face>=6?age*13:angle);if(im)g.drawImage(im,-11,-11*im.height/im.width,22,22*im.height/im.width);g.restore();}
    else{const key=t.face===2?'cannonBlast':t.face===3?'arcaneBurst':t.face===4?'frostBurst':'dieExplode',frames=DATA.legacy[key].loaded,im=frames[Math.min(frames.length-1,Math.floor((age-.23)/.3*frames.length))];if(im){g.save();g.globalAlpha=1-(age-.23);g.drawImage(im,end.x-24,end.y-24,48,48);g.restore();}}
  }
 }}

(async()=>{for(const e of DATA.actors)for(const v of Object.values(e.views))v.loaded=await Promise.all(v.frames.map(img));for(const t of DATA.towers)t.loaded=await img(t.image);for(const a of Object.values(DATA.legacy))a.loaded=await Promise.all(a.map(img));window.previewReady=true;requestAnimationFrame(function frame(ts){if(!paused)time+=(last?(ts-last)/1000:0)*Number(document.getElementById('speed').value);last=ts;render();requestAnimationFrame(frame);});})();
</script></html>`;
}
module.exports = { motionPreview };
