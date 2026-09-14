// Internal Durable Object capability. The public Worker never forwards these paths.
// Match receipts outlive the WebSocket room and contain no client-claimed rewards.
export const REWARD_TTL = 30 * 24 * 60 * 60 * 1000;
const PREFIX = 'reward:';
const copy = x => structuredClone(x);
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join('');
const fail = (error, status = 409) => ({ ok: false, error, status });
function valid(b) {
  return b && /^[A-Z0-9]{6}$/.test(b.code) && typeof b.matchId === 'string' && b.matchId.startsWith(b.code + ':') && b.matchId.length <= 128 &&
    /^[a-z0-9]{8,16}$/.test(b.pid) && /^[a-f0-9]{32}$/.test(b.key) && /^[a-f0-9]{32}$/.test(b.accountId) &&
    /^[a-f0-9]{64}$/.test(b.ticket) && ['test', 'production'].includes(b.environment) && ['duel', 'coop'].includes(b.mode);
}
export function resultFor(state, pid) {
  const b = state.game.battle, end = b.result, seat = b.seats[pid];
  const elapsed = Math.max(0, Math.floor((end.at - b.t0) / 1000));
  return { matchId: b.matchId, mode: b.mode, pid, won: end.winners.includes(pid), wave: Math.floor(elapsed / (b.rules?.waveSeconds || 15)) + 1,
    kills: seat.kills, teamKills: b.kills, activeSeconds: Math.min(elapsed, Math.floor(seat.activeSeconds || 0)), elapsed,
    date: new Date(end.at).toISOString(), reason: end.reason, rewardVersion: 1 };
}
export class RewardStore {
  constructor(storage, now = () => Date.now()) { this.storage = storage; this.now = now; }
  async putRoom(state) {
    const b = state?.game?.battle;
    return this.storage.transaction(async tx => {
      await tx.put('room', state);
      if (b?.rewardVersion !== 1) return;
      const key = PREFIX + b.matchId;
      let receipt = await tx.get(key);
      if (!receipt) {
        receipt = { version: 1, code: state.code, matchId: b.matchId, mode: b.mode, expiresAt: this.now() + REWARD_TTL,
          seats: {}, claims: {}, results: null };
        for (const pid of Object.keys(b.seats)) receipt.seats[pid] = await hash(state.players[pid].key);
      }
      if (b.result && !receipt.results) {
        receipt.results = Object.fromEntries(Object.keys(b.seats).map(pid => [pid, resultFor(state, pid)]));
        receipt.expiresAt = this.now() + REWARD_TTL;
      }
      await tx.put(key, receipt);
      return receipt.expiresAt;
    });
  }
  async request(kind, body) {
    if (!valid(body)) return fail('invalid-battle-proof', 400);
    const proof = await hash(body.key), owner = { accountId: body.accountId, ticket: body.ticket, environment: body.environment };
    return this.storage.transaction(async tx => {
      const receipt = await tx.get(PREFIX + body.matchId);
      if (!receipt || receipt.expiresAt <= this.now()) return fail('battle-reward-unavailable', 410);
      if (receipt.code !== body.code || receipt.mode !== body.mode || receipt.seats[body.pid] !== proof) return fail('battle-proof-mismatch', 403);
      const prior = receipt.claims[body.pid];
      if (prior && JSON.stringify(prior) !== JSON.stringify(owner)) return fail('battle-already-claimed');
      if (kind === 'bind') {
        if (!prior) {
          if (Object.values(receipt.claims).some(claim => claim.accountId===owner.accountId && claim.environment===owner.environment)) return fail('battle-account-already-bound');
          if (receipt.results) return fail('battle-run-ended');
          receipt.claims[body.pid] = owner;
          await tx.put(PREFIX + body.matchId, receipt);
        }
        return { ok: true, matchId: receipt.matchId, pid: body.pid, rewardVersion: 1 };
      }
      if (!prior) return fail('battle-run-unbound');
      if (!receipt.results) return fail('battle-result-pending', 503);
      return { ok: true, result: copy(receipt.results[body.pid]) };
    });
  }
  async gc() {
    const rows = await this.storage.list({ prefix: PREFIX });
    let next = null;
    for (const [key, receipt] of rows) {
      if (receipt.expiresAt <= this.now()) await this.storage.delete(key);
      else next = Math.min(next ?? Infinity, receipt.expiresAt);
    }
    return next;
  }
}
