# dicekeep-net — 멀티플레이 중계 서버

주사위 성채 '인피니티 · 함께' 의 서버. **방 · 시계 · 시드 · 중계만** 맡고 시뮬레이션은 각 클라이언트가 자기 보드만 돌린다.
루트의 정적 Worker `dicekeep` 와 별개의 Worker(`dicekeep-net`)이며, Durable Object `Room` 하나가 방 하나다.

```
net/
  wrangler.jsonc       Worker 설정 (DO 바인딩 ROOM · migrations v1 · vars ALLOWED_ORIGINS/TIMING)
  package.json         scripts: dev · test · deploy (의존성은 wrangler 뿐, 테스트는 의존성 없음)
  src/index.js         Worker 엔트리: Origin 검사 · IP 속도 · /health · /ws/new · /ws/room/:code
  src/room.js          Room DO 어댑터 (Hibernation WebSocket API · storage · alarm)
  src/host.js          어댑터 공통부: room-core 의 effects 실행 · 프레임 크기 · 소켓 토큰 버킷 (DO 와 dev-server 공용)
  src/room-core.js     순수 상태 머신 (규칙 전부. 타이머·난수·I/O 없음)
  src/timing.js        상수 표 · spawnEnd(w) · isBoss(w) · TIMING=fast
  src/proto.js         메시지 스키마·정규화 · 닫기 코드 · PROTOCOL=2
  src/codes.js         방 코드 (31자 · 6자리)
  src/ratelimit.js     토큰 버킷
  src/http.js          Origin 규칙 · 경로 파싱 (Worker · dev-server 공용)
  test/*.test.js       node:test 단위 테스트 (U1~U9, content.js 패리티 포함)
  test/dev-server.mjs  workerd 없이 같은 규칙을 돌리는 최소 WebSocket 서버 (테스트 더블)
  test/ws-smoke.mjs    실제 소켓으로 한 판을 끝까지 돌리는 통합 스모크
```

## 실행

```sh
cd net
npx wrangler dev --port 8787                 # 실제 DO 로컬 시뮬 (운영 타이밍)
npx wrangler dev --port 8787 --var TIMING:fast   # 짧은 판 (준비 2s · 막간 0.5s · 보스 5s · 12웨이브 클리어)
TIMING=fast node test/dev-server.mjs         # workerd 가 못 뜨는 환경용 테스트 더블 (PORT 기본 8787)
```

게임은 `python serve.py`(8137) 로 띄우고 `http://localhost:8137/?unlock=all` 로 연다. localhost 면 클라이언트가 `ws://localhost:8787` 을 자동으로 쓴다(`?net=ws://…` 로 지정 가능).
`GET /health` → `{ ok:true, protocol:2 }`.

## 테스트

```sh
cd net
npm test                                     # node --test "test/*.test.js" — 의존성 없음, 1초 안팎
node test/ws-smoke.mjs [ws://localhost:8787] # TIMING=fast 서버 상대. 한 판을 실제 시계로 돌리므로 ≈ 3분
```

`timing.test.js` 는 `content.js` 를 vm 으로 읽어 `spawnEnd(w)` 가 실제 마지막 스폰 시각 이상이고 차이 ≤ 3.5초임을 w=1..101 전부 확인한다.
**`content.js` 의 웨이브 계수(count/gap/보스 간격)를 바꾸면 반드시 이 테스트를 다시 돌린다.**

## 배포 (대시보드에서 1회)

1. Workers & Pages → 만들기 → **저장소 가져오기** → 이 저장소를 한 번 더 선택.
2. 이름 `dicekeep-net` · **루트 디렉터리 `net`** · 빌드 명령 비움 · 배포 명령 `npx wrangler deploy`.
3. 설정 → 빌드 → **비프로덕션(브랜치) 빌드 끄기**(DO Worker 는 프리뷰 URL 이 생기지 않는다). 프로덕션 브랜치 `main`.
4. 첫 배포에서 migrations `v1` 이 적용된다. `https://dicekeep-net.<계정>.workers.dev/health` 가 `{ok:true, protocol:2}` 면 성공.
5. Origin 은 서버가 자기 Host 에서 `<계정>.workers.dev` 접미를 뽑아 `https://dicekeep.<계정>.workers.dev` · `https://*-dicekeep.<계정>.workers.dev` · `http(s)://localhost:*` 를 자동 허용한다. 커스텀 도메인만 `vars.ALLOWED_ORIGINS`(쉼표 구분)에 넣는다. Origin 헤더가 없는 요청(비브라우저)은 통과시킨다.
6. 재배포는 진행 중인 판의 소켓을 끊을 수 있다(재접속으로 흡수). 프로토콜을 바꾸는 릴리스는 **net 먼저** 배포 — 프리뷰 브랜치 클라이언트도 운영 `dicekeep-net` 에 붙는다.

## 프로토콜 요약

경로: `/ws/new`(방 만들기) · `/ws/room/:code`(참가·재접속). 텍스트 프레임 1개 = JSON 1개, 서버→클라는 항상 `at`(서버 ms).
인증(pid·key)은 URL 이 아니라 **첫 프레임 `hello`** 에 싣는다. 거절도 항상 accept 뒤 `err` + close(44xx) — 브라우저는 HTTP 오류 본문을 못 읽는다.

| 클라 → 서버 | 서버 → 클라 |
|---|---|
| `hello{v:2, ver, op, pid, key, name}` · `start` · `sum{w,dw,l,g,k,f,lag,hid,b,o,tw}` · `done{w}` · `dead{w,k,r}` · `clear{w,k}` · `chat{text}` · `log{text,kind}` · `time{c}` · `leave` · 문자열 `ping` | `welcome` · `room` · `player` · `start` · `sched` · `hold` · `sum` · `chat` · `log` · `time` · `end` · `err` · 문자열 `pong` |

닫기 코드: 4000 leave · 4001 replaced · 4400 bad-request · 4403 origin/bad-key · 4404 no-room · 4409 full/started · 4410 expired · 4426 version · 4429 rate · 1009 프레임 2,048 B 초과.
자세한 필드·규칙은 `src/proto.js` 와 `src/room-core.js` 머리 주석, 계획 문서(GAME-SPEC §6.5).

## 상수 (`src/timing.js`)

| 이름 | 값 | 뜻 |
|---|---|---|
| PREP / INTERMISSION | 20 s / 6 s | 첫 웨이브 전 준비 · 막간 (fast: 2 s / 0.5 s) |
| BOSS_LIMIT + BOSS_GRACE | 320 s + 2 s | 보스 홀드 마감 = T_w + spawnEnd(w) + 322 s (fast: 5 s + 2 s) |
| CLEAR_WAVE | 101 | 클리어 선 (fast: 12) |
| END_GRACE | 60 s | 101 스폰 끝 뒤 미보고 alive → lost (fast: 5 s) |
| FRESH_BEAT / FRESH_LAG | 7 s / 30 s | 신선도 = connected ∧ 마지막 sum 7 s 이내 ∧ !hidden ∧ lag ≤ 30 s |
| HOLD_RECHECK | 5 s | 홀드 중 신선도 재검사 알람 |
| RECONNECT_GRACE | 180 s | 플레이 중 끊김 → left |
| LOBBY_GRACE | 45 s | 대기실 끊김(새로고침·백그라운드) → 좌석·방장을 지키다 제거 (leave 는 즉시) |
| LOBBY_TTL / END_TTL / GAME_CAP / EMPTY_END / CLAIM_TTL | 15 분 / 10 분 / 100 분 / 3 분 / 60 s | 만료 알람 → deleteAll |
| SUM_RELAY_MIN | 1.5 s | sum 중계 최소 간격(멤버당) |
| HELLO_TIMEOUT | 5 s | 첫 프레임 없으면 4400 |
| 소켓 버킷 / chat / log | 20/s 버스트 40 / 1/s 버스트 5 / 2/s 버스트 4 | 초과: 4429 / err rate / 조용히 폐기 |
| IP 버킷 | /ws/new 10/분 · /ws/room 60/분 | 429 JSON (아이솔레이트 메모리) |
| spawnEnd(w) | 일반 0.45 + (min(36, 12+⌊0.6w⌋) − 1) × max(0.3, 0.8 − 0.01w) s · 보스 1.05 + (2번째 보스부터 1.5) s | content.js 공식의 상한값. 막간은 6 s + (공식 − 실제) ≤ 9.1 s |

시계 규칙: 일반 웨이브 체인 `T_{w+1} = T_w + spawnEnd(w) + INTERMISSION` 은 시작 시 다음 보스까지 미리 방송하고 **절대 바꾸지 않는다**. 보스 웨이브만 홀드(`waiting` = alive ∧ fresh ∧ 미처치), `waiting` 이 비고 살아 있는 누군가가 처치했거나 마감이 되면 `T_{w+1} = now + INTERMISSION` 으로 다음 체인을 방송한다. 서버는 보스 시간초과로 아무도 죽이지 않는다(각 클라의 로컬 320 s 타이머가 낸다). 서버가 status 를 바꾸는 것은 `left`(유예 만료·leave)와 `lost`(마감 미보고)뿐.

## 예산 메모 (무료 플랜)

- `storage.put` 은 전이에서만(생성·참가·이탈·시작·홀드·bossDone·사망·완주·종료·만료) — 한 판 ≈ 150회. sum/chat/log/time 은 저장하지 않는다.
- sum 이 2초마다 오므로 판 중에는 DO 가 깨어 있다 → 한 판(4인 40분) ≈ 0.67 객체-시간 → 하루 ≈ 40판(13,000 GB-s). 대기실·관전·종료 후는 자동응답 ping 만이라 하이버네이션.
- 최악 판 길이 ≈ 보스 10회 × 328 s + 일반 91 × ≤ 21 s ≈ 83분 < GAME_CAP 100분.
- 배포 후 첫 판 뒤 대시보드에서 rows written · GB-s 를 실측해 여기에 적는다. 부족하면 클라 `sumInterval` 4초 또는 유료 플랜.
