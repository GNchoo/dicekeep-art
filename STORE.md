# 스토어 등록 자료 — 주사위 성채 (Dicekeep)

앱 패키징은 Capacitor 로 한다: 웹(루트)을 그대로 두고 `tools/build-www.mjs` 가 `www/` 를 만들어 `android/`·`ios/` 네이티브 껍데기에 넣는다. 빌드 절차는 맨 아래 체크리스트.

현재 브랜치는 웹·Android 계정/구매 연동과 3개 모드를 추가한 출시 준비본이다. 실판매는 기본 비활성화이며, 아래 문구는 제출 완료 내역이 아니다. 가맹점·Google/Play 설정과 실제 구매/환불 시험, 판매자 공개 정보와 계정 삭제 운영 경로를 완성해야 한다. iOS 인앱 결제는 이번 구현 범위에 없다.

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
| 가격 · 인앱 · 광고 | 무료 · 성장 조각/외형 구매 구현(활성화 전) · 광고 없음 |
| 대상 연령 | 현재 콘텐츠를 기준으로 스토어 등급 심사 필요 |

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
'순수운빨'은 계정 강화 없이 101웨이브에 도전합니다. '덱빌드'는 주사위 5종을 편성하고 성장시키며, '극한'은 끝없는 웨이브를 상대로 기록에 도전합니다. 무료 플레이로도 같은 성장 조각을 얻습니다.

👥 함께하기 (2~4인)
방 코드를 나누거나 빠른 매칭으로 친구와 같은 맵을 각자 속도로 플레이합니다. 다른 사람의 필드를 보고, 채팅으로 응원하세요.

📴 오프라인 싱글
게스트 싱글 플레이는 인터넷 없이도 됩니다. 선택적인 Google 로그인과 계정 구매/성장은 인터넷 연결이 필요합니다. 광고·분석 SDK는 없습니다.

- 세로·가로 모두 지원
- 게스트 진행은 기기, 로그인한 계정 진행과 구매는 서버에 저장
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
Pure Luck preserves the 101-wave challenge without account upgrades. Deck Build uses five selected dice and progression. Extreme continues beyond 101 waves. All arena modes award the same progression currency that can also be purchased.

👥 Play together (2–4 players)
Share a room code or use quick match to play the same map with friends, each at your own pace. Peek at other players' fields and cheer in chat.

📴 Offline single-player
Guest single-player works without internet. Optional Google sign-in, account progression and purchases require a connection. No advertising or analytics SDKs.

- Portrait and landscape
- Guest progress saved on device; account progress and purchases saved on the server
- Multiplayer needs an internet connection
```

## 키워드

ko: `타워디펜스, 주사위, 디펜스, 캐주얼, 전략, 무한모드, 협동, 멀티플레이, 오프라인`
en: `tower defense, dice, casual, strategy, endless, co-op, multiplayer, offline, td`

## 콘텐츠 등급과 데이터 보안 제출 준비

이전의 '구매 없음', '계정 없음', '서버 저장 없음', '데이터 수집 없음' 답변은 새 구현에 적용하지 않는다. 최종 앱과 활성화할 기능을 기준으로 Console 설문을 다시 작성한다.

- 판타지 전투, 사용자 간 채팅, 선택적 디지털 구매가 있다. 구매한 성장 조각은 덱빌드·극한 성장에 사용할 수 있으며 현금화나 이용자 간 거래 기능은 없다. 등급·도박 관련 설문 답변은 실제 문항과 최종 콘텐츠로 판단한다.
- Google 로그인 식별자에서 만든 계정 ID, 서버 세션, 성장·덱·스킨 권한·기록, 구매·지급·환불 원장을 처리한다. 결제 수단 원문은 결제 제공자 화면에서 처리하고 게임 서버에 전체 카드 번호를 저장하지 않는다.
- 게스트 저장과 계정 저장은 별개다. 앱 삭제가 서버 계정/구매 기록 삭제를 의미하지 않는다. 구매 중복 방지 키는 현재 보존되며 자동 계정 삭제·기간별 정리 작업은 구현되어 있지 않다.
- 계정 삭제 접수·본인 확인·처리 경로와 보관 기간을 확정하고 앱 내 경로 및 웹 주소를 제공해야 한다. 실판매 설정은 계정 삭제 주소를 포함한 정책 URL을 요구하지만, URL 문자열 검사가 실제 운영 절차를 확인해 주지는 않는다.

기술적 데이터 흐름은 `privacy.html`, 구매 운영은 `commerce/README.md`를 참고한다. [Google Play 사용자 데이터 정책](https://support.google.com/googleplay/android-developer/answer/10144311)과 [계정 삭제 요구사항](https://support.google.com/googleplay/android-developer/answer/13327111)을 확인한 뒤 최종 제출한다. 현재 문서는 스토어 승인이나 규정 준수 인증이 아니다.

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

1. 준비: Node LTS(22), Android Studio(최신, SDK 36 + Build-Tools 포함), JDK 는 Android Studio 내장(21+).
2. `npm i` — Capacitor·sharp·글꼴 설치
3. `npm run fonts` — `fonts/` 갱신 (Google Fonts 대신 로컬 글꼴)
4. `npm run build:www -- --optimize` — `www/` 생성. 빌드 후 `www/manifest.json`의 bytes와 APK/AAB 파일을 각각 측정한다. 2026-09-09 검증한 재압축 없는 `npm run build:www` 결과는 2,241파일·349,769,506 B(333.57 MiB), 로컬 debug APK는 362,762,574 B(345.96 MiB)다. `--optimize`나 release AAB 크기는 별도 측정해야 한다. `--quantize`는 손실 변환이므로 승인 아트를 재검수하지 않고 사용하지 않는다.
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
- [ ] 백업·기기 이전: WebView 세션·로컬 진행이 복원되지 않는지 확인. `backup_rules.xml`(API 23–30)과 `data_extraction_rules.xml`(API 31+)은 기본 `app_webview` 저장소를 클라우드·기기 이전에서 제외한다. 새 기기에서는 다시 로그인하고 계정 진행·구매를 서버에서 복구한다. 게스트 진행은 기기 간 이전되지 않는다. [Android 공식 백업 규칙](https://developer.android.com/identity/data/autobackup)을 따른다.
- [ ] 오프라인: 비행기 모드에서 싱글 플레이 정상, 함께하기는 안내 메시지
- [ ] 저사양 기기(3~4년 전 보급형): 인피니티 후반 프레임 확인. 로컬 debug APK는 345.96 MiB이며, Play에서 전달하는 release AAB 다운로드 크기와 실기기 설치 후 저장 공간은 아직 별도 측정이 필요하다.
