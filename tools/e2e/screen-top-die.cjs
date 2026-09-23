'use strict';

// Independent screen-space reading of a die. The renderer projects every
// engraved face vertex with w=10/(10-z), and only front-facing faces are drawn.
// Keep this outside game.js so browser tests can catch a reward/visible-face
// mismatch instead of echoing the production face picker.
function screenTopDieResult(kind, R, labels, api) {
  const shape = kind === 'story' ? 'd6' : api.dieShape(kind);
  const project = v => {
    const p = api.m3apply(R, v), w = 10 / (10 - p[2]);
    return [p[0] * w, p[1] * w];
  };
  if (shape === 'd4') {
    let index = 0, top = Infinity;
    api.POLY.d4.verts.forEach((v, i) => {
      const y = project(v)[1];
      if (y < top) { top = y; index = i; }
    });
    return { index, value: labels[index], y: top };
  }
  const candidates = shape === 'd6'
    ? api.FACES.map(f => ({
      normal: f.n, labelIndex: f.val - 1,
      vertices: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) =>
        f.n.map((n, i) => n + .82 * (u * f.u[i] + v * f.v[i]))),
    }))
    : api.POLY[shape].faces.map((f, i) => ({
      normal: f.n, labelIndex: i,
      vertices: f.idx.map(vi => api.POLY[shape].verts[vi]),
    }));
  const visible = [];
  candidates.forEach((face, index) => {
    const z = api.m3apply(R, face.normal)[2];
    if (z <= (shape === 'd6' ? .1 : .02)) return;
    const points = face.vertices.map(project);
    const y = shape === 'd6' ? project(face.normal)[1]
      : points.reduce((sum, point) => sum + point[1], 0) / points.length;
    const area = Math.abs(points.reduce((sum, point, i) => {
      const next = points[(i + 1) % points.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0)) / 2;
    visible.push({ index, value: labels[face.labelIndex], y, area, z });
  });
  if (!visible.length) throw Error(shape + ': no visible numbered face');
  const totalArea = visible.reduce((sum, face) => sum + face.area, 0);
  const readable = visible.filter(face => face.area >= totalArea * .05);
  readable.sort((a, b) => a.y - b.y || b.area - a.area || b.z - a.z);
  return { ...(readable[0] || visible[0]), totalArea };
}

module.exports = { screenTopDieResult };
