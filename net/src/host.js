// ==================== RoomHost: room-core 를 감싸 effects 를 실행하는 어댑터 공통부 ====================
// Room DO(room.js)와 테스트 더블(test/dev-server.mjs)이 똑같이 쓴다. 플랫폼 의존은 전부 io 훅으로 주입한다.
//   io = { now(), random32(), send(sid, text), close(sid, code, reason), put(state), destroy(), setAlarm(ts|null), log(obj) }
// 소켓 단위 방어(프레임 크기 1009 · 토큰 버킷 20/s 버스트 40 → err rate + 4429 · 잘못된 프레임 연속 3회 → 4400)도 여기서 한다.
import { createRoom, emptyLive, liveFromSockets, reduce, nextAlarm } from './room-core.js';
import { parse, byteLength, CLOSE } from './proto.js';
import { take } from './ratelimit.js';
import { MAX_FRAME, SOCKET_RATE, SOCKET_BURST } from './timing.js';

const BAD_LIMIT = 3;

export class RoomHost {
  constructor(io) {
    this.io = io;
    this.state = null;
    this.live = emptyLive(io.now());
    this.lastAlarm = undefined;      // 마지막으로 io.setAlarm 에 넘긴 값 (같으면 다시 부르지 않는다)
    this.buckets = new Map();        // sid → 토큰 버킷
    this.bad = new Map();            // sid → 연속 파싱 실패 수
    this.dead = new Set();           // 여기서 닫기로 한 소켓(닫힘 이벤트가 오기 전까지 남은 프레임은 무시)
    this.stats = { msgs: 0, sends: 0, puts: 0, alarms: 0, reduces: 0 };   // 예산 메모용 카운터
  }

  get code() { return this.state ? this.state.code : null; }

  // 저장된 상태 + 살아있는 소켓 attachment 로 복원 (하이버네이션·재시작)
  load(state, atts) {
    this.state = state || null;
    this.live = liveFromSockets(this.state, atts || [], this.io.now());
    this.lastAlarm = undefined;
  }

  // /claim: 없으면 방을 만들고 저장, 있으면 409 (같은 코드가 END_TTL 안에 재사용되지 않도록)
  async claim({ code, kind = 'code', timing }) {
    if (this.state) return { ok: false, err: 'exists' };
    const now = this.io.now();
    this.state = createRoom({ code, kind, now, timing });
    this.live = emptyLive(now);
    await this.io.put(this.state);
    this.stats.puts++;
    this.syncAlarm(nextAlarm(this.state, this.live, now));
    this.io.log({ ev: 'claim', code });
    return { ok: true, code };
  }

  open(sid, op) { return this.apply({ k: 'open', sid, op }); }
  closed(sid) { this.buckets.delete(sid); this.bad.delete(sid); this.dead.delete(sid); return this.apply({ k: 'close', sid }); }
  kill(sid, code, reason) { this.dead.add(sid); this.io.close(sid, code, reason); }
  async alarm() { this.stats.alarms++; return this.apply({ k: 'alarm' }); }

  // 소켓 수신. att = { sid, op, pid? }. hello 성공이면 { pid } 를 돌려준다(어댑터가 attachment 에 pid 를 붙인다)
  async message(sid, att, data) {
    const now = this.io.now();
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
    if (!att.pid) {
      if (p.m.t !== 'hello') {
        this.io.send(sid, JSON.stringify({ t: 'err', at: now, code: 'bad-request', msg: '첫 프레임은 hello 여야 합니다' }));
        this.kill(sid, CLOSE.BAD_REQUEST, 'hello-first');
        return null;
      }
      await this.apply({ k: 'hello', sid, op: att.op || null, m: p.m });
      const L = this.live.players[p.m.pid];
      return L && L.sid === sid ? { pid: p.m.pid } : null;
    }
    if (p.m.t === 'hello') return null;
    if (p.m.t === 'start') await this.apply({ k: 'seed', value: this.io.random32() });
    await this.apply({ k: 'msg', pid: att.pid, sid, m: p.m });
    return null;
  }

  // 대상 → sid 목록. '*' 는 접속 중인 멤버 전원(except 제외)
  resolve(s) {
    if (s.sid) return [s.sid];
    const L = this.live.players;
    if (s.to === '*') return Object.entries(L).filter(([pid, l]) => l.connected && l.sid && pid !== s.except).map(([, l]) => l.sid);
    const list = Array.isArray(s.to) ? s.to : [s.to];
    return list.map((pid) => L[pid]).filter((l) => l && l.connected && l.sid).map((l) => l.sid);
  }

  syncAlarm(ts) {
    if (ts === this.lastAlarm) return;
    this.lastAlarm = ts;
    this.io.setAlarm(ts);
  }

  async apply(ev) {
    const now = this.io.now();
    this.stats.reduces++;
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
