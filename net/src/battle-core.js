// Server-owned match outcome and event ledger. Combat hits remain client reports;
// these free practice modes do not issue commerce/account reward receipts.
export const BATTLE_RULES = Object.freeze({ lives:20, normalLeak:1, bossLeak:5, transferEvery:5, goal:500, supply:60, assistMs:45000, bossMs:90000, pendingMax:128 });
export function createBattle(mode, pids, matchId, t0) {
  return { version:1, matchId, mode, revision:0, t0, bossEveryMs:BATTLE_RULES.bossMs, bossRound:0, nextBossAt:t0+BATTLE_RULES.bossMs,
    goal:mode==='coop'?BATTLE_RULES.goal:0, kills:0, teamLives:BATTLE_RULES.lives, eventSerial:0, events:[], result:null,
    seats:Object.fromEntries(pids.map(pid=>[pid,{lives:BATTLE_RULES.lives,kills:0,transferKills:0,lastSeq:0,lastAction:null,assistReadyAt:t0}])) };
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
  const count=m.count||1;
  let kind=null,amount=0,reason=null;
  if (m.kind==='kill' && b.mode==='duel' && !m.transferred) {
    amount=Math.floor((seat.transferKills+count)/BATTLE_RULES.transferEvery)-Math.floor(seat.transferKills/BATTLE_RULES.transferEvery); kind='incoming';
  }
  if (m.kind==='assist') {
    if (b.mode!=='coop') reason='battle-mode';
    else if (now<seat.assistReadyAt) reason='battle-cooldown';
    else {kind='supply';amount=BATTLE_RULES.supply;}
  }
  // Backpressure does not consume a sequence; retry after the peer acknowledges.
  if (kind && amount && b.events.filter(e=>e.to===other).length>=BATTLE_RULES.pendingMax) return {error:'battle-backpressure'};
  seat.lastSeq=m.seq;seat.lastAction={seq:m.seq,kind:m.kind,ok:!reason,...(reason?{reason}:{})};b.revision++;
  if (reason) return {changed:true,error:reason};
  if (m.kind==='kill') {
    seat.kills+=count;b.kills+=count;
    if (!m.transferred) seat.transferKills+=count;
    if (b.mode==='coop' && b.kills>=b.goal) endBattle(b,'goal',[],now);
  } else if (m.kind==='leak') {
    const damage=count*(m.boss?BATTLE_RULES.bossLeak:BATTLE_RULES.normalLeak);
    if (b.mode==='coop') {b.teamLives=Math.max(0,b.teamLives-damage);for(const s of Object.values(b.seats))s.lives=b.teamLives;}
    else seat.lives=Math.max(0,seat.lives-damage);
    if ((b.mode==='coop'?b.teamLives:seat.lives)===0) endBattle(b,'lives',[pid],now);
  } else if (m.kind==='assist') seat.assistReadyAt=now+BATTLE_RULES.assistMs;
  if (kind && amount && !b.result) b.events.push({id:b.matchId+':'+(++b.eventSerial),to:other,from:pid,kind,...(kind==='incoming'?{count:amount}:{sp:amount})});
  return {changed:true};
}
export function battleAck(b, pid, matchId, eventId) {
  if (matchId!==b.matchId || !b.seats[pid]) return false;
  const i=b.events.findIndex(e=>e.id===eventId && e.to===pid);
  if(i<0)return false;b.events.splice(i,1);b.revision++;return true;
}
