// Server-owned match outcome and event ledger. Combat hits remain client reports;
// account rewards use an internal, durable result claim and server participation time.
import Rules from '../../battle-rules.js';
export const BATTLE_RULES = Rules;
const LEGACY_RULES = Object.freeze({ lives:20, normalLeak:1, bossLeak:5, transferEvery:5, goal:500, supply:60, assistMs:45000, bossMs:90000, pendingMax:128 });
export function createBattle(mode, pids, matchId, t0, rewards = false) {
  const rules = rewards ? BATTLE_RULES : LEGACY_RULES;
  return { version:1, matchId, mode, revision:0, t0, bossEveryMs:rules.bossMs, bossRound:0, nextBossAt:t0+rules.bossMs,
    goal:mode==='coop'?rules.goal:0, kills:0, teamLives:rules.lives, eventSerial:0, events:[], result:null,
    ...(rewards ? {rewardVersion:1,ruleVersion:rules.version,rules:{...rules}} : {}),
    seats:Object.fromEntries(pids.map(pid=>[pid,{lives:rules.lives,kills:0,transferKills:0,lastSeq:0,lastAction:null,assistReadyAt:t0,...(rewards?{activeSeconds:0}:{})}])) };
}
// Count only consecutive eligible summaries. Gaps, hidden tabs, reconnects and
// server hibernation never manufacture activity; damage output is irrelevant.
export function battleActivity(b, pid, eligible, previousAt, now) {
  if (b.rewardVersion !== 1 || b.result || !eligible || previousAt == null || now < b.t0) return false;
  const dt = now - previousAt;
  if (dt <= 0 || dt > 3000) return false;
  const ms = Math.max(0, now - Math.max(previousAt, b.t0));
  if (!ms) return false;
  const seat = b.seats[pid]; seat.activeMs = Math.min(now-b.t0, (seat.activeMs || Math.round((seat.activeSeconds || 0)*1000)) + ms);
  seat.activeSeconds = Math.floor(seat.activeMs/1000);
  b.revision++; return true;
}
export function advanceBattle(b, now) {
  if (b.result) return false;
  const round=Math.max(0,Math.floor((now-b.t0)/b.bossEveryMs));
  if (round<=b.bossRound) return false;
  b.bossRound=round; b.nextBossAt=b.t0+(round+1)*b.bossEveryMs; b.revision++; return true;
}
export function endBattle(b, reason, losers, now) {
  if (b.result) return false;
  const ids=Object.keys(b.seats), lost=b.mode==='coop'&&losers.length?ids:losers;
  b.result={reason,winners:ids.filter(id=>!lost.includes(id)),losers:lost.slice(),at:now};
  b.revision++; return true;
}
export function battleReport(b, pid, m, now) {
  const seat=b.seats[pid];
  if (!seat || m.matchId!==b.matchId) return {error:'battle-match'};
  if (m.seq<=seat.lastSeq) return {duplicate:true};
  if (m.seq!==seat.lastSeq+1) return {error:'battle-sequence'};
  if (b.result) return {error:'battle-ended'};
  if (now<b.t0) return {error:'battle-not-started'};
  const other=Object.keys(b.seats).find(id=>id!==pid);
  const rules = b.rules || LEGACY_RULES;
  const count=m.count||1;
  let kind=null,amount=0,reason=null;
  if (m.kind==='kill' && b.mode==='duel' && !m.transferred) {
    amount=Math.floor((seat.transferKills+count)/rules.transferEvery)-Math.floor(seat.transferKills/rules.transferEvery); kind='incoming';
  }
  if (m.kind==='assist') {
    if (b.mode!=='coop') reason='battle-mode';
    else if (now<seat.assistReadyAt) reason='battle-cooldown';
    else {kind='supply';amount=rules.supply;}
  }
  // Backpressure does not consume a sequence; retry after the peer acknowledges.
  if (kind && amount && b.events.filter(e=>e.to===other).length>=rules.pendingMax) return {error:'battle-backpressure'};
  seat.lastSeq=m.seq;seat.lastAction={seq:m.seq,kind:m.kind,ok:!reason,...(reason?{reason}:{})};b.revision++;
  if (reason) return {changed:true,error:reason};
  if (m.kind==='kill') {
    seat.kills+=count;b.kills+=count;
    if (!m.transferred) seat.transferKills+=count;
    if (b.mode==='coop' && b.kills>=b.goal) endBattle(b,'goal',[],now);
  } else if (m.kind==='leak') {
    const damage=count*(m.boss?rules.bossLeak:rules.normalLeak);
    if (b.mode==='coop') {b.teamLives=Math.max(0,b.teamLives-damage);for(const s of Object.values(b.seats))s.lives=b.teamLives;}
    else seat.lives=Math.max(0,seat.lives-damage);
    if ((b.mode==='coop'?b.teamLives:seat.lives)===0) endBattle(b,'lives',[pid],now);
  } else if (m.kind==='assist') seat.assistReadyAt=now+rules.assistMs;
  if (kind && amount && !b.result) b.events.push({id:b.matchId+':'+(++b.eventSerial),to:other,from:pid,kind,...(kind==='incoming'?{count:amount}:{sp:amount})});
  return {changed:true};
}
export function battleAck(b, pid, matchId, eventId) {
  if (matchId!==b.matchId || !b.seats[pid]) return false;
  const i=b.events.findIndex(e=>e.id===eventId && e.to===pid);
  if(i<0)return false;b.events.splice(i,1);b.revision++;return true;
}
