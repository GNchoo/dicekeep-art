# Grok 전달용 브리프 — 테마 타일셋 (그대로 붙여넣기)

아래 구분선 안의 내용을 Grok 에게 그대로 전달하면 된다. 프롬프트 원본·연결 방법은 `ART-PROMPTS.md` §0.

---

안녕하세요. 캐주얼 타워 디펜스 게임 **「주사위 성채 (Dicekeep)」** 의 맵 타일셋 생성을 부탁합니다. 저장소: https://github.com/GNchoo/dicekeep-art

## 상황

맵을 통째로 그리던 방식을 버렸습니다. 이제 **코드가 16×9 칸 격자 위에 길·석단·시작·도착 위치를 설계**하고, 당신이 만들어 줄 **테마별 조각**을 그 위에 입힙니다. 그림 안에 길이나 건물을 배치할 필요가 전혀 없습니다.

**도로와 물은 "모양"이 아니라 "질감"만 받습니다.** 길의 모양·폭·코너·합류는 코드가 그리고, 당신이 준 이음새 없는 질감으로 표면을 채웁니다. (직선·코너·T·십자 타일 방식은 폭과 위치가 장마다 달라져 폐기했습니다. 이미 만든 `road-straight/corner/t/cross.png` 는 더 이상 쓰지 않습니다.)

테마 6종 × 조각 12개 = **총 72장**입니다. **평원은 이미 14장이 들어가 있으니 `road.png` 1장만 더** 만들어 주세요. 확인 후 나머지 5테마를 12장씩 진행합니다.

## 반드시 지킬 공통 규칙

1. **스타일**: Kingdom Rush + Random Dice. 손그림 캐주얼, 두꺼운 깔끔한 외곽선, 채도 높은 색, **3/4 탑다운(살짝 기울여 내려다본) 시점**. 글자·워터마크·UI 금지. 6테마가 한 게임처럼 보여야 하므로 선 굵기·채도·명암 처리를 통일하세요.
2. **도로 질감(`road.png`)과 물 질감(`water.png`)** 은 **정사각형 1024×1024 를 가장자리까지 가득 채우는 표면 재질**입니다. 게임이 이걸 반복 패턴으로 깔아 길과 물의 모양을 채웁니다. 그러므로
   - **이음새 없이 반복**되어야 합니다: 네 변이 서로 이어지게, 테두리·비네팅·큰 물체·글자 없이 고른 재질만.
   - 조명은 **정수리에서 내리쬐는 평평한 조명**, 한쪽으로 늘어지는 그림자 금지.
   - 길 가장자리·경계는 그리지 마세요(코드가 어두운 테두리와 돌을 얹습니다). 물도 물가·바위 없이 물 표면만.
3. **바닥(floor)** 은 **16:9, 1280×720**, 화면 가득. **길·석단·건물·큰 소품이 전혀 없는 빈 땅**만 그립니다. 은은한 얼룩·풀결·작은 자갈 정도만.
4. **석단·시작·도착·소품(prop)** 은 **연회색 (#C8C8C8) 단색 배경에 오브젝트 하나만**, 정중앙, 여백 넉넉히, 바닥에 깔리는 그림자는 오브젝트 바로 밑에 아주 짧게만. 게임이 회색을 지우고 자동 크롭해서 **바닥 중앙 아래쪽을 기준**으로 세웁니다.
5. **크기 감**: 게임 안에서 석단은 60px 폭, 시작 포탈 84px 높이, 도착 성 128px 높이, 큰 나무 96px, 작은 나무 80px, 바위 40px, 덤불 42px, 꽃무리 30px, 상징물 70px 로 그려집니다. 비율만 맞으면 됩니다(모두 1024×1024 로 만들어도 됨). 도로 질감은 160px, 물 질감은 256px 마다 반복됩니다.
6. 파일명은 아래 표 그대로. `casual/tiles/<테마>/` 폴더에 저장.

## 조각 12개 (모든 테마 공통 프롬프트 — `{THEME}` 자리에 아래 테마 문단을 넣으세요)

| 파일 | 프롬프트 |
|---|---|
| `floor.jpg` (1280×720) | `Hand-painted casual tower defense game ground texture, Kingdom Rush and Random Dice style, 3/4 top-down view, 16:9 landscape, full-bleed. An EMPTY expanse of {THEME_FLOOR}. Gentle color variation, subtle grass/soil strokes, a few tiny pebbles. NO roads, NO paths, NO tower pads, NO buildings, NO trees, NO large objects, NO characters, NO text, NO watermark. Thick clean outlines where applicable, saturated colors, flat overhead lighting.` |
| `road.png` (1024²) | `Seamless square game texture 1:1, hand-painted casual tower defense style, 3/4 top-down view, filling the WHOLE square edge to edge with the SURFACE of {THEME_ROAD}. Must tile seamlessly when repeated in a grid: no borders, no edges of the road, no shoulders, no grass, no objects, no vignette, no text. Even flat overhead lighting, medium detail so it still reads when shrunk.` |
| `water.png` | `Seamless square game texture 1:1, hand-painted casual style, 3/4 top-down view, filling the WHOLE square edge to edge with {THEME_WATER}. Must tile seamlessly when repeated in a grid: no borders, no shore, no rocks, no objects, no vignette. Flat overhead lighting, no text.` |
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

### 1. `plains` 평원 (`road.png` 만 남음 — 나머지 14장은 납품 완료)
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
casual/tiles/<theme>/road.png   water.png          (질감, 이음새 없이 반복)
casual/tiles/<theme>/pad.png   start.png   end.png (오브젝트, 회색 배경)
casual/tiles/<theme>/prop-1.png … prop-6.png       (오브젝트, 회색 배경)
```

`<theme>` 는 `plains`, `forest`, `lake`, `darkforest`, `castle`, `hell`.

## E. 인피니티 갓챠 에셋 20장 (성 타워 14 + 다면체 주사위 5 + 상자 1)

인피니티에서 골드로 **보물상자**를 사면 다면체 주사위(d1·d4·d6·d8·d12·d20)가 나오고, 굴려 나온 숫자가 타워의 **성(★)** 이 됩니다. 1~6성은 기존 `t1-a`~`t6-a`, **7~20성은 새 히든 타워**입니다. 그림이 없는 동안은 6눈 타워에 별 배지를 얹어 동작합니다.

### E-1. 성 타워 14장 → `casual/towers/star-07.png` … `star-20.png` (1024², 회색 배경, `t6-a.png` 와 같은 박스 핏·받침·시점)

공통 프롬프트:
```text
Single tower sprite on a solid plain light gray #C8C8C8 background, centered, same 3/4 top-down view, same footprint and same round stone base as the reference tower t6-a.png. Hand-painted casual Kingdom Rush and Random Dice style, chibi-cute proportions, thick clean outlines, saturated colors. A HIDDEN LEGENDARY dice tower of rank {STAR}: {BAND}. The tower is built around a large glowing die showing {STAR} pips or the number {STAR}. No text, no watermark.
```
| 성 | {BAND} |
|---|---|
| 7~10 별빛 첨탑 | `a slender starlight spire of pale blue crystal with silver trim, small floating star shards, soft cyan glow — each rank slightly taller and brighter than the last` |
| 11~14 성운 요새 | `a violet nebula fortress of dark stone wrapped in swirling purple-pink galaxy energy, floating rune rings, amethyst crystals — each rank adds another orbiting ring` |
| 15~18 천공 옥좌 | `a golden sky throne: white marble and gold with wings, halo rings of light, small clouds around the base — each rank adds more wings and gold` |
| 19~20 차원 군주 | `a dimension lord's obelisk: black void crystal cracked open with rainbow light pouring out, reality-tear effects, tiny orbiting dice — rank 20 is the grandest object in the game` |

파일명 `star-07.png` … `star-20.png` (두 자리). 크기감: 게임에서 96px 높이 박스에 맞춰 줄어듭니다. 밴드 안에서 숫자가 오를수록 조금씩 더 웅장하게.

### E-2. 다면체 주사위 5장 → `dice/poly-d1.png`, `poly-d4.png`, `poly-d8.png`, `poly-d12.png`, `poly-d20.png` (1024², 회색 배경)

```text
Single polyhedral game die on a solid plain light gray #C8C8C8 background, centered, large, slightly tilted 3/4 view, hand-painted casual style with thick clean outlines: {DIE}. Ivory body with the numbers engraved in dark red like the game's existing d6 (dice-1.png). Soft rim light, no cast shadow beyond the base, no text other than the die numbers, no watermark.
```
| 파일 | {DIE} |
|---|---|
| `poly-d1.png` | `a small round pebble-like "one-eyed" die with a single dark red pip, dull and slightly cracked (the dud)` |
| `poly-d4.png` | `a four-sided tetrahedron die showing the numbers 1-4 on its faces` |
| `poly-d8.png` | `an eight-sided octahedron die with a faint blue crystal tint` |
| `poly-d12.png` | `a twelve-sided dodecahedron die with a violet amethyst tint and tiny sparkles` |
| `poly-d20.png` | `a twenty-sided icosahedron die made of gold-veined crystal, glowing, with the 20 face turned to the viewer` |

### E-3. 보물상자 1장 → `ui/chest.png` (1024², 회색 배경)

```text
Single closed treasure chest icon on a solid plain light gray #C8C8C8 background, centered, 3/4 view, hand-painted casual Kingdom Rush style, dark wood with gold bands and a glowing golden lock, a few dice peeking from under the lid, thick clean outlines, no text, no watermark.
```

## F. 인피니티 아레나 조각 9장 → `casual/tiles/arena/` — **납품 완료 (2026-09-03)**

인피니티 맵(랜덤다이스식 보드 + 둘레 트랙)은 코드가 모양을 그리고, 아래 조각으로 표면과 장식을 입힙니다. 통일 테마: **어두운 보라빛 밤의 투기장, 닳은 회보라 석판, 금색 룬 상감, 횃불 빛** (`dark violet night coliseum, worn gray-violet flagstones, gold rune inlays, torchlight`).

### F-1. 질감 3장 (정사각 1024², 가장자리까지 가득, 이음새 없이 반복, 물체·테두리·글자 없음, 평평한 조명)

| 파일 | 프롬프트 |
|---|---|
| `floor.jpg` (1280×720 만 예외) | `Hand-painted casual tower defense arena FLOOR ONLY, 16:9, full-bleed: a dark violet night coliseum ground of large worn gray-violet flagstones with faint gold rune inlays and torchlight falling from outside the frame. EMPTY: no track, no roads, no board, no pads, no pillars, no braziers, no characters, no text.` |
| `road.png` | `Seamless square game texture 1:1, filling the whole square edge to edge with the SURFACE of a worn pale sandstone racing track: fitted flagstones with thin dark joints, small chips and dust. Must tile seamlessly, no borders, no edges, no objects, flat overhead lighting, no text.` |
| `board.png` | `Seamless square game texture 1:1, filling the whole square edge to edge with the SURFACE of a dark violet-gray polished stone slab with faint gold rune engravings and subtle cracks. Must tile seamlessly, no borders, no objects, flat overhead lighting, no text.` |

### F-2. 오브젝트 6장 (1024², 연회색 #C8C8C8 배경에 오브젝트 하나, 정중앙, 3/4 탑다운, 바닥 그림자는 바로 밑에 짧게)

| 파일 | 게임 크기 | 프롬프트 |
|---|---|---|
| `pad.png` | 폭 60 | `a sunken round stone socket in a violet stone floor, 3/4 top-down ellipse about twice as wide as tall, dark recessed center with a thin gold rune ring around the rim, empty so a tower can stand in it` |
| `start.png` | 높이 84 | `an arched black-iron and stone gate with a swirling purple magic portal inside, torches on both sides` |
| `end.png` | 높이 128 | `a stone shrine altar holding a large glowing cyan crystal, gold rune rings on the base, roughly twice as tall as wide` |
| `prop-1.png` | 높이 56 | `a stone brazier bowl on a short pedestal, unlit (the game animates the flame), violet stone with gold trim` |
| `prop-2.png` | 높이 84 | `a tall violet stone pillar with a gold cap and a floating purple crystal on top, small purple banner` |
| `prop-3.png` | 높이 40 | `a small pile of broken stone rubble with a cracked dice fragment` |

공통 문구를 앞에 붙이세요: `Hand-painted casual Kingdom Rush and Random Dice style, chibi-cute proportions, thick clean outlines, saturated colors, dark violet coliseum theme with gold accents.`

## 납품 순서

1. `plains` 의 `road.png` 1장 → 게임에서 확인 (길 표면이 자연스럽게 반복되는지)
2. 문제 없으면 `forest`, `lake`, `darkforest`, `castle`, `hell` 순으로 12장씩
3. 인피니티 갓챠 에셋(E): 다면체 주사위 5장 → 성 타워 14장(7~20 순서) → 상자

문제가 있으면 해당 조각만 다시 만들면 됩니다. 조각 하나가 없어도 게임은 그 자리만 코드 그림으로 대신하므로 부분 납품도 괜찮습니다.

---

## G. 출시용 UI·아이콘 배치 (2026-09-06, 그대로 붙여넣기)

> 이 절만 따로 복사해 Grok 에게 전달해도 된다. 전체 목록·9-slice 설명·스크린샷 가이드·연결 방법은 `ART-PROMPTS.md` §7.

---

안녕하세요. 「주사위 성채 (Dicekeep)」 를 Play 스토어 / App Store 에 출시하려고 합니다. 앱 아이콘·스플래시·인게임 UI 프레임·아이콘·연출 시트를 부탁합니다. 스타일은 지금까지와 같이 **Kingdom Rush + Random Dice 캐주얼 치비, 두꺼운 외곽선**이고, 기존 `ui/gold.png`·`ui/heart.png`·`ui/title-keyart.jpg` 와 톤을 맞춰 주세요.

### 반드시 지킬 공통 규칙

1. **UI 프레임·버튼·아이콘·로고는 투명 배경 PNG(알파 포함)** 입니다. 이번 배치는 지금까지의 회색 배경 방식이 **아닙니다** — 게임이 회색을 지우지 않고 그림을 그대로 씁니다. 회색·흰색 배경이 남으면 화면에 네모가 그대로 보입니다.
2. **VFX 2×2 시트만** 예전처럼 **연회색 #C8C8C8 배경**입니다 (2열 2행, 좌상→우상→좌하→우하 = 프레임 0,1,2,3, 네 칸 같은 크기·같은 중심). 단품 VFX(링·빛기둥·반짝이)는 투명 PNG.
3. **글자를 절대 넣지 마세요.** 특히 한글은 깨집니다. 제목·라벨·숫자·"DICEKEEP" 모두 게임이 글꼴로 얹습니다. 아이콘의 `?` `✕` `←` `∞` `▶` 는 글꼴이 아니라 그려진 도형입니다.
4. **크기·비율**: 표의 크기로 저장해 주세요. 큰 해상도로 만들어 축소해도 되지만 비율(1:1, 2:1, 4:1)은 생성 때부터 맞춰야 합니다. 앱 아이콘·스플래시·적응형 배경은 **불투명(알파 없음)**.
5. 팔레트: 금색 `#e8b64a`/`#ffd452`, 어두운 나무 `#3a2c1b`/`#2a1e12`/`#1c1409`, 크림 `#e9dfc4`, 강조 초록 `#8ef0b0` · 마젠타 `#ff7ad9` · 파랑 `#7fd4ff` · 빨강 `#ff7a7a` · 보라 `#c78bff`.
6. 파일명은 표 그대로.

### 파일명

| 파일 | 크기 | 배경 |
|---|---|---|
| `resources/icon-only.png` | 1024² | 불투명 풀블리드 |
| `resources/icon-foreground.png` | 1024² | 투명 (엠블럼은 중앙 66% 안) |
| `resources/icon-background.png` | 1024² | 불투명 질감 |
| `resources/splash.png`, `resources/splash-dark.png` | 2732² | 불투명 `#0d0b09` (요소는 중앙 1200² 안) |
| `ui/splash-logo.png` | 1024² | 투명 |
| `ui/logo.png` | 1024×512 | 투명 (아래 35% 비움) |
| `store/feature-graphic.png` | 1024×500 | 불투명 (왼쪽 40% 비움) |
| `ui/frame-panel.png`, `ui/frame-card.png` | 96² | 투명, 9-slice 24 |
| `ui/btn-gold.png` `btn-green.png` `btn-magenta.png` `btn-danger.png` `btn-violet.png` | 96×48 | 투명, 9-slice 16 |
| `ui/chip-bar.png` | 192×48 | 투명, 9-slice 20 |
| `ui/slot-socket.png` | 256² | 투명 |
| `ui/icon-<name>.png` ×23 (또는 `ui/icons-sheet.png` 4×6 그리드 1024²) | 64² | 투명 |
| `vfx/acquire-burst-2x2.png`, `vfx/confetti-2x2.png`, `vfx/chest-open-2x2.png` | 1024² | 회색 #C8C8C8 시트 |
| `vfx/acquire-ring.png`, `vfx/acquire-ring-rainbow.png` | 512² | 투명 |
| `vfx/acquire-column.png` | 256×1024 | 투명 |
| `vfx/star-spark.png` | 128² | 투명 |
| `ui/chest.png` | 1024² | 회색 #C8C8C8 (§E-3 과 같음) |

### G-1. 앱 아이콘 → `resources/icon-only.png` (1024², 불투명)

OS 가 둥근/원형 마스크를 씌우므로 엠블럼은 중앙 80% 안에, 가장자리 10% 는 잘려도 되는 배경 질감만.

```text
Mobile app icon, 1024x1024, fully opaque square, full-bleed edge to edge, no transparency, no rounded corners (the OS applies its own mask: keep every important element inside the central 80%, only background texture may touch the edges). Hand-painted casual game style, Kingdom Rush and Random Dice, chibi-cute proportions, thick clean dark outlines, saturated colors. Subject: a large ivory six-sided die with red pips seen slightly from above, and a small cute stone castle keep with a red roof and a gold-trimmed blue banner standing on top of the die, a warm golden glow behind them. Background: deep dark-brown wood and stone (#2a1e12) with a subtle gold rune ring near the edges. Bold simple shapes that stay readable at 48 pixels. No text, no letters, no watermark.
```

### G-2. 적응형 아이콘 → `resources/icon-foreground.png` (1024², 투명) · `resources/icon-background.png` (1024², 불투명)

```text
Android adaptive app icon FOREGROUND layer, 1024x1024, transparent background PNG with alpha. Hand-painted casual game style, Kingdom Rush and Random Dice, chibi-cute proportions, thick clean dark outlines, saturated colors. Subject: the same emblem as the app icon — a large ivory six-sided die with red pips seen slightly from above and a small cute stone castle keep with a red roof and a gold-trimmed blue banner standing on top of it, a soft golden glow hugging the emblem. Framing: the whole emblem including its glow must fit inside the central 66% of the canvas (a 676-pixel circle in the middle); everything outside that circle is fully transparent, no drop shadow, no background. No text, no letters, no watermark.
```

```text
Android adaptive app icon BACKGROUND layer, 1024x1024, fully opaque, no alpha. A flat, even dark wood-grain texture in deep brown (#2a1e12 to #3a2c1b) with very subtle grain lines, or alternatively a dark worn stone texture — uniform edge to edge, seamless, no objects, no emblem, no vignette, no highlights, no gradient hotspot. No text, no watermark.
```

### G-3. 스플래시 → `ui/splash-logo.png` (1024², 투명) · `resources/splash.png` = `splash-dark.png` (2732², 불투명)

로고를 먼저 만들고, 스플래시는 같은 엠블럼을 `#0d0b09` 정사각 중앙에 두세요(두 스플래시 파일은 같은 그림이어도 됩니다).

```text
Game logo emblem, 1024x1024, transparent background PNG with alpha, centered, filling about 85% of the frame. Hand-painted casual game style, Kingdom Rush and Random Dice, chibi-cute proportions, thick clean dark outlines, saturated colors. Subject: a large ivory six-sided die with red pips seen slightly from above, a small cute stone castle keep with a red roof standing on top of it, two crossed gold-trimmed banners behind, a few small gold sparkles, warm gold rim light. Nothing outside the emblem, no drop shadow, no background. No text, no letters, no watermark.
```

```text
Mobile app splash screen, 2732x2732 square, fully opaque. Background: a solid near-black warm dark color #0d0b09 filling the entire canvas edge to edge, completely plain — no vignette, no pattern, no gradient, no particles. In the exact center, the game emblem: a large ivory six-sided die with red pips seen slightly from above, a small cute stone castle keep with a red roof standing on top of it, crossed gold-trimmed banners behind, a soft golden glow and a few gold sparkles. Hand-painted casual Kingdom Rush and Random Dice style, chibi-cute proportions, thick clean dark outlines. Framing: every element including the glow stays inside the central 1200x1200 area; everything outside is plain #0d0b09. No text, no letters, no watermark.
```

### G-4. HUD 프레임·버튼 9-slice (투명 PNG)

게임이 그림을 3×3 으로 잘라 **모서리는 그대로 두고 가장자리를 늘리고 가운데를 채워** 여러 크기의 패널·버튼을 만듭니다. 그래서 **모서리 사각형 안에 장식이 전부** 들어가야 하고, **가장자리 띠는 늘려도 티가 안 나는 단순 직선**, **가운데는 평평한 단순 질감**이어야 합니다.

`ui/frame-panel.png` (96², 모서리 24px):
```text
Hand-painted casual mobile game UI asset, Kingdom Rush and Random Dice style, chibi-cute proportions, thick clean dark outlines, saturated warm colors, gold (#e8b64a) metal trim on dark wood (#3a2c1b) with cream (#e9dfc4) accents, soft cel shading, flat front view. No text, no letters, no numbers, no watermark. A square 9-slice PANEL frame (1:1 canvas, saved at 96x96), transparent background PNG with alpha. A dark panel of aged wood (#2a1e12) planks with a plain dark leather center, bordered by a gold metal band with small rivets and curled corner caps. 9-SLICE RULES: all ornament (corner caps, rivets, curls) must sit inside the four corner squares that are 25% of the side (24 of 96 pixels); the four edge strips between the corners are plain straight gold-band-over-wood bands with no rivets or pattern so they can be stretched; the center is a flat even dark leather texture with no highlight, no vignette, no objects. Only the panel itself is opaque; outside its outline is fully transparent. No text, no watermark.
```

`ui/frame-card.png` (96², 모서리 24px):
```text
Hand-painted casual mobile game UI asset, Kingdom Rush and Random Dice style, chibi-cute proportions, thick clean dark outlines, saturated warm colors, gold (#e8b64a) metal trim on dark wood (#3a2c1b) with cream (#e9dfc4) accents, soft cel shading, flat front view. No text, no letters, no numbers, no watermark. A square 9-slice CARD frame (1:1 canvas, saved at 96x96), transparent background PNG with alpha. A light card of cream parchment (#e9dfc4) or pale stone slab, bordered by a thin dark-wood edge with small gold corner ornaments. 9-SLICE RULES: all ornament must sit inside the four corner squares that are 25% of the side (24 of 96 pixels); the four edge strips between the corners are plain straight bands with no pattern so they can be stretched; the center is a flat even cream parchment texture with no highlight, no vignette, no objects. Only the card itself is opaque; outside its outline is fully transparent. No text, no watermark.
```

`ui/btn-<color>.png` (96×48, 모서리 16px) — `{COLOR}` 만 바꿔 5장:
```text
Hand-painted casual mobile game UI asset, Kingdom Rush and Random Dice style, chibi-cute proportions, thick clean dark outlines, saturated warm colors, gold (#e8b64a) metal trim on dark wood (#3a2c1b) with cream (#e9dfc4) accents, soft cel shading, flat front view. No text, no letters, no numbers, no watermark. A 9-slice BUTTON on a 2:1 landscape canvas (saved at 96x48), transparent background PNG with alpha. A rounded pill-shaped button with a glossy {COLOR} body, a bright highlight band along the top third, a darker bottom rim, a thick dark outline and a thin inner gold hairline. 9-SLICE RULES: the rounded ends and any ornament stay inside the outer 1/6 of the width on each side (16 of 96 pixels) and the top/bottom 1/3 of the height (16 of 48 pixels); the middle of the button is a plain straight horizontal band of even color and even highlight that can be stretched; no sparkles, no icons, no objects in the center. Only the button is opaque; outside its outline is fully transparent. No text, no watermark.
```
| 파일 | `{COLOR}` |
|---|---|
| `btn-gold.png` | `golden yellow (#e8b64a body, #ffd452 highlight)` |
| `btn-green.png` | `mint green (#8ef0b0 body, lighter mint highlight)` |
| `btn-magenta.png` | `magenta pink (#ff7ad9 body, lighter pink highlight)` |
| `btn-danger.png` | `coral red (#ff7a7a body, lighter salmon highlight)` |
| `btn-violet.png` | `violet purple (#c78bff body, lighter lavender highlight)` |

`ui/chip-bar.png` (192×48, 모서리 20px):
```text
Hand-painted casual mobile game UI asset, Kingdom Rush and Random Dice style, chibi-cute proportions, thick clean dark outlines, saturated warm colors, gold (#e8b64a) metal trim on dark wood (#3a2c1b) with cream (#e9dfc4) accents, soft cel shading, flat front view. No text, no letters, no numbers, no watermark. A 9-slice HUD INFO BAR on a 4:1 landscape canvas (saved at 192x48), transparent background PNG with alpha. A long rounded dark-wood strip (#2a1e12) with a thin gold metal rim, small gold end-caps on the left and right, a very slightly lighter flat center. 9-SLICE RULES: the end-caps and all ornament stay inside the outer 20 pixels of each side (of 192) and the top/bottom 20 pixels (of 48); everything between is a plain straight band with even color so it can be stretched; the center is flat with no highlight, no icons, no objects. Only the bar is opaque; outside its outline is fully transparent. No text, no watermark.
```

`ui/slot-socket.png` (256²):
```text
Hand-painted casual mobile game UI asset, Kingdom Rush and Random Dice style, chibi-cute proportions, thick clean dark outlines, saturated warm colors, gold (#e8b64a) metal trim on dark wood (#3a2c1b) with cream (#e9dfc4) accents, soft cel shading. No text, no letters, no numbers, no watermark. A single round stone dice SOCKET seen from a 3/4 top-down view, 1:1 canvas saved at 256x256, transparent background PNG with alpha, centered, filling about 85% of the frame. A sunken circular socket of worn gray-violet stone with a thin gold rune ring around the rim and a dark recessed empty center, a short soft shadow directly under the socket only. Nothing else in the frame, no die inside, no background. No text, no watermark.
```

### G-5. 아이콘 23종 → `ui/icon-<name>.png` (64², 투명)

공통 문구를 앞에 붙이고 한 줄씩 이어 붙여 23장. 또는 **4×6 그리드 시트 1장**(`ui/icons-sheet.png`, 1024², 투명, 칸 256², 아래 순서대로 좌→우·위→아래, 마지막 칸 빈칸)으로 주셔도 됩니다 — 저희가 잘라 씁니다. 시트일 때는 앞에 `A 4-column by 6-row grid sheet, 1024x1024, 24 equal square cells of 256 pixels, one icon centered in each cell in this order, last cell empty:` 을 붙여 주세요.

```text
Flat casual game UI icon, Kingdom Rush and Random Dice style, 1:1 canvas saved at 64x64, transparent background PNG with alpha, one symbol centered filling about 80% of the frame, a bold 2-pixel dark outline, gold (#e8b64a, #ffd452) and cream (#e9dfc4) palette with dark wood (#3a2c1b) shadows, simple readable silhouette, soft cel shading, no background shape, no drop shadow. Any glyph is a drawn shape, not typography. No text, no letters, no numbers, no watermark.
```

| # | 파일 | 아이콘 |
|---|---|---|
| 1 | `icon-wave.png` | `Icon: a charging forward arrow with a small war horn, meaning "next wave".` |
| 2 | `icon-speed1.png` | `Icon: a single right-pointing play triangle.` |
| 3 | `icon-speed2.png` | `Icon: two right-pointing play triangles side by side (fast forward).` |
| 4 | `icon-speed3.png` | `Icon: three right-pointing play triangles side by side, slightly smaller each (fastest).` |
| 5 | `icon-sound.png` | `Icon: a small horn speaker with two curved sound waves.` |
| 6 | `icon-mute.png` | `Icon: the same horn speaker crossed by a diagonal red slash, no sound waves.` |
| 7 | `icon-chat.png` | `Icon: a rounded speech bubble with three dots inside.` |
| 8 | `icon-menu.png` | `Icon: three horizontal bars drawn as little wooden planks stacked vertically.` |
| 9 | `icon-help.png` | `Icon: a bold rounded question-mark shape drawn as a gold ornament.` |
| 10 | `icon-sell.png` | `Icon: a small tied cloth sack with a gold coin peeking out of the top.` |
| 11 | `icon-enhance.png` | `Icon: a gold star with a thick upward arrow beneath it (upgrade).` |
| 12 | `icon-chest.png` | `Icon: a small closed wooden treasure chest with gold bands and a lock.` |
| 13 | `icon-dice.png` | `Icon: an ivory six-sided die with red pips, slightly tilted.` |
| 14 | `icon-gear.png` | `Icon: a chunky settings cog gear.` |
| 15 | `icon-back.png` | `Icon: a bold left-pointing arrow with a rounded tail.` |
| 16 | `icon-trophy.png` | `Icon: a gold trophy cup with two handles on a small base.` |
| 17 | `icon-infinity.png` | `Icon: a bold infinity loop shape drawn as a gold ribbon.` |
| 18 | `icon-users.png` | `Icon: two overlapping chibi person silhouettes, head and shoulders (multiplayer).` |
| 19 | `icon-shop.png` | `Icon: a small market stall with a striped awning tent.` |
| 20 | `icon-stage.png` | `Icon: a folded map with a small flag planted on it.` |
| 21 | `icon-copy.png` | `Icon: two overlapping sheets of parchment, the front one offset down-right.` |
| 22 | `icon-gem.png` | `Icon: a faceted violet gem (#c78bff) with a bright highlight.` |
| 23 | `icon-close.png` | `Icon: a bold rounded X cross shape, two thick strokes.` |

### G-6. 획득 연출 VFX (`vfx/`)

2×2 시트는 회색 배경(네 칸 같은 중심, 좌상→우상→좌하→우하), 단품은 투명.

`vfx/acquire-burst-2x2.png` (1024², 회색 시트):
```text
Hand-painted 2x2 sprite sheet of a visual effect, four frames read left-to-right then top-to-bottom, Kingdom Rush and Random Dice casual style, thick clean outlines, bold simple shapes, all four cells the same size with the effect centered at the same point, plain light gray #C8C8C8 background, no text, no watermark. Effect: a golden star burst — frame 1 a small bright gold spark with four short rays; frame 2 a large burst of thick gold rays and a white core; frame 3 the rays break into scattered gold stars and sparkles flying outward; frame 4 only a few faint fading sparkles remain. Gold (#ffd452) and white, no characters, no background objects.
```

`vfx/acquire-ring.png` (512², 투명):
```text
Single visual-effect element, 1:1 canvas saved at 512x512, transparent background PNG with alpha, centered, filling about 90% of the frame. Kingdom Rush and Random Dice casual style, thick clean outlines. Effect: a glowing golden magic ring seen flat from the front — a thick gold (#e8b64a) circle with small engraved rune marks and tiny sparkles around it, soft golden outer glow. The CENTER of the ring is completely empty and transparent. No characters, no background. No text, no letters, no watermark.
```

`vfx/acquire-ring-rainbow.png` (512², 투명):
```text
Single visual-effect element, 1:1 canvas saved at 512x512, transparent background PNG with alpha, centered, filling about 90% of the frame. Kingdom Rush and Random Dice casual style, thick clean outlines. Effect: a glowing magic ring seen flat from the front — a thick circle whose color cycles smoothly around the ring through pink, violet, blue, mint and gold, with small engraved rune marks and tiny sparkles, soft prismatic outer glow. The CENTER of the ring is completely empty and transparent. No characters, no background. No text, no letters, no watermark.
```

`vfx/acquire-column.png` (256×1024, 투명):
```text
Single visual-effect element on a 1:4 portrait canvas (saved at 256x1024), transparent background PNG with alpha, centered horizontally. Kingdom Rush and Random Dice casual style, soft glow. Effect: a vertical pillar of golden light — bright, opaque pale-gold (#ffd452) at the bottom, fading smoothly to fully transparent at the top, with a few small rising gold sparkles inside; straight soft edges, slightly narrower at the top. No characters, no floor, no background. No text, no watermark.
```

`vfx/confetti-2x2.png` (1024², 회색 시트):
```text
Hand-painted 2x2 sprite sheet of a visual effect, four frames read left-to-right then top-to-bottom, Kingdom Rush and Random Dice casual style, thick clean outlines, bold simple shapes, all four cells the same size with the effect centered at the same point, plain light gray #C8C8C8 background, no text, no watermark. Effect: a shower of confetti and stars — frame 1 a tight cluster of confetti pieces and small stars just popping upward from the center; frame 2 the pieces spread wide in an arc; frame 3 the pieces fall and tumble, spread across the cell; frame 4 only a few pieces near the bottom, fading. Colors: gold (#ffd452), mint (#8ef0b0), pink (#ff7ad9), blue (#7fd4ff), violet (#c78bff). No characters, no background objects.
```

`vfx/star-spark.png` (128², 투명):
```text
Single visual-effect element, 1:1 canvas saved at 128x128, transparent background PNG with alpha, centered, filling about 90% of the frame. Kingdom Rush and Random Dice casual style. Effect: one four-pointed sparkle star — a bright white core with pale-gold (#ffd452) points, long thin vertical points and shorter horizontal points, soft golden glow around it. Nothing else, no background. No text, no watermark.
```

`vfx/chest-open-2x2.png` (1024², 회색 시트 — `ui/chest.png` 를 먼저 만들고 참고 이미지로 첨부):
```text
Hand-painted 2x2 sprite sheet, four frames read left-to-right then top-to-bottom, Kingdom Rush and Random Dice casual style, thick clean outlines, all four cells the same size with the chest at the same position and same size in every cell, plain light gray #C8C8C8 background, no text, no watermark. Subject: the same closed treasure chest as the reference — dark wood with gold bands and a glowing golden lock, 3/4 view. Frame 1 the chest closed and shaking slightly; frame 2 the lid cracked open with a thin line of gold light; frame 3 the lid wide open with a big burst of golden light and small sparkles pouring out; frame 4 the lid fully open, the light calming to a soft glow, a few ivory dice visible inside. No characters, no background objects.
```

### 납품 순서

1. G-1 → G-2 → G-3 (아이콘·스플래시, 스토어 등록에 먼저 필요)
2. G-4 프레임·버튼 — `frame-panel.png` 1장을 먼저 보내 주시면 늘어날 때 깨지지 않는지 확인 후 나머지
3. G-5 아이콘 23종 (또는 시트 1장)
4. `ui/chest.png` (§E-3) → G-6 VFX

파일 하나가 없어도 게임은 그 자리만 코드 그림으로 대신하므로 부분 납품도 괜찮습니다.

---
