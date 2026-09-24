'use strict';

// Independent read of the value visibly presented by a die. Ordinary dice use
// the face whose normal points most toward the camera (+Z). A top-read d4 uses
// the upper apex: its number is repeated on all three touching faces.
// Keep this oracle outside game.js so a reward/marking mismatch cannot be
// hidden by reusing the production picker.
function cameraFacingDieResult(kind, R, labels, api) {
  const shape = kind === 'story' ? 'd6' : api.dieShape(kind);
  if (shape === 'd4') {
    const up = [0, -.75, Math.sqrt(1 - .75 * .75)];
    const vertices = api.POLY.d4.verts.map((v, index) => {
      const p = api.m3apply(R, v);
      return { index, value: labels[index], y: p[1], z: p[2],
        alignment: p[0] * up[0] + p[1] * up[1] + p[2] * up[2] };
    });
    vertices.sort((a, b) => b.alignment - a.alignment || a.index - b.index);
    return { ...vertices[0], area: 0, totalArea: 0 };
  }
  const project = v => {
    const p = api.m3apply(R, v), w = 10 / (10 - p[2]);
    return [p[0] * w, p[1] * w];
  };
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
  // An exact edge/vertex-on tie has no single skyward face. Keep the first
  // mesh face deterministically, as the game's strict-greater scan does;
  // choosing the larger projected area here would create a false mismatch.
  visible.sort((a, b) => b.z - a.z || a.index - b.index);
  return { ...visible[0], totalArea };
}

module.exports = { cameraFacingDieResult };
