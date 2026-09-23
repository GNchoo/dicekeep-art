# W001 측면 보행 리그 후보

`w001-side-puppet-casual-source.png`는 측면을 바라보는 역병쥐의 몸통·앞다리·뒷다리를 분리한 1254×1254 RGBA 원본이다. 이미지 생성 입력과 프롬프트 기록은 이 폴더의 주 작업 기록에서 관리한다. 이 파일을 게임의 정지컷에 직접 복사하면 기존 방향별 걷기 시트가 우선하므로 화면에는 적용되지 않는다.

`w001-side-rig.json`은 기존 `tools/art-review/pr29-gait/rig-config.json`의 1웨이브 사족 보행 파라미터를 복사하고, 새 알파 원본의 세 분리 영역과 관절 위치를 재측정한 것이다. 몸통 ROI `[0.025,0.20,0.79,0.35]`, 앞다리 `[0.82,0.23,0.18,0.33]`, 뒷다리 `[0.78,0.56,0.22,0.32]`를 사용한다. 원래 보폭·위상·골반 고정·접지선은 유지하고, 새 부품의 길이에 맞춰 앞다리 배율 0.35, 뒷다리 0.34로 줄였다. 원본 SHA-256을 설정에 기록하므로 입력 픽셀이 바뀌면 다시 검수해야 한다.

`w001-front-back-puppet-casual-source.png`는 정면·후면의 몸통과 각각 앞다리·뒷다리를 분리한 2172×724 RGBA 원본이다. 여섯 전경 덩어리의 실측 경계에 맞춰 각 ROI를 다시 지정했다. `w001-directional-rig.json`은 기존 방향별 설정의 W001 한 종만 복사하고 측면 리그와 정면·후면의 원본·관절 좌표를 교체했다. 네 다리의 위상 관계·발 기준점은 기존 설정을 유지하며, 세 방향 모두 새 캐주얼 원본을 사용한다. 세 방향의 보행과 접지를 시각 검수해 `reviewApproved`를 `true`로 설정했다. 런타임 승격은 W002와 함께 별도 단계에서 수행한다.

```powershell
node tools/build-directional-art.mjs --config=tools/art-review/enemy-casual-2026-09-23/w001-directional-rig.json --out=gen/w001-casual-all-views-pilot --only=w001
node tools/check-directional-art.mjs gen/w001-casual-all-views-pilot
node tools/preview-directional-motion.mjs gen/w001-casual-all-views-pilot
```

출력 `gen/w001-casual-all-views-pilot/review/w001-{side,front,back}.png`는 각 방향 8포즈, `w001-moving.gif`는 좌·우·정면·후면의 움직임을 확인하는 자료다. 2026-09-23 검사에서 12개 생성 이미지·3개 인라인 대체 이미지의 해시와 디코딩, 16개 방향/다리 궤적이 통과했다. 접지 순간의 연속 위치 오차는 사실상 0px이고, 8프레임 유지 때문에 나타나는 최대 7.83px 이동은 검증 한계 8.08px 안이다. `w001-game-size.png`는 실제 투기장 보드 질감 위의 런타임 표시 배율과 4배 확대를 함께 보여 준다. 작은 S급 42px에 W001 전용 0.5배가 적용되는 기존 게임 화면에서는 측면 몸통이 약 10px로 너무 작다. 런타임 배율을 수정한 뒤 실제 게임에서 크기와 식별성을 최종 확인해야 한다.
