const assert = require('node:assert/strict');
const { play } = require('../reward-audio.js');

function context() {
  const nodes = [], sources = [];
  const param = () => ({
    value: 0,
    setValueAtTime(value, time) { assert.ok(Number.isFinite(value) && time >= 0); this.value = value; },
    linearRampToValueAtTime(value, time) { assert.ok(Number.isFinite(value) && time >= 0); },
    exponentialRampToValueAtTime(value, time) { assert.ok(value > 0 && time >= 0); },
    cancelScheduledValues(time) { assert.ok(time >= 0); },
  });
  const node = () => {
    const n = { gain: param(), frequency: param(), Q: param(), pan: param(),
      connect(target) { assert.ok(target); return target; }, disconnect() { this.disconnected = true; } };
    nodes.push(n); return n;
  };
  const source = () => {
    const n = node();
    n.start = time => { assert.ok(time >= 0); n.startAt = time; };
    n.stop = time => { assert.ok(time >= 0); n.stopAt = time; };
    sources.push(n); return n;
  };
  return {
    ac: { currentTime: 0, sampleRate: 48000, state: 'running',
      createGain: node, createOscillator: source, createBufferSource: source,
      createBiquadFilter: node, createStereoPanner: node,
      createBuffer: (_, frames) => ({ getChannelData: () => new Float32Array(frames) }),
    }, nodes, sources,
  };
}
for (const kind of ['appear', 'open', 'd8', 'd12', 'd20']) {
  const { ac, nodes, sources } = context();
  assert.equal(play(ac, {}, kind), true);
  assert.ok(sources.length <= 24, `${kind} voice budget`);
  assert.ok(sources.every(n => n.stopAt > n.startAt && n.stopAt < 1.86));
  sources.forEach(n => n.onended());
  assert.ok(nodes.every(n => n.disconnected), `${kind} leaves connected nodes`);
}
const { ac, nodes, sources } = context();
play(ac, {}, 'd20');
ac.currentTime = 0.1; play(ac, {}, 'd12');
ac.currentTime = 0.2; play(ac, {}, 'd8');
assert.ok(sources.slice(0, 22).every(n => n.stopAt <= 0.217), 'old cue must stop relative to current time');
assert.equal(play(ac, {}, 'unknown'), false);
sources.forEach(n => n.onended());
assert.ok(nodes.every(n => n.disconnected));
ac.state = 'closed'; assert.equal(play(ac, {}, 'd8'), false);
console.log('Reward audio: five cues, bounded voices, scheduling and cleanup passed.');
