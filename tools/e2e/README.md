# 브라우저 검증 스크립트 (Playwright, 저장소 밖 실행용)

기존 스크립트의 스크린샷·로그는 기본적으로 현재 폴더에 쓴다. 새 `directional-*.cjs` 검사는 `gen/e2e/` 아래에 결과를 남긴다. `single-smoke.js`, `walk-jitter.js`, `inf-art-check.js`, `directional-*.cjs`는 Windows/Linux/macOS에서 실행할 수 있으며 `E2E_OUTPUT_DIR`로 결과 폴더를 지정할 수 있다. 나머지 기존 스크립트는 아직 아래 세션 환경의 브라우저 경로를 사용한다.

위 스크립트와 `ground-gait-check.cjs`, `walk-preview.cjs`는 `playwright-core`가 `node_modules` 또는 `NODE_PATH`에서 해석되어야 한다. 필요하면 저장소에서 `npm install --no-save --package-lock=false playwright-core`로 설치한다. 브라우저 선택 순서는 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` → Playwright Chromium → 설치된 Chrome/Edge/Chromium이다. 지정한 실행 파일이 없거나 사용할 브라우저를 찾지 못하면 실패한다.

인피니티 아트 검증 예시 (정적 서버를 저장소 루트에서 별도 실행):

```powershell
python serve.py
```

다른 PowerShell 터미널에서:

```powershell
$env:E2E_OUTPUT_DIR = '../e2e-results'
$env:E2E_BASE_URL = 'http://localhost:8137/'
# 필요한 경우에만 설치된 브라우저 경로를 직접 지정한다.
# $env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node tools/e2e/ground-gait-check.cjs --self-test
node tools/e2e/ground-gait-check.cjs
node tools/e2e/walk-jitter.js --self-test
node tools/e2e/walk-jitter.js
node tools/e2e/inf-art-check.js 101
node tools/e2e/directional-edge-cases.cjs
node tools/e2e/directional-runtime-contracts.cjs
node tools/e2e/directional-review-regressions.cjs
node tools/e2e/directional-cache-pressure.cjs
node tools/e2e/single-smoke.js
$env:E2E_OUTPUT_DIR = '../e2e-results-phone'
node tools/e2e/inf-art-check.js 101 --phone
node tools/e2e/directional-edge-cases.cjs --phone
```

Linux/macOS에서도 같은 `node` 명령을 사용하고 환경 변수는 `export E2E_OUTPUT_DIR=../e2e-results` 형태로 지정한다. `E2E_BASE_URL`의 기본값은 `http://localhost:8137/`이다.

기존 세션 환경의 실행 예시:

```bash
nohup python3 serve.py >/dev/null 2>&1 &          # 정적 서버 8137
cd net && TIMING=fast PORT=8787 nohup node test/dev-server.mjs >/dev/null 2>&1 &   # 멀티 테스트용 (mp3-test, mp-resume-test)
mkdir -p /tmp/e2e && cd /tmp/e2e
export NODE_PATH=/opt/node22/lib/node_modules       # playwright-core · 크로미움 /opt/pw-browsers/chromium
node /home/user/dicekeep-art/tools/e2e/single-smoke.js
```

| 스크립트 | 확인하는 것 |
|---|---|
| `devices-test.js [--only=iphoneSE,foldOpen] [--scen=lobby,infPlay] [--mp]` | 16기기 × 세로/가로 × 화면별 레이아웃 감사 (가로 스크롤·HUD 줄·안전영역·겹침·레터박스). 허용된 실패: `foldOpen l … letterbox 46 > 12` |
| `menu-test.js` | ≡ 메뉴·일시정지·바로 판매·보류 문구·보스 웨이브·포기 |
| `single-smoke.js` | 데스크톱·세로 폰: 로비 → 인피니티 1웨이브 → 결과 → 로비 |
| `mp3-test.js` · `mp-resume-test.js` | 멀티 v3(방·빠른 매칭·관전·순위·채팅) · 재접속 (dev-server 필요) |
| `dice-loss-test.js` | 회전·보스 보상 큐에서 주사위가 사라지지 않는지 |
| `title-vp.js <prefix>` · `title-vp-l.js` | 타이틀·로비를 여러 뷰포트로 (세로는 그림 제목, 가로는 CSS 제목) |
| `load-order.js` · `load-order2.js <delay|abort|hang>` | 키아트 → 진행 막대 순서 (PNG 지연·키아트 차단·응답 정지) |
| `hub-shot.js` · `hub-matrix.js` | 로비 허브·싱글·멀티 갈래, 뒤로가기 체인, 배속 버튼 |
| `boss-shot.js` · `boss-matrix.js` | 보스 웨이브 말풍선, 칩·미니 버튼 한 줄 판정 |
| `art-visual.js` · `stage-sell-shot.js` · `polish-shot.js` · `entry-shot.js` · `lobby-land.js` | 그림 연출·판매 버튼·굴림 중앙 표시·세로 입구·가로 로비 |
| `walk-jitter.js [--self-test]` | 준비된 1~9웨이브 시트 필수, 지상 8개·비행 4개의 유효한 비어 있지 않은 프레임, 같은 캔버스 치수·유한한 수치 확인. 비행 중심 편차를 검사하며 지상 중심·실루엣 변화는 진단만 기록한다. 실제 지상 접지는 ground-gait-check.cjs로 별도 검사한다. JSON에 높이·넓이 편차도 기록 |
| `inf-art-check.js [maxWave=101] [--phone] [--pilot]` | `directional-real-art.cjs` 실행 진입점. 기본 110종의 승인된 실제 PNG를 필수로 요구한다. 실제 웨이브 버튼으로 일반·보스·부관을 생성하고 네 방향의 모든 포즈가 실제 게임 `drawImage`에 사용되는지, 기절 시 위상 보존, 96 MiB/동시 2개 캐시 제한과 아트 HTTP 오류를 확인한다. `--pilot`은 제작 중 일부만 검사하며 출시 검증을 대신하지 않는다. |

훅(`game.js` 끝): `DK`, `DKstartInf('clear')`, `DKchest()`, `DKsync()`, `DKend()`, `DKlobby()`, `DKlobbyView('hub'|'single'|'multi')`, `DKLANES()`, `DKacquire(face)`, `DKDIE.forceFinal`.

`directional-real-art-{desktop|phone}.json`은 실제 프레임 식별자, 방향, 누적 거리, 캐시 측정값과 실패 목록을 남긴다. 모든 포즈가 실제로 관측될 때까지 기다리므로 고정 간격 캡처의 프레임 누락을 피한다. 직선 구간 시작 위치만 준비하고, 포즈 선택과 이동은 정상 게임 업데이트가 수행한다.

직선은 화면 밖 입구를 제외하고 `loopAt` 이후에서 선택한다. 모든 포즈는 실제 알파 전경 바운드의 98% 이상이 캔버스 안에 그려져야 집계된다. W101에서도 스폰 큐를 줄여 관찰할 수 있도록 종료 없는 무한 모드로 실행하며, 도전 모드의 기존 종료 조건을 수정하지 않는다.

`directional-edge-cases.cjs [--phone] [--pilot]`는 대표 이동형의 실제 네 코너, 경로 순환, 일시정지 중 화면 회전, 50% 감속 및 기절을 확인한다. 위상 증가량을 실제 이동 거리와 비교하고 코너당 방향 전환이 한 번인지 검사한다.

`directional-runtime-contracts.cjs [--pilot]`는 승인된 실제 PNG와 인라인 fallback을 사용한다. 시작 시 fallback 전부 디코딩, 선택적 시트 지연 로딩, 101개 웨이브의 논리 능력치 보존, 부관 표시 크기, 실제 관전 `drawImage`, 타워 포구의 시각 보정과 탄환 논리 경로 보존, 시트 요청 실패 시 같은 캐릭터의 64px 대체 이미지를 검증한다. 게임 함수 참조는 테스트 페이지의 응답에만 추가하며 배포 코드를 변경하지 않는다.

`directional-review-regressions.cjs`는 로컬·관전 비행 시계와 기절, 101 이후 보스 부관 외형, 여러 번 정상 로드한 뒤 일시 실패한 PNG의 재시도 회복을 실제 브라우저에서 검사한다.

`directional-cache-pressure.cjs`는 110종을 포함한 실제 적 200마리를 생성하고 네 방향의 화면 내부 그리기, 위상 진행, 96 MiB/동시 2개 제한, 제거 뒤 메모리 회수를 검사한다. 실제 시트 프레임과 정지 PNG·인라인 대체 이미지를 구분해 기록한다. 모든 보스를 동시에 배치한 극단 조건이므로 이 결과를 200마리 전부의 동시 걷기 통과로 해석하지 않는다.

`directional-production.cjs`는 `E2E_BASE_URL`을 명시해야 실행된다. 운영 또는 로컬 서버가 실제로 보낸 핵심 파일 5개와 최종 PNG 674개를 동시 요청 4개 이하로 내려받아 저장소 바이트와 비교한다. 한 실행에 약122MB의 PNG를 받는다. HTTP 응답을 로컬 파일로 교체하지 않고 데스크톱·휴대폰에서 W1/70/100/101의 6개 정체성과 네 방향, 7/20성 타워의 실제 표시를 확인한다. 배포가 완료된 후 한 번 실행하며 기본 결과는 `gen/e2e/production/`에 남긴다.

수치 안정화 통과는 올바른 시트 분할이나 적당한 아트 분위기를 보증하지 않는다. 프레임 잘림·옆 칸의 파편·심한 형태 변화·과도한 혐오감·작은 게임 크기에서의 가독성은 별도로 원본 시트와 게임 캡처를 눈으로 확인한다. W10 보스도 새 방향별 걷기 시트 검증 대상이다. 기존 선택적 아트의 404는 새 인피니티 아트 오류와 구별하며, `single-smoke.js`의 콘솔 진단은 기록하되 pageerror와 게임 진행 단언 실패는 종료 1로 처리한다.

`ground-gait-check.cjs`, `walk-preview.cjs`, `walk-jitter.js`는 PR #29 당시의 1~9웨이브 측면 시트 회귀 검사다. 새 세 방향 리그의 분할·관절·접지는 `tools/check-directional-art.mjs`와 `tools/preview-directional-motion.mjs`로 검사한다. 제작 기록과 검수 도구는 [방향별 아트 작업 폴더](../art-review/directional-101/), 이전 측면 검사 기록은 [PR #29 보행 보고서](../art-review/pr29-gait/README.md)를 참고한다.
