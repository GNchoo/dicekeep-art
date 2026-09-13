(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DKMOTION = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  // Preserve authored monster frames. Upper-body strip warping was rejected in
  // visual review; it bent armor and faces like a ripple filter.
  const TAU = Math.PI * 2, clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const noise = x => { const n = Math.sin(x * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
  function paintEnemy(g, cv, place) {
    if (!cv?.width || !(place.h > 0)) return;
    g.drawImage(cv, place.x, place.y, place.w, place.h);
  }
  function family(face) {
    return face <= 6 ? ['laser', 'cannon', 'arcane', 'frost', 'lightning', 'dice'][face - 1]
      : face <= 10 ? 'star' : face <= 13 ? 'nebula' : face <= 17 ? 'epic' : face <= 19 ? 'myth' : 'primal';
  }
  const COLORS = { laser: '#baff83', cannon: '#ffb752', arcane: '#bc8bff', frost: '#94efff', lightning: '#ffe976', dice: '#ff7560', star: '#80dfff', nebula: '#c39aff', epic: '#ddd0ff', myth: '#ffda75', primal: '#ff98e1' };
  const PORTS = {
    1: [[.34, .66]], 2: [[.24, .65], [.43, .71]], 3: [[.53, .39]],
    4: [[.51, .23]], 5: [[.49, .28]], 6: [[.51, .22]],
  };
  function towerPorts(face, sp, starPort) {
    const points = PORTS[face] || [starPort || [.5, .2]];
    return points.map(([x, y]) => ({ x: x * sp.w - sp.cx, y: y * sp.h - sp.baseY, radius: Math.min(9, sp.h * (face === 2 ? .055 : .07)) }));
  }
  function towerPose(t) {
    const age = Number.isFinite(t.attackAge) ? t.attackAge : 10;
    const recoil = age < .38 ? Math.sin(Math.min(1, age / .055) * Math.PI / 2) * Math.exp(-Math.max(0, age - .055) * 12) : 0;
    const charge = t.shotSerial && t.cd > 0 && t.cd < .19 ? smooth(1 - t.cd / .19) : 0;
    return { age, recoil, charge, release: age < .23 ? Math.pow(1 - age / .23, 2) : 0 };
  }
  function polygon(g, radius, n, rotation = 0, inner = 1) {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = rotation + i * Math.PI / n, r = radius * (i % 2 ? inner : 1); const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath();
  }
  function paintTower(g, t, sp, starPort) {
    const pose = towerPose(t), type = family(t.face), ports = towerPorts(t.face, sp, starPort);
    // Masonry and the base remain absolutely still during every attack phase.
    g.drawImage(sp.cv, -sp.cx, -sp.baseY);
    if (!(pose.recoil || pose.charge || pose.release)) return;
    for (let i = 0; i < ports.length; i++) {
      const p = ports[i], active = t.face !== 2 || i === ((t.shotSerial || 1) - 1) % ports.length;
      const kick = active ? pose.recoil : 0, r = p.radius;
      g.save(); g.translate(p.x, p.y);
      // Local cutout inside the original gun socket / crystal housing. The
      // socket hides uncovered pixels as the mechanism slides into its mount.
      if (kick > .01 && (type === 'cannon' || !['laser', 'lightning'].includes(type))) {
        g.save(); g.beginPath(); g.ellipse(0, 0, r, r * 1.15, 0, 0, TAU); g.clip();
        g.fillStyle = type === 'cannon' ? '#211c19' : '#222236'; g.fillRect(-r, -r * 1.2, r * 2, r * 2.4);
        const dx = type === 'cannon' ? kick * 3.2 : Math.sin(pose.age * 16) * kick * .8;
        const dy = type === 'cannon' ? -kick * 1.7 : -kick * 2.2;
        g.drawImage(sp.cv, -sp.cx - p.x + dx, -sp.baseY - p.y + dy); g.restore();
      }
      const energy = pose.charge * .8 + (active ? pose.release : 0);
      g.globalCompositeOperation = 'lighter'; g.strokeStyle = COLORS[type]; g.fillStyle = COLORS[type];
      g.globalAlpha = clamp(energy); g.lineWidth = 1.25;
      if (type === 'cannon') {
        if (pose.release > 0 && active) { g.rotate(t.attackAim || 0); polygon(g, r * (1.2 + pose.release), 4, 0, .3); g.fill(); }
      } else if (type === 'laser') {
        g.beginPath(); g.arc(0, 0, r * (.3 + energy * .55), 0, TAU); g.stroke();
        g.fillRect(-r * .55, -1, r * 1.1, 2);
      } else if (type === 'lightning') {
        for (let j = 0; j < 3; j++) { g.beginPath(); const x = (j - 1) * r; g.moveTo(x, r); g.lineTo(x + r * .4, -r * .1); g.lineTo(x - r * .1, -r * .4); g.lineTo(0, -r * 1.6); g.stroke(); }
      } else {
        g.rotate(pose.age * 4); polygon(g, r * (1 + energy * .7), type === 'frost' ? 6 : 4, 0, .72); g.stroke();
        for (let j = 0; j < 3; j++) { const a = j * TAU / 3, rr = r * (1.6 - pose.charge * .6); g.beginPath(); g.arc(Math.cos(a) * rr, Math.sin(a) * rr * .7, 1.3, 0, TAU); g.fill(); }
      }
      g.restore();
    }
  }
  function emitter(t, sp, starPort) {
    const ports = towerPorts(t.face, sp, starPort), port = ports[Math.max(0, (t.shotSerial || 1) - 1) % ports.length];
    return { x: t.x + port.x, y: t.y + 6 + port.y };
  }
  function paintProjectile(g, p, at) {
    const type = family(p.src?.face || p.star || ({ shell: 2, bolt: 3, frostShard: 4 }[p.kind] || 6));
    const col = COLORS[type], age = p.visualAge || 0, trail = p.trail || [];
    g.save(); g.lineCap = 'round';
    if (trail.length > 1) {
      for (let i = 1; i < trail.length; i++) { const u = i / trail.length; g.globalAlpha = u * .45; g.strokeStyle = col; g.lineWidth = (type === 'cannon' ? 3 : 5) * u;
        g.beginPath(); g.moveTo(trail[i - 1].x, trail[i - 1].y); g.lineTo(trail[i].x, trail[i].y); g.stroke(); }
    }
    g.globalAlpha = 1; g.translate(at.x, at.y); g.rotate(p.rot || 0);
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.5;
    if (type === 'cannon') {
      g.fillStyle = '#50332b'; g.fillRect(-9, -4, 14, 8); g.fillStyle = '#ffcc79'; g.beginPath(); g.ellipse(5, 0, 4, 4, 0, 0, TAU); g.fill();
      g.strokeStyle = '#e49449'; g.strokeRect(-8, -3.5, 11, 7); g.fillStyle = '#fff0b8'; g.fillRect(-5, -3, 6, 1);
    } else if (type === 'frost' || type === 'star' || type === 'epic') {
      g.scale(1.35, .7); polygon(g, type === 'epic' ? 11 : 9, type === 'frost' ? 3 : 4, 0, .38); g.fill();
      g.fillStyle = '#f4ffff'; polygon(g, 5, 4, 0, .3); g.fill();
      if (type === 'epic') { g.strokeStyle = '#ffffff'; g.beginPath(); g.moveTo(-15, -7); g.lineTo(-3, 0); g.lineTo(-15, 7); g.stroke(); }
    } else if (type === 'dice') {
      g.rotate(p.spin || 0); g.fillStyle = '#ed694f'; g.fillRect(-7, -7, 14, 14); g.strokeStyle = '#ffd6a4'; g.strokeRect(-7, -7, 14, 14);
      g.fillStyle = '#fff6dc'; for (const x of [-3, 3]) for (const y of [-3, 0, 3]) { g.beginPath(); g.arc(x, y, 1, 0, TAU); g.fill(); }
    } else if (type === 'myth') {
      g.rotate(age * 10); for (const flip of [1, -1]) { g.save(); g.scale(flip, flip); g.beginPath(); g.moveTo(-11, 0); g.quadraticCurveTo(4, -14, 11, 0); g.quadraticCurveTo(3, -5, -11, 0); g.fill(); g.restore(); }
      g.fillStyle = '#fffbe8'; polygon(g, 4, 4, -age * 10, .3); g.fill();
    } else {
      const r = type === 'primal' ? 10 : 7;
      g.globalAlpha = .28; g.beginPath(); g.ellipse(0, 0, r * 1.8, r * 1.4, 0, 0, TAU); g.fill(); g.globalAlpha = 1;
      g.fillStyle = type === 'primal' ? '#281638' : '#f3dfff'; g.beginPath(); g.arc(0, 0, r * .7, 0, TAU); g.fill();
      g.rotate(age * 7); g.scale(1, .55); g.beginPath(); g.arc(0, 0, r * 1.4, .1, Math.PI * 1.8); g.stroke();
      if (type === 'nebula' || type === 'primal') { g.rotate(1.4); g.beginPath(); g.arc(0, 0, r * 1.7, 0, Math.PI * 1.6); g.stroke(); }
    }
    g.restore();
  }
  function paintImpact(g, f) {
    const p = clamp(f.t / f.dur), type = f.family || 'arcane', col = COLORS[type], seed = f.seed || 0;
    const size = Math.min(type === 'primal' ? 150 : 78, f.size || 42), r = size * .5;
    g.save(); g.translate(f.x, f.y); g.globalAlpha = (1 - p) ** 1.2;
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2 * (1 - p) + .6;
    if (f.kind === 'combatShard') {
      g.rotate((f.seed || 0) + p * 4); polygon(g, Math.min(9, f.size * .24) * (1 - p * .5), 3, 0, .4); g.fill(); g.restore(); return;
    }
    if (f.kind === 'combatHalo') {
      g.scale(1, .65); g.rotate(p * .7); polygon(g, r * (.25 + p), type === 'myth' ? 3 : type === 'epic' ? 4 : 6, 0, .88); g.stroke(); g.restore(); return;
    }
    if (type === 'cannon' || type === 'dice') {
      // Fast hot core, elliptical pressure front and lingering smoke fragments.
      g.save(); g.scale(1, .48); g.beginPath(); g.arc(0, 0, r * (.2 + p * 1.1), 0, TAU); g.stroke(); g.restore();
      if (p < .45) { g.fillStyle = '#fff2c2'; polygon(g, r * (1 - p), 7, seed, .34); g.fill(); }
      for (let i = 0; i < 5; i++) { const a = i * TAU / 5 + seed, d = r * p * (.6 + noise(i + seed) * .4);
        g.fillStyle = i % 2 ? '#a88b7c' : col; g.globalAlpha = (1 - p) * (i % 2 ? .25 : .8); g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d * .6 - p * 7, 2 + p * 6, 2 + p * 4, a, 0, TAU); g.fill(); }
    } else if (type === 'frost') {
      g.rotate(seed); for (let i = 0; i < 6; i++) { g.save(); g.rotate(i * TAU / 6); g.translate(r * p * .7, 0); g.beginPath(); g.moveTo(0, -2); g.lineTo(r * (1 - p) * .65, 0); g.lineTo(0, 2); g.lineTo(-3, 0); g.closePath(); g.fill(); g.restore(); }
      g.globalAlpha *= .4; polygon(g, r * (.4 + p * .35), 6, 0, .82); g.stroke();
    } else if (type === 'laser' || type === 'lightning') {
      for (let i = 0; i < (type === 'laser' ? 4 : 7); i++) { const a = i * TAU / 7 + seed, d = r * (.3 + p * .8);
        g.save(); g.rotate(a); g.beginPath(); g.moveTo(2 + p * 5, 0); g.lineTo(d * .5, -3); g.lineTo(d * .65, 2); g.lineTo(d, 0); g.stroke(); g.restore(); }
    } else {
      const sides = type === 'epic' ? 4 : type === 'myth' ? 3 : 6;
      g.save(); g.scale(1, type === 'primal' ? .6 : .8); g.rotate(seed + p * (type === 'myth' ? -2 : .8));
      polygon(g, r * (.22 + p * .8), sides, 0, type === 'star' ? .42 : .86); g.stroke();
      if (type === 'primal' || type === 'nebula') { g.rotate(.7); polygon(g, r * (.18 + p), sides, 0, .7); g.stroke(); }
      g.restore();
      for (let i = 0; i < 5; i++) { const a = i * TAU / 5 + seed, d = r * (.25 + p * .8); g.save(); g.translate(Math.cos(a) * d, Math.sin(a) * d * .75); g.rotate(a + p * 3); polygon(g, 2.5 * (1 - p) + .5, 4, 0, .4); g.fill(); g.restore(); }
      if (p < .3) { g.fillStyle = '#fff5ec'; polygon(g, r * .4 * (1 - p / .3), 4, 0, .25); g.fill(); }
    }
    g.restore();
  }
  return Object.freeze({ paintEnemy, family, COLORS, towerPorts, towerPose, paintTower, emitter, paintProjectile, paintImpact });
});
