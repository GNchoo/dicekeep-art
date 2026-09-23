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
  const PORTS = { 1: [[.34, .66]], 2: [[.24, .65], [.43, .71]], 3: [[.53, .39]], 4: [[.51, .23]], 5: [[.49, .28]], 6: [[.51, .22]] };
  function port(t, starPort) {
    const ports = PORTS[t.face] || [starPort || [.5, .2]];
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
    if (type === 'cannon') {
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
  return Object.freeze({ paintEnemy, paintMuzzle, port, family, COLORS });
});
