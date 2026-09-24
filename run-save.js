(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DKRUNSAVE = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  // Device-local recovery, not an authoritative combat proof. Account rewards
  // still require the original server ticket. Bump RULES for incompatible combat state changes.
  const VERSION = 1, RULES = 'growth-105', MAX_BYTES = 2000000;
  const kinds = ['d1', 'd4', 'd6', 'd8', 'd12', 'd20', 'epic', 'myth', 'primal'];
  const fields = ['gold', 'lives', 'wave', 'waveActive', 'autoT', 'waveT', 'heldDie', 'time'];
  const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const num = (x, min, max) => Number.isFinite(x) && x >= min && x <= max;
  const int = (x, min, max) => Number.isSafeInteger(x) && x >= min && x <= max;
  const clone = x => JSON.parse(JSON.stringify(x));
  const battleMode = mode => mode === 'duel' || mode === 'coop';
  const id = (x, max) => typeof x === 'string' && x.length > 0 && x.length <= max && !/[\u0000-\u001f\u007f]/.test(x);
  function battleTransportValid(value, matchId) {
    if (!object(value) || value.matchId !== matchId || !int(value.seq, 0, 1e12) || !Array.isArray(value.outbox) || value.outbox.length > 256) return false;
    let previous = 0;
    return value.outbox.every(m => {
      if (!object(m) || m.t !== 'battle' || m.matchId !== matchId || !int(m.seq, previous + 1, value.seq)
        || !['kill', 'leak', 'assist'].includes(m.kind) || (m.attempted !== undefined && m.attempted !== true)) return false;
      previous = m.seq;
      if (m.kind === 'assist') return m.count === undefined && m.transferred === undefined && m.boss === undefined;
      return int(m.count, 1, 100) && (m.kind === 'kill' ? typeof m.transferred === 'boolean' && m.boss === undefined : typeof m.boss === 'boolean' && m.transferred === undefined);
    });
  }
  function safeTree(x, depth = 0) {
    if (depth > 14) return false;
    if (x === null || typeof x === 'boolean') return true;
    if (typeof x === 'number') return Number.isFinite(x);
    if (typeof x === 'string') return x.length <= 4096;
    if (Array.isArray(x)) return x.length <= 4096 && x.every(v => safeTree(v, depth + 1));
    return object(x) && Object.keys(x).length <= 160 && Object.entries(x).every(([k, v]) => !['__proto__', 'constructor', 'prototype'].includes(k) && safeTree(v, depth + 1));
  }
  function valid(p) {
    if (!object(p) || p.version !== VERSION || p.rules !== RULES || !safeTree(p)) return false;
    const s = p.state, inf = p.inf;
    if (!object(s) || !object(inf) || !['build', 'extreme', 'duel', 'coop'].includes(inf.mode) || !inf.growthSnapshot?.growth || inf.settledResult) return false;
    const battle = battleMode(inf.mode);
    if (typeof p.owner !== 'string' || !p.owner || p.owner.length > 128 || !num(p.savedAt, 0, 1e15) || !num(p.elapsed, 0, 1e12)) return false;
    if (typeof inf.runId !== 'string' || !inf.runId || inf.runId.length > 128 || !int(inf.doneW, 0, 1e6) || !int(s.wave, inf.doneW, 1e6)) return false;
    if (inf.recordKey !== (battle ? inf.mode : p.match ? 'extremeMulti' : inf.mode) || inf.clearWave !== (inf.mode === 'build' ? 101 : 0) || (inf.mode === 'build' && s.wave > 101)) return false;
    if (battle) {
      if (!object(p.match) || !id(p.match.matchId, 128) || inf.battleModeVersion !== 1 || !int(inf.battleBossRound, 0, 1e6)
        || !Array.isArray(inf.battleApplied) || inf.battleApplied.length > 128 || new Set(inf.battleApplied).size !== inf.battleApplied.length
        || !inf.battleApplied.every(eventId => id(eventId, 160) && eventId.startsWith(p.match.matchId + ':'))
        || !battleTransportValid(p.match.transport, p.match.matchId)
        || inf.growthSnapshot.mode !== inf.mode || inf.growthSnapshot.levelCap !== 20 || inf.growthSnapshot.deckSystem !== 1) return false;
    }
    if (!int(inf.kills, 0, 1e9) || !object(inf.power) || ![1,2,3,4,5,6].every(f => int(inf.power[f], 0, 200)) || !num(inf.bossT, 0, 1e8)) return false;
    if (inf.accountTicket !== null && !(typeof inf.accountTicket === 'string' && /^[a-f0-9]{64}$/.test(inf.accountTicket))) return false;
    if (!num(s.gold, 0, 1e15) || !int(s.lives, 1, 20) || !int(s.heldDie, 0, 20) || typeof s.waveActive !== 'boolean' || !num(s.waveT, 0, 1e12) || !num(s.autoT, 0, 1e12)) return false;
    if (!Array.isArray(p.size) || p.size.length !== 2 || !p.size.every(n => num(n, 1, 100000)) || !Array.isArray(p.lanes) || !p.lanes.length || !p.lanes.every(n => num(n, 1, 1e7))) return false;
    // Optional on older checkpoints; new saves retain the entry/ring boundary
    // and board origin so rotation restores the same combat position.
    if (p.laneLoops !== undefined && (!Array.isArray(p.laneLoops) || p.laneLoops.length !== p.lanes.length ||
      !p.laneLoops.every((n, i) => n === null || num(n, 0, p.lanes[i])))) return false;
    if (p.arenaCenter !== undefined && (!Array.isArray(p.arenaCenter) || p.arenaCenter.length !== 2 ||
      !p.arenaCenter.every(n => num(n, -100000, 100000)))) return false;
    if (p.arenaScale !== undefined && !num(p.arenaScale, 0.1, 10)) return false;
    if (!Array.isArray(p.towers) || p.towers.length > 512 || !Array.isArray(p.board) || p.board.length > 15 || new Set(p.board).size !== p.board.length) return false;
    // Idle towers keep ticking below zero while no enemy is in range. Preserve
    // that ready-to-fire state over long matches instead of rejecting the save.
    if (!p.towers.every(t => object(t) && int(t.face, 1, 20) && int(t.lvl, 1, 3) && int(t.spot, 0, 14) && num(t.cd, -1e12, 1e6) && (t.growthCarry === undefined || num(t.growthCarry, 1, 1e8)))) return false;
    if (inf.growthSnapshot.deckSystem === 1) {
      const deck=inf.growthSnapshot.deck;
      if (!Array.isArray(deck) || deck.length!==5 || new Set(deck).size!==5 || !deck.every(id=>int(id,1,20))) return false;
      if (!object(inf.deckPower) || Object.keys(inf.deckPower).length!==5 || !deck.every(id=>int(inf.deckPower[id],1,5))) return false;
      if (!p.towers.every(t=>t.deckSystem===1 && deck.includes(t.face) && t.lvl===1 && int(t.pips,1,7) && (t.abilityT===undefined || num(t.abilityT,0,1e12)) && (t.shotSerial===undefined || int(t.shotSerial,0,1e12)))) return false;
      if (s.heldDie && !deck.includes(s.heldDie)) return false;
      if (p.slot?.active && !deck.includes(p.slot.final)) return false;
      if (inf.growthSnapshot.treeVersion===1) {
        if (!['supply','crusher','barrage'].includes(inf.growthSnapshot.supporter) || !num(inf.supporterCooldown,0,45) || !int(inf.supporterUses,0,1e9)) return false;
        if (!p.towers.every(t=>t.copyHaste===undefined||typeof t.copyHaste==='boolean')) return false;
      }
    }
    if (!p.board.every(i => int(i, 0, p.towers.length - 1)) || new Set(p.board.map(i => p.towers[i].spot)).size !== p.board.length) return false;
    if (!Array.isArray(p.enemies) || p.enemies.length > 512 || !Array.isArray(p.active) || p.active.length > 200 || !p.active.every(i => int(i, 0, p.enemies.length - 1))) return false;
    if (!p.enemies.every(e => object(e) && object(e.def) && num(e.hp, -1e200, 1e200) && num(e.max, 1e-20, 1e200) && num(e.dist, 0, 1e8) && int(e.lane, 0, p.lanes.length - 1))) return false;
    if (!Array.isArray(p.projs) || p.projs.length > 2048 || !p.projs.every(q => object(q) && int(q.target, 0, p.enemies.length - 1) && int(q.source, 0, p.towers.length - 1))) return false;
    if (!Array.isArray(p.spawnQ) || p.spawnQ.length > 512 || !Array.isArray(inf.queue) || inf.queue.length > 512 || !inf.queue.every(k => kinds.includes(k)) || !object(p.slot) || !kinds.includes(p.slot.kind)) return false;
    // A physical throw has no result until it lands. Low-tier dice also start
    // their automatic roll without a predetermined face. Older pending chests
    // may still carry an exact card; restore handles that legacy state.
    const nonDeck = inf.growthSnapshot.deckSystem !== 1;
    const pendingThrow = nonDeck && [-1, -2].includes(p.slot.phase) && p.slot.kind !== 'd1';
    const pendingLowRoll = nonDeck && p.slot.phase === 0 && ['d4', 'd6'].includes(p.slot.kind) && p.slot.final === 0;
    if (p.slot.active && !(pendingLowRoll || (pendingThrow ? int(p.slot.final, 0, 20) : int(p.slot.final, 1, 20)))) return false;
    return !p.match || (object(p.match) && typeof p.match.code === 'string' && typeof p.match.pid === 'string' && num(p.match.t0, 0, 1e15));
  }
  function capture(s, slot, meta) {
    const enemies = s.enemies.slice(), towers = s.towers.slice();
    const index = (list, value) => { let i = list.indexOf(value); if (i < 0) { i = list.length; list.push(value); } return i; };
    const projs = s.projs.filter(p => !p.gone).map(p => {
      const { tgt, src, ...rest } = p;
      return { ...rest, target: index(enemies, tgt), source: index(towers, src) };
    });
    const { startedAt, ...inf } = s.inf;
    const p = clone({ version: VERSION, rules: RULES, ...meta,
      state: Object.fromEntries(fields.map(k => [k, s[k]])), inf, slot, speed: s.speed,
      enemies, active: s.enemies.map(e => enemies.indexOf(e)),
      towers: towers.map(({ def, ...t }) => t), board: s.towers.map(t => towers.indexOf(t)), projs, spawnQ: s.spawnQ });
    if (!valid(p)) throw new Error('현재 전투 상태를 저장하지 못했습니다.');
    return p;
  }
  function encode(p) {
    if (!valid(p)) throw new Error('저장 형식이 올바르지 않습니다.');
    const text = JSON.stringify(p);
    if (text.length > MAX_BYTES) throw new Error('저장 크기를 초과했습니다.');
    return text;
  }
  function decode(text, owner) {
    if (typeof text !== 'string' || text.length > MAX_BYTES) return null;
    try { const p = JSON.parse(text); return valid(p) && p.owner === owner ? p : null; } catch (_) { return null; }
  }
  function hydrate(p, defs) {
    if (!valid(p)) throw new Error('호환되지 않거나 손상된 이어하기입니다.');
    p = clone(p);
    const towers = p.towers.map(t => ({ ...t, def: defs[t.face] }));
    return { ...p.state, inf: p.inf, towers: p.board.map(i => towers[i]), enemies: p.active.map(i => p.enemies[i]), spawnQ: p.spawnQ,
      projs: p.projs.map(({ target, source, ...q }) => ({ ...q, tgt: p.enemies[target], src: towers[source] })), slot: p.slot };
  }
  return Object.freeze({ VERSION, RULES, capture, encode, decode, hydrate, valid });
});
