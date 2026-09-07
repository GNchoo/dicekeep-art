# 브라우저 검증 스크립트 (Playwright, 저장소 밖 실행용)

스크린샷·로그는 기본적으로 현재 폴더에 쓴다. `single-smoke.js`, `walk-jitter.js`, `inf-art-check.js`는 Windows/Linux/macOS에서 실행할 수 있으며 `E2E_OUTPUT_DIR`로 결과 폴더를 지정할 수 있다. 나머지 기존 스크립트는 아직 아래 세션 환경의 브라우저 경로를 사용한다.

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
node tools/e2e/inf-art-check.js 11
node tools/e2e/single-smoke.js
$env:E2E_OUTPUT_DIR = '../e2e-results-phone'
node tools/e2e/inf-art-check.js 11 --phone
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
| `inf-art-check.js [maxWave=11] [--phone]` | 최소 1~11웨이브: 실제 적의 이름·새 그림 키·이동형·크기·등급과 정상 이동/애니메이션을 검증. 기본 1240×860, `--phone`은 440×956. 1~9는 실제 업데이트가 실제 drawImage에서 지상 0~7·비행 0~3을 선택할 때 잠시 정지해 각 프레임 확대 캡처, 10은 정지 보스, 11은 기존 로스터 폴백을 검증. 새 인피니티 아트 HTTP 오류·요청 실패·pageerror 시 종료 1 |

훅(`game.js` 끝): `DK`, `DKstartInf('clear')`, `DKchest()`, `DKsync()`, `DKend()`, `DKlobby()`, `DKlobbyView('hub'|'single'|'multi')`, `DKLANES()`, `DKacquire(face)`, `DKDIE.forceFinal`.

`walk-jitter.json`과 `inf-art-check.json`은 측정값과 실패 목록을 남긴다. 아트 검사 JSON에는 실제 뷰포트도 기록한다. 확대 캡처는 `inf-w01-frame0.png`~`frame7.png` (비행은 frame3까지), 보스/폴백은 `inf-w10-static.png`/`inf-w11-static.png`, 전체 화면은 `inf-wNN-wide.png`이다. 확대 영역은 340×240이며 현재 뷰포트 안에 들어오도록 좌표를 제한한다. 데스크톱·폰은 같은 파일명을 쓰므로 별도 결과 폴더를 지정한다. 실제 그려진 프레임을 관찰하므로 0.4초 간격 캡처가 5fps 걷기의 홀수/짝수 프레임을 건너뛰던 문제를 피한다. 스크린샷을 위한 정지 시간 외에는 정상 게임 업데이트를 사용한다.

수치 안정화 통과는 올바른 시트 분할이나 적당한 아트 분위기를 보증하지 않는다. 프레임 잘림·옆 칸의 파편·심한 형태 변화·과도한 혐오감·작은 게임 크기에서의 가독성은 별도로 원본 시트와 게임 캡처를 눈으로 확인한다. **10웨이브 `infB10`은 이동하는 정지 보스 그림이며 걷기 시트가 준비된 것으로 보고하지 않는다.** 기존 선택적 아트의 404는 새 인피니티 아트 오류와 구별하며, `single-smoke.js`의 콘솔 진단은 기록하되 pageerror와 게임 진행 단언 실패는 종료 1로 처리한다.

ground-gait-check.cjs는 다리별 발 순서 반전, 반 주기 지지 교대, 발 들림, 원본·게임 로더의 발 텍스처, 관찰한 접지 자세의 바닥 위치, 기절·감속·경로 순환을 검사한다. walk-preview.cjs는 고정 바닥 눈금 위를 전진하는 지상 7종과 글자 없는 1~9 혼합 GIF를 출력한다. [최신 보행 보고서](../art-review/pr29-gait/README.md)를 참고한다.
