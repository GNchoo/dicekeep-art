# 인간형 무릎 방향 수정 · v110

2026-09-14. 기존 부위 그림과 관절 좌표를 사용해 인간형 103종의 잘못된 무릎 방향을 수정했다. 전체 빌드·관절·래스터 무결성·이동 검사, 검수, 승격 및 실제 게임 검증을 완료했다. 이전 버전의 자동 검사 결과를 이 빌드의 통과 기록으로 재사용하지 않았다.

## 범위

기존 1–101 구간 51종과 극한 102–202 구간 52종, 합계 103종이다. 98종의 세 방향 294뷰와 초기 다섯 종의 정면/후면 10뷰를 수정해 총 304뷰·보행 2,432프레임·정지컷/보행 시트 608파일·64px fallback 304개를 교체했다. 초기 다섯 종의 정상 측면은 유지했다.

주요 98종의 목록/소스 SHA는 `selection.json`, 재현 설정은 `rigs.json`이다. w002/w003/w005/w007/w009의 정면/후면 보완은 `legacy-selection.json`과 `legacy-front-back-rigs.json`에 있다. 첫 감사는 측면만으로 정상 여부를 분류해 초기 다섯 종의 정면/후면 차이를 놓쳤고, 최종 감사는 세 방향을 모두 검사한다.

w075·w176은 닭 다리이며 노출된 hock의 뒤쪽 굽힘이 의도된 외형이므로 제외했다. 비대상 118종의 메타데이터·fallback·참조 이미지 708파일과 초기 다섯 종의 측면 메타데이터·이미지 10파일은 기준 main `5630cdd`와 같아야 한다.

## 변경과 보존

`tools/prepare-biped-knee-fix.mjs`는 기존 릴리스의 선택 설정과 현재 극한 설정에서 98종을 읽고 `bend: 1`을 `-1`로 바꾼다. `tools/prepare-legacy-biped-knee-fix.mjs`는 초기 다섯 종의 정면/후면만 준비한다. 인간형에는 `anatomy: "biped"`를 명시하고 모든 수정 방향에 `assetVersion: 110`을 지정한다. 초기 다섯 측면의 설정·이미지·캐시 버전은 그대로 유지한다. 수정 전의 시각 승인을 새 이미지에 물려주지 않도록 `reviewApproved`는 초기화한다.

소스 원화·SHA·부위 ROI·고관절 소켓·원본 관절 좌표·뼈 길이·발끝 반전·보폭·접지·위상·피벗·기준 높이는 보존한다. 준비기는 변경 허용값을 원래대로 돌렸을 때 원본 설정과 구조가 완전히 같은지 비교한다. `tools/lib/directional-rig.mjs`의 새 검사는 화면 투영 전 고관절–발목 선의 전방에 무릎이 있는지 확인한다. 뼈 길이·접지·지지각 검사는 함께 유지한다.

v102에서 발끝을 바깥으로 돌린 b040/b040-2/b090/b090-2/b100 및 b141/b141-2/b191/b191-2/b201의 정면 `flipX`를 보존한다. b050 계열은 원래 바깥으로 향하므로 새로운 발끝 반전을 넣지 않는다. 기존 측면 `flipX`도 유지한다. 이전 정면 전용 v102가 로더에서 우선하지 않도록 수정하는 각 방향에 v110을 명시한다.

상체를 휘게 하는 런타임 필터나 타워 모션 변경을 추가하지 않는다. W100 보행 분류와 v109의 타워 복원·발사빛은 유지하며 전투·경제·과금 수치는 바꾸지 않는다. 외부 이미지 생성 요청이나 유료 서비스 사용은 없다.

## 재현

저장소 루트에서 실행한다. `npm ci`와 Chrome/Edge가 필요하다. 신규 출력 폴더를 사용하며 과거 빌드를 무조건 재사용하지 않는다. `prepare`는 검수 전 설정을 다시 쓰므로 이미 승인된 빌드에 실행했다면 해시와 검수도 다시 확인해야 한다.

```powershell
node tools/prepare-biped-knee-fix.mjs
node tools/prepare-legacy-biped-knee-fix.mjs
$kneeSelection = Get-Content tools/art-review/biped-knees-110/selection.json -Raw | ConvertFrom-Json
$kneeOriginalIds = ($kneeSelection.selection | Where-Object kind -eq original | ForEach-Object id) -join ','
$kneeExtremeIds = ($kneeSelection.selection | Where-Object kind -eq extreme | ForEach-Object id) -join ','
node tools/build-directional-art.mjs --config=tools/art-review/biped-knees-110/rigs.json --out=gen/biped-knees-110/original "--only=$kneeOriginalIds"
node tools/build-extreme-art.mjs --config=tools/art-review/biped-knees-110/rigs.json --out=gen/biped-knees-110/extreme "--only=$kneeExtremeIds"
node tools/build-directional-art.mjs --config=tools/art-review/biped-knees-110/legacy-front-back-rigs.json --out=gen/biped-knees-110/legacy
node tools/check-directional-art.mjs gen/biped-knees-110/original
node tools/check-directional-art.mjs gen/biped-knees-110/extreme
node tools/check-directional-art.mjs gen/biped-knees-110/legacy
node tools/preview-directional-motion.mjs gen/biped-knees-110/original
node tools/preview-directional-motion.mjs gen/biped-knees-110/extreme
node tools/preview-directional-motion.mjs gen/biped-knees-110/legacy
node tools/review-biped-knees.mjs
node --test tools/directional-rig-test.mjs
```

`check-directional-art`는 소스·파일 해시, 실제 디코드, 격자·피벗, 최종 정지컷에서 만든 fallback을 검사한다. `preview-directional-motion`은 구운 시트와 이동/접지 증거를 만들며 별도의 해부학적 시각 승인을 대신하지 않는다.

`review-biped-knees`는 `gen/biped-knees-110/review/`에 주요 98종의 측면 프레임 2·6 전후 보드와 대표 여섯 종의 세 방향 8프레임 비교 HTML을 생성한다. 전후에는 같은 축소율과 원래 피벗을 적용한다. 초기 다섯 종은 `gen/biped-knees-110/legacy/review/`의 정면/후면 8프레임 보드를 확인한다. 보드를 생성했다는 사실만으로 검수가 끝나지 않으며 확인한 방향·프레임 범위를 구분해 `review.json`과 `legacy-review.json`에 기록한다. 승인에는 대상 ID와 실제 사용한 설정/빌드/QA/이동 증거의 해시를 포함한다. 검수 후 출력이나 설정이 바뀌면 해당 검수를 갱신해야 한다.

`review.json`의 필수 고정값은 `passed: true`, `configSha256`, `ids`, `builds.original`, `builds.extreme`이다. 각 `builds[kind]`는 `manifestSha256`, `qaSha256`, `movingQaSha256`을 갖는다. 각각 해당 출력 폴더의 `directional-art.json`, `directional-qa.json`, `directional-moving-qa.json` 파일 SHA-256이다. 승격기는 이 해시와 이동 검사 성공·manifest 연결·대상 ID를 확인한다. 검수 설명과 확인한 프레임 범위도 같은 문서에 기록한다.

`legacy-review.json`도 같은 구조이며 `builds.legacy`의 세 해시와 별도 `legacy-front-back-rigs.json`의 `configSha256`을 고정한다. 보완 빌드가 생성한 측면 출력은 승격하지 않는다.

실제 프레임의 무릎 방향·연결·발끝·잘림을 확인하고 두 검수 기록을 작성한 뒤 승격한다. 승격 재현은 기준 `5630cdd`의 수정 전 운영 자산을 갖춘 별도 체크아웃에서 실행한다. 이미 반영된 main에 다시 승격하면 동일 이미지 교체 방지 검사로 거절된다. 빌드·검사·감사·런타임 검사는 반복 실행할 수 있다.

```powershell
node tools/promote-biped-knee-fix.mjs --check
node tools/promote-biped-knee-fix.mjs
node tools/promote-biped-knee-fix.mjs --legacy --check
node tools/promote-biped-knee-fix.mjs --legacy
# 별도 터미널에서 저장소 정적 서버를 8137 포트로 실행한 뒤
npm run test:biped-knees
npm run build:www
```

승격기는 기존 이미지 경로와 런타임 메타데이터를 유지하고 본체 588파일과 보완 20파일 및 해당 방향의 fallback/버전만 교체한다. 출력 이미지의 인코딩이 기존 경로 확장자와 다르면 무손실 변환 후 보이는 RGBA가 같은지 비교한다. `--check`는 승격 조건을 확인하고 운영 파일을 쓰지 않는다.

## 검증 기록

주요 98종과 초기 다섯 종 보완의 최종 빌드·관절·래스터 무결성·이동 검사가 통과했다. 빌드 근거에는 실제 승격 파일 외에 검수용 이미지와 승격하지 않는 초기 측면 출력이 포함된다. 최종 `npm run test:biped-knees`에서 단위/관절 26건·세 방향 감사·승격 후 런타임 검사가 통과했다. `npm run test:boss-locomotion`의 8주기·2뷰포트·관전·v105 저장 복구·아트 누락 회귀도 통과했다.

시각 검수는 98종의 측면 실제 프레임 2·6 전후, 대표 여섯 종의 세 방향 8프레임 비교, 초기 다섯 종의 정면/후면 80포즈다. 검수 시트 해시가 최종 빌드와 일치함을 확인했다. 자동 검사는 전체 수정 304뷰를 다루지만 모든 2,432프레임을 눈으로 검수했다는 뜻은 아니다. 승인 범위와 해시는 `review.json`과 `legacy-review.json`에 있다.

승격 후 런타임 검사는 103종×3방향×2뷰포트의 배치 618건(수정 방향 608건·보존 측면 10건), 서버 이미지 SHA/디코드 608개, fallback 304개를 통과했다. 변경 외 118종 전체와 초기 다섯 측면의 JSON 및 참조 이미지 718개 Git blob이 `5630cdd`와 같았으며 조류 예외와 측면 보존도 별도로 확인했다. 페이지/아트 오류는 0이고 W100 지상 보스·비행 부관 및 일반 몬스터의 기존 땅속 이동을 유지한다. 결과는 `runtime-check.json`에 보관했다. `npm run build:www`도 최종 자산 2,243파일로 성공했다.

최종 감사는 세 방향 모두 검사해 인간형 전방 굽힘 103종(기존 51·극한 52)/309뷰, 조류 hock 2종/6뷰를 확인했다. 뒤쪽·혼합·미해결 인간형은 0이다. 결과는 `audit.json`에 있다.

빌드 근거는 `gen/biped-knees-110/{original,extreme,legacy}`, 시각 자료는 `gen/biped-knees-110/review`와 각 빌드의 `review`, 승격 결과는 `gen/biped-knees-110/promotion.json` 및 `legacy-promotion.json`, 실행 결과는 `gen/e2e/biped-knees-runtime/report.json`에 생성한다. Chrome의 두 화면 크기 검사를 실제 휴대폰 하드웨어 성능 검증으로 표시하지 않는다.
