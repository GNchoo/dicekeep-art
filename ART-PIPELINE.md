# Dicekeep 캐주얼 아트 파이프라인

Dicekeep의 출시 아트 방향은 **밝은 장난감 성채 판타지**다. 특정 게임 이름을 생성 지시로 복제하지 않고, 작은 모바일 화면에서 읽히는 형태·색·명암 규칙을 Dicekeep 자체 기준으로 관리한다.

## 기준 파일

| 파일 | 역할 |
|---|---|
| `tools/art-style.json` | 생성 모델, 출력 형식, 캐릭터·환경·키아트·타워·아이콘·VFX 공통 STYLE의 유일한 원본 |
| `tools/inf-roster.json` | 인피니티 몬스터의 정체성·장비·보행 방식 |
| `tools/inf-jobs.mjs` | 로스터와 게임 데이터를 조합해 인피니티 생성 잡을 만드는 원본 |
| `tools/golden-slice-jobs.mjs` | 첫 화면 품질 검증용 환경·타워·대표 적/보스·UI·VFX 잡 33개의 원본 |
| `tools/jobs/*.json` | 실행 가능한 잡. STYLE 문장을 복사하지 않고 `styleProfile`만 참조 |
| `art-manifest.json` | 현재 아트 파일의 경로·해시·크기·포맷·앱 포함 여부 |
| `tools/art-manifest.mjs` | 매니페스트 생성 및 최신 상태 검사 |

`tools/jobs/*.json`을 직접 고쳐도 원본 생성기가 다시 덮어쓸 수 있다. 인피니티 캐릭터의 스타일은 `tools/art-style.json`, 개별 설정은 `tools/inf-roster.json` 또는 `content.js`, 잡 조립 규칙은 `tools/inf-jobs.mjs`에서 수정한다.

## 실제 런타임 자산

- v123 기본 2~6성·환경·투사체 리페인트 기록: [프롬프트·원본·승격 절차](tools/art-review/casual-world-2026-09-23/README.md). 향후 골든 슬라이스도 이 잡의 원본 보존 프롬프트를 재사용한다. 기본 타워를 일괄 상아 성채로 재설계하지 않는다.
- v124 무식물 기본 타워 1~6성: [선택 원본·승격 기록](tools/art-review/plant-free-2026-09-23/README.md). 큰 면과 단순한 명암으로 벽돌·지붕 선을 줄였으며, `node tools/promote-clean-towers.mjs`로 런타임 2배 해상도를 재생성한다. 투기장·성·지옥에서만 이 버전을 사용한다.
- v125 무식물 별 타워 7~20성: [14종 프롬프트·선택 원본·승격 기록](tools/art-review/star-casual-2026-09-23/README.md). 원래 타워별 실루엣과 무기를 유지하고 식물 및 잔벽돌선을 줄였다. `node tools/promote-casual-stars.mjs`로 최대 140×192px 런타임 이미지를 재생성하며, 현재는 모든 맵에서 이 버전을 사용한다. 테마별 변형은 추후 작업이다.
- v126 인피니티 아레나 바닥·보드·길·타워 받침: [선택 원본·프롬프트·승격 기록](tools/art-review/arena-clean-2026-09-23/README.md). 큰 2톤 석판으로 줄눈을 줄이고, 보드 그림은 반복하지 않고 한 번만 잘라 그린다. `node tools/promote-clean-arena.mjs`로 재생성한다. 성·지옥 지역의 돌 바닥/길/받침 대체 그림도 이 자산을 공유한다.

- 현재 전장은 `casual/tiles/**`와 코드 레이아웃으로 조립된다.
- `casual/maps/map-*.jpg`는 과거 전체 배경 방식의 보존 자산이며 모바일 빌드에서 제외된다.
- `casual/towers/*-attack-2x2.png`도 현재 모바일 빌드에서 제외된다. 다시 연결하기 전에는 재생성하지 않는다.
- 인피니티·극한 방향별 파일은 승인 원본에서 만든 파생 자산이다. 원본을 교체하면 방향·관절·피벗 검사를 다시 실행해야 한다.
- `ART-PROMPTS.md`와 `GROK-BRIEF.md`의 긴 프롬프트 중 폐기 또는 참고용으로 표시된 부분은 실행 원본이 아니다.

## 생성 도구 선택

Codex 내장 `image_gen`은 별도의 `OPENAI_API_KEY` 없이 사용할 수 있다. 골든 슬라이스의 스타일을 눈으로 맞출 때는 이 도구로 **자산마다 별도 호출**하고, 결과를 `gen/codex-golden-slice/`에 복사해 검토한다. 내장 도구가 만든 이미지는 저장소의 `img-gen.mjs` 실행 manifest에 자동으로 기록되지 않으므로, 어떤 잡·프롬프트·참조 이미지를 사용했는지 후보와 함께 기록해야 한다.

`tools/img-gen.mjs`는 같은 잡 파일을 스크립트로 재현·대량 실행하는 별도 경로이며, 이 경로에서만 사용자가 설정한 `OPENAI_API_KEY`가 필요하다. 어느 경로를 쓰든 `gen/`의 후보를 곧바로 게임 자산에 덮어쓰지 않고 `runtimeSpec`에 맞춰 크기·알파·중심축을 검증한다.

## 스크립트 생성 순서

### 1. 잡 재생성

```powershell
node tools/inf-jobs.mjs --waves=1-5 --out=tools/jobs/inf-w01-05.json
node tools/inf-jobs.mjs --waves=1-5 --refs --out=tools/jobs/inf-w01-05-walk.json
node tools/inf-jobs.mjs --waves=6-10 --mode=multi --out=tools/jobs/inf-w06-10.json
npm run art:golden-jobs
```

### 2. 비용 없이 최종 요청 확인

```powershell
node tools/img-gen.mjs tools/jobs/keyart.json --dry
node tools/img-gen.mjs tools/jobs/golden-slice.json --dry
node tools/img-gen.mjs tools/jobs/inf-w06-10.json --dry
```

`--dry` 출력에서 고정 모델, 스타일 버전, 최종 프롬프트, 출력 경로를 확인한다. API 키는 환경변수로만 전달하며 파일이나 로그에 넣지 않는다.

### 3. API 키가 설정된 환경에서 staging에 생성

```powershell
$env:OPENAI_API_KEY='...'
node tools/img-gen.mjs tools/jobs/keyart.json
npm run art:golden-candidates
node tools/img-gen.mjs gen/jobs/golden-slice-candidates.json
```

- 기존 파일이 있으면 기본적으로 실패한다. 의도적으로 다시 생성할 때만 `--overwrite`를 사용한다.
- 실행별 manifest에는 모델, 최종 프롬프트 해시, 참조 이미지 해시, 요청 옵션, 응답 파일 해시와 성공·실패 상태가 남는다.
- 한 잡이라도 실패하거나 응답 수·이미지 검증이 맞지 않으면 프로세스가 실패 코드로 끝난다.
- 생성 결과는 곧바로 런타임 폴더에 덮어쓰지 않는다. `gen/`에서 검수한 승인본만 별도 커밋으로 승격한다.
- 골든 슬라이스 잡의 `runtimeTarget`은 승인 후 승격 위치를 기록하는 메타데이터다. 생성기는 이 경로에 쓰지 않으며 실행 manifest에 범주와 함께 보존한다.
- `runtimeSpec`은 승인본의 최종 크기와 `fixed`·`cover`·`trim-contain` 처리, 알파와 중심축을 고정한다. 1024px 후보를 런타임 경로에 그대로 복사하지 않는다.
- 기본 후보는 자산당 1개다. `npm run art:golden-candidates`는 첫 검수에서만 쓰는 2개 후보 잡을 추적 밖의 `gen/jobs/`에 만든다.

### 4. 실제 화면 검수

원본 1024px 파일만 보고 승인하지 않는다. 최소한 다음을 확인한다.

- 390×844 및 320×640 화면에서 64~96px 실루엣이 식별되는가
- 타워 받침, 포구, 몬스터 발밑 피벗이 기존 좌표와 맞는가
- 걷기 시트의 몸 크기와 바닥선이 모든 프레임에서 유지되는가
- 투명 알파에 회색·마젠타 잔상이 없는가
- 길, 석단, 시작점과 도착점이 코드 레이아웃과 맞는가
- 배경보다 타워·적·투사체가 먼저 읽히는가

### 5. 자산 매니페스트 갱신

```powershell
node tools/art-manifest.mjs
node tools/art-manifest.mjs --check
```

승인 자산을 교체한 커밋에는 갱신된 `art-manifest.json`을 함께 포함한다. 매니페스트 해시는 생성 이력의 출력 해시와 대조해 승인된 파일만 런타임에 들어갔는지 확인하는 기준으로 사용한다.

## 스타일 고정 규칙

- 둥글고 큰 실루엣, 대표 장식 1~2개
- 밝음·중간·그림자의 3단 명암과 좌상단 단일 광원
- 따뜻한 암갈색 외곽선, 더 얇은 내부선
- 상아색 주사위, 황동 금색, 보라 마법, 하늘색 수정의 브랜드 팔레트
- 배경은 유닛보다 낮은 채도와 낮은 세부 밀도
- 포토 텍스처, 붓 자국, 과한 마모·균열, 탁한 전체 색보정 금지
- 몸 전체 왜곡 모션 금지. 준비 자세 → 발사 → 반동 → 복귀의 파츠 움직임 사용

## 변경 승인 단위

전체 자산을 한 번에 교체하지 않는다. 키아트 1세트, 아레나 타일 1세트, 기본 타워 6종, 대표 적·보스, 핵심 VFX와 UI를 한 화면에서 먼저 승인한다. 승인된 결과를 Dicekeep 자체 참조 세트로 고정한 뒤 같은 계열에 확장한다.

## SRCS 일괄 로더 기준

`npm run measure:asset-load`는 현재 `content.js`와 `game.js`의 실제 `loadAssets(SRCS)` 범위만 평가해 압축 전송량과 RGBA8 디코드 메모리를 계산한다. 2026-09-23 기준 일괄 로더는 770개 요청, 120,497,599 B(114.92 MiB) 전송, 456,974,188 B(435.80 MiB) 디코드다. 누락·중복·쿼리 변형·매니페스트 불일치·모바일 빌드 제외 참조는 0건이다.

이 수치는 현재 SRCS 일괄 로더만 고정하는 회귀 상한이며 브라우저 전체 부팅량은 아니다. HTML 이미지, 아이콘 프리로드 23개, 방향 아트 초기화와 CSS 요청은 후속 브라우저 계측에 포함한다. 로비 상호작용 전 80요청·10 MiB 목표는 그 전체 계측으로 검사한다. 별도 변경에서 타이틀/홈 → 공통 전투 → 선택 스테이지 또는 현재·다음 웨이브 → 장착 스킨 순으로 로더를 분리하며, 기존 동기 전투 시작 계약, 타워 스킨 고정 인덱스와 방향 아트 캐시를 보존한다.
