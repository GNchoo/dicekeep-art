(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DKMOTION = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const TAU = Math.PI * 2;
  function paintEnemy(g, cv, place) {
    if (cv?.width && place.h > 0) g.drawImage(cv, place.x, place.y, place.w, place.h);
  }
  function family(face) {
    return face <= 6 ? ['laser', 'cannon', 'arcane', 'frost', 'lightning', 'dice'][face - 1]
      : face <= 10 ? 'star' : face <= 13 ? 'nebula' : face <= 17 ? 'epic' : face <= 19 ? 'myth' : 'primal';
  }
  const COLORS = { laser: '#ff6652', cannon: '#ffb752', arcane: '#bc8bff', frost: '#94efff', lightning: '#ffe976', dice: '#ff7560', star: '#80dfff', nebula: '#c39aff', epic: '#ddd0ff', myth: '#ffda75', primal: '#ff98e1' };
  const STAR_FX = Object.freeze({
    7: ['쌍결정', '#8aeaff'], 8: ['프리즘', '#a3c8ff'], 9: ['혜성', '#61bcff'], 10: ['별왕관', '#c8f6ff'],
    11: ['차원문', '#b889ff'], 12: ['천공 돌풍', '#b9b1ff'], 13: ['중력핵', '#b77dff'], 14: ['쌍성', '#ff9bda'],
    15: ['성익', '#fff2ac'], 16: ['천공창', '#ffd383'], 17: ['태양', '#ffb957'], 18: ['옥좌 광륜', '#fff4ce'],
    19: ['차원 절단', '#ff7ddb'], 20: ['초신성', '#cea3ff'],
  });
  function polygon(g, points) {
    g.beginPath(); g.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
    g.closePath(); g.fill(); g.stroke();
  }
  function star(g, x, y, r, tips = 4) {
    g.beginPath();
    for (let i = 0; i < tips * 2; i++) {
      const a = i * Math.PI / tips - Math.PI / 2, d = r * (i % 2 ? .3 : 1);
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath(); g.fill(); g.stroke();
  }
  function arc(g, x, y, rx, ry, angle = 0, start = 0, end = TAU) {
    g.beginPath(); g.ellipse(x, y, rx, ry, angle, start, end); g.stroke();
  }
  // Authored silhouettes, not recolored dice. All motion is derived from age;
  // no per-frame particles, random draws, image decoding or blur surfaces.
  function starGlyph(g, face, age) {
    const color = STAR_FX[face][1], sheen = g.createLinearGradient(-10,-10,10,10);
    sheen.addColorStop(0,'#fffdf0'); sheen.addColorStop(.3,color); sheen.addColorStop(.8,color); sheen.addColorStop(1,'#554575');
    g.fillStyle = sheen; g.strokeStyle = color; g.lineWidth = 1.5;
    switch (face) {
      case 7:
        for (const y of [-5, 5]) polygon(g, [-11,y,2,y-3,13,y,2,y+3]);
        break;
      case 8:
        polygon(g, [13,0,-7,-10,-7,10]);
        g.strokeStyle = '#ff95d8'; g.beginPath(); g.moveTo(-6,-9); g.lineTo(2,0); g.lineTo(-6,9); g.stroke();
        g.strokeStyle = '#8affec'; g.beginPath(); g.moveTo(2,0); g.lineTo(12,0); g.stroke();
        break;
      case 9:
        polygon(g, [-22,-6,8,-4,13,0,7,5,-28,7,-14,0]);
        g.fillStyle = '#fffbed'; star(g, 7,0,6); break;
      case 10:
        g.rotate(age * 2); star(g,0,0,14,5); arc(g,0,0,18,7,-.4,.2,2.8); break;
      case 11:
        arc(g,0,0,8,14); arc(g,0,0,4,9);
        for (const x of [-13,13]) polygon(g,[x,-5,x+3,0,x,5,x-3,0]); break;
      case 12:
        for (let i=0;i<3;i++) { g.lineWidth=3-i*.6; arc(g,-i*5,(i-1)*5,13-i*2,6,0,-1.7,1.8); } break;
      case 13:
        g.fillStyle='#291545'; g.beginPath();g.arc(0,0,8,0,TAU);g.fill();
        arc(g,0,0,16,5,age*2);arc(g,0,0,13,5,-age*2-1); break;
      case 14:
        for (const a of [age*5,age*5+Math.PI]) { const x=Math.cos(a)*8,y=Math.sin(a)*8;
          g.fillStyle=a===age*5?'#ffd89f':'#cb9aff';star(g,x,y,7,4); } break;
      case 15:
        for (const side of [-1,1]) polygon(g, [10,0,-4,side*13,-13,side*12,-5,side*7,-18,side*7,-8,side*2]);
        break;
      case 16:
        polygon(g, [21,0,6,-5,8,-2,-19,-2,-19,2,8,2,6,5]);break;
      case 17:
        g.rotate(age);star(g,0,0,15,8);g.fillStyle='#fff7bc';g.beginPath();g.arc(0,0,6,0,TAU);g.fill();break;
      case 18:
        polygon(g,[-12,4,-13,-8,-6,-2,0,-12,6,-2,13,-8,12,4]);
        arc(g,0,8,15,4);break;
      case 19:
        g.beginPath();g.moveTo(-15,-11);g.quadraticCurveTo(11,-9,16,1);g.quadraticCurveTo(2,0,-15,11);
        g.quadraticCurveTo(-3,0,-15,-11);g.closePath();g.fill();g.stroke();break;
      case 20:
        g.fillStyle='#6d358b';g.beginPath();g.arc(0,0,9,0,TAU);g.fill();g.stroke();
        g.strokeStyle='#8cf1ff';arc(g,0,0,19,6,-.5);g.strokeStyle='#ffb5eb';arc(g,0,0,17,5,.6);
        g.fillStyle='#ffffff';star(g,0,0,6);break;
    }
  }
  function paintProjectile(g, p) {
    if (!STAR_FX[p.fxFace]) return false;
    g.save(); g.rotate(p.rot || 0); starGlyph(g,p.fxFace,p.visualAge || 0); g.restore();
    return true;
  }
  function paintStarImpact(g, f) {
    if (!STAR_FX[f.face]) return;
    const u=Math.max(0,Math.min(1,f.t/f.dur)), bloom=1-Math.pow(1-u,3), fade=(1-u)**.7;
    g.save();g.translate(f.x,f.y);g.scale(f.size/100,f.size/100);
    g.globalAlpha*=fade;g.lineCap='round';g.lineJoin='round';
    const color=STAR_FX[f.face][1], radius=10+18*bloom;
    const core=g.createRadialGradient(0,0,0,0,0,radius);
    core.addColorStop(0,'#fffbed');core.addColorStop(.18,color);core.addColorStop(1,color+'00');
    g.fillStyle=core;g.fillRect(-radius,-radius,radius*2,radius*2);
    g.fillStyle=color;g.strokeStyle=color;g.lineWidth=2.2;
    const r=8+bloom*27;
    switch(f.face) {
      case 7:
        for(const side of [-1,1])for(let i=0;i<3;i++){g.save();g.rotate(side*.55+(i-1)*.32);polygon(g,[side*r,-3,side*(r+14),0,side*r,3,side*(r-5),0]);g.restore();}break;
      case 8:
        for(let i=0;i<3;i++){g.save();g.rotate(i*TAU/3);g.strokeStyle=['#ffacd5','#a7ffdc','#a8d8ff'][i];g.fillStyle=['#805c9f','#478c91','#596eaf'][i];polygon(g,[r,0,-r*.5,-r*.65,-r*.5,r*.65]);g.restore();}break;
      case 9:
        g.rotate(f.angle || 0);polygon(g,[-r*1.6,-8,10,-3,r,0,10,6,-r*1.8,11,-r*.6,0]);
        g.fillStyle='#fffcee';star(g,9,0,13*(1-u),4);break;
      case 10:
        for(let i=0;i<5;i++){const a=i*TAU/5-Math.PI/2;star(g,Math.cos(a)*r,Math.sin(a)*r,9*(1-u)+2,5);}star(g,0,0,12*(1-u),5);break;
      case 11:
        arc(g,0,0,r*.55,r);arc(g,0,0,r*.36,r*.78);
        for(const side of [-1,1])polygon(g,[side*r*.7,-10,side*r,0,side*r*.7,10,side*r*.8,0]);break;
      case 12:
        for(let i=0;i<3;i++){g.lineWidth=4-i;arc(g,0,(i-1)*9,r-i*4,9+i*3,u*2+i*.4,-1.6,2.7);}break;
      case 13: {
        const pull=u<.45?1-u/.45:u-.45;
        g.fillStyle='#20122e';g.beginPath();g.arc(0,0,Math.max(1,18*(1-u)),0,TAU);g.fill();
        for(let i=0;i<5;i++){const a=i*TAU/5+u;star(g,Math.cos(a)*(8+pull*34),Math.sin(a)*(8+pull*22),4);}arc(g,0,0,9+pull*30,5+pull*13,-u);break;
      }
      case 14:
        for(const side of [-1,1]){g.fillStyle=side<0?'#cfabff':'#ffd2a8';star(g,side*r*.55,side*r*.24,18*(1-u)+4,4);arc(g,side*r*.35,0,r*.7,r*.45,side*u);}break;
      case 15:
        for(const side of [-1,1])for(let i=0;i<4;i++){const x=side*(8+i*7+bloom*8),y=-i*6-8;
          polygon(g,[side*3,10,x,y,x+side*(9+bloom*6),y-11,x+side*4,y+8]);}break;
      case 16:
        g.rotate(f.angle || 0);polygon(g,[-r*1.7,-2,r*1.5,-2,r*1.9,0,r*1.5,2,-r*1.7,2]);
        for(const side of [-1,1])polygon(g,[-4,side*4,7,side*r*.55,1,side*r*.52,-8,side*8]);break;
      case 17:
        star(g,0,0,r,10);g.fillStyle='#fff5b8';g.beginPath();g.arc(0,0,13*(1-u)+2,0,TAU);g.fill();break;
      case 18:
        g.globalAlpha*=.65;polygon(g,[-8,14,-17,-r*1.7,17,-r*1.7,8,14]);g.globalAlpha/= .65;
        for(let i=0;i<3;i++)arc(g,0,-i*12-bloom*8,r*(1-i*.18),6);break;
      case 19:
        for(const side of [-1,1]){g.save();g.rotate(side*.65);polygon(g,[-r*1.4,0,-5,-4,r*1.4,0,5,4]);g.restore();}break;
      case 20:
        g.rotate(-.35);g.strokeStyle='#abedff';arc(g,0,0,r*1.45,r*.45);g.strokeStyle='#ffb2ec';arc(g,0,0,r,r*.65,1.2);
        g.fillStyle='#faf2ff';star(g,0,0,(u<.3?8+u*55:25*(1-u)),8);
        for(let i=0;i<6;i++){const a=i*TAU/6+u;star(g,Math.cos(a)*r,Math.sin(a)*r,4*(1-u)+1);}break;
    }
    g.restore();
  }
  // Anchors on trimmed default art: lens, barrel mouths, amethyst focus,
  // ice tip, brass terminal and open crown mortar.
  const PORTS = { 1: [[.34, .66]], 2: [[.20, .66], [.40, .71]], 3: [[.55, .39]], 4: [[.52, .07]], 5: [[.51, .06]], 6: [[.52, .15]] };
  const SKIN_PORTS = { 2: [[.24, .65], [.43, .71]], 3: [[.53, .39]], 4: [[.51, .23]], 5: [[.49, .28]], 6: [[.51, .22]] };
  function port(t, starPort) {
    const ports = (t.skin > 0 && SKIN_PORTS[t.face]) || PORTS[t.face] || [starPort || [.5, .2]];
    return ports[Math.max(0, (t.shotSerial || 1) - 1) % ports.length];
  }
  // Add light at release only. Never cut, repaint, rotate or move any tower pixels.
  // The existing game renderer owns the original whole-tower recoil and glow.
  function paintMuzzle(g, t, sp, starPort) {
    const age = t.muzzleAge, duration = t.face === 2 ? .14 : .18;
    if (!Number.isFinite(age) || age < 0 || age >= duration) return;
    const u = age / duration, fade = (1 - u) ** 2;
    const xy = port(t, starPort), k = (t.kick || 0) ** 2;
    const x = xy[0] * sp.w - sp.cx, y = xy[1] * sp.h - sp.baseY;
    const type = family(t.face), r = (t.face === 2 ? 8 : 6) * (1 + u * .6);
    g.save(); g.scale(1 + k * .07, 1 - k * .09); g.translate(x, y);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha *= fade;
    g.fillStyle = COLORS[type]; g.strokeStyle = COLORS[type]; g.lineWidth = 1.2;
    if (t.def?.star && STAR_FX[t.face]) {
      g.scale(.55 + u*.5,.55 + u*.5); starGlyph(g,t.face,age);
    } else if (type === 'cannon') {
      g.beginPath(); g.moveTo(-r * 1.6, r * .5); g.lineTo(-r * .4, -r * .25);
      g.lineTo(0, -r * .8); g.lineTo(r * .25, -r * .15); g.lineTo(r * .7, 0);
      g.lineTo(r * .1, r * .3); g.lineTo(-r * .4, r * .8); g.closePath(); g.fill();
    } else if (type === 'lightning') {
      g.beginPath(); g.moveTo(-r, 1); g.lineTo(-r * .25, -r * .6); g.lineTo(0, 0);
      g.lineTo(r * .3, -r); g.lineTo(r, -r * .3); g.stroke();
    } else {
      g.beginPath(); g.ellipse(0, 0, r, r * .65, 0, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(-r * 1.2, 0); g.lineTo(r * 1.2, 0); g.moveTo(0, -r); g.lineTo(0, r); g.stroke();
    }
    g.fillStyle = '#fff7de'; g.beginPath(); g.arc(0, 0, 1.4 + fade, 0, TAU); g.fill();
    g.restore();
  }
  return Object.freeze({ paintEnemy, paintMuzzle, paintProjectile, paintStarImpact, port, family, COLORS, STAR_FX });
});
