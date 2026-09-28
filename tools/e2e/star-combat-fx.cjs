// Real attack dispatch plus isolated silhouettes: no extra production debug API.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, gameUrl, outputPath } = require('./browser.cjs');
const root = path.resolve(__dirname, '../..');
(async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/game.js*', route => {
      const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
      const hook = 'Object.assign(window,{towerFire,projHit,spawnEnemy,buildInfinityWave,epos,towerSpr,A,draw,updateVisuals});window.DK = S;';
      return route.fulfill({ contentType: 'text/javascript', body: source.replace('window.DK = S;', hook) });
    });
    await page.addInitScript(() => { localStorage.setItem('dk_coachDone', '1'); localStorage.setItem('dk_infHelpSeen', '1'); });
    await page.goto(gameUrl());
    await page.waitForFunction(() => window.DK?.phase === 'title', null, { timeout: 120000 });
    const result = await page.evaluate(() => {
      DKstartInf('clear'); DK.paused = true; DK.muted = true;
      DK.enemies = []; DK.towers = []; DK.spawnQ = [];
      spawnEnemy(buildInfinityWave(1)[0]);
      const e = DK.enemies[0]; e.dist = 220; e.hp = e.max = 1e12; e.entranceT = -1;
      const ep = epos(e), rows = [];
      const gallery = document.createElement('canvas'); gallery.width = 1000; gallery.height = 840;
      const g = gallery.getContext('2d'); g.fillStyle = '#252437'; g.fillRect(0, 0, 1000, 840);
      const mask = document.createElement('canvas'); mask.width = mask.height = 128;
      const mg = mask.getContext('2d', { willReadFrequently: true });
      const silhouette = paint => {
        mg.clearRect(0, 0, 128, 128); mg.save(); mg.translate(64, 64); paint(mg); mg.restore();
        let hash = 2166136261, pixels = 0;
        const d = mg.getImageData(0, 0, 128, 128).data;
        for (let i = 3; i < d.length; i += 4) { const on = d[i] > 24 ? 1 : 0; pixels += on; hash = Math.imul(hash ^ on, 16777619); }
        return { hash: hash >>> 0, pixels };
      };
      for (let face = 6; face <= 20; face++) {
        DK.projs = []; DK.fxs = []; DK.texts = [];
        const t = { face, def: DKTD[face], lvl: 1, spot: 0, x: ep.x + 45, y: ep.y + 35, skin: 0, cd: 0 };
        DK.towers = [t]; towerFire(t, 0);
        const p = DK.projs[0], sp = towerSpr(face, 0);
        if (!p) throw Error('No shot ' + face);
        const launch = silhouette(c => DKMOTION.paintMuzzle(c, t, { ...sp, cx: sp.w / 2, baseY: sp.h / 3 }, DKCONTENT.STAR_TOWER_EMITTERS[face]));
        const body = { ...p, visualAge: .13, rot: -.2 };
        const paintShot = c => {
          if (face > 6) DKMOTION.paintProjectile(c, body);
          else { const a = A.dieBomb; c.drawImage(a.cv, -13, -13 * a.h / a.w, 26, 26 * a.h / a.w); }
        };
        const shot = silhouette(paintShot);
        // Enhancement during flight must not change the already-fired identity.
        t.face = 1; projHit(p); t.face = face;
        const f = DK.fxs.find(f => f.kind === (face > 6 ? 'starImpact' : 'dieExplode'));
        if (!f) throw Error('Missing hit ' + face);
        const paintHit = c => {
          if (face > 6) DKMOTION.paintStarImpact(c, { ...f, x: 0, y: 0, t: f.dur * .38 });
          else { const a = A.dieExplode[1]; c.drawImage(a.cv, -43, -43, 86, 86); }
        };
        const impact = silhouette(paintHit);
        rows.push({ face, kind: p.kind, captured: p.fxFace, hitFace: f.face, launch, shot, impact,
          dieExplosion: DK.fxs.some(f => f.kind === 'dieExplode'), effects: DK.fxs.length });
        const col = (face - 6) % 5, row = Math.floor((face - 6) / 5), x = col * 200, y = row * 280;
        g.fillStyle = '#fff4d9'; g.font = 'bold 15px sans-serif'; g.fillText(`${face} · ${DKMOTION.STAR_FX[face]?.[0] || '폭군'}`, x + 12, y + 26);
        g.save(); g.translate(x + 48, y + 132); g.drawImage(sp.cv, -sp.cx, -sp.baseY);
        DKMOTION.paintMuzzle(g, t, sp, DKCONTENT.STAR_TOWER_EMITTERS[face]); g.restore();
        g.save(); g.translate(x + 144, y + 92); paintShot(g); g.restore();
        g.save(); g.translate(x + 100, y + 210); paintHit(g); g.restore();
      }
      DK.towers = []; DK.projs = []; DK.fxs = [];
      return { rows, gallery: gallery.toDataURL('image/png') };
    });
    for (const row of result.rows) {
      assert.equal(row.kind, 'dieBomb', 'combat projectile kind stays unchanged');
      assert.ok(row.launch.pixels > 0 && row.shot.pixels > 0 && row.impact.pixels > 0, 'visible stages ' + row.face);
      if (row.face > 6) {
        assert.equal(row.captured, row.face); assert.equal(row.hitFace, row.face);
        assert.equal(row.dieExplosion, false); assert.equal(row.effects, 1, 'one bounded effect per hit');
      }
    }
    assert.equal(new Set(result.rows.map(r => r.shot.hash)).size, 15, '15 different projectile silhouettes, ignoring color');
    assert.equal(new Set(result.rows.map(r => r.impact.hash)).size, 15, '15 different impact silhouettes, ignoring color');
    assert.deepEqual(errors, []);
    fs.writeFileSync(outputPath('star-combat-fx.png'), Buffer.from(result.gallery.split(',')[1], 'base64'));
    fs.writeFileSync(outputPath('star-combat-fx.json'), JSON.stringify(result.rows, null, 2));
    console.log('PASS 6–20: actual attack dispatch, immutable identity, unique projectile/hit silhouettes, bounded effects');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
