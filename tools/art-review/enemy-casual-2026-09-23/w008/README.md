# W008 캐주얼 벌 편대 후보

기존 W008은 어두운 청록색 벌 세 마리(큰 대장, 작은 좌하단·우상단 추종자)와 주황 눈, 대장의 아이보리 해골 장식으로 식별된다. 내장 ImageGen으로 측면·정면·후면의 날개 없는 몸체 3개와 분리 날개 2개를 각각 투명 RGBA로 생성했다. 사용한 **정확한 프롬프트와 각 방향의 참고 이미지 역할**은 `PROMPTS.md`에 보존했다. 참고한 기존 정지컷은 `casual/enemies/inf/directional/w008-{side,front,back}.webp`의 v126 픽셀이며, 측면의 화풍 기준은 새 W002 측면 퍼펫, 정면·후면의 화풍 기준은 앞에서 생성한 W008 소스다. 짙은 채색 질감 대신 넓은 청록 색면, 두 단계 명암, 단순한 굵은 외곽선과 크림색 날개를 사용했다.

`w008-*-puppet-casual-source.png`는 ImageGen 원본이다. 네 모서리 alpha=0, alpha>28에서 각 방향 정확히 몸체 세 개와 날개 두 개가 분리되어 있다. 검정/갈색으로 보일 수 있는 투명 픽셀은 배경이 아니다. `pack-atlas.mjs`는 이 투명 파트들의 픽셀을 색상 기반 배경 제거 없이 다른 빈 공간에 배치한다. 정면·측면의 두 날개 경계가 세로로 몇 픽셀 겹쳐 빌더의 직사각형 ROI가 둘을 구분하지 못하는 문제만 해결한다. 원본은 변형하지 않는다.

`make-rig.mjs`는 검수한 아틀라스 SHA-256을 고정하고, 기존 `legacy-flight-rigs.json` W008의 편대·비행 기준을 새 세 방향 소스에 연결한다. `w008-directional-rig.json`은 top-level assetVersion 93, 각 방향 assetVersion 127, reviewApproved true다. 몸체는 네 프레임 동안 고정하고 각 몸체의 두 날개, 총 여섯 날개만 독립적으로 회전시킨다. 원본 이미지 또는 배치된 픽셀이 바뀌면 SHA 검사가 실패하므로 재검수해야 한다.

```powershell
node tools/art-review/enemy-casual-2026-09-23/w008/pack-atlas.mjs
node tools/art-review/enemy-casual-2026-09-23/w008/make-rig.mjs
node tools/build-directional-art.mjs --config=tools/art-review/enemy-casual-2026-09-23/w008/w008-directional-rig.json --out=gen/w008-casual-three-view-pilot --only=w008
node tools/check-directional-art.mjs gen/w008-casual-three-view-pilot --require-ready
node tools/preview-directional-motion.mjs gen/w008-casual-three-view-pilot
node tools/art-review/enemy-casual-2026-09-23/w008/make-game-size-preview.mjs
```

2026-09-23: 생성 이미지 12개, 인라인 대체 3개, 4방향·위상 추적 통과. `gen/w008-casual-three-view-pilot/review/w008-{side,front,back}.png`에는 각 방향 4포즈, `review/w008-moving.gif`에는 비행 모션이 있다. `w008-game-size-comparison.png`는 `content.js`의 작은 몬스터 42px 높이를 사용해 기존/신규 세 방향을 실제 크기와 4배 확대 화면으로 비교한다. 비교의 이전 버전은 `baseline-w008-{side,front,back}.webp`에 보존했으므로 v127 승격 후에도 재생성할 수 있다. W008의 세 방향 정지컷·시트 여섯 파일은 이 빌드의 바이트와 일치하며 v127 런타임으로 승격되었다. 프로젝트 전체 검증과 게시 작업은 주 작업에서 관리한다.
