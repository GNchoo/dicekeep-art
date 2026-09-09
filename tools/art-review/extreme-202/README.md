# 극한 102–202웨이브 아트

2026-09-09 후속 수정: [v102 보스 하향 발끝 검수](../boss-front-footwork-102/README.md). b141/b141-2/b191/b191-2/b201의 정면만 교체했으며, 아래 v101 승인·용량·해시 기록은 당시 원본에 해당한다.

101개 웨이브에 연결되는 새 외형111개: 일반91개, 보스10개, 부관10개. 같은 생물 체형의 의상·장비 변형도 포함한다.111개가 모두 서로 다른 생물종이라는 뜻은 아니다. 기존1–101 아트 파일은 이 작업에서 변경하지 않는다.

왕관 유적 → 서리 기계 → 심연 정원 → 잿불 공방 → 별빛 파수대 순서로 새 머리·몸통·장비를 제작한다. 고어, 썩은 살, 상처의 사실적 표현을 제외하고 읽기 쉬운 페인팅 게임 캐릭터를 유지한다. W102는 실제 다람쥐 그림에 맞춰 `왕관 운반다람쥐`로 명명했다.

## 제작과 움직임

- 실제 생성 도구: built-in `image_gen`. 성공12회, 결과 없는 서버500실패3회. 결제 여부나 비용은 이 호출 횟수로 추정하지 않는다.
- 일반은 요청당 최대16외형×3방향48셀, 보스는4외형×3방향12셀로 묶었다. 마지막 일반 묶음의 빈 공간에 이전 방향 오류3개를 함께 보정했고, 별도4외형 묶음으로 몸통의 고정 발·꼬리를 제거했다.
- 모든 원본은 실제1086×1448 RGB로 생성됐다. 요청상의 고해상도나 투명 배경을 실제 파일 사양으로 가장하지 않는다. 마젠타 키·2픽셀 경계 처리 후 실측 연결 성분으로 분할한다. 자주색 전경 전체를 배경으로 지우지 않는다.
- 원본은 `sources/`, 실제 프롬프트는 `prompts/`, 입력 기준 이미지는 `guides/`, 소스 해시·실치수·셀 측정은 `measurements/`와 `generation-ledger.json`에 보존한다. 선택된 몸통은 `bodies/<group>/`에 원본 좌표 추적이 가능한 알파 조각으로 보존한다.
- 지상77개·기어가는6개는8프레임, 비행20개·부유8개는4프레임이다. 새3방향 몸통과 기존 승인 관절 리그를 합성한다. 매 프레임을 새로 손으로 그린 방식은 아니다. 기존 다리·날개·꼬리 조각, 물리 좌우 정체성, 위상·관절·보폭·피벗은 유지한다.
- `legacyAssetId`는 기존 논리 적의 표시 크기 계승값이고, `baseRigId`는 실제 사용한 측정 리그의 출처이다. 초기9개 side adapter 대신 대응되는 승인된3방향 리그를 사용한 경우 두 값이 다르다.

## 검수 범위

`pipeline-validation.json`은111개/333방향에서 원래 움직이는 부품과 관절 계약이 보존됐음을 확인한다. `gen/extreme-202-final/directional-qa.json`은 실제 Canvas 합성과 매 프레임 알파·클리핑·관절 검사, 소스SHA를 기록한다. 정지컷 및64px 인라인 대체 이미지도 같은 최종 캐릭터를 사용한다.

`directional-moving-qa.json`은111개 전체의 실제 시트 프레임·접촉 포즈를4방향3주기로 검사한다. `motion-qa.mjs`는 공통 검사 코드를 고정한 사본이며, 검사 생략 없이 대표8개만 큰 `review/*-moving.gif`로 인코딩한다.333개의 방향별 실제 프레임 GIF는 빌더에 이미 포함된다. 지상 접촉 포즈의 잔차와8프레임을 유지하는 동안 생기는 양자화 편차는 구분한다. 이를 모든 순간에 미끄러짐이0인 연속 애니메이션이라고 해석하지 않는다. 비행·부유 리뷰의 이동 거리는 보기용이며 접지 또는 게임 속도 검사를 가장하지 않는다.

전체 포즈 검사에서 B181과 B201-2 후면 날개가 최대 전개 시 왼쪽 셀 경계에 닿은 것을 발견했다. 각 후면 몸통과 소켓의 고정 중심만10/12 canonical pixels 오른쪽으로 옮겼다. 날개 원본·크기·위상·각도·피벗은 유지하며 보정은 `body-adjustments.json`에 기록한다.

최종 이미지를 직접 읽은 시각 판단은 `visual-review.json`, 실제 배포 파일 목록과 크기는 `promotion.json`에 별도로 기록한다. 이 파일들이 없거나 검사를 통과하지 않은 경우 아직 승인되지 않은 빌드다. 실제 게임의 로딩·캐시·방향·멀티 전송 검증은 루트 작업의 `tools/e2e/extreme-appearance.cjs --actual` 증거와 구분한다.

최종 승인 결과:111외형/333방향/2,328프레임, 런타임666파일과 검수666파일의1,332개 디코드·해시 및333개 인라인 대체 이미지 통과. 전종4방향 움직임 검사111개도 오류0이다. 각14개 보드에서3방향과 대표4위상을 직접 확인했고 보정 사례는 전체8/4포즈를 추가 확인했다. 런타임666개는 모두 무손실WebP,77,527,070 bytes(73.94 MiB)다. 같은PNG135,713,831 bytes(129.43 MiB)보다55.49 MiB 작고 보이는RGBA 차이는0이다. 이 용량에는 원화·검수자료와 JS manifest가 포함되지 않는다.

PR 검토용 자료는 `evidence/`에 보존한다. `old-new-three-view.png`는 기존 외형과 새 외형 비교, `all-poses-1..14.jpg`는 전종3방향 대표 포즈,4개의 `*-moving.gif`는 실제 시트 기반 이동 재생이다. 전체 프레임별 QA 원문은 `directional-qa.json.gz`로 보존하며 `manifest.json`에 압축 해제된 원문의SHA와 각 증거 파일SHA를 기록한다. JPEG는 검토판에만 사용한다.

## 재현

```powershell
node tools/art-review/extreme-202/pipeline-test.mjs
node tools/build-extreme-art.mjs --config=tools/art-review/extreme-202/all-rigs.json --out=gen/extreme-202-rebuild
node tools/check-directional-art.mjs gen/extreme-202-rebuild --require-ready
node tools/art-review/extreme-202/motion-qa.mjs gen/extreme-202-rebuild
node tools/art-review/extreme-202/review-board.mjs gen/extreme-202-rebuild
```

최종 런타임은 `casual/enemies/extreme/`, `casual/bosses/extreme/`, `extreme-art.js`다. PNG보다 작을 때만 무손실WebP를 선택하며 각 파일의 알파와 보이는RGB를 원래PNG와 비교한다. 완전히 투명한 픽셀의 숨은RGB는 인코더가 정리할 수 있다. 런타임 디코드RGBA 메모리는 압축으로 줄었다고 주장하지 않으며, 기존96MiB 캐시 한도는 별개다. 원화·중간 빌드·검수 보드는 앱 런타임 복사 목록에 포함하지 않는다.
