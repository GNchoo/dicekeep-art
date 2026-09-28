# 보스 보상과 고유 공격 효과 — v157

기준 커밋: `6eaa73c` (v156). v157은 중앙 터치 보상과 별 타워의 고유 공격 효과를 추가합니다.

## 변경

- 다면체를 사용하는 순수운빨/인피니티 보스 한 마리마다 중앙에 터치 개봉 상자 한 개를 지급합니다. 터치할 때 d8/d12/d20을 정확히 1/3씩 추첨합니다. 기존 보스 골드와 일반 구매 확률은 유지합니다. 덱 모드의 카드 소환 규칙은 유지합니다.
- 실제 주사위가 상자 안에서 올라옵니다. d12는 보라색 결정과 궤도, d20은 금빛 광선과 별빛으로 구분합니다. 마지막 보스도 보상 개봉 후 클리어 화면으로 넘어갑니다.
- 자체 합성한 등장·개봉·d8·d12·d20 효과음을 추가했습니다. 외부 음원을 사용하지 않으며 기존 음소거/효과음 볼륨을 따릅니다.
- 7~20성은 14종의 고유 발사체·발사 섬광·적중 도형을 사용합니다. 6성의 주사위 폭탄을 포함한 1~6성의 기존 개성은 유지합니다. 실제 피해, 공속, 사거리, 광역 범위는 바꾸지 않습니다.
- 연속 보상은 대기열에 보관하고, 중복 터치·손에 든 주사위 덮어쓰기를 막습니다. 싱글 전투는 개봉 중 정지하고 멀티 전투는 계속됩니다. 새 보상 규칙이 이전 클라이언트와 같은 방에 섞이지 않도록 멀티 버전도 올렸습니다.

## 통과한 검사

```powershell
node tools/boss-reward-test.cjs
node tools/reward-audio-test.cjs
node tools/star-combat-fx-test.cjs
node tools/pure-main-rules-test.cjs
node tools/battle-persistence-test.cjs
node tools/art-manifest.mjs --check
node tools/build-www.mjs
node tools/e2e/boss-reward.cjs
node tools/e2e/reward-audio.cjs
node tools/e2e/star-combat-fx.cjs
node tools/e2e/presentation-fx.cjs
node tools/e2e/fx-performance.cjs
```

확률 구간·30,000개 균등 입력, 터치 전 미추첨, 중복 터치, 다중 보스 보상/골드, 최종 보상, 기존 저장 복원, 싱글/멀티 시계, 모바일 뒤로가기를 검사했습니다. 20종 타워의 기존 공격 추적값이 일치했고 14종의 도형 경로가 서로 다릅니다.

## 브라우저 검수와 한계

- Chrome에서 932×430 / 430×932의 보상 3등급 모두 실제 터치·연속 터치·대기열 전달·가독성과 화면 경계를 검사했습니다. 키보드/앱 뒤로가기도 보상 뒤의 메뉴를 잘못 열지 않습니다.
- 브라우저 검수에서 발견한 DOM 초기화 순서 오류를 수정하고, 포인터로 상자를 열 때 불필요한 큰 포커스 테두리가 표시되지 않도록 정리했습니다. 키보드 탭 포커스는 유지합니다.
- 6~20성 발사체/적중 실루엣 15종이 색을 제외해도 서로 다릅니다. 고등급 효과의 지나치게 옅던 윤곽을 속성색과 작은 중심광으로 보강했습니다.
- OfflineAudioContext에서 효과음 5종과 연속 재생 모두 클리핑·잔여 신호·노드 누수 없이 통과했습니다. 단일 효과 최대 피크는 0.229, 연속 재생은 0.458 미만입니다.
- 전투 15타워, 강화, d20 상자 등의 이 PC Chrome 측정에서 RAF 처리 시간 p95는 1.3~2.1ms였습니다. 실제 모바일 기기의 GPU·스피커·터치 감각까지 보장하는 값은 아닙니다.

검사 출력은 `gen/e2e/boss-reward`, `gen/e2e/reward-audio`, `gen/e2e/star-combat-fx.png`, `gen/e2e/fx-performance/report-current.json`에 생성됩니다. 실제 모바일 기기 검수는 별도로 진행해야 합니다.
