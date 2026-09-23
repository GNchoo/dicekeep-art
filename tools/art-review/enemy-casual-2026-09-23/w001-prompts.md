# W001 역병쥐 캐주얼 재작화 원본

두 이미지 모두 Codex 내장 `image_gen`으로 편집했다. 별도 API 키는 사용하지 않았다. 첫 입력 이미지는 편집 대상, 두 번째는 화풍 전용 참조였다. `w001-side-puppet-casual-source.png`와 `w001-front-back-puppet-casual-source.png`는 별도의 분리형 리그 입력 시안이다. 현재 게임에 쓰인 아트와의 교체 여부는 세 방향 걷기 시트 검수 후 결정한다.

## 측면 몸통·앞다리·뒷다리

- 편집 대상: `tools/art-review/pr29-gait/sources/w001-anatomy-puppet.png`
- 화풍 참조: `tools/art-review/star-casual-2026-09-23/clean-07.png`
- 출력: `w001-side-puppet-casual-source.png`

> Use case: style-transfer. Asset type: editable puppet-parts atlas for the first enemy in a mobile tower-defense game. Image 1 is the EDIT TARGET and defines the exact identity, poses, parts layout and framing. Image 2 is STYLE-ONLY reference for its polished clean cel-shaded casual-game art; do not copy its castle, crystal, colors, or objects. Repaint Image 1 as the same cute black rat creature with one curved pink tail, orange expressive eyes and simple brown collar: a complete horizontal side-view body occupying the left area, one isolated front leg at top-right, one isolated hind leg below it. Preserve exactly three detached silhouette components and large empty gutters between them, approximate source body and leg proportions, attachment points, and right-facing direction. Simplify fur to a few broad charcoal shapes with warm edge highlights, large friendly expressive eye and cheek, clear dark outline, smooth two-step matte shading, minimal internal lines. Reduce realism and detail dramatically while preserving a recognizable rat and clean paw shape. Actual transparent background, not a drawn checkerboard. No ground, shadow, scenery, labels, extra limbs, teeth, wounds, gore, text, watermark. One square full-resolution atlas, each part complete and separated.

## 정면·후면 몸통과 각 두 다리

- 편집 대상: `w001-front-back-original-crop.png` (기존 `legacy-ground-02-front-back-parts.png`의 W001 첫 행만 내용 변경 없이 잘라 보존)
- 화풍 참조: `w001-side-puppet-casual-source.png`
- 출력: `w001-front-back-puppet-casual-source.png`

> Use case: style-transfer. Asset type: transparent six-piece puppet atlas for the front and rear walking views of the same small rat enemy. Image 1 is EDIT TARGET and defines the exact layout, orientation and six isolated component roles. Image 2 is STYLE-ONLY reference for the newly approved casual side-view identity: same charcoal rat, coral-pink ears and tail, orange eyes, simple brown collar, bold outlines and broad matte two-tone shapes. Redraw Image 1's FRONT torso at left, two detached front-view paws immediately to its right, BACK torso next, then two detached back-view paws at far right. Preserve the general left-to-right placements, all six completely separate with clear empty gutters, facing front/back respectively. Match Image 2's rounded clean cheerful casual game style; larger expressive eyes in front; simplified matte charcoal fur with only sparse large tufts; neat brown collar and pink curved tail. Preserve the compact squat quadruped body and small paws. Actual transparent background; no checkerboard or ground. No extra components, no merged limb and body, no text, labels, scenery, realism, tiny hair texture, scratches, gore or watermark. Deliver a single wide landscape sprite parts atlas, each component complete and uncut.
