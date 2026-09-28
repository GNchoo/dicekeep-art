// Original Dicekeep reward sounds, composed and synthesized for this project.
// No sampled or third-party audio; covered by the repository's own license.
(function (root) {
  'use strict';
  const active = new WeakMap();
  const lengths = { appear: 0.55, open: 0.55, d8: 0.9, d12: 1.3, d20: 1.85 };

  function play(ac, bus, kind) {
    if (!ac || !bus || !Object.prototype.hasOwnProperty.call(lengths, kind) || ac.state === 'closed') return false;
    const now = ac.currentTime, start = now + 0.008;
    const cues = (active.get(ac) || []).filter(cue => cue.end > now);
    // Even simultaneous boss deaths cannot leave unbounded audio voices alive.
    while (cues.length >= 2) cues.shift().stop();
    const output = ac.createGain();
    output.gain.value = 0.68;
    output.connect(bus);
    const sources = new Set();
    const cue = {
      end: start + lengths[kind],
      stop() {
        const cut = ac.currentTime;
        output.gain.cancelScheduledValues(cut);
        output.gain.setValueAtTime(output.gain.value, cut);
        output.gain.linearRampToValueAtTime(0, cut + 0.015);
        for (const source of sources) source.stop(cut + 0.016);
        cue.end = cut;
      },
    };
    cues.push(cue); active.set(ac, cues);

    function voice(source, at, duration, volume, attack, pan = 0, filter) {
      const t = start + at, gain = ac.createGain(), nodes = [source, gain];
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration - 0.012);
      gain.gain.linearRampToValueAtTime(0, t + duration);
      if (filter) { source.connect(filter).connect(gain); nodes.push(filter); }
      else source.connect(gain);
      if (ac.createStereoPanner) {
        const panner = ac.createStereoPanner(); panner.pan.value = pan;
        gain.connect(panner).connect(output); nodes.push(panner);
      } else gain.connect(output);
      sources.add(source);
      source.onended = () => {
        nodes.forEach(node => node.disconnect());
        sources.delete(source);
        if (!sources.size) output.disconnect();
      };
      source.start(t); source.stop(t + duration + 0.005);
    }
    function tone(at, frequency, duration, volume, type = 'sine', pan = 0, to = frequency) {
      const oscillator = ac.createOscillator(); oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start + at);
      if (to !== frequency) oscillator.frequency.exponentialRampToValueAtTime(to, start + at + duration * 0.8);
      voice(oscillator, at, duration, volume, 0.012, pan);
    }
    function bell(at, frequency, duration, volume, pan = 0) {
      tone(at, frequency, duration, volume, 'sine', pan);
      tone(at, frequency * 2.005, duration * 0.55, volume * 0.2, 'sine', -pan);
    }
    function breath(at, duration, volume, cutoff, to = cutoff) {
      const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate);
      const data = buffer.getChannelData(0);
      // Local deterministic noise does not consume gameplay randomness.
      let seed = 0x1f3ac97;
      for (let i = 0; i < data.length; i++) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        data[i] = (seed >>> 0) / 2147483648 - 1;
      }
      const source = ac.createBufferSource(); source.buffer = buffer;
      const filter = ac.createBiquadFilter(); filter.type = 'bandpass'; filter.Q.value = 0.7;
      filter.frequency.setValueAtTime(cutoff, start + at);
      filter.frequency.exponentialRampToValueAtTime(to, start + at + duration);
      voice(source, at, duration, volume, Math.min(0.045, duration / 4), 0, filter);
    }

    if (kind === 'appear') {
      tone(0, 180, 0.23, 0.12, 'sine', 0, 80);
      bell(0.09, 660, 0.4, 0.09, -0.15);
      bell(0.16, 880, 0.36, 0.065, 0.15);
    } else if (kind === 'open') {
      breath(0, 0.14, 0.34, 650, 280);
      tone(0, 190, 0.16, 0.13, 'triangle', 0, 72);
      breath(0.06, 0.4, 0.13, 650, 4200);
      tone(0.09, 440, 0.38, 0.05, 'sine', 0, 1046.5);
    } else if (kind === 'd8') {
      bell(0, 659.25, 0.49, 0.19, -0.12);
      bell(0.13, 987.77, 0.7, 0.16, 0.12);
      tone(0.13, 329.63, 0.65, 0.055, 'triangle');
    } else if (kind === 'd12') {
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => bell(i * 0.10, frequency, 0.88, 0.13, (i - 1.5) * 0.12));
      [261.63, 392].forEach((frequency, i) => tone(0.24, frequency, 0.96, 0.055, 'triangle', i ? 0.2 : -0.2));
      breath(0.17, 0.56, 0.045, 2400, 5200);
    } else {
      // D20: a rising major arpeggio resolves into a warm, sustained fanfare.
      [392, 523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => bell(i * 0.085, frequency, 0.7, 0.12, (i - 2) * 0.11));
      [261.63, 329.63, 392].forEach((frequency, i) => {
        tone(0.43, frequency, 1.18, 0.085, 'triangle', (i - 1) * 0.22);
        tone(0.43, frequency * 2, 1.12, 0.045, 'sine', (1 - i) * 0.22);
      });
      tone(0.43, 130.81, 1.14, 0.11);
      breath(0.40, 0.65, 0.08, 1900, 4200);
      bell(0.68, 1567.98, 1.05, 0.06, -0.15);
      bell(0.81, 2093, 0.99, 0.04, 0.15);
    }
    return true;
  }
  const api = { play };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DKBOSS_AUDIO = api;
})(typeof window !== 'undefined' ? window : globalThis);
