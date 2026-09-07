// Rebuild all 19 final PR29 game PNGs. Never modifies runtime assets by default.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const out = path.resolve(repo, process.argv[2] || 'gen/pr29-rebuild');
if (out === path.resolve(repo)) throw new Error('Choose a separate output directory; review before promoting assets');
const old = path.join(repo, 'tools/art-review/pr29');
const run = (tool, args) => execFileSync(process.execPath, [path.join(repo, 'tools', tool), ...args], { cwd: repo, stdio: 'inherit' });
const enemy = path.join(out, 'casual/enemies/inf');
const boss = path.join(out, 'casual/bosses/inf');
fs.mkdirSync(path.join(out, 'layout'), { recursive: true });
run('rig-walk.mjs', ['--config=tools/art-review/pr29-gait/rig-config.json', '--out=' + out]);
run('sheet-layout.mjs', [path.join(old, 'sources/w001-w005-source.png'), '--background-seeds=' + path.join(old, 'background-seeds.json'), '--row-cuts=0,320,605,915,1185,1536', '--select-rows=4', '--out=' + path.join(out, 'layout/flyer.png')]);
run('sheet-split.mjs', [path.join(out, 'layout/flyer.png'), '--rows=w004', '--out-dir=' + enemy, '--pack']);
run('sheet-check.mjs', [path.join(old, 'sources/w008-source.png'), '--background=checkerboard', '--anchor=center', '--sheet-out=' + path.join(enemy, 'w008-walk-2x2.png'), '--still-out=' + path.join(enemy, 'w008.png'), '--pack']);
run('sheet-check.mjs', [path.join(old, 'sources/b010-source.png'), '--background=checkerboard', '--grid=1x1', '--still-out=' + path.join(boss, 'b010.png'), '--pack']);
const assets = [];
for (let wave = 1; wave <= 9; wave++) {
  const id = 'w' + String(wave).padStart(3, '0');
  assets.push('casual/enemies/inf/' + id + '.png', 'casual/enemies/inf/' + id + '-walk-' + ([4,8].includes(wave) ? '2x2' : '4x2') + '.png');
}
assets.push('casual/bosses/inf/b010.png');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const results = assets.map(file => ({ file, sha256: hash(path.join(out, file)), matchesCommitted: hash(path.join(out, file)) === hash(path.join(repo, file)) }));
fs.writeFileSync(path.join(out, 'asset-manifest.json'), JSON.stringify(results, null, 2) + '\n');
const mismatches = results.filter(result => !result.matchesCommitted);
console.log(assets.length + ' rebuilt assets; ' + mismatches.length + ' SHA256 mismatches');
if (mismatches.length) process.exitCode = 1;
