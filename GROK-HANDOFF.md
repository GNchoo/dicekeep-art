# Grok 인수 브리프 — 주사위 성채 (Dicekeep)

이 문서는 **이 저장소를 내려받은 Grok AI**가 이어서 할 일을 정리한 것이다.
사람(제작자)에게 묻기 전에 이 파일 → `game.js` → 기존 아트팩을 먼저 읽어라.
대화는 **한국어**로, 이미지 생성 프롬프트는 **영어**로 작성한다.

저장소: https://github.com/GNchoo/dicekeep-art
커밋 기준: `87202fd` 이후 (플레이 가능한 게임 + 이 브리프)

---

## 0. 바로 실행하는 명령

```powershell
git clone https://github.com/GNchoo/dicekeep-art.git
cd dicekeep-art
python serve.py
```

브라우저에서 `http://localhost:8137` 접속.
Windows면 `start.bat`를 더블클릭해도 된다 (`serve.py`가 캐시 없이 8137 포트로 연다).

**하지 말 것:** `index.html`을 file://로 열기. 캔버스가 tainted 되면 배경 키잉이 빠져 스프라이트에 핑크 잔상이 남는다.

코드 고친 뒤 브라우저가 옛 `game.js`를 물고 있으면 `index.html`의 `?v=2`를 `?v=3`으로 올리고 강력 새로고침(Ctrl+F5) 하라.

디버그 훅 (콘솔):
- `window.DK` — 게임 상태 (`heldDie`, `gold`, `towers` …)
- `window.DKDIE` — 필드 3D 주사위 (`forceFinal`로 눈 강제 가능)
- `window.DKSLOT` — 버튼용 슬롯 굴림
- `window.DKthrow(vx, vy)` — 필드 물리 던지기

---

## 1. 지금 게임이 하는 일 (수정된 내용)

원래 이 저장소는 **아트팩만** 있었다 (`b6f38f3`). 그 위에 HTML5 Canvas 타워 디펜스를 올렸다.

### 핵심 규칙
- 주사위 눈 **1~6 = 타워 종류**. 눈이 높을수록 강하다. 6이 최강.
- 굴린 주사위를 **빈 건설 지점**에 놓으면 그 눈의 타워가 생긴다.
- **같은 눈** 타워 위에 다시 놓으면 레벨 업 (최대 Lv3). 다른 눈은 거부.
- 골드 130 시작, 굴리기 40G, 목숨 20, 웨이브 20. 5의 배수 웨이브에 보스.

| 눈 | 이름 | 역할 | 색 |
|----|------|------|----|
| 1 | 궁수 주사위 | 빠른 단일 사격 | `#9fd463` |
| 2 | 대포 주사위 | 광역 포격 splash 60 | `#e0862c` |
| 3 | 마법 주사위 | 강한 마법탄 | `#b78bff` |
| 4 | 서리 주사위 | 둔화 | `#7fd4ff` |
| 5 | 전격 주사위 | 연쇄 번개 (코드로 빔) | `#ffe86b` |
| 6 | 폭군 주사위 | 최강 광역, 미니 주사위 투척 | `#ff5555` |

### 조작 (두 갈래 — 절대 합치지 말 것)
1. **필드 드래그 플릭** — 맵 왼쪽 아래 3D 주사위를 잡고 던져 물리로 굴린다. 윗면이 결과.
2. **버튼 / R키** — HUD `?` 박스 안에서 작은 3D 큐브가 ~1초 회전 후 즉시 획득. 필드 주사위는 그대로.

### 이미 구현된 기술
- PNG 가장자리 크로마키 + bbox 크롭 (`keyImageData`)
- 소프트웨어 3D 주사위 (`drawCube`, 회전 행렬, 텍스처 매핑)
- `dice-3.png`는 원본이 3/4 원근이라 `fixDice3()`가 1눈 핍으로 정면 3눈을 합성한다
- 타워는 **아직 전용 아트가 없다**. `buildTowerSprites()`가 돌 받침 + 원소 글로우 + `dice/dice-N.png`를 합성한다
- 기존 `towers/archer.png` 등 5종은 **로드하지 않는다** (구 컨셉)

### 건드리면 안 되는 것
- 맵 웨이포인트 `PATH`, 건설 지점 `SPOTS` — 맵 그림과 맞춰 둔 값
- 3D 원근 `persp = 10` — 낮추면 큐브가 납작해진다
- 버튼 굴림(`SLOT`)과 필드 굴림(`DIE`) 분리

---

## 2. 네가 해야 할 일 (우선순위)

### P0 — 눈별 주사위 타워 이미지 6장 (가장 중요)
컨셉: **주사위가 타워로 변신했고, 눈(pip) 자체가 무기**.
예: 1눈이면 그 한 눈에서 레이저가 나간다.

Grok Imagine으로 생성 → `towers/die-1.png` … `towers/die-6.png` 저장 → `game.js`의 `SRCS`에 넣고 `buildTowerSprites()` 대신 그 이미지를 쓰게 연결.

- 비율 **1:1**, 한 오브젝트 중앙, 배경은 **연회색 단색**
- 게임 로더가 배경을 지우고 크롭하므로 완벽한 투명 PNG가 아니어도 된다
- 스타일: 핸드페인트, Kingdom Rush풍 **3/4 뷰**, 상아색 뼈 주사위, 어두운 숲 성채, 횃불
- 기존 `dice/dice-1.png`~`6.png`의 상아+진홍 핍 톤을 유지할 것
- `towers/archer.png` 등 옛 타워 그림은 참고만. 그 자리에  squish 해서 쓰지 말 것

### P1 — 공격 이펙트 / 투사체 (새 컨셉에 맞게)
지금 전투 연출은 **구 아트팩 VFX + 코드 도형**이다. 눈=무기 컨셉과 어긋난다.

| 눈 | 현재 | 만들어야 할 것 | 권장 파일 |
|----|------|----------------|-----------|
| 1 | `vfx/arrow.png` 화살이 날아감 | **레이저/스나이퍼 빔**. 투사체 대신 순간 빔이 더 맞음 | `vfx/laser-beam.png`, `vfx/laser-muzzle.png` |
| 2 | `vfx/shell.png` + `impact` | 포구 화염, 더 굵은 폭발 (2눈=쌍포) | `vfx/muzzle-flash.png`, `vfx/cannon-blast-2x2.png` |
| 3 | `vfx/bolt.png` | 자수정 마력탄 + 적중 룬 버스트 | `vfx/arcane-burst-2x2.png` |
| 4 | `vfx/frost-shard.png`, 적중은 원 테두리(`frostHit`) | 사방 냉기 파편 + 빙결 버스트 시트 | `vfx/frost-burst-2x2.png` |
| 5 | 코드로 지그재그 선(`S.beams`) + `vfx/spark.png` | 번개 아크 스프라이트, 피격 스파크는 유지 가능 | `vfx/lightning-arc.png` |
| 6 | `dice-6.png`를 회전시켜 던짐 + `impact` | 불타는 미니 주사위 폭탄 + 주사위 폭발 | `vfx/die-bomb.png`, `vfx/die-explode-2x2.png` |

2x2 시트 규칙 (이미 로더가 있음): **2열 2행**, 좌상→우→좌하→우하 = 프레임 0,1,2,3. `processSheet` / `sheets` 배열에 키를 추가하면 된다.

### P2 — 타워 공격 모션 (있으면 훨씬 좋음)
지금은 타워가 **정지 합성 스프라이트 + 머리 위 topper 회전**만 한다. 발사 시 기울임/반동이 없다.

눈마다 **대기 1장 + 공격 2~4프레임**이면 충분하다.

권장:
```
towers/die-1.png          대기(필수, P0)
towers/die-1-attack-2x2.png   공격 4프레임 (선택, P2)
```

코드 연결 위치: `towerFire()`에서 발사 순간 `t.anim = 'atk'; t.animT = 0;` → `draw()`의 타워 분기에서 시트 재생.

레벨 차등(선택): 각 프롬프트 끝에 `more ornate, taller, additional golden trim and stronger glow`를 붙여 `die-N-lv2.png`, `die-N-lv3.png`.

### P3 — 하면 좋지만 필수는 아님
- 적 피격 플래시, 사망 먼지 (지금 보스만 `impact`)
- 타워 배치/합체 전용 마법진
- 포탈/크리스탈은 맵 JPG에 이미 그려져 있음. `props/`는 장식용
- BGM 없음 (효과음은 WebAudio 신스). 넣어도 되지만 요청 받기 전엔 넣지 말 것

---

## 3. Grok Imagine 프롬프트 (타워 P0)

그대로 붙여 넣어라. 한 장씩, 1:1.

### 1눈 — 외눈 감시탑 (속사 레이저)

```text
Hand-painted fantasy tower defense game asset, Kingdom Rush style, 3/4 top-down view. A weathered ivory bone dice transformed into a watchtower: its single center pip has become a huge glowing crimson eye-lens set in an ornate brass iris, firing a thin scarlet sniper beam upward at an angle. Cracked ivory surface with carved arrow-slit details, small wooden scaffold ring and a torch around the base, sitting on a round mossy stone pedestal. Dark forest keep aesthetic, warm torchlight, crisp painterly details. Single object centered, isolated on a plain light gray background, no text, no watermark.
```

### 2눈 — 쌍포 요새 (광역 포격)

```text
Hand-painted fantasy tower defense game asset, Kingdom Rush style, 3/4 top-down view. A weathered ivory bone dice transformed into an artillery fort: its two pips have become two black iron cannon muzzles protruding from the dice face, rimmed with riveted bronze, one softly smoking. Powder kegs, a coiled fuse rope and stacked cannonballs beside it, scorch marks on the cracked ivory, sitting on a round mossy stone pedestal. Dark forest keep aesthetic, warm torchlight, crisp painterly details. Single object centered, isolated on a plain light gray background, no text, no watermark.
```

### 3눈 — 비전 삼련석 (마법탄)

```text
Hand-painted fantasy tower defense game asset, Kingdom Rush style, 3/4 top-down view. A weathered ivory bone dice transformed into an arcane obelisk: its three diagonal pips have become three glowing amethyst rune-gems connected by a channel of violet energy carved across the dice face, the topmost gem charging a floating orb of purple magic. Faint runic inscriptions glow on the ivory, small floating rune stones orbit the die, sitting on a round mossy stone pedestal. Dark forest keep aesthetic, mystical violet glow against warm torchlight, crisp painterly details. Single object centered, isolated on a plain light gray background, no text, no watermark.
```

### 4눈 — 사방서리 첨탑 (둔화)

```text
Hand-painted fantasy tower defense game asset, Kingdom Rush style, 3/4 top-down view. A weathered ivory bone dice transformed into a frost spire: its four corner pips have become four jagged blue ice crystals jutting out of the dice face, each venting a wisp of freezing mist toward a different direction. Frost creeps across the cracked ivory surface, icicles hang from the edges, snow dusts the top, sitting on a round frozen stone pedestal. Dark forest keep aesthetic, cold cyan glow contrasting warm torchlight, crisp painterly details. Single object centered, isolated on a plain light gray background, no text, no watermark.
```

### 5눈 — 오뢰 전격탑 (연쇄 번개)

```text
Hand-painted fantasy tower defense game asset, Kingdom Rush style, 3/4 top-down view. A weathered ivory bone dice transformed into a lightning tower: its four corner pips have become copper lightning-rod terminals and the center pip has grown into a tall brass tesla coil antenna, with crackling blue-white electric arcs jumping between all five pips. Scorched dark streaks on the cracked ivory, coiled copper wiring along the edges, sitting on a round mossy stone pedestal. Dark forest keep aesthetic, electric glow against warm torchlight, crisp painterly details. Single object centered, isolated on a plain light gray background, no text, no watermark.
```

### 6눈 — 폭군의 옥좌 (폭발 주사위 투척)

```text
Hand-painted fantasy tower defense game asset, Kingdom Rush style, 3/4 top-down view. A weathered ivory bone dice transformed into a tyrant's fortress: all six pips have become round black mortar launch-ports with glowing red-hot rims, one port mid-firing a tiny burning dice bomb with a spark trail. The die wears an ornate spiked golden crown and torn crimson royal banners, gold filigree along its edges, sitting on a grand round obsidian pedestal with embers. Dark forest keep aesthetic, menacing red-gold glow, the most powerful tower, crisp painterly details. Single object centered, isolated on a plain light gray background, no text, no watermark.
```

---

## 4. Grok Imagine 프롬프트 (이펙트 P1)

공통 꼬리: `Hand-painted game VFX sprite, Kingdom Rush style, single isolated effect centered on a plain light gray background, no text, no watermark, transparent-friendly edges.`

**레이저 빔 (1눈)**
```text
Hand-painted game VFX sprite, a thin straight scarlet sniper laser beam with a glowing crimson core and soft outer glow, slight heat shimmer, Kingdom Rush style, isolated on plain light gray background, no text, no watermark.
```

**포구 화염 (2눈)**
```text
Hand-painted game VFX sprite, a short orange-white cannon muzzle flash with smoke puffs and sparks, 3/4 view, Kingdom Rush style, isolated on plain light gray background, no text, no watermark.
```

**대포 폭발 2x2**
```text
Hand-painted 2x2 sprite sheet of a cannon explosion, four frames left-to-right then down: small spark, fireball, debris burst, fading smoke. Kingdom Rush style, each cell the same size, plain light gray background, no text, no watermark.
```

**비전 버스트 2x2 (3눈)**
```text
Hand-painted 2x2 sprite sheet of a violet arcane impact, four frames: rune spark, expanding purple glyph ring, shard burst, fading motes. Kingdom Rush style, plain light gray background, no text, no watermark.
```

**빙결 버스트 2x2 (4눈)**
```text
Hand-painted 2x2 sprite sheet of a frost burst, four frames: ice crack, cyan crystal bloom, mist ring, fading snow. Kingdom Rush style, plain light gray background, no text, no watermark.
```

**번개 아크 (5눈)**
```text
Hand-painted game VFX sprite, a jagged blue-white lightning bolt arc with forked branches and electric glow, Kingdom Rush style, isolated on plain light gray background, no text, no watermark.
```

**미니 주사위 폭탄 (6눈 투사체)**
```text
Hand-painted game projectile, a tiny ivory six-sided die on fire with a sparking fuse, flying at a 3/4 angle, Kingdom Rush style, isolated on plain light gray background, no text, no watermark.
```

**주사위 폭발 2x2 (6눈)**
```text
Hand-painted 2x2 sprite sheet of an exploding ivory dice bomb, four frames: crack with red glow, die bursting into pips and fire, fireball, fading embers and ivory shards. Kingdom Rush style, plain light gray background, no text, no watermark.
```

**공격 모션 시트 (P2, 눈마다 반복 — {N}과 해당 타워 설명을 바꿔 넣기)**
```text
Hand-painted 2x2 sprite sheet of the same ivory dice-tower attacking, four frames of recoil and firing from its pips, consistent size and pivot at the stone pedestal, Kingdom Rush 3/4 view, plain light gray background, no text, no watermark. Match the idle tower design exactly.
```

---

## 5. 코드에 연결하는 방법

`game.js`만 고치면 된다. CSS/HTML은 슬롯·HUD가 이미 있다.

1. `SRCS`에 새 경로 추가. 예: `t1: 'towers/die-1.png'` … `t6: 'towers/die-6.png'`
2. 2x2 시트는 `sheets` 배열에 키를 넣는다 (`impact`와 동일)
3. `buildTowerSprites()`를 이미지 로드 결과로 바꾸거나, 이미지가 있으면 그걸 쓰고 없으면 합성본을 쓰는 폴백을 남겨라
4. 앵커: 타워는 **발밑(받침 중심)** 이 `(t.x, t.y)`에 온다. 지금 그리기는 `ctx.drawImage(sp.cv, t.x - TS_CX, t.y + 6 - TS_BASE_Y)`. 새 이미지 bbox가 달라지면 `TS_CX`/`TS_BASE_Y`를 재측정하라
5. 1눈을 레이저로 바꾸려면 `TOWER_DEFS[1]`에서 `proj: 'arrow'`를 빼고 `towerFire()`에 5눈처럼 즉시 히트+빔 분기를 추가하라. 발사 원점은 `from = { x: t.x, y: t.y - 64 }` (주사위 면 높이)
6. `index.html`의 `game.js?v=2` 쿼리를 올릴 것

기존 아트팩 재사용 가능:
- `vfx/impact-2x2.png` — 범용 폭발 (2·6 임시)
- `vfx/spark.png` — 5눈 피격
- `dice/dice-*.png` — 3D 주사위 텍스처, HUD, 6눈 임시 투사체. **타워 본체로 쓰지 말 것** (P0 이미지가 그 역할)

로드하지 않는 파일 (삭제하지 말 것):
- `towers/archer.png` `cannon.png` `mage.png` `frost.png` `tesla.png`
- `enemies/*.png` 정지컷 (워킹 시트만 사용)
- `props/portal.png` `crystal.png`

---

## 6. 작업 후 확인 체크리스트

브라우저에서 직접 확인할 것. 스크린샷 한 장으로 끝내지 말 것.

- [ ] 버튼 굴리기: `?` 박스 안에서만 돌고, 필드 주사위는 안 움직임, ~1초 안에 획득
- [ ] 플릭 던지기: 3D 큐브가 납작하지 않고, 윗면 = 획득 눈
- [ ] 1~6 배치: 새 타워 그림이 받침에 붙어 있고 발밑이 건설 지점과 맞음
- [ ] 같은 눈 합체 Lv2/Lv3, 다른 눈은 거부
- [ ] 각 눈 공격이 컨셉과 맞음 (1 레이저, 2 광역, 3 마법탄, 4 둔화, 5 연쇄, 6 폭발)
- [ ] 웨이브 시작 → 적이 길을 따라 크리스탈로 감
- [ ] `file://`가 아니라 `http://localhost:8137`에서 테스트

---

## 7. 파일 지도

| 경로 | 역할 |
|------|------|
| `game.js` | 게임 전부. 여기만 연결하면 된다 |
| `index.html` / `style.css` | HUD, 슬롯 캔버스, 오버레이 |
| `serve.py` / `start.bat` | 무캐시 로컬 서버 |
| `dice/` | 3D·HUD용 정면 주사위. 3은 코드가 보정 |
| `map/battlefield.jpg` | 1024×576 전장 |
| `enemies/*-walk-2x2.png` | 적 걷기 |
| `vfx/` | 구 투사체/임팩트. P1로 교체·추가 |
| `towers/` | 옛 5종 + **네가 넣을 die-1~6** |
| `ui/` | 골드, 하트, 타이틀 키아트 |

사람이 이미지를 폴더에만 넣어 주고 연결을 부탁하면, 합성 타워를 빼고 새 에셋을 로드하도록 코드를 고치면 된다.
