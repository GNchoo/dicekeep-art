// 실제 DKA의 채색 프레임을 보여 주는 공간 보행 리뷰. 관절/접지 검증은 ground-gait-check.cjs 별도 실행.
// 지상은 8자세 한 주기를 0.8초로 통일해 비교한다(게임 속도 재현이 아님). 비행은 기존 4프레임 5fps.
const fs = require('node:fs');
const sharp = require('sharp');
const { launchBrowser, gameUrl, outputPath, watchArtErrors } = require('./browser.cjs');
const { inspectWalkSheets, rowFailures } = require('./walk-jitter.js');

async function saveAnimation(name, buffers, width, height) {
  fs.writeFileSync(outputPath(name + '.png'), buffers[0]);
  const raw = await sharp({ create: { width, height: height * buffers.length, channels: 4, background: '#253337' } })
    .composite(buffers.map((input, index) => ({ input, left: 0, top: index * height }))).raw().toBuffer();
  await sharp(raw, { raw: { width, height: height * buffers.length, channels: 4, pageHeight: height } })
    .gif({ delay: buffers.map(() => 100), loop: 0, effort: 7 }).toFile(outputPath(name + '.gif'));
}

(async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1240, height: 860 } }), errors = watchArtErrors(page);
    await page.goto(gameUrl());
    await page.waitForFunction(() => window.DK && DK.phase === 'title', null, { timeout: 120000 });
    const rows = await page.evaluate(inspectWalkSheets);
    const failures = rows.flatMap(row => rowFailures(row).map(failure => row.key + ': ' + failure));
    if (errors.length || failures.length) throw new Error([...errors, ...failures].join('\n'));
    const ground = [1, 2, 3, 5, 6, 7, 9];
    for (const wave of ground) {
      const row = rows.find(row => row.key === 'infW' + wave + 'Walk');
      if (!row || !row.rigged || row.expected !== 8) throw new Error('W' + wave + ' is not an eight-frame distance rig');
    }
    const variants = [
      { name: 'ground-walk-preview', waves: ground, labeled: true },
      { name: 'walk-preview', waves: Array.from({ length: 9 }, (_, index) => index + 1), labeled: false },
    ];
    const report = { source: 'actual DKA loader canvases, no synthetic replacement limbs', scale: 3, sampleDelayMs: 100, groundCycleSeconds: 0.8,
      groundTiming: 'normalized review cycle; game frames instead follow actual distance and vary with speed',
      groundMotion: 'forward travel = source-pixel walkStride × drawHeight / loadedFrameHeight; fixed ground ticks; replay returns to start',
      flyerTiming: '4 frames, 5fps, existing sequence', variants: [] };
    for (const variant of variants) {
      const buffers = []; let dimensions;
      for (let phase = 0; phase < 8; phase++) {
        const result = await page.evaluate(({ phase, waves, labeled }) => {
          const inf = DKCONTENT.INFINITY;
          const sprites = waves.map(wave => {
            const monster = inf.monsters[wave], frames = DKA['infW' + wave + 'Walk'];
            const stride = monster.walkStride || 0;
            const frame = frames[stride ? phase : Math.floor(phase / 2) % frames.length];
            const height = inf.artSize[monster.cls] * 3, scale = height / frame.h;
            return { wave, monster, frame, height, width: frame.w * scale, travel: stride * scale };
          });
          const cellWidth = Math.ceil(Math.max(380, ...sprites.map(sprite => sprite.width + sprite.travel + 72)));
          const cellHeight = 260, header = labeled ? 88 : 0;
          const cv = document.createElement('canvas'); cv.width = cellWidth * 3; cv.height = header + cellHeight * Math.ceil(waves.length / 3);
          const g = cv.getContext('2d'); g.fillStyle = '#253337'; g.fillRect(0, 0, cv.width, cv.height);
          if (labeled) {
            g.fillStyle = '#edf1de'; g.font = 'bold 25px sans-serif'; g.fillText('Grounded 1–9 · actual textured rig frames', 26, 32);
            g.font = '16px sans-serif'; g.fillText('3× game height · fixed ground ticks · one complete stride in 0.8s for review', 26, 57);
            g.fillStyle = '#aebdbd'; g.font = '13px sans-serif'; g.fillText('Replay returns to the start. Game playback follows distance; these timing-normalized previews do not replace gait tests.', 26, 78);
          }
          sprites.forEach((sprite, index) => {
            const { wave, monster, frame, height, width, travel } = sprite;
            const row = Math.floor(index / 3), rowCount = Math.min(3, sprites.length - row * 3);
            const x = ((index % 3) + (3 - rowCount) / 2) * cellWidth, y = header + row * cellHeight;
            const baseline = y + cellHeight - 24;
            g.save(); g.beginPath(); g.rect(x + 10, y + 3, cellWidth - 20, cellHeight - 6); g.clip();
            if (labeled) {
              g.fillStyle = '#edf1de'; g.font = 'bold 18px sans-serif'; g.fillText('W' + wave + '  ' + monster.name, x + 24, y + 24);
            }
            if (travel) {
              // 프레임마다 움직이지 않는 고정 바닥 눈금. 접지한 발과 같은 눈금의 관계를 비교한다.
              g.fillStyle = '#304044'; g.fillRect(x + 20, baseline + 1, cellWidth - 40, 12);
              g.strokeStyle = '#92a19a'; g.lineWidth = 1;
              g.beginPath(); g.moveTo(x + 20, baseline + 1); g.lineTo(x + cellWidth - 20, baseline + 1);
              for (let tick = 24; tick < cellWidth - 20; tick += 24) { g.moveTo(x + tick, baseline + 1); g.lineTo(x + tick, baseline + 8); }
              g.stroke();
              for (let dot = 0; dot < cellWidth / 14; dot++) {
                g.fillStyle = dot % 2 ? '#526267' : '#415053'; g.fillRect(x + 20 + dot * 14, baseline + 11 + (dot % 3), 3, 2);
              }
            }
            const left = x + (cellWidth - width - travel) / 2 + travel * phase / 8;
            g.drawImage(frame.cv, left, baseline - height, width, height);
            g.restore();
          });
          return { width: cv.width, height: cv.height, png: cv.toDataURL('image/png').split(',')[1] };
        }, { phase, waves: variant.waves, labeled: variant.labeled });
        dimensions = { width: result.width, height: result.height };
        buffers.push(Buffer.from(result.png, 'base64'));
      }
      await saveAnimation(variant.name, buffers, dimensions.width, dimensions.height);
      report.variants.push({ ...variant, ...dimensions, samples: buffers.length });
    }
    fs.writeFileSync(outputPath('walk-preview.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('PASS textured preview: seven distance-scaled ground rigs with fixed markers; unlabeled mixed 1–9 PNG/GIF; flyers stay 5fps');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
