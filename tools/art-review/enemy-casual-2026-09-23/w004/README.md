# W004 까마귀 정찰병 캐주얼화

기존 W004는 잔 깃털과 어두운 질감이 겹쳐 작은 게임 크기에서 거의 검은 덩어리로 보였다. 새 3방향 원본은 둥근 청회색 까마귀, 큰 호박색 눈, 짧은 갈고리 부리, 갈색 가죽 하네스·청동 고리, 아래에 매단 주황 랜턴을 유지한다. 질감은 큰 색면과 두 단계 명암으로 줄였다. 후면에는 눈·부리가 없다. 내장 ImageGen의 **정확한 프롬프트와 참조 이미지의 역할**은 `PROMPTS.md`에 기록했다.

`w004-{side,front,back}-puppet-casual-source.png`는 각 1536×1024 투명 RGBA 원본이다. 네 모서리 alpha=0, alpha>28에서는 각 방향 몸체 1개와 분리 날개 2개가 정확히 존재한다. `pack-atlas.mjs`는 불투명 배경을 추측해 지우지 않고 이 투명 파트의 픽셀만 간격이 넓은 2048×1200 아틀라스로 배치한다. 오른쪽 날개 한 장을 좌우 반전해 두 날개가 각각 몸 바깥쪽으로 뻗게 한다. 원본 생성 이미지는 그대로 보존한다.

`make-rig.mjs`는 기존 `tools/art-review/directional-101/legacy-flight-rigs.json`의 W004 비행 설정을 기본으로 새 3방향 소스, 고정 몸체, 독립 회전 날개 2개를 지정한다. 시각 검수한 아틀라스의 SHA-256을 코드와 설정에 고정했다. 새 생성이나 편집으로 픽셀이 바뀌면 검수 핀 검사에 실패한다. `w004-directional-rig.json`은 top-level assetVersion 93, 각 view assetVersion 128, reviewApproved true다.

```powershell
node tools/art-review/enemy-casual-2026-09-23/w004/pack-atlas.mjs
node tools/art-review/enemy-casual-2026-09-23/w004/make-rig.mjs
node tools/build-directional-art.mjs --config=tools/art-review/enemy-casual-2026-09-23/w004/w004-directional-rig.json --out=gen/w004-casual-three-view-pilot --only=w004
node tools/check-directional-art.mjs gen/w004-casual-three-view-pilot --require-ready
node tools/preview-directional-motion.mjs gen/w004-casual-three-view-pilot
node tools/art-review/enemy-casual-2026-09-23/w004/make-game-size-preview.mjs
```

2026-09-23 검수: 12개 생성 이미지·인라인 대체 3개·4개 비행 방향/위상 추적 모두 통과했다. `gen/w004-casual-three-view-pilot/review/w004-{side,front,back}.png`에는 세 방향 각 4포즈, `review/w004-moving.gif`에는 비행 동작이 있다. 몸체·랜턴은 고정되고 날개가 어깨 접합점에서 따로 움직인다. `w004-game-size-comparison.png`는 작은 몬스터의 42px 표시 높이에서 기존과 새 정지컷을 실제 크기 및 4배 확대 화면으로 비교한다. 비교의 원본 still은 `baseline-w004-{side,front,back}.webp`에 고정했다. 세 방향 정지컷·2×2 비행 시트 여섯 파일은 검수 빌드와 각각 SHA-256이 동일한 상태로 v128 런타임에 승격되었다. 프로젝트 전체 검증과 게시 작업은 주 작업에서 관리한다.
