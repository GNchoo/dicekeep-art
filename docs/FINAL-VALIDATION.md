# v101 최종 검증 기록

## 독립 런타임 회귀 — 2026-09-09

검사 구간: **2026-09-08 15:34–15:40 UTC / 2026-09-09 00:34–00:40 UTC+09:00**. 로컬 서버 `http://localhost:8138/`, Windows의 Chrome을 Playwright `tools/e2e/browser.cjs`로 실행했다. 사용자 브라우저나 실결제를 조작하지 않았다.

이 절은 모드·기본 플레이·주사위 렌더 성능·결제 클라이언트 경계 검증을 기록한다. 제작 중인 **102–202 웨이브 신규 111종의 실제 아트 승인**, 운영 배포, 최종 Android 웹 자산 복사와 APK 재빌드는 포함하지 않는다. 모드 검사의 준비된 웨이브 경계와 균등 난수 구간은 결정적인 테스트 입력이며, 101웨이브 전체 실전 플레이나 관측 승률을 뜻하지 않는다.

### 검사한 소스

- `game.js`: `806997b5f8074e547980a6d8eefe094c97a08f7bc70a395c83dfc9980b8f34a3`
- `content.js`: `bb46dadcf62baa2bcd7e53a2555f66c325d600f727915352cbfa6694e765579a`
- `commerce-client.js`: `c7d1d35d83b37a414fb0221bce9ab85204df72f4c1dd3ade76af2840b99aa5e6`
- `cosmetics.js`: `e1e1b867d1c8c4dff980ac71148f7300ff2483084877943141e92488bd512e0b`
- 성능 도구가 추출한 렌더 구간: `331edefc7d0126d3d1e9403d4c79689ec1a02e7d95d14cfe406d394280416dfe`

검사 시작 시 로컬 `game.js`와 실제 HTTP 응답의 SHA-256이 일치했다. 폰·데스크톱 모드 검사와 성능 검사는 위와 동일한 게임 소스를 사용했다. 전후 해시 점검에서 게임·콘텐츠·결제·스킨 코드와 검사 도구는 그대로였으며, 통합 작업 중 `index.html`만 `8260bd23…31cf0cf`에서 `e3b4c831…7018d539`로 변경됐다. 이 기록은 해당 런타임 소스에 대한 결과이며 이후 패키징 HTML을 검사했다고 주장하지 않는다.

원본 해시와 검사 시각은 `gen/e2e/release-v101/sources.json`에 있다. 테스트 도구 SHA-256:

- `tools/e2e/game-modes.cjs`: `da1108c31483fbe433e6f5073bc0c65bedb058bf2db750c79ac84af32f27723c`
- `tools/e2e/single-smoke.js`: `4b38eb44a839a1be8f93f50281af103188c5cebf2a59bfecaeea1681d25afa7f`
- `tools/e2e/dice-performance.cjs`: `a36637732e1410f84613234acce95937c62b1c86ce8a9c95495143c6e84602d4`
- `tools/cosmetic-test.cjs`: `6579fa3be043d7b3bc97d4bd8537f96c784290faaf7a4695172a81c6422107a5`

### 명령과 기능 결과

저장소 루트에서 실행했다. 출력 로그와 JSON은 아래 `gen/e2e/` 경로에 남아 있으며 같은 명령으로 재생성할 수 있다.

```powershell
$env:E2E_BASE_URL = 'http://localhost:8138/'
node --test tools/cosmetic-test.cjs
$env:E2E_OUTPUT_DIR = 'gen/e2e/release-v101/game-modes'
node tools/e2e/game-modes.cjs
$env:E2E_OUTPUT_DIR = 'gen/e2e/release-v101/single-smoke'
node tools/e2e/single-smoke.js
Remove-Item Env:E2E_OUTPUT_DIR -ErrorAction SilentlyContinue
node tools/e2e/dice-performance.cjs --label=release-v101
```

- **모드 회귀 88/88 PASS**: 폰 440×956에서 44건, 데스크톱 1240×860에서 44건. 20종 수집 카드·5종 덱 제한·해금/강화 차감·실제 저장/새로고침, 세 모드의 불변 런 스냅샷, 순수 모드의 기존 상자 추첨, 덱의 125개 구간 입력, D1/D4/D8/D20 계열의 자연 굴림·정착·배치, 101 진입/완료 구별, 극한 102 계속 진행, 중복 정산·기록 분리를 확인했다. 양쪽 모두 uncaught JavaScript 오류 0. 결과: `gen/e2e/release-v101/game-modes/report.json`.
- **기본 플레이 폰·데스크톱 PASS**: 실제 타이틀→로비→순수 운빨 런→굴림→타워 배치→첫 웨이브 적 생성→다음 웨이브 대기→포기 결과→로비 복귀. uncaught JavaScript 오류 0. 멀티 서버는 `net=off`로 제외했다. 로그: `gen/e2e/release-v101/single-smoke.log` 및 같은 이름의 화면 출력 디렉터리.
- **결제 클라이언트·스킨 관리자 16/16 PASS**: 실제 클라이언트 소스를 VM에서 실행하고 외부 응답만 주입했다. 미완료 주문 뒤 정상 주문 복구, 다른 게임 계정 Android 영수증 뒤 유효 영수증 처리, 늦은 로그인 응답과 로그아웃 generation, 로그인 후 환불 권한 재확인, 비동기 스킨 로딩 중 런 잠금, 권한 제거·캐시 상한·미리보기 소스 보존을 확인했다. 로그: `gen/e2e/release-v101/cosmetic-contract.log`. 이 검사는 실계정 OAuth·PG 청구·실기기 Play 결제 성공 증거가 아니다.

### 독립 결제 코드 감사 수정 확인

아래 네 재현 경로를 구현 담당자가 수정한 뒤, 변경 부분을 읽고 위 16건을 독립 재실행했다.

1. 웹 복구가 `payment-not-confirmed`/`payment-pending` 주문을 남기고 다음 주문을 계속 처리하며, 마지막에 계정·권한을 갱신한다. 401 계정 경계 오류는 계속 중단한다.
2. 로그인 응답 적용 직전에 화면 상태·이전 토큰·로그인 generation을 다시 확인한다. 적용되지 않은 새 세션은 로그아웃 요청으로 폐기한다.
3. 로그인 직후 기본 스킨만 채택하고 `/cosmetics`를 재확인한다. 누락된 환불 알림 때문에 저장된 과거 유료 스킨을 바로 활성화하지 않는다.
4. 스킨 다운로드 후 `runLocked`와 굴림 상태를 다시 확인한다. 이전 권한이 제거됐더라도 이미 시작한 런에 새 스킨을 중간 적용하지 않는다.

서버 코드의 고정 상품 가격, provider 재조회, 구매 계정 귀속, 토큰/주문 중복 키, 출처별 스킨 권한, 환불 부채와 트랜잭션 처리를 함께 읽었다. 이 범위에서 추가 확정 결함은 발견하지 못했다. 신규 서버 계정은 기본 성장으로 생성하고 게스트 성장 저장값을 가져오지 않는다. 순수 모드는 강화 배율 1과 원래 상자 추첨을 유지하며 성장 추첨이 추가 난수를 소비하지 않는다. 실판매는 기본 `PAYMENT_MODE=disabled`, 프런트의 빈 서비스 URL 및 별도 live gate로 닫혀 있다.

### 주사위 성능

기능 검사 브라우저를 닫고 측정했다. **Chrome의 Canvas 메인 스레드 명령 제출 시간**이며 GPU 완료 시간이나 실제 Android 기기의 프레임률이 아니다. 데스크톱은 1240×860/DPR1/CPU1, 폰 모사는 440×956/DPR2/CPU 4배 제한이다. 매 종류 20회 준비 후 서로 다른 회전 60회, 정지 자세는 준비 후 30회를 수집했다. 중심 크기 76, 슬롯은 D1/D20 21·D6 17이고 실제 그리기 순서인 중심→슬롯을 사용했다.

회전 중 **중심+슬롯 한 쌍**의 중앙값 / 95백분위:

- D1: 데스크톱 **1.9 / 2.2ms**, 폰 모사 **6.8 / 8.2ms**.
- D20: 데스크톱 **0.4 / 0.5ms**, 폰 모사 **2.7 / 3.7ms**.
- D6: 데스크톱 **5.5 / 7.7ms**, 폰 모사 **21.1 / 26.6ms**.

정지 후 폰 모사의 한 쌍은 D1 **0.7 / 1.4ms**, D6 **0.6 / 1.1ms**였다. D6 회전 중 비용은 이 제한 조건에서 16.7ms를 넘으므로, 모든 주사위의 60fps를 보장하는 결과가 아니다.

기존 `gen/e2e/dice-performance/before/report.json`의 D1 폰 모사 값은 **24.5 / 51.3ms**, 직전 최적화 `after-final/report.json`은 **8.2 / 10.3ms**였다. 이번 **6.8 / 8.2ms**는 최적화 효과가 유지됨을 보여준다. 서로 다른 시점의 단일 호스트 측정이므로 차이를 보편적인 속도 향상률이나 새로운 최적화 효과로 환산하지 않는다. 최적화 전 게임 SHA는 `a5e43fbf82d8dd01ecc2e5c26d03833769923736dcfd272ae21f6405b57436e4`, 직전 측정 SHA는 `bdade84166225db7c90094c5cb2f7b0b5a938e573003e1bb1a79266a3a77858d`다.

양쪽 프로필 모두 기본 재질 **1세트·52개 텍스처·7,815,168바이트**가 동일 객체로 유지됐다. 포즈 캔버스는 3개로 고정됐고 구체 조회 버퍼는 772,992바이트였다. D1은 회전 한 쌍당 `putImageData` 1회와 `drawImage` 2회를 사용했다(최적화 전 `drawImage` 576회). 이는 주사위 캐시 수치이며 몬스터·맵·스킨을 포함한 전체 게임 메모리 수치가 아니다.

결과와 고정 소스 사본: `gen/e2e/dice-performance/release-v101/report.json`, `game-source.js`. 표본 원자료와 정지/회전 통계도 해당 JSON에 있다.

### 남은 리소스 진단 범위

기본 플레이 로그에 HTTP 404 console 메시지가 총 140개 있었다. 별도의 실제 타이틀 부팅에서 URL을 수집한 66개 응답은 모두 기존 선택적 `casual/tiles/` 파일이었다: plains의 road 1개와 forest/lake/darkforest/castle/hell 각 13개. 이 URL 생성과 코드 타일 대체 경로는 기준 `161f672`에도 존재한다. 해당 부팅은 title 도달·uncaught 오류 0이었으며 주사위/유료 스킨 PNG 404는 그 진단에서 없었다.

원래 smoke 도구는 모든 console 메시지의 요청 URL을 보관하지 않으므로 140개 전체가 이 66개 파일과 동일하다고 단정하지 않는다. URL별 근거는 `gen/e2e/release-v101/resource-diagnostics.json`이다. 이 기능 회귀를 모든 아트 파일의 무결성 승인으로 사용하지 않는다.

### 후속 선택 타일 로딩 최적화 — 2026-09-09

위 66개 누락 타일 요청을 후속 수정에서 제거했다. `game.js`의 SRCS 타일 생성 부분만 실제 존재하는 21개 파일 목록으로 바꿨으며, 기존의 이미지 키와 맵 그리기·대체 코드·게임 규칙은 유지했다. 새 스크립트 로드나 빌더 설정은 추가하지 않았다. 기존 `build-www.mjs`의 `casual/tiles/**` 복사 규칙을 그대로 사용한다.

- `node tools/tile-assets.cjs`: 후보 87개, 실제 로드 21개, 미요청 누락 파일 66개 확인 **PASS**. 타일 파일을 새로 추가한 뒤 `node tools/tile-assets.cjs --write`로 표시된 목록 블록만 갱신한다. 현재 그리기에서 쓰지 않는 도로 코너·교차·T자 타일은 새로 선로드하지 않는다.
- `node gen/tile-preload-check.cjs`: **2026-09-08 15:50:08–15:51:14 UTC** 실제 Chrome 전후 비교 **28/28 PASS**. 폰 440×956와 데스크톱 1240×860 각각 6개 테마의 tier 1/5 및 가로·세로 아레나 2개를 검사했다. 전체 배경 RGBA SHA-256, 경로 좌표, 석단 좌표·수, 시작/도착 그림 플래그가 모두 동일했다.
- 각 프로필의 실제 타일 HTTP 요청은 **87→21**, 타일 404는 **66→0**이었다. 프로필별 uncaught 오류도 0이었다. 대표 숲 대체 그림을 이미지로 확인했다.
- 문법 검사 및 `git diff --check` **PASS**. 원본 PNG는 변경하지 않았다.

전후 고정 소스·실제 응답 URL·픽셀 해시·대표 PNG는 `gen/e2e/tile-preload/`에 있다. 이 후속 결과는 앞 절의 66개 선택 타일 진단을 해결하며, 전체 이미지 목록이나 새 몬스터 승인으로 범위를 넓히지 않는다.

### 최종 D6 중앙·슬롯 공유 검증 — 2026-09-09

중앙 주사위는 기존 6분할 표면을 제한된 버퍼에 한 번 그리고, 정확히 같은 회전 행렬·재질이며 해상도가 충분한 슬롯은 그 버퍼를 축소해서 그린다. 재사용 조건이 맞지 않는 슬롯은 원래 3분할 경로를 유지한다. full 버퍼 2장과 독립 슬롯 버퍼 1장이라는 상한을 유지하며 모든 회전 프레임을 미리 만들지 않는다.

고정 SHA-256:

- 기준 게임 사본 `gen/d6-opt-before-game.js`: `df84c453eff0ac3ab5f691ad4817198a90cfe36142ec7c4d60549873eef48a33`
- 최종 게임 및 `d6-shared-final/game-source.js`: `f7322ccc598ac2d5c8b7a2136a41cf0eeaef9e35de457cb7824fc1ae46eb5988`
- 최종 렌더 구간: `a6d2db2e6300adb7df7424d3b4187e0aee9cb61679a2edae366e80605246f429`
- 실행 도구 `tools/e2e/dice-performance.cjs`: `a1fb8e9be5df3da8429252fdaa40bb569964471e626ac1096984a40daa99904e`
- 최종 `report.json`: `d31437dfdc113d2734d30a8f75a8fd9a4cee05fd0d3e67c3306066c4d12bffca`

```powershell
$env:E2E_BASE_URL = 'http://localhost:8138/'
node tools/e2e/dice-performance.cjs --label=d6-shared-final --kinds=d6 --baseline=gen/d6-opt-before-game.js --shared-cube --strict-cube-pixels
```

아트 인코딩·이미지 검사·다른 브라우저·네트워크 번들이 종료된 후 측정했다. 프로필과 크기는 앞 절과 같다. 같은 페이지에서 기준/후보를 번갈아 먼저 호출하고, 동일한 회전·재질·크기로 20회 준비 후 60쌍을 수집했다. 기준 함수는 별도 클로저와 캐시를 사용한다. 로컬 게임 코드에 테스트용 함수 노출과 자동 프레임 정지만 추가했으며, 이 검사는 운영 배포 확인이 아니다.

- **폰 모사 CPU4 교대 비교:** 기준 p50/p95 **22.9/28.5ms**, 공유 **19.6/25.1ms**. 평균 **23.345→20.002ms**, 감소 **3.343ms(14.3%)**. 최대값은 **31.6→28.7ms**였다.
- **데스크톱 교대 비교:** 기준 p50/p95 **5.1/7.4ms**, 공유 **5.3/7.7ms**. 평균 **5.322→5.343ms**로 개선이 없었다.
- 같은 실행의 후보 단독 표본은 폰 모사 p50/p95 **20.6/26.8ms**, 데스크톱 **4.9/6.1ms**였다. 정착 한 쌍은 각각 **0.8/1.1ms**, **0.2/0.3ms**였다. 교대 표본과 단독 표본을 혼합해 개선율을 계산하지 않았다.
- 고정 회전 한 쌍의 `drawImage` **267→198회**, `clip` **275→200회**, `save/restore` 각각 **480→357회**. 공유된 슬롯 자체는 **1 blit·mesh clip 0회**였다.
- 기본 재질 **52개·7,815,168바이트**와 동일 텍스처 객체를 유지했다. 이 D6 표본의 포즈 캔버스는 2장, 데스크톱 **758,912바이트**, DPR2 **3,035,648바이트**였다. 이는 전체 게임 메모리가 아니다.

**기하·외형·실제 호출 PASS:** `drawCubeSurface`는 기준 사본과 동일하다. 원래 6/3분할 직접 표면 렌더의 6자세×2경로×2프로필 **24건 RGBA가 정확히 같았다**. 6분할 444삼각형·3분할 156삼각형, 21눈·189경계 샘플 검사와 회전 회귀 **1,281건**도 통과했다. 반복 캐시 검사는 프로필마다 200 blit·clip 0회·버퍼 재할당 0이었다.

기본·왕실·서리·잿불 각각 정착 1~6면과 회전 4자세를 폰/데스크톱에서 검사한 **80개 슬롯**이 모두 중앙 버퍼를 재사용했다. 다른 자세·재질은 독립 경로로 돌아갔다. 실제 `drawCenterRoll→drawSlot` 호출에서도 두 프로필 모두 중앙 버퍼 1회 복사와 실제 정착 1눈/보상 1을 확인했다. 구현자는 양쪽 비교 보드를, 루트와 아트 검수자는 폰 보드의 작은 눈·코너·재질 정체성을 직접 검토했다. 공유 슬롯은 원래 3분할 픽셀과 완전히 동일한 출력이라고 주장하지 않는다.

원자료와 고정 소스는 `gen/e2e/dice-performance/d6-shared-final/`의 `report.json`, `summary.json`, `game-source.js`에 있다. `desktop-shared-slots.png`와 `phone-cpu4-shared-slots.png`는 기존 슬롯/공유 슬롯 비교이며, `*-actual-d6-rolling.png`와 `*-actual-d6-settled.png`는 실제 로컬 게임 캡처다. 측정값은 Canvas 메인 스레드 명령 제출 시간으로, GPU 완료 시간·실제 휴대폰 FPS·전체 게임 60fps 보장이 아니다.

## 후속 통합 검증

아래 검사는 승격된 극한 아트와 최종 D6 공유 렌더를 사용한다. 로컬 검증과 운영 배포·실기기 검증은 구분한다.

### 실제 극한 아트 런타임 계약 — 2026-09-09

2026-09-08 **16:37 UTC**에 `E2E_BASE_URL=http://localhost:8138/`에서 `node tools/e2e/extreme-appearance.cjs --actual`을 완료했다. Windows Chrome의 440×956·DPR2 페이지이며 실기기 측정이 아니다. 게임의 테스트용 함수만 노출하고, 실제 승격 manifest와 WebP를 사용했다. 빈 manifest는 전투 수치 대조에만, HTTP 실패는 오프라인 경계 검사에만 사용했다.

- 게임 SHA-256: `f7322ccc598ac2d5c8b7a2136a41cf0eeaef9e35de457cb7824fc1ae46eb5988`.
- 극한 manifest SHA-256: `3de163618ba29a65bb19a5b0c03d49a0544969e38f0150cb52c1fe3e4f783157`.
- 검사 도구 SHA-256: `a88db3effd0054e92d5419673ae45f9939db6ee58ba426a680c761e2d102bfb9`.
- **221개 고유 ID·251개 스폰 행 PASS**: 기존 110종과 신규 111종이 요청한 로스터 ID로 식별됐다. 1–202·203·10,000·1,000,000웨이브의 HP·논리 크기·속도·방어·골드가 빈 manifest 대조군과 같았다.
- **18개 대표 개체×3뷰 PASS**: 고정 표시 높이와 방향 전환 전후 걸음 위상, W1 21px/세로 뷰 1.6배, 111 부관 `b111-2`, 202/203 로스터 경계, 최대 3단계 진화를 확인했다. 이전 웨이브·새 웨이브·사망 그림이 함께 남아도 ID를 유지했다.
- 부팅은 고정 **663개 64px fallback**과 진화 표시 9개만 준비했다. 해당 tracked resident는 **11,010,048 B**이고, 이때 방향별 일반 해상도 자산 HTTP 선로드는 0이었다. active/next와 살아 있는 개체를 사용하는 시나리오에서 cache peak는 **32,243,712 B(30.75 MiB)**, 동시 로드는 최대 2개였다. 이는 해당 시나리오의 아트 캐시이며 전체 게임 메모리 최대치를 뜻하지 않는다.
- 관전 **6개 개체**의 구/신 로스터·정예·부관·진화와 걸음 위상, 타워 7/20성을 확인했다. HTTP 실패를 주입하면 W102의 측면·정면·후면이 모두 같은 캐릭터의 내장 fallback을 유지했다. uncaught JavaScript 오류 0.

결과 `gen/e2e/extreme-appearance/actual/report.json`, 실행 로그 `gen/extreme-appearance-actual-release.log`, 대표 실제 캔버스 `evolution-concurrent.png`. 이 검사는 ID·표시 기하·캐시·관전·실패 경계에 대한 검증이다. 전체 333뷰의 모든 자세·미술 검수는 별도 갤러리 검증 결과를 따른다.

### 최종 Android 패키징과 백업 경계 — 2026-09-09

2026-09-08 **16:38–16:42 UTC**에 아래 순서로 실행했다. 삭제되는 빌더 출력의 절대 경로가 저장소 내부 `C:\Users\PC\Documents\Codex\2026-09-07\gnchoo-dicekeep-art-pr-29-6\work\dicekeep-art\www`이며 재분석 지점이 아닌 것을 먼저 확인했다. 승인 이미지의 바이트를 보존하기 위해 재압축·양자화 옵션은 사용하지 않았다.

```powershell
npm run build:www
npx cap sync android
$env:ANDROID_HOME = 'C:/Users/PC/AppData/Local/Android/Sdk'
Push-Location android
./gradlew.bat :app:assembleDebug :app:testDebugUnitTest --console=plain --no-daemon
Pop-Location
python gen/android-final-package-check.py
```

- **build:www·Capacitor sync·Gradle PASS**. JDK 21.0.5, SDK/target 36, AGP 8.9.2, Gradle 8.11.1. Gradle은 38초·139 tasks(35 executed)로 완료했다. 구매 상태 `PurchaseGateTest` **5/5 PASS**; 별도의 기존 산술 예제 테스트 1개도 통과했다.
- 웹 payload **2,241파일·349,769,506 B(333.57 MiB)**. `manifest.json`까지 포함한 **2,242개** 파일의 SHA-256이 `www`→네이티브 public→APK 내부에서 모두 같았다.
- 극한 **666 WebP**, 유료 타워 **60 PNG**, 유료 재질 **3 PNG** 모두 원본과 WWW·네이티브·APK 해시가 같았다. 런타임 JS 14개도 WWW와 APK가 같았다. 생성된 `app.js`는 Capacitor UMD·원본 app.js를 합친 출력이고, `index.html`은 native script 주입으로 원본과 다르다. 나머지 복사 소스는 원본 해시도 대조했다.
- 실제 APK의 target 36, 패키지 `com.fallman.dicekeep`, BILLING 권한과 `DicekeepBilling` JS 등록을 확인했다. merged manifest에 두 백업 XML 연결이 있고, SDK 36 `aapt2 dump xmltree`로 **legacy·cloud-backup·device-transfer 모두 `root/app_webview` 제외**가 컴파일된 것을 확인했다. 기존 allowBackup 및 unrelated app 설정은 유지했다. [Android 공식 규칙](https://developer.android.com/identity/data/autobackup)에 따라 WebView bearer·게스트 진행이 기기 백업으로 복원되지 않도록 한 구성이다. 실제 기기 백업/복원은 수행하지 않았다.
- APK: `android/app/build/outputs/apk/debug/app-debug.apk`, **362,762,574 B(345.96 MiB)**, SHA-256 **`2d03887bdbd06c04c0a4d52f4722ccccb123004dc852099dbc6ff5aa7ada67a0`**. 로컬 debug 산출물이며 Play AAB 전달 크기나 실기기 설치 용량을 측정한 결과가 아니다.

증거: `gen/android-final-package/report.json`의 파일별 SHA·그룹별 개수·JUnit 결과, `sources.json`의 원본/검사 도구 SHA·시각, `*-aapt.txt`의 실제 APK 리소스. 빌드 로그는 `gen/android-final-build-www.log`, `gen/android-final-cap-sync.log`, `gen/android-final-gradle.log`. APK 패키징은 실제 Android 16 UI·OAuth·Play 결제·서버 지급·기기 이전 검증을 대신하지 않으며, 업로드나 라이브 청구는 수행하지 않았다.

### net 설치·배포 번들 사전 검증

기존 Workers Builds는 `net/package-lock.json` 부재로 `npm ci`에서 EUSAGE가 발생해 배포 전 중단됐다. 잠금 파일을 추가한 뒤 Node 22.17.0 / npm 11.4.2에서 `npm ci --no-fund --no-audit` **PASS(91 packages)**, `npx wrangler deploy --dry-run --outdir=../gen/release-net` **PASS**. 잠긴 Wrangler 4.129.1은 Node 22 이상을 요구한다.

번들 63,862 B, SHA-256 `ddc9ebb0ef2eaf0801afdc09ecba0f7894ce2898597b1c4f699b197fb01fc218`. `Room`·`Lobby`·default export와 protocol 4가 유지된다. `gen/release-net/provenance.json`은 입력 소스 SHA와 작업 트리 기준임을 기록한다. 이는 배포나 운영 health 검증이 아니다. 운영 protocol 4 확인 후 새 웹·Android를 공개하는 순서와 구 v3 클라이언트 업데이트 필요성은 `net/README.md`에 기록했다.

### 신규 아트 전종·공개 검수 화면

최종 승격은 **111개 외형·333방향·2,328프레임**이다. 지상·기어가기 83개는 방향별 8프레임, 비행·부유 28개는 4프레임이다. 원본 리그의 관절·접지·위상 검사와 14개 전종 보드의 직접 시각 검토를 완료했다. 실제 생성 프롬프트·입력·소스 해시·보정 내역과 검증 결과는 `tools/art-review/extreme-202/`에 보존했다. 루트도 최종 보드 1·6·11·14, 게임 동시 출현 캡처, 아래 갤러리의 앞/뒤 대표 화면을 직접 확인했다.

배포 이미지 **666개 모두 무손실 WebP**, 총 **77,527,070 B(73.94 MiB)**다. 같은 PNG의 135,713,831 B보다 **58,186,761 B(55.49 MiB)** 작다. 알파 및 보이는 RGB 차이는 0이며 완전 투명 픽셀의 숨은 RGB 정리는 허용한다. 이 압축 절감은 다운로드·저장 용량에 관한 것으로 RGBA 디코드 메모리 절감과는 다르다.

`node tools/e2e/extreme-review.cjs`는 로컬 검수 페이지 `/tools/art-review/extreme-202/`에서 **111캐릭터×3뷰=333개 실제 애니메이션**과 타워 60개를 검사해 PASS했다. 각 주기 8개 위치, 총 **2,664위상 샘플**의 Canvas 픽셀 해시를 기록했다. 4프레임 비행의 반복 샘플을 서로 다른 원화 프레임으로 세지 않는다. 모든 뷰에서 움직임이 있었으며 HTTP 400 이상·uncaught JS 오류는 0이었다. 결과는 `gen/e2e/extreme-review/report.json`, 대표 9개 화면은 같은 폴더에 있다.

### 유료 스킨의 실제 렌더·권한 경계

최종 생산 PNG를 사용하는 `tools/e2e/cosmetics.cjs`의 폰 **90/90**, 데스크톱 **90/90** 검사를 통과했다. 각 프로필에서 재질 3개·타워 60개 HTTP/SHA를 확인하고, 실제 게임의 타워 60개 drawImage 및 주사위 6형태×3테마의 굴림·정착을 검사했다. 타워 레벨을 바꿔도 스킨 전후 피해·사거리·발사 간격·특수 효과는 같았다. 소유·장착·환불 응답만 테스트 값으로 주입했으며 실계정 로그인이나 결제는 하지 않았다.

동시 디코드 2개, 보관 2팩, 재질 2세트·텍스처 104개 상한을 확인했다. 준비되지 않은 자산의 HTTP 503 경계도 **7/7 PASS**였다. 근거는 `gen/e2e/cosmetics/{report,summary}.json`과 `gen/e2e/cosmetics-unready/report.json`이다. 이 180건 검사는 게임 SHA `806997b5…f34a3`에서 수행했으며 이후 변경된 D6 공유 경로는 위 최종 D6 검증으로 별도 확인했다. 스킨 생산 PNG와 권한 코드는 이후 동일하다.

### 결제 활성화 범위

commerce 백엔드 **33건**, 실제 로컬 workerd/SQLite 흐름 **8건**, 결제·스킨 클라이언트 **16건**을 검증했다. 상품 금액·구매 계정·중복 지급·환불·pending 복구·서버 검증 실패 경계를 포함한다. provider 응답을 제어한 검사로 실제 PG 승인·Google Play 구매 성공률을 주장하지 않는다.

웹·Android 상점과 서버 검증 코드는 포함했지만 **실판매는 비활성화**다. 프런트 서비스 URL은 비어 있고 서버 기본값은 `PAYMENT_MODE=disabled`다. 가맹점·OAuth·Play 상품·사업자/약관/환불/계정 삭제 경로 설정과 실제 테스트 구매·환불 확인이 남아 있다. 운영 배포 결과는 PR의 최종 배포 기록에서 별도로 확인한다.
