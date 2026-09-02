# 다음 배치 생성 프롬프트 (Grok Imagine)

2026-09-02. 코드는 이미 이 파일들을 받을 준비가 되어 있다. **그대로 복사해 한 장씩 생성**하고, 지정한 파일명으로 저장하면 된다.

공통 규칙
- 배경(맵)은 **16:9, 1280×720**. 나머지(시트·스킨)는 **연회색 단색 배경**, 로더가 배경을 지우고 크롭한다.
- 2x2 시트는 **2열 2행**, 좌상→우상→좌하→우하 = 프레임 0,1,2,3. 모든 칸 같은 크기, 발밑 위치 동일.
- 기존 아트와 같은 스타일: *Kingdom Rush + Random Dice, 캐주얼 치비, 두꺼운 외곽선, 3/4 아이소*.
- 생성 후 `http://localhost:8137` 에서 확인 (file:// 금지).

> **현재 상태 (2026-09-02 저녁)**: 세 묶음 모두 **납품 완료** (main 커밋 95644fc, 78장). 31~50 의 `path2`/`spots2` 는 납품 배경의 두 번째 길을 따라 다시 찍어 `MAP_LAYOUTS_HARD` 에 넣었다.
> 아래 프롬프트는 재생성·추가 배치(적 37~, 보스 11~)용 참고로 남긴다. 임시본 합성 스크립트(`gen-hard.js`, `gen-walk.js`, `gen-skins.js`)는 세션 스크래치에만 있었고 저장소에는 없다.

| 섹션 | 수량 | 저장 위치 | 코드 연결 |
|---|---|---|---|
| §0 테마 타일셋 | 72 | `casual/tiles/<theme>/*.png` | **현행** — 파일만 넣으면 됨 (`GROK-BRIEF.md`) |
| §1 하드 배경 | 20 | `casual/maps/map-NN-<theme>-hard.jpg` | **폐기** (배경 맞춤 방식 종료) |
| §2 걷기 시트 (적 24 + 보스 10) | 34 | `casual/enemies/<id>-walk-2x2.png`, `casual/bosses/<file>-walk-2x2.png` | **이미 연결됨** — 파일만 넣으면 됨 |
| §3 타워 스킨 b~e | 24 | `casual/towers/tN-<letter>.png` 덮어쓰기 | **이미 연결됨** |

---

## §0. 테마 타일셋 72장 (현행 방식, 2026-09-02 전면 변경)

**맵 그림에 좌표를 맞추던 방식은 폐기.** 맵은 `content.js` 의 16×9 ASCII 템플릿으로 코드가 설계하고(`buildGridLayout`), 테마별 조각을 `game.js` `buildTileLayer` 가 씌운다. **도로·물은 질감만 받고 모양은 코드가 그린다** (직선·코너 타일은 생성 모델이 폭·위치를 못 지켜 폐기, 2026-09-02). 조각이 없으면 그 자리만 코드로 그리므로 부분 납품도 된다.

Grok 에게 그대로 붙여넣을 전체 메시지(공통 규칙 + 조각 15개 프롬프트 + 테마 6종 문단 + 파일명)는 **`GROK-BRIEF.md`** 에 있다. 요약:

| 조각 | 규격 | 게임 안 크기 | 비고 |
|---|---|---|---|
| `floor.jpg` | 1280×720 | 전체 | 길·석단·건물·소품 없는 빈 땅 |
| `road.png` | 1024² | 160px 반복 패턴 | 길 표면 재질만, 이음새 없이 반복, 가장자리·풀 없음. 길 모양·폭·코너는 코드 브러시 |
| `water.png` | 1024² | 256px 반복 패턴 | 물 표면만, 이음새 없이 반복. 물 모양은 코드 |
| `pad.png` | 1024² | 폭 60 | 회색 배경, 빈 석단 |
| `start.png` / `end.png` | 1024² | 높이 84 / 128 | 포탈 문 / 성 (크리스탈) |
| `prop-1~6.png` | 1024² | 96·80·40·42·30·70 | 큰 나무·작은 나무·바위·덤불·바닥 소품·상징물 |

폴더: `casual/tiles/<theme>/` (`plains`, `forest`, `lake`, `darkforest`, `castle`, `hell`). 키는 `tl_<theme>_<name>`.

연결: 파일만 넣으면 끝. 코드 수정·좌표 작업 없음. `index.html` 의 `?v=` 만 올리거나 Ctrl+F5.

품질 점검 포인트: (1) 도로·물 질감이 반복될 때 격자무늬가 보이지 않는가 (2) 회색이 깨끗이 지워졌는가 (풀·그림자를 회색 위에 그리면 잔상이 남는다) (3) 6테마의 선 굵기·채도가 같은가.

---

## §1. (폐기) 하드 배경 20장 (스테이지 31~50, 티어 4·5)

티어 4·5는 **두 번째 흙길(흙길2)** 을 쓴다. 납품된 `-hard.jpg` 가 적용돼 있다. 배경을 다시 생성해 덮어쓰면 에디터로 `path`/`path2`/`spots`/`spots2` 를 다시 찍을 것.

### 배경 공통 프롬프트 (앞에 붙일 것)

```text
Hand-painted casual tower defense game map, Kingdom Rush and Random Dice style, 3/4 top-down isometric view, 16:9 landscape, full-bleed scene with no UI. TWO separate winding dirt roads: road A starts at a glowing purple portal gate at the TOP-LEFT, road B starts at a second glowing purple portal gate at the BOTTOM-LEFT; both roads wind across the map and MERGE in front of a large crystal castle shrine on the RIGHT side. Along both roads, on flat grass beside the road (never on the road, never on water or buildings), place 14 round flat stone tower pads of identical size, evenly spread. Roads are wide, clearly readable, with soft edges. Chibi cute proportions, thick clean outlines, saturated colors, crisp painterly details, no characters, no text, no watermark.
```

### 맵별 꼬리 (공통 프롬프트 뒤에 이어 붙이기)

파일명은 `casual/maps/` 아래에 저장.

| # | 파일 | 꼬리 프롬프트 |
|---|---|---|
| 31 | `map-31-carnival-hard.jpg` | `Theme: candy-striped circus fairground at dusk — big-top tents, ferris wheel, popcorn carts, string lights, confetti on the grass, warm pink and gold palette.` |
| 32 | `map-32-vineyard-hard.jpg` | `Theme: sunny vineyard hills — rows of grapevines on terraces, wooden wine barrels, a stone winery with a red roof, golden afternoon light.` |
| 33 | `map-33-icelake-hard.jpg` | `Theme: frozen lake valley — the roads run on snowy shores around a cracked frozen lake, pine trees dusted with snow, ice-fishing huts, cold blue palette with warm lantern glow.` |
| 34 | `map-34-jungle-hard.jpg` | `Theme: overgrown jungle ruins — mossy stone temple blocks, giant leaves, vines, a waterfall pool, carved totem statues, lush emerald palette.` |
| 35 | `map-35-tulip-hard.jpg` | `Theme: tulip fields with windmills — striped red, pink and yellow tulip beds, two Dutch windmills, a small canal with a bridge, bright spring light.` |
| 36 | `map-36-crystalcity-hard.jpg` | `Theme: night crystal city — glowing violet and cyan crystal towers, neon-lit stone streets, floating crystal shards, deep indigo night sky, bioluminescent plants.` |
| 37 | `map-37-lavender-hard.jpg` | `Theme: lavender fields at golden hour — purple lavender rows, a stone farmhouse, beehives, butterflies, soft purple-and-honey palette.` |
| 38 | `map-38-halloween-hard.jpg` | `Theme: halloween village — jack-o-lantern patches, crooked cottages with glowing windows, bare twisted trees, candy corn fences, orange moon, playful spooky mood.` |
| 39 | `map-39-bioreef-hard.jpg` | `Theme: glowing underwater coral reef seen from above — the roads are sandy seabed paths, neon corals, anemones, bubbles, sunbeams through water, teal and magenta glow.` |
| 40 | `map-40-alpine-hard.jpg` | `Theme: alpine mountain village — wooden chalets, flower boxes, a cable car, snowy peaks in the back, green meadows, crisp bright daylight.` |
| 41 | `map-41-rice-hard.jpg` | `Theme: terraced rice paddies — stepped green paddies with water mirrors, stone retaining walls, a red-and-gold pagoda shrine, small streams and waterfalls between terraces.` |
| 42 | `map-42-nightdesert-hard.jpg` | `Theme: desert oasis at night — dunes under a starry sky, palm trees around a moonlit oasis pool, sandstone ruins, glowing lanterns, blue-violet palette with warm lantern accents.` |
| 43 | `map-43-nightclock-hard.jpg` | `Theme: clockwork valley at night — giant brass gears embedded in the ground, copper pipes venting steam, glowing gauge lamps, a clock-tower shrine, midnight blue and brass palette.` |
| 44 | `map-44-fairy-hard.jpg` | `Theme: enchanted fairy forest — giant glowing mushrooms, fairy lights, a fairy-ring of stones, sparkling stream, pastel pink and mint palette with magical glow.` |
| 45 | `map-45-harbor-hard.jpg` | `Theme: seaside harbor town — stone piers, moored fishing boats, lighthouse, crates and barrels, seagulls, sunny turquoise water.` |
| 46 | `map-46-nightbamboo-hard.jpg` | `Theme: bamboo dojo at night — tall bamboo groves, paper lanterns, a wooden dojo with curved roof, koi pond, fireflies, deep green and lantern-gold palette.` |
| 47 | `map-47-candyspace-hard.jpg` | `Theme: candy planet in space — pastel candy terrain with lollipop trees, jelly rocks, a starry space sky with planets, floating gummy asteroids, dreamy pink-purple palette.` |
| 48 | `map-48-orchard-hard.jpg` | `Theme: autumn apple orchard — apple trees in rows, wooden crates full of apples, a cider barn, hay bales, warm red and amber palette.` |
| 49 | `map-49-lavabeach-hard.jpg` | `Theme: volcanic black-sand beach — lava rivers cooling into the sea, glowing cracks, palm trees, obsidian rocks, orange lava light against dark sand.` |
| 50 | `map-50-royal-hard.jpg` | `Theme: royal castle grounds — white marble walkways, golden fountains, red royal banners, trimmed hedges, the crystal castle is the grandest of all, gold and crimson palette.` |

### 연결 방법

1. 파일을 `casual/maps/` 에 저장.
2. `content.js` `MAP_LAYOUTS_HARD` 에 `cMap31: { src: 'casual/maps/map-31-carnival-hard.jpg' },` 를 넣으면 배경이 교체된다.
3. `editor.html` 에서 그 맵을 열고
   - **흙길(P)** 을 새 아트의 길 A(위쪽 포탈→크리스탈)로 다시 찍고, 석단(S)도 새 아트 석단 위로 옮긴다.
   - **흙길2(O)** 를 길 B(아래쪽 포탈→크리스탈)로 찍는다.
   - **추가석단(A)** 을 나머지 석단 위에 찍는다 (티어 4는 6개, 티어 5는 8개).
   - "전체 생성" → `MAP_LAYOUTS` 와 `MAP_LAYOUTS_HARD` 두 스니펫을 content.js 에 붙여넣기 (`src` 는 유지).
4. `index.html` 의 `?v=` 올리고 Ctrl+F5.

---

## §2. 걷기 시트

### 시트 공통 프롬프트 (앞에 붙일 것)

```text
Hand-painted 2x2 sprite sheet, four frames of a walk cycle read left-to-right then top-to-bottom (contact, down, passing, up), of the same chibi character walking toward the right, side 3/4 view. Kingdom Rush and Random Dice casual style, thick clean outlines, identical character size and identical ground pivot in every cell, generous margins, plain light gray background, no text, no watermark. Match the described idle design exactly.
```

### 적 13~24 (`casual/enemies/<id>-walk-2x2.png`)

코드 연결: `content.js` `NEXT_WALK` (이미 포함). 기존 대기컷 `casual/enemies/<id>.png` 를 참고 이미지로 함께 넣으면 일관성이 좋다.

| id | 파일 | 캐릭터 꼬리 프롬프트 |
|---|---|---|
| squirrel | `squirrel-walk-2x2.png` | `Character: a tiny brown squirrel scout hugging a big acorn like a shield, fluffy tail up, leaf cap.` |
| hedgehog | `hedgehog-walk-2x2.png` | `Character: a round hedgehog spearman with spiky quills, holding a wooden spear, tiny leather vest.` |
| duck | `duck-walk-2x2.png` | `Character: a yellow duckling knight in a small silver helmet with a visor, wooden sword and round shield, waddling.` |
| panda | `panda-walk-2x2.png` | `Character: a chubby panda monk in an orange robe, holding a bamboo staff, calm face, heavy slow steps.` |
| koala | `koala-walk-2x2.png` | `Character: a sleepy gray koala holding a leaf umbrella over its head, eucalyptus sprig in the other paw.` |
| catsamurai | `catsamurai-walk-2x2.png` | `Character: a white-and-orange cat samurai in red lacquered armor with a katana at the hip and a straw hat.` |
| goat | `goat-walk-2x2.png` | `Character: a mountain goat climber with a coiled rope, backpack and tiny pickaxe, curled horns, sure-footed stride.` |
| otter | `otter-walk-2x2.png` | `Character: a sleek river otter spearman with a fish-bone spear and a shell pendant, cheerful.` |
| tanuki | `tanuki-walk-2x2.png` | `Character: a tanuki illusionist with a leaf on its head, straw hat on its back, holding a glowing green magic leaf.` |
| wolf | `wolf-walk-2x2.png` | `Character: a gray wolf scout with a red bandana, small dagger at the belt, keen eyes, quick trot.` |
| boar | `boar-walk-2x2.png` | `Character: a stocky wild boar knight in dented iron plate armor and a horned helmet, charging posture.` |
| mouse | `mouse-walk-2x2.png` | `Character: a tiny mouse wizard in an oversized blue star-patterned hat and robe, holding a glowing wand.` |

### 적 25~36 (`casual/enemies/<id>-walk-2x2.png`) — 다음 배치, 코드 연결 완료

| id | 파일 | 캐릭터 꼬리 프롬프트 |
|---|---|---|
| chameleon | `chameleon-walk-2x2.png` | `Character: a green chameleon painter with a beret and a paint palette, color-shifting tail, curious eyes.` |
| seahorse | `seahorse-walk-2x2.png` | `Character: a teal seahorse knight in a shell helmet with a coral lance, hopping upright on its curled tail.` |
| alpaca | `alpaca-walk-2x2.png` | `Character: a fluffy cream alpaca porter with saddle bags and a red tassel bridle, calm trot.` |
| beaver | `beaver-walk-2x2.png` | `Character: a brown beaver carpenter with a hard hat, a hammer on the belt and a wooden plank on the shoulder.` |
| snake | `snake-walk-2x2.png` | `Character: a coiled green snake ninja with a black mask and a tiny throwing star, slithering forward in four frames.` |
| porcupine | `porcupine-walk-2x2.png` | `Character: a porcupine shield-bearer with a big round wooden shield and bristling quills, sturdy march.` |
| kiwi | `kiwi-walk-2x2.png` | `Character: a round brown kiwi bird knight with a tiny bucket helmet and a stick sword, quick steps.` |
| rhino | `rhino-walk-2x2.png` | `Character: a baby gray rhino in leather harness armor, head lowered, heavy stomping charge.` |
| hippo | `hippo-walk-2x2.png` | `Character: a chubby purple hippo sailor in a striped shirt and sailor cap, waddling.` |
| capybara | `capybara-walk-2x2.png` | `Character: a relaxed capybara with a towel on its head and a yuzu fruit, slow unbothered stroll.` |
| axolotl | `axolotl-walk-2x2.png` | `Character: a pink axolotl mage with glowing gill fronds and a small water orb staff, bouncy walk.` |
| meerkat | `meerkat-walk-2x2.png` | `Character: a meerkat sentry with a tiny spear and a scout scarf, alert upright posture, brisk steps.` |

### 보스 1~10 (`casual/bosses/<file>-walk-2x2.png`)

코드 연결: `content.js` `BOSS_WALK_COUNT = 10` (이미 포함). 파일명은 대기컷과 같은 이름에 `-walk-2x2` 를 붙인다. 공중 보스(용·크라켄·올빼미·유령왕)는 걷기 대신 **부유/날갯짓 4프레임**으로.

| id | 파일 | 꼬리 프롬프트 |
|---|---|---|
| kingSlime | `king-slime-walk-2x2.png` | `Character: a giant royal green slime king wearing a golden crown, bouncing forward in four squash-and-stretch frames.` |
| diceDragon | `dice-dragon-walk-2x2.png` | `Character: a chubby purple dragon made of ivory dice with red pips, FLYING with four wing-flap frames, hovering.` |
| ogreChef | `ogre-chef-walk-2x2.png` | `Character: a huge ogre chef in a white toque and apron, carrying a giant ladle and a bubbling pot, stomping.` |
| pumpkinKing | `pumpkin-king-walk-2x2.png` | `Character: a tall pumpkin-headed king in tattered purple robes with a vine scepter, lurching walk.` |
| yeti | `yeti-walk-2x2.png` | `Character: a big fluffy white yeti wearing a dice pendant and ice club, heavy stomping walk.` |
| candyGolem | `candy-golem-walk-2x2.png` | `Character: a massive golem built of candies, lollipops and gummy blocks, slow heavy strides.` |
| kraken | `kraken-walk-2x2.png` | `Character: a pirate kraken with a captain hat and eyepatch, FLOATING with tentacles waving in four frames.` |
| clockOwl | `clock-owl-walk-2x2.png` | `Character: a brass clockwork owl with gear wings and a glowing clock-face chest, FLYING with four wing-flap frames.` |
| coralQueen | `coral-queen-walk-2x2.png` | `Character: a coral queen with a pearl crown, flowing seaweed dress and a trident, graceful walk.` |
| ghostKing | `ghost-king-walk-2x2.png` | `Character: a translucent blue ghost king with a crown and floating cape, HOVERING with a wispy tail in four frames.` |

다음 배치(적 25~36 등)는 `content.js` 의 `NEXT_WALK` 배열에 id 를 추가하고 `BOSS_WALK_COUNT` 를 올리면 같은 규칙으로 연결된다.

---

## §3. 타워 스킨 b~e (24장, `casual/towers/tN-<letter>.png` 덮어쓰기)

현재 인게임 `tN-a` 와 **같은 실루엣·같은 크기·같은 받침**에 재질/테마만 바꾼다. 인게임 박스 핏 70×96 이라 세로로 긴 건물이 좋다. 생성 시 `tN-a.png` 를 참고 이미지로 같이 넣을 것.

### 스킨 공통 프롬프트 (앞에 붙일 것)

```text
Hand-painted casual tower defense tower, Kingdom Rush and Random Dice style, 3/4 isometric view, a single tall building on a round mossy stone pedestal, chibi proportions, thick clean outlines, 1:1 canvas, one object centered, plain light gray background, no text, no watermark. Keep the exact same silhouette, size and pedestal as the reference tower; change only materials, colors and decorations.
```

### 눈별 본체 설명 (프롬프트 가운데)

| 눈 | 본체 |
|---|---|
| 1 | `An ivory dice watchtower whose single center pip is a huge glowing crimson eye-lens in a brass iris, firing a thin scarlet laser.` |
| 2 | `An ivory dice artillery fort whose two pips are twin black iron cannon muzzles rimmed with bronze, powder kegs at the base.` |
| 3 | `An ivory dice arcane obelisk whose three diagonal pips are glowing amethyst rune-gems, floating rune stones orbiting it.` |
| 4 | `An ivory dice frost spire whose four corner pips are jagged blue ice crystals venting freezing mist, icicles on the edges.` |
| 5 | `An ivory dice lightning tower whose four corner pips are copper lightning rods and the center pip a brass tesla coil, blue-white arcs between them.` |
| 6 | `An ivory dice tyrant fortress whose six pips are black mortar ports with red-hot rims, wearing a spiked golden crown and crimson banners.` |

### 테마별 꼬리 (스킨 글자)

| 글자 | 테마 | 꼬리 프롬프트 |
|---|---|---|
| b | 숲 (이끼·나무) | `Theme skin: living forest — the dice body is carved from pale birch wood wrapped in moss and ivy, tiny mushrooms and glowing green fireflies, leaf-green accents.` |
| c | 서리 (얼음) | `Theme skin: frozen — the dice body is translucent blue ice with frost patterns, snow on the top edges, icicles hanging, cold cyan glow.` |
| d | 왕실 (황금) | `Theme skin: royal gold — the dice body is polished ivory with gold filigree trim, red velvet and gold banners, ruby gems on the pips, luxurious warm glow.` |
| e | 밤 (공허·보라) | `Theme skin: void night — the dice body is obsidian black with violet cracks of energy, purple flames at the base, small floating star motes, dark mystical glow.` |

### 조합 방법 (24장)

`공통 프롬프트 + 눈별 본체 + 테마 꼬리` 를 이어 붙여 한 장씩 생성한다. 예 — `t3-c.png`:

```text
Hand-painted casual tower defense tower, Kingdom Rush and Random Dice style, 3/4 isometric view, a single tall building on a round mossy stone pedestal, chibi proportions, thick clean outlines, 1:1 canvas, one object centered, plain light gray background, no text, no watermark. Keep the exact same silhouette, size and pedestal as the reference tower; change only materials, colors and decorations. An ivory dice arcane obelisk whose three diagonal pips are glowing amethyst rune-gems, floating rune stones orbiting it. Theme skin: frozen — the dice body is translucent blue ice with frost patterns, snow on the top edges, icicles hanging, cold cyan glow.
```

전체 목록: `t1-b t1-c t1-d t1-e / t2-b … t2-e / t3-b … t3-e / t4-b … t4-e / t5-b … t5-e / t6-b … t6-e`.

연결: 파일 덮어쓰기만 하면 된다 (`content.js` `towerSkins` 가 a~e 를 자동 로드, 상점에서 젬 20으로 해금·장착). `index.html` 의 `?v=` 를 올려 캐시를 비울 것.

---

## §4. (폐기) 코드 생성 레인을 아트로 바꾸고 싶을 때

하늘길·땅굴은 코드로 그려서 배경이 필요 없다. 더 예쁘게 하고 싶다면 티어 2·3 맵(스테이지 11~30)에 아래를 덧붙인 배경을 생성하고 `MAP_LAYOUTS_HARD[key].src` 로 교체하면 된다 (레인 좌표는 그대로 코드가 만든다).

```text
... (기존 맵 프롬프트) ... Additionally paint a faint trail of small fluffy clouds arcing across the upper part of the map from the portal to the crystal castle, and a line of small dirt mounds with cracked earth running beside the main road (a burrow tunnel), both subtle and not obstructing the road.
```

---

## §5. 인피니티 아레나 바닥 1장 (`casual/maps/map-inf-arena.jpg`, 1280×720)

무한 모드 맵은 **코드가 도로·석단·포탈·크리스탈을 그린다**. 배경은 아무것도 없는 바닥만 필요하다. 없으면 코드 바닥(어두운 돌 + 룬 링)으로 동작한다.

```text
Hand-painted casual tower defense arena FLOOR ONLY, Kingdom Rush and Random Dice style, 3/4 top-down isometric view, 16:9 landscape, full-bleed, no UI. A wide empty circular coliseum floor of worn violet-gray flagstones with faint glowing golden rune rings carved around the center, low stone parapet and torch braziers along the outer edge, dark violet night sky with giant floating ivory dice and stars beyond the parapet. The floor must be EMPTY: no roads, no paths, no tower pads, no portals, no buildings, no shrine, no characters, no text, no watermark. Gold and violet palette, chibi cute proportions, thick clean outlines, saturated colors.
```

연결: 파일을 `casual/maps/map-inf-arena.jpg` 로 저장하면 끝. 좌표 작업 없음 (나선 도로·석단은 `content.js` `buildArenaLayout` 이 만든다).
