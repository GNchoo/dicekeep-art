// Deck summaries use independent card identity and battle pips. Exercise the same
// parser + RoomHost adapter used by the Worker, including reconnect boundaries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, byteLength, CLOSE, PROTOCOL } from '../src/proto.js';
import { RoomHost } from '../src/host.js';
import { MAX_FRAME, EN_MAX } from '../src/timing.js';

const A = 'aaaa1111', B = 'bbbb2222', C = 'cccc3333';
const key = pid => pid.repeat(4);
const LEGACY = { t: 'sum', w: 3, dw: 2, l: 20, g: 400, k: 12, f: 30, sp: 1, hid: 0, b: null, o: 'l', tw: [[0, 6, 2], [14, 20, 3]] };
const DECK = { ...LEGACY, ds: 1, tw: [[0, 7, 1, 1], [14, 20, 1, 7]], ll: 950, en: '1,2,3;4,5,6' };
const decode = m => parse(JSON.stringify(m));
const accepted = m => { const r = decode(m); assert.equal(r.ok, true, JSON.stringify(m)); return r.m; };
const rejected = m => assert.equal(decode(m).ok, false, JSON.stringify(m));

async function playing(mode = 'extreme') {
  let now = 1_700_000_000_000, serial = 0;
  const sent = [], closed = [], atts = new Map();
  const host = new RoomHost({
    now: () => now, random32: () => 1234,
    send: (sid, text) => sent.push({ sid, m: JSON.parse(text) }),
    close: (sid, code, reason) => closed.push({ sid, code, reason }),
    put: () => {}, destroy: () => {}, setAlarm: () => {}, log: () => {},
  });
  const h = {
    host, sent, closed, atts,
    advance(ms = 2000) { now += ms; },
    async connect(pid, op = 'join') {
      const sid = `${pid}-${++serial}`, att = { sid, op };
      await host.open(sid, op);
      const result = await host.message(sid, att, JSON.stringify({ t: 'hello', v: PROTOCOL, ver: 'deck-summary', op, mode, pid, key: key(pid), name: pid }));
      assert.deepEqual(result, { pid });
      att.pid = pid; atts.set(pid, att);
      return att;
    },
    async send(pid, m) {
      const att = atts.get(pid);
      return host.message(att.sid, att, JSON.stringify(m));
    },
    clearSent() { sent.length = 0; },
    sums(pid) { return sent.filter(x => x.m.t === 'sum' && (!pid || x.m.pid === pid)); },
  };
  await host.claim({ code: 'ABC234', mode });
  await h.connect(A, 'create');
  await h.connect(B);
  await h.connect(C);
  await h.send(A, { t: 'start' });
  h.advance(); h.clearSent();
  return h;
}

test('deck schema retains distinct identity and all 1–7 pip values, including a full board', () => {
  const tw = Array.from({ length: 15 }, (_, spot) => [spot, spot + 1, 1, spot % 7 + 1]);
  const m = { ...DECK, tw };
  assert.deepEqual(accepted({ ...m, unknown: 'discard' }), m);
  assert.deepEqual(accepted({ ...DECK, tw: [] }), { ...DECK, tw: [] });
});

test('deck marker is only numeric 1; tuple formats cannot be mixed or guessed', () => {
  for (const ds of [0, 2, -1, 1.5, null, true, false, '1', [], {}]) rejected({ ...DECK, ds });
  rejected({ ...DECK, tw: LEGACY.tw });
  rejected({ ...LEGACY, tw: DECK.tw });
  rejected({ ...DECK, tw: [DECK.tw[0], LEGACY.tw[1]] });
  for (const lvl of [0, 2, 3, 7, '1', null]) rejected({ ...DECK, tw: [[0, 7, lvl, 3]] });
});

test('deck pips, identities, spots, unique occupancy and array size are bounded', () => {
  for (const pips of [0, 8, -1, 1.5, '1', null, true, {}, [], Infinity]) rejected({ ...DECK, tw: [[0, 7, 1, pips]] });
  for (const face of [0, 21, 1.5, '7']) rejected({ ...DECK, tw: [[0, face, 1, 7]] });
  for (const spot of [-1, 15, 1.5, '0']) rejected({ ...DECK, tw: [[spot, 7, 1, 7]] });
  for (const tw of [null, {}, 'x', [null], [[0, 7, 1, 7, 1]], [[0, 7, 1, 7], [0, 8, 1, 1]], Array.from({ length: 16 }, (_, i) => [i % 15, 7, 1, 7])]) rejected({ ...DECK, tw });
});

test('legacy triples keep the exact existing normalized payload and level range', () => {
  assert.deepEqual(accepted({ ...LEGACY, unknown: 9 }), LEGACY);
  assert.deepEqual(accepted({ ...LEGACY, tw: [[0, 6, 1], [1, 6, 2], [2, 6, 3]] }).tw, [[0, 6, 1], [1, 6, 2], [2, 6, 3]]);
  // Tightening legacy duplicate handling would change the old protocol contract.
  assert.deepEqual(accepted({ ...LEGACY, tw: [[0, 6, 1], [0, 7, 2]] }).tw, [[0, 6, 1], [0, 7, 2]]);
  assert.equal('ds' in accepted(LEGACY), false);
  rejected({ ...LEGACY, tw: [[0, 6, 4]] });
});

test('a maximal deck summary with enemy data still fits the unchanged frame budget', () => {
  const m = { ...DECK, w: 1e6, dw: 1e6, l: 20, g: 1e7, k: 1e6, f: 200, sp: 3, hid: 1, b: 1, ll: 100000,
    tw: Array.from({ length: 15 }, (_, spot) => [spot, 20, 1, 7]), en: '1'.repeat(EN_MAX) };
  assert.equal(decode(m).ok, true);
  assert.ok(byteLength(JSON.stringify(m)) <= MAX_FRAME);
});

test('both light broadcasts and spectator updates preserve ds and pips through RoomHost', async () => {
  const h = await playing();
  await h.send(B, { t: 'watch', pid: A });
  h.clearSent();
  await h.send(A, DECK);
  const sums = h.sums(A);
  assert.equal(sums.length, 2);
  for (const { m } of sums) { assert.equal(m.ds, 1); assert.deepEqual(m.tw, DECK.tw); }
  const watching = sums.find(x => x.sid === h.atts.get(B).sid).m;
  const light = sums.find(x => x.sid === h.atts.get(C).sid).m;
  assert.equal(watching.en, DECK.en); assert.equal(watching.ll, DECK.ll);
  assert.equal('en' in light, false); assert.equal('ll' in light, false);
  assert.equal(sums.some(x => x.sid === h.atts.get(A).sid), false);
  h.advance(1000); h.clearSent();
  await h.send(A, { ...DECK, tw: [[0, 7, 1, 7]] });
  assert.equal(h.sums(A).length, 1, 'watch cadence remains one second');
  assert.deepEqual(h.sums(A)[0].m.tw, [[0, 7, 1, 7]]);
});

test('clear rooms reject deck summaries before changing progress, then accept legacy summaries', async () => {
  const h = await playing('clear');
  await h.send(A, DECK);
  assert.equal(h.sent.find(x => x.m.t === 'err').m.code, 'mode');
  assert.equal(h.sums().length, 0);
  assert.equal(h.host.state.players[A].wave, 0);
  assert.equal(h.host.state.players[A].kills, 0);
  assert.equal(h.host.live.players[A].sum, null);
  h.clearSent();
  await h.send(A, LEGACY);
  assert.equal(h.sums(A).length, 2);
  for (const { m } of h.sums(A)) {
    const { pid, at, ...payload } = m;
    assert.deepEqual(payload, LEGACY);
  }
});

test('malformed deck reports never mutate scores or relay and retain three-strike close', async () => {
  const h = await playing();
  const invalid = [
    { ...DECK, tw: [[0, 7, 1, 8]] },
    { ...DECK, tw: [[0, 7, 1, 7], [0, 8, 1, 1]] },
    { ...DECK, ds: 0 },
  ];
  for (let i = 0; i < invalid.length; i++) {
    await h.send(A, invalid[i]);
    assert.equal(h.closed.length, i === 2 ? 1 : 0);
    assert.equal(h.host.state.players[A].wave, 0);
    assert.equal(h.host.state.players[A].kills, 0);
    assert.equal(h.host.live.players[A].sum, null);
    assert.equal(h.sums().length, 0);
  }
  assert.equal(h.closed[0].code, CLOSE.BAD_REQUEST);
});

test('oversized deck frames close at 1009 before any summary is applied', async () => {
  const h = await playing();
  await h.send(A, { ...DECK, extra: 'x'.repeat(MAX_FRAME) });
  assert.equal(h.closed[0].code, CLOSE.TOO_BIG);
  assert.equal(h.host.live.players[A].sum, null);
  assert.equal(h.sums().length, 0);
});

test('reconnect and hibernation retain room rules and relay fresh deck pips without stale socket writes', async () => {
  const h = await playing();
  await h.send(A, DECK);
  const oldAtt = h.atts.get(A);
  h.advance(); h.clearSent();
  await h.connect(A);
  const welcome = h.sent.find(x => x.m.t === 'welcome').m;
  assert.equal(welcome.resumed, true);
  assert.equal(welcome.room.mode, 'extreme');
  assert.equal(welcome.room.game.mode, 'extreme');
  assert.equal(welcome.room.players.find(x => x.pid === A).wave, DECK.w);
  assert.equal(h.closed.find(x => x.sid === oldAtt.sid).code, CLOSE.REPLACED);
  // Board summaries are intentionally ephemeral; neither old nor new boards
  // become a save state in the room snapshot. The authenticated client resends.
  assert.equal(h.host.live.players[A].sum, null);
  await h.host.message(oldAtt.sid, oldAtt, JSON.stringify({ ...DECK, w: 99 }));
  assert.equal(h.host.state.players[A].wave, DECK.w);
  h.clearSent();
  const next = { ...DECK, w: 4, dw: 3, tw: [[0, 7, 1, 6], [14, 20, 1, 2]] };
  await h.send(A, next);
  assert.equal(h.sums(A).length, 2);
  for (const { m } of h.sums(A)) { assert.equal(m.ds, 1); assert.deepEqual(m.tw, next.tw); }
  const saved = JSON.parse(JSON.stringify(h.host.state));
  h.host.load(saved, [...h.atts.values()]);
  assert.equal(h.host.state.mode, 'extreme');
  assert.equal(h.host.live.players[A].sum, null);
  h.advance(); h.clearSent();
  await h.send(B, { t: 'watch', pid: A });
  await h.send(A, { ...next, tw: [[4, 8, 1, 7]] });
  assert.equal(h.sums(A).length, 2);
  for (const { m } of h.sums(A)) { assert.equal(m.ds, 1); assert.deepEqual(m.tw, [[4, 8, 1, 7]]); }
});
