# 스토어 등록 자료 — 주사위 성채 (Dicekeep)

앱 패키징은 Capacitor 로 한다: 웹(루트)을 그대로 두고 `tools/build-www.mjs` 가 `www/` 를 만들어 `android/`·`ios/` 네이티브 껍데기에 넣는다. 빌드 절차는 맨 아래 체크리스트.

## 기본 정보

| 항목 | 값 |
|---|---|
| 앱 이름 | 주사위 성채 / Dicekeep |
| 패키지(앱 ID · 번들 ID) | `com.fallman.dicekeep` |
| 카테고리 | 게임 > 전략 (Games > Strategy) |
| 웹사이트 | https://dicekeep.cgn3731.workers.dev |
| 개인정보처리방침 URL | https://dicekeep.cgn3731.workers.dev/privacy.html |
| 지원·문의 이메일 | cgn3731@gmail.com |
| 멀티 서버 | `wss://dicekeep-net.cgn3731.workers.dev` (Cloudflare Workers, net/) |
| 가격 · 인앱 · 광고 | 무료 · 없음 · 없음 |
| 대상 연령 | 전체이용가 (만화적 폭력) |

## 짧은 설명 (≤ 80자)

- ko: `주사위를 뽑아 타워를 세우는 캐주얼 타워 디펜스. 50 스테이지, 무한 도전, 친구와 함께!` (48자)
- en: `Roll dice, raise towers. A cozy tower defense with 50 stages, endless mode and co-op.` (78자)

## 자세한 설명

### ko

```
주사위 성채는 주사위를 뽑아 타워를 세우는 캐주얼 타워 디펜스입니다.

🎲 주사위 뽑기
골드로 주사위를 굴려 타워를 뽑습니다. 같은 타워를 합쳐 등급을 올리고, 운이 따르면 ★ 타워가 나타납니다.

🏰 50 스테이지
숲·사막·설원·용암… 6개 지역 50개 스테이지. 지역마다 다른 적과 보스가 성채를 노립니다.

♾️ 인피니티
'도전'은 정해진 웨이브까지 버티기, '무한'은 끝없이 몰려오는 적을 상대로 기록 경쟁. 최고 기록은 기기에 남습니다.

👥 함께하기 (2~4인)
방 코드를 나누거나 빠른 매칭으로 친구와 같은 맵을 각자 속도로 플레이합니다. 다른 사람의 필드를 보고, 채팅으로 응원하세요.

📴 오프라인 싱글
싱글 플레이는 인터넷 없이도 됩니다. 계정·광고·분석 도구 없음.

- 세로·가로 모두 지원
- 진행은 기기에 저장 (localStorage)
- 멀티는 인터넷 연결 필요
```

### en

```
Dicekeep is a cozy tower defense where every tower starts as a dice roll.

🎲 Roll for towers
Spend gold to roll dice and draw towers. Merge matching towers to rank them up — and with a bit of luck, a ★ tower appears.

🏰 50 stages
Forest, desert, snowfield, lava… 6 regions, 50 stages, each with its own enemies and bosses marching on your keep.

♾️ Infinity
"Challenge" asks you to survive a fixed number of waves; "Endless" throws waves forever and keeps your best record on the device.

👥 Play together (2–4 players)
Share a room code or use quick match to play the same map with friends, each at your own pace. Peek at other players' fields and cheer in chat.

📴 Offline single-player
Single-player works without internet. No accounts, no ads, no analytics.

- Portrait and landscape
- Progress saved on device
- Multiplayer needs an internet connection
```

## 키워드

ko: `타워디펜스, 주사위, 디펜스, 캐주얼, 전략, 무한모드, 협동, 멀티플레이, 오프라인`
en: `tower defense, dice, casual, strategy, endless, co-op, multiplayer, offline, td`

## 콘텐츠 등급 설문 (Play Console IARC · App Store 연령 등급)

| 질문 | 답 |
|---|---|
| 폭력 | 만화적·비현실적 폭력 (귀여운 동물 적이 사라짐, 피·고어 없음) |
| 공포 | 없음 |
| 성적 내용 · 노출 | 없음 |
| 욕설 | 없음 (채팅은 사용자 입력이며 필터 없음 → "사용자 생성 콘텐츠" 항목 참고) |
| 약물 · 술 · 담배 | 없음 |
| 도박 · 사행성 | **없음** — 주사위는 게임 안 골드로만 굴리고 실제 돈·구매·현금화가 없다. "시뮬레이션 도박" 항목도 아니오 |
| 사용자 간 상호작용 | **있음** — 방 안 텍스트 채팅 (2~4인, 방이 끝나면 사라짐, 저장 안 함) |
| 개인정보·위치 공유 | 없음 (닉네임만, 실명·위치 아님) |
| 디지털 구매 | 없음 |
| 광고 | 없음 |
| 무제한 인터넷 | 아니오 (앱 안에 브라우저 없음) |

App Store 연령 등급: 만화 또는 판타지 폭력 "가끔/경미" → 4+ 또는 9+ (Apple 판정), 도박 없음, 무제한 웹 액세스 없음.

## 데이터 보안 양식 (Play Console "데이터 보안")

| 질문 | 답 |
|---|---|
| 사용자 데이터를 수집하거나 공유하나요? | 예 (멀티플레이 시에만 전송, 저장은 안 함) — 보수적으로 아래처럼 신고 |
| 수집 항목 | 앱 활동 > "기타 사용자 생성 콘텐츠": 닉네임·채팅 메시지 (선택 사항, 멀티 참가 시만). 앱 정보/성능·개인 정보·위치·기기 ID: 수집 안 함 |
| 처리 방식 | 전송 중 암호화 (wss/https). 서버에 보관하지 않음 (메모리, 방 종료 시 삭제) → "일시적 처리(ephemeral)" 로 표시 |
| 공유 | 제3자와 공유 안 함 (Cloudflare 는 서비스 제공자 = 공유 아님) |
| 삭제 요청 | 서버에 남는 데이터 없음. 기기 데이터는 앱 삭제/브라우저 데이터 삭제로 지움 |
| 가족 정책 | 아동 대상 아님 ("전체 이용가" 이지만 어린이 전용 설계 아님) |

App Store "앱 개인정보 보호": 수집 항목 "없음(Data Not Collected)" 으로 신고해도 되는 수준이나, 채팅이 있으므로 "사용자 콘텐츠 > 기타 사용자 콘텐츠 — 사용자와 연결 안 됨, 추적 아님" 을 적는 편이 안전.

## 스크린샷 · 그래픽 목록

세로 1080×1920 (휴대전화, 4장)
1. 로비 — 스테이지 선택 지도, 지역 표시
2. 인피니티 — 무한 모드 후반 웨이브, 타워 빼곡
3. ★ 획득 연출 — 주사위 뽑기에서 ★ 타워 터지는 순간
4. 결과 — 클리어/기록 화면 (골드·처치·웨이브)

가로 1920×1080 (태블릿 · 크롬북, 2장)
5. 함께하기 — 4인 방, 다른 사람 필드 보기 + 채팅
6. 보스 웨이브 — 용암 지역 보스 등장

기타
- 피처 그래픽 1024×500 (Play): 로고 + 주사위 + 타워 3개, 글자 최소
- 아이콘 512×512 (Play 스토어 등록용; `resources/icon-only.png` 를 512 로 줄여 씀)
- iOS: 6.7" 1290×2796 세로 3장 이상, 12.9" iPad 2048×2732 2장 (위 장면 재활용)

캡처 방법: 실기기 또는 Android Studio 에뮬레이터(1080×1920 Pixel) 에서 캡처. 웹은 `?v=` 캐시버스트 때문에 항상 최신 빌드로.

## 버전 규칙

- `android/app/build.gradle` `versionName` = 스토어 표시 버전 = **index.html 의 `?v=NN` 캐시버스트와 동기** (예: `?v=80` ↔ versionName `1.0.0`, 다음 웹 배포 `?v=81` 이 앱에도 들어가면 `1.0.1`).
- `versionCode` 는 업로드마다 +1 (Play 는 같은 코드 재업로드 거부).
- iOS: `MARKETING_VERSION` = versionName, `CURRENT_PROJECT_VERSION` = versionCode.
- 멀티 서버는 `net.js` 의 `?v=` 값으로 방 안 버전 일치를 검사하므로, 웹 사이트를 새 `?v=` 로 배포하면 **구버전 앱은 새 웹 사용자와 같은 방에 못 들어간다** → 웹 배포와 앱 업데이트를 같이 하거나, 서버 버전 검사를 완화할 것.

## 출시 절차 체크리스트

### Android (Windows)

1. 준비: Node LTS(22), Android Studio(최신, SDK 35 + Build-Tools 포함), JDK 는 Android Studio 내장(17+).
2. `npm i` — Capacitor·sharp·글꼴 설치
3. `npm run fonts` — `fonts/` 갱신 (Google Fonts 대신 로컬 글꼴)
4. `npm run build:www -- --optimize` — `www/` 생성 (약 118 MB; 용량이 급하면 `--quantize`)
5. `npx cap sync android` — www → `android/app/src/main/assets/public`, 플러그인 반영
6. `npx cap open android` — Android Studio 열기 (첫 실행은 Gradle 동기화 수 분)
7. USB 디버깅 켠 실기기 연결 → Run ▶ → 아래 "실기기 체크리스트" 확인
8. 서명키 만들기 (한 번만, **분실하면 같은 앱으로 업데이트를 영원히 못 올린다** — 두 군데 이상 백업):
   ```
   keytool -genkeypair -v -keystore dicekeep-release.jks -alias dicekeep -keyalg RSA -keysize 2048 -validity 10000
   ```
   (JDK 의 keytool: Android Studio 설치 폴더 `jbr\bin\keytool.exe`)
9. `android/keystore.properties.example` → `android/keystore.properties` 로 복사해 채우기 (커밋 금지, `.gitignore` 에 있음)
10. Android Studio: Build > Generate Signed App Bundle / APK > **Android App Bundle** > release → `app-release.aab`
    (또는 `cd android && gradlew bundleRelease` → `android/app/build/outputs/bundle/release/`)
11. Play Console: 앱 만들기 → 스토어 등록정보(위 설명·스크린샷·아이콘·피처 그래픽) → 앱 콘텐츠(개인정보처리방침 URL, 광고 없음, 콘텐츠 등급 설문, 타겟층, 데이터 보안, 뉴스 앱 아님) → **Play 앱 서명** 동의
12. 테스트 > 내부 테스트 → AAB 업로드 → 테스터(이메일) 등록 → 링크로 설치 확인
13. **2023-11 이후 만든 개인 개발자 계정**: 프로덕션 전에 **비공개 테스트에서 테스터 12명 이상이 14일 연속 참여** 해야 하고 이후 프로덕션 액세스를 신청한다 (요건은 Play Console 화면이 최신 — 20명/14일 등으로 바뀔 수 있으니 콘솔 안내를 따른다). 친구·가족·커뮤니티 테스터를 미리 모을 것
14. 프로덕션 출시 → 검토(며칠) → 게시. 이후 업데이트는 versionCode+1, versionName 동기, 4~5·10 반복

### iOS 메모 (Mac 없이는 빌드 불가)

1. Apple Developer Program 가입 (연 $99) → App Store Connect 에서 번들 ID `com.fallman.dicekeep` 등록, 앱 생성
2. Mac 이 있으면: `npx cap sync ios` → `npx cap open ios` → Xcode 에서 Signing & Capabilities 팀 선택 → Product > Archive → Distribute > TestFlight
   Mac 이 없으면: Codemagic 또는 Ionic Appflow 같은 클라우드 빌드에 저장소 연결 (`ios/` 커밋되어 있음, SPM 이라 CocoaPods 불필요) → 인증서·프로비저닝 프로파일은 서비스가 관리
3. TestFlight 내부 테스트 → 심사 제출 (스크린샷 6.7"·12.9", 개인정보 URL, 연령 등급, 수출 규정 `ITSAppUsesNonExemptEncryption=false` 는 Info.plist 에 이미 있음)
4. iOS 웹뷰 원점은 `capacitor://localhost` — 멀티 서버(net/src/http.js)가 이미 허용

## 실기기 체크리스트

- [ ] 첫 실행: 스플래시 → 로비까지 검은 화면·깜빡임 없음 (`DKAPP_NATIVE.ready()` 가 스플래시를 내림, 못 부르면 8초 뒤 자동)
- [ ] 몰입 모드: 상태바·내비게이션바 숨김, 가장자리 스와이프하면 잠깐 나타났다 다시 숨음
- [ ] 펀치홀·노치: 상단 칩(골드·목숨·웨이브)이 카메라 구멍·노치 아래에 있음 (safe-area inset). 가로에서도 좌우 노치 확인
- [ ] 회전: 세로↔가로 전환 시 캔버스가 다시 맞춰지고 진행이 끊기지 않음 (resume 시 `resize` 이벤트)
- [ ] 뒤로가기: 게임 중 → 일시정지/메뉴 닫힘, 스테이지 선택 → 로비, 로비에서 한 번 → "한 번 더 누르면 종료합니다", 2초 안에 두 번 → 종료
- [ ] 채팅: 소프트 키보드가 올라올 때 입력창이 가려지지 않고 레이아웃이 튀지 않음, 키보드 내리면 원상복구
- [ ] 멀티: 함께하기 → 방 만들기·빠른 매칭이 `wss://dicekeep-net…` 에 붙음 (모바일 데이터·Wi-Fi 둘 다), 로비 화면에 버전 불일치 경고 없음
- [ ] 소리: 첫 터치 뒤 효과음·배경음 재생 (자동재생 정책), 홈으로 나가면 멈추고 돌아오면 재개
- [ ] 저장: 앱 강제 종료 후 재실행해도 진행·설정 유지 (localStorage)
- [ ] 오프라인: 비행기 모드에서 싱글 플레이 정상, 함께하기는 안내 메시지
- [ ] 저사양 기기(3~4년 전 보급형): 인피니티 후반 프레임 확인, 앱 크기 ~120 MB 설치 확인
