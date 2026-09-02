# Grok 전달용 브리프 — 테마 타일셋 (그대로 붙여넣기)

아래 구분선 안의 내용을 Grok 에게 그대로 전달하면 된다. 프롬프트 원본·연결 방법은 `ART-PROMPTS.md` §0.

---

안녕하세요. 캐주얼 타워 디펜스 게임 **「주사위 성채 (Dicekeep)」** 의 맵 타일셋 생성을 부탁합니다. 저장소: https://github.com/GNchoo/dicekeep-art

## 상황

맵을 통째로 그리던 방식을 버렸습니다. 이제 **코드가 16×9 칸 격자 위에 길·석단·시작·도착 위치를 설계**하고, 당신이 만들어 줄 **테마별 타일 조각**을 그 위에 입힙니다. 그래서 그림 안에 길이나 건물을 배치할 필요가 전혀 없고, **조각 하나하나가 정확한 규격**이기만 하면 됩니다. 파일을 지정한 이름으로 저장하기만 하면 게임이 바로 씌웁니다.

테마 6종 × 조각 15개 = **총 90장**입니다. **먼저 「평원」 15장만 만들어 주세요.** 게임에 넣어 이음새·크기를 확인한 뒤 나머지 5테마를 같은 규격으로 진행합니다.

## 반드시 지킬 공통 규칙

1. **스타일**: Kingdom Rush + Random Dice. 손그림 캐주얼, 두꺼운 깔끔한 외곽선, 채도 높은 색, **3/4 탑다운(살짝 기울여 내려다본) 시점**. 글자·워터마크·UI 금지. 6테마가 한 게임처럼 보여야 하므로 선 굵기·채도·명암 처리를 통일하세요.
2. **도로 타일 4종 + 물 타일**은 **정사각형 1024×1024**. 게임은 이걸 64×64 로 줄여 격자에 깔고 **90° 단위로 회전**합니다. 그러므로
   - 조명은 **정수리에서 내리쬐는 평평한 조명**, 한쪽으로 늘어지는 그림자 금지 (회전해도 어색하지 않게).
   - 길은 **타일 가장자리에서 가장자리까지** 이어지고, 가장자리에서 **딱 잘린 단면**이어야 합니다 (옆 타일과 맞닿아 이어짐). 길 폭은 **타일 폭의 56%**, 타일 정중앙. 길 가장자리는 부드럽게 흐려도 되지만 폭은 모든 타일에서 같아야 합니다.
   - 길 바깥은 **단색 연회색 (#C8C8C8) 만**. 풀·흙·바닥 무늬를 그리지 마세요. 게임이 회색을 지우고 바닥 위에 얹습니다.
3. **바닥(floor)** 은 **16:9, 1280×720**, 화면 가득. **길·석단·건물·큰 소품이 전혀 없는 빈 땅**만 그립니다. 은은한 얼룩·풀결·작은 자갈 정도만.
4. **석단·시작·도착·소품(prop)** 은 **연회색 (#C8C8C8) 단색 배경에 오브젝트 하나만**, 정중앙, 여백 넉넉히, 바닥에 깔리는 그림자는 오브젝트 바로 밑에 아주 짧게만. 게임이 회색을 지우고 자동 크롭해서 **바닥 중앙 아래쪽을 기준**으로 세웁니다.
5. **크기 감**: 게임 안에서 석단은 60px 폭, 시작 포탈 84px 높이, 도착 성 128px 높이, 큰 나무 96px, 작은 나무 80px, 바위 40px, 덤불 42px, 꽃무리 30px, 상징물 70px 로 그려집니다. 비율만 맞으면 됩니다(모두 1024×1024 로 만들어도 됨).
6. 파일명은 아래 표 그대로. `casual/tiles/<테마>/` 폴더에 저장.

## 조각 15개 (모든 테마 공통 프롬프트 — `{THEME}` 자리에 아래 테마 문단을 넣으세요)

| 파일 | 프롬프트 |
|---|---|
| `floor.jpg` (1280×720) | `Hand-painted casual tower defense game ground texture, Kingdom Rush and Random Dice style, 3/4 top-down view, 16:9 landscape, full-bleed. An EMPTY expanse of {THEME_FLOOR}. Gentle color variation, subtle grass/soil strokes, a few tiny pebbles. NO roads, NO paths, NO tower pads, NO buildings, NO trees, NO large objects, NO characters, NO text, NO watermark. Thick clean outlines where applicable, saturated colors, flat overhead lighting.` |
| `road-straight.png` (1024²) | `Square game tile 1:1, hand-painted casual tower defense style, 3/4 top-down view, flat overhead lighting with no cast shadows. A STRAIGHT road running horizontally from the exact LEFT edge to the exact RIGHT edge, perfectly centered, road width exactly 56% of the tile height, cut flat at both edges so it connects to neighboring tiles. The road is {THEME_ROAD}. Everything outside the road is solid plain light gray #C8C8C8 with no texture. No text, no watermark.` |
| `road-corner.png` | `Square game tile 1:1, same style as the straight road tile. A road that enters from the exact TOP edge center and leaves through the exact RIGHT edge center, turning with a smooth quarter-circle curve, road width exactly 56% of the tile, cut flat at both edges. The road is {THEME_ROAD}. Everything outside the road is solid plain light gray #C8C8C8. Flat overhead lighting, no cast shadows, no text.` |
| `road-t.png` | `Square game tile 1:1, same style as the straight road tile. A T-junction: a horizontal road from the exact LEFT edge to the exact RIGHT edge, plus a branch going down to the exact BOTTOM edge center; nothing connects to the top edge. Road width exactly 56% of the tile everywhere, cut flat at the three edges. The road is {THEME_ROAD}. Outside the road solid plain light gray #C8C8C8. Flat overhead lighting, no text.` |
| `road-cross.png` | `Square game tile 1:1, same style as the straight road tile. A four-way crossroad connecting the exact centers of all four edges, road width exactly 56% of the tile, cut flat at every edge. The road is {THEME_ROAD}. Outside the road solid plain light gray #C8C8C8. Flat overhead lighting, no text.` |
| `water.png` | `Square seamless game tile 1:1, hand-painted casual style, 3/4 top-down view, filling the WHOLE square edge to edge with {THEME_WATER}. Must tile seamlessly when repeated in a grid: no borders, no shore, no rocks, no objects, no vignette. Flat overhead lighting, no text.` |
| `pad.png` | `Single game object on a solid plain light gray #C8C8C8 background, centered, generous margins. A round flat stone tower foundation pad seen from a 3/4 top-down view (an ellipse about twice as wide as tall), {THEME_PAD}. Empty on top so a tower can be placed on it. Thick clean outlines, hand-painted casual style, no cast shadow beyond the rim, no text.` |
| `start.png` | `Single game object on a solid plain light gray #C8C8C8 background, centered. The ENEMY SPAWN GATE: {THEME_START}, with a swirling glowing purple magic portal inside the opening. 3/4 top-down view, hand-painted casual Kingdom Rush style, thick clean outlines, the base sits flat on the ground, no text.` |
| `end.png` | `Single game object on a solid plain light gray #C8C8C8 background, centered. The PLAYER'S STRONGHOLD to defend: {THEME_END}, with a large glowing crystal on top. Roughly twice as tall as wide, 3/4 top-down view, hand-painted casual Kingdom Rush style, chibi-cute proportions, thick clean outlines, the base sits flat on the ground, no text.` |
| `prop-1.png` | `Single game object on a solid plain light gray #C8C8C8 background, centered. A large {THEME_TREE1}, 3/4 top-down view, hand-painted casual style, thick clean outlines, rounded chibi-cute shapes, base flat on the ground, no text.` |
| `prop-2.png` | `Single game object on a solid plain light gray #C8C8C8 background, centered. A medium {THEME_TREE2}, same style as prop-1 but clearly a different silhouette, no text.` |
| `prop-3.png` | `Single game object on a solid plain light gray #C8C8C8 background, centered. A small {THEME_ROCK}, 3/4 top-down view, hand-painted casual style, thick clean outlines, no text.` |
| `prop-4.png` | `Single game object on a solid plain light gray #C8C8C8 background, centered. A low round {THEME_BUSH}, 3/4 top-down view, hand-painted casual style, thick clean outlines, no text.` |
| `prop-5.png` | `Single game object on a solid plain light gray #C8C8C8 background, centered. A tiny ground detail cluster: {THEME_SMALL}, seen from above, hand-painted casual style, no text.` |
| `prop-6.png` | `Single game object on a solid plain light gray #C8C8C8 background, centered. A landmark prop: {THEME_ARTIFACT}, 3/4 top-down view, hand-painted casual Kingdom Rush style, thick clean outlines, base flat on the ground, no text.` |

## 테마 6종 (위 `{THEME_…}` 자리에 넣을 문단)

### 1. `plains` 평원 (먼저 이것부터)
- THEME_FLOOR: `bright sunny meadow grass, fresh green with lighter yellow-green patches and tiny daisies`
- THEME_ROAD: `a packed sandy-tan dirt road with soft darker edges, a few small pebbles and faint wheel ruts`
- THEME_WATER: `calm bright blue pond water with soft ripples and a few small lily pads`
- THEME_PAD: `pale gray flagstones ringed with a low mossy stone rim and a few daisies at the base`
- THEME_START: `a mossy stone archway gate built into a small grassy mound, wooden fence posts at each side`
- THEME_END: `a small friendly stone keep with a red-tiled roof, blue banners and a wooden gate`
- THEME_TREE1: `round leafy apple tree with red apples and a thick brown trunk`
- THEME_TREE2: `slim young birch tree with a bright green canopy`
- THEME_ROCK: `gray boulder with a bit of moss`
- THEME_BUSH: `green bush dotted with pink wildflowers`
- THEME_SMALL: `a tuft of grass with three small white-and-yellow daisies`
- THEME_ARTIFACT: `a wooden signpost with two arrow boards, a hay bale leaning against it`

### 2. `forest` 숲
- THEME_FLOOR: `dense forest floor of deep green grass and moss with scattered fallen leaves and small ferns`
- THEME_ROAD: `a dark earthen forest trail with exposed roots and moss creeping along the edges`
- THEME_WATER: `clear forest stream water, deep teal-green with gentle ripples`
- THEME_PAD: `dark mossy stones fitted in a ring, a few acorns and mushrooms at the rim`
- THEME_START: `a hollow ancient oak trunk whose opening forms a gate, roots spreading on the ground`
- THEME_END: `an elven treehouse fortress: a stout tree with a wooden watchtower and green banners in its branches`
- THEME_TREE1: `tall dark-green pine tree with layered boughs`
- THEME_TREE2: `broad old oak tree with a gnarled trunk`
- THEME_ROCK: `moss-covered boulder with a red-capped mushroom beside it`
- THEME_BUSH: `fern bush with fanned fronds`
- THEME_SMALL: `a cluster of three small red-and-white spotted mushrooms`
- THEME_ARTIFACT: `a carved wooden totem pole with an owl on top and a hanging lantern`

### 3. `lake` 호수
- THEME_FLOOR: `soft lakeside meadow: pale green grass fading into light sandy patches, tiny pebbles and reeds`
- THEME_ROAD: `a pale sandy path with rounded pebbles and damp darker sand at the edges`
- THEME_WATER: `calm bright lake water, sky-blue with soft reflections and a few lily pads`
- THEME_PAD: `flat beach stones fitted in a ring, a few seashells and reeds at the base`
- THEME_START: `a weathered stone sea-cave arch with barnacles and a fishing net hanging on one side`
- THEME_END: `a white-and-red lighthouse fortress on a stone base with a small dock and blue flags`
- THEME_TREE1: `weeping willow tree with long drooping branches`
- THEME_TREE2: `slender tree with a round pale-green canopy`
- THEME_ROCK: `smooth wet gray-blue river stone`
- THEME_BUSH: `clump of tall green reeds with brown cattails`
- THEME_SMALL: `three lily pads with one pink lotus flower`
- THEME_ARTIFACT: `a wooden pier post with a tied rowboat and a lantern`

### 4. `darkforest` 어두운 숲
- THEME_FLOOR: `gloomy night forest floor: dark blue-green grass, fallen dead leaves, faint mist patches`
- THEME_ROAD: `a dark muddy trail with twisted roots, faint purple mist and scattered small bones`
- THEME_WATER: `murky dark swamp water, blue-black with pale green glow patches and bubbles`
- THEME_PAD: `cracked dark stones fitted in a ring with faint purple glowing runes`
- THEME_START: `a crooked iron-and-stone gate wrapped in thorny vines, lit by a purple glow`
- THEME_END: `a witch's crooked tower with a purple pointed roof, glowing windows and hanging cauldrons`
- THEME_TREE1: `twisted dead tree with clawing bare branches`
- THEME_TREE2: `gnarled dark tree with a hollow face and a few dark leaves`
- THEME_ROCK: `jagged dark rock with a glowing purple mushroom`
- THEME_BUSH: `thorny bramble bush with a spider web`
- THEME_SMALL: `a cluster of glowing purple mushrooms`
- THEME_ARTIFACT: `a leaning old tombstone with a raven perched on top and a candle`

### 5. `castle` 성
- THEME_FLOOR: `a royal courtyard of light gray flagstones with faint moss between the stones`
- THEME_ROAD: `a neatly paved cobblestone road with a lighter stone border on both sides`
- THEME_WATER: `castle moat water, deep blue with gentle ripples`
- THEME_PAD: `a polished round stone dais with a golden rim and a blue rune circle`
- THEME_START: `an iron portcullis gate in a stone wall with two torches`
- THEME_END: `a grand royal castle keep with tall towers, golden roofs and red-and-gold banners`
- THEME_TREE1: `tall trimmed cypress tree in a stone planter`
- THEME_TREE2: `round trimmed topiary tree in a golden pot`
- THEME_ROCK: `a marble statue pedestal with a small stone lion`
- THEME_BUSH: `neatly trimmed square hedge with red roses`
- THEME_SMALL: `a small stone flower planter with red and white flowers`
- THEME_ARTIFACT: `a stone fountain with a golden spout and blue water`

### 6. `hell` 지옥
- THEME_FLOOR: `cracked dark volcanic ground, ash-gray and dark maroon with faint red glow in the cracks`
- THEME_ROAD: `a black obsidian road with glowing orange cracks and ember flecks along the edges`
- THEME_WATER: `bright molten lava, orange-yellow with dark cooling crust patches`
- THEME_PAD: `a ring of dark basalt slabs with glowing red runes`
- THEME_START: `a fanged demonic gate of black iron and bone, fire licking from the top`
- THEME_END: `the demon lord's obsidian throne fortress with horns, spikes and a huge red crystal`
- THEME_TREE1: `charred dead tree with glowing embers on its branches`
- THEME_TREE2: `tall black spike rock formation glowing red at the cracks`
- THEME_ROCK: `dark brimstone boulder with orange crystal shards`
- THEME_BUSH: `pile of bones and skulls`
- THEME_SMALL: `three small orange fire crystals in ash`
- THEME_ARTIFACT: `a demonic totem of skulls and chains with a burning brazier`

## 저장 파일명 (테마마다 같음)

```
casual/tiles/<theme>/floor.jpg
casual/tiles/<theme>/road-straight.png   road-corner.png   road-t.png   road-cross.png   water.png
casual/tiles/<theme>/pad.png   start.png   end.png
casual/tiles/<theme>/prop-1.png … prop-6.png
```

`<theme>` 는 `plains`, `forest`, `lake`, `darkforest`, `castle`, `hell`.

## 납품 순서

1. `plains` 15장 → 게임에서 확인 (이음새·크기·회색 제거 상태)
2. 문제 없으면 `forest`, `lake`, `darkforest`, `castle`, `hell` 순으로 15장씩

문제가 있으면 해당 조각만 다시 만들면 됩니다. 조각 하나가 없어도 게임은 그 자리만 코드 그림으로 대신하므로 부분 납품도 괜찮습니다.

---
