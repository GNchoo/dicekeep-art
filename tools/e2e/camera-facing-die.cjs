'use strict';

// Independent camera-facing reading of a die. The game camera looks along +Z:
// the face whose outward normal points most toward the player is the result.
// This deliberately ignores which numeral happens to be highest on the 2D
// screen. Keep the oracle outside game.js so a reward/visible-face mismatch
// cannot be hidden by reusing the production face picker.
function cameraFacingDieResult(kind, R, labels, api) {
  const shape = kind === 'story' ? 'd6' : api.dieShape(kind);
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
