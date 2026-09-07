# 주사위 성채 — 개발 기록 복원 (2026-09-07)

## 0. 이 문서에 대해

- **왜 이 문서가 있는가**: 주사위 성채(Dicekeep, 저장소 `GNchoo/dicekeep-art`)의 메인 개발 대화였던 Claude 세션 `session_01CPtyjXTAGa9quHxiVhte98`(2026-09-02 01:09 UTC 첫 커밋 `0cf7cab` ~ 2026-09-07 03:01 UTC 마지막 커밋 `d9373a2`, 커밋 트레일러 84개)이 사라졌다. `get_session` 은 not-found 를 돌려주고, 보관(archived) 세션까지 포함한 25개 세션 목록에도 없다 — 삭제된 것으로 판단되며, 이 환경에서는 대화 내용(transcript)을 복구할 수 없다. 로컬 `~/.claude/projects` 에도 이 복구 세션의 jsonl 만 있다(컨테이너가 새것).
- **무엇으로 재구성했는가**: (1) GitHub PR #1~#28 의 본문·커밋 목록·배포 봇 코멘트, (2) 브랜치 `claude/next-tasks-planning-vun4oo` 와 `main` 의 커밋 메시지 84+개(대부분 본문이 길고 검증 내역까지 적혀 있다), (3) 브랜치 최신 문서 `GAME-SPEC.md`·`README.md`·`ART-PROMPTS.md`·`GROK-BRIEF.md`·`GROK-HANDOFF.md`·`ART-PIPELINE.md`·`ASSET-MANIFEST.md`·`MUSIC-PROMPTS.md`·`STORE.md`·`net/README.md`·`tools/e2e/README.md`, (4) 살아남은 자식 세션 `session_01UHYuvb8XCJqrZ8tjcNw1hV` 의 요약, (5) Cloudflare 배포 기록.
- **복구하지 못한 것**: 사용자와 Claude 가 실제로 주고받은 대화(요청 문구, 스크린샷, 중간 논의, 채택되지 않은 대안). 아래 "요청/피드백" 항목은 PR 본문과 커밋 메시지에 *기록된* 것만 옮긴 것이고, 기록이 없으면 비워 두었다. 자식 세션이 참고한 부모 세션의 맥락(~306k 토큰 중 부모에서 물려받은 부분)도 요약으로만 남아 있다.
- **읽는 법**: PR 은 `#N`, 커밋은 7자리 해시. 시각은 커밋·PR 은 UTC, 사용자(추경남)가 GitHub 에서 병합한 시각은 KST 기준으로 기록돼 있어 날짜가 하루 어긋날 수 있다. 출처가 서로 다르게 말하는 곳은 두 출처를 같이 적었고, 브랜치 문서와 PR #28 을 가장 새 출처로 우선했다.

## 1. 남아있는 기록의 위치

| 기록 | 위치/링크 | 내용 |
|---|---|---|
| 잃어버린 메인 세션 | `session_01CPtyjXTAGa9quHxiVhte98` — https://claude.ai/code/session_01CPtyjXTAGa9quHxiVhte98 | not-found. 2026-09-02 ~ 2026-09-07 의 84개 커밋에 `Claude-Session` 트레일러로 남아 있음. 트레일러의 모델: Claude Fable 5.1, Claude Opus 5 |
| 자식 세션 (복구 가능) | `session_01UHYuvb8XCJqrZ8tjcNw1hV` — https://claude.ai/code/session_01UHYuvb8XCJqrZ8tjcNw1hV | 제목 "키아트·인피니티 1~5 몬스터 생성 (OpenAI 이미지 API)". 부모 = 잃어버린 세션. 2026-09-07 03:03Z 생성, 04:49Z 갱신, IDLE(재개 가능), 브랜치 `claude/next-tasks-planning-vun4oo`, 컨텍스트 약 306k 토큰 사용, 태그 `dicekeep-artgen`. 마지막 요약: AI 키아트 + 몬스터 스프라이트 생성·팩·통합, PR #28 갱신, 키아트(세로/가로), 몬스터 5종 정지컷+걷기 시트, 팔레트 PNG 최적화(19MB→2.1MB), 비용 약 3 USD, 모델 gpt-image-2. 커밋 `6fc1c25` |
| 이전 세션 | `session_01KkMPfUn6ufQ7ZjP4LkD4tu` — https://claude.ai/code/session_01KkMPfUn6ufQ7ZjP4LkD4tu | 제목 "주사위 디펜스 게임 개발 준비". 2026-09-01 03:54Z ~ 10:09Z, 사용자 컴퓨터의 원격 제어(bridge) 세션, main `8324ea5` 기준. 컴퓨터는 2026-09-01 이후 연결 불가. 이 세션 id 가 붙은 커밋은 없음 |
| 이 복구 세션 | `session_018SMyU9qspEeyGVwUHuNaor` — "메인 개발 대화 복구" | 2026-09-07. 이 문서를 만든 세션 |
| PR (28개) | https://github.com/GNchoo/dicekeep-art/pulls — #1 ~ #28 | 전부 GNchoo 가 열었음. #1~#3 은 Cursor 에이전트 브랜치(`cursor/setup-dev-environment-7a26`, `cursor/dicekeep-align-and-meta-7a26`, `cursor/dicekeep-lobby-stages-shop-7a26`), #4~#28 은 잃어버린 세션의 브랜치 `claude/next-tasks-planning-vun4oo`. 열린 PR: #1, #3, #28. 이슈 0개. PR 본문이 사실상 작업 일지(변경·근거·검증·남은 일) |
| PR #28 (병합됨) | PR #28 https://github.com/GNchoo/dicekeep-art/pull/28 | 2026-09-07 06:41Z main 에 병합(`c1d50fe`, 복구 세션에서 검증 후 병합). head `6fc1c25`, 커밋 14, 변경 파일 135, 2026-09-06 17:38Z 생성. 잃어버린 세션 13커밋 + 자식 세션 1커밋 |
| 병합 기록 | GitHub merge 커밋 | #4 ~ #27 은 추경남이 2026-09-02 ~ 09-07(KST) 직접 main 에 병합. #2 는 cursor[bot] 병합 |
| 커밋 (브랜치) | `git log --format=full --grep=session_01CPtyjXTAGa9quHxiVhte98 origin/claude/next-tasks-planning-vun4oo` | 84개(잃어버린 세션) + `6fc1c25`(자식 세션, 트레일러는 `session_01UHYuvb8XCJqrZ8tjcNw1hV`). 커밋 본문에 변경 이유·검증 결과·캐시버스트 번호가 있음 |
| 커밋 (main) | `git log origin/main` (137개) | main HEAD `c1d50fe` 2026-09-07 06:41Z (PR #28 병합 커밋). 그 직전 `8c0e91b` 2026-09-06 17:16Z "Add GROK-BRIEF §G launch UI pack: icons, splash, HUD frames, VFX"(GNchoo). 아트 납품 커밋 `95644fc`, `2bc0c76`, `37323f2`, `8c0e91b` 은 사용자가 main 에 직접 올림 |
| 문서 (브랜치 최신) | `git show origin/claude/next-tasks-planning-vun4oo:<file>` | `GAME-SPEC.md`(단일 소스, §1~§9), `README.md`, `ART-PROMPTS.md`(§0·§6·§7), `GROK-BRIEF.md`(§E·§F·§G), `GROK-HANDOFF.md`(초기 브리프 보관), `ART-PIPELINE.md`, `ASSET-MANIFEST.md`(2026-08-31 기준, 이후 표 미갱신), `MUSIC-PROMPTS.md`, `STORE.md`, `net/README.md`, `tools/e2e/README.md`. main 과 다른 파일: `GAME-SPEC.md`(5줄), `README.md`(+20줄 AI 그림 생성 절), `ART-PROMPTS.md`(+24/−9), `tools/e2e/README.md`(브랜치에만 존재) |
| 프리뷰 URL (브랜치) | https://claude-next-tasks-planning-vun4oo-dicekeep.cgn3731.workers.dev | 브랜치 최신 배포. 커밋별: https://4b289a93-dicekeep.cgn3731.workers.dev (`6fc1c25`, 2026-09-07 04:48Z 배포 성공) |
| 운영 URL | https://dicekeep.cgn3731.workers.dev (main) · 멀티 서버 `wss://dicekeep-net.cgn3731.workers.dev` · `/privacy.html` | `README.md`·`STORE.md` 기재 |
| 브라우저 검증 스크립트 | `tools/e2e/` (브랜치, `d9373a2`) | 19종 회귀 스크립트 + README. 잃어버린 세션이 "다음 세션에서 재사용" 하려고 저장소에 옮겨 둔 것 |
| 스크래치 전용(소실) | `scratchpad/bot2.js`, `scratchpad/sim.js`, `scratchpad/devices-test.js`, `gen-hard.js`·`gen-walk.js`·`gen-skins.js` | 저장소 밖 세션 스크래치에만 있었던 스크립트. `devices-test.js` 는 `tools/e2e/` 로 옮겨졌고(README 표에 있음), 밸런스 봇·몬테카를로 시뮬·플레이스홀더 아트 생성기는 문서상 언급만 남음 |

## 2. 타임라인 (날짜별)

### 2026-08-28 (선사 — 잃어버린 세션 이전)
- `b8cf463` GNchoo — 모바일 에셋 로드 수정: PNG 축소, 파일 하나가 없어도 부팅을 막지 않음.
- `a78df5a` GNchoo — 드래그 고스트 축소, 오버레이 타워 정보, 속도 비례 던지기 피해.

### 2026-08-31 (선사)
- `f462e70`..`2e49f4a` GNchoo — 캐주얼 KR/랜덤다이스 풍 아트 배치 1~12(맵·스킨·적·보스).
- `9efff45` GNchoo — 현재 Dicekeep 스펙·아트팩·게임 코드 스냅샷.
- **PR #1** https://github.com/GNchoo/dicekeep-art/pull/1 "Add Cloud Agent dev environment config" (Cursor Agent, `e636a71`, 08:39Z 생성, **지금도 open**). `.cursor/environment.json` 1개 파일: `install` = `python3 --version`, `terminals` 의 `game-server` 에서 `python3 serve.py`, `ports` 8137. 커스텀 Dockerfile 없음(기본 이미지의 Python 3 로 충분, 외부 의존성 없음). 로컬 VM 엔드투엔드 확인(서버 기동, 정적 파일 200, 타이틀 렌더, 골드 130/목숨 20/웨이브 0/100/맵 cMap1, 타워 4기 배치, 웨이브 전투 골드 +95, 콘솔 에러 0, install 멱등). 코멘트·리뷰 없음.
- **PR #2** https://github.com/GNchoo/dicekeep-art/pull/2 "주사위 성채 Phase 1: 맵별 경로·배치대 정렬 + 좌표 에디터" (Cursor Agent, 10:39Z 생성, 2026-09-01 03:43Z cursor[bot] 병합, base `9efff45`). 48개 맵이 공통 S커브(`PATH_S`/`SPOTS_S`)를 공유해 아트의 흙길·석단과 좌표가 어긋나던 문제를 맵별 `MAP_LAYOUTS`(50맵 전부, 1024×576 좌표계)로 교체. 좌표 에디터 `editor.html`+`editor.js` 신설(`bf4d6ad`), 캐시버스트 `?v=36`(`ebc9002`). 게임 로직은 안 건드리고 데이터만 정렬(`applyMapLayout` 이 이미 맵별 path/spots 를 읽음). 헤드리스 Chrome 으로 50맵 로드·대표 5맵 플레이스루 검증. 다음 단계로 Phase 2 를 별도 PR 로 분리.
- **PR #3** https://github.com/GNchoo/dicekeep-art/pull/3 "주사위 성채 Phase 2: 로비·50스테이지·젬 상점·타워/스킨 해금·저장" (Cursor Agent, 10:53Z 생성, base 가 main 이 아니라 Phase 1 브랜치, **GitHub 상 open**). 100웨이브 한 판 구조를 로비 → 스테이지 선택 → 플레이 → 클리어/패배 → 복귀로 개편(`e75f43c`): 맵당 스테이지 1개 총 50, `stages`(웨이브 8~17, 마지막 보스, 몬스터풀 땅5+공중3+땅굴2, `gem`), `buildWave`/`startWave` 스테이지 스코프, `localStorage` `DKSAVE`(cleared·gems·unlockedTowers·unlockedSkins·equippedSkin), 4/5/6눈 30/55/90젬, 스킨 `t{1..6}-{a..e}` 30종 눈별 20젬, 미해금 눈은 굴림에서 제외. 사용자 제보 **"맵의 타워포석과 실제 타워배치 위치가 맞지 않는다"** 의 근본 원인은 정렬 커밋이 원격에 미푸시되어 사용자가 옛 좌표(`?v=37`)를 보고 있던 것 → 정렬 레이아웃 푸시, `cMap13` 톱니바퀴 6스팟 확정, 캐시버스트 `?v=37→40`, 디버그 훅 `window.DK*` 제거(`4ec0f59`, `8324ea5`). 사용자 안내: "이 브랜치를 pull 한 뒤 강력 새로고침(Ctrl/Cmd+Shift+R)". **출처 불일치**: PR #3 은 open 이지만 브랜치 정보에는 `cursor/dicekeep-lobby-stages-shop-7a26`(`8324ea5`) 가 "merged into main" 이고 main 의 선사 목록에 `e75f43c`·`4ec0f59`·`8324ea5` 가 들어 있다 — 커밋은 main 에 있으나 PR 은 닫히지 않은 상태로 보인다.

### 2026-09-01 (선사)
- PR #2 병합(03:43Z).
- 세션 `session_01KkMPfUn6ufQ7ZjP4LkD4tu` "주사위 디펜스 게임 개발 준비"(03:54Z~10:09Z) — 사용자 PC 의 원격 제어 세션, main `8324ea5`. 커밋 없음. 이 세션 이후 PC 는 연결되지 않음.

### 2026-09-02 (29 커밋 — 티어·인피니티·배포·그리드 맵·랜덤다이스식 아레나·갓챠)
아트 납품(main, GNchoo): `95644fc` 78장(타워 스킨 24·걷기 시트 34·두 갈래 하드 맵 20), `2bc0c76` 평원 타일셋 15조각.

**PR #4** https://github.com/GNchoo/dicekeep-art/pull/4 "5단계 난이도 티어 + 인피니티 모드: 다중 동선·추가 석단·보스 연출·P3 폴리시·밸런스·에디터·아트 병합" — 01:09Z 생성, 06:20Z 병합(draft 상태에서 GNchoo 직접 병합), 33파일 +2102/−325, 커밋 16개. GAME-SPEC §8 의 남은 작업 전부.
- 요청/피드백: 기록 없음(코멘트·리뷰 0). 사용자가 병합 직전 직접 커밋 `5b55898` "Fix overlay/shop clipping and loading gauge; surface Infinity in lobby" — 타이틀·상점 뒤로가기·스테이지 선택을 16:9 스테이지 안에 유지, 로딩은 전폭 트랙 + 단일 상태줄, 인피니티는 전폭 로비 버튼 + 스테이지 선택 배너.
- 만든 것: `0cf7cab` `TIERS` 5단계(초원 흙길 → 언덕 +하늘길 → 협곡 +땅굴 → 요새 +흙길2 → 악몽 전부, 추가 석단 +0/2/4/6/8), `buildLayout(map, tier, {avoid})` 가 하늘길·땅굴·추가 석단을 코드 생성(게임·에디터 공용), 단일 `PATH` → `LANES`(`posAt`/`epos`/`laneFor`), 보스 등장 연출·쿵쿵 걷기·피격 플래시·사망 잔상+먼지·배치/합체 마법진, 걷기 시트 13~36·보스 1~10 선연결, 에디터 4모드, `ART-PROMPTS.md` 신설, v41. `4bf1d49` 물 회피(`makeAvoidFromImage`, 파랑 우세 픽셀; 온통 파란 맵은 완화 2차 패스), `NEXT_WALK` 25~36, 봇 훅 `DKroll/DKplace/DKspots/DKSAVE`. 밸런스 봇 3회: `df4b3bf` 티어 4/5 HP 하향, `79d4721` 보스 배율 `1.1+0.015n`, `a891173` §9 기록. `36f283f` 플레이스홀더 아트(gen-hard.js A* 두 번째 흙길, gen-walk.js 4프레임, gen-skins.js 리컬러) v42 → `7ad2081` GROK-BRIEF.md → `e32951d` origin/main 병합해 납품 Grok 아트 78장 채택 v43 → `6a31410` 하드 맵 31~50 `path2`/`spots2` 작성(오버레이·S35/S45 인게임 확인). `2d0a9f8` 인피니티 모드(50 클리어 후 해금, `cInf` 는 왕실정원 폴백, 4레인·석단 8, 초기 HP `2.2×1.065^w`·보스 개별 보정(§9 1차), 5웨이브 정예, 10웨이브 보스(20부터 2마리), SP 눈별 강화 Lv10·단축키 1~6, 젬 `floor(w/10)×2`+마일스톤) v44. `0eea497` HP 곡선을 `1.8×1.035^w` 로 평탄화·마릿수 `12+0.6w` 상한 36·보스 per-boss hpM 제거(최강 보드가 30이 아닌 60 부근에서 무너지도록), `380f079` 골드 성장 `1+0.025w`, `5f592de`/`3128349` 봇 결과(69), `a8d20cd` `?unlock=all`·`?start=inf`.
- 검증: `node --check` 3파일, Playwright S1·S25·S35·S45·인피니티 전체 흐름 오류 0(아레나 배경 404 1건 폴백), 봇 티어 1~3 무피해~소량, 티어 4 목숨 15 안팎, 티어 5 10~15, S50 2~4.

**PR #5** https://github.com/GNchoo/dicekeep-art/pull/5 "인피니티 무한 투기장 코드 렌더 도로 + Cloudflare Workers 배포 설정" — 06:43Z 생성, 07:40Z 병합.
- 배경: 인피니티가 왕실정원(50) 좌표를 임시로 써 배경과 길·석단이 안 맞음; 게임을 외부 URL 로 공개하려 함.
- `36ec953` `buildArenaLayout()` 타원 나선 1.5바퀴(중심 528,300) + 오른쪽 포탈 지름길 + 땅굴, 석단 16 자동 선정, `cInf` `arena`/`renderRoads` 플래그, 왕실정원 폴백 제거; `buildRoadLayer()` 오프스크린 캐시(바닥 그림 or 코드 바닥 + `drawRoad()`), `drawArenaCrystal()`, 훅 `DKtowerSpr`, v48. `55a2dcf` 봇 54/54. `72a6d5b` `wrangler.jsonc`(이름 `dicekeep`, 스크립트 없이 `assets.directory="./"`), `.assetsignore`, `_headers`(HTML/JS/CSS 항상 재검증, 이미지 하루), README 대시보드 절차.
- 결정: 아레나는 바닥 그림만 받고 도로·석단·포탈·크리스탈은 코드 렌더(그림이 바뀌어도 좌표 작업 없음); 에디터는 아레나에 "코드 생성 맵 — 편집해도 반영되지 않음"; 랭킹 API 는 나중에 `main`+D1 바인딩만 추가.

**PR #6** https://github.com/GNchoo/dicekeep-art/pull/6 "타워 공격 모션 버그(크기·다른 타워) 수정, 화면 크기별 스테이지·HUD 대응, 배포 설정 정리" — 07:47Z 생성, 08:03Z 병합. 첫 Cloudflare 프리뷰 URL(https://42fef983-dicekeep.cgn3731.workers.dev).
- 피드백(본문): "배포 후 확인된 두 가지 버그" — 공격할 때 타워가 커지고 다른 타워가 공격함; 화면 크기에 따라 하단 HUD 가 깨짐. 이전 수정은 대기 스프라이트(`scaleTowerArt`)만이었고 공격 경로는 손대지 않았다는 해명.
- `2df2679` 원인: `paintTowerBody()` 가 `tN-attack-2x2.png` 프레임을 `drawImage(fr.cv,x,y)` 로 폭·높이 없이 그려 원본 256px, 시트 디자인이 스킨과 달라 다른 타워로 보임(경로는 `9efff45` 부터 있었으나 시트가 `95644fc` 에서 처음 로드되며 드러남). 수정: 스킨 스프라이트에 반동(가로 +7%·세로 −9%, `kick²`) + 원소색 발광, `towerAtkFrame` 제거, 공격 시트 6장 미로드(파일 보관). `fitStage()` 가 폭/높이 중 빡빡한 쪽으로 스테이지 폭 계산(HUD 실측 높이 차감), HUD 높이 auto(min 104)+`flex-wrap`, `.mini` 2열, 720px/520px 미디어 축소, v49. `c2bac98` `.assetsignore` 에 `.gitignore`, `preview_urls: true`.
- 검증: 9개 뷰포트 비율 1.775~1.78 유지(수정 전 4개 뷰포트 2.0~2.7 왜곡).

**PR #7** https://github.com/GNchoo/dicekeep-art/pull/7 "맵 전면 변경: 코드 설계 그리드 맵 + 테마 타일셋 (배경 맞춤 방식 폐기)" — 08:30Z 생성, 08:31Z 병합. `f61b3a6`.
- 배경(본문): "배경 그림에 길·석단·시작·도착 좌표를 맞추던 방식을 전면 폐기했습니다. 미묘한 어긋남이 구조적으로 생길 수밖에 없는 방식이었습니다."
- 16×9 격자(64px) ASCII 템플릿 `TEMPLATES_SINGLE[6]`(1~30)/`TEMPLATES_DUAL[6]`(31~50), `buildGridLayout()`(BFS 경로, 모서리 36% 깎기), `templateForStage()`(6개 순환 + 두 바퀴째 좌우 반전), `THEMES[6]` 평원(1~8)·숲(9~16)·호수(17~25)·어두운 숲(26~33)·성(34~42)·지옥(43~50), 스테이지 이름 50개 재작성, `MAP_LAYOUTS`·`MAP_LAYOUTS_HARD`·`PATH_S/SPOTS_S` 삭제, `maps[]`=`g1~g50`+`cInf`. `buildTileLayer()` 오프스크린 굽기(바닥→물→도로 오토타일→석단→씨앗 소품→시작 문→성), 모든 조각 코드 폴백, 타일 키 `tl_<theme>_<name>` 90개, 옛 배경 50+20장 미로드·`.assetsignore` 제외. 에디터를 그리드 에디터로 교체. GROK-BRIEF 를 타일셋 브리프(15조각×6테마=90장)로 재작성. v50.
- 검증: 50맵 생성 수치, 템플릿 12개 규칙 검사, Playwright 6스테이지, 가짜 타일 15장으로 이음새 확인(커밋 미포함).

**PR #8** https://github.com/GNchoo/dicekeep-art/pull/8 "도로·물은 질감만 받고 모양은 코드가 그리기 (도로 타일 4종 폐기)" — 08:53Z 생성·병합. `2c9efe0`.
- 피드백(본문): Grok 이 납품한 평원 도로 타일 4장(직선·코너·T·십자)은 폭이 27·45·70·35% 로 제각각이고 코너 진입·진출이 어긋나 격자에 깔면 이어지지 않음. 오브젝트·바닥은 품질이 좋아 그대로.
- 도로 오토타일 제거, `drawRoad()` 본체 40px 를 `road.png` 160px 패턴으로, `roadTextureFromStraight()`(`road.png` 없고 `road-straight.png` 있으면 띠 가운데를 잘라 사용), `makePattern()` 160/256px(64px 는 디테일 소실), `drawCodeWater()` 셀 합집합 마스크 + `water.png` 256px, `TILE_ASSETS` 12개(총 72장), v51.

**PR #9** https://github.com/GNchoo/dicekeep-art/pull/9 "맵 설계 규칙: 길 커버리지 기준 석단 자동 배치, 소품이 길·석단을 가리지 않게, 템플릿 재설계" — 09:05Z. `5d0f4db`.
- 피드백(본문): "플레이 피드백 반영: 석단이 길과 무관하게 흩어져 있고 나무가 길을 가렸다." 검증에 "스테이지 1 자동 석단 7곳 중 4곳이 사용자가 표시한 최적 위치와 정확히 일치" — 사용자가 S1 의 최적 석단 위치를 직접 표시해 준 것으로 보임.
- 석단 점수 = 반경 2.4칸 길 칸 수 + 1.5×직교 길 이웃 + 0.5×대각, 길에 안 붙은 칸 제외, 석단끼리 체비쇼프 2 이상, 후보 부족 시 대각 허용 2차 보충, J·K·L 템플릿 지그재그 재설계(모두 15개 이상 후보), 소품은 길·석단 8방향 이웃·포탈·성 주변 금지, 맨 윗줄·둘째 줄 왼쪽 7칸(HUD 칩) 석단 금지, 템플릿 `o`/`+` 제거(`o` 강제·`x` 금지만 선택), GAME-SPEC §4 지침, v52.

**PR #10** https://github.com/GNchoo/dicekeep-art/pull/10 "안내 문구를 HUD 칩 아래로, 속도·소리·나가기 버튼을 화면 우상단으로" — 09:14Z. `9722e6a`.
- 피드백: 검증에 "Playwright 1188×645(신고된 크기)" — 사용자가 1188×645 에서 웨이브 안내 문구가 좌상단 칩에 가려진다고 보고한 것으로 보임.
- 안내 문구 y 40→92, `.mini` 3버튼을 `#stage` 안 `#mini-top` 우상단 오버레이로(플레이 중만 표시), 720/480/400px 반응형, v53.

**PR #11** https://github.com/GNchoo/dicekeep-art/pull/11 "소품 산포 알고리즘: 포아송 디스크 + 밀도 노이즈 + 픽셀 가림 마스크" — 09:22Z. `8cc4bf1`. #9 의 칸 단위 금지가 소품을 구석으로 몰아 가운데가 빔 → `buildForbidMask`(길 폭 40+여백 9, 석단 타원 42×24+타워 자리 80×108, 포탈/성, HUD 칩·버튼, 물) 1비트 마스크 + 브리드슨 포아송 디스크(38px, ~300 후보) + 5×4 값 노이즈 밀도, 스프라이트 사각형 6px 간격 대조, 큰 나무 실패 시 작은 소품 재시도, 겹침 30% 허용, 최대 90개, `T` 칸 큰 나무 고정, v54.

**PR #12** https://github.com/GNchoo/dicekeep-art/pull/12 "인피니티 임시 개방 플래그 ?inf=1" — 11:25Z. `282a895`. `window.DKINF_OPEN`, `infinityUnlocked()` 우선 확인, 저장 데이터 불변(`?unlock=all` 과 다름), v55. (이후 PR #25 `ac1acf9` 로 인피니티가 항상 열리며 하위호환 플래그가 됨.)

**PR #13** https://github.com/GNchoo/dicekeep-art/pull/13 "인피니티 = 풀파워 무한 모드: 랜덤다이스식 보드 맵, 6눈 전부 해금, 난이도 재보정" — 15:45Z. `816e341`.
- 방향(본문): "스테이지는 젬으로 타워를 하나씩 해금하며 성장하는 컨텐츠, 인피니티는 이미 전부 해금된 풀파워 상태로 얼마나 오래 버티느냐를 겨루는 컨텐츠로 분리했습니다. 랜덤다이스를 참고해 맵과 난이도를 다시 잡았습니다."
- `unlockedFaces()` 인피니티 `[1..6]`, 석단 15·레인 4 를 1웨이브부터(`extraSpots` 0), 나선 아레나 → 3×5 보드(88px, 중심 512,300) + 둘레 둥근 사각 트랙(좌 222·우 802·상 132·하 468), 지름길·V자 하늘길(`map.airPts`)·땅굴, `drawArenaFloor` 돌 단, HP 지수 1.035→1.045(봇 1.035→75/69, 1.04→72/73, 1.045→69/67, 목표 50~70), v56.

**PR #14** https://github.com/GNchoo/dicekeep-art/pull/14 "인피니티 단일 트랙 (랜덤다이스식): 지름길·하늘길·땅굴 제거" — 16:09Z. `391069c`. #13 의 4레인을 되돌려 `lanes=['ground']`, 공중·땅굴은 `laneFor()` 폴백으로 같은 트랙, 봇 59/59 로 곡선 유지, v57.

**PR #15** https://github.com/GNchoo/dicekeep-art/pull/15 "인피니티 갓챠: 보물상자·다면체 주사위·7~20성 히든 타워, 보드 밀착 트랙과 연출" — 16:45Z. `604c3c0`. "인피니티에 운 요소를 넣었습니다." 트랙 좌 250·우 774·상 150·하 450, 석단 3×5 가로 88·세로 72, `INFINITY.rangeBonus=24`, 룬 원·연석·화로·소켓; `STAR_BANDS` 로 `TOWER_DEFS[7..20]`(`dmg 40×1.28^(g−6)`, 4밴드 별빛 첨탑/성운 요새/천공 옥좌/차원 군주), `casual/towers/star-NN.png` 선택 로드(없으면 6눈 스킨+오라+★배지); 상자 `round10(250×1.10^n)`, 확률 d1 10%·d4 42%·d6 20%·d8 17%·d12 8%·d20 3%, 가방, `drawPolyDie`, 훅 `DKchest/DKbag/DKrollBag`, GROK-BRIEF §E, v58. 봇 69/69.

### 2026-09-03 (19 커밋 — 아레나 비주얼·메운디 이식·로스터·상자 경제)
아트 납품(main): `37323f2` 인피니티 아레나 타일셋 9조각(GROK-BRIEF §F).

**PR #16** https://github.com/GNchoo/dicekeep-art/pull/16 "아레나 비주얼: 조각 질감(Grok) + 코드 구조 유지, 코드 폴백 고급화" — 00:43Z. `89a0030`. 반응(본문): "인피니티 아레나가 민무늬 트랙·납작한 보드·그라데이션 바닥이라 후졌습니다." `casual/tiles/arena/` 9장(floor·road·board·pad·start·end·prop-1 화로·prop-2 기둥·prop-3 잔해) 로드, 각각 코드 폴백(노이즈 바닥·석판 줄눈·베벨 보드·오목 소켓·경사 연석·기둥 5·화로 4), `drawRoad(bodyOnly)` 로 연석 뒤 본체 재도장, GROK-BRIEF §F, v59. 가짜 조각 6장은 확인 후 삭제.

**PR #17** https://github.com/GNchoo/dicekeep-art/pull/17 "Fit Grok arena pieces" — 02:32Z. `4400812`. §F 납품 반영: 기둥 84→112, 화로 56→64, 잔해 40→48, 불꽃을 그려진 화로 그릇 위로(`ARENA.brazierArt`), v61, 세 문서 §F delivered.

**PR #18** https://github.com/GNchoo/dicekeep-art/pull/18 "Arena: decorations to the edges, smaller, outside-track dimming" — 04:21Z. `f2393ca`. 동기: 기둥·화로가 연석 옆에 타워 크기로 있어 주사위 타워로 오인. 기둥 4개 캔버스 좌우 끝(x 64/960, y 210/470) 80px, 화로 2개(y 340) 56px, 잔해 밀어냄, `dimOutsideTrack`(연석 +58px 바깥 36% 어둡게), GAME-SPEC 장식 규칙(연석 ≥100px, ≤80px), v62.

**PR #19** https://github.com/GNchoo/dicekeep-art/pull/19 "Infinity arena: enter left, lap the ring, exit right; boss leak ends run; all towers hit air" — 04:31Z 생성, 04:42Z 병합. `cf8e9dd` 시작/끝 제거, 왼쪽 진입 → `INFINITY.laps`(2)바퀴 + 반 바퀴 → 오른쪽 퇴장(4,474px), 보스 퇴장 즉시 종료(`S.inf.bossLeak`), `noGoal`, `roads`(entry/ring/exit) 반환, 레인 가장자리 페이드, v63. `d87187f` 캐논(2)·폭군(6) `canAir: true` — 공중 기믹은 스테이지의 포탈→크리스탈 직행뿐, 인피니티엔 공중 레인 없음. 봇 69 로 HP 유지.

**PR #20** https://github.com/GNchoo/dicekeep-art/pull/20 "Infinity: endless loop + field cap, Maple Luck Defense gacha table, centre-covering range" — 06:30Z 생성, 07:40Z 병합, 커밋 5개. `7361465` #19 의 퇴장을 철회하고 무한 순환(`loopAt`), `fieldCap=200`(초과 시 가장 오래된 적 제거+목숨 1, 보스면 종료), 웨이브 완료 = 스폰 큐 소진, 칩 `필드 n/200`, v64. `0256b3b` HP 1.045→1.06(임시). `5582a58` 메운디 9등급 표(일반 50% d1 · 레어 33.1% d4 · 고대 10.2% d6 · 유물 5.1% d8 · 서사 0.8% d12 · 전설 0.5% d20 · 에픽 0.2% d20(14+) · 신화 0.08% d20(18+) · 태초 0.019% 20★), 상자 160G 고정(시작 400G = 2.5회), 라운드 잠금(웨이브 5 전 전설↑→d12), 보스 처치 d8/d12/d20, 희귀 가방 슬롯 3, `rangeBonus` 24→160(중앙 패드 295 ≥ 트랙 최원점 284), v65. `fbc4d33` `DKrange`. `84f9c08` HP 1.08 확정(1.06→83, 1.08→60, 1.10→50).

**PR #21** https://github.com/GNchoo/dicekeep-art/pull/21 "Infinity: Maple Luck Defense systems (affinity, armor, boss schedule/timer, gamble, exchange, perks)" — 08:09Z 생성, 08:19Z 병합. `3ddf005` 나무위키 메운디 문서 전체와 대조해 이식, 모두 `S.mode==='infinity'` 게이트: 상성(`atk` vibration=궁수, explosive=대포/폭군/7~19★, normal=마법/서리/전격/20★ × 크기 S/M/L `sizeSeq`, 배율 100/50/25·50/75/100·100/100/100), 방어력 `⌊max(0,w−20)/4⌋`(33배수 ×8, `dmg=max(dmg·0.1, dmg−armor)`), 보스 보상 스케줄(10→800G+d8, 20/30→800G+d12, 40→1120G+d20, 50→1600G+d20, 60→2400G+d20, 70+→1600G+d20+d8/d12 교대, 1미네랄=16G), 보스 제한 320초, 랜덤 도박(20% 승급/80% 소실), 교환 도박(레전드 1600G/66%, 신화 4000G/50%, 실패 시 파괴), 7★+ 판매 불가, 퍽(에픽 방어 무시+12% 락다운, 신화 공속 ×1.5, 프라이멀 전체 타격), **라운드 잠금 제거**(원작 4.04 의 숨겨진 조작), v66. `8e8589a` 봇 55.

**PR #22** https://github.com/GNchoo/dicekeep-art/pull/22 "Infinity: one monster type per wave from a designed 101-wave roster" — 09:02Z 생성, 09:20Z 병합. `f6244ca` `buildInfinityRoster(sizeSeq)`: 웨이브당 한 종(크기 S ≤42/M 44~48/L ≥50, 4배수 공중·7배수 땅굴, hp 정렬 풀, 주기 내 중복 없음), `ROSTER_OVERRIDES`, `TANK_IDS` hp ×1.25·방어 +2, 보스 웨이브 보스만, 엘리트 같은 종 3마리 ×3, 마릿수 계수 S 1.2/M 1.0/L 0.8, 101 이후 색조 변화+"N주기", 웨이브 텍스트에 이름·등급·방어, GAME-SPEC 101행 표, v67. `ee05d8e` 봇 60.

**PR #23** https://github.com/GNchoo/dicekeep-art/pull/23 "Infinity: chest-only draw with auto-roll, help card, Random Dice gold power-up" — 09:48Z 생성, 10:14Z 병합. `78f5918` 인피니티 40G 주사위 제거(`canRoll` false), 왼쪽 버튼 `🎁 뽑기 160G`→`buyChest()` 즉시 굴림(`startBagRoll`), 상자 버튼 제거, `승급 도박 20%`, `?` 도움말 카드(첫 진입 자동), 파워업 골드화 `150+150·lv`(웨이브 SP 삭제), 7★+ 는 face-6 파워, v68. `7a72b2a` 방어 곡선 완화(봇이 HP 지수와 무관하게 32~41에서 사망 — w33 ×8 방어 24 가 1~4★ 타워를 막음 → 기본 w30부터 /6, 고방어 ×4: w33 6, w66 24, w99 44). `7e4ece1` 마릿수 계수 S 1.0, L 0.85. `ec850f3` 보스 웨이브는 보스 처치까지 다음 웨이브 보류(w10 보스가 순환 적에 묻혀 집중 사격 못 받고 5:20 타이머가 매 런 w33~34 만료). `47f6bf5` 봇 4게임 39·49·59·69(중앙값 54), 1.08 유지.

### 2026-09-04 (9 커밋 — 3D 주사위·확률강화·도전/무한·P2P 시도·모바일·세로 아레나)
**PR #24** https://github.com/GNchoo/dicekeep-art/pull/24 "Infinity: real 3D polyhedral dice, per-die roll/gamble popover, HUD layout fix" — 02:14Z 생성·병합. `76e1dd3`.
- 피드백(본문): "Fixes the three problems reported from the live build" — 조잡한 비-d6 주사위, 읽기 어려운 도박 흐름, 도박 버튼을 누르면 HUD 가 뒤틀림. 사용자가 스크린샷 3장으로 보고; 두 번째 스크린샷은 "방금 뽑은 주사위를 어떻게 도박하느냐" 는 질문, 세 번째는 스테이지가 줄어드는 현상.
- `POLY` 플라톤 입체(d4·d8·d20 황금비, d12 = d20 쌍대), `drawPoly3D`(원근·백페이스 컬링·면별 조명), 방향 행렬 굴림·`slotTargetR()`, d1 구체, `poly-dN.png` 우선, 주머니 3D 아이콘, 숨은 도박 토글 → 주머니 주사위 팝오버(`굴리기` / `도박 — 20% → 다음 등급 · 80% 소멸`), `주머니에 보관` 체크박스, 팝오버 absolute(`#inf-gacha` 안) 로 `fitStage()` 재측정 방지, v69.

**PR #25** https://github.com/GNchoo/dicekeep-art/pull/25 "인피니티 개편: 뽑기→즉시 배치·확률강화, 도전/무한 두 갈래, 세로 아레나·HUD, 멀티 M1(함께하기)" — 08:10Z 생성, **2026-09-06 12:58Z 병합**, 커밋 11개(09-04 ~ 09-06). 사람이 남긴 코멘트·리뷰 없음.
- `b4e7ee8` §1 뽑기→즉시 배치: `buyChest()` 는 언제나 굴림, 주머니·보관 체크박스·팝오버·승급 도박·교환 도박 **제거**(#24 에서 만든 것을 하루 만에 철회), 손이 차면 `배치 후 가능`, 보스 보상은 `S.inf.queue`+`pumpQueue()`, 도박은 타워 **확률강화**(비용 `round10(160+90×face)`, 강화 `max(0.10, 0.72−0.035f)`, 소멸 `min(0.45, 0.03+0.022f)`, 20★ 비활성, 합체 레벨 유지), 하단 HUD `[슬롯+뽑기] | [타워 상태창] | [웨이브]` + 둘째 줄 파워업, `#info-panel` 인라인 카드·높이 고정, v70.
- `9ec2e35` §2 도전(101 완주 = 클리어, 젬 +60, `SAVE.infClears`, 멀티가 쓸 쪽)/무한(클리어 없음, 2주기) 분리, 도전 전용 최종 관문 `lateFrom 90`·`lateExp 1.08`(w101 3,960×→9,232×), 보스 주기를 `w%10` 에서 `isBossWave`/`bossOrdinal` 로(2주기 w111 에서 `boss.base` 참조 오류 수정), 실제 봇 4판 59·89·59·49, Node 몬테카를로 20,000판(`scratchpad/sim.js`) 클리어 0.045%~0.42%, v71.
- `b5e9a91` 멀티 준비 계층 — **서버 없는 P2P**(WebRTC DataChannel + 핑 기반 호스트 선출 `qualityScore`, `WebSocketSignal`/`LoopbackSignal`), `#log-panel` 스타크래프트식 로그(9초, 8줄, 종류별 색), 방 안 채팅(Enter). 
- `4195e7a` 모바일: `fitStage()` 가 `side`(가로 폰, HUD 오른쪽 세로 열)/`stacked`(세로·데스크톱, `#hud.roomy`) 선택, 칩·미니버튼 축소를 스테이지 폭 기준(`.small/.tiny`), 터치 판정 `stageScale()`/`touchExtra()`(탭 24px·드래그 50px), 도움말 카드 body 직속 fixed 3단, `buildStarSprite()` 코드 구움(`star-NN.png` 오면 자동 우선), ★공격 연출 `starImpact`, **멀티 문서 정정: "SDP 교환이 없어 채널이 열리지 않으므로 지금은 플레이 불가"**, 호스트 선출 `selfScore()` 수정, v72. 커밋 본문: "폰에서 켜 보니 가로는 플레이가 불가능했고 세로는 위아래가 크게 남았다."
- `ac1acf9` 인피니티를 스테이지와 분리(`infinityUnlocked()` 항상 true, "50 스테이지 클리어 후 해금" 문구 8곳 정리), 로비 재구성(인피니티 두 버튼 맨 위), 첫 런 5단계 코치 `#coach`(`dk_coachDone`), 도움말 플래그를 닫을 때 저장(예전엔 열기 전 저장해 한 번 놓치면 영영 안 뜸), 손에 타워 있을 때 힌트 "빈 석단을 눌러 타워를 놓으세요", 파워업 라벨 `1 SP`→`150 G`, 젬 상향 `floor(w/5)×2`+신기록 10+마일스톤 7단계+도전 80(첫 런 12~29젬), v73.
- `74c8e0d` 세로 전용 아레나 `cInfP`(720×1080, 3열×5행 150/118, 트랙 540×720, 세로 폰 스테이지 66% ← 25%), 맵이 캔버스 크기 결정(`canvas:[w,h]`, `--ar`), `relayoutArena` 회전 대응, 사거리 세로 280, 디자인 토큰(`:root` 색·반경·버튼 5종), 웹폰트 Do Hyeon+Noto Sans KR·`uiFont()`, 칩·슬롯·미니 버튼 SVG, 보스 배너 리본, v74.
- `6bb2b98` 회전 시 타워가 다른 칸으로 옮겨가던 문제: 석단 번호가 행 우선이라 두 보드에서 다른 칸 → `remapSpot()` 격자 90° 회전(넓어지면 시계, 좁아지면 반시계), 웨이브 안내 문구 17 CSS px.
- `0f61db4` `#info-panel` 을 HUD 전체를 덮는 절대 위치 오버레이(가로 폰 547px > 382px 넘침 해결), 닫는 길 4가지; **데드락**(15칸 만석 후 주사위를 뽑으면 캔버스 클릭이 `if (S.heldDie) { tryPlace(idx); return; }` 로 삼켜져 탈출로 없음) → `S.dieFocus` 주사위 포커스 해제, `canPlaceAnywhere()` 로 뽑기 버튼 `석단이 가득 참`·큐 보류, v75.

### 2026-09-05 (2 커밋 — PR #25 계속)
- `2ae4e91` 타이틀 오버레이·로비·스테이지선택·상점이 16:9 `#stage` 안에 있어 세로 폰에서 227px 로 잘림 → `#overlay`·`.screen` 을 `position: fixed; inset: 0`, 키아트를 `--keyart-bg` 로 body 에, 코치 4→5단계 전환 시 정보 카드 자동 닫기, v76.
- `1c67972` 아레나 캔버스를 화면 비율로 굽기(`buildArenaLayout/Portrait(W,H,inset)`, `DKCONTENT.layoutArena`, `arenaCanvasForScreen` 가로 576·세로 720 고정), `#wrap.over`(가로 HUD 한 줄 반투명 겹침)/`#wrap.bleed`(세로 두 줄), `viewport-fit=cover`, 안전영역 패딩, v77.

### 2026-09-06 (21 커밋 — 멀티 M1→v3·주사위 손실·출시 배치·Capacitor·그림 적용/되돌림·타이틀 개편)
- `89bb22f` **멀티 M1** (PR #25 §4): `net/` 별도 Cloudflare Worker `dicekeep-net`, Room Durable Object 가 방·시계·시드·중계만, 규칙은 순수 상태 머신 `room-core.js`(결정적 웨이브 스케줄 방송, 보스 웨이브만 홀드, `hello` 인증, Origin 검사, 속도 제한, 2KB 프레임, 재접속 유예 180/45초), 단위 65개·dev-server·ws-smoke 40체크, `net.js` 를 **WebSocket 전용 DKNET v2 로 전면 재작성**(WebRTC·호스트 선출 제거), `game.js` `frameNet` 고정 스텝, `#mp-block`·`#mp-room`·`#rivals`·`#spectate`·순위표, `.assetsignore` 에 `net`, GAME-SPEC §6.5 교체, v78. 배포 안내: 같은 저장소를 루트 `net` 으로 한 번 더 연결해 `dicekeep-net` Worker 생성; 무료 플랜 하루 ≈40판, 초과 시 $5/월.
- **PR #25 병합 12:58Z.** 남긴 과제(본문): M2/M3 — 빠른 매칭(Lobby DO), 준비 완료 투표, 플레이어별 시드, 재대전, 초대 링크, 대기실 채팅, 새로고침 뒤 보드 복구, 정확한 6초 막간.

**PR #26** https://github.com/GNchoo/dicekeep-art/pull/26 "멀티 v3(개별 진행·빠른 매칭·필드 관전·채팅) + 주사위 손실 수정 + 방향·연출·101웨이브 몬스터 설계" — 15:01Z 생성, 15:19Z 병합, 커밋 7개.
- `641de0b` **치명 버그 주사위 손실**: `canStartRoll()` 로 게이트 일원화, `finishSlot` 이 손패를 덮어쓰지 않고 '완성 대기', 큐는 굴림 성공 시에만 소비, 굴리는 중 뽑기(R 연타) 차단, 보스 2마리 웨이브는 보스마다 주사위 전부 + 골드 1/n(먼저 죽은 보스 보상이 사라지던 것).
- `ec5e443` 적·시체 좌우 방향 `e.face ⊕ faceLeft`(항상 1이던 죽은 삼항 교체), 걷기 시트는 오른쪽 향이라 `enemyFlip` 에서 `faceLeft` 무시, 로스터 91종+보스 19종에 `look`(1~5) 기록해 웨이브 101부터 거꾸로 배정.
- `132e52a` 획득 연출 단계별(1~6 작은 링 … ★19~20 무지개 3중 링), `burst` 이펙트, 방 전체 알림 "OO 플레이어가 ★8성 OO 타워를 획득하였습니다".
- `4b24940` 인피니티 101웨이브 몬스터 설계: `ART-PROMPTS §6` 10단계 테마 × 10웨이브 + 보스 10/부관 9 = 111장 표와 Grok 프롬프트, `casual/enemies/inf/wNNN.png`·`casual/bosses/inf/bNNN[-2].png`, `INF_ART_READY` 부분 납품 파이프라인.
- `83ef7c8` **멀티 v3(프로토콜 3)**: 서버 웨이브 시계·보스 홀드 폐기, `start` 신호만 공유하고 싱글과 동일 진행(막간 6초, 배속 x1→x2→x3, 보스 320초 로컬), 순위 완주 빠른 순(`clearAt`)→탈락 웨이브 순→kills, 빠른 매칭 `/ws/quick`→Lobby DO(4명 즉시/2명 이상 10초→`/claim`→자동 시작, 상한 120/시), 상대 필드 보기 `watch`(1초 적 스트림 `en`, `#view-bar`), 대기실 채팅 `#mp-chat`·💬, `wrangler.jsonc` LOBBY 바인딩+migration v2, 프레임 4,096B, v79. `541cc18`/`ff2236f` 문서.
- 사용자 안내(본문): 실서버는 샌드박스에서 못 붙으므로 폰 2대 확인 필요; 배포 순서 main 머지 → `dicekeep-net` 빌드(migration v2, `/health`→`protocol:3`) → 정적 사이트(v79); 옛 탭은 `version` 거절 → 새로고침.
- 검증: Playwright 5시나리오, `cd net && npm test` 68/68, ws-smoke 61/61, 3브라우저 시나리오 전부 통과.

**PR #27** https://github.com/GNchoo/dicekeep-art/pull/27 "스토어 출시 배치: 기기 호환 레이아웃 · Capacitor 앱(Android/iOS) · BGM·설정 · 획득 연출 아트 · HUD 정리 · 생성 프롬프트" — 16:53Z 생성, 17:05Z 병합, 커밋 4개.
- `390cb4b` 서버 `originAllowed` 에 `capacitor://`·`ionic://localhost`, `net.js` 네이티브에서 `window.DK_NET_URL` 우선, `net/test/http.test.js`.
- `483f200` 안전영역 `--sa-t/r/b/l` 통일, `--mini-w`, `narrow`/`xnarrow`(iPhone SE 가로), 폴더블 펼침 레터박스→세로 아레나 폭 확장, 세로 h 상한 2000, `--kb` 키보드 가드, `user-scalable=no`·`100dvh`, 글꼴 자체 호스팅(`fonts/`), 오디오 버스(MASTER/SFX/MUSIC)·`SAVE.audio`·⚙ 설정 모달·첫 제스처 언락·wakeLock, `music.js` 합성 BGM 3트랙(로비 84BPM·전투 128·보스 150) + `audio/bgm-*.ogg|mp3` 자동 교체, `acquireFx` 아트 경로, HUD 폴리시(정보 바·아이콘 슬롯·`body.ui-art` 9-slice 게이트), `DKAPP.back()`, 훅 `DKend/DKlobby/DKacquire/DKsync`, v80.
- `f5c1b52` Capacitor 7 앱 `com.fallman.dicekeep`(주사위 성채), `tools/build-www.mjs`(허용 목록, `www/` ≈118MB, `--optimize`), `copy-fonts.mjs`, `app.js`, `resources/` 자리표시 아이콘·스플래시, `android/`(몰입 모드·`fullUser`·서명 설정)·`ios/`(SPM), `privacy.html`, `STORE.md`.
- `ea56852` `ART-PROMPTS §7`(앱 아이콘·적응형·스플래시·로고·피처 그래픽·9-slice 프레임/버튼·아이콘 23종·VFX 7장·스크린샷 가이드), `GROK-BRIEF §G`, GAME-SPEC §6.6 앱, README 앱 빌드.
- 사용자 역할(본문): 생성 프롬프트는 사용자가 Grok 으로 생성; 앱은 사용자 PC 에서 README 절차대로 AAB 빌드; 실기기 항목은 STORE.md 체크리스트. 환경에 Android SDK/Xcode 가 없어 `cap sync` 까지만.
- 검증: `npm test` 71/71, `devices-test.js` 16기기×2방향×11화면 대표 기기 실패 0, `www/` 자가완결(외부 요청 0), `wrangler deploy --dry-run`.

**아트 납품(main)**: `8c0e91b` 17:16Z GNchoo "Add GROK-BRIEF §G launch UI pack: icons, splash, HUD frames, VFX" — **현재 main HEAD.**

**PR #28** https://github.com/GNchoo/dicekeep-art/pull/28 "출시 그림 적용 + 되돌림 · 관전 뷰·판매·≡ 메뉴 · 굴림 중앙 표시 · 세로 입구 12시 · 산 위 주사위 성 타이틀 · 로비 허브 개편" — 17:38Z 생성, **draft·open**, base `8c0e91b`. 본문: "`8c0e91b` 로 납품된 §G 그림 묶음을 붙인 뒤, 확인 피드백을 받아 여덟 차례 다듬었습니다."(실제 커밋은 9차까지). 2026-09-06 분:
- 1차 `e486572` 9-slice 프레임·버튼 `fill`·글자색, 로고 엠블럼(타이틀·로비), 마젠타 키잉(logo·acquire-column), 색종이 축소, `store/`·`ui/icons-sheet.png` 웹·www 제외, 네이티브 아이콘·스플래시 재생성.
- 2차 `da71e77` (11분 뒤) **9-slice 프레임·버튼·칩 바 시안 철회** → 기존 CSS 버튼·칩, 로고·아이콘·주사위 소켓·VFX 만 유지. 확인 피드백의 결과로 보임.
- 3차 `e11233b` 관전 뷰 시각 전용 시뮬(COSMETIC, `updateVisuals()` 분리)·카드 깨짐 수정, `#held-sell` 손패 바로 판매(★7 미만)·'보류' 표기, ≡ → 메뉴창(계속·일시정지·볼륨·게임 방법·포기; 싱글만 `S.paused`), 보스 시간 4Hz, 로비 가로형 두 열.
- 4차 `61dd742` 뽑기·굴림 중 아레나 중앙 큰 주사위 `drawCenterRoll`, 슬롯 받침 `ui/slot-socket.png` 사용 중단(보류 시 주사위가 묻힘), 보류 배지, 로비·메뉴 아이콘 `.bi` 슬롯, 안내 말풍선을 `hudTopPx` 아래로, v82.
- 5차 `5b78a2d` `.big-btn/.back-btn` 을 HUD 버튼과 같은 벌(Do Hyeon·그라데이션 토큰; 그동안 `font-family: inherit`), `tools/clean-icons.mjs` 마젠타 잔여물 제거·64×64 가운데 재굽기, 세로 아레나 입구 (cx,−40)→위 변 가운데(12시), GAME-SPEC §3, v83.
- 6차 `af066ba` 타이틀/로딩을 키아트 전면 + 제목·진행 막대·시작 버튼만(로고 엠블럼 미사용), 버튼 팔레트 돌(`--btn-stone`)+금(`.primary`) 두 가지(초록 `.alt`·자주 `.inf` 채움 제거), 로비 문구 축소, `fitTopRow` 실측, v84. `595a122` 보스 남은 시간을 칩 대신 캔버스 말풍선(칩이 길어져 미니 버튼이 둘째 줄로 밀림), `HUD_TICK` 제거, 로딩 첫 프레임부터 키아트, 금박 제목, v85.
- 7차 `f480777` 타이틀·로비 배경 '산 위 주사위 성' 키아트(`ui/title-keyart-p.jpg` 세로 1400×1781 돌 제목 포함, `-l.jpg` 가로 1600×1252; Grok 앱 미리보기 그림에서 잘라냄), 예전 달·수정 성 `ui/title-keyart.jpg` 삭제, 스테이지 선택 `.inf-banner` 제거, 판매 버튼 넘침 수정, v86. `39d8fad` 검증 반영: 제목 "심사에서 고른 '묵직한 금 부조'", 그라데이션 뒤 `text-shadow` 제거(투명 글자 뒤로 비쳐 아랫부분이 검게 탁함), `span.wm`/`h1` 분리(WebKit filter 가 `background-clip:text` 를 깸), 죽은 CSS 규칙 2개, 키아트를 `SRCS` 에서 제외, v87.

### 2026-09-07 (4 커밋 + 자식 세션 1 커밋 — 로비 허브·AI 그림 파이프라인·e2e 이관)
- 8차 `ebfc56c` (01:22Z) 로비 허브(싱글플레이·멀티플레이·상점 + 젬, 같은 상자 안에서 갈래 펼침, ←·Esc·앱 뒤로가기 = 허브, `gotoLobby('single'|'multi'|'hub')`, 가로 두 열 grid 제거), `<link rel=preload media=…>` 로 키아트를 스크립트보다 먼저 받고 그림이 뜬 뒤(최대 4초) 에셋 로딩, 세로 키아트 중앙 정렬·하늘 520px·하단 어둠 페이드(1400×2131), 가로 키아트 `auto 100%` + `-l-blur` 밑바탕, 제목 윤곽 `-webkit-text-stroke`→사방 1px drop-shadow, 배속 버튼 x1·x2·x3 글자 숨김·아이콘 23장 프리로드, 훅 `DKlobbyView(view)`, v88. `2a5f137` (02:10Z) 검증 반영("적대적 diff 리뷰"): 가로 폰 허브 한 줄(`:not(.hub-btns)`), ←·⚙ 34px, 가로 키아트 2400×1000 120px 페더 합성(열 밝기 차 23/255→1/255), 코드 태그 전부 v88→v89 상향 + 키아트 URL `?v=89`(index.html preload 와 game.js KEYART 동일), preload 경계 `(min-aspect-ratio: 3001/4000)`, 앱은 키아트 대기 1.5초.
- 9차 `b42cd8a` (02:52Z) **AI 그림 생성 파이프라인(OpenAI 이미지 API)**: `tools/img-gen.mjs`(`OPENAI_API_KEY` 환경변수만, `gpt-image-*` 최신 자동 선택, refs 있으면 `/v1/images/edits`, 429/5xx 재시도, `--dry/--only`), 잡 파일 `tools/jobs/keyart.json`(세로 1024×1536·가로 1536×1024, 글자 없음)·`inf-w01-05.json`·`inf-w01-05-walk.json`, `tools/keyart-build.mjs`(스크래치의 sharp 로직을 저장소로), `tools/sheet-check.mjs`(칸별 바운딩박스·발 위치 편차 8%), `content.js` 1단계 테마 '폐허의 잡졸'(역병쥐·해골 잡졸·묘지 오우거·까마귀 정찰병·고블린 창병), `gen/` gitignore·assetsignore. `d9373a2` (03:01Z) 브라우저 검증 스크립트를 `tools/e2e` 로 이동 — "다음 세션에서 재사용", 회귀 19종. **잃어버린 세션의 마지막 커밋.**
- 03:03Z 자식 세션 `session_01UHYuvb8XCJqrZ8tjcNw1hV` 시작 → `6fc1c25` "OpenAI 이미지 API 로 키아트(세로·가로, CSS 금박 제목 공통)·인피니티 1~5 몬스터(정지컷+걷기 시트) 생성·적용": 키아트 세로 `portrait-1`·가로 `landscape-2` → `ui/title-keyart-p|l|l-blur.jpg` `?v=90`, 세로도 CSS 금박 제목으로 통일(7차의 '그림 속 돌 제목' 되돌림), 몬스터 1~5 정지컷(w001-2·w002-1·w003-2·w004-1·w005-1)·걷기 시트(여백 지시 후 재생성, w001-2·w002-1·w003-2·w004-2·w005-1), `png-pack` 256색 팔레트 19MB→2.1MB, `INF_ART_READY=[1..5]`, `INFINITY.artSize`(S 42·M 50·L 58), `tools/e2e/inf-art-check.js`, 비용 34장 약 3달러. PR #28 갱신 04:49Z, Cloudflare 배포 성공 04:48Z.

## 3. 확정된 설계 결정과 규칙

아래는 PR 본문의 결정, GAME-SPEC §7 "하지 말 것", 각 문서의 규칙을 주제별로 합친 것이다. "되돌린 시도" 는 다시 하지 말아야 할 것.

### 3.1 인피니티(무한 투기장)
- 인피니티는 해금 조건 없음 — `infinityUnlocked()` 항상 true, 스테이지 진행과 완전 분리(#25 `ac1acf9`). `?inf=1` 은 하위호환 무의미 플래그(GAME-SPEC §2).
- 풀파워: `unlockedFaces()` 가 인피니티에서 `[1..6]`, 석단 15, 레인 전부 1웨이브부터(#13). 스테이지는 젬으로 하나씩 해금하며 성장, 인피니티는 이미 전부 해금된 상태로 얼마나 버티느냐(#13 방향).
- 트랙은 하나(`INFINITY.tier.lanes=['ground']`, #14). 인피니티에서는 어떤 적도 동선을 무시하지 못한다 — 공중은 떠서 그려질 뿐, 모든 타워가 때림(`canAir: true` 전부, #19 `d87187f`).
- 시작·도착 없음: 적은 (−40,300)에서 입구 길로 들어와 트랙을 영원히 돈다(`loopAt`, `e.laps`). 목숨은 필드 한계선 `fieldCap=200` 초과로만 잃고(`capDmg`=1), 사라지는 적이 보스면 즉시 종료(#20). 웨이브 완료 = 스폰 큐 소진 → 6초 뒤 자동 다음. 스테이지 모드의 누수·전멸 클리어는 그대로.
- 보스 웨이브는 보스를 잡을 때까지 다음 웨이브를 막는다(#23 `ec850f3`; 막지 않으면 보스가 잡몹에 묻혀 제한시간으로 죽음). 보스 제한 320초, 0 이면 목숨과 무관하게 종료. 보스 주기는 `w%10` 이 아니라 로스터 순번 `isBossWave(w)`/`bossOrdinal(w)`(#25 `9ec2e35`; `w/10` 인덱스는 웨이브 111에서 `boss.base` 참조 오류).
- 뽑기 = 즉시 타워: 기본 40G 주사위 없음(`canRoll` false), 뽑기 160G 고정, 주머니·보관 체크박스·굴리기/도박 팝오버 없음(#25 `b4e7ee8`). 손이 차거나 굴리는 중이면 `#roll-btn` 비활성(`배치 후 가능`), 보상 대기열은 `pumpQueue()` 가 손이 비는 대로 굴림. `canPlaceAnywhere()` 로 빈 칸도 합체 여지도 없으면 `석단이 가득 참` 으로 잠그고 큐 보류(#25 `0f61db4`).
- 굴림 게이트는 `canStartRoll()` 하나. `finishSlot` 은 손이 차 있으면 절대 덮어쓰지 않음('완성 대기'). 큐는 굴림이 실제 시작됐을 때만 소비(#26 `641de0b`).
- 주사위 포커스 `S.dieFocus`: 손에 든 주사위는 배치 모드, 슬롯 탭으로 해제 → 타워 선택·판매·확률강화 가능. 캔버스 클릭을 `if (S.heldDie) { tryPlace(idx); return; }` 로 삼키지 말 것(#25 `0f61db4`).
- 갓챠 등급·확률·경제는 메운디 원작 그대로(9등급 표, #20). **라운드 락은 넣지 않는다** — 원작 4.04 의 숨겨진 조작이었으므로(#21). 보스 보상은 고정 스케줄(#21), 보스 n마리 웨이브는 보스마다 주사위 전부 + 골드 1/n(#26).
- 확률강화(`INFINITY.enhance`): 강화/유지/소멸, 합체 레벨 유지, 소멸 시 타워 삭제, 20★ 비활성. 7★ 이상 판매 불가. 7★+ 히든 타워는 6눈 파워업을 따름, 합체 상한 Lv3 그대로. 파워업은 골드(`150+150·Lv`, Lv10), 웨이브 SP 는 없음(#23).
- 인피니티 시스템(상성·방어력·특전·확률강화·판매 제한·갓챠)은 전부 `S.mode === 'infinity'` 분기 안. 스테이지 모드는 40G 굴리기와 판매만, 변경 없음(#21, GAME-SPEC §3).
- 두 갈래: 도전 `clear`(101 완주 = 클리어, 멀티가 쓰는 쪽, 최종 관문 `lateFrom 90`·`lateExp 1.08`) / 무한 `endless`(싱글, 2주기). 로비(싱글 갈래)에서만 진입 — 스테이지 선택의 인피니티 배너는 제거(#28 `f480777`).
- 로스터: 웨이브 하나 = 몬스터 한 종, 보스 웨이브 보스만, 정예(5배수) 같은 종 3마리 ×3, 주기 내 중복 없음, 손질은 `ROSTER_OVERRIDES[w]`(#22). 겉보기 강함 `look` 순으로 배정, 걷기 시트 사용 중엔 `faceLeft` 무시(#26 `ec5e443`).
- HP 곡선은 봇으로 별도 보정(§9): 현재 지수 1.08, 무전략 봇 목표 50~70(최근 59·89·59·49). 방어력은 w30부터 /6, 고방어 ×4. 후반 벽은 속도 램프·마릿수 상한 — 더 길게 가려면 `INFINITY.wave()` 지수나 `speedMult` 시작 웨이브부터 조정.
- 아레나: 배경은 바닥 그림만(없으면 코드 바닥), 트랙·석단·포탈·크리스탈은 코드(#5). 장식은 연석에서 ≥100px 떨어진 가장자리에만, ≤80px(#18 — 타워로 오인). 아레나 조각 9장은 `casual/tiles/arena/`, 각 조각 코드 폴백(#16). 캔버스는 화면 비율로 굽고(트랙·보드 치수 고정, 중심만 이동) 레터박스 없음; 비율 2%·inset 10px 이상 어긋나면 `relayoutArena(key, force)` — 타워는 석단 번호, 적은 진행률 보존(#25 `1c67972`). 세로(`availW/availH < 0.95`)는 `cInfP`, 회전은 `remapSpot()` 격자 90° 회전(#25 `6bb2b98`). 사거리 규칙 '중앙 석단이 트랙 전체를 때린다' 는 두 아레나 모두 성립(가로 284 ≤ 335, 세로 426 ≤ 455). 세로 아레나 입구는 위 변 가운데(12시)(#28 `5b78a2d`).
- 첫 런 코치는 링·말풍선만, `pointer-events: none`, 실제 행동으로만 진행. 도움말 자동 오픈 플래그는 카드를 닫을 때 저장(#25 `ac1acf9`).
- **되돌린 시도(다시 하지 말 것)**: 나선 1.5바퀴 아레나(#5) → 보드+트랙(#13); 지름길·V자 하늘길·땅굴 4레인(#13) → 단일 트랙(#14); 왼쪽 진입·2.5바퀴·오른쪽 퇴장 + 보스 누수 종료(#19) → 무한 순환 + 필드 한계선(#20); 라운드 잠금(#20) → 제거(#21); 상자 가격 상승 `250×1.10^n`(#15) → 160G 고정(#20); 주머니·보관 체크박스·굴리기/도박 팝오버·승급 도박·교환 도박(#23, #24) → 즉시 배치 + 확률강화(#25); 웨이브 SP 강화(#4) → 골드 파워업(#23); 50 스테이지 클리어 해금(#4) → 항상 개방(#25); 세로 아레나 입구 캔버스 밖(cx,−40)(#25) → 12시(#28).

### 3.2 멀티(함께하기)
- 서버는 방·시드·중계·순위·빠른 매칭만 맡고, 시뮬레이션(웨이브·배속 포함)은 각 클라이언트가 자기 보드만 자기 속도로 돌린다. 아무도 누구를 기다리지 않고 상호 간섭 없음(v3, 2026-09-06). 시작 뒤 서버에 웨이브 시계는 없다(GAME-SPEC §6.5, net/README).
- 멀티는 도전(`clear`) 모드 사용. 순위: cleared 는 `clearAt` 오름차순 → dead/lost/left 는 `deathWave` 내림차순 → kills → joinedAt, 공동 없음. 멀티 사망 시 젬·기록을 즉시 저장(`settleInfRun`).
- 인증은 URL 이 아니라 첫 프레임 `hello`(`pid`·`key` 는 탭 단위 sessionStorage). 거절은 항상 accept 뒤 `err`+close(4404·4409·4410·4426·4403·4429·4400·4001·4000). 방 버전 `ver` = `index.html` `?v=` 가 다르면 `version` 거절 → 웹 배포와 앱 업데이트는 같이(STORE §버전 규칙).
- 프로토콜: JSON 1개 = 프레임 1개, 서버→클라는 `at` 포함, `sum` 은 벽시계 2초(`en` 은 보는 사람에게만 1초), 엄격 스키마(`en` 은 `[0-9;,]`), 프레임 4,096B, 소켓 20/s, chat 1/s·log 2/s. net.js 는 서버 `t` 를 허용목록으로만 같은 이름 이벤트로 발화, 내부는 `net:` 접두.
- 상대 카드 렌더는 `try/catch` 격리, `sum` 핸들러·0.5초 틱에서만. 상대 필드 보기 중에도 내 시뮬은 그대로, 뷰 중 조작 무시.
- DO 가 있는 Worker 는 브랜치 프리뷰가 생기지 않으므로 서버는 별도 Worker `dicekeep-net`(루트 `net/`), 비프로덕션 빌드 끔. **루트 `wrangler.jsonc` 에 `main`/Durable Object 를 넣지 말 것. 저장소 루트에 `package.json` 을 만들지 말 것**(정적 Worker 빌드 감지가 바뀜 — Node 도구는 `net/package.json` 에만)(GAME-SPEC §7). **주의**: PR #27 `f5c1b52` 가 루트 `package.json`(Capacitor)을 추가했고 GAME-SPEC §6 파일 트리에도 실려 있다 — §7 의 이 문구와 충돌하며, 어느 쪽이 최종인지 기록 없음. `wrangler deploy --dry-run` 에서 `android/ios/www/tools/resources/node_modules` 제외는 확인됨(#27).
- `content.js` 의 웨이브 계수(`INFINITY.wave` count·gap·bosses)나 `bossTimeLimit`·`clearWave` 를 바꾸면 `net/test/timing.test.js` 패리티 테스트를 돌릴 것. 멀티 시뮬을 `S.net` 가드 없이 싱글 경로에 섞지 말 것. 프로토콜을 바꾸는 배포는 `dicekeep-net` 을 먼저.
- 커스텀 도메인만 `net/wrangler.jsonc` `vars.ALLOWED_ORIGINS` 에; workers.dev·localhost·`capacitor://`·`ionic://localhost` 는 자동 허용.
- **되돌린 시도**: 서버 없는 P2P(WebRTC DataChannel + 호스트 선출, `b5e9a91`) — SDP 교환이 없어 채널이 열리지 않아 플레이 불가(`4195e7a` 정정) → WebSocket 전용 DKNET v2 + Durable Object(`89bb22f`); v2 '각자 보드·같은 웨이브·서버 시계·보스 홀드'(M1) → v3 '각자 속도'(#26).

### 3.3 맵 / 아트
- 배경 그림에 길·석단 좌표를 맞추는 방식(`MAP_LAYOUTS`, `MAP_LAYOUTS_HARD`, 좌표 에디터)은 폐기 — 되돌아가지 말 것(GAME-SPEC §7, #7). 코드가 16×9 격자 ASCII 템플릿으로 맵을 설계하고 테마 타일을 입힌다. 템플릿 규칙: 흙길은 4방향 한 줄(옆 줄과 한 칸 띄움), E 위 칸 비움, 두 번째 길(`=`)은 흙길 한 칸에만 닿음. 타워를 길 한가운데 두지 말 것.
- 도로를 타일(직선·코너·T·십자)로 받지 않는다 — 생성 모델이 폭·진입 위치를 못 지킴(#8). 도로·물은 이음새 없는 질감 1장씩(`road.png` 160px, `water.png` 256px), 바닥은 1280×720 빈 땅, 오브젝트는 연회색 #C8C8C8 배경 단품(로더가 키잉·크롭). 바닥·도로·물 질감은 raw 로드.
- 맵 설계 지침(GAME-SPEC §4, 코드 강제): 석단은 길 커버리지 점수로, 길에 안 붙은 칸 제외, 석단끼리 체비쇼프 2 이상, 길은 자주 꺾어 티어 5 기준 후보 15개 이상, 소품은 픽셀 단위 금지 마스크 + 포아송 디스크, HUD 가 가리는 곳(맨 윗줄·둘째 줄 왼쪽 7칸·포탈/성 주변)에 석단 없음, `o` 강제·`x` 금지는 보통 안 씀.
- 타워 공격 시트 `tN-attack-2x2.png` 는 로드·사용하지 않는다(스킨과 디자인 불일치, 256px 원본 크기 문제, #6). 공격 모션은 스킨 스프라이트 + 반동/발광만. 파일은 보관.
- 아트 우선 규칙(있으면 그림, 없으면 코드 폴백): 타일 조각, 아레나 조각, `poly-dN.png`, `casual/towers/star-NN.png`(`buildStarSprite` 폴백), `audio/bgm-*.ogg|mp3`(합성 BGM 대체), `vfx/acquire-*.png`, `ui/frame-*.png`·`icon-*.png`(`body.ui-art`), `casual/enemies/inf/wNNN.png`(`INF_ART_READY` 에 적어야 적용). 부분 납품 가능.
- 걷기 시트: 2열 2행 좌상→우상→좌하→우하, 모든 칸 같은 크기·발밑 위치, `<id>-walk-2x2.png`, 오른쪽 향. 파일 없으면 정지컷 폴백. 키를 연결만 하고 파일을 빼먹은 채 "완료" 표시하지 말 것(§7).
- 로드하지 않지만 삭제하지 말 것: `towers/archer.png` 등 옛 5종, `enemies/*` 구 정지컷, `props/crystal.png`(§6). 옛 배경 `casual/maps/map-NN-*.jpg` 는 `.assetsignore` 로 배포 제외, 지워도 됨(§4).
- 인피니티 몬스터 그림체는 2026-09-07 부터 다크 판타지 반실사(키아트 톤), 생성은 OpenAI 이미지 API(`gpt-image-2`). 1단계 테마 '폐허의 잡졸'. `INFINITY.artSize`(S 42·M 50·L 58) 고정 높이(반실사는 실루엣이 가늘어 작게 읽힘). 키아트는 글자 없이 생성하고 세로·가로 모두 CSS 금박 제목(`6fc1c25`; 7차의 '그림 속 돌 제목' 되돌림).
- 출시 UI 아트(§7/§G)는 투명 PNG(회색 키잉 아님), 글자 절대 금지(한글은 CSS 로 얹음), 9-slice 는 모서리 안에 장식 전부, 파일명·크기 표 그대로. 스토어 스크린샷은 실제 플레이 캡처만.
- 스타일: Kingdom Rush + Random Dice, 캐주얼 치비, 두꺼운 외곽선, 아이소 3/4, 인게임 타워 박스 핏 70×96(스테이지·타일 아트 기준; 인피니티 몬스터는 위 반실사 방침이 최신).
- **되돌린 시도**: 그림 좌표 맞춤(#2·#3) → 그리드(#7); 도로 오토타일 4종(#7) → 질감(#8); 칸 단위 소품 금지(#9) → 픽셀 마스크 포아송(#11); 플레이스홀더 아트 `36f283f` → 납품 Grok 아트; 9-slice 프레임·버튼·칩 바 시안(`e486572`) → 철회(`da71e77`); 로고 엠블럼 타이틀·로비(`e486572`) → 미사용(`af066ba`); 달·수정 성 키아트 `ui/title-keyart.jpg` → 삭제(`f480777`); 세로 키아트 거울·블러 → 하늘/어둠 페이드(`ebfc56c`); 슬롯 받침 `ui/slot-socket.png` → 사용 중단(`61dd742`).

### 3.4 UI / HUD / 레이아웃
- 화면 배치는 `fitStage()` 가 정한다(스테이지 크기는 뷰포트 폭이 아니라 세로 여유가 결정 → 미디어쿼리만으로 불가). `#wrap` 클래스 `over`(인피니티+가로, HUD 한 줄 겹침)/`bleed`(인피니티+세로, 두 줄)/`side`(스테이지+가로 폰)/`stacked`, `narrow`/`xnarrow`. 칩·미니버튼 축소는 스테이지 폭 기준(`#stage.small` <680, `.tiny` <520), `--mini-w`. 미니 버튼 둘째 줄 판정은 `fitTopRow` 실측(#28).
- 메뉴 화면(타이틀·로비·스테이지 선택·상점)은 16:9 `#stage` 안이 아니라 `position: fixed; inset: 0` + `--keyart-bg`(`2ae4e91`).
- `#info-panel` 은 HUD 를 덮는 절대 위치 오버레이 — 인라인 팝오버가 `flex-wrap` 을 접어 `fitStage()` 가 스테이지를 줄이던 버그 방지. HUD 높이는 `#tower-panel` 의 min-height/max-height 고정(`b4e7ee8`)과 `#tower-panel > *` max-height 84px(`#info-panel` 은 `:not` 예외, `0f61db4`)로 선택 여부와 무관하게 불변(#24, #25).
- 로비 = 허브(`#lobby-hub` 싱글플레이·멀티플레이·상점 + 젬) + 갈래(`#lobby-single`/`#lobby-multi`), `lobbyShow(view)`, `gotoLobby()`; ←·Esc·앱 뒤로가기는 갈래→허브, 돌아올 때는 온 곳의 갈래(#28 `ebfc56c`).
- 타이틀/로딩: 키아트 전면 + 제목·진행 막대·시작 버튼만. `<link rel=preload media=…>` 로 키아트를 먼저 받고 그림이 뜬 뒤 에셋 로딩(웹 최대 4초, 앱 1.5초). 키아트는 `SRCS` 에서 제외. 키아트 URL 캐시버스트(`?v=89`→`?v=90`)는 `index.html` preload 와 `game.js` KEYART 가 동일해야 함.
- 제목: 금 부조(그라데이션 `span.wm` + 그림자 필터 `h1` 분리 — WebKit 에서 filter 가 `background-clip:text` 를 깸), 그라데이션 뒤 `text-shadow` 금지, 윤곽은 `-webkit-text-stroke` 대신 사방 1px drop-shadow(도현체 획 겹침).
- 버튼 팔레트: 어두운 돌 `--btn-stone`+금테 기본, 주 동선만 `.primary` 금. 로비·메뉴 버튼은 HUD 버튼과 같은 벌(Do Hyeon). 보스 남은 시간은 칩이 아니라 캔버스 말풍선(칩이 길어지면 미니 버튼이 둘째 줄로 밀림).
- ≡ 버튼은 바로 포기하지 않고 메뉴창(계속·일시정지·볼륨·게임 방법·포기); 일시정지는 싱글만, 멀티는 비활성(#28 `e11233b`).
- 안전영역 `--sa-t/r/b/l` 을 칩·미니버튼·로그·뷰 바·관전·카드·오버레이·메뉴·도움말·설정·`#wrap` 전부에; `#wrap.bleed` 만 패딩 0. 채팅 키보드(`visualViewport.height < innerHeight×0.8`)면 아레나를 다시 굽지 않고 `--kb` 만.
- 터치 판정은 `stageScale()`·`touchExtra()` 로 화면 기준(탭 24px, 드래그 50px, 던지기 `330×stageScale()`).
- 조작은 두 갈래(필드 플릭 / 버튼·R) — 합치지 말 것. 버튼 굴림(SLOT)과 필드 굴림(DIE) 합치지 말 것. 3D `persp = 10` 낮추지 말 것(§7).
- 요청 없는 BGM 넣지 말 것(§7). 현재 BGM 은 `483f200`(출시 배치)에서 합성 3트랙 + 파일 대체 방식으로 추가돼 있고 설정 모달로 끌 수 있다 — 사용자 요청 여부는 기록에 남아 있지 않음(PR #27 코멘트·리뷰 0).
- **되돌린 시도**: 로비 가로형 두 열 grid(`e11233b`) → 허브(`ebfc56c`); 로비 인피니티 두 버튼 맨 위 + 구분선(`ac1acf9`) → 허브; 보스 시간 칩 표시 + `HUD_TICK`(`e11233b`) → 말풍선(`595a122`); tiny 일괄 둘째 줄 → `fitTopRow` 실측.

### 3.5 앱 / 배포
- 정적 Worker `dicekeep`: 루트 `wrangler.jsonc`(스크립트 없이 `assets.directory="./"`), `.assetsignore`(`.git`·`.github`·`.claude`·`node_modules`·`.wrangler`·`*.md`·`LICENSE`·`serve.py`·`start.bat`·설정·`net`·`app.js`·`package.json`·`package-lock.json`·`capacitor.config.json`·`tools/`·`resources/`·`www`·`android/`·`ios/`·`gen/`·`store/`·`ui/icons-sheet.png`·옛 배경 제외, 에디터 포함), `_headers`(HTML/JS/CSS 항상 재검증, 이미지 하루 캐시 — 같은 파일명으로 그림을 바꾸면 최대 하루 뒤 반영, 캐시버스트나 강력 새로고침). main push 시 자동 재배포, 다른 브랜치는 프리뷰.
- 멀티 서버 `dicekeep-net`: 같은 저장소 루트 `net`, 배포 명령 `npx wrangler deploy`, 비프로덕션 빌드 끔, migrations v1(Room)·v2(Lobby), `/health` → `{ok:true, protocol:3}`. **출처 불일치**: `README.md` 는 `protocol:2` 로 기재, `net/README.md`·`proto.js` 는 `PROTOCOL=3` — README 쪽이 오래된 것.
- 배포 순서(프로토콜 변경 시): main 머지 → `dicekeep-net` 빌드 → 정적 사이트. 재배포는 진행 중인 판의 소켓을 끊을 수 있음(재접속으로 흡수).
- 앱: Capacitor 7, `com.fallman.dicekeep`, `www/` 는 `tools/build-www.mjs` 허용 목록으로만(≈118MB), `app.js` 는 네이티브 전용 다리(`window.DK_NET_URL` 을 net.js 보다 먼저, `?net=`·저장값 우선), `android/app/src/main/assets/public`·`ios/App/App/public` 은 gitignore, `android/keystore.properties` 커밋 금지·서명 키 백업 2곳 이상. 글꼴 자체 호스팅(`fonts/`, Google Fonts 제거) — `www/` 외부 요청 0.
- 버전: `android/app/build.gradle` versionName = `index.html` `?v=` 와 동기(`?v=80`↔`1.0.0`), versionCode 는 업로드마다 +1, iOS `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` 동일.
- 캐시: 코드 고친 뒤 `index.html`·`editor.html` 의 `?v=N` 을 올린다. `file://` 로 열지 말 것(캔버스 tainted → 크로마키 실패, fetch 차단). `python serve.py` 또는 `start.bat`.
- OpenAI 키는 `OPENAI_API_KEY` 환경변수로만(파일·로그·커밋 금지), 프록시 환경은 `NODE_USE_ENV_PROXY=1`, `gen/` 미커밋.
- 무료 플랜 예산: 4인 40분 한 판 ≈300 GB-s → 하루 ≈40판, 초과 시 그날 멀티만 멈춤 → Workers Paid $5/월(판당 ≈$0.004).

### 3.6 파이프라인 / 검증 / 문서
- 이어서 작업할 때 읽는 순서: `GAME-SPEC.md` → `content.js` → `game.js` → `ART-PROMPTS.md` → `GROK-HANDOFF.md`(옛 브리프). 사람에게 묻기 전에 스펙·코드를 먼저 읽는다. 대화는 한국어, 이미지 프롬프트는 영어. (읽는 순서·언어: GAME-SPEC §1; '묻기 전에 먼저 읽기': GROK-HANDOFF.md)
- 밸런스 정의는 `content.js` `TIERS`/`tierOf`/`stages[n-1]`/`INFINITY` 에 두고 `game.js` 는 그대로 읽는다(재계산 금지). 밸런스 변경 뒤에는 봇(§9)으로 재보정하고 결과를 GAME-SPEC §9 에 기록해 왔다(봇은 도박·교환·상성 배치·상자를 하지 않는 하한 기준).
- 작업 후 브라우저(Playwright 헤드리스, `http://localhost:8137`)에서 직접 확인하고 커밋 본문에 검증 결과를 적는다 — 스크린샷 한 장으로 끝내지 말 것(GROK-HANDOFF.md). 회귀 스크립트는 `tools/e2e/`(빈 폴더에서 실행, `NODE_PATH=/opt/node22/lib/node_modules`).
- 스크린 검증 표기 관례: 커밋 제목 "검증 반영:" 은 별도 리뷰(적대적 diff 리뷰, 5 에이전트 등) 결과를 반영한 커밋.
- 걷기 시트 생성 뒤 `tools/sheet-check.mjs` 로 칸 편차 검사; 경고 '96% 넘게 채움' 은 곧바로 불량이 아니고 경계선 침범·발 위치 편차를 눈으로 고른다; 잡 파일에 여백 지시(칸의 70% 이하). 게임용 축소는 `png-pack.mjs --size=512`(정지컷)/`1024`(시트).
- 문서 갱신 관례: 기능 커밋마다 GAME-SPEC·README·ART-PROMPTS·GROK-BRIEF·ASSET-MANIFEST 중 해당 항목을 같이 고쳤다. 단 `ASSET-MANIFEST.md` 표는 2026-08-31 이후 갱신되지 않았고(헤더에 2026-09-02 추가분만 메모), GAME-SPEC §2 의 "현재 v48" 도 오래된 값이다(실제 캐시버스트 index.html v89, 키아트 v90, editor.html 은 v77).

## 4. 현재 상태 (2026-09-07 기준)

| 항목 | 상태 |
|---|---|
| main | `c1d50fe` 2026-09-07 06:41Z (PR #28 병합 커밋, 추경남 계정으로 복구 세션이 병합). 137 커밋. PR #28 까지 병합됨. 직전 `8c0e91b` 2026-09-06 17:16Z (GNchoo, §G 출시 UI 팩 납품) |
| 작업 브랜치 | `claude/next-tasks-planning-vun4oo` @ `6fc1c25` — main 에 전부 병합됨(0 ahead). 새 작업은 main 에서 새 브랜치를 파는 것을 권장 |
| PR #28 | https://github.com/GNchoo/dicekeep-art/pull/28 — **2026-09-07 06:41Z main 에 병합됨(`c1d50fe`)**, head `6fc1c25`, 커밋 14, 변경 파일 135, 2026-09-06 17:38Z 생성. 병합 전 복구 세션에서 `tools/e2e/inf-art-check.js`(웨이브 1~6) 로 새 그림 5종 적용을 확인 — 404 는 main 에도 없던 미납품 아트(별 타워 14·다면체 주사위 5·타일셋 66·BGM 4)뿐, 페이지 오류 0 |
| PR #28 내용 | 출시 그림 적용(`e486572`) + 9-slice 되돌림(`da71e77`); 관전 뷰 연출·손패 판매·≡ 메뉴(`e11233b`); 굴림 중앙 표시·보류 배지(`61dd742`); 버튼 통일·아이콘 정리·세로 입구 12시(`5b78a2d`); 타이틀 키아트 전면·돌+금 버튼(`af066ba`); 보스 말풍선·금박 제목(`595a122`); 산 위 주사위 성 키아트·배너 제거(`f480777`); 검증 반영(`39d8fad`); 로비 허브·프리로드 순서(`ebfc56c`); 검증 반영(`2a5f137`); AI 그림 파이프라인(`b42cd8a`); e2e 이관(`d9373a2`); 키아트·몬스터 1~5 생성 적용(`6fc1c25`) |
| 프리뷰 | 브랜치 https://claude-next-tasks-planning-vun4oo-dicekeep.cgn3731.workers.dev · 커밋 https://4b289a93-dicekeep.cgn3731.workers.dev · Cloudflare 배포 성공 `6fc1c255` 2026-09-07 04:48Z |
| 다른 열린 PR | #1(Cursor 환경 설정, `e636a71`, main 대비 1 ahead) · #3(Phase 2, base 가 Phase 1 브랜치; 커밋은 main 에 포함된 것으로 보임) |
| 캐시버스트 | `index.html` 코드 태그(`fonts.css`·`style.css`·`music.js`·`net.js`·`content.js`·`game.js`) `?v=89`(`2a5f137`), 키아트 URL `?v=90`(`6fc1c25`, preload 와 `game.js` KEYART 동일). `editor.html` 은 `?v=77` 로 뒤처져 있음. 브랜치 문서 §2 는 v48 로 오래됨 |
| 정적 배포 | `wrangler.jsonc`(assets-only), `.assetsignore`, `_headers`. 운영 https://dicekeep.cgn3731.workers.dev 는 main(=PR #27 까지) |
| 멀티 서버 | `net/` Worker `dicekeep-net`, 프로토콜 3, Room DO + Lobby DO(migration v2), `npm test` 71/71(#27 기준). 운영 `wss://dicekeep-net.cgn3731.workers.dev` — PR #26·#27 본문은 사용자가 대시보드에서 빌드하도록 안내; 실제 배포 여부·`/health` 응답은 기록 없음 |
| 앱 | Capacitor `com.fallman.dicekeep`, `android/`·`ios/` 커밋, `cap sync` 까지만(환경에 SDK/Xcode 없음), `resources/` 원본은 `8c0e91b`(§G 납품)로 교체되었고 `e486572` 가 그 원본으로 android/ios 네이티브 아이콘·스플래시를 재생성함(PR #27 시점엔 자리표시), 서명 키·스토어 등록 미진행, `STORE.md` 실기기 체크리스트 전부 미체크 |
| 인피니티 아트 | `INF_ART_READY=[1,2,3,4,5]` 만 새 그림(`casual/enemies/inf/w001~005.png` + 걷기 시트, 팔레트 PNG 2.1MB), 6~101 은 기존 그림 폴백. 잡 파일은 1~5 만(`tools/jobs/inf-w01-05*.json`). `ART-PROMPTS §6` 의 6~101 표·프롬프트는 옛 치비 설계 그대로 |
| 키아트 | `ui/title-keyart-p.jpg`·`-l.jpg`·`-l-blur.jpg`(OpenAI 생성, 글자 없음, CSS 금박 제목 공통) |
| §G 출시 UI 아트 | main `8c0e91b` 로 납품. 채택: `ui/icon-*.png` 23종(`clean-icons.mjs` 로 정리), 획득 VFX, 네이티브 아이콘·스플래시, 로고(`ui/logo.png` 는 웹에서 미사용·보류). 철회: 9-slice 프레임·버튼·칩 바, 슬롯 소켓 |
| 타일셋 | 평원 14/12 납품(`road.png` 대기 — 현재 `road-straight.png` 에서 잘라낸 질감 임시 사용), 나머지 5테마(forest·lake·darkforest·castle·hell) 60장 미납품 → 코드 폴백. 아레나 9조각 납품 완료(2026-09-03) |
| 갓챠 아트 | `casual/towers/star-07~20.png` 14장, `dice/poly-d*.png` 5장 미납품 → 코드 폴백(`buildStarSprite`, `drawPoly3D`). `ui/chest.png` 는 `8c0e91b` §G 팩으로 납품됨 |
| BGM | `music.js` 합성 3트랙 동작 중; `audio/bgm-lobby|battle|boss.ogg|mp3` 미납품(`MUSIC-PROMPTS.md`) |
| AI 그림 파이프라인 | `tools/img-gen.mjs`(OpenAI, `gpt-image-2-2026-04-21` 자동 선택, `input_fidelity` 거부 시 제거), `keyart-build.mjs`, `sheet-check.mjs`, `png-pack.mjs`, `clean-icons.mjs`, `build-www.mjs`, `copy-fonts.mjs`, `make-resources.mjs`. 비용 34장 ≈3 USD |
| e2e 스크립트 | `tools/e2e/`: `devices-test.js`, `menu-test.js`, `single-smoke.js`, `mp3-test.js`, `mp-resume-test.js`, `dice-loss-test.js`, `title-vp.js`, `title-vp-l.js`, `load-order.js`, `load-order2.js`, `hub-shot.js`, `hub-matrix.js`, `boss-shot.js`, `boss-matrix.js`, `art-visual.js`, `stage-sell-shot.js`, `polish-shot.js`, `entry-shot.js`, `lobby-land.js`, `inf-art-check.js`. 허용된 실패: `foldOpen l … letterbox 46 > 12` |
| 디버그 훅 (`game.js` 끝) | `DK`, `DKA`, `DKDIE`(`forceFinal`), `DKSLOT`, `DKthrow(vx,vy)`, `DKLANES()`, `DKstart(n)`, `DKstartInf(kind)`, `DKinf()`, `DKupgrade(f)`, `DKchest()`, `DKenhance()`, `DKqueue()`, `DKTD`, `DKhelp()`, `DKCONTENT`, `DKroll()`, `DKplace(idx)`, `DKspots()`, `DKSAVE`, `DKrange`, `DKdamage(e,dmg,src)`, `DKsync()`, `DKend()`, `DKlobby()`, `DKlobbyView(view)`, `DKacquire(face)`, `DKlog`, `DKlogs`, `DKchatOpen`, `DKtowerSpr`, `DKBGM.state()/current()`, `DKAPP.back()`, `DKNET.quick/watch/inQueue`, `DKAPP_NATIVE.ready()`, `DKAUTOSTART`, `DKINF_OPEN`, `DKMP`, `DKNETLOG`, `DKsafeArea` |
| 밸런스 | 스테이지: 티어4 1.85·티어5 2.10·지수 1.02, 보스 `1.1+0.015n`. 인피니티: HP 지수 1.08, 도전 최종 관문 `lateFrom 90`·`lateExp 1.08`, 무전략 봇 59·89·59·49, 몬테카를로 101 클리어 0.045%~0.42% |
| 문서 불일치(알려진 것) | README `/health protocol:2` vs net/README `protocol:3`; GAME-SPEC §2 캐시버스트 v48(실제 index.html v89 / 키아트 v90 / editor.html v77); GAME-SPEC §7 "루트 package.json 금지" vs 루트 `package.json` 존재(#27); ASSET-MANIFEST 표 2026-08-31 기준(90타일 → 실제 72); GROK-HANDOFF §지금 은 `MAP_LAYOUTS` 시대 서술(폐기됨, GAME-SPEC 우선); ART-PIPELINE 목표 카운트는 티어 시스템 시점(맵 경로 50맵 "완성" 은 이후 폐기된 방식); PR #28 본문 "여덟 차례" vs 실제 9차 |

## 5. 남은 작업 / 다음 작업

### 5.1 바로 다음 (PR #28 마무리) — 출처: PR #28, 자식 세션 요약, 커밋 노트
1. ~~PR #28 리뷰 → draft 해제 → main 병합~~ → 2026-09-07 06:41Z 완료(`c1d50fe`). `net/` 변경이 없어 `dicekeep-net` 재배포는 불필요. 남은 것: 운영 https://dicekeep.cgn3731.workers.dev 에서 키아트 `?v=90`·코드 `?v=89`(`editor.html` 은 v77) 반영 확인, 강력 새로고침.
2. `tools/e2e` 회귀 19종 재실행(README 절차) — 특히 `inf-art-check.js`(웨이브 1~6), `title-vp*.js`, `load-order*.js`, `hub-matrix.js`, `devices-test.js --only=iphoneSE,galaxyS26,foldOpen`.
3. Fold 펼침 가로 레터박스 4건은 허용된 채 남아 있음(PR #28) — 그대로 둘지 결정.

### 5.2 GAME-SPEC §8 (우선순위 순서 유지, 완료 항목은 취소선 의미) — 출처: GAME-SPEC §8
1. ~~하드 배경~~ → 완료(이후 그리드 맵으로 폐기).
2. ~~걷기 시트 13~36 + 보스 1~10~~ → 완료. 다음 배치는 `NEXT_WALK`/`BOSS_WALK_COUNT` + ART-PROMPTS §2.
3. ~~타워 스킨 b~e~~ → 완료.
4. ~~밸런스 봇 검증~~ → §9. **실제 손플레이로 티어 5 재확인**(주사위 운 편차가 커서 같은 스테이지 0~15).
5. ~~물 위 석단~~ → 해결.
6. ~~적 25~36 걷기 연결~~ → 완료. 37~ 은 `NEXT_WALK` 추가 + ART-PROMPTS §2.
7. 디버그 훅(`DKroll`, `DKplace`, `DKspots`, `DKSAVE`) — 자동 플레이 봇용(있음).
8. **인피니티 아레나 바닥 생성**(ART-PROMPTS §5, 길·석단 없는 바닥만) → 파일만 넣으면 끝. 도로 화풍이 아쉬우면 `drawRoad()` 교체.
9. **인피니티 밸런스 손플레이 확인**(봇 목표 50~70, 현재 중앙값 59).
10. ~~멀티 M1~~ · ~~M2~~ → 완료(v3).
11. **출시 배치(2026-09-06)** → 완료. **남은 것**: Grok 그림 납품(아이콘·스플래시·프레임·아이콘 23·VFX, ART-PROMPTS §7 — 이 중 상당수는 `8c0e91b` 로 납품되어 PR #28 에서 적용/철회됨; 프레임·버튼·칩 바는 철회) · BGM 파일(MUSIC-PROMPTS) · 실기기 확인(키보드·뒤로가기·펀치홀) · 서명키·스토어 등록 · 채팅 신고/차단(정책 요구 시).
12. **멀티 M3**: 새로고침 뒤 보드 복구(sessionStorage 스냅샷) · `SAVE.mp` 로비 표시 · 관전 중 상대 보드 확대 · 정확한 6초 막간(`INFINITY.spawnEnd` 표) · 예산 실측 후 `SUM_INTERVAL` 조정 · DO 위치 힌트.

### 5.3 로드맵 M3 "아직 없는 것" — 출처: GAME-SPEC §6.6, §6.5, PR #25 open items, README
- prep '준비 완료' 투표 · 플레이어별 시드 운 스트림(`chest.draw/roll`·`enhanceTower` 에 rnd 주입) · `again` 재대전 · `?room=CODE` 초대 링크 · 새로고침 뒤 보드 복구(현재는 `dead{r:'reload'}` 후 관전 복귀만) · 안티치트(친구 방 전제).
- 배포 후 첫 판 뒤 대시보드에서 rows written · GB-s 실측해 `net/README.md` 예산 메모에 기록; 부족하면 `sumInterval` 4초 또는 유료 플랜.
- 운영 `dicekeep-net` 이 migration v2·protocol 3 으로 배포되었는지 `/health` 로 확인(기록 없음). `README.md` 의 `protocol:2` 표기 갱신.

### 5.4 아트·오디오 납품 대기 — 출처: GROK-BRIEF, ART-PROMPTS, MUSIC-PROMPTS, GAME-SPEC §5, PR open items
- 평원 `road.png` 1장 → 확인 후 forest·lake·darkforest·castle·hell 각 12장(GROK-BRIEF 납품 순서).
- 인피니티 갓챠: `dice/poly-d1/d4/d8/d12/d20.png` 5장 → `casual/towers/star-07~20.png` 14장(§E). `ui/chest.png` 는 §G 로 이미 납품.
- 인피니티 아레나 바닥 `casual/maps/map-inf-arena.jpg`(선택, §5).
- 인피니티 몬스터 6~101(+보스): 1단계 6~10 은 '폐허의 잡졸' 테마로 재설계 필요('미정'), 나머지 단계는 옛 치비 표라 새 그림체(다크 판타지 반실사, OpenAI)로 잡 파일 작성 → `img-gen` → 정지컷 선택 → 걷기 시트 → `sheet-check` → `png-pack` → `INF_ART_READY` 기입 → `inf-art-check.js`(README §AI 그림 생성 절차).
- BGM `audio/bgm-lobby|battle|boss.ogg|mp3` 6파일(Suno/Udio, 루프 검증, −14 LUFS) → `DKBGM.state().source === 'file'` 확인 → ASSET-MANIFEST 에 기록.
- §G 잔여: `ui/logo.png`(납품됨, 웹 미사용·보류), 스토어 스크린샷 6장 실제 캡처(`store/shot-portrait-1~4.png`, `store/shot-landscape-1~2.png`). `store/feature-graphic.png` 와 획득 VFX 7장(`vfx/acquire-burst-2x2`·`acquire-ring`·`acquire-ring-rainbow`·`acquire-column`·`chest-open-2x2`·`confetti-2x2`·`star-spark`)은 `8c0e91b` 로 납품됨 — README 아트 표의 "획득 연출 7장 예정" 문구가 오래됨.
- 적 걷기 시트 37~, 보스 걷기 11~(순차).
- `ASSET-MANIFEST.md` 표 갱신(2026-09-02 이후 추가분 전부 미반영).

### 5.5 앱 출시 절차 — 출처: STORE.md, README §앱 빌드
- Android: Node 22·Android Studio SDK 35 → `npm i` → `npm run fonts` → `npm run build:www -- --optimize` → `npx cap sync android` → `npx cap open android` → USB 실기기 Run + 체크리스트 → keytool 서명키(1회, 백업) → `keystore.properties` → `gradlew bundleRelease` → Play Console(내부 테스트 → 비공개 테스트 12명 이상 14일 → 프로덕션). versionName ↔ `?v=` 동기.
- iOS: Apple Developer 가입·번들 ID → Mac(`npx cap sync ios` → Xcode Archive → TestFlight) 또는 Codemagic/Appflow.
- 실기기 체크리스트(STORE.md, 전부 미체크): 스플래시→로비, 몰입 모드, 펀치홀·노치, 회전, 뒤로가기 체인, 채팅 키보드, 멀티 wss, 첫 터치 소리, 강제 종료 후 저장, 비행기 모드, 저사양 후반 프레임, ~120MB 설치.
- 웹 `?v=` 갱신 시 구버전 앱은 새 방에 못 들어감 → 같이 배포하거나 서버 버전 검사 완화 결정.

### 5.6 커밋 노트에서 이어지는 소소한 것 — 출처: 커밋 메시지
- `9ec2e35`: 몬테카를로 `scratchpad/sim.js` 는 저장소 밖(소실). 필요하면 `tools/e2e` 처럼 저장소로 옮기는 것을 고려(밸런스 봇 `bot2.js` 도 동일).
- `4bf1d49`/`0cf7cab`: ART-PROMPTS §1·§4 는 폐기 표시된 채 남아 있음 — 정리 대상.
- `2a5f137`: 초광폭 밑바탕 `-l-blur` 는 세 번째 겹으로 유지.
- `483f200`: `ui-art` 는 `ui/frame-*.png`·`icon-*.png` 가 있을 때만 켜짐 — 프레임을 철회했으므로 현재 아이콘만으로 켜지는지 확인(코드 기록 없음).
- GAME-SPEC §4: `buildLayout` 의 `map.airPts` 우선 분기는 남아 있으나 현재 아레나는 주지 않음.
- GAME-SPEC §7 vs 루트 `package.json`: 정적 Worker 빌드 감지에 영향이 없는지 확인하고 §7 문구를 갱신.

### 5.7 커밋 노트 인계 사항 (규칙으로 정착된 것 — 본문 위치)
- 아트 우선/폴백 규칙: `star-NN.png`(4195e7a)·`poly-dN.png`(604c3c0)·아레나 조각(89a0030)·타일(f61b3a6)·BGM 파일(483f200)·`ui-art` 게이트 → §3.3. `INF_ART_READY` 파이프라인(4b24940, b42cd8a) → §5.4·§6.6.
- 키아트 `?v=` 는 index.html preload 와 game.js KEYART 동일(2a5f137, 6fc1c25) → §3.4·§6.7. WebKit filter/background-clip 분리(39d8fad) → §3.4.
- 되돌린 것: 9-slice 시안(da71e77)·로고(af066ba)·슬롯 받침(61dd742)·달·수정 성 키아트(f480777)·P2P(b5e9a91→4195e7a→89bb22f) → §3.3·§3.2 '되돌린 시도'.
- 인피니티 규칙: 라운드 락 제거(3ddf005)·1.06 임시→1.08(0256b3b/84f9c08)·방어 곡선(7a72b2a)·보스 홀드(ec850f3)·7★+ 는 6눈 파워(78f5918)·로스터 순환(f6244ca)·`faceLeft`/`look`(ec5e443)·도전=멀티용(9ec2e35) → §3.1. 훅 `DKrange`(fbc4d33)·`DKend/DKlobby/DKacquire/DKsync`(483f200) → §4 표.
- 멀티: 프로토콜 3·4,096B·Lobby DO(83ef7c8), `.assetsignore` 에 net(89bb22f) → §3.2·§3.5. `store/`·`ui/icons-sheet.png` 웹·www 제외(e486572), `resources/` 자리표시(f5c1b52) → `8c0e91b` §G 납품 원본으로 android/ios 리소스 재생성(e486572) → §3.5·§4.
- 배포/공격시트: Cloudflare 설정(72a6d5b)·`tN-attack-2x2` 미사용(2df2679) → §3.5·§3.3. 플레이스홀더→Grok 아트(36f283f, 7ad2081)·왕실정원 폴백 제거(2d0a9f8→36ec953)·걷기 시트 선연결(0cf7cab) → 완료, §2.
- 개발 플래그·훅: `?unlock=all`·`?start=inf`(a8d20cd), `?inf=1` 은 저장 데이터를 건드리지 않는 미리보기 스위치였고 지금은 하위호환 무의미(282a895→ac1acf9) → §3.1·§6. 도로·물은 질감 1장씩(`road.png` 160px·`water.png` 256px), `road.png` 없고 `road-straight.png` 있으면 띠 중앙을 잘라 씀, `TILE_ASSETS` 테마당 12·총 72(2c9efe0) → §3.3·§5.4. ≡ 메뉴 일시정지는 싱글만(`S.paused`), 멀티 비활성(e11233b) → §3.4. 브라우저 검증 스크립트 `tools/e2e/` 이관은 다음 세션 재사용용(d9373a2) → §5.1·§6.

## 6. 다시 이어서 작업하는 방법

1. **자식 세션 재개(권장)**: https://claude.ai/code/session_01UHYuvb8XCJqrZ8tjcNw1hV — IDLE, 브랜치 `claude/next-tasks-planning-vun4oo` 에서 `6fc1c25` 까지 작업한 상태, 컨텍스트 ~306k 사용. 부모 세션 맥락 일부를 갖고 있을 수 있으나 PR #28 9차 이전 논의는 이 문서와 PR 본문에 의존해야 한다. 컨텍스트가 크므로 새 세션에서 이 문서 + `GAME-SPEC.md` 를 읽고 시작하는 것도 가능.
2. **브랜치·PR**: `claude/next-tasks-planning-vun4oo`(`6fc1c25`) 는 PR #28 https://github.com/GNchoo/dicekeep-art/pull/28 로 main 에 병합 완료(`c1d50fe`). 새 작업은 `git fetch origin && git checkout -b <새 브랜치> origin/main` 으로 main 에서 시작.
3. **읽는 순서**: `GAME-SPEC.md`(§1~§9) → `content.js` → `game.js` → `ART-PROMPTS.md` → `net/README.md` → `tools/e2e/README.md`. 이 문서 §3 의 "되돌린 시도" 를 먼저 훑을 것.
4. **로컬 실행**:
   - 게임: `python3 serve.py` → http://localhost:8137 (에디터 `/editor.html`). `file://` 금지.
   - 테스트 URL: `?unlock=all`(50 클리어·전 타워·젬 200), `?start=inf`(무한 바로), `?start=clear`(도전 바로). `?inf=1` 은 무의미.
   - 멀티 서버: `cd net && npx wrangler dev --port 8787` (또는 `TIMING=fast node test/dev-server.mjs`). localhost 로 열면 `ws://localhost:8787` 자동 접속. `?net=off|ws://…|clear`.
   - 서버 테스트: `cd net && npm test`(71개), `node test/ws-smoke.mjs`(TIMING=fast 서버 상대, ≈20초).
   - 코드 검사: `node --check game.js content.js editor.js net.js music.js`.
5. **브라우저 검증**(`tools/e2e/README.md`): `nohup python3 serve.py >/dev/null 2>&1 &` · `cd net && TIMING=fast PORT=8787 nohup node test/dev-server.mjs >/dev/null 2>&1 &` · `mkdir -p /tmp/e2e && cd /tmp/e2e` · `export NODE_PATH=/opt/node22/lib/node_modules` · `node /home/user/dicekeep-art/tools/e2e/single-smoke.js` (그 외 `devices-test.js [--only=…] [--scen=…] [--mp]`, `menu-test.js`, `mp3-test.js`, `mp-resume-test.js`, `dice-loss-test.js`, `hub-matrix.js`, `boss-matrix.js`, `inf-art-check.js [maxWave]` 등).
6. **AI 그림 생성**(README §AI 그림 생성): `OPENAI_API_KEY=… NODE_USE_ENV_PROXY=1 node tools/img-gen.mjs tools/jobs/<job>.json` → `node tools/sheet-check.mjs gen/inf/wNNN-walk-1.png --sheet-out=casual/enemies/inf/wNNN-walk-2x2.png` → `node tools/png-pack.mjs --size=512|1024 <png>` → `content.js` `INF_ART_READY` 기입 → `tools/e2e/inf-art-check.js`. 키아트: `node tools/keyart-build.mjs --portrait=… --landscape=…`. 키는 환경변수로만, `gen/` 미커밋.
7. **배포**: main push 시 정적 Worker 자동 재배포; 브랜치는 프리뷰 URL. 멀티 서버는 대시보드의 `dicekeep-net` Worker(루트 `net`) 빌드. 프로토콜 변경 시 서버 먼저. 코드 변경 시 `index.html`·`editor.html` `?v=` 상향(현재 index.html v89, 키아트 v90, editor.html v77 — 다음 상향은 v90 이상으로) + 강력 새로고침.
8. **콘솔 디버그 훅**(§4 표): 흔히 쓰는 것 — `DKstartInf('clear')`, `DKchest()`, `DKroll()`, `DKplace(idx)`, `DKupgrade(f)`, `DKenhance()`, `DKqueue()`, `DKDIE.forceFinal = 20`, `DKacquire(20)`, `DKlobbyView('hub'|'single'|'multi')`, `DKBGM.state()`, `DKLANES()`, `DKrange`, `DKdamage(e,dmg,src)`, `DKend()`, `DKsync()`, `DKAPP.back()`.
9. **작업 관례(잃어버린 세션이 지켜온 것)**: 기능 커밋마다 (a) 변경 이유·수치·검증 결과를 커밋 본문에, (b) GAME-SPEC/README/ART-PROMPTS 해당 절 갱신, (c) 캐시버스트 상향, (d) 밸런스 변경은 봇 재보정 후 §9 기록, (e) PR 본문에 변경·근거·검증·남은 일·배포 순서 정리. 이 관례 덕분에 이번 복원이 가능했으므로 계속 유지할 것.
