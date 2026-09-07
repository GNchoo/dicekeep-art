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
| §6 인피니티 101웨이브 몬스터 | 110종 설계 | `casual/enemies/inf/wNNN.png`, `casual/bosses/inf/bNNN[-2].png` | **1~10 적용 범위** — 나머지는 파일을 넣고 `content.js` `INF_ART_READY` 에 웨이브 번호를 적으면 그 웨이브만 교체 |
| §7 출시용 UI·아이콘·스플래시·연출 | 약 50 | `resources/*.png`, `store/*.png`, `ui/*.png`, `vfx/*.png` | **연결됨** — 투명 PNG(UI)·회색 시트(VFX), 파일만 넣으면 됨. 요약본 `GROK-BRIEF.md` §G (2026-09-06) |

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

**인피니티 아레나 조각 9장** (`casual/tiles/arena/`: floor·road·board 질감 + pad·start·end·prop-1~3): 프롬프트는 `GROK-BRIEF.md` §F. 없으면 코드 석판 트랙·베벨 보드·소켓·기둥·화로로 동작.

**인피니티 갓챠 에셋 20장** (성 타워 `casual/towers/star-07~20.png`, 다면체 주사위 `dice/poly-d1/d4/d8/d12/d20.png`, 상자 `ui/chest.png`): 프롬프트는 `GROK-BRIEF.md` §E. 없으면 6눈 스킨 + 별 배지 / 코드 다각형 / 이모지로 동작.

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

---

## §6. 인피니티 101웨이브 몬스터 (전체 로스터 설계 · 실제 적용 범위는 INF_ART_READY)

> **2026-09-07 PR #29 아트 방향 수정 — 덩어리감 있는 페인터리 판타지 게임 캐릭터**. 어두운 모험 분위기는 유지하되 과한 징그러움과 실사 신체 공포를 없앤다. 둥근 비율·간결한 외곽선·표정·분명한 장비를 사용하고, 작은 게임 화면에서도 몸과 팔다리가 읽히게 그린다. 1단계(1~10) **폐허의 잡졸**의 한국어 이름은 호환성을 위해 유지한다 (역병쥐·해골 잡졸·묘지 오우거·까마귀 정찰병·고블린 창병·썩은 멧돼지·무덤 파는 구울·시체파리 떼·녹슨 철갑 오크·보스 역병 쥐왕).
>
> **공통 제한은 모든 묘사·팔레트·참조 이미지보다 우선한다**: 고어, 피 얼룩, 열린 상처, 종기, 내장 노출, 썩어 벗겨진 살, 절단, 뒤엉킨 신체를 그리지 않는다. 역병·시체·썩음이라는 이름은 의상·색·작은 장식으로만 표현한다. 해골은 깨끗하고 단순한 뼈, 해골 장식은 작은 조각 부적이다. 11~101의 기존 로스터 묘사는 아직 유지되며, 이후 재생성할 때에도 생성기의 이 제한을 적용한다. **이번 아트 교체·검증 범위는 1~10이며 101웨이브 전체의 신규 아트 납품을 뜻하지 않는다.**
>
> **1~10 캐릭터 기준**: 1 온전한 숯빛 털·가죽 목걸이·꼬리 하나의 쥐, 2 투구·올리브 타바드·장화·짧은 창의 해골 병사, 3 온전한 올리브 피부·갈색 후드·가죽 조끼·몽둥이의 오우거, 4 하네스와 등불을 단 까마귀, 5 창·방패 고블린, 6 온전한 갈색 털·금속 엄니 덮개의 멧돼지, 7 매끈한 회녹색 얼굴·후드·작업복·장갑·장화·삽의 구울, 8 작은 해골 모양 부적 주위의 둥근 청록 파리들, 9 온전한 녹빛 갑옷·투구·짧은 도끼·방패의 오크, 10 왕관·완갑·와인빛 망토·꼬리 하나의 직립 쥐왕(뼈 더미·받침 없음).
>
> **현행 파이프라인 (2026-09-07 걷기 시트 수정 이후)** — 몬스터 묘사(영문)·보행 방식은 `tools/inf-roster.json`, 이름·등급·이동·단계·**팔레트**는 `content.js`(`INF_MONSTERS`·`INF_PALETTE`), 둘을 합쳐 `tools/inf-jobs.mjs` 가 잡 파일을 만든다. 아래 §6 의 치비 공통 프롬프트와 웨이브별 프롬프트는 **폐기(참고용)** — 실제 프롬프트는 생성기가 조립한다.
>
> ```
> node tools/inf-jobs.mjs --waves=1-5 --out=tools/jobs/inf-w01-05.json            # 참조 없는 신규 걷기 시트 잡
> node tools/inf-jobs.mjs --waves=6-10 --mode=multi --out=tools/jobs/inf-w06-10.json   # 한 장에 5마리(행) × 4프레임(열) + 보스 정지컷 — 이미지 값 몬스터당 약 1/5
> OPENAI_API_KEY=… node tools/img-gen.mjs tools/jobs/inf-w06-10.json                   # gen/inf/w006-w009-1.png · gen/inf/b010-1.png
> node tools/sheet-split.mjs gen/inf/w006-w009-1.png --rows=w006,w007,w008,w009 --cols=4 --pack   # 행마다 안정화 → casual/enemies/inf/wNNN-walk-2x2.png + wNNN.png(정지컷 = 1칸)
> node tools/inf-jobs.mjs --waves=1-5 --refs --out=tools/jobs/inf-w01-05-walk.json    # 몬스터마다 시트 1장, 정지컷을 참조로 (--frames=6 → 3x2)
> node tools/sheet-check.mjs gen/inf/w001-walk-1.png --sheet-out=casual/enemies/inf/w001-walk-2x2.png --pack   # 편차·자세 판정 + 안정화 저장
> #  content.js INF_ART_READY 에 웨이브 번호를 적는다 (6프레임 시트는 INF_MONSTERS[w].walk = '3x2')
> ```
>
> - **걷기 주기**: 프레임마다 자세를 지정한다 — 두발: 접지(오른발 앞·보폭 최대) → 통과(뒷다리가 몸 아래로, 몸 최고점) → 접지(왼발 앞) → 통과. 네발: 대각 속보(앞오른·뒤왼 앞으로 → 모음 → 앞왼·뒤오른 → 모음). 날것: 날개 위·수평·아래·수평(몸 높이 고정). 뱀·벌레: S자가 1/4 파장씩 이동. 유령: 제자리 부유(옷자락·기운만 한 바퀴). `inf-roster.json` `gait` = biped·quad·fly·slither·float. 머리·몸통·장비·크기는 모든 칸에서 동일, 발은 같은 바닥선, 칸의 65% 이하·여백 15%, 경계 접촉 금지.
> - **안정화**: 그래도 칸마다 크기(높이 10~30%)·발 위치(5~15%)·가로 위치가 어긋나 재생하면 '커졌다 작아졌다·앞뒤로 미끄러짐' 으로 보인다. `sheet-check`·`sheet-split` 이 실루엣 넓이로 크기를 ±15% 안에서 맞추고 발끝을 공통 바닥선에, 무게중심 x 를 공통 축에 맞춰 다시 굽는다. 이웃 칸에서 넘어온 창끝 같은 경계 조각(실루엣 3% 미만)은 지운다. `game.js processSheet` 도 같은 규칙으로 인피니티 시트를 맞춘다(이미 넣은 1~5 도 흔들리지 않음). 확인 `tools/e2e/walk-jitter.js`. 자세 판정 `static`·`twoPose` 가 뜨면 그 시트(행)만 다시 뽑는다.
> - **한 장에 여러 마리(`--mode=multi`)**: 세로 1024×1536 에 5행 × 4열, 칸 256×307 — 게임은 42~58px(3배 DPR 174px)로 그리므로 충분. 한 행이 나쁘면 그 장을 다시 뽑는다. L 등급이 많은 단계·보스·세부가 중요한 것은 `--mode=single`(2x2 1024², 6프레임은 3x2 1536×1024). 정지컷은 시트 1칸(접지)에서 자르므로 정지컷 잡은 따로 없다. `n` 기본 1.
> - **단계 팔레트**(10웨이브마다 색이 조금씩 바뀐다): 원본은 `content.js INF_PALETTE`. 생성기는 기존의 피·살 틈 같은 단어를 와인빛 천·녹슨 장비·마법 문양의 **색상 지시**로만 해석한다. 단계별 색을 유지하면서 중간 명도와 밝고 어두운 면을 구분한다. 검게 뭉개진 음영·파스텔 일색·네온 과포화를 피하고, 공통 고어 금지 규칙이 팔레트 표현보다 우선한다.
> - **날것·보스**: 날것은 발끝 대신 무게중심 y 로 맞춘다(`--anchor=center`, `sheet-split`·게임 로더는 `move: 'air'` 로 자동). 보스는 정지컷 1장 `casual/bosses/inf/bNNN.png`(부관 `-2`), 크기 `INFINITY.artSizeBoss`(S 96 · M 108 · L 120).
>
> **이전 납품 기록 — PR #29 아트 방향 수정 이전의 2차 생성 (`gpt-image-2`, 7장, 이미지 출력 11,908 토큰)**: 1~5 는 정지컷을 참조로 시트만 다시 뽑았고, 6~9 는 세로 한 장(4행×4열, 칸 256×384)에서 `sheet-split` 로 나눴다. 10 보스 역병 쥐왕은 정지컷. 당시 `INF_ART_READY = [1..10]`. 이 기록은 이전 생성 이력이며 현재 이미지의 보행 품질 판정을 대신하지 않는다.
>
> 키아트: `node tools/img-gen.mjs tools/jobs/keyart.json` → `node tools/keyart-build.mjs --portrait=gen/keyart/portrait-1.png --landscape=gen/keyart/landscape-1.png`. 키는 환경변수로만, 파일에 쓰지 않는다.
>
> **이전 납품 기록 — 키아트 2장 + 1~5 첫 정지컷·시트 (`gpt-image-2`)**: 세로 `portrait-1`(5눈 주사위, 아래 1/4 안개), 가로 `landscape-2`(달빛, 아래 1/3 안개) → 세로·가로 모두 글자 없는 그림 위에 CSS 금박 제목(`?v=90`). 몬스터는 후보 2장 중 w001-2 · w002-1 · w003-2 · w004-1 · w005-1, 걷기 시트는 여백 지시(칸의 70% 이하)를 넣은 2차 생성에서 w001-2 · w002-1 · w003-2 · w004-2 · w005-1. 당시 `png-pack` 으로 정지컷 512²·시트 1024² 팔레트 PNG(합계 2.1MB), `INF_ART_READY = [1,2,3,4,5]`. 현재 검증 수치는 PR의 최신 검증 결과를 따른다.

인피니티(도전·함께) 101웨이브의 몬스터를 **10단계 테마 × 10웨이브 + 보스** 로 다시 설계했다. 지금은 기존 적 그림을 겉보기 강함 순으로 재배치해 쓰고 있고(`content.js` `look`), **아래 파일명으로 그림을 넣고 `INF_ART_READY` 에 웨이브 번호를 적으면 그 웨이브만 새 그림·새 이름으로 바뀐다** (부분 납품 가능, 나머지는 기존 그림 폴백).

규칙
- 정지컷 `casual/enemies/inf/wNNN.png` (시트의 접지 프레임에서 추출, 투명 배경, **오른쪽을 본다** — 코드가 왼쪽 이동 때 반전한다). 걷기 시트: `casual/enemies/inf/wNNN-walk-2x2.png`.
- 보스 `casual/bosses/inf/bNNN.png`, 20웨이브부터 보스가 2마리라 부관은 `casual/bosses/inf/bNNN-2.png`.
- 크기 등급(S/M/L)은 원작 크기표(`sizeSeq`)를 따른다 — 그림 안 비율이 아니라 **덩치 느낌**(S 작고 가벼움 · L 크고 무거움)으로 그려 달라는 뜻. 이동형은 4의 배수 공중, 7의 배수 땅굴(7이 우선).
- 방어력이 높은 33·66·99 웨이브는 두꺼운 판금을 두른다. 단계가 오를수록 갑옷·무기·발광·크기감이 늘어나야 한다.
- 코드 연결: `content.js` `INF_MONSTERS`(이름·등급·테마) + `INF_ART_READY`, `game.js` 는 `infW<w>` / `infB<w>` 키로 로드해 `spawnEnemy` 가 정지컷·시트를 우선 쓴다.

### 단계 테마

| 단계 | 웨이브 | 테마 | 분위기 (구 치비 설계 — 참고용) | 팔레트 (`INF_PALETTE`, 현행) |
|---|---|---|---|---|
| 1 | 1~10 | 폐허의 잡졸 (구 '초원의 작은 것들') | 덩어리감 있는 페인터리 게임 캐릭터, 온전한 피부·털·의상, 단순한 장비·표정 | 녹빛 장비 · 와인빛 천 · 회색과 올리브 중간 명도 (고어 표현 금지) |
| 2 | 11~20 | 숲의 야수 | natural fur and feathers, slightly fierce eyes, a few leaves and twigs stuck on the body, still cute  검은 털 · 먹빛 초록 · 탁한 호박색 눈 |
| 3 | 21~30 | 늪과 동굴 | slimy or chitinous skin, murky green and purple tones, glowing eyes, drips of swamp water  탁한 청록 · 검보라 · 독의 점광 |
| 4 | 31~40 | 산적과 고블린 | ragged leather clothes, crude iron weapons, patched cloth, mischievous grin  와인빛 자주 · 검은 가죽 · 녹슨 쇠 |
| 5 | 41~50 | 왕국의 병사와 기사 | polished steel armor with a red and gold heraldic emblem, disciplined pose, proper weapons and shields  검푸른 강철 · 검붉은 휘장 · 바랜 금 |
| 6 | 51~60 | 언데드 | pale bone and rotten cloth, cold blue-green glow in eye sockets, tattered burial wrappings, faint mist  창백한 뼈 · 검보라 그림자 · 차가운 회청 빛 |
| 7 | 61~70 | 마법 생물과 정령 | body made of glowing elemental energy or crystal, floating runes and sparks, vivid magical colors  짙은 보라 · 자수정 · 검은 마력 연기 |
| 8 | 71~80 | 용족과 거대 야수 | thick scales, horns and spikes, heavy muscular build, embers or frost breath, imposing size  검붉은 비늘 · 흑요석 · 꺼져가는 불씨 |
| 9 | 81~90 | 악마 | dark red and black skin, curved horns, hellfire glow from cracks in the skin, bat-like wings or chains  지옥의 진홍 · 검은 뿔 · 살 틈의 주홍빛 |
| 10 | 91~101 | 심연과 파멸 | obsidian black body with violet void energy, eyes like stars, ornate ruinous armor, world-ending presence  심연의 검정 · 보라 공허 광채 · 별빛 눈 |

### 정지컷 공통 프롬프트 (각 웨이브 프롬프트에 이미 포함됨)

```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame.
```

### 걷기 시트 공통 프롬프트 (선택 — 앞에 붙이고 정지컷 설명을 이어 쓴다)

```text
Hand-painted 2x2 sprite sheet, four frames of a walk cycle read left-to-right then top-to-bottom (contact, down, passing, up), of the same chibi character moving toward the RIGHT, side 3/4 view. Kingdom Rush and Random Dice casual style, thick clean outlines, identical character size and identical ground pivot in every cell, generous margins, plain light gray background, no text, no watermark. Match the idle design exactly:
```

### 단계 1 · 폐허의 잡졸 (웨이브 1~10)

> 1~10 의 현행 프롬프트는 `tools/inf-roster.json`(영문 묘사·보행) + `tools/inf-jobs.mjs` 로 만든다. 아래 표의 이름은 현행이며, 이름에 담긴 역병·썩음·시체 표현은 고어로 그리지 않는다. 그 밑의 치비 프롬프트는 폐기.

| 웨이브 | 이름 | 등급 | 이동 | 파일 |
|---|---|---|---|---|
| 1 | 역병쥐 | S | 지상 | `w001.png` — 프롬프트는 `tools/jobs/inf-w01-05.json` |
| 2 | 해골 잡졸 | S | 지상 | `w002.png` |
| 3 | 묘지 오우거 | L | 지상 | `w003.png` |
| 4 | 까마귀 정찰병 | S | 공중 | `w004.png` |
| 5 | 고블린 창병 | M | 지상 | `w005.png` |
| 6 | 썩은 멧돼지 | L | 지상 | `w006.png` |
| 7 | 무덤 파는 구울 | L | 땅굴 | `w007.png` |
| 8 | 시체파리 떼 | S | 공중 | `w008.png` |
| 9 | 녹슨 철갑 오크 | L | 지상 | `w009.png` |
| **10 보스** | 역병 쥐왕 | L | 보스 | `b010.png` |

**1 · 들쥐** → `casual/enemies/inf/w001.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A tiny field mouse with a wheat stalk in its mouth, a small creature, walking on the ground. Theme: meadow critters — soft rounded shapes, bright pastel colors, cute and harmless looking, no weapons, no armor. Power level 1 of 10: looks weak and cute.
```
**2 · 청개구리** → `casual/enemies/inf/w002.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A small green tree frog with big round eyes, a small creature, walking on the ground. Theme: meadow critters — soft rounded shapes, bright pastel colors, cute and harmless looking, no weapons, no armor. Power level 1 of 10: looks weak and cute.
```
**3 · 뭉게양** → `casual/enemies/inf/w003.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A fat fluffy sheep like a walking cloud, stubby legs, a large bulky creature, walking on the ground. Theme: meadow critters — soft rounded shapes, bright pastel colors, cute and harmless looking, no weapons, no armor. Power level 1 of 10: looks weak and cute.
```
**4 · 참새** → `casual/enemies/inf/w004.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A chubby sparrow flying with tiny wings spread, a small creature, flying in the air with wings or floating clearly off the ground. Theme: meadow critters — soft rounded shapes, bright pastel colors, cute and harmless looking, no weapons, no armor. Power level 1 of 10: looks weak and cute.
```
**5 · 당근토끼** → `casual/enemies/inf/w005.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A rabbit holding a carrot like a club, a medium creature, walking on the ground. Theme: meadow critters — soft rounded shapes, bright pastel colors, cute and harmless looking, no weapons, no armor. Power level 1 of 10: looks weak and cute.
```
**6 · 얼룩젖소** → `casual/enemies/inf/w006.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A plump spotted dairy cow with a bell, a large bulky creature, walking on the ground. Theme: meadow critters — soft rounded shapes, bright pastel colors, cute and harmless looking, no weapons, no armor. Power level 1 of 10: looks weak and cute.
```
**7 · 왕두더지** → `casual/enemies/inf/w007.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A big mole with huge digging claws, half out of a dirt mound, a large bulky creature, emerging from a hole in the ground, dirt and debris flying, lower body underground. Theme: meadow critters — soft rounded shapes, bright pastel colors, cute and harmless looking, no weapons, no armor. Power level 1 of 10: looks weak and cute.
```
**8 · 꿀벌** → `casual/enemies/inf/w008.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A round honeybee with a tiny stinger, flying, a small creature, flying in the air with wings or floating clearly off the ground. Theme: meadow critters — soft rounded shapes, bright pastel colors, cute and harmless looking, no weapons, no armor. Power level 1 of 10: looks weak and cute.
```
**9 · 골목거위** → `casual/enemies/inf/w009.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. An oversized angry goose with neck stretched forward, a large bulky creature, walking on the ground. Theme: meadow critters — soft rounded shapes, bright pastel colors, cute and harmless looking, no weapons, no armor. Power level 1 of 10: looks weak and cute.
```
**10 보스 · 황금 숫양** → `casual/bosses/inf/b010.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Golden Ram King, a huge fluffy ram with golden curled horns and a tiny crown, much larger and more imposing than regular enemies, ornate details, the lord of the meadow critters. Theme: soft rounded shapes, bright pastel colors, cute and harmless looking, no weapons, no armor. Power level 1 of 10.
```

### 단계 2 · 숲의 야수 (웨이브 11~20)

| 웨이브 | 이름 | 등급 | 이동 | 파일 |
|---|---|---|---|---|
| 11 | 도토리다람쥐 | S | 지상 | `w011.png` |
| 12 | 수리부엉이 | L | 공중 | `w012.png` |
| 13 | 아기여우 | S | 지상 | `w013.png` |
| 14 | 오소리 | L | 땅굴 | `w014.png` |
| 15 | 도적너구리 | M | 지상 | `w015.png` |
| 16 | 검독수리 | L | 공중 | `w016.png` |
| 17 | 회색늑대 | M | 지상 | `w017.png` |
| 18 | 가시고슴도치 | S | 지상 | `w018.png` |
| 19 | 불곰 | L | 지상 | `w019.png` |
| **20 보스** | 고목 정령 + 거대 수사슴 | L | 보스 | `b020.png` · `b020-2.png` |

**11 · 도토리다람쥐** → `casual/enemies/inf/w011.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A squirrel carrying an acorn like a bomb, a small creature, walking on the ground. Theme: forest beasts — natural fur and feathers, slightly fierce eyes, a few leaves and twigs stuck on the body, still cute. Power level 2 of 10: looks weak and cute.
```
**12 · 수리부엉이** → `casual/enemies/inf/w012.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A large great horned owl in flight, wings wide, a large bulky creature, flying in the air with wings or floating clearly off the ground. Theme: forest beasts — natural fur and feathers, slightly fierce eyes, a few leaves and twigs stuck on the body, still cute. Power level 2 of 10: looks weak and cute.
```
**13 · 아기여우** → `casual/enemies/inf/w013.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A small orange fox cub with a sly grin, a small creature, walking on the ground. Theme: forest beasts — natural fur and feathers, slightly fierce eyes, a few leaves and twigs stuck on the body, still cute. Power level 2 of 10: looks weak and cute.
```
**14 · 오소리** → `casual/enemies/inf/w014.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A stocky badger bursting out of the ground, dirt flying, a large bulky creature, emerging from a hole in the ground, dirt and debris flying, lower body underground. Theme: forest beasts — natural fur and feathers, slightly fierce eyes, a few leaves and twigs stuck on the body, still cute. Power level 2 of 10: looks weak and cute.
```
**15 · 도적너구리** → `casual/enemies/inf/w015.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A raccoon with a black bandit mask and a small sack, a medium creature, walking on the ground. Theme: forest beasts — natural fur and feathers, slightly fierce eyes, a few leaves and twigs stuck on the body, still cute. Power level 2 of 10: looks weak and cute.
```
**16 · 검독수리** → `casual/enemies/inf/w016.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A large golden eagle diving with talons out, a large bulky creature, flying in the air with wings or floating clearly off the ground. Theme: forest beasts — natural fur and feathers, slightly fierce eyes, a few leaves and twigs stuck on the body, still cute. Power level 2 of 10: looks weak and cute.
```
**17 · 회색늑대** → `casual/enemies/inf/w017.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A lean grey wolf baring its teeth, a medium creature, walking on the ground. Theme: forest beasts — natural fur and feathers, slightly fierce eyes, a few leaves and twigs stuck on the body, still cute. Power level 2 of 10: looks weak and cute.
```
**18 · 가시고슴도치** → `casual/enemies/inf/w018.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A hedgehog with extra long spikes, curled slightly, a small creature, walking on the ground. Theme: forest beasts — natural fur and feathers, slightly fierce eyes, a few leaves and twigs stuck on the body, still cute. Power level 2 of 10: looks weak and cute.
```
**19 · 불곰** → `casual/enemies/inf/w019.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A big brown bear standing on all fours, roaring, a large bulky creature, walking on the ground. Theme: forest beasts — natural fur and feathers, slightly fierce eyes, a few leaves and twigs stuck on the body, still cute. Power level 2 of 10: looks weak and cute.
```
**20 보스 · 고목 정령** → `casual/bosses/inf/b020.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Elder Treant, a huge walking tree with a face in the bark and glowing green sap, much larger and more imposing than regular enemies, ornate details, the lord of the forest beasts. Theme: natural fur and feathers, slightly fierce eyes, a few leaves and twigs stuck on the body, still cute. Power level 2 of 10.
```
**20 부관 · 거대 수사슴** → `casual/bosses/inf/b020-2.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Great Stag, an enormous stag with antlers like a tree crown, much larger and more imposing than regular enemies, ornate details, a lieutenant of the forest beasts. Theme: natural fur and feathers, slightly fierce eyes, a few leaves and twigs stuck on the body, still cute. Power level 2 of 10.
```

### 단계 3 · 늪과 동굴 (웨이브 21~30)

| 웨이브 | 이름 | 등급 | 이동 | 파일 |
|---|---|---|---|---|
| 21 | 늪지렁이 | S | 땅굴 | `w021.png` |
| 22 | 왕두꺼비 | L | 지상 | `w022.png` |
| 23 | 도롱뇽 | S | 지상 | `w023.png` |
| 24 | 왕모기 | S | 공중 | `w024.png` |
| 25 | 동굴거미 | M | 지상 | `w025.png` |
| 26 | 독전갈 | S | 지상 | `w026.png` |
| 27 | 늪악어 | L | 지상 | `w027.png` |
| 28 | 개미귀신 | L | 땅굴 | `w028.png` |
| 29 | 아나콘다 | L | 지상 | `w029.png` |
| **30 보스** | 두꺼비 마녀 + 박쥐 군주 | S | 보스 | `b030.png` · `b030-2.png` |

**21 · 늪지렁이** → `casual/enemies/inf/w021.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A fat pink swamp worm poking out of mud, a small creature, emerging from a hole in the ground, dirt and debris flying, lower body underground. Theme: swamp and cave creatures — slimy or chitinous skin, murky green and purple tones, glowing eyes, drips of swamp water. Power level 3 of 10: looks weak and cute.
```
**22 · 왕두꺼비** → `casual/enemies/inf/w022.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A huge warty toad with a wide mouth and swamp drips, a large bulky creature, walking on the ground. Theme: swamp and cave creatures — slimy or chitinous skin, murky green and purple tones, glowing eyes, drips of swamp water. Power level 3 of 10: looks weak and cute.
```
**23 · 도롱뇽** → `casual/enemies/inf/w023.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A small spotted salamander with a curling tail, a small creature, walking on the ground. Theme: swamp and cave creatures — slimy or chitinous skin, murky green and purple tones, glowing eyes, drips of swamp water. Power level 3 of 10: looks weak and cute.
```
**24 · 왕모기** → `casual/enemies/inf/w024.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A giant mosquito with a long needle and glowing eyes, flying, a small creature, flying in the air with wings or floating clearly off the ground. Theme: swamp and cave creatures — slimy or chitinous skin, murky green and purple tones, glowing eyes, drips of swamp water. Power level 3 of 10: looks weak and cute.
```
**25 · 동굴거미** → `casual/enemies/inf/w025.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A hairy cave spider with eight glowing eyes, a medium creature, walking on the ground. Theme: swamp and cave creatures — slimy or chitinous skin, murky green and purple tones, glowing eyes, drips of swamp water. Power level 3 of 10: looks weak and cute.
```
**26 · 독전갈** → `casual/enemies/inf/w026.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A small black scorpion with a glowing green stinger, a small creature, walking on the ground. Theme: swamp and cave creatures — slimy or chitinous skin, murky green and purple tones, glowing eyes, drips of swamp water. Power level 3 of 10: looks weak and cute.
```
**27 · 늪악어** → `casual/enemies/inf/w027.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A big armored crocodile with moss on its back, a large bulky creature, walking on the ground. Theme: swamp and cave creatures — slimy or chitinous skin, murky green and purple tones, glowing eyes, drips of swamp water. Power level 3 of 10: looks weak and cute.
```
**28 · 개미귀신** → `casual/enemies/inf/w028.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A giant antlion with huge jaws rising out of a sand pit, a large bulky creature, emerging from a hole in the ground, dirt and debris flying, lower body underground. Theme: swamp and cave creatures — slimy or chitinous skin, murky green and purple tones, glowing eyes, drips of swamp water. Power level 3 of 10: looks weak and cute.
```
**29 · 아나콘다** → `casual/enemies/inf/w029.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A thick green anaconda coiled and rearing up, a large bulky creature, walking on the ground. Theme: swamp and cave creatures — slimy or chitinous skin, murky green and purple tones, glowing eyes, drips of swamp water. Power level 3 of 10: looks weak and cute.
```
**30 보스 · 두꺼비 마녀** → `casual/bosses/inf/b030.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Toad Witch, a big toad in a witch hat stirring a bubbling cauldron on its back, much larger and more imposing than regular enemies, ornate details, the lord of the swamp and cave creatures. Theme: slimy or chitinous skin, murky green and purple tones, glowing eyes, drips of swamp water. Power level 3 of 10.
```
**30 부관 · 박쥐 군주** → `casual/bosses/inf/b030-2.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Bat Lord, a giant bat with a cape-like wingspan and a tiny crown, much larger and more imposing than regular enemies, ornate details, a lieutenant of the swamp and cave creatures. Theme: slimy or chitinous skin, murky green and purple tones, glowing eyes, drips of swamp water. Power level 3 of 10.
```

### 단계 4 · 산적과 고블린 (웨이브 31~40)

| 웨이브 | 이름 | 등급 | 이동 | 파일 |
|---|---|---|---|---|
| 31 | 고블린 정찰병 | S | 지상 | `w031.png` |
| 32 | 고블린 글라이더 | S | 공중 | `w032.png` |
| 33 | 방패 고블린 | S | 지상 · 고방어 | `w033.png` |
| 34 | 오크 전사 | L | 지상 | `w034.png` |
| 35 | 트롤 굴착병 | L | 땅굴 | `w035.png` |
| 36 | 와이번 기수 | L | 공중 | `w036.png` |
| 37 | 홉고블린 궁수 | M | 지상 | `w037.png` |
| 38 | 코볼트 | S | 지상 | `w038.png` |
| 39 | 산적 두목 | M | 지상 | `w039.png` |
| **40 보스** | 고블린 왕 + 오우거 장사 | S | 보스 | `b040.png` · `b040-2.png` |

**31 · 고블린 정찰병** → `casual/enemies/inf/w031.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A small goblin scout with a wooden dagger and leaf hood, a small creature, walking on the ground. Theme: bandits and goblins — ragged leather clothes, crude iron weapons, patched cloth, mischievous grin. Power level 4 of 10: looks dangerous and battle-worn.
```
**32 · 고블린 글라이더** → `casual/enemies/inf/w032.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A goblin hanging from a patched bat-wing glider, flying, a small creature, flying in the air with wings or floating clearly off the ground. Theme: bandits and goblins — ragged leather clothes, crude iron weapons, patched cloth, mischievous grin. Power level 4 of 10: looks dangerous and battle-worn.
```
**33 · 방패 고블린** → `casual/enemies/inf/w033.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A goblin hiding behind an oversized iron tower shield covered in dents, a small creature, walking on the ground. Theme: bandits and goblins — ragged leather clothes, crude iron weapons, patched cloth, mischievous grin. Power level 4 of 10: looks dangerous and battle-worn. Heavily armored: thick layered metal plates cover most of the body.
```
**34 · 오크 전사** → `casual/enemies/inf/w034.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A big green orc warrior with a cleaver and shoulder pads, a large bulky creature, walking on the ground. Theme: bandits and goblins — ragged leather clothes, crude iron weapons, patched cloth, mischievous grin. Power level 4 of 10: looks dangerous and battle-worn.
```
**35 · 트롤 굴착병** → `casual/enemies/inf/w035.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A hunched troll with a giant pickaxe climbing out of a tunnel, a large bulky creature, emerging from a hole in the ground, dirt and debris flying, lower body underground. Theme: bandits and goblins — ragged leather clothes, crude iron weapons, patched cloth, mischievous grin. Power level 4 of 10: looks dangerous and battle-worn.
```
**36 · 와이번 기수** → `casual/enemies/inf/w036.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A goblin riding a small wyvern, flying, a large bulky creature, flying in the air with wings or floating clearly off the ground. Theme: bandits and goblins — ragged leather clothes, crude iron weapons, patched cloth, mischievous grin. Power level 4 of 10: looks dangerous and battle-worn.
```
**37 · 홉고블린 궁수** → `casual/enemies/inf/w037.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A tall hobgoblin archer drawing a crude bow, a medium creature, walking on the ground. Theme: bandits and goblins — ragged leather clothes, crude iron weapons, patched cloth, mischievous grin. Power level 4 of 10: looks dangerous and battle-worn.
```
**38 · 코볼트** → `casual/enemies/inf/w038.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A tiny lizard-like kobold with a candle on its helmet, a small creature, walking on the ground. Theme: bandits and goblins — ragged leather clothes, crude iron weapons, patched cloth, mischievous grin. Power level 4 of 10: looks dangerous and battle-worn.
```
**39 · 산적 두목** → `casual/enemies/inf/w039.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A burly human bandit chief with an eye patch and two axes, a medium creature, walking on the ground. Theme: bandits and goblins — ragged leather clothes, crude iron weapons, patched cloth, mischievous grin. Power level 4 of 10: looks dangerous and battle-worn.
```
**40 보스 · 고블린 왕** → `casual/bosses/inf/b040.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Goblin King carried on a throne-litter by four tiny goblins, holding a stolen scepter, much larger and more imposing than regular enemies, ornate details, the lord of the bandits and goblins. Theme: ragged leather clothes, crude iron weapons, patched cloth, mischievous grin. Power level 4 of 10.
```
**40 부관 · 오우거 장사** → `casual/bosses/inf/b040-2.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Ogre Brute, a massive ogre with a tree trunk club and a barrel belly, much larger and more imposing than regular enemies, ornate details, a lieutenant of the bandits and goblins. Theme: ragged leather clothes, crude iron weapons, patched cloth, mischievous grin. Power level 4 of 10.
```

### 단계 5 · 왕국의 병사와 기사 (웨이브 41~50)

| 웨이브 | 이름 | 등급 | 이동 | 파일 |
|---|---|---|---|---|
| 41 | 방패병 | L | 지상 | `w041.png` |
| 42 | 공병 | M | 땅굴 | `w042.png` |
| 43 | 창기병 | L | 지상 | `w043.png` |
| 44 | 그리폰 기사 | L | 공중 | `w044.png` |
| 45 | 중장기사 | L | 지상 | `w045.png` |
| 46 | 종자 | S | 지상 | `w046.png` |
| 47 | 석궁병 | M | 지상 | `w047.png` |
| 48 | 페가수스 기사 | L | 공중 | `w048.png` |
| 49 | 굴착 노움 | S | 땅굴 | `w049.png` |
| **50 보스** | 강철 성주 + 공성 골렘 | L | 보스 | `b050.png` · `b050-2.png` |

**41 · 방패병** → `casual/enemies/inf/w041.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A heavy footman behind a big kite shield, spear ready, a large bulky creature, walking on the ground. Theme: kingdom soldiers and knights — polished steel armor with a red and gold heraldic emblem, disciplined pose, proper weapons and shields. Power level 5 of 10: looks dangerous and battle-worn.
```
**42 · 공병** → `casual/enemies/inf/w042.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. An army sapper with a helmet lamp and a shovel, coming out of a tunnel, a medium creature, emerging from a hole in the ground, dirt and debris flying, lower body underground. Theme: kingdom soldiers and knights — polished steel armor with a red and gold heraldic emblem, disciplined pose, proper weapons and shields. Power level 5 of 10: looks dangerous and battle-worn.
```
**43 · 창기병** → `casual/enemies/inf/w043.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A pikeman in chainmail with a very long pike, a large bulky creature, walking on the ground. Theme: kingdom soldiers and knights — polished steel armor with a red and gold heraldic emblem, disciplined pose, proper weapons and shields. Power level 5 of 10: looks dangerous and battle-worn.
```
**44 · 그리폰 기사** → `casual/enemies/inf/w044.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A knight riding a griffin, flying, a large bulky creature, flying in the air with wings or floating clearly off the ground. Theme: kingdom soldiers and knights — polished steel armor with a red and gold heraldic emblem, disciplined pose, proper weapons and shields. Power level 5 of 10: looks dangerous and battle-worn.
```
**45 · 중장기사** → `casual/enemies/inf/w045.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A full plate armor knight with a greatsword and closed helmet, a large bulky creature, walking on the ground. Theme: kingdom soldiers and knights — polished steel armor with a red and gold heraldic emblem, disciplined pose, proper weapons and shields. Power level 5 of 10: looks dangerous and battle-worn.
```
**46 · 종자** → `casual/enemies/inf/w046.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A small squire boy carrying a shield too big for him, a small creature, walking on the ground. Theme: kingdom soldiers and knights — polished steel armor with a red and gold heraldic emblem, disciplined pose, proper weapons and shields. Power level 5 of 10: looks dangerous and battle-worn.
```
**47 · 석궁병** → `casual/enemies/inf/w047.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A crossbowman in a padded coat aiming a crossbow, a medium creature, walking on the ground. Theme: kingdom soldiers and knights — polished steel armor with a red and gold heraldic emblem, disciplined pose, proper weapons and shields. Power level 5 of 10: looks dangerous and battle-worn.
```
**48 · 페가수스 기사** → `casual/enemies/inf/w048.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A knight on a white winged pegasus, flying, a large bulky creature, flying in the air with wings or floating clearly off the ground. Theme: kingdom soldiers and knights — polished steel armor with a red and gold heraldic emblem, disciplined pose, proper weapons and shields. Power level 5 of 10: looks dangerous and battle-worn.
```
**49 · 굴착 노움** → `casual/enemies/inf/w049.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A gnome engineer driving a small steam drill cart underground, a small creature, emerging from a hole in the ground, dirt and debris flying, lower body underground. Theme: kingdom soldiers and knights — polished steel armor with a red and gold heraldic emblem, disciplined pose, proper weapons and shields. Power level 5 of 10: looks dangerous and battle-worn.
```
**50 보스 · 강철 성주** → `casual/bosses/inf/b050.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Iron Castellan, a giant knight in ornate golden plate armor with a tower shield, much larger and more imposing than regular enemies, ornate details, the lord of the kingdom soldiers and knights. Theme: polished steel armor with a red and gold heraldic emblem, disciplined pose, proper weapons and shields. Power level 5 of 10.
```
**50 부관 · 공성 골렘** → `casual/bosses/inf/b050-2.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Siege Golem, a walking siege engine with a battering ram arm, much larger and more imposing than regular enemies, ornate details, a lieutenant of the kingdom soldiers and knights. Theme: polished steel armor with a red and gold heraldic emblem, disciplined pose, proper weapons and shields. Power level 5 of 10.
```

### 단계 6 · 언데드 (웨이브 51~60)

| 웨이브 | 이름 | 등급 | 이동 | 파일 |
|---|---|---|---|---|
| 51 | 좀비 | L | 지상 | `w051.png` |
| 52 | 도깨비불 | S | 공중 | `w052.png` |
| 53 | 해골 병사 | M | 지상 | `w053.png` |
| 54 | 뼈다귀 강아지 | S | 지상 | `w054.png` |
| 55 | 구울 | L | 지상 | `w055.png` |
| 56 | 무덤손 | L | 땅굴 | `w056.png` |
| 57 | 해골 기사 | L | 지상 | `w057.png` |
| 58 | 저주 인형 | S | 지상 | `w058.png` |
| 59 | 밴시 | M | 지상 | `w059.png` |
| **60 보스** | 리치 + 뼈 용 | L | 보스 | `b060.png` · `b060-2.png` |

**51 · 좀비** → `casual/enemies/inf/w051.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A shambling green zombie with torn clothes, a large bulky creature, walking on the ground. Theme: undead — pale bone and rotten cloth, cold blue-green glow in eye sockets, tattered burial wrappings, faint mist. Power level 6 of 10: looks dangerous and battle-worn.
```
**52 · 도깨비불** → `casual/enemies/inf/w052.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A floating pale ghost wisp with a sad face, flying, a small creature, flying in the air with wings or floating clearly off the ground. Theme: undead — pale bone and rotten cloth, cold blue-green glow in eye sockets, tattered burial wrappings, faint mist. Power level 6 of 10: looks dangerous and battle-worn.
```
**53 · 해골 병사** → `casual/enemies/inf/w053.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A skeleton soldier with a rusty sword and round shield, a medium creature, walking on the ground. Theme: undead — pale bone and rotten cloth, cold blue-green glow in eye sockets, tattered burial wrappings, faint mist. Power level 6 of 10: looks dangerous and battle-worn.
```
**54 · 뼈다귀 강아지** → `casual/enemies/inf/w054.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A small skeleton dog with a glowing collar, a small creature, walking on the ground. Theme: undead — pale bone and rotten cloth, cold blue-green glow in eye sockets, tattered burial wrappings, faint mist. Power level 6 of 10: looks dangerous and battle-worn.
```
**55 · 구울** → `casual/enemies/inf/w055.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A big hunched ghoul with long claws and a hungry grin, a large bulky creature, walking on the ground. Theme: undead — pale bone and rotten cloth, cold blue-green glow in eye sockets, tattered burial wrappings, faint mist. Power level 6 of 10: looks dangerous and battle-worn.
```
**56 · 무덤손** → `casual/enemies/inf/w056.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A giant undead hand and arm clawing out of a grave, a large bulky creature, emerging from a hole in the ground, dirt and debris flying, lower body underground. Theme: undead — pale bone and rotten cloth, cold blue-green glow in eye sockets, tattered burial wrappings, faint mist. Power level 6 of 10: looks dangerous and battle-worn.
```
**57 · 해골 기사** → `casual/enemies/inf/w057.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A skeletal knight on a skeletal horse, black armor, a large bulky creature, walking on the ground. Theme: undead — pale bone and rotten cloth, cold blue-green glow in eye sockets, tattered burial wrappings, faint mist. Power level 6 of 10: looks dangerous and battle-worn.
```
**58 · 저주 인형** → `casual/enemies/inf/w058.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A small cursed rag doll with button eyes and a needle, a small creature, walking on the ground. Theme: undead — pale bone and rotten cloth, cold blue-green glow in eye sockets, tattered burial wrappings, faint mist. Power level 6 of 10: looks dangerous and battle-worn.
```
**59 · 밴시** → `casual/enemies/inf/w059.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A wailing banshee in a torn white dress, floating just above ground, a medium creature, walking on the ground. Theme: undead — pale bone and rotten cloth, cold blue-green glow in eye sockets, tattered burial wrappings, faint mist. Power level 6 of 10: looks dangerous and battle-worn.
```
**60 보스 · 리치** → `casual/bosses/inf/b060.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Lich, a skeletal sorcerer in a tattered royal robe with a floating phylactery, much larger and more imposing than regular enemies, ornate details, the lord of the undead. Theme: pale bone and rotten cloth, cold blue-green glow in eye sockets, tattered burial wrappings, faint mist. Power level 6 of 10.
```
**60 부관 · 뼈 용** → `casual/bosses/inf/b060-2.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Bone Wyrm, a dragon skeleton with glowing green fire inside its ribs, much larger and more imposing than regular enemies, ornate details, a lieutenant of the undead. Theme: pale bone and rotten cloth, cold blue-green glow in eye sockets, tattered burial wrappings, faint mist. Power level 6 of 10.
```

### 단계 7 · 마법 생물과 정령 (웨이브 61~70)

| 웨이브 | 이름 | 등급 | 이동 | 파일 |
|---|---|---|---|---|
| 61 | 불 정령 | M | 지상 | `w061.png` |
| 62 | 서리 요정 | S | 지상 | `w062.png` |
| 63 | 흙 정령 | S | 땅굴 | `w063.png` |
| 64 | 천둥새 | M | 공중 | `w064.png` |
| 65 | 바위 골렘 | L | 지상 | `w065.png` |
| 66 | 수정 정령 | L | 지상 · 고방어 | `w066.png` |
| 67 | 마법 고양이 | S | 지상 | `w067.png` |
| 68 | 살아있는 마도서 | S | 공중 | `w068.png` |
| 69 | 수정 골렘 | L | 지상 | `w069.png` |
| **70 보스** | 대마법사 + 폭풍 정령 | S | 보스 | `b070.png` · `b070-2.png` |

**61 · 불 정령** → `casual/enemies/inf/w061.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A fire elemental made of living flame with ember eyes, a medium creature, walking on the ground. Theme: magical creatures and elementals — body made of glowing elemental energy or crystal, floating runes and sparks, vivid magical colors. Power level 7 of 10: looks powerful and menacing.
```
**62 · 서리 요정** → `casual/enemies/inf/w062.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A tiny ice fairy with snowflake wings and a frosty wand, a small creature, walking on the ground. Theme: magical creatures and elementals — body made of glowing elemental energy or crystal, floating runes and sparks, vivid magical colors. Power level 7 of 10: looks powerful and menacing.
```
**63 · 흙 정령** → `casual/enemies/inf/w063.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A small earth sprite made of soil and roots, coming out of the ground, a small creature, emerging from a hole in the ground, dirt and debris flying, lower body underground. Theme: magical creatures and elementals — body made of glowing elemental energy or crystal, floating runes and sparks, vivid magical colors. Power level 7 of 10: looks powerful and menacing.
```
**64 · 천둥새** → `casual/enemies/inf/w064.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A thunderbird crackling with lightning, flying, a medium creature, flying in the air with wings or floating clearly off the ground. Theme: magical creatures and elementals — body made of glowing elemental energy or crystal, floating runes and sparks, vivid magical colors. Power level 7 of 10: looks powerful and menacing.
```
**65 · 바위 골렘** → `casual/enemies/inf/w065.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A big golem made of mossy boulders, a large bulky creature, walking on the ground. Theme: magical creatures and elementals — body made of glowing elemental energy or crystal, floating runes and sparks, vivid magical colors. Power level 7 of 10: looks powerful and menacing.
```
**66 · 수정 정령** → `casual/enemies/inf/w066.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A water elemental encased in thick crystal armor plates, a large bulky creature, walking on the ground. Theme: magical creatures and elementals — body made of glowing elemental energy or crystal, floating runes and sparks, vivid magical colors. Power level 7 of 10: looks powerful and menacing. Heavily armored: thick layered metal plates cover most of the body.
```
**67 · 마법 고양이** → `casual/enemies/inf/w067.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A black cat with glowing purple runes and a witch hat, a small creature, walking on the ground. Theme: magical creatures and elementals — body made of glowing elemental energy or crystal, floating runes and sparks, vivid magical colors. Power level 7 of 10: looks powerful and menacing.
```
**68 · 살아있는 마도서** → `casual/enemies/inf/w068.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A flying spellbook with teeth and glowing pages, a small creature, flying in the air with wings or floating clearly off the ground. Theme: magical creatures and elementals — body made of glowing elemental energy or crystal, floating runes and sparks, vivid magical colors. Power level 7 of 10: looks powerful and menacing.
```
**69 · 수정 골렘** → `casual/enemies/inf/w069.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A large golem made of glowing blue crystal, a large bulky creature, walking on the ground. Theme: magical creatures and elementals — body made of glowing elemental energy or crystal, floating runes and sparks, vivid magical colors. Power level 7 of 10: looks powerful and menacing.
```
**70 보스 · 대마법사** → `casual/bosses/inf/b070.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Archmage, a small hooded mage floating on a spinning ring of spellbooks and runes, much larger and more imposing than regular enemies, ornate details, the lord of the magical creatures and elementals. Theme: body made of glowing elemental energy or crystal, floating runes and sparks, vivid magical colors. Power level 7 of 10.
```
**70 부관 · 폭풍 정령** → `casual/bosses/inf/b070-2.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Storm Elemental, a towering thundercloud creature with lightning arms, much larger and more imposing than regular enemies, ornate details, a lieutenant of the magical creatures and elementals. Theme: body made of glowing elemental energy or crystal, floating runes and sparks, vivid magical colors. Power level 7 of 10.
```

### 단계 8 · 용족과 거대 야수 (웨이브 71~80)

| 웨이브 | 이름 | 등급 | 이동 | 파일 |
|---|---|---|---|---|
| 71 | 드레이크 | L | 지상 | `w071.png` |
| 72 | 새끼용 | S | 공중 | `w072.png` |
| 73 | 매머드 | L | 지상 | `w073.png` |
| 74 | 도마뱀 인간 | S | 지상 | `w074.png` |
| 75 | 코카트리스 | S | 지상 | `w075.png` |
| 76 | 와이번 | S | 공중 | `w076.png` |
| 77 | 모래 벌레 | S | 땅굴 | `w077.png` |
| 78 | 베히모스 | L | 지상 | `w078.png` |
| 79 | 용 전사 | M | 지상 | `w079.png` |
| **80 보스** | 화룡 + 히드라 | M | 보스 | `b080.png` · `b080-2.png` |

**71 · 드레이크** → `casual/enemies/inf/w071.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A large wingless drake lizard with a spiked tail, a large bulky creature, walking on the ground. Theme: dragonkin and giant beasts — thick scales, horns and spikes, heavy muscular build, embers or frost breath, imposing size. Power level 8 of 10: looks powerful and menacing.
```
**72 · 새끼용** → `casual/enemies/inf/w072.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A small red baby dragon flapping tiny wings, flying, a small creature, flying in the air with wings or floating clearly off the ground. Theme: dragonkin and giant beasts — thick scales, horns and spikes, heavy muscular build, embers or frost breath, imposing size. Power level 8 of 10: looks powerful and menacing.
```
**73 · 매머드** → `casual/enemies/inf/w073.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A huge woolly mammoth with curved tusks, a large bulky creature, walking on the ground. Theme: dragonkin and giant beasts — thick scales, horns and spikes, heavy muscular build, embers or frost breath, imposing size. Power level 8 of 10: looks powerful and menacing.
```
**74 · 도마뱀 인간** → `casual/enemies/inf/w074.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A lizardman warrior with a bone spear, a small creature, walking on the ground. Theme: dragonkin and giant beasts — thick scales, horns and spikes, heavy muscular build, embers or frost breath, imposing size. Power level 8 of 10: looks powerful and menacing.
```
**75 · 코카트리스** → `casual/enemies/inf/w075.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A small cockatrice, rooster head on a lizard body, a small creature, walking on the ground. Theme: dragonkin and giant beasts — thick scales, horns and spikes, heavy muscular build, embers or frost breath, imposing size. Power level 8 of 10: looks powerful and menacing.
```
**76 · 와이번** → `casual/enemies/inf/w076.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A lean wyvern with a venomous tail, flying, a small creature, flying in the air with wings or floating clearly off the ground. Theme: dragonkin and giant beasts — thick scales, horns and spikes, heavy muscular build, embers or frost breath, imposing size. Power level 8 of 10: looks powerful and menacing.
```
**77 · 모래 벌레** → `casual/enemies/inf/w077.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A young sand wyrm with a ring of teeth emerging from sand, a small creature, emerging from a hole in the ground, dirt and debris flying, lower body underground. Theme: dragonkin and giant beasts — thick scales, horns and spikes, heavy muscular build, embers or frost breath, imposing size. Power level 8 of 10: looks powerful and menacing.
```
**78 · 베히모스** → `casual/enemies/inf/w078.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A colossal armored behemoth beast with a bony back, a large bulky creature, walking on the ground. Theme: dragonkin and giant beasts — thick scales, horns and spikes, heavy muscular build, embers or frost breath, imposing size. Power level 8 of 10: looks powerful and menacing.
```
**79 · 용 전사** → `casual/enemies/inf/w079.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A dragonkin warrior in scale armor with a flaming greataxe, a medium creature, walking on the ground. Theme: dragonkin and giant beasts — thick scales, horns and spikes, heavy muscular build, embers or frost breath, imposing size. Power level 8 of 10: looks powerful and menacing.
```
**80 보스 · 화룡** → `casual/bosses/inf/b080.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Fire Dragon, a huge red dragon with lava veins and smoke from its nostrils, much larger and more imposing than regular enemies, ornate details, the lord of the dragonkin and giant beasts. Theme: thick scales, horns and spikes, heavy muscular build, embers or frost breath, imposing size. Power level 8 of 10.
```
**80 부관 · 히드라** → `casual/bosses/inf/b080-2.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Hydra, a five-headed swamp dragon with snapping heads, much larger and more imposing than regular enemies, ornate details, a lieutenant of the dragonkin and giant beasts. Theme: thick scales, horns and spikes, heavy muscular build, embers or frost breath, imposing size. Power level 8 of 10.
```

### 단계 9 · 악마 (웨이브 81~90)

| 웨이브 | 이름 | 등급 | 이동 | 파일 |
|---|---|---|---|---|
| 81 | 임프 | S | 지상 | `w081.png` |
| 82 | 헬하운드 | M | 지상 | `w082.png` |
| 83 | 지옥 오우거 | L | 지상 | `w083.png` |
| 84 | 지옥 벌레 | L | 땅굴 | `w084.png` |
| 85 | 그림자 악귀 | S | 지상 | `w085.png` |
| 86 | 임프 주술사 | S | 지상 | `w086.png` |
| 87 | 화염 악마 | L | 지상 | `w087.png` |
| 88 | 가고일 | S | 공중 | `w088.png` |
| 89 | 지옥 기사 | L | 지상 | `w089.png` |
| **90 보스** | 마왕 + 구덩이 악마 | L | 보스 | `b090.png` · `b090-2.png` |

**81 · 임프** → `casual/enemies/inf/w081.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A small red imp with a pitchfork and a mischievous grin, a small creature, walking on the ground. Theme: demons — dark red and black skin, curved horns, hellfire glow from cracks in the skin, bat-like wings or chains. Power level 9 of 10: looks powerful and menacing.
```
**82 · 헬하운드** → `casual/enemies/inf/w082.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A hellhound with a burning mane and flaming paws, a medium creature, walking on the ground. Theme: demons — dark red and black skin, curved horns, hellfire glow from cracks in the skin, bat-like wings or chains. Power level 9 of 10: looks powerful and menacing.
```
**83 · 지옥 오우거** → `casual/enemies/inf/w083.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A huge demonic ogre with lava cracks and a spiked club, a large bulky creature, walking on the ground. Theme: demons — dark red and black skin, curved horns, hellfire glow from cracks in the skin, bat-like wings or chains. Power level 9 of 10: looks powerful and menacing.
```
**84 · 지옥 벌레** → `casual/enemies/inf/w084.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A giant hell worm with a mouth of fire rising from cracked ground, a large bulky creature, emerging from a hole in the ground, dirt and debris flying, lower body underground. Theme: demons — dark red and black skin, curved horns, hellfire glow from cracks in the skin, bat-like wings or chains. Power level 9 of 10: looks powerful and menacing.
```
**85 · 그림자 악귀** → `casual/enemies/inf/w085.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A small shadow fiend, smoky body with glowing red eyes, a small creature, walking on the ground. Theme: demons — dark red and black skin, curved horns, hellfire glow from cracks in the skin, bat-like wings or chains. Power level 9 of 10: looks powerful and menacing.
```
**86 · 임프 주술사** → `casual/enemies/inf/w086.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. An imp shaman with a skull staff and floating fire orbs, a small creature, walking on the ground. Theme: demons — dark red and black skin, curved horns, hellfire glow from cracks in the skin, bat-like wings or chains. Power level 9 of 10: looks powerful and menacing.
```
**87 · 화염 악마** → `casual/enemies/inf/w087.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A large flame demon with a burning whip and wings, a large bulky creature, walking on the ground. Theme: demons — dark red and black skin, curved horns, hellfire glow from cracks in the skin, bat-like wings or chains. Power level 9 of 10: looks powerful and menacing.
```
**88 · 가고일** → `casual/enemies/inf/w088.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A stone gargoyle with bat wings, flying, a small creature, flying in the air with wings or floating clearly off the ground. Theme: demons — dark red and black skin, curved horns, hellfire glow from cracks in the skin, bat-like wings or chains. Power level 9 of 10: looks powerful and menacing.
```
**89 · 지옥 기사** → `casual/enemies/inf/w089.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A hell knight in black spiked armor wreathed in hellfire, a large bulky creature, walking on the ground. Theme: demons — dark red and black skin, curved horns, hellfire glow from cracks in the skin, bat-like wings or chains. Power level 9 of 10: looks powerful and menacing.
```
**90 보스 · 마왕** → `casual/bosses/inf/b090.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Demon Lord, a giant demon with a lava crown, four wings and a burning greatsword, much larger and more imposing than regular enemies, ornate details, the lord of the demons. Theme: dark red and black skin, curved horns, hellfire glow from cracks in the skin, bat-like wings or chains. Power level 9 of 10.
```
**90 부관 · 구덩이 악마** → `casual/bosses/inf/b090-2.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Pit Fiend, a bloated demon chained with molten links and a spiked mace, much larger and more imposing than regular enemies, ornate details, a lieutenant of the demons. Theme: dark red and black skin, curved horns, hellfire glow from cracks in the skin, bat-like wings or chains. Power level 9 of 10.
```

### 단계 10 · 심연과 파멸 (웨이브 91~101)

| 웨이브 | 이름 | 등급 | 이동 | 파일 |
|---|---|---|---|---|
| 91 | 심연 촉수 | S | 땅굴 | `w091.png` |
| 92 | 공허의 눈 | S | 공중 | `w092.png` |
| 93 | 심연 거인 | L | 지상 | `w093.png` |
| 94 | 파멸 기사 | L | 지상 | `w094.png` |
| 95 | 그림자 암살자 | M | 지상 | `w095.png` |
| 96 | 파멸 까마귀 | S | 공중 | `w096.png` |
| 97 | 공허 골렘 | L | 지상 | `w097.png` |
| 98 | 공허 벌레 | M | 땅굴 | `w098.png` |
| 99 | 흑요석 거상 | L | 지상 · 고방어 | `w099.png` |
| **100 보스** | 파멸의 군주 + 공허 용 | S | 보스 | `b100.png` · `b100-2.png` |
| 101 | 종말의 사자 | M | 지상 | `w101.png` |

**91 · 심연 촉수** → `casual/enemies/inf/w091.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A dark tentacle with an eye rising from a void rift in the ground, a small creature, emerging from a hole in the ground, dirt and debris flying, lower body underground. Theme: the abyss and doom — obsidian black body with violet void energy, eyes like stars, ornate ruinous armor, world-ending presence. Power level 10 of 10: looks apocalyptic and overwhelming.
```
**92 · 공허의 눈** → `casual/enemies/inf/w092.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A floating eyeball wrapped in violet void energy, flying, a small creature, flying in the air with wings or floating clearly off the ground. Theme: the abyss and doom — obsidian black body with violet void energy, eyes like stars, ornate ruinous armor, world-ending presence. Power level 10 of 10: looks apocalyptic and overwhelming.
```
**93 · 심연 거인** → `casual/enemies/inf/w093.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A huge abyssal titan with starry cracks across its black body, a large bulky creature, walking on the ground. Theme: the abyss and doom — obsidian black body with violet void energy, eyes like stars, ornate ruinous armor, world-ending presence. Power level 10 of 10: looks apocalyptic and overwhelming.
```
**94 · 파멸 기사** → `casual/enemies/inf/w094.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A doom knight in ornate obsidian armor with a void greatsword, a large bulky creature, walking on the ground. Theme: the abyss and doom — obsidian black body with violet void energy, eyes like stars, ornate ruinous armor, world-ending presence. Power level 10 of 10: looks apocalyptic and overwhelming.
```
**95 · 그림자 암살자** → `casual/enemies/inf/w095.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A shadow assassin with twin void daggers, cloaked, a medium creature, walking on the ground. Theme: the abyss and doom — obsidian black body with violet void energy, eyes like stars, ornate ruinous armor, world-ending presence. Power level 10 of 10: looks apocalyptic and overwhelming.
```
**96 · 파멸 까마귀** → `casual/enemies/inf/w096.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A three-eyed raven made of void smoke, flying, a small creature, flying in the air with wings or floating clearly off the ground. Theme: the abyss and doom — obsidian black body with violet void energy, eyes like stars, ornate ruinous armor, world-ending presence. Power level 10 of 10: looks apocalyptic and overwhelming.
```
**97 · 공허 골렘** → `casual/enemies/inf/w097.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A massive golem of obsidian shards held together by void light, a large bulky creature, walking on the ground. Theme: the abyss and doom — obsidian black body with violet void energy, eyes like stars, ornate ruinous armor, world-ending presence. Power level 10 of 10: looks apocalyptic and overwhelming.
```
**98 · 공허 벌레** → `casual/enemies/inf/w098.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A void worm with a spiral maw bursting out of a rift, a medium creature, emerging from a hole in the ground, dirt and debris flying, lower body underground. Theme: the abyss and doom — obsidian black body with violet void energy, eyes like stars, ornate ruinous armor, world-ending presence. Power level 10 of 10: looks apocalyptic and overwhelming.
```
**99 · 흑요석 거상** → `casual/enemies/inf/w099.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. A towering obsidian colossus covered in thick layered plate armor, a large bulky creature, walking on the ground. Theme: the abyss and doom — obsidian black body with violet void energy, eyes like stars, ornate ruinous armor, world-ending presence. Power level 10 of 10: looks apocalyptic and overwhelming. Heavily armored: thick layered metal plates cover most of the body.
```
**100 보스 · 파멸의 군주** → `casual/bosses/inf/b100.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Lord of Ruin, a colossal armored figure of obsidian with a galaxy inside its open chest, much larger and more imposing than regular enemies, ornate details, the lord of the the abyss and doom. Theme: obsidian black body with violet void energy, eyes like stars, ornate ruinous armor, world-ending presence. Power level 10 of 10.
```
**100 부관 · 공허 용** → `casual/bosses/inf/b100-2.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 90% of a 1024x1024 frame. BOSS: the Void Dragon, a dragon made of night sky and violet void light, much larger and more imposing than regular enemies, ornate details, a lieutenant of the the abyss and doom. Theme: obsidian black body with violet void energy, eyes like stars, ornate ruinous armor, world-ending presence. Power level 10 of 10.
```
**101 · 종말의 사자** → `casual/enemies/inf/w101.png`
```text
Hand-painted single character illustration for a casual tower-defense game, chibi proportions, 3/4 side view FACING RIGHT, full body, idle pose, Kingdom Rush and Random Dice style, thick clean outlines, saturated colors, soft cel shading, plain light gray background, no text, no watermark, character centered filling about 80% of a 1024x1024 frame. The harbinger of the end, a cloaked figure with a void scythe and a crown of stars, a medium creature, walking on the ground. Theme: the abyss and doom — obsidian black body with violet void energy, eyes like stars, ornate ruinous armor, world-ending presence. Power level 11 of 10: looks apocalyptic and overwhelming.
```

---

## §7. 출시용 UI · 아이콘 · 스플래시 · 연출 (2026-09-06)

Play 스토어 / App Store 출시(Capacitor, appId `com.fallman.dicekeep`, 이름 「주사위 성채 / Dicekeep」)에 필요한 **앱 아이콘·스플래시·스토어 그래픽**과, 인게임 HUD 를 그림으로 바꾸기 위한 **프레임·버튼·아이콘 23종·획득 연출 시트**. 모든 파일은 **선택** — 없으면 지금처럼 CSS/캔버스가 그리고, 파일을 넣으면 그 요소만 교체된다. 부분 납품 가능.

규칙 (§0~§6 과 다른 점에 주의)
- **UI 프레임·버튼·아이콘·로고는 투명 배경 PNG.** 회색 배경이 **아니다**. 이 파일들은 코드가 키잉(회색 제거)하지 않고 CSS `background-image` / `border-image` / `<img>` 로 **그대로** 쓴다. 회색이 남으면 화면에 회색 네모가 그대로 보인다. 프롬프트에 `transparent background PNG, alpha channel` 을 반드시 넣고, 저장 시 PNG(알파 포함)인지 확인할 것.
- **VFX 2×2 시트만 §2 와 같은 연회색 #C8C8C8 배경** (2열 2행, 좌상→우상→좌하→우하 = 프레임 0,1,2,3, 모든 칸 같은 크기·같은 중심). 단품 VFX(링·빛기둥·반짝이)는 투명 PNG.
- **글자를 절대 넣지 않는다.** 특히 한글은 생성 모델이 망가뜨린다. 제목·버튼 라벨·숫자·"DICEKEEP" 모두 CSS(Do Hyeon / Noto Sans KR)가 그림 위에 얹는다. 아이콘의 `?` `✕` `←` `∞` `▶` 는 글꼴이 아니라 **그려진 도형**으로 요청한다.
- **파일명·크기는 표 그대로.** 크기가 다르면 9-slice 모서리가 어긋난다. 생성은 큰 해상도(1024 급)로 하고 저장할 때 지정 크기로 축소한다(비율은 생성 때부터 맞출 것).
- 스타일은 기존과 같다: Kingdom Rush + Random Dice 캐주얼 치비, 두꺼운 외곽선. 팔레트는 `style.css` 와 맞춘다 — 금색 `#e8b64a`/`#ffd452`, 어두운 나무 `#3a2c1b`/`#2a1e12`/`#1c1409`, 크림 잉크 `#e9dfc4`, 강조 초록 `#8ef0b0` · 마젠타 `#ff7ad9` · 파랑 `#7fd4ff` · 빨강 `#ff7a7a` · 보라 `#c78bff`. 기존 `ui/gold.png`·`ui/heart.png`·`ui/title-keyart.jpg` 를 참고 이미지로 함께 넣으면 톤이 맞는다.

### 목록

| 파일 | 크기 | 용도 | 코드 연결 |
|---|---|---|---|
| `resources/icon-only.png` | 1024², **불투명** | 앱 아이콘 (Play·iOS 공통 원본) | `npx capacitor-assets generate` 가 모든 크기 생성 |
| `resources/icon-foreground.png` | 1024², 투명 | Android 적응형 아이콘 전경 | 위와 같음 |
| `resources/icon-background.png` | 1024², 불투명 | Android 적응형 아이콘 배경 | 위와 같음 |
| `resources/splash.png` · `splash-dark.png` | 2732², 불투명 | 스플래시(라이트/다크) | `@capacitor/splash-screen` |
| `ui/splash-logo.png` | 1024², 투명 | 앱 스플래시(`resources/splash.png`)용 엠블럼 | 웹 로딩 화면은 쓰지 않는다 — `title-keyart.jpg` 전면 + 글자 제목 |
| `ui/logo.png` | 1024×512, 투명 | (보류) 타이틀 로고 엠블럼 | 웹 타이틀·로비는 쓰지 않는다 — 키아트 + 글자 제목으로 확정 |
| `ui/title-keyart-p.jpg` · `-l.jpg` | 1500×1717 · 1600×1113 | 타이틀·로딩·로비 배경 (산 위 주사위 성, Grok 앱 미리보기 그림) | 세로는 그림의 돌 제목까지(-p, CSS 제목 숨김), 가로·데스크톱은 제목 없는 윗부분(-l) + CSS 금박 제목 |
| `store/feature-graphic.png` | 1024×500 | Play 스토어 피처 그래픽 | 스토어 등록용 (게임 미사용) |
| `ui/frame-panel.png` | 96², 투명, slice 24 | 어두운 패널 프레임 (메뉴·팝업) | CSS `border-image`, body `ui-art` |
| `ui/frame-card.png` | 96², 투명, slice 24 | 밝은 카드 프레임 (결과·순위표·상점 카드) | 위와 같음 |
| `ui/btn-gold.png` `btn-green.png` `btn-magenta.png` `btn-danger.png` `btn-violet.png` | 96×48, 투명, slice 16 | 버튼 5색 | 위와 같음 |
| `ui/chip-bar.png` | 192×48, 투명, slice 20 | 상단 정보 바(골드·목숨·웨이브) | 위와 같음 |
| `ui/slot-socket.png` | 256², 투명 | 주사위 놓는 석재 소켓 | 캔버스 (없으면 코드 소켓) |
| `ui/icon-<name>.png` ×23 | 64², 투명 | HUD·메뉴 아이콘 | `<img>` 교체 (없으면 이모지/글자) |
| `vfx/acquire-burst-2x2.png` | 1024², 회색 시트 | ★획득 별 폭발 4프레임 | `DKacquire` 연출 |
| `vfx/acquire-ring.png` · `acquire-ring-rainbow.png` | 512², 투명 | 획득 룬 링 (일반/전설) | 위와 같음 |
| `vfx/acquire-column.png` | 256×1024, 투명 | 획득 빛기둥 | 위와 같음 |
| `vfx/confetti-2x2.png` | 1024², 회색 시트 | 색종이 4프레임 (결과·승리) | 위와 같음 |
| `vfx/star-spark.png` | 128², 투명 | 4각 반짝이 파티클 | 위와 같음 |
| `vfx/chest-open-2x2.png` | 1024², 회색 시트 | 상자 열림 4프레임 | 상자 구매 연출 |
| `ui/chest.png` | 1024², 회색 | 보물상자 (닫힘) | `GROK-BRIEF.md` §E-3 과 동일 |

### UI 공통 프롬프트 (7.4·7.6·7.7·7.9 앞에 붙일 것)

```text
Hand-painted casual mobile game UI asset, Kingdom Rush and Random Dice style, chibi-cute proportions, thick clean dark outlines, saturated warm colors, gold (#e8b64a) metal trim on dark wood (#3a2c1b) with cream (#e9dfc4) accents, soft cel shading, flat front view. No text, no letters, no numbers, no watermark.
```

### 7.1 앱 아이콘 → `resources/icon-only.png` (1024², 불투명 · 알파 없음)

정사각 **풀블리드**. OS 가 둥근/원형 마스크를 씌우므로 **가장자리 10% 는 잘려도 되는 장식**만, 엠블럼은 중앙 80% 안에. Play 는 알파를 받지 않고 iOS 는 알파를 제거하므로 **투명 영역이 없어야** 한다. 글자 없음(이름은 OS 가 아래에 표시).

```text
Mobile app icon, 1024x1024, fully opaque square, full-bleed edge to edge, no transparency, no rounded corners (the OS applies its own mask: keep every important element inside the central 80%, only background texture may touch the edges). Hand-painted casual game style, Kingdom Rush and Random Dice, chibi-cute proportions, thick clean dark outlines, saturated colors. Subject: a large ivory six-sided die with red pips seen slightly from above, and a small cute stone castle keep with a red roof and a gold-trimmed blue banner standing on top of the die, a warm golden glow behind them. Background: deep dark-brown wood and stone (#2a1e12) with a subtle gold rune ring near the edges. Bold simple shapes that stay readable at 48 pixels. No text, no letters, no watermark.
```

### 7.2 적응형 아이콘 (Android) → `resources/icon-foreground.png` (1024², 투명) · `resources/icon-background.png` (1024², 불투명)

전경은 **중앙 66%(=676px 원) 안에 엠블럼만**, 나머지는 완전 투명(OS 가 흔들며 확대·마스킹한다). 배경은 단색에 가까운 미세 질감(나무결 또는 어두운 돌) — 물체·비네팅·하이라이트 없이 가장자리까지 고르게.

전경:
```text
Android adaptive app icon FOREGROUND layer, 1024x1024, transparent background PNG with alpha. Hand-painted casual game style, Kingdom Rush and Random Dice, chibi-cute proportions, thick clean dark outlines, saturated colors. Subject: the same emblem as the app icon — a large ivory six-sided die with red pips seen slightly from above and a small cute stone castle keep with a red roof and a gold-trimmed blue banner standing on top of it, a soft golden glow hugging the emblem. Framing: the whole emblem including its glow must fit inside the central 66% of the canvas (a 676-pixel circle in the middle); everything outside that circle is fully transparent, no drop shadow, no background. No text, no letters, no watermark.
```

배경:
```text
Android adaptive app icon BACKGROUND layer, 1024x1024, fully opaque, no alpha. A flat, even dark wood-grain texture in deep brown (#2a1e12 to #3a2c1b) with very subtle grain lines, or alternatively a dark worn stone texture — uniform edge to edge, seamless, no objects, no emblem, no vignette, no highlights, no gradient hotspot. No text, no watermark.
```

### 7.3 스플래시 → `resources/splash.png` · `resources/splash-dark.png` (2732², 불투명) · `ui/splash-logo.png` (1024², 투명)

배경 `#0d0b09` 위에 **중앙 로고**. 기기마다 다르게 잘리므로 **모든 요소가 중앙 1200×1200 안에** 있어야 하고, 그 밖은 아무것도 없는 `#0d0b09` 단색. `splash-dark.png` 는 배경이 원래 어두워 **같은 파일을 복사**해도 된다. `ui/splash-logo.png` 는 웹 로딩 화면용 투명 로고(스플래시 안의 엠블럼과 같은 그림) — 먼저 이걸 만들고, 스플래시는 편집기에서 `#0d0b09` 캔버스 중앙에 얹어도 된다.

로고(투명):
```text
Game logo emblem, 1024x1024, transparent background PNG with alpha, centered, filling about 85% of the frame. Hand-painted casual game style, Kingdom Rush and Random Dice, chibi-cute proportions, thick clean dark outlines, saturated colors. Subject: a large ivory six-sided die with red pips seen slightly from above, a small cute stone castle keep with a red roof standing on top of it, two crossed gold-trimmed banners behind, a few small gold sparkles, warm gold rim light. Nothing outside the emblem, no drop shadow, no background. No text, no letters, no watermark.
```

스플래시(불투명):
```text
Mobile app splash screen, 2732x2732 square, fully opaque. Background: a solid near-black warm dark color #0d0b09 filling the entire canvas edge to edge, completely plain — no vignette, no pattern, no gradient, no particles. In the exact center, the game emblem: a large ivory six-sided die with red pips seen slightly from above, a small cute stone castle keep with a red roof standing on top of it, crossed gold-trimmed banners behind, a soft golden glow and a few gold sparkles. Hand-painted casual Kingdom Rush and Random Dice style, chibi-cute proportions, thick clean dark outlines. Framing: every element including the glow stays inside the central 1200x1200 area; everything outside is plain #0d0b09. No text, no letters, no watermark.
```

### 7.4 타이틀 로고 → `ui/logo.png` (1024×512, 투명)

2:1 가로 캔버스. **엠블럼(주사위 위에 작은 성)만** 넣고, **영문 "DICEKEEP" 은 넣지 않는다** — 한글 「주사위 성채」는 CSS(Do Hyeon)가 얹는다. 글자 자리를 위해 **아래 35% 띠는 완전 투명**으로 비운다.

```text
Hand-painted casual mobile game UI asset, Kingdom Rush and Random Dice style, chibi-cute proportions, thick clean dark outlines, saturated warm colors, gold (#e8b64a) metal trim on dark wood (#3a2c1b) with cream (#e9dfc4) accents, soft cel shading, flat front view. No text, no letters, no numbers, no watermark. Title logo emblem on a 2:1 landscape canvas (1024x512), transparent background PNG with alpha. Subject: a large ivory six-sided die with red pips seen slightly from above, a small cute stone castle keep with a red roof and a blue banner standing on top of it, gold sparkles and a warm golden rim light, two small decorative gold scroll flourishes at the left and right of the die. Framing: the emblem is centered horizontally in the upper 65% of the canvas; the bottom 35% is a completely empty transparent band reserved for a title that will be added later. No wordmark, no letters of any kind, no background, no drop shadow, no watermark.
```

### 7.5 피처 그래픽 → `store/feature-graphic.png` (1024×500, 불투명)

Play 스토어 상단 배너. **왼쪽 40% 는 제목을 얹을 조용한 빈 공간**(어두운 단색에 가까운 배경, 물체 없음), 오른쪽 60% 에 성채·주사위 타워·몬스터 장면. 글자 없음(제목은 편집기에서 얹거나 비워 둔다).

```text
Mobile game store feature banner, 1024x500 landscape, fully opaque. Hand-painted casual tower defense style, Kingdom Rush and Random Dice, chibi-cute proportions, thick clean dark outlines, saturated colors, 3/4 top-down view. Composition: the LEFT 40% of the canvas is a quiet empty area — a plain deep dark-brown night sky (#1c1409) with only a faint soft golden glow, no objects, no characters — reserved for a title to be added later. The RIGHT 60%: a cute stone castle keep with a glowing crystal, several ivory dice towers with red pips on round stone pads firing colorful shots along a winding dirt road, a crowd of small cute chibi monsters (slime, goblin, bat) marching toward the castle, sparkles and explosions, warm gold and violet lighting. No text, no letters, no logo, no watermark.
```

### 7.6 HUD 프레임·버튼 9-slice (투명 PNG)

**9-slice 란**: 코드가 그림을 3×3 으로 자른 뒤 **모서리는 그대로, 가장자리는 늘리고, 가운데는 채워서** 어떤 크기의 패널·버튼이든 만든다. 그래서
- **모서리 사각형 안에 장식이 전부** 들어가야 한다 (`frame-*` 은 24px, `btn-*` 은 16px, `chip-bar` 는 20px).
- **가장자리(모서리 사이 띠)는 늘려도 티가 안 나는 단순 직선 띠**여야 한다 — 리벳·무늬·곡선 금지.
- **가운데는 평평한 단순 질감** — 하이라이트·비네팅·물체 금지.
- 생성은 큰 해상도로 하되 **비율을 정확히**(96² → 1:1, 96×48 → 2:1, 192×48 → 4:1) 하고, 저장 때 지정 크기로 축소. 축소 후 외곽선이 2px 안팎으로 남도록 굵게 그린다.

`ui/frame-panel.png` (96², slice 24 — 어두운 패널):
```text
Hand-painted casual mobile game UI asset, Kingdom Rush and Random Dice style, chibi-cute proportions, thick clean dark outlines, saturated warm colors, gold (#e8b64a) metal trim on dark wood (#3a2c1b) with cream (#e9dfc4) accents, soft cel shading, flat front view. No text, no letters, no numbers, no watermark. A square 9-slice PANEL frame (1:1 canvas, saved at 96x96), transparent background PNG with alpha. A dark panel of aged wood (#2a1e12) planks with a plain dark leather center, bordered by a gold metal band with small rivets and curled corner caps. 9-SLICE RULES: all ornament (corner caps, rivets, curls) must sit inside the four corner squares that are 25% of the side (24 of 96 pixels); the four edge strips between the corners are plain straight gold-band-over-wood bands with no rivets or pattern so they can be stretched; the center is a flat even dark leather texture with no highlight, no vignette, no objects. Only the panel itself is opaque; outside its outline is fully transparent. No text, no watermark.
```

`ui/frame-card.png` (96², slice 24 — 밝은 카드):
```text
Hand-painted casual mobile game UI asset, Kingdom Rush and Random Dice style, chibi-cute proportions, thick clean dark outlines, saturated warm colors, gold (#e8b64a) metal trim on dark wood (#3a2c1b) with cream (#e9dfc4) accents, soft cel shading, flat front view. No text, no letters, no numbers, no watermark. A square 9-slice CARD frame (1:1 canvas, saved at 96x96), transparent background PNG with alpha. A light card of cream parchment (#e9dfc4) or pale stone slab, bordered by a thin dark-wood edge with small gold corner ornaments. 9-SLICE RULES: all ornament must sit inside the four corner squares that are 25% of the side (24 of 96 pixels); the four edge strips between the corners are plain straight bands with no pattern so they can be stretched; the center is a flat even cream parchment texture with no highlight, no vignette, no objects. Only the card itself is opaque; outside its outline is fully transparent. No text, no watermark.
```

`ui/btn-<color>.png` (96×48, slice 16 — 5색, `{COLOR}` 만 바꿔 5번 생성):
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

`ui/chip-bar.png` (192×48, slice 20 — 상단 정보 바):
```text
Hand-painted casual mobile game UI asset, Kingdom Rush and Random Dice style, chibi-cute proportions, thick clean dark outlines, saturated warm colors, gold (#e8b64a) metal trim on dark wood (#3a2c1b) with cream (#e9dfc4) accents, soft cel shading, flat front view. No text, no letters, no numbers, no watermark. A 9-slice HUD INFO BAR on a 4:1 landscape canvas (saved at 192x48), transparent background PNG with alpha. A long rounded dark-wood strip (#2a1e12) with a thin gold metal rim, small gold end-caps on the left and right, a very slightly lighter flat center. 9-SLICE RULES: the end-caps and all ornament stay inside the outer 20 pixels of each side (of 192) and the top/bottom 20 pixels (of 48); everything between is a plain straight band with even color so it can be stretched; the center is flat with no highlight, no icons, no objects. Only the bar is opaque; outside its outline is fully transparent. No text, no watermark.
```

`ui/slot-socket.png` (256², 투명 — 주사위 소켓):
```text
Hand-painted casual mobile game UI asset, Kingdom Rush and Random Dice style, chibi-cute proportions, thick clean dark outlines, saturated warm colors, gold (#e8b64a) metal trim on dark wood (#3a2c1b) with cream (#e9dfc4) accents, soft cel shading. No text, no letters, no numbers, no watermark. A single round stone dice SOCKET seen from a 3/4 top-down view, 1:1 canvas saved at 256x256, transparent background PNG with alpha, centered, filling about 85% of the frame. A sunken circular socket of worn gray-violet stone with a thin gold rune ring around the rim and a dark recessed empty center, a short soft shadow directly under the socket only. Nothing else in the frame, no die inside, no background. No text, no watermark.
```

### 7.7 아이콘 23종 → `ui/icon-<name>.png` (64², 투명)

아이콘 공통 프롬프트 (앞에 붙일 것):
```text
Flat casual game UI icon, Kingdom Rush and Random Dice style, 1:1 canvas saved at 64x64, transparent background PNG with alpha, one symbol centered filling about 80% of the frame, a bold 2-pixel dark outline, gold (#e8b64a, #ffd452) and cream (#e9dfc4) palette with dark wood (#3a2c1b) shadows, simple readable silhouette, soft cel shading, no background shape, no drop shadow. Any glyph is a drawn shape, not typography. No text, no letters, no numbers, no watermark.
```

| # | 파일 | 꼬리 프롬프트 |
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

**대안 납품 — 4×6 그리드 시트 1장** (`ui/icons-sheet.png`, 1024², 투명, 칸 256²): 한 장에 23개를 위 순서대로 **좌→우, 위→아래**(1행 1~4, 2행 5~8, … 6행 21·22·23·빈칸)로 넣으면 스크립트가 잘라 `ui/icon-<name>.png` 로 저장한다. 시트 프롬프트는 공통 프롬프트 앞에 `A 4-column by 6-row grid sheet, 1024x1024, 24 equal square cells of 256 pixels, one icon centered in each cell in this order, last cell empty:` 을 붙이고 23개 설명을 번호 순으로 이어 쓴다. 각 칸 안에서 아이콘 크기·위치가 같아야 한다. 잘랐을 때 순서가 어긋나면 그 칸만 개별 생성.

| 행 | 칸 1 | 칸 2 | 칸 3 | 칸 4 |
|---|---|---|---|---|
| 1 | wave | speed1 | speed2 | speed3 |
| 2 | sound | mute | chat | menu |
| 3 | help | sell | enhance | chest |
| 4 | dice | gear | back | trophy |
| 5 | infinity | users | shop | stage |
| 6 | copy | gem | close | (빈칸) |

### 7.8 획득 연출 VFX (`vfx/`)

★획득·상자 열림·승리 연출. 2×2 시트는 회색 배경(코드가 지운다), 단품은 투명. 시트는 **네 칸 모두 같은 중심**, 프레임 순서 좌상→우상→좌하→우하.

`vfx/acquire-burst-2x2.png` (1024², 회색 시트, 4프레임 — 작→크→흩어짐→사라짐):
```text
Hand-painted 2x2 sprite sheet of a visual effect, four frames read left-to-right then top-to-bottom, Kingdom Rush and Random Dice casual style, thick clean outlines, bold simple shapes, all four cells the same size with the effect centered at the same point, plain light gray #C8C8C8 background, no text, no watermark. Effect: a golden star burst — frame 1 a small bright gold spark with four short rays; frame 2 a large burst of thick gold rays and a white core; frame 3 the rays break into scattered gold stars and sparkles flying outward; frame 4 only a few faint fading sparkles remain. Gold (#ffd452) and white, no characters, no background objects.
```

`vfx/acquire-ring.png` (512², 투명 — 금색 룬 링, 가운데 비움):
```text
Single visual-effect element, 1:1 canvas saved at 512x512, transparent background PNG with alpha, centered, filling about 90% of the frame. Kingdom Rush and Random Dice casual style, thick clean outlines. Effect: a glowing golden magic ring seen flat from the front — a thick gold (#e8b64a) circle with small engraved rune marks and tiny sparkles around it, soft golden outer glow. The CENTER of the ring is completely empty and transparent. No characters, no background. No text, no letters, no watermark.
```

`vfx/acquire-ring-rainbow.png` (512², 투명 — 무지개 룬 링, 전설용):
```text
Single visual-effect element, 1:1 canvas saved at 512x512, transparent background PNG with alpha, centered, filling about 90% of the frame. Kingdom Rush and Random Dice casual style, thick clean outlines. Effect: a glowing magic ring seen flat from the front — a thick circle whose color cycles smoothly around the ring through pink, violet, blue, mint and gold, with small engraved rune marks and tiny sparkles, soft prismatic outer glow. The CENTER of the ring is completely empty and transparent. No characters, no background. No text, no letters, no watermark.
```

`vfx/acquire-column.png` (256×1024, 투명 — 빛기둥, 아래 밝고 위로 투명):
```text
Single visual-effect element on a 1:4 portrait canvas (saved at 256x1024), transparent background PNG with alpha, centered horizontally. Kingdom Rush and Random Dice casual style, soft glow. Effect: a vertical pillar of golden light — bright, opaque pale-gold (#ffd452) at the bottom, fading smoothly to fully transparent at the top, with a few small rising gold sparkles inside; straight soft edges, slightly narrower at the top. No characters, no floor, no background. No text, no watermark.
```

`vfx/confetti-2x2.png` (1024², 회색 시트, 4프레임 — 색종이·별 흩날림):
```text
Hand-painted 2x2 sprite sheet of a visual effect, four frames read left-to-right then top-to-bottom, Kingdom Rush and Random Dice casual style, thick clean outlines, bold simple shapes, all four cells the same size with the effect centered at the same point, plain light gray #C8C8C8 background, no text, no watermark. Effect: a shower of confetti and stars — frame 1 a tight cluster of confetti pieces and small stars just popping upward from the center; frame 2 the pieces spread wide in an arc; frame 3 the pieces fall and tumble, spread across the cell; frame 4 only a few pieces near the bottom, fading. Colors: gold (#ffd452), mint (#8ef0b0), pink (#ff7ad9), blue (#7fd4ff), violet (#c78bff). No characters, no background objects.
```

`vfx/star-spark.png` (128², 투명 — 4각 반짝이):
```text
Single visual-effect element, 1:1 canvas saved at 128x128, transparent background PNG with alpha, centered, filling about 90% of the frame. Kingdom Rush and Random Dice casual style. Effect: one four-pointed sparkle star — a bright white core with pale-gold (#ffd452) points, long thin vertical points and shorter horizontal points, soft golden glow around it. Nothing else, no background. No text, no watermark.
```

`vfx/chest-open-2x2.png` (1024², 회색 시트, 4프레임 — 상자가 열리며 빛 터짐, `ui/chest.png` 참고 이미지 첨부):
```text
Hand-painted 2x2 sprite sheet, four frames read left-to-right then top-to-bottom, Kingdom Rush and Random Dice casual style, thick clean outlines, all four cells the same size with the chest at the same position and same size in every cell, plain light gray #C8C8C8 background, no text, no watermark. Subject: the same closed treasure chest as the reference — dark wood with gold bands and a glowing golden lock, 3/4 view. Frame 1 the chest closed and shaking slightly; frame 2 the lid cracked open with a thin line of gold light; frame 3 the lid wide open with a big burst of golden light and small sparkles pouring out; frame 4 the lid fully open, the light calming to a soft glow, a few ivory dice visible inside. No characters, no background objects.
```

### 7.9 보물상자 → `ui/chest.png` (1024², 회색 배경)

`GROK-BRIEF.md` §E-3 과 같은 파일. 7.8 의 `chest-open-2x2` 와 같은 디자인이어야 하므로 이걸 먼저 만들고 참고 이미지로 쓴다.

```text
Single closed treasure chest icon on a solid plain light gray #C8C8C8 background, centered, 3/4 view, hand-painted casual Kingdom Rush style, dark wood with gold bands and a glowing golden lock, a few dice peeking from under the lid, thick clean outlines, no text, no watermark.
```

### 7.10 스토어 스크린샷 가이드 (생성 아님 — 실제 게임 캡처)

| 방향 | 크기 | 수량 | 장면 |
|---|---|---|---|
| 세로 | 1080×1920 | 4 | ① 로비(스테이지 선택) ② 인피니티 세로 플레이(주사위 보드가 가득 찬 순간) ③ ★획득 연출(전설 링이 뜬 순간) ④ 결과 순위표 |
| 가로 | 1920×1080 | 2 | ⑤ 가로 플레이(타워가 많이 지어진 후반 웨이브) ⑥ 함께하기 필드 보기(두 플레이어 보드가 보이는 화면) |

- 실제 플레이를 캡처한다(브라우저 기기 에뮬레이션 또는 실기기). 생성 이미지·합성 장면은 스토어 정책상 쓰지 않는다.
- **상단 1/5 에 짧은 카피 한 줄**(예: 「주사위를 굴려 성을 지켜라」)을 편집기에서 얹는다 — 한글은 생성 모델이 아니라 편집기로. 나머지 4/5 는 게임 화면 그대로.
- 폰 프레임(기기 목업) 없이, 텍스트는 최소. 카피 외에 글자를 덧붙이지 않는다.
- 파일명 `store/shot-portrait-1~4.png`, `store/shot-landscape-1~2.png`.

### 납품 순서 권장

1. **아이콘·스플래시** (7.1 → 7.2 → 7.3) — 스토어 등록에 먼저 필요. `resources/` 에 넣고 `npx capacitor-assets generate`.
2. **로고** (7.4, 7.5)
3. **프레임·버튼** (7.6) — 패널 → 카드 → 버튼 5색 → 정보 바 → 소켓. 첫 프레임 하나를 넣어 9-slice 가 늘어날 때 깨지지 않는지 확인한 뒤 나머지.
4. **아이콘 23종** (7.7)
5. **VFX** (7.9 상자 → 7.8 시트·단품)

### 확인 방법

- 파일을 넣고 `http://localhost:8137` (file:// 금지)에서 Ctrl+F5. 콘솔에서 `document.body.classList.contains('ui-art')` 가 `true` 면 UI 아트가 감지·적용된 것(프레임·버튼·아이콘 중 하나라도 로드되면 켜진다). `false` 면 파일명·경로·PNG 알파를 확인.
- 프레임은 크기가 다른 패널(설정 팝업·결과 창)을 모두 열어 모서리가 늘어나 찌그러지지 않는지 본다. 찌그러지면 장식이 모서리 사각형 밖으로 나간 것.
- 획득 연출은 콘솔에서 `DKacquire(20)` (★20 획득 연출 재생, 숫자는 성) 으로 바로 확인. 링·빛기둥·별 폭발·색종이가 모두 그림으로 바뀌었는지 본다.
- 앱 아이콘은 `npx capacitor-assets generate` 후 Android 런처에서 원형·둥근 사각형 마스크 둘 다 확인(엠블럼이 잘리지 않는지).
