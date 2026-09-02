# Grok 전달용 브리프 (그대로 붙여넣기)

아래 구분선 안의 내용을 Grok 에게 그대로 전달하면 된다. 세부 프롬프트 원본은 `ART-PROMPTS.md`.

---

안녕하세요. 캐주얼 타워 디펜스 게임 **「주사위 성채 (Dicekeep)」** 의 아트 생성을 부탁합니다. 저장소: https://github.com/GNchoo/dicekeep-art

## 상황

게임과 코드는 완성되어 있고, 지금은 코드로 합성한 **임시 이미지**가 들어가 있습니다. 당신이 만들어 줄 진짜 그림으로 같은 파일명에 덮어쓰기만 하면 바로 적용됩니다. 총 78장, 세 묶음입니다.

| 묶음 | 수량 | 저장 파일명 |
|---|---|---|
| A. 하드 배경 (길이 두 갈래인 맵) | 20 | `map-NN-<theme>-hard.jpg` |
| B. 걷기 스프라이트 시트 2x2 | 34 (적 24 + 보스 10) | `<id>-walk-2x2.png` |
| C. 타워 스킨 | 24 (6종 × b,c,d,e) | `tN-<letter>.png` |

## 반드시 지킬 공통 규칙

1. **스타일**: Kingdom Rush + Random Dice 느낌. 손그림 캐주얼, 치비 비율, 두꺼운 깔끔한 외곽선, 채도 높은 색, 3/4 아이소메트릭 시점. 글자·워터마크·UI 금지.
2. **배경(A)** 은 16:9, 1280×720, 화면 가득 채우기.
3. **시트(B)와 스킨(C)** 은 단색 **연회색 배경**(예: #C8C8C8)에 오브젝트 하나만. 게임 로더가 가장자리에서 이어진 회색을 지우고 자동 크롭하므로 그림자를 배경에 깔지 마세요.
4. **2x2 시트**는 2열 2행, 읽는 순서 좌상 → 우상 → 좌하 → 우하 = 프레임 0,1,2,3. 네 칸 모두 캐릭터 크기와 발밑 위치가 같아야 합니다. 캐릭터는 **오른쪽을 향해** 걷습니다.
5. 한 장씩 만들고, 파일명은 표에 적힌 그대로.
6. 참고 이미지가 있는 항목(대기컷 `casual/enemies/<id>.png`, 타워 `casual/towers/tN-a.png`)은 반드시 그 디자인을 그대로 따릅니다. 새로 디자인하지 마세요.

---

## A. 하드 배경 20장 → `casual/maps/`

### 공통 프롬프트 (모든 배경 앞에 붙임)

```
Hand-painted casual tower defense game map, Kingdom Rush and Random Dice style, 3/4 top-down isometric view, 16:9 landscape, full-bleed scene with no UI. TWO separate winding dirt roads: road A starts at a glowing purple portal gate at the TOP-LEFT, road B starts at a second glowing purple portal gate at the BOTTOM-LEFT; both roads wind across the map and MERGE in front of a large crystal castle shrine on the RIGHT side. Along both roads, on flat grass beside the road (never on the road, never on water or buildings), place 14 round flat stone tower pads of identical size, evenly spread. Roads are wide, clearly readable, with soft edges. Chibi cute proportions, thick clean outlines, saturated colors, crisp painterly details, no characters, no text, no watermark.
```

### 맵별 꼬리 (공통 프롬프트 뒤에 이어 붙임)

| 파일 | 꼬리 |
|---|---|
| `map-31-carnival-hard.jpg` | Theme: candy-striped circus fairground at dusk — big-top tents, ferris wheel, popcorn carts, string lights, confetti on the grass, warm pink and gold palette. |
| `map-32-vineyard-hard.jpg` | Theme: sunny vineyard hills — rows of grapevines on terraces, wooden wine barrels, a stone winery with a red roof, golden afternoon light. |
| `map-33-icelake-hard.jpg` | Theme: frozen lake valley — the roads run on snowy shores around a cracked frozen lake, pine trees dusted with snow, ice-fishing huts, cold blue palette with warm lantern glow. |
| `map-34-jungle-hard.jpg` | Theme: overgrown jungle ruins — mossy stone temple blocks, giant leaves, vines, a waterfall pool, carved totem statues, lush emerald palette. |
| `map-35-tulip-hard.jpg` | Theme: tulip fields with windmills — striped red, pink and yellow tulip beds, two Dutch windmills, a small canal with a bridge, bright spring light. |
| `map-36-crystalcity-hard.jpg` | Theme: night crystal city — glowing violet and cyan crystal towers, neon-lit stone streets, floating crystal shards, deep indigo night sky, bioluminescent plants. |
| `map-37-lavender-hard.jpg` | Theme: lavender fields at golden hour — purple lavender rows, a stone farmhouse, beehives, butterflies, soft purple-and-honey palette. |
| `map-38-halloween-hard.jpg` | Theme: halloween village — jack-o-lantern patches, crooked cottages with glowing windows, bare twisted trees, candy corn fences, orange moon, playful spooky mood. |
| `map-39-bioreef-hard.jpg` | Theme: glowing underwater coral reef seen from above — the roads are sandy seabed paths, neon corals, anemones, bubbles, sunbeams through water, teal and magenta glow. |
| `map-40-alpine-hard.jpg` | Theme: alpine mountain village — wooden chalets, flower boxes, a cable car, snowy peaks in the back, green meadows, crisp bright daylight. |
| `map-41-rice-hard.jpg` | Theme: terraced rice paddies — stepped green paddies with water mirrors, stone retaining walls, a red-and-gold pagoda shrine, small streams and waterfalls between terraces. |
| `map-42-nightdesert-hard.jpg` | Theme: desert oasis at night — dunes under a starry sky, palm trees around a moonlit oasis pool, sandstone ruins, glowing lanterns, blue-violet palette with warm lantern accents. |
| `map-43-nightclock-hard.jpg` | Theme: clockwork valley at night — giant brass gears embedded in the ground, copper pipes venting steam, glowing gauge lamps, a clock-tower shrine, midnight blue and brass palette. |
| `map-44-fairy-hard.jpg` | Theme: enchanted fairy forest — giant glowing mushrooms, fairy lights, a fairy-ring of stones, sparkling stream, pastel pink and mint palette with magical glow. |
| `map-45-harbor-hard.jpg` | Theme: seaside harbor town — stone piers, moored fishing boats, lighthouse, crates and barrels, seagulls, sunny turquoise water. |
| `map-46-nightbamboo-hard.jpg` | Theme: bamboo dojo at night — tall bamboo groves, paper lanterns, a wooden dojo with curved roof, koi pond, fireflies, deep green and lantern-gold palette. |
| `map-47-candyspace-hard.jpg` | Theme: candy planet in space — pastel candy terrain with lollipop trees, jelly rocks, a starry space sky with planets, floating gummy asteroids, dreamy pink-purple palette. |
| `map-48-orchard-hard.jpg` | Theme: autumn apple orchard — apple trees in rows, wooden crates full of apples, a cider barn, hay bales, warm red and amber palette. |
| `map-49-lavabeach-hard.jpg` | Theme: volcanic black-sand beach — lava rivers cooling into the sea, glowing cracks, palm trees, obsidian rocks, orange lava light against dark sand. |
| `map-50-royal-hard.jpg` | Theme: royal castle grounds — white marble walkways, golden fountains, red royal banners, trimmed hedges, the crystal castle is the grandest of all, gold and crimson palette. |

---

## B. 걷기 시트 34장

### 공통 프롬프트 (모든 시트 앞에 붙임)

```
Hand-painted 2x2 sprite sheet, four frames of a walk cycle read left-to-right then top-to-bottom (contact, down, passing, up), of the same chibi character walking toward the right, side 3/4 view. Kingdom Rush and Random Dice casual style, thick clean outlines, identical character size and identical ground pivot in every cell, generous margins, plain light gray background, no text, no watermark. Match the described idle design exactly.
```

### 적 24장 → `casual/enemies/` (참고: 같은 폴더의 `<id>.png` 대기컷)

| 파일 | 캐릭터 꼬리 |
|---|---|
| `squirrel-walk-2x2.png` | Character: a tiny brown squirrel scout hugging a big acorn like a shield, fluffy tail up, leaf cap. |
| `hedgehog-walk-2x2.png` | Character: a round hedgehog spearman with spiky quills, holding a wooden spear, tiny leather vest. |
| `duck-walk-2x2.png` | Character: a yellow duckling knight in a small silver helmet with a visor, wooden sword and round shield, waddling. |
| `panda-walk-2x2.png` | Character: a chubby panda monk in an orange robe, holding a bamboo staff, calm face, heavy slow steps. |
| `koala-walk-2x2.png` | Character: a sleepy gray koala holding a leaf umbrella over its head, eucalyptus sprig in the other paw. |
| `catsamurai-walk-2x2.png` | Character: a white-and-orange cat samurai in red lacquered armor with a katana at the hip and a straw hat. |
| `goat-walk-2x2.png` | Character: a mountain goat climber with a coiled rope, backpack and tiny pickaxe, curled horns, sure-footed stride. |
| `otter-walk-2x2.png` | Character: a sleek river otter spearman with a fish-bone spear and a shell pendant, cheerful. |
| `tanuki-walk-2x2.png` | Character: a tanuki illusionist with a leaf on its head, straw hat on its back, holding a glowing green magic leaf. |
| `wolf-walk-2x2.png` | Character: a gray wolf scout with a red bandana, small dagger at the belt, keen eyes, quick trot. |
| `boar-walk-2x2.png` | Character: a stocky wild boar knight in dented iron plate armor and a horned helmet, charging posture. |
| `mouse-walk-2x2.png` | Character: a tiny mouse wizard in an oversized blue star-patterned hat and robe, holding a glowing wand. |
| `chameleon-walk-2x2.png` | Character: a green chameleon painter with a beret and a paint palette, color-shifting tail, curious eyes. |
| `seahorse-walk-2x2.png` | Character: a teal seahorse knight in a shell helmet with a coral lance, hopping upright on its curled tail. |
| `alpaca-walk-2x2.png` | Character: a fluffy cream alpaca porter with saddle bags and a red tassel bridle, calm trot. |
| `beaver-walk-2x2.png` | Character: a brown beaver carpenter with a hard hat, a hammer on the belt and a wooden plank on the shoulder. |
| `snake-walk-2x2.png` | Character: a coiled green snake ninja with a black mask and a tiny throwing star, slithering forward in four frames. |
| `porcupine-walk-2x2.png` | Character: a porcupine shield-bearer with a big round wooden shield and bristling quills, sturdy march. |
| `kiwi-walk-2x2.png` | Character: a round brown kiwi bird knight with a tiny bucket helmet and a stick sword, quick steps. |
| `rhino-walk-2x2.png` | Character: a baby gray rhino in leather harness armor, head lowered, heavy stomping charge. |
| `hippo-walk-2x2.png` | Character: a chubby purple hippo sailor in a striped shirt and sailor cap, waddling. |
| `capybara-walk-2x2.png` | Character: a relaxed capybara with a towel on its head and a yuzu fruit, slow unbothered stroll. |
| `axolotl-walk-2x2.png` | Character: a pink axolotl mage with glowing gill fronds and a small water orb staff, bouncy walk. |
| `meerkat-walk-2x2.png` | Character: a meerkat sentry with a tiny spear and a scout scarf, alert upright posture, brisk steps. |

### 보스 10장 → `casual/bosses/` (참고: 같은 폴더의 대기컷). 공중 보스는 걷기 대신 **부유/날갯짓 4프레임**

| 파일 | 캐릭터 꼬리 |
|---|---|
| `king-slime-walk-2x2.png` | Character: a giant royal green slime king wearing a golden crown, bouncing forward in four squash-and-stretch frames. |
| `dice-dragon-walk-2x2.png` | Character: a chubby purple dragon made of ivory dice with red pips, FLYING with four wing-flap frames, hovering. |
| `ogre-chef-walk-2x2.png` | Character: a huge ogre chef in a white toque and apron, carrying a giant ladle and a bubbling pot, stomping. |
| `pumpkin-king-walk-2x2.png` | Character: a tall pumpkin-headed king in tattered purple robes with a vine scepter, lurching walk. |
| `yeti-walk-2x2.png` | Character: a big fluffy white yeti wearing a dice pendant and ice club, heavy stomping walk. |
| `candy-golem-walk-2x2.png` | Character: a massive golem built of candies, lollipops and gummy blocks, slow heavy strides. |
| `kraken-walk-2x2.png` | Character: a pirate kraken with a captain hat and eyepatch, FLOATING with tentacles waving in four frames. |
| `clock-owl-walk-2x2.png` | Character: a brass clockwork owl with gear wings and a glowing clock-face chest, FLYING with four wing-flap frames. |
| `coral-queen-walk-2x2.png` | Character: a coral queen with a pearl crown, flowing seaweed dress and a trident, graceful walk. |
| `ghost-king-walk-2x2.png` | Character: a translucent blue ghost king with a crown and floating cape, HOVERING with a wispy tail in four frames. |

---

## C. 타워 스킨 24장 → `casual/towers/` (참고: `tN-a.png`, 실루엣·크기·받침 동일하게)

프롬프트 = **공통** + **눈별 본체** + **테마 꼬리** 를 이어 붙임. 파일명은 `t{눈}-{글자}.png` (예: 3눈 서리 = `t3-c.png`). 6눈 × 4테마 = 24장.

### 공통

```
Hand-painted casual tower defense tower, Kingdom Rush and Random Dice style, 3/4 isometric view, a single tall building on a round mossy stone pedestal, chibi proportions, thick clean outlines, 1:1 canvas, one object centered, plain light gray background, no text, no watermark. Keep the exact same silhouette, size and pedestal as the reference tower; change only materials, colors and decorations.
```

### 눈별 본체

| 눈 | 본체 |
|---|---|
| 1 | An ivory dice watchtower whose single center pip is a huge glowing crimson eye-lens in a brass iris, firing a thin scarlet laser. |
| 2 | An ivory dice artillery fort whose two pips are twin black iron cannon muzzles rimmed with bronze, powder kegs at the base. |
| 3 | An ivory dice arcane obelisk whose three diagonal pips are glowing amethyst rune-gems, floating rune stones orbiting it. |
| 4 | An ivory dice frost spire whose four corner pips are jagged blue ice crystals venting freezing mist, icicles on the edges. |
| 5 | An ivory dice lightning tower whose four corner pips are copper lightning rods and the center pip a brass tesla coil, blue-white arcs between them. |
| 6 | An ivory dice tyrant fortress whose six pips are black mortar ports with red-hot rims, wearing a spiked golden crown and crimson banners. |

### 테마 꼬리

| 글자 | 꼬리 |
|---|---|
| b | Theme skin: living forest — the dice body is carved from pale birch wood wrapped in moss and ivy, tiny mushrooms and glowing green fireflies, leaf-green accents. |
| c | Theme skin: frozen — the dice body is translucent blue ice with frost patterns, snow on the top edges, icicles hanging, cold cyan glow. |
| d | Theme skin: royal gold — the dice body is polished ivory with gold filigree trim, red velvet and gold banners, ruby gems on the pips, luxurious warm glow. |
| e | Theme skin: void night — the dice body is obsidian black with violet cracks of energy, purple flames at the base, small floating star motes, dark mystical glow. |

예시 (`t3-c.png`):

```
Hand-painted casual tower defense tower, Kingdom Rush and Random Dice style, 3/4 isometric view, a single tall building on a round mossy stone pedestal, chibi proportions, thick clean outlines, 1:1 canvas, one object centered, plain light gray background, no text, no watermark. Keep the exact same silhouette, size and pedestal as the reference tower; change only materials, colors and decorations. An ivory dice arcane obelisk whose three diagonal pips are glowing amethyst rune-gems, floating rune stones orbiting it. Theme skin: frozen — the dice body is translucent blue ice with frost patterns, snow on the top edges, icicles hanging, cold cyan glow.
```

---

## D. 인피니티 아레나 배경 1장 → `casual/maps/map-inf-arena.jpg` (16:9, 1280×720)

```
Hand-painted casual tower defense arena map, Kingdom Rush and Random Dice style, 3/4 top-down isometric view, 16:9 landscape, full-bleed, no UI. A circular coliseum floor under a dark violet night sky with giant floating ivory dice and stars. A grand crystal shrine stands slightly right of CENTER. One wide dirt road starts at a glowing purple portal gate at the LEFT edge and spirals one full lap around the shrine before reaching its gate; a second road starts at a portal gate at the BOTTOM edge and merges into the spiral halfway. Along both roads, on flat ground beside the road (never on the road), place 16 round flat stone tower pads of identical size, evenly spread. Gold and violet palette, glowing rune trims, chibi cute proportions, thick clean outlines, saturated colors, no characters, no text, no watermark.
```

---

## 납품 순서 제안

1. **C 스킨 24장** (가장 빠르고 검수가 쉬움) → 2. **B 걷기 시트 34장** → 3. **A 하드 배경 20장**.
각 묶음이 끝나면 파일명 목록과 함께 알려 주세요. 규칙 3·4(배경색, 2x2 칸 정렬)가 어긋나면 게임에서 잘못 잘리니 그 부분만 특히 확인 부탁드립니다.

---
