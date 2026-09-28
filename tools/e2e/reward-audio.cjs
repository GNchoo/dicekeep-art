// Offline rendering also leaves original sound previews in gen/e2e/reward-audio/.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, outputPath } = require('./browser.cjs');

function wav(channels, sampleRate) {
  const frames = channels[0].length, bytes = frames * channels.length * 2;
  const out = Buffer.alloc(44 + bytes);
  out.write('RIFF'); out.writeUInt32LE(36 + bytes, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(channels.length, 22);
  out.writeUInt32LE(sampleRate, 24); out.writeUInt32LE(sampleRate * channels.length * 2, 28);
  out.writeUInt16LE(channels.length * 2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(bytes, 40);
  for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < channels.length; channel++) {
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channels[channel][frame])) * 32767), 44 + (frame * channels.length + channel) * 2);
  }
  return out;
}

(async () => {
  assert.equal(typeof require('../../reward-audio.js').play, 'function');
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../../reward-audio.js'), 'utf8') });
    const reports = [];
    for (const kind of ['appear', 'open', 'd8', 'd12', 'd20', 'burst']) {
      const result = await page.evaluate(async kind => {
        const ac = new OfflineAudioContext(2, 48000 * 2.1, 48000), bus = ac.createGain();
        bus.connect(ac.destination);
        let created = 0, disconnected = 0;
        for (const method of ['createGain', 'createOscillator', 'createBufferSource', 'createBiquadFilter', 'createStereoPanner']) {
          const create = ac[method].bind(ac);
          ac[method] = (...args) => {
            const node = create(...args), disconnect = node.disconnect.bind(node); created++;
            node.disconnect = (...args) => { disconnected++; return disconnect(...args); };
            return node;
          };
        }
        const accepted = kind === 'burst'
          ? Array.from({ length: 12 }, () => DKBOSS_AUDIO.play(ac, bus, 'd20')).every(Boolean)
          : DKBOSS_AUDIO.play(ac, bus, kind);
        const invalid = DKBOSS_AUDIO.play(ac, bus, 'missing');
        const rendered = await ac.startRendering();
        const channels = [0, 1].map(i => Array.from(rendered.getChannelData(i)));
        let peak = 0, energy = 0, tail = 0;
        for (const channel of channels) channel.forEach((sample, i) => {
          peak = Math.max(peak, Math.abs(sample)); energy += sample * sample;
          if (i > 48000 * 1.95) tail = Math.max(tail, Math.abs(sample));
        });
        return { accepted, invalid, created, disconnected, peak, energy, tail, channels };
      }, kind);
      assert.equal(result.accepted, true); assert.equal(result.invalid, false);
      assert.ok(result.energy > 1, `${kind}: inaudible`);
      assert.ok(result.peak < 0.98, `${kind}: clipped (${result.peak})`);
      assert.ok(result.tail < 0.00001, `${kind}: lingering sound`);
      assert.equal(result.disconnected, result.created, `${kind}: audio graph leaked`);
      if (kind !== 'burst') {
        const file = outputPath(`reward-audio/${kind}.wav`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, wav(result.channels, 48000));
      }
      const { channels, ...report } = result; reports.push({ kind, ...report });
    }
    console.log(JSON.stringify(reports, null, 2));
    console.log('Reward audio: all five cues and overlapping playback passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
