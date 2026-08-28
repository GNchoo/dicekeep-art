# 주사위 성채 (Dicekeep)

주사위를 굴려 나온 눈이 높을수록 강력한 타워를 세우는 디펜스 게임 + 아트팩입니다.

## 게임 실행

`start.bat`를 더블클릭하거나, 저장소 폴더에서 로컬 서버를 띄운 뒤 접속하세요.

```bash
python -m http.server 8137
# 브라우저에서 http://localhost:8137 접속
```

브라우저에서 `index.html`을 직접(file://) 열어도 동작하지만, 이미지 배경 보정이 생략되어 일부 스프라이트에 잔상이 보일 수 있습니다.

### 플레이 방법

- **주사위 던지기 (40G)** — 맵 왼쪽 아래 주사위를 **잡고 빠르게 드래그 후 놓아 던지거나**, 버튼(R)으로 굴립니다.
- 주사위가 전장을 튕기며 구른 뒤 나온 **눈(1~6)에 해당하는 주사위 타워**가 생성됩니다. **6눈이 가장 강력!**
  - 1 궁수 · 2 대포(광역) · 3 마법 · 4 서리(둔화) · 5 전격(연쇄) · 6 폭군(최강 광역)
- 같은 눈의 타워 위에 주사위를 올리면 **레벨 업** (최대 Lv3).
- 타워 클릭 → 정보 확인·판매. 20웨이브를 모두 막아내면 승리! (5의 배수 웨이브마다 보스 등장)

## 아트팩

타워 디펜스 게임에 바로 넣을 수 있는 핸드페인트 아트입니다.
스프라이트는 배경이 투명한 PNG입니다. 맵·키아트는 JPG입니다.

스타일: 어두운 숲 성채, 상아 주사위 모티프, Kingdom Rush 느낌의 3/4 뷰.

## 폴더

| 경로 | 내용 |
|------|------|
| `map/` | 16:9 전장 맵 (`battlefield.jpg`) |
| `towers/` | 궁수 / 대포 / 마법 오벨리스크 / 서리 첨탑 / 전격 탑 |
| `enemies/` | 이끼 진드기, 잿빛 질주자, 석갑 허스크, 주사위 폭군 + 2x2 걷기 시트 |
| `props/` | 스폰 포탈, 본진 크리스탈 |
| `vfx/` | 화살·포탄·마력탄·서리 파편·전격, 2x2 임팩트 |
| `dice/` | 눈 1~6 상아 주사위 |
| `ui/` | 골드, 목숨, 타이틀 키아트 |

## 파일 목록

### 맵
- `map/battlefield.jpg` — 왼쪽 포탈에서 오른쪽 크리스탈로 이어지는 굽은 흙길

### 타워 (투명 PNG)
- `towers/archer.png` — 궁수 탑
- `towers/cannon.png` — 대포
- `towers/mage.png` — 마법 오벨리스크
- `towers/frost.png` — 서리 첨탑
- `towers/tesla.png` — 전격 탑

### 적
- `enemies/mite.png` / `mite-walk-2x2.png`
- `enemies/runner.png` / `runner-walk-2x2.png`
- `enemies/husk.png` / `husk-walk-2x2.png`
- `enemies/boss.png` / `boss-walk-2x2.png`

걷기 시트는 **2열 2행**, 왼쪽 위 → 오른쪽 → 아래 순으로 프레임 0,1,2,3.

### 소품
- `props/portal.png` — 적 스폰
- `props/crystal.png` — 본진

### 이펙트
- `vfx/arrow.png` — 궁수 투사체
- `vfx/shell.png` — 대포 포탄
- `vfx/bolt.png` — 마법탄
- `vfx/frost-shard.png` — 서리
- `vfx/spark.png` — 전격
- `vfx/impact-2x2.png` — 피격/폭발 4프레임

### 주사위 · UI
- `dice/dice-1.png` … `dice/dice-6.png`
- `ui/gold.png` — 골드
- `ui/heart.png` — 목숨
- `ui/title-keyart.jpg` — 타이틀/OG용 키아트

## 사용 팁

- 타워·적은 발 아래 앵커로 그리드 셀 중심에 놓으면 됩니다.
- 2x2 시트 한 칸 크기 = 이미지 가로/2 × 세로/2.
- JPEG 키잉 때문에 가장자리에 옅은 핑크가 남을 수 있습니다. 필요하면 한 번 더 다듬으세요.

## 라이선스

이 저장소의 이미지는 개인 게임 개발에 자유롭게 써도 됩니다.
