# 주사위 성채 (Dicekeep) — 게임 명세

최종 정리: 2026-08-31. 저장소: https://github.com/GNchoo/dicekeep-art

이 문서는 **현재 구현된 규칙·아트·파일 위치**의 단일 소스다.
이어서 작업할 때는 이 파일 → `content.js` → `game.js` → `GROK-HANDOFF.md` 순으로 읽는다.

대화는 한국어, 이미지 생성 프롬프트는 영어(Grok Imagine).

---

## 1. 한 줄 요약

주사위를 굴려 나온 눈(1~6)이 곧 타워 종류다. 눈을 빈 석단에 놓으면 설치, 같은 눈 위에 놓으면 합체(최대 Lv3). 포탈에서 나온 적이 크리스탈에 닿기 전에 막는다. 100웨이브, 50맵.

---

## 2. 실행

```bash
git clone https://github.com/GNchoo/dicekeep-art.git
cd dicekeep-art
python serve.py
# http://localhost:8137
```

Windows: `start.bat`. **file://로 열지 말 것** (캔버스 tainted → 크로마키 실패).

캐시: `index.html`의 `content.js?v=N` / `game.js?v=N` / `style.css?v=N` 을 올릴 것.

디버그:
- `window.DK` 게임 상태
- `window.DKA` 로드된 스프라이트
- `window.DKDIE` 필드 3D 주사위
- `window.DKSLOT` 버튼 슬롯 굴림
- `window.DKthrow(vx, vy)` 필드 물리 던지기
- `window.DKCONTENT` 맵/적/타워 카탈로그

---

## 3. 규칙

| 항목 | 값 |
|---|---|
| 시작 골드 | 130 |
| 굴리기 비용 | 40G |
| 목숨 | 20 |
| 웨이브 | 100 |
| 맵 | 50종, 웨이브마다 `maps[(wave-1) % 50]` |
| 합체 | 같은 눈만, 최대 Lv3 |
| 보스 | 5의 배수 웨이브 |

### 타워 (눈 = 종류, 높을수록 강함)

| 눈 | 이름 | 역할 | 파일 |
|---|---|---|---|
| 1 | 궁수 주사위 | 속사 레이저, 공중 가능 | `casual/towers/t1-a.png` |
| 2 | 대포 주사위 | 쌍포 광역 splash 60 | `casual/towers/t2-a.png` |
| 3 | 마법 주사위 | 자수정 마력탄 | `casual/towers/t3-a.png` |
| 4 | 서리 주사위 | 사방 냉기 둔화 | `casual/towers/t4-a.png` |
| 5 | 전격 주사위 | 연쇄 번개 | `casual/towers/t5-a.png` |
| 6 | 폭군 주사위 | 폭발 주사위 투척 | `casual/towers/t6-a.png` |

현재 인게임 스킨은 눈당 **1장(a)** 만 쓴다. b~e 는 이전 배치 아트로 폴더에 보존.

공격 모션: `casual/towers/tN-attack-2x2.png` (2열2행, 발사 시 kick 동안 4프레임).

레벨: 데미지 `[1, 1.6, 2.4]`, 사거리 `+0/+12/+24`, 연사 `1/0.92/0.85`.

앵커: 타워 발밑(받침) = `(t.x, t.y)` = 건설 지점.

### 조작 (두 갈래 — 합치지 말 것)

1. **필드 플릭** — 맵 왼쪽 아래 3D 주사위를 잡고 던진다. 윗면이 결과. 적에게 세게 맞히면 속도 비례 피해.
2. **버튼 / R** — HUD `?` 박스 안에서만 회전 후 즉시 획득.

획득한 주사위는 **드래그해서 석단에 놓으면** 해당 눈 타워로 변신. 같은 눈 타워 위에 올리면 합체 하이라이트.

### 적 이동

- `ground` 흙길 PATH
- `air` 같은 PATH, y −42, 그림자
- `burrow` 잠수 타이머, 숨으면 타겟 불가

초반 12종은 걷기 시트: slime, shroom, pig, chicken, goblin, sheep, cactus, fox, penguin, raccoon, frog, turtle.

---

## 4. 맵 경로

`content.js`의 각 맵에 `path`, `spots` 가 있다. 웨이브 시작 시 `applyMapLayout`.

- 기본 레이아웃 `PATH_S` / `SPOTS_S`: 왼쪽 포탈 → 아래 한 바퀴 → 오른쪽 크리스탈.
- 오버라이드: 맵 10 대나무 (`PATH_BAMBOO`), 맵 13 태엽 (`PATH_CLOCK`).
- PATH = 흙길. SPOTS = 길 **옆** 잔디/석단 (길 위·물 위 금지).
- 맵이 바뀌면 기존 타워는 **같은 슬롯 인덱스**의 새 좌표로 붙는다.

캔버스 1024×576. 맵 JPG는 이 크기로 stretch.

---

## 5. 아트 현황 (디스크 = 카탈로그)

| 항목 | 목표 | 파일 | 상태 |
|---|---|---|---|
| 스테이지 | 100 | 로직 | 완료 |
| 배경 | 50 | `casual/maps/*.jpg` | 완료 |
| 몬스터 고유 | 500 | `casual/enemies/*.png` | 완료 (대기 500 + 걷기 12) |
| 보스 고유 | 100 | `casual/bosses/*.png` | 완료 |
| 타워 인게임 | 6 | `t1-a`~`t6-a` | 2D 아이소 재작업 |
| 타워 보존 스킨 | 30 | `tN-a`~`tN-e` | 폴더에 유지 |
| 타워 공격 시트 | 6 | `tN-attack-2x2.png` | 완료 |
| 공격 VFX P1 | 눈별 | `vfx/` | 완료 |
| 적 걷기 | 순차 | 12종 `*-walk-2x2.png` | 진행 중 |

스타일: Kingdom Rush + Random Dice. 캐주얼 치비, 두꺼운 외곽선, 아이소 3/4.

타워 재작업 원칙:
- 2D 핸드페인트 건물이지 3D 주사위 큐브가 아님
- 눈 개수가 무기로 녹아 있어야 함
- 마젠타/회색 배경 잔상 제거
- 인게임 박스 핏 최대 70×96

---

## 6. 폴더 지도

```
dicekeep-art/
  index.html          엔트리 (?v= 캐시버스트)
  game.js             게임 루프, 전투, 입력
  content.js          DKCONTENT (맵/적/보스/스킨)
  style.css
  serve.py / start.bat
  GAME-SPEC.md        이 문서
  GROK-HANDOFF.md     이전 인수 브리프 (P0~P2 프롬프트 포함)
  ART-PIPELINE.md     배치 트래커
  ASSET-MANIFEST.md   파일 목록
  casual/
    maps/             50 JPG
    towers/           tN-a~e + tN-attack-2x2
    enemies/          500 대기 + 12 걷기
    bosses/           100
  dice/               HUD·3D 큐브 텍스처 dice-1~6
  towers/             die-1~6 (현재 tN-a 복사본) + 구 archer/cannon/…
  enemies/            구 mite/runner/husk/boss + walk
  vfx/                레이저·포구·폭발·번개·주사위폭탄
  map/battlefield.jpg 구 전장
  props/              portal, crystal
  ui/                 gold, heart, title-keyart
```

로드하지 않지만 삭제하지 말 것: `towers/archer.png` 등 옛 5종, `enemies/*` 구 정지컷, `props/*`.

---

## 7. 하지 말 것

- 버튼 굴림(SLOT)과 필드 굴림(DIE) 합치기
- 3D `persp = 10` 낮추기
- file:// 테스트
- 요청 없는 BGM
- PATH를 물/건물 위로 통과시키기
- 타워를 길 한가운데 두기

---

## 8. 다음 작업 (우선순위)

1. 나머지 맵(대나무·태엽 제외) PATH/SPOTS를 각 맵 흙길에 맞게 조정
2. 적 걷기 시트 12종 이후 순차 추가
3. 타워 스킨 b~e 를 새 2D 아이소 스타일로 재생성 (원하면)
4. 보스 걷기/등장 연출
5. 피격 플래시, 사망 먼지, 배치/합체 마법진 (P3)
