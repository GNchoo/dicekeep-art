// ==================== 어댑터 공통부: 순수 상태 머신을 감싸 effects 를 실행한다 ====================
// Room DO(room.js)·Lobby DO(lobby.js)와 테스트 더블(test/dev-server.mjs)이 똑같이 쓴다. 플랫폼 의존은 전부 io 훅으로 주입한다.
//   RoomHost  io = { now(), random32(), send(sid, text), close(sid, code, reason), put(state), destroy(), setAlarm(ts|null), log(obj) }
//   LobbyHost io = { now(), send, close, setAlarm, log, claim({ ver, players }) → Promise<{ ok, code }>, putQuota(ts[]) }
// 소켓 단위 방어(프레임 크기 1009 · 토큰 버킷 20/s 버스트 40 → err rate + 4429 · 잘못된 프레임 연속 3회 → 4400)도 여기서 한다.
import { createRoom, emptyLive, liveFromSockets, reduce, nextAlarm } from './room-core.js';
import * as LC from './lobby-core.js';
import { parse, byteLength, CLOSE } from './proto.js';
import { take } from './ratelimit.js';
import { MAX_FRAME, SOCKET_RATE, SOCKET_BURST, ROOMS_PER_HOUR } from './timing.js';

const BAD_LIMIT = 3;

// 소켓 방어 공통부. 프레임을 검사해 통과한 메시지를 돌려준다(아니면 null — 필요한 응답·닫기는 이미 했다)
class SocketHost {
  constructor(io) {
    this.io = io;
    this.lastAlarm = undefined;      // 마지막으로 io.setAlarm 에 넘긴 값 (같으면 다시 부르지 않는다)
    this.buckets = new Map();        // sid → 토큰 버킷
    this.bad = new Map();            // sid → 연속 파싱 실패 수
    this.dead = new Set();           // 여기서 닫기로 한 소켓(닫힘 이벤트가 오기 전까지 남은 프레임은 무시)
    this.stats = { msgs: 0, sends: 0, puts: 0, alarms: 0, reduces: 0 };   // 예산 메모용 카운터
  }

  forget(sid) { this.buckets.delete(sid); this.bad.delete(sid); this.dead.delete(sid); }
  kill(sid, code, reason) { this.dead.add(sid); this.io.close(sid, code, reason); }

  inspect(sid, att, data, now) {
    if (this.dead.has(sid)) return null;
    this.stats.msgs++;
    if (typeof data !== 'string') { this.kill(sid, CLOSE.BAD_REQUEST, 'binary'); return null; }
    if (byteLength(data) > MAX_FRAME) { this.kill(sid, CLOSE.TOO_BIG, 'too-big'); return null; }
    if (data === 'ping') { this.io.send(sid, 'pong'); return null; }        // DO 는 자동응답이 먼저 처리한다
    const r = take(this.buckets.get(sid) || null, now, SOCKET_RATE, SOCKET_BURST);
    this.buckets.set(sid, r.bucket);
    if (!r.ok) {
      this.io.send(sid, JSON.stringify({ t: 'err', at: now, code: 'rate', msg: '메시지가 너무 많습니다' }));
      this.kill(sid, CLOSE.RATE, 'rate');
      this.io.log({ ev: 'rate', code: this.code, pid: att.pid });
      return null;
    }
    const p = parse(data);
    if (!p.ok) {
      const n = (this.bad.get(sid) || 0) + 1;
      this.bad.set(sid, n);
      this.io.log({ ev: 'invalid', code: this.code, pid: att.pid, err: p.err, n });
      if (n >= BAD_LIMIT) this.kill(sid, CLOSE.BAD_REQUEST, 'bad-request');
      return null;
    }
    this.bad.delete(sid);
    if (!att.pid && p.m.t !== 'hello') {
      this.io.send(sid, JSON.stringify({ t: 'err', at: now, code: 'bad-request', msg: '첫 프레임은 hello 여야 합니다' }));
      this.kill(sid, CLOSE.BAD_REQUEST, 'hello-first');
      return null;
    }
    return p.m;
  }

  syncAlarm(ts) {
    if (ts === this.lastAlarm) return;
    this.lastAlarm = ts;
    this.io.setAlarm(ts);
  }

  get code() { return null; }
}

// ---- Room ----
export class RoomHost extends SocketHost {
  constructor(io) {
    super(io);
    this.state = null;
    this.live = emptyLive(io.now());
  }

  get code() { return this.state ? this.state.code : null; }

  // 저장된 상태 + 살아있는 소켓 attachment 로 복원 (하이버네이션·재시작)
  load(state, atts) {
    this.state = state || null;
    this.live = liveFromSockets(this.state, atts || [], this.io.now());
    this.lastAlarm = undefined;
  }

  // /claim: 없으면 방을 만들고 저장, 있으면 409 (같은 코드가 END_TTL 안에 재사용되지 않도록)
  //   kind 'quick' 이면 reserve = { players:[{ pid, key, name }], until } 로 예약 좌석을 미리 넣는다
  async claim({ code, kind = 'code', timing, ver = null, reserve = null }) {
    if (this.state) return { ok: false, err: 'exists' };
    const now = this.io.now();
    this.state = createRoom({ code, kind, now, timing, ver, reserve });
    this.live = emptyLive(now);
    await this.io.put(this.state);
    this.stats.puts++;
    this.syncAlarm(nextAlarm(this.state, this.live, now));
    this.io.log({ ev: 'claim', code, kind, n: Object.keys(this.state.players).length });
    return { ok: true, code };
  }

  open(sid, op) { return this.apply({ k: 'open', sid, op }); }
  closed(sid) { this.forget(sid); return this.apply({ k: 'close', sid }); }
  async alarm() { this.stats.alarms++; return this.apply({ k: 'alarm' }); }

  // 소켓 수신. att = { sid, op, pid? }. hello 성공이면 { pid } 를 돌려준다(어댑터가 attachment 에 pid 를 붙인다)
  async message(sid, att, data) {
    const now = this.io.now();
    const m = this.inspect(sid, att, data, now);
    if (!m) return null;
    if (!att.pid) {
      await this.apply({ k: 'hello', sid, op: att.op || null, m });
      const L = this.live.players[m.pid];
      return L && L.sid === sid ? { pid: m.pid } : null;
    }
    if (m.t === 'hello') return null;
    await this.apply({ k: 'msg', pid: att.pid, sid, m });
    return null;
  }

  // 대상 → sid 목록. '*' 는 접속 중인 멤버 전원(except 제외). except 는 pid 하나 또는 배열
  resolve(s) {
    if (s.sid) return [s.sid];
    const L = this.live.players;
    if (s.to === '*') {
      const ex = new Set(Array.isArray(s.except) ? s.except : s.except ? [s.except] : []);
      return Object.entries(L).filter(([pid, l]) => l.connected && l.sid && !ex.has(pid)).map(([, l]) => l.sid);
    }
    const list = Array.isArray(s.to) ? s.to : [s.to];
    return list.map((pid) => L[pid]).filter((l) => l && l.connected && l.sid).map((l) => l.sid);
  }

  async apply(ev) {
    const now = this.io.now();
    this.stats.reduces++;
    // 대기실에서는 언제든 서버가 시작할 수 있으므로(방장 start · 예약 방 자동 시작) 시드를 미리 채워 둔다
    if (this.state && this.state.phase === 'lobby' && this.live.seed == null) this.live.seed = this.io.random32() >>> 0;
    const r = reduce({ state: this.state, live: this.live }, ev, now);
    this.state = r.state; this.live = r.live;
    let alarm = null, destroy = false;
    for (const e of r.effects) {
      if (e.send) {
        const text = JSON.stringify(e.send.m);
        for (const sid of this.resolve(e.send)) { this.stats.sends++; this.io.send(sid, text); }
      } else if (e.close) {
        this.io.close(e.close.sid, e.close.code, e.close.reason);
      } else if (e.log) {
        this.io.log({ ...e.log, code: this.code || e.log.code, ms: now });
      } else if (e.destroy) {
        destroy = true;
      } else if ('alarm' in e) {
        alarm = e.alarm;
      }
    }
    // 알람·저장은 동기적으로 결정하고(다른 이벤트와 끼어들지 않게) 저장 완료만 기다린다
    this.syncAlarm(alarm);
    if (destroy) {
      this.io.log({ ev: 'destroy', code: ev.code, ms: now, stats: this.stats });
      await this.io.destroy();
    } else if (r.persist) {
      this.stats.puts++;
      await this.io.put(this.state);
    }
  }
}

// ---- Lobby (빠른 매칭) ----
export class LobbyHost extends SocketHost {
  constructor(io) {
    super(io);
    this.state = LC.createLobby();
  }

  get code() { return 'lobby'; }

  // 살아있는 소켓 attachment + 저장된 quota 로 복원
  load(atts, quota) {
    this.state = LC.lobbyFromSockets(atts || [], this.io.now(), quota);
    this.lastAlarm = undefined;
  }

  // 시간당 방 생성 상한. 통과하면 true (창을 저장한다)
  async quota() {
    const ok = LC.takeQuota(this.state, this.io.now(), ROOMS_PER_HOUR);
    if (ok && this.io.putQuota) { this.stats.puts++; await this.io.putQuota(this.state.quota); }
    return ok;
  }

  open(sid) { return this.apply({ k: 'open', sid }); }
  closed(sid) { this.forget(sid); return this.apply({ k: 'close', sid }); }
  async alarm() { this.stats.alarms++; return this.apply({ k: 'alarm' }); }

  // hello 성공이면 { att } (어댑터가 attachment 를 바꾼다: { sid, pid, key, name, ver, since })
  async message(sid, att, data) {
    const now = this.io.now();
    const m = this.inspect(sid, att, data, now);
    if (!m) return null;
    if (att.pid) return null;                  // 대기 중에는 hello 뒤 아무 메시지도 받지 않는다 (ping 만)
    await this.apply({ k: 'hello', sid, m });
    const e = this.state.queue.find((x) => x.sid === sid);
    return e ? { att: { sid, pid: e.pid, key: e.key, name: e.name, ver: e.ver, since: e.since } } : null;
  }

  async apply(ev) {
    const now = this.io.now();
    this.stats.reduces++;
    const r = LC.reduce(this.state, ev, now);
    const matches = [];
    let alarm = null;
    for (const e of r.effects) {
      if (e.send) { this.stats.sends++; this.io.send(e.send.sid, JSON.stringify(e.send.m)); }
      else if (e.close) this.io.close(e.close.sid, e.close.code, e.close.reason);
      else if (e.log) this.io.log({ ...e.log, code: 'lobby', ms: now });
      else if (e.match) matches.push(e.match);
      else if ('alarm' in e) alarm = e.alarm;
    }
    this.syncAlarm(alarm);
    for (const g of matches) await this.matched(g);
  }

  // 묶인 무리: 방 생성 상한 → Room /claim(예약) → matched{code} + 4000. 실패하면 err + 닫기
  async matched(g) {
    const sids = g.players.map((p) => p.sid);
    const fail = (code, closeCode, msg) => {
      const text = JSON.stringify({ t: 'err', code, msg, at: this.io.now() });
      for (const sid of sids) { this.io.send(sid, text); this.kill(sid, closeCode, code); }
      this.io.log({ ev: 'match.fail', code, n: sids.length });
    };
    if (!(await this.quota())) return fail('rate', CLOSE.RATE, '방 생성 상한에 걸렸습니다. 잠시 뒤 다시 시도하세요');
    let r = null;
    try { r = await this.io.claim({ ver: g.ver, players: g.players.map(({ pid, key, name }) => ({ pid, key, name })) }); } catch (e) { r = { ok: false, err: String(e) }; }
    if (!r || !r.ok) return fail('busy', CLOSE.BAD_REQUEST, '방을 만들지 못했습니다');
    const text = JSON.stringify({ t: 'matched', code: r.code, at: this.io.now() });
    for (const sid of sids) { this.stats.sends++; this.io.send(sid, text); this.kill(sid, CLOSE.LEAVE, 'matched'); }
    this.io.log({ ev: 'matched', room: r.code, n: sids.length, ver: g.ver });
  }
}
