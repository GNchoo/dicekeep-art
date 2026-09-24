// Continuous, lightweight reward illustrations for the canvas presentation layer.
// The chest is built from projected planes so its lid can actually turn about
// the rear hinge instead of swapping between painted frames.
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smooth = (a, b, v) => {
    const u = clamp((v - a) / (b - a), 0, 1);
    return u * u * (3 - 2 * u);
  };
  const rgba = (hex, a) => {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return `rgba(255,213,126,${a})`;
    const n = parseInt(m[1], 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };

  // Pure timing function: no random draw, previous frame or wall-clock input.
  // A brief inward dip precedes the opening; the lid reaches its high point
  // around 0.65 s and settles without a change of mesh or image.
  function chestPose(t, dur) {
    const time = Math.max(0, Number.isFinite(t) ? t : 0);
    const duration = Math.max(0.95, Number.isFinite(dur) ? dur : 1.25);
    const opening = smooth(0.18, 0.64, time);
    const overshoot = 0.11 * (smooth(0.52, 0.66, time) - smooth(0.66, 0.86, time));
    const dipPhase = clamp(time / 0.22, 0, 1);
    return {
      lidAngle: 1.28 * opening + overshoot,
      opening,
      bodyDip: 3.2 * Math.sin(Math.PI * dipPhase),
      light: smooth(0.38, 0.69, time) * (1 - smooth(duration - 0.25, duration, time)),
      stars: smooth(0.53, 0.75, time) * (1 - smooth(duration - 0.18, duration, time)),
      alpha: smooth(0, 0.07, time) * (1 - smooth(duration - 0.19, duration, time)),
    };
  }

  // The awarded die rises through the mouth, holds where its shape is readable,
  // then follows one continuous arc into the actual input tray.
  function chestDiePose(f, tray, trayDieSize = 43.5) {
    const t = Math.max(0, f.t || 0), scale = clamp(f.size || 230, 100, 270) / 230;
    const rise = 1 - Math.pow(1 - clamp((t - 0.48) / 0.60, 0, 1), 3);
    const flight = smooth(1.55, 2.2, t);
    const localY = 25 - 174 * rise;
    const localSize = 18 + 29 * rise;
    const startX = f.x + 8 * scale;
    const startY = f.y + (localY + chestPose(t, f.dur).bodyDip) * scale;
    return {
      visible: t >= 0.48, flight, localX: 8, localY, localSize,
      x: startX + (tray.x - startX) * flight,
      y: startY + (tray.y - startY) * flight - Math.sin(Math.PI * flight) * 42,
      size: localSize * scale + (trayDieSize - localSize * scale) * flight,
      turn: -0.65 * (1 - rise),
    };
  }

  function polygon(g, fill, stroke, width, x0, y0, x1, y1, x2, y2, x3, y3) {
    g.beginPath();
    g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3);
    g.closePath();
    g.fillStyle = fill; g.fill();
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
  }

  function triangle(g, x0, y0, x1, y1, x2, y2) {
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2);
    g.closePath(); g.fill();
  }

  function fourStar(g, x, y, r, color) {
    g.beginPath();
    g.moveTo(x, y - r); g.quadraticCurveTo(x + r * 0.15, y - r * 0.15, x + r, y);
    g.quadraticCurveTo(x + r * 0.15, y + r * 0.15, x, y + r);
    g.quadraticCurveTo(x - r * 0.15, y + r * 0.15, x - r, y);
    g.quadraticCurveTo(x - r * 0.15, y - r * 0.15, x, y - r);
    g.closePath(); g.fillStyle = color; g.fill();
  }

  function drawChest(g, f, drawContents) {
    if (!g || !f) return;
    const p = chestPose(f.t, f.dur);
    if (p.alpha <= 0) return;
    const size = clamp(Number.isFinite(f.size) ? f.size : 230, 100, 270);
    const accent = /^#[0-9a-f]{6}$/i.test(f.color || '') ? f.color : '#ffd57e';
    const time = Math.max(0, f.t || 0);

    g.save();
    g.translate(f.x || 0, f.y || 0);
    g.scale(size / 230, size / 230);
    g.translate(0, p.bodyDip);
    g.globalAlpha *= p.alpha;
    g.lineJoin = 'round'; g.lineCap = 'round';

    // A close, grounded contact shadow; no screen-wide halo or blur filter.
    g.fillStyle = 'rgba(18,13,28,0.48)';
    g.beginPath(); g.ellipse(4, 75, 106, 13, 0, 0, TAU); g.fill();

    // The rear wall makes the open cavity dimensional.
    polygon(g, '#4b2d29', '#3e2630', 3, -93, -24, 76, -24, 103, -5, -65, -5);

    // The front lip is a rigid plane rotating around (-92,-24)–(76,-24).
    // Project the near edge upward as the hinge angle increases.
    const c = Math.cos(p.lidAngle), s = Math.sin(p.lidAngle);
    const nearL = -92 + 28 * c, nearR = 76 + 28 * c;
    const nearY = -24 + 18 * c - 72 * s;
    const cap = Math.max(0.28, c);
    const nearTopY = nearY - 19 * cap - 5 * s;
    const backTopY = -24 - 19 * cap;

    // A darker side thickness, then one continuous arched wooden lid plane.
    polygon(g, '#73422c', '#49302b', 2.8, -92, backTopY, nearL, nearTopY, nearL, nearY, -92, -24);
    g.beginPath();
    g.moveTo(-92, backTopY);
    g.quadraticCurveTo(-8, backTopY - 24, 76, backTopY);
    g.lineTo(nearR, nearTopY);
    g.quadraticCurveTo((nearL + nearR) / 2, nearTopY - 23, nearL, nearTopY);
    g.closePath();
    const lidWood = g.createLinearGradient(0, Math.min(backTopY, nearTopY) - 12, 0, Math.max(backTopY, nearTopY) + 12);
    lidWood.addColorStop(0, '#cf8850'); lidWood.addColorStop(0.48, '#b76d3c'); lidWood.addColorStop(1, '#98502f');
    g.fillStyle = lidWood; g.fill();
    g.strokeStyle = '#4b302b'; g.lineWidth = 3; g.stroke();
    // One broad highlight follows the lid, never an independent crossfade.
    g.strokeStyle = '#e7a66a'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(-84, backTopY + 6);
    g.quadraticCurveTo(-8, backTopY - 16, 68, backTopY + 6); g.stroke();
    // Rounded-looking metal end caps frame the arch from hinge to front edge.
    polygon(g, '#bc813d', '#79502e', 2.2,
      -92, backTopY, -79, backTopY + 1, nearL + 13, nearTopY + 1, nearL, nearTopY);
    polygon(g, '#bc813d', '#79502e', 2.2,
      63, backTopY + 1, 76, backTopY, nearR, nearTopY, nearR - 13, nearTopY + 1);
    g.strokeStyle = '#ffe0a0'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-88, backTopY + 2); g.lineTo(nearL + 4, nearTopY + 1);
    g.moveTo(67, backTopY + 2); g.lineTo(nearR - 9, nearTopY + 1); g.stroke();
    for (const k of [0.17, 0.76]) {
      const bx = -92 + 168 * k, nx = nearL + 168 * k;
      polygon(g, '#d69a42', '#805329', 1.8,
        bx, backTopY, bx + 17, backTopY, nx + 17, nearTopY + 1, nx, nearTopY + 1);
      g.strokeStyle = '#ffe1a0'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(bx + 3, backTopY + 2); g.lineTo(nx + 3, nearTopY - 1); g.stroke();
    }
    g.beginPath();
    g.moveTo(nearL, nearTopY);
    g.quadraticCurveTo((nearL + nearR) / 2, nearTopY - 23, nearR, nearTopY);
    g.lineTo(nearR, nearY);
    g.quadraticCurveTo((nearL + nearR) / 2, nearY - 15, nearL, nearY);
    g.closePath();
    const lidFace = g.createLinearGradient(0, nearTopY - 10, 0, nearY + 4);
    lidFace.addColorStop(0, '#c57a43'); lidFace.addColorStop(0.6, '#9c562f'); lidFace.addColorStop(1, '#743e29');
    g.fillStyle = lidFace; g.fill();
    g.strokeStyle = '#4a302b'; g.lineWidth = 2.7; g.stroke();
    for (const edge of [nearL, nearR - 13]) {
      const capGold = g.createLinearGradient(edge, 0, edge + 13, 0);
      capGold.addColorStop(0, '#8c5c2c'); capGold.addColorStop(0.38, '#f4c66d'); capGold.addColorStop(1, '#c38a39');
      g.beginPath(); g.moveTo(edge + 2, nearTopY + 2);
      g.quadraticCurveTo(edge + 7, nearTopY - 3, edge + 13, nearTopY + 2);
      g.lineTo(edge + 13, nearY - 4);
      g.quadraticCurveTo(edge + 8, nearY + 3, edge, nearY - 3);
      g.closePath(); g.fillStyle = capGold; g.fill();
      g.strokeStyle = '#79502e'; g.lineWidth = 1.5; g.stroke();
    }
    g.strokeStyle = '#f6d181'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(nearL + 2, nearY - 1);
    g.quadraticCurveTo((nearL + nearR) / 2, nearY - 10, nearR - 2, nearY - 1); g.stroke();
    for (const x of [nearL + 7, nearR - 7]) {
      g.beginPath(); g.arc(x, nearY - 6, 3.6, 0, TAU);
      g.fillStyle = '#ffe3a0'; g.fill();
      g.strokeStyle = '#81552d'; g.lineWidth = 1.2; g.stroke();
    }

    // Light emerges from the opening in front of the raised lid, then passes
    // behind the solid chest body and front rim. The tips fade into the air.
    if (p.light > 0.002) {
      g.save();
      const ray = g.createLinearGradient(0, -13, 0, -174);
      ray.addColorStop(0, rgba(accent, 0.30));
      ray.addColorStop(0.62, rgba(accent, 0.10));
      ray.addColorStop(1, rgba(accent, 0));
      g.fillStyle = ray;
      const beamAlpha = g.globalAlpha * p.light;
      g.globalAlpha = beamAlpha * 0.7; triangle(g, -12, -13, -92, -156, -64, -151);
      g.globalAlpha = beamAlpha; triangle(g, 3, -14, -18, -174, 7, -170);
      g.globalAlpha = beamAlpha * 0.7; triangle(g, 18, -13, 65, -153, 91, -149);
      g.restore();
    }

    // The dark cavity and its colored light are clipped to the actual opening.
    // They cannot bleach the opaque front panel even at maximum rarity.
    if (p.opening > 0.015) {
      g.save();
      g.beginPath();
      g.moveTo(-91, -23); g.lineTo(76, -23); g.lineTo(102, -5); g.lineTo(-64, -5);
      g.closePath(); g.clip();
      g.globalAlpha *= p.opening;
      g.fillStyle = '#251d30'; g.fillRect(-93, -26, 199, 24);
      if (p.light > 0) {
        const glow = g.createRadialGradient(8, -12, 2, 8, -12, 79);
        glow.addColorStop(0, rgba(accent, 0.88 * p.light));
        glow.addColorStop(0.55, rgba(accent, 0.36 * p.light));
        glow.addColorStop(1, rgba(accent, 0));
        g.fillStyle = glow; g.fillRect(-93, -25, 201, 24);
      }
      g.restore();
    }

    // The emerging die shares the cavity's depth: the opaque front below clips
    // its lower half until it has actually risen above the rim.
    if (drawContents) drawContents(g);

    // Opaque side and front. Broad cel-shaded planes keep a sharp silhouette
    // when the entire chest is shrunk to roughly 230 mobile pixels.
    polygon(g, '#69402b', '#452c29', 3, -93, -21, -64, -5, -65, 63, -93, 43);
    g.beginPath(); g.moveTo(-65, -5); g.lineTo(104, -5); g.lineTo(103, 54);
    g.quadraticCurveTo(101, 65, 91, 65); g.lineTo(-55, 65);
    g.quadraticCurveTo(-65, 64, -65, 54); g.closePath();
    g.fillStyle = '#713e27'; g.fill(); g.strokeStyle = '#452c29'; g.lineWidth = 3; g.stroke();
    const frontWood = g.createLinearGradient(0, -3, 0, 61);
    frontWood.addColorStop(0, '#c47a43'); frontWood.addColorStop(0.53, '#aa5e34'); frontWood.addColorStop(1, '#88472d');
    polygon(g, frontWood, null, 0, -61, 0, 99, 0, 97, 58, -61, 58);
    polygon(g, 'rgba(255,205,135,0.12)', null, 0, -61, 0, 99, 0, 99, 16, -61, 16);
    polygon(g, '#8e492b', null, 0, -61, 43, 98, 43, 97, 58, -61, 58);
    g.strokeStyle = '#754026'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(-60, 40); g.lineTo(99, 40); g.stroke();
    for (const x of [-38, 67]) {
      const band = g.createLinearGradient(x, 0, x + 17, 0);
      band.addColorStop(0, '#93602d'); band.addColorStop(0.26, '#f4c971'); band.addColorStop(0.74, '#d99e44'); band.addColorStop(1, '#a66f30');
      polygon(g, band, '#80552b', 1.8, x, -2, x + 17, -2, x + 17, 62, x, 62);
      g.strokeStyle = '#ffe19a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x + 4, 1); g.lineTo(x + 4, 58); g.stroke();
    }
    const rim = g.createLinearGradient(0, -10, 0, 4);
    rim.addColorStop(0, '#ffe2a0'); rim.addColorStop(0.45, '#e2a84d'); rim.addColorStop(1, '#95622f');
    polygon(g, rim, '#80552b', 2.5, -68, -10, 107, -10, 103, 3, -65, 3);
    g.strokeStyle = '#ffe1a0'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-63, -6); g.lineTo(102, -6); g.stroke();

    // A single sturdy crest reads as a lock, not a tiny texture detail.
    g.save(); g.translate(20, 31); g.rotate(-0.09);
    g.beginPath();
    g.moveTo(-10, -11); g.lineTo(10, -11); g.lineTo(14, -2);
    g.lineTo(9, 11); g.lineTo(0, 16); g.lineTo(-9, 11); g.lineTo(-14, -2);
    g.closePath(); g.fillStyle = '#edb856'; g.fill();
    g.strokeStyle = '#70472b'; g.lineWidth = 2.2; g.stroke();
    g.beginPath(); g.arc(0, -1, 6, 0, TAU);
    g.fillStyle = '#fff0be'; g.fill();
    g.strokeStyle = '#98652c'; g.lineWidth = 1.5; g.stroke();
    g.beginPath(); g.arc(0, -1, 2.8, 0, TAU); g.fillStyle = '#d6463f'; g.fill();
    g.restore();
    for (const x of [-76, 90]) {
      g.beginPath(); g.arc(x, 46, 3.5, 0, TAU); g.fillStyle = '#f7d684'; g.fill();
    }

    // Small sparks float only above the open mouth. Their positions are a pure
    // function of age, so they never jitter or allocate random particles.
    if (p.stars > 0) {
      const count = (f.rank || 0) >= 6 ? 6 : 4;
      for (let i = 0; i < count; i++) {
        const delay = i * 0.065, age = clamp((time - 0.57 - delay) / 0.62, 0, 1);
        if (age <= 0 || age >= 1) continue;
        const x = -56 + i * (112 / (count - 1)) + Math.sin(age * 3 + i * 2.4) * 6;
        const y = -28 - age * (48 + (i % 3) * 13);
        const opacity = Math.sin(Math.PI * age) * p.stars;
        g.save(); g.globalAlpha *= opacity;
        fourStar(g, x, y, i % 2 ? 5.5 : 7, i % 2 ? '#fff7d6' : '#ffe29a');
        g.restore();
      }
    }
    g.restore();
  }

  const api = Object.freeze({ chestPose, chestDiePose, drawChest });
  if (root) root.DKFX = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? null : window);
