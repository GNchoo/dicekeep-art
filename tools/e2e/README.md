# 브라우저 검증 스크립트 (Playwright, 저장소 밖 실행용)

세션 스크래치에서 쓰던 스크립트를 그대로 옮겨 둔 것이다. 스크린샷·로그를 현재 폴더에 쓰므로 **빈 작업 폴더에서** 실행한다.

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
| `walk-jitter.js` | 인피니티 걷기 시트가 로더에서 안정화됐는지: 프레임마다 발 y·무게중심 x 편차 (2% 넘으면 실패) |
| `inf-art-check.js [maxWave]` | 인피니티 새 그림(`INF_ART_READY`): 웨이브마다 첫 적을 0.4초 간격 3장 확대 캡처(걷기 프레임·방향·후광), 이름·art 키·크기, 404 목록. 마지막 웨이브는 기존 로스터와 크기 비교용 |

훅(`game.js` 끝): `DK`, `DKstartInf('clear')`, `DKchest()`, `DKsync()`, `DKend()`, `DKlobby()`, `DKlobbyView('hub'|'single'|'multi')`, `DKLANES()`, `DKacquire(face)`, `DKDIE.forceFinal`.
