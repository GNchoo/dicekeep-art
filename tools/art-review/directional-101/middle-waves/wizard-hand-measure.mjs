// Reviewed source rectangles/joint picks for the W56 five-finger glove atlas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { loadRaw } from '../../../lib/sheet.mjs';
import { extractPart } from '../../../rig-walk.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../../../..');
const rel = 'tools/art-review/directional-101/middle-waves/', file = rel + 'wizard-hand-three-view-parts.png';
const sha = b => createHash('sha256').update(b).digest('hex');
const bytes = fs.readFileSync(path.join(repo, file)), raw = await loadRaw(path.join(repo, file), { background: 'checkerboard' });
const repairFile = rel + 'wizard-hand-palm-repair.png', repairBytes = fs.readFileSync(path.join(repo, repairFile));
const repairRaw = await loadRaw(path.join(repo, repairFile), { background: 'checkerboard' });
const repairRectangles = { side: [230,10,550,490], front: [220,515,580,488], back: [220,1007,580,510] };
const ids = ['thumb', 'index', 'middle', 'ring', 'little'];
const definitions = {
  side: { body: [25, 15, 387, 385], rectangles: [[425,50,170,353],[601,42,124,363],[760,40,123,360],[908,75,135,330],[1053,100,130,295]],
    picks: [[[513,119],[517,221],[482,316]],[[655,105],[675,257],[679,337]],[[812,99],[833,259],[836,339]],[[967,144],[990,263],[994,335]],[[1101,180],[1124,282],[1128,337]]],
    sockets: [[.14,.755],[.385,.9],[.65,.9],[.88,.875],[.73,.79]], layers: [5,4,3,2,1] },
  front: { body: [30,435,377,370], rectangles: [[430,490,155,315],[605,465,122,345],[760,465,119,345],[913,493,112,317],[1057,510,108,298]],
    picks: [[[519,544],[514,655],[507,728]],[[655,520],[655,657],[655,738]],[[813,510],[813,656],[813,737]],[[971,541],[966,666],[967,737]],[[1109,555],[1108,675],[1107,740]]],
    sockets: [[.095,.725],[.28,.854],[.505,.875],[.74,.855],[.932,.78]], layers: [5,4,3,2,1] },
  back: { body: [24,829,390,368], rectangles: [[435,874,150,318],[608,849,126,346],[756,855,134,340],[921,880,111,315],[1062,895,108,302]],
    picks: [[[518,935],[512,1043],[514,1132]],[[657,912],[658,1048],[657,1137]],[[817,912],[817,1050],[817,1137]],[[974,929],[975,1050],[973,1133]],[[1114,946],[1114,1060],[1113,1139]]],
    sockets: [[.915,.762],[.734,.89],[.50,.9],[.284,.9],[.073,.86]], layers: [5,4,3,2,1] },
};
const roi = r => [r[0]/raw.W, r[1]/raw.H, r[2]/raw.W, r[3]/raw.H];
const repairRoi = r => [r[0]/repairRaw.W, r[1]/repairRaw.H, r[2]/repairRaw.W, r[3]/repairRaw.H];
const entry = { assetId: 'w056', wave: 56, role: 'normal', cell: 256, locomotion: 'legged', anatomy: 'hand', referenceHeight: 400, cycleStride: 110,
  gait: { stanceDuty: .7, lift: 20, pelvis: 'fixed' }, reviewApproved: true, views: {} };
const measurements = { source: file, sourceSha256: sha(bytes), sourceSize: [raw.W, raw.H], review: 'Manual ROI and joint picks from the actual three-row atlas; thumb/index/middle/ring/little identities persist through all views.', views: {} };
const out = path.join(here, 'wizard-hand-measurements'); fs.mkdirSync(out, { recursive: true });
for (const [name, d] of Object.entries(definitions)) {
  const body = await extractPart(repairRaw, repairRoi(repairRectangles[name]), name + ' repaired palm');
  fs.writeFileSync(path.join(out, name + '-palm.png'), Buffer.from(body.image.split(',')[1], 'base64'));
  const view = { source: file, sourceSha256: sha(bytes), background: 'checkerboard', pivot: [256, 430],
    body: { source: repairFile, sourceSha256: sha(repairBytes), roi: repairRoi(repairRectangles[name]), target: { height: 280, top: 45, centerX: 256 }, layer: 10 }, parts: [] };
  const parts = [];
  for (const [i, id] of ids.entries()) {
    const part = await extractPart(raw, roi(d.rectangles[i]), name + ' ' + id);
    fs.writeFileSync(path.join(out, name + '-' + id + '.png'), Buffer.from(part.image.split(',')[1], 'base64'));
    const normalized = d.picks[i].map(p => [(p[0] - part.sourceBounds[0]) / part.width, (p[1] - part.sourceBounds[1]) / part.height]);
    const socket = d.sockets[i], r = .055;
    const joints = { hip: normalized[0], knee: normalized[1], ankle: normalized[2], sole: [part.sole[0] / part.width, .998] };
    const socketRoi = [Math.max(0,socket[0]-r), Math.max(0,socket[1]-r), Math.min(r*2,1-Math.max(0,socket[0]-r)), Math.min(r*2,1-Math.max(0,socket[1]-r))];
    view.parts.push({ id, type: 'leg', roi: roi(d.rectangles[i]), sourceJoints: joints, socketNormalized: socket, socketRoiNormalized: socketRoi,
      phase: i / 5, bend: name === 'back' ? -1 : 1, calibrate: { groundY: 430, maximumStanceAngle: 166 }, layer: d.layers[i], upperLayer: -3, proximalFeather: id === 'thumb' ? 0 : .45, proximalEdgeFeather: id === 'thumb' ? 0 : .12 });
    parts.push({ id, roi: roi(d.rectangles[i]), sourceBounds: part.sourceBounds, sourceJoints: joints, bodySocket: socket });
  }
  entry.views[name] = view; measurements.views[name] = { bodySource: repairFile, bodySourceSha256: sha(repairBytes), bodySourceSize: [repairRaw.W, repairRaw.H], bodyBounds: body.sourceBounds, parts };
}
fs.writeFileSync(path.join(here, 'wizard-hand-measurements.json'), JSON.stringify(measurements, null, 2) + '\n');
fs.writeFileSync(path.join(here, 'wizard-hand-rigs.json'), JSON.stringify({ version: 1, canonicalCell: 512, assetVersion: 93, entries: [entry] }, null, 2) + '\n');
const prompt = 'prompts/wizard-hand-three-view-parts.txt', reference = 't6-misc-01-turnaround.png', meta = await sharp(bytes).metadata();
fs.writeFileSync(path.join(here, 'wizard-hand-generation-ledger.json'), JSON.stringify({ mode: 'built-in image_gen', scope: 'W56 five-finger wizard glove; supplemental ledger, not duplicated in the shared middle-wave ledger', requests: [{
  call: 1, id: 'wizard-hand-three-view-parts', kind: 'parts', assetIds: ['w056'], source: 'wizard-hand-three-view-parts.png', sha256: sha(bytes), width: meta.width, height: meta.height, hasAlpha: !!meta.hasAlpha,
  prompt, promptSha256: sha(fs.readFileSync(path.join(here, prompt))), reference, referenceSha256: sha(fs.readFileSync(path.join(here, reference))),
  originalGeneratedPath: 'C:/Users/PC/.codex/generated_images/01a07ae4-f8ce-7411-8737-f8def3bcbd3a/exec-58bf1853-47e2-4b08-8e77-b40c4e530e67.png',
  status: 'source and assembled gait reviewed; ready', notes: 'Three matching views; exactly five isolated digits per row, brass-cuffed violet leather with front amber rune/back lacing. No flesh/gore. Top row is a right-facing three-quarter side compatible with the approved reference.'
}, {
  call: 2, id: 'wizard-hand-palm-repair', kind: 'body-repair', assetIds: ['w056'], source: 'wizard-hand-palm-repair.png', sha256: sha(repairBytes), width: repairRaw.W, height: repairRaw.H,
  prompt: 'prompts/wizard-hand-palm-repair.txt', promptSha256: sha(fs.readFileSync(path.join(here, 'prompts/wizard-hand-palm-repair.txt'))), reference: 'wizard-hand-three-view-parts.png', referenceSha256: sha(bytes),
  originalGeneratedPath: 'C:/Users/PC/.codex/generated_images/01a07ae4-f8ce-7411-8737-f8def3bcbd3a/exec-dd2219ae-f1ac-4cd0-9b7a-2163d0a143a7.png',
  status: 'source and assembled gait reviewed; ready', notes: 'Three palm/cuff body replacements close the exposed central socket holes; all fifteen original digit pieces are preserved from call1.'
}] }, null, 2) + '\n');
console.log('Measured 18 parts; wrote reviewed five-finger config and 2-call ledger.');
