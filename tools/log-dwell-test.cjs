const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const game = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
const start = game.indexOf('const LOG = {');
const end = game.indexOf('// 방 안이면 같은 줄을 다른 플레이어에게도 보낸다', start);
assert(start >= 0 && end > start, 'game log implementation found');

function fixture() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const box = {
    children: [],
    appendChild(el) { el.parentNode = this; this.children.push(el); },
    removeChild(el) { this.children.splice(this.children.indexOf(el), 1); el.parentNode = null; },
  };
  const context = {
    Date: { now: () => now },
    setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    $: () => box,
    document: {
      createElement() {
        const classes = new Set();
        return { parentNode: null, classList: { add: name => classes.add(name), contains: name => classes.has(name) } };
      },
    },
  };
  vm.runInNewContext(game.slice(start, end), context);
  return {
    box,
    log: context.pushLog,
    clear: context.clearLog,
    advance(ms) {
      const target = now + ms;
      while (true) {
        const due = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
      }
      now = target;
    },
  };
}

{
  const f = fixture();
  ['A', 'B', 'C', 'D'].forEach(message => f.log(message, 'sys'));
  f.advance(10000);
  assert.deepEqual(f.box.children.map(el => el.innerHTML), ['B', 'C', 'D'], 'only the latest three survive beyond the original 9 seconds');
  assert(f.box.children.every(el => !el.classList.contains('fade')), 'recent lines stay readable');
  f.advance(12800);
  assert(f.box.children.every(el => el.classList.contains('fade')), 'recent lines begin fading near 24 seconds');
  f.advance(1200);
  assert.equal(f.box.children.length, 0, 'recent lines expire after 24 seconds');
}

{
  const f = fixture();
  ['A', 'B', 'C'].forEach(message => f.log(message, 'sys'));
  f.advance(11000);
  f.log('D', 'sys');
  assert.equal(f.box.children.length, 4);
  f.advance(1200);
  assert.deepEqual(f.box.children.map(el => el.innerHTML), ['B', 'C', 'D'], 'an aged line fades when a newer line displaces it');
  f.clear();
  f.advance(30000);
  assert.equal(f.box.children.length, 0, 'clearing the log cancels pending removal');
}

console.log('PASS: latest three log lines remain readable for 24 seconds; older lines use 9-second lifetime');
