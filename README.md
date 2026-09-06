# 주사위 성채 (Dicekeep)

주사위를 굴려 나온 눈이 높을수록 강력한 타워를 세우는 캐주얼 타워 디펜스 + 아트팩.

**전체 명세:** [GAME-SPEC.md](GAME-SPEC.md) · **타일셋 브리프(Grok):** [GROK-BRIEF.md](GROK-BRIEF.md) · **생성 프롬프트:** [ART-PROMPTS.md](ART-PROMPTS.md) · **파일 목록:** [ASSET-MANIFEST.md](ASSET-MANIFEST.md)

## 실행

```bash
python serve.py
# http://localhost:8137             게임
# http://localhost:8137/editor.html 맵 그리드 에디터
```

Windows는 `start.bat`. `index.html`을 file://로 열지 말 것.

테스트용: `http://localhost:8137/?unlock=all` 로 열면 50 스테이지 클리어·타워 전부 해금 상태. `&start=inf` 를 붙이면 타이틀에서 바로 인피니티 시작(`?start=clear` 는 도전 모드). 인피니티는 해금 조건이 없어 `?inf=1` 은 이제 필요 없다(하위호환으로 남아 있음).

### 멀티(함께하기) 로컬 서버

```bash
cd net && npx wrangler dev --port 8787          # Room Durable Object 를 로컬에서 시뮬레이션 (Node 필요)
cd net && TIMING=fast node test/dev-server.mjs   # wrangler 없이 같은 규칙을 돌리는 테스트 더블
cd net && npm test                                # 규칙 단위 테스트 (의존성 없음)
```

`localhost` 로 열면 클라이언트가 `ws://localhost:8787` 에 자동으로 붙는다. 다른 주소는 `?net=ws://…`(저장됨, `?net=clear` 로 삭제), `?net=off` 로 끈다. `TIMING=fast`(또는 `--var TIMING:fast`)면 준비 2초·막간 0.5초·12웨이브 클리어의 짧은 판. 다중 브라우저 시나리오는 `net/test/ws-smoke.mjs`(소켓)와 스크래치 Playwright 스크립트로 돌린다.

### 외부 공개 (Cloudflare Workers)

저장소를 Cloudflare Workers에 연결하면 정적 에셋으로 그대로 배포된다 (`wrangler.jsonc`, 제외 목록 `.assetsignore`, 캐시 규칙 `_headers`).

1. Cloudflare 대시보드 → 컴퓨트 → Workers & Pages → 만들기 → **저장소 가져오기** → `GNchoo/dicekeep-art`
2. 빌드 명령 비움, 배포 명령 `npx wrangler deploy` (기본값) → 배포
3. `https://dicekeep.<계정>.workers.dev` 로 접속. main에 push하면 자동 재배포, 다른 브랜치는 미리보기 주소가 생긴다.

**멀티 서버(`dicekeep-net`)** 는 같은 저장소의 `net/` 을 **두 번째 Worker** 로 한 번 더 연결한다 (Durable Object 가 있는 Worker 는 미리보기 주소가 생기지 않으므로 정적 Worker 와 분리한다):

4. Workers & Pages → 만들기 → **저장소 가져오기** → 같은 저장소 `GNchoo/dicekeep-art` 를 다시 선택
5. 이름 `dicekeep-net`, **루트 디렉터리 `net`**, 빌드 명령 비움, 배포 명령 `npx wrangler deploy`
6. 만든 뒤 설정 → 빌드 → **비프로덕션(브랜치) 빌드 끄기** (프로덕션 브랜치 `main` 만)
7. `https://dicekeep-net.<계정>.workers.dev/health` 가 `{"ok":true,"protocol":2}` 면 완료. 게임은 자기 주소(`dicekeep.<계정>.workers.dev`, 브랜치 미리보기 포함)에서 서버 주소를 자동으로 만든다 — 계정별 설정 없음. 커스텀 도메인을 쓰면 `net/wrangler.jsonc` 의 `vars.ALLOWED_ORIGINS` 에 넣는다
8. 무료 플랜 예산: 판이 도는 동안 방(Durable Object)이 깨어 있어 4인 40분 한 판 ≈ 300 GB-s → **하루 약 40판**. 넘으면 그날 멀티만 멈춘다(싱글 무관). 더 필요하면 Workers Paid($5/월, 판당 약 $0.004). 프로토콜을 바꾸는 배포는 `dicekeep-net` 을 먼저 올린다(미리보기 클라이언트도 운영 서버에 붙는다)

이미지는 하루 캐시된다. 같은 파일명으로 그림을 바꾸면 최대 하루 뒤 반영되므로, 바로 보려면 브라우저 강력 새로고침(Ctrl+Shift+R).

## 플레이

- 주사위 **플릭 던지기** 또는 버튼/R 로 굴리기 (40G)
- 눈 1~6 = 타워 종류 (6이 최강). 끌어다 석단에 놓으면 설치
- 같은 눈 합체 최대 Lv3
- 50 스테이지 / 5 티어 / 목숨 20. 마지막 웨이브에 보스
- 티어가 오르면 **하늘길·땅굴·두 번째 흙길**이 열리고 석단이 늘어난다
- 맵은 **코드가 16×9 격자에 설계**하고 테마(평원·숲·호수·어두운 숲·성·지옥) 타일을 입힌다. 타일이 없으면 코드 그림으로 동작
- **인피니티 · 함께**(멀티): 로비에서 이름을 넣고 **방 만들기** → 6자리 코드를 친구에게 → **코드로 참가** → 2명 이상 모이면 방장이 시작, 또는 **빠른 매칭**(2명 이상 모이면 10초 뒤, 4명이면 바로). 2~4명이 **각자 보드에서 각자 속도로**(배속 x1~x3, 막간·웨이브 버튼은 싱글과 같음) 101웨이브 완주에 도전한다. 첫 웨이브 전 20초 준비. 먼저 죽으면 관전(기록·젬은 그 즉시 저장), 판이 끝나면 순위표 — **완주는 빠른 순, 탈락은 웨이브 순**. 가로는 오른쪽에, 세로는 아래에 상대 보드 요약 카드가 뜨고, **카드를 누르면 그 플레이어의 필드를 라이브로 본다**(내 게임은 뒤에서 계속). `Enter`/💬 로 채팅(대기실에서도). ★7 이상 획득·확률강화 결과는 방 전체에 알림. 재대전·초대 링크는 다음 단계
- **인피니티 모드**(무한 투기장)는 스테이지 진행과 무관하게 **처음부터 바로** 할 수 있다. 랜덤다이스식 보드(석단 15) + 둘레 트랙 하나(모든 적이 같은 길), **6눈·석단 전부 해금된 풀파워**. 아레나 캔버스는 **화면 비율로 만들어져 레터박스 없이 화면을 다 쓴다** — 세로면 보드가 3열×5행으로 서고 HUD 두 줄이 아래에, 가로면 5열×3행에 HUD 한 줄이 아레나 아래쪽에 반투명으로 겹친다. 런 도중 돌리거나 리사이즈해도 상태가 유지된다. 골드로 **뽑기**(160G)를 하면 다면체 주사위가 굴러 그 숫자만큼의 성(★) 타워(7~20성 히든)가 서고, 골드로 눈(1~6)을 **파워업**한다. 두 갈래 — **도전**(101웨이브 완주 = 클리어)과 **무한**(끝없는 기록 도전). 첫 런에는 조작을 단계별로 안내한다

| 티어 | 스테이지 | 레인 | 추가 석단 |
|---|---|---|---|
| 1 초원 | 1~10 | 흙길 | +0 |
| 2 언덕 | 11~20 | 흙길 + 하늘길 | +2 |
| 3 협곡 | 21~30 | 흙길 + 하늘길 + 땅굴 | +4 |
| 4 요새 | 31~40 | 흙길 + 흙길2 + 하늘길 | +6 |
| 5 악몽 | 41~50 | 흙길 + 흙길2 + 하늘길 + 땅굴 | +8 |

| 눈 | 타워 |
|---|---|
| 1 | 감시탑 레이저 |
| 2 | 쌍포 요새 (광역) |
| 3 | 마법 오벨리스크 |
| 4 | 서리 첨탑 (둔화) |
| 5 | 테슬라 (연쇄) |
| 6 | 왕관 요새 (폭발 주사위) |

## 앱 빌드 (Android) / iOS 메모

웹은 그대로 두고, Capacitor 가 `www/` 를 네이티브 껍데기(`android/`, `ios/`)에 넣는다. 앱 ID `com.fallman.dicekeep`, 이름 **주사위 성채**. 스토어 자료·출시 절차·개인정보처리방침은 `STORE.md`·`privacy.html`.

준비(Windows): Node LTS + Android Studio(SDK 35). 그 다음:

```bash
npm i                                  # Capacitor · sharp · 글꼴
npm run fonts                          # fonts/ 갱신 (Google Fonts 대신 로컬 글꼴, 웹도 같이 씀)
npm run build:www -- --optimize        # www/ 생성 (~118 MB; 급하면 --quantize)
npx cap sync android                   # www → android/app/src/main/assets/public
npx cap open android                   # Android Studio → USB 실기기 Run
```

- `app.js` 는 앱 안에서만 동작하는 다리(뒤로가기·스플래시·백그라운드 음악·멀티 서버 주소). 빌드 때 Capacitor UMD 와 합쳐 `www/app.js` 가 되며 index.html 의 `<!-- APP -->` 자리에 끼워진다. 웹 배포에는 안 올라간다(`.assetsignore`).
- 앱 안에서는 hostname 이 localhost 라서 net.js 가 `window.DK_NET_URL`(운영 서버)을 먼저 쓴다. `?net=`·저장값은 여전히 우선.
- 아이콘·스플래시 원본은 `resources/` (지금은 자리표시). 같은 이름으로 바꾼 뒤 `npx @capacitor/assets generate --android --ios --assetPath resources --iconBackgroundColor '#1a140d' --iconBackgroundColorDark '#1a140d' --splashBackgroundColor '#0d0b09' --splashBackgroundColorDark '#0d0b09'`.
- 출시 서명: `android/keystore.properties.example` → `keystore.properties`(커밋 금지). 없으면 debug 빌드만 서명된다. 키 파일은 잃어버리면 업데이트를 못 올리니 백업.
- 버전: `android/app/build.gradle` 의 versionName 을 index.html `?v=` 와 같이 올리고 versionCode 는 업로드마다 +1. 멀티 서버가 `?v=` 로 방 버전을 맞추므로 웹 배포와 앱 업데이트를 같이 한다.
- 브라우저에서 www 확인: `npm run serve:www` (http://localhost:8140).
- 실기기 체크리스트: 채팅 키보드가 올라올 때 레이아웃, 뒤로가기 체인(설정→도움말→채팅→필드 보기→나가기→로비 두 번 = 종료), 몰입 모드, 펀치홀/노치 아래 칩(`--safe-area-inset-*`), 회전, 멀티 `wss` 접속, 첫 터치 뒤 소리·BGM.

iOS: `ios/` 도 커밋되어 있고 SPM 이라 CocoaPods 이 필요 없다. Mac 이 없으면 Codemagic/Appflow 같은 클라우드 빌드로 `npx cap sync ios` + Xcode Archive → TestFlight. Apple Developer($99/년)·번들 ID 등록이 먼저. 웹뷰 원점 `capacitor://localhost` 는 멀티 서버가 이미 허용한다.

### 기기 레이아웃 검증

`scratchpad/devices-test.js`(저장소 밖, 세션 스크래치)가 iPhone SE~17 Pro Max · Galaxy S/A · Z Fold 펼침/접힘 · Z Flip · 태블릿 16기기 × 2방향 × 11화면을 Playwright 로 열어 스크린샷과 자동 검사(가로 스크롤·HUD 줄 수·안전영역·가림·줄바꿈·레터박스)를 남긴다. 실기기 뷰포트가 다르면 `window.innerWidth/innerHeight` 를 표에 반영한다. 안전영역은 `--sa-t/r/b/l` CSS 변수로 흉내낸다(GAME-SPEC §3).

## 아트 (2026-09-02)

| 항목 | 수량 | 경로 |
|---|---|---|
| 맵 조각 | 6테마 × 12 (평원 납품 중) + 아레나 9 (`GROK-BRIEF.md`) | `casual/tiles/<theme>/`, `casual/tiles/arena/` |
| 몬스터 | 500 + 걷기 36 | `casual/enemies/` |
| 보스 | 100 + 걷기 10 | `casual/bosses/` |
| 타워 | 6 인게임 + 스킨 24 (+ 공격시트 6, 미사용) | `casual/towers/` |
| VFX | 레이저·포격·룬·서리·번개·주사위폭탄 (+ 획득 연출 7장 예정, §7.8) | `vfx/` |
| UI·아이콘·스플래시 | 앱 아이콘·스플래시·HUD 프레임·버튼·아이콘 23·로고 (ART-PROMPTS §7, 납품 전엔 CSS) | `resources/`, `ui/` |
| BGM | 로비·전투·보스 3곡 (코드 합성이 기본, 파일은 `MUSIC-PROMPTS.md`) | `audio/` |

스타일: Kingdom Rush + Random Dice, 2D 아이소메트릭. 추가 배치 프롬프트는 `ART-PROMPTS.md`.

## 라이선스

개인 게임 개발에 자유롭게 사용.
