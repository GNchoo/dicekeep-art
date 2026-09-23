# 캐주얼 적 아트 시범 — 여섯 종 (2026-09-23)

새 투기장의 간결한 선·큰 색면에 맞춰 인피니티의 **W001 쥐, W002 해골 병사, W003 후드 오우거, W004 까마귀, W005 창·방패 고블린, W008 시체파리 떼** 여섯 종을 다시 그려 세 방향 출력의 검증과 런타임 승격을 마쳤다. 각 종의 편집 대상·화풍 참조·분리형 소스·방향별 리그 및 검토 자료는 [`W001-RIG.md`](W001-RIG.md), 아래 W002 기록, [`W003-RIG.md`](W003-RIG.md), [`w004/README.md`](w004/README.md), [`W005-RIG.md`](W005-RIG.md), [`w008/README.md`](w008/README.md)에 있다. **나머지 웨이브와 보스 그림은 아직 다시 그리거나 교체하지 않았다.** 기존 모든 몬스터에 단순 필터를 일괄 적용하면 질감만 흐려져 형태와 화풍 차이를 해결하지 못한다.

## W002 해골 병사

새 투기장과 7~20성 타워의 큰 색면·굵은 외곽선에 맞춘 **인피니티 2웨이브 해골 병사**다. 세 방향의 새 그림과 걷기 시트를 검증·승격해 현재 게임에 적용했다. [`w002-arena-comparison.png`](w002-arena-comparison.png)은 기존 방향별 정지 그림, OpenCV 색/결 필터, 새 재작화를 각각 실제 50px 게임 높이와 160px 검토 높이로 같은 v126 아레나 위에 놓은 비교다. 필터는 어두운 비율과 실사형 얼굴을 바꾸지 못해 대량 적용하지 않는다.

## 선택 원본

- [`w002-side-casual-source.png`](w002-side-casual-source.png): 현행 `casual/enemies/inf/directional/w002-side.webp`을 편집 대상으로 한 1254×1254 RGBA 단일 정지컷. 둥근 투구/해골, 올리브 옷, 짧은 창과 두 장화를 유지했다.
- [`w002-side-puppet-casual-source.png`](w002-side-puppet-casual-source.png): 실제 측면 걷기 리그 원본인 `tools/art-review/pr29-gait/sources/w002-puppet.png`의 **몸통·두 다리 3분리 배치**를 편집 대상으로 한 1254×1254 RGBA 원본. 알파 16 초과 기준으로 연결된 덩어리는 정확히 3개다. 몸통과 다리 위치가 원본에서 달라진 만큼 리그 ROI·관절/피벗 좌표를 재측정했다.
- [`w002-front-back-puppet-casual-source.png`](w002-front-back-puppet-casual-source.png): 기존 복수 캐릭터 전후면 아틀라스의 W002 첫 행만 편집 대상으로 하고 새 측면 그림을 화풍 기준으로 삼은 2172×724 RGBA 원본. 전면 몸통·두 다리, 후면 몸통·두 다리의 여섯 덩어리가 정확히 분리돼 있다.

세 이미지는 Codex 내장 `image_gen` 편집으로 생성했다. 별도 API 키는 사용하지 않았다. 기존 복수 캐릭터 전후면 아틀라스는 유지하고 W002만 독립 자산으로 추출했다. W002의 세 방향 정지컷·8프레임 시트 6파일을 검증 빌드에서 `casual/enemies/inf/directional/`로 승격했다. 이후 전후면 무릎 굴절 방향을 바로잡은 수정 빌드는 뷰별 `assetVersion: 128`로 다시 생성했다. 매니페스트 스키마 `version: 93`은 유지한다.

## W002 전용 빌드 시범

`node tools/art-review/enemy-casual-2026-09-23/prepare-w002-rig.mjs`는 승인된 기존 W002 리그의 이동 거리·접지 구조를 복사하고, 새 투명 소스의 ROI·해시·소켓과 측면 피벗을 다시 측정해 [`w002-side-legacy-config.json`](w002-side-legacy-config.json) 및 [`w002-directional-rig.json`](w002-directional-rig.json)을 만든다. 전후면의 넓어진 장화 때문에 후면 다리 소켓을 좌우로 벌려 겹침을 줄였다. 세 방향 정지컷·8프레임·50px 미리보기에서 접지와 무릎을 확인한 뒤 이 **W002 후보만** `reviewApproved: true`로 표시했다.

```powershell
node tools/art-review/enemy-casual-2026-09-23/prepare-w002-rig.mjs
node tools/build-directional-art.mjs --config=tools/art-review/enemy-casual-2026-09-23/w002-directional-rig.json --out=gen/enemy-casual-w002-build
node tools/check-directional-art.mjs gen/enemy-casual-w002-build --require-ready
node tools/preview-directional-motion.mjs gen/enemy-casual-w002-build
```

2026-09-23 검사 결과: 세 방향 × 정지/8프레임의 12개 출력 파일 디코드·해시·출처 검증 **통과**, 움직임 거리/접지/무릎 기하 검사 **통과**, 각 방향 8개 고유 프레임. 측면 접지 무릎각 161~172°, 전후면 161°, 전후면 지지발의 투영 미끄럼은 부동소수점 오차 수준이다. 실제 50px 화면 크기를 모사한 [`세 방향 비교`](w002-three-view-comparison.png)와 [`8프레임 접촉 시트`](w002-walk-contact.png), [`세 방향 움직임 GIF`](w002-moving-preview.gif)을 눈으로 검토했다. 전면의 창·두 다리가 읽히며, 후면의 장화 겹침은 소켓 수정 후 해소됐다. 좌우로 뒤집어도 측면 무릎이 앞쪽으로 꺾인다. 전후면 또한 기존 v110의 `bend: -1`을 이어받아 앞쪽으로 꺾인다. 상체는 고무처럼 왜곡하지 않고 지지 다리에 따라 작은 수직 이동만 한다.

## 정확한 생성 프롬프트 1: 측면 정지컷

입력 이미지 1: `casual/enemies/inf/directional/w002-side.webp` — **편집 대상**.  
입력 이미지 2: `casual/towers/star-07-casual.png` — **화풍 전용 참조**.

> Use case: style-transfer. Asset type: Dicekeep Infinity wave 2 enemy directional game sprite, right-facing side view, cutout. Image 1 is the EDIT TARGET and defines the same single skeleton footman identity, side-facing silhouette, composition, helmet, olive tabard, short spear, brown boots, and approximate body proportions. Image 2 is STYLE-ONLY reference for the clean, reduced-line casual toy-fantasy visual language, thick warm-charcoal outer contour, broad color masses, controlled violet/blue/gold palette accents and two-step matte cel shading; DO NOT copy its tower shape, architecture, gems, or colors onto the skeleton. Repaint the skeleton as a polished friendly mobile-game sprite on a genuinely transparent background, with a larger expressive rounded ivory skull and easy-to-read empty eye sockets, simplified clean bones, sturdy toy-like correct two-legged anatomy, correctly forward-bending knees, boots contacting one common baseline. Keep the complete body and spear entirely inside canvas with generous clear padding, side view facing right, no pedestal or ground shadow. Use simple broad olive cloth and one-piece helmet/boots without distressed metal, texture, tiny rivets, dirt, grunge, photorealism, painterly grain, glow, or busy highlights. Crisp silhouette readable at 50-pixel displayed height. Preserve character identity and equipment. No other characters, scenery, floor, text, logo or watermark.

## 정확한 생성 프롬프트 2: 분리형 걷기 아틀라스

입력 이미지 1: `tools/art-review/pr29-gait/sources/w002-puppet.png` — **편집 대상/3분리 위치 원본**.  
입력 이미지 2: 이 폴더의 `w002-side-casual-source.png` — **화풍 전용 참조**.

> Use case: style-transfer. Asset type: editable 3-part cutout puppet atlas for a 2D side-facing skeleton footman walking rig. Image 1 is the EDIT TARGET for exact atlas arrangement and character identity. Image 2 is STYLE-ONLY reference for the newly approved clean casual skeleton design. Redraw Image 1 in Image 2's bold, simplified toy-fantasy style while preserving Image 1's THREE SEPARATE disconnected parts and their locations. LEFT: one torso/head/helmet/arms/olive tabard/short spear cutout only, ending neatly at a clear pelvis/hip connection with NO legs attached. UPPER RIGHT: one complete separate bone leg and brown boot cutout, knee bending forward/right. LOWER RIGHT: a second complete separate bone leg and brown boot cutout, knee bending forward/right. Match the original atlas's overall 1254-square composition, individual part sizes, orientations, top-left coordinates, large clear gutters, and visible hip/knee/ankle anatomy. Keep helmet, skull, spear, olive cloth, brown boots and right-facing side profile. Make each part a complete cohesive shape with smooth thick warm-charcoal outline, large flat color regions, clean two-step matte cel shading, almost no internal micro-lines. Genuinely transparent background, no checkerboard baked into output, no floor or shadow. No extra parts, joined legs, lettering, captions, boxes or watermark. This atlas must be separable into exactly the original three cutout regions, with no pixels crossing between them.

## 정확한 생성 프롬프트 3: 전후면 분리형 아틀라스

입력 이미지 1: 기존 `tools/art-review/directional-101/legacy-biped-01-front-back-parts.png`의 상단 360px W002 행 (`gen/enemy-filter-audit/w002-front-back-original-row.png`) — **편집 대상/여섯 부품의 순서 원본**.  
입력 이미지 2: 이 폴더의 `w002-side-casual-source.png` — **화풍 전용 참조**.

> Use case: style-transfer. Asset type: directional puppet source atlas for one skeleton footman. Image 1 is the EDIT TARGET and locks a WIDE SIX-PART ATLAS: from left to right (1) front-facing head/torso/arms/olive tabard/short spear with no legs attached; (2,3) two separate front-facing ivory bone legs wearing brown boots; (4) back-facing helmet/torso/arms/olive tabard with no legs attached; (5,6) two separate back-facing ivory bone legs wearing brown boots. Keep all six parts in these exact columns and relative sizes with generous gaps; do not join body and legs. Image 2 is STYLE-ONLY reference: the same newly designed friendly skeleton, broad rounded forms, thick smooth warm-charcoal exterior outline, clean bone, matte two-step cel shading, simplified helmet/cloth/boots, no tiny material distress. Front and back must clearly depict the SAME character and same outfit as Image 2. Create a genuinely transparent background and complete uncut pieces. No checkerboard baked into the output, no floor, no shadows, no text, no other characters, no extra detached pieces, no microtexture, no painterly grain. Wide horizontal composition, all six pieces visually separate so a walking rig can cut them out.
