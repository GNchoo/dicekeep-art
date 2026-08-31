# 주사위 성채 (Dicekeep)

주사위를 굴려 나온 눈이 높을수록 강력한 타워를 세우는 캐주얼 타워 디펜스 + 아트팩.

**전체 명세:** [GAME-SPEC.md](GAME-SPEC.md) · **인수 브리프:** [GROK-HANDOFF.md](GROK-HANDOFF.md) · **파일 목록:** [ASSET-MANIFEST.md](ASSET-MANIFEST.md)

## 실행

```bash
python serve.py
# http://localhost:8137
```

Windows는 `start.bat`. `index.html`을 file://로 열지 말 것.

## 플레이

- 주사위 **플릭 던지기** 또는 버튼/R 로 굴리기 (40G)
- 눈 1~6 = 타워 종류 (6이 최강). 끌어다 석단에 놓으면 설치
- 같은 눈 합체 최대 Lv3
- 100웨이브 / 50맵 / 목숨 20
- 공중·땅굴 적, 5의 배수 웨이브에 보스

| 눈 | 타워 |
|---|---|
| 1 | 감시탑 레이저 |
| 2 | 쌍포 요새 (광역) |
| 3 | 마법 오벨리스크 |
| 4 | 서리 첨탑 (둔화) |
| 5 | 테슬라 (연쇄) |
| 6 | 왕관 요새 (폭발 주사위) |

## 아트 (2026-08-31)

| 항목 | 수량 | 경로 |
|---|---|---|
| 맵 | 50 | `casual/maps/` |
| 몬스터 | 500 + 걷기 12 | `casual/enemies/` |
| 보스 | 100 | `casual/bosses/` |
| 타워 | 6 인게임 + 보존 스킨 30 + 공격시트 6 | `casual/towers/` |
| VFX | 레이저·포격·룬·서리·번개·주사위폭탄 | `vfx/` |

스타일: Kingdom Rush + Random Dice, 2D 아이소메트릭.

## 라이선스

개인 게임 개발에 자유롭게 사용.
