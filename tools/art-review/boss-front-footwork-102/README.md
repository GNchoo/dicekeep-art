# 보스 하향 발끝 수정 · v102

정면으로 내려오는 일부 이족보행 보스의 원본 발이 몸 중앙을 향해 안짱다리처럼 보였다. 명확한 대상 10종의 정면 다리 그림과 원본 관절 좌표를 함께 좌우 반전했다. 기존 보행 리그의 물리 좌우 ID·소켓·위상·링크 길이·보폭·수직 접지는 유지한다. 런타임에서 매 프레임 이미지를 가공하지 않고 미리 구운 8프레임을 사용한다. 새 이미지 생성 요청은 0회다.

대상은 b040/b040-2/b090/b090-2/b100 및 극한 b141/b141-2/b191/b191-2/b201이다. 이미 바깥을 향하는 b020/b050 계열, 거의 정면인 b010/b030 계열, 네발·비행 몬스터는 변경하지 않는다. [시각 검수](review.json)는 후보 80포즈에 대한 판단이며 실제 게임 검증과 구분한다.

정면의 `assetVersion:102`만 로더가 우선 사용한다. 측면·후면은 기존 93/101 URL을 유지한다. 게임과 두 검수 페이지는 수정된 manifest/로더를 `?v=102`로 읽으므로 오래된 정면 캐시가 다시 선택되지 않는다. 프레임마다 추가 이미지 변환·메모리 버퍼를 만들지 않는다.

## 재현

저장소 루트에서 실행한다. 새 출력 폴더를 사용하며 `--resume`로 과거 렌더를 재사용하지 않는다.

```powershell
node tools/build-directional-art.mjs --config=tools/art-review/directional-101/middle-waves/ground-next-rigs.json --out=gen/boss-front-footwork/middle --only=b040,b040-2
node tools/build-directional-art.mjs --config=tools/art-review/directional-101/late-waves/all-rigs.json --out=gen/boss-front-footwork/late --only=b090,b090-2,b100
node tools/build-extreme-art.mjs --config=tools/art-review/extreme-202/all-rigs.json --out=gen/boss-front-footwork/extreme --only=b141,b141-2,b191,b191-2,b201
node tools/check-directional-art.mjs gen/boss-front-footwork/middle --require-ready
node tools/check-directional-art.mjs gen/boss-front-footwork/late --require-ready
node tools/check-directional-art.mjs gen/boss-front-footwork/extreme --require-ready
node tools/preview-directional-motion.mjs gen/boss-front-footwork/middle
node tools/preview-directional-motion.mjs gen/boss-front-footwork/late
node tools/preview-directional-motion.mjs gen/boss-front-footwork/extreme
node --test tools/boss-front-footwork-test.mjs
node --test net/test/infinity-art.test.js
node tools/art-review/boss-front-footwork-102/promote.mjs
node tools/art-review/boss-front-footwork-102/record.mjs
```

기존/극한 canonical 설정과 상위 복사본·생성기를 함께 수정했다. 기존 1–101 release-builds 및 극한 v101 evidence는 당시의 원본 기록으로 남긴다. 이번 부분 교체의 근거는 이 폴더이며 과거 기록을 새 이미지의 검증인 것처럼 다시 서명하지 않는다.

승격기는 육안 승인에 고정한 manifest·QA·이동 증거의 SHA와 통과 여부를 먼저 확인한다. 다른 내용으로 재빌드했다면 다시 검수하고 승인 해시를 갱신해야 한다. 대상 ID·설정 해시도 검사하며 각 대상의 측면·후면 40파일 및 비정면 메타데이터가 현재 운영 파일과 같아야 진행한다. 정면 격자·피벗·스케일도 동일해야 한다. 정면 정지/걷기 20파일과 해당 inline fallback 10개만 교체한다. 나머지 211개 캐릭터 항목은 유지한다. `promote.mjs --check`는 파일을 쓰지 않고 모든 승격 조건을 검사한다.

## 확인한 범위

- 원본/후보 리그 10종의 주기당 256시점 비교: 고관절·무릎·발목·수직 접지 및 위상 보존, 발의 수평 오프셋만 반대 방향.
- 아트 캐시·방향·프로토콜 회귀 25건 통과. 정면만 v102, 기존/극한의 다른 방향은 각각 v93/v101이며 동일 요청은 재사용한다.
- 새 빌드 120개 이미지와 30개 inline fallback 디코드·해시 검사 통과. 런타임 교체는 그중 정면 20개다.
- 4방향 이동 검사 80개 다리 궤적, 실제 래스터 발 근접 1,920건 통과. 이 수치가 모든 프레임에서 발의 미끄러짐이 전혀 없다는 뜻은 아니다.
- 최종 정면 80포즈 독립 시각 검수 통과: 바깥 발끝, 무릎/발목 연결, 부자연스러운 겹침·잘림 없음.

압축된 원본 QA·이동 검사·manifest는 [evidence](evidence/index.json)에, 정면 전체 80포즈는 [첫 보드](evidence/front-poses-1.jpg)와 [두 번째 보드](evidence/front-poses-2.jpg)에 보관한다. 실제 게임·Android·운영 배포 결과는 이 PR의 최종 배포 기록에 추가한다.

## 실제 게임과 Android

운영 원본과 로컬 수정본을 각각 실제 게임에서 비교했다. 수정본은 10종의 하향 80포즈와 자연 이동 중 8프레임 순환을 모두 표시했고, 좌·우·상향 선택 30건도 통과했다. 측면·후면 40파일과 전체 메타데이터·fallback은 동일했다. 정면 시트 10개가 실제 `?v=102`로 요청되며 서버 응답 SHA도 일치했다. `game.js`는 기존 `f7322ccc…eb5988` 그대로다. 테스트는 게임 상태로 웨이브·위치를 고정하고 그림을 관찰했으며 게임 HTTP 응답이나 원화는 대체하지 않았다. 새 아트·페이지 오류는 0, 기존 선택형 BGM 404는 따로 기록했다.

실제 캡처로 만든 [b040 비교 GIF](evidence/b040-before-after.gif), [b090](evidence/b090-before-after.gif), [b201](evidence/b201-before-after.gif)는 고정 영역을 양쪽 모두 3배 확대한 8포즈 비교다. 150ms 재생은 검수용이며 게임 이동 속도 측정이 아니다.

실제 사용한 [검사 소스](evidence/runtime-checker.cjs)를 `gen/boss-front-footwork-runtime.cjs`에 복사하고 `E2E_BASE_URL`을 지정한 뒤 `node gen/boss-front-footwork-runtime.cjs <새-결과명>`으로 다시 실행할 수 있다. 원본 결과 디렉터리가 있을 때 `--compare=baseline`을 추가한다. 기존 결과가 있는 이름은 덮어쓰지 않는다.

Android `build:www → cap sync android → assembleDebug` 성공. 웹·네이티브·APK의 2,242개 파일 해시가 일치하며 직전 APK 근거와 비교해 정면 20개·아트 JS 3개·index·패키지 manifest만 바뀌었다. 나머지 2,217개 payload는 동일하다. 실기기 설치/프레임률 검증은 수행하지 않았다. 로컬 원자료는 `gen/android-boss-footwork/report.json`에 있다.
