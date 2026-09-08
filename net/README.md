# dicekeep-net — 멀티플레이 중계 서버

주사위 성채 '인피니티 · 함께' 의 서버. **방 · 시드 · 중계 · 방 안 순위 · 빠른 매칭만** 맡고 시뮬레이션과 웨이브 진행은 각 클라이언트가 자기 보드에서 **자기 속도로** 돌린다. 프로토콜 4는 `clear`(101웨이브 완주)와 `extreme`(극한 경쟁)을 별도 방·매칭으로 운영한다.
루트의 정적 Worker `dicekeep` 와 별개의 Worker(`dicekeep-net`)이며, Durable Object `Room` 하나가 방 하나, `Lobby` 단일 객체가 빠른 매칭 대기열이다.

```
net/
  wrangler.jsonc       Worker 설정 (DO 바인딩 ROOM·LOBBY · migrations v1/v2 · vars ALLOWED_ORIGINS/TIMING)
  package.json         scripts: dev · test · deploy (의존성은 wrangler 뿐, 테스트는 의존성 없음)
  package-lock.json    Workers Builds의 npm ci용 Wrangler 및 하위 의존성 잠금
  src/index.js         Worker 엔트리: Origin 검사 · IP 속도 · /health · /ws/new · /ws/room/:code · /ws/quick
  src/room.js          Room DO 어댑터 (Hibernation WebSocket API · storage · alarm · /claim)
  src/lobby.js         Lobby DO 어댑터 (빠른 매칭 대기열 · /quota 방 생성 상한)
  src/host.js          어댑터 공통부: RoomHost · LobbyHost — 순수 상태 머신의 effects 실행 · 프레임 크기 · 소켓 토큰 버킷 (DO 와 dev-server 공용)
  src/room-core.js     Room 순수 상태 머신 (규칙 전부. 타이머·난수·I/O 없음)
  src/lobby-core.js    Lobby 순수 상태 머신 (묶기 규칙 · queued · 시간당 방 생성 상한)
  src/claim.js         코드 생성 → Room /claim (Worker 와 Lobby 공용)
  src/timing.js        상수 표 · TIMING=fast
  src/modes.js         clear/extreme 모드 · 극한 보고 웨이브 상한
  src/proto.js         메시지 스키마·정규화 · 닫기 코드 · PROTOCOL=4
  src/codes.js         방 코드 (31자 · 6자리)
  src/ratelimit.js     토큰 버킷
  src/http.js          Origin 규칙 · 경로 파싱 (Worker · dev-server 공용)
  test/*.test.js       node:test 단위 테스트 (U1~U11)
  test/dev-server.mjs  workerd 없이 같은 규칙을 돌리는 최소 WebSocket 서버 (테스트 더블, Lobby 포함)
  test/ws-smoke.mjs    실제 소켓으로 한 판 + 빠른 매칭을 돌리는 통합 스모크 (≈ 20초)
```

## 실행

잠금 파일의 Wrangler 4.129.1은 Node.js 22 이상을 요구한다. Workers Builds의 Node 버전도 같은 조건을 충족해야 한다.

```sh
cd net
npm ci                                     # package-lock.json 기준 설치
npx wrangler dev --port 8787                 # 실제 DO 로컬 시뮬 (운영 타이밍)
npx wrangler dev --port 8787 --var TIMING:fast   # 준비 2s · 보스 5s · clear 모드만 12웨이브 클리어
TIMING=fast node test/dev-server.mjs         # workerd 가 못 뜨는 환경용 테스트 더블 (PORT 기본 8787)
```

게임은 `python serve.py`(8137) 로 띄우고 `http://localhost:8137/?unlock=all` 로 연다. localhost 면 클라이언트가 `ws://localhost:8787` 을 자동으로 쓴다(`?net=ws://…` 로 지정 가능).
`GET /health` → `{ ok:true, protocol:4 }`. `extreme`은 fast에서도 `clearWave:0`이며 웨이브 완주로 종료하지 않는다.

## 테스트

```sh
cd net
npm test                                     # node --test "test/*.test.js" — 의존성 없음, 1초 안팎 (client.test.js 는 루트 net.js 를 읽는다)
node --test test/room-core.test.js test/proto.test.js test/codes.test.js test/timing.test.js test/ratelimit.test.js test/lobby-core.test.js   # 서버만
node test/ws-smoke.mjs [ws://localhost:8787] # TIMING=fast 서버 상대. 한 판 + 빠른 매칭 10초 대기 ≈ 20초
```

`timing.test.js` 는 `content.js` 를 vm 으로 읽어 `bossTimeLimit`·`clearWave` 가 `TIMING_BASE` 와 같은지 확인한다. 서버에는 웨이브 시계가 없으므로 스폰 공식 패리티는 없다.

## 배포 (대시보드에서 1회)

1. Workers & Pages → 만들기 → **저장소 가져오기** → 이 저장소를 한 번 더 선택.
2. 이름 `dicekeep-net` · **루트 디렉터리 `net`** · 빌드 명령 비움 · 배포 명령 `npx wrangler deploy`.
3. 설정 → 빌드 → **비프로덕션(브랜치) 빌드 끄기**(DO Worker 는 프리뷰 URL 이 생기지 않는다). 프로덕션 브랜치 `main`.
4. 첫 배포에서 migrations `v1`(Room)·`v2`(Lobby) 가 적용된다. `https://dicekeep-net.<계정>.workers.dev/health` 가 `{ok:true, protocol:4}` 인지 확인한다. 이 migration 태그와 저장 상태의 `sv`는 통신 프로토콜 번호와 별개다.
5. Origin 은 서버가 자기 Host 에서 `<계정>.workers.dev` 접미를 뽑아 `https://dicekeep.<계정>.workers.dev` · `https://*-dicekeep.<계정>.workers.dev` · `http(s)://localhost:*` 를 자동 허용한다. 커스텀 도메인만 `vars.ALLOWED_ORIGINS`(쉼표 구분)에 넣는다. Origin 헤더가 없는 요청(비브라우저)은 통과시킨다.
6. 프로토콜을 바꾸는 릴리스는 **net 배포 → 운영 health의 protocol:4 확인 → v4 두 모드 접속 확인 → 정적 웹·Android 배포** 순서로 진행한다. 프리뷰 브랜치와 Android 클라이언트도 기본적으로 운영 `dicekeep-net`에 붙으므로, 사전 검증은 로컬 서버나 명시적인 테스트 주소를 사용한다. net 배포가 실패하면 새 클라이언트 공개를 보류한다.
7. 재배포로 소켓이 끊길 수 있다. 같은 프로토콜의 일시 단절은 재접속 대상이지만 **v3 hello는 v4 서버에서 `err version` + 4426으로 거절**된다. 프로토콜 전환은 무중단 재접속을 보장하지 않으며 구 웹은 새로고침, 구 앱은 업데이트가 필요하다. 롤백도 서버·클라이언트의 호환 조합으로 진행한다.

2026-09-09 배포 사전 조사에서 기존 main `1459ac3`의 `Workers Builds: dicekeep-net` 실패 로그는 `net` 루트의 `npm ci`가 잠금 파일 부재로 `EUSAGE`를 반환한 것으로 확인됐다. Worker 배포 명령에 도달하기 전의 실패다. 이 변경에서 `net/package-lock.json`을 추가했고 Node.js 22.17.0 / npm 11.4.2에서 `npm ci --no-fund --no-audit`가 성공했다(91개 패키지). `npx wrangler deploy --dry-run --outdir=../gen/release-net`도 성공했으며, 번들에 `Room`·`Lobby`·default export와 protocol 4가 유지된다. 입력 소스·번들 SHA-256은 `gen/release-net/provenance.json`에 기록한다. 조사 당시 운영 health는 protocol 3이었으며, 이 설치·로컬 번들 검증은 운영 배포 성공을 뜻하지 않는다.

## 진행 규칙 (v4, 개별 진행)

- **모드**: 방 생성·참가·빠른 매칭은 `mode:'clear'|'extreme'`를 사용한다. 방 안에서는 모드를 바꿀 수 없으며 다른 모드 참가를 거절한다. v4 메시지나 저장 상태의 모드가 생략된 경우만 `clear`로 해석한다. 이는 v3 클라이언트 접속 허용을 뜻하지 않는다.
- **start**(방장 · lobby · 접속 ≥ 2): 서버가 `seed` 를 만들고 `t0 = now + prep`, 전원 `alive`. `start{seed, t0, timing:{prep, bossLimit, clearWave}, mode, now}` → `room{phase:'playing'}`. 막간(intermission)은 클라가 `content.js` 값을 쓴다.
- `clear`의 `timing.clearWave`는 101(fast: 12)이다. `extreme`의 값 **0은 완주 목표가 없다는 표식**이다. 0웨이브 종료나 무제한 숫자 허용이 아니며, 보고 웨이브는 `MAX_WAVE=1,000,000`까지 제한한다. 극한도 기존 100분 `GAME_CAP`을 유지한다.
- 그 뒤 **각 클라는 싱글처럼 자기 웨이브를 돈다**(배속 1~3 자유). 서버는 웨이브 시계·보스 홀드·스케줄이 없고 보고만 받는다:
  - `sum` — 진행 요약. `wave`·`kills`·`dw` 는 max 로 기록한다. `w`·`dw`는 clear에서 `0..clearWave`, extreme에서 `0..MAX_WAVE`로 클램프한다. 중계는 아래.
  - `done{w}` — 통계용. clear는 `1..clearWave`, extreme은 `1..MAX_WAVE`만 받는다.
  - `dead{w,k,r}` — alive 만. 모드 상한으로 제한한 `w`에 대해 `deathWave = max(0, w−1)`. `player{status:'dead', wave, deathWave, kills}` 방송.
  - `clear{w,k}` — clear 모드의 alive만, `w ≥ clearWave`면 수락(보스 처치·완주 검증은 클라 몫). `clearAt = now`. `player{status:'cleared', wave, kills, clearAt}` 방송. 미달이면 anomaly 로그. extreme은 `err mode`로 거절한다.
- **순위** `end.ranking[]`: `cleared` 는 `clearAt` 오름차순(먼저 완주 = 1위, **공동 없음**, 동시각은 joinedAt) → 그다음 `lost`/`dead`/`left` 는 `deathWave` 내림차순 → `kills` 내림차순 → joinedAt. 항목 `{ pid, name, rank, status, wave, deathWave, kills, clearAt }`, `rank` 는 1부터 연속.
- **종료**: alive 0 → `cleared`(완주자 있음) / `all-dead`(dead·lost 있음) / `empty`(전원 left). `t0 + GAME_CAP` → 남은 alive 를 `lost`(deathWave = wave) 로 → `timeout`. 플레이 중 전원 끊김 `EMPTY_END` → `empty`. 재접속 유예 180 s 뒤 alive 는 `left`.
- 클라이언트의 `dead`·`clear` 보고 없이 서버가 종료 status를 정하는 경우는 `left`(유예 만료·leave)·`lost`(GAME_CAP)다. 보스 시간초과는 각 클라가 `dead{r:'bossTimeout'}` 으로 보고한다.
- **검증 한계**: 진행·처치·완주·적 외형 스트림은 클라이언트 보고값이다. 서버는 형식·범위·모드·상태·전송량을 검사하고 방 안 순위를 계산하지만 전투를 재실행하거나 조작을 판별하지 않는다. 이 순위는 서버 권위의 부정행위 방지 기록이나 결제·재화 지급 근거가 아니다. `dead`는 보고 웨이브의 직전 값을 쓰고, `left`·`lost`는 현재 기록된 `wave`를 쓰므로 `dw`가 모든 종료 사유의 순위 기준인 것도 아니다.

## 프로토콜 요약 (v4)

경로: `/ws/new`(방 만들기) · `/ws/room/:code`(참가·재접속) · `/ws/quick`(빠른 매칭). 텍스트 프레임 1개 = JSON 1개, 서버→클라는 항상 `at`(서버 ms).
인증(pid·key)은 URL 이 아니라 **첫 프레임 `hello`** 에 싣는다. 거절도 항상 accept 뒤 `err` + close(44xx) — 브라우저는 HTTP 오류 본문을 못 읽는다.

| 클라 → 서버 | 서버 → 클라 |
|---|---|
| `hello{v:4, ver, mode:'clear'\|'extreme', op:'create'\|'join'\|'quick', pid, key, name}` · `start` · `sum{w,dw,l,g,k,f,sp,hid,b,o,tw,ll?,en?}` · `watch{pid\|null}` · `done{w}` · `dead{w,k,r}` · `clear{w,k}` · `chat{text}` · `log{text,kind}` · `time{c}` · `leave` · 문자열 `ping` | `welcome` · `room` · `player` · `start` · `sum{pid,…}` · `watched{n}` · `queued{n,eta,mode}` · `matched{code,mode}` · `chat` · `log` · `time` · `end` · `err` · 문자열 `pong` |

- `hello.v`는 통신 프로토콜 4, `hello.ver`는 클라이언트 호환 그룹이다. 현재 클라이언트는 `net.js?v=…`의 쿼리값을 `ver`로 쓰며, 같은 방과 빠른 매칭은 **같은 ver와 mode**를 요구한다. 파일 캐시 버전 변경도 매칭 그룹에 영향을 준다.
- `sum` 필드: `sp` 배속(정수 1|2|3, 필수) · `ll` 보내는 쪽 레인 길이(정수 0..100000, 선택) · `en` 적 스트림 문자열(≤ 5,120자, `^[0-9;,]*$`, 선택). `lag` 필드는 사용하지 않는다. 200개 적의 기존 3열과 선택 외형·위상 숫자 열을 담으며, 서버는 외형 코드의 의미나 각 열의 게임 상태를 검증하지 않고 문자열 형식·길이만 검사한다.
- **sum 중계**: 다른 멤버에게 1.5 s 간격으로 `sum{pid,…}` 을 보내되 `en`·`ll` 은 뗀다. 이 pid 를 보고 있는 멤버(`watch{pid}`)에게는 `en`·`ll` 을 포함해 1 s 간격으로 보낸다(간격은 따로 센다). 본인에게는 오지 않는다.
- **watch**: `watch{pid}` 로 내가 보는 상대를 알린다(`null` = 그만, 자기 자신은 null 취급, 방에 없는 pid 는 무시). 대상의 관전자 수가 바뀌면 대상에게 `watched{n}`(나를 보는 접속 중인 사람 수). 관전자가 끊기거나 돌아와도 갱신. 대상이 죽거나 나가도 내 watching 은 그대로. 하이버네이션 복귀·재접속 후에는 클라가 `watch` 를 다시 보내는 게 안전하다.
- `room` 스냅샷: `{ t, code, kind:'code'|'quick', mode:'clear'|'extreme', phase, hostId, ver, reserveUntil, now, players[], game }`. `players[]` 항목 `{ pid, name, host, connected, status, wave, dw, deathWave, kills, sp, hidden, rank }`. `game = { t0, timing, seed, mode } | null`.
- `welcome{pid, code, kind, resumed, now, room}` · `player{pid, connected}` 또는 `player{pid, status, wave, deathWave?, kills?, clearAt?}` · `end{reason, ranking, seed}` · `time{c, s}`.

닫기 코드: 4000 leave/matched · 4001 replaced · 4400 bad-request · 4403 origin/bad-key · 4404 no-room · 4409 full/started · 4410 expired · 4426 version · 4429 rate · 1009 프레임 6,144 B 초과.
자세한 필드·규칙은 `src/proto.js` 와 `src/room-core.js`·`src/lobby-core.js` 머리 주석.

## 빠른 매칭

1. 클라가 `GET /ws/quick`(Upgrade) → Lobby DO. 5 초 안에 `hello{v:4, ver, mode, op:'quick', pid, key, name}`.
2. 서버가 대기 인원 변화·5 s 알람마다 `queued{n, eta, mode}` (n = 같은 `ver`·`mode` 대기 인원, eta = 시작까지 남은 ms 또는 null).
3. 같은 `ver`·`mode`끼리 **4명이면 즉시**, **2명 이상이고 가장 오래 기다린 사람이 10 s 이상**이면 묶는다. 두 모드의 인원을 섞지 않는다. 같은 pid 재접속은 좌석 교체(옛 소켓 4001, 같은 그룹이면 대기 시작 시각 유지). 소켓 닫힘 = 대기 취소. 대기열 200 초과 → `err rate` + 4429.
4. 묶이면 Lobby 가 Room `/claim`(`kind:'quick'`, `ver`, `mode`, 예약 좌석 pid·key·name, `until = now + 30 s`) 으로 방을 만들고 각자에게 `matched{code, mode}` 뒤 4000 으로 닫는다. 방 생성 상한(시간당 120)에 걸리면 `err rate` + 4429.
5. 각 클라는 `/ws/room/:code` 에 **같은 pid·key·ver·mode** 로 `hello{v:4, ver, mode, op:'join', pid, key, name}` (이름은 예약 이름을 쓴다). 첫 접속은 `resumed:false`, `room.hostId = null`, `room.reserveUntil` 로 마감을 알 수 있다. 예약에 없는 pid 는 `full` 4409. `start` 메시지는 `not-host`.
6. **자동 시작**: 예약 인원 전원 접속 즉시, 또는 `reserveUntil` 에 접속 2명 이상이면 서버가 start(미접속 좌석 제거). 접속 1명 이하면 전원 `err expired`(msg '상대가 오지 않았습니다') + 4410 후 방 폐기.

## 상수 (`src/timing.js`)

| 이름 | 값 | 뜻 |
|---|---|---|
| PREP | 20 s | 첫 웨이브 전 준비 (fast: 2 s) — `start.timing.prep` |
| BOSS_LIMIT | 320 s | 보스 제한 (fast: 5 s) — `start.timing.bossLimit`, 클라 로컬 타이머 |
| CLEAR_WAVE | 101 | clear 모드 완주 목표 (fast: 12); extreme은 `timing.clearWave=0` |
| MAX_WAVE (`src/modes.js`) | 1,000,000 | extreme 모드 보고 웨이브 상한. 완주 목표가 아님 |
| RECONNECT_GRACE | 180 s | 플레이 중 끊김 → left |
| LOBBY_GRACE | 45 s | 대기실 끊김(새로고침·백그라운드) → 좌석·방장을 지키다 제거 (leave 는 즉시) |
| LOBBY_TTL / END_TTL / GAME_CAP / EMPTY_END / CLAIM_TTL | 15 분 / 10 분 / 100 분 / 3 분 / 60 s | 만료 알람 → deleteAll |
| RESERVE_TTL | 30 s | 빠른 매칭 예약 좌석 접속 마감 |
| SUM_RELAY_MIN / SUM_WATCH_MIN | 1.5 s / 1 s | sum 중계 최소 간격(멤버당) — 일반 / 보는 사람(en·ll 포함) |
| EN_MAX / LANE_MAX | 5,120자 / 100,000 | `sum.en` 길이 · `sum.ll` 상한; 200개 적의 외형·위상 포함 |
| HELLO_TIMEOUT | 5 s | 첫 프레임 없으면 4400 |
| MAX_FRAME | 6,144 B | 수신 프레임 상한 (초과 1009); 클라이언트 송신은 6,000 B |
| 소켓 버킷 / chat / log | 20/s 버스트 40 / 1/s 버스트 5 / 2/s 버스트 4 | 초과: 4429 / err rate / 조용히 폐기 |
| IP 버킷 | /ws/new 10/분 · /ws/room 60/분 · /ws/quick 30/분 | 429 JSON (아이솔레이트 메모리) |
| ROOMS_PER_HOUR | 120 | 방 생성 상한 (Lobby DO `/quota` 슬라이딩 창, 빠른 매칭 방 포함) → 429 |
| QUICK_WAIT / QUICK_QUEUE_MAX / QUICK_BEAT | 10 s / 200 / 5 s | 빠른 매칭 대기 · 대기열 상한 · queued 재방송 |

## 예산 메모 (무료 플랜)

- `storage.put` 은 전이에서만(생성·참가·이탈·시작·사망·완주·종료·만료) — 한 판 ≈ 40회. sum/done/watch/chat/log/time 은 저장하지 않는다.
- sum 이 2초마다 오므로 판 중에는 DO 가 깨어 있다 → 한 판(4인 40분) ≈ 0.67 객체-시간. 개별 진행이라 3배속이면 판이 짧아진다. 대기실·관전·종료 후는 자동응답 ping 만이라 하이버네이션.
- 관전(`watch`)은 보는 사람 수만큼 1 s 간격 `sum{en}`이 늘어난다. 최대 3명에게 각 5,120자 이하의 `en`과 나머지 JSON 필드를 중계하며, 클라이언트 수신 전송량은 실제 패킷 크기로 측정한다. 6,144 B 상한은 서버가 **수신하는** 프레임 제한이며 중계 JSON에는 `pid`·`at` 등이 추가된다.
- Lobby DO 는 대기열이 비면 하이버네이션, 있으면 5 s 알람으로 깨어 있다. 대기열은 소켓 attachment 로, 방 생성 카운터는 storage 로 복원한다.
- 배포 후 첫 판 뒤 대시보드에서 rows written · GB-s 를 실측해 여기에 적는다. 부족하면 클라 `sumInterval` 4초 또는 유료 플랜.
