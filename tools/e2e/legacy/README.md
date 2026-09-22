# 레거시 검사 — 단방향 측면 시트 시절 (PR #29)

`ground-gait-check.cjs` 는 **현행 렌더러에서 구조적으로 통과할 수 없다.** 보관용이며 돌리지 않는다.
원래 1~9웨이브 측면 걷기 시트의 접지·보폭·슬립을 검사했다.

같은 PR #29 세대인 `walk-jitter.js` 와 `walk-preview.cjs` 는 **여기 없다** — 둘은 화면에 그려지는지가
아니라 **로드된 시트 캔버스(`DKA`)를 직접 읽으므로 렌더러 변경과 무관하고, 지금도 통과한다.**
`tools/e2e/` 에 그대로 뒀다 (실측 확인 완료).

## 왜 통과할 수 없나

`ground-gait-check.cjs` 는 레거시 시트(`DKA['infW<n>Walk']`)의 캔버스가 `#game` 에
`drawImage` 되기를 기다린다(`waitForFunction`, 15초). 그런데 `game.js` 의
`currentEnemyFrame()` 은 승인된 `artAssetId` 를 가진 적을 전부 방향별 아트로 보내고,
프레임을 못 얻어도 레거시로 떨어지지 않는다:

```js
if (fr && fr.cv && fr.cv.width) { ... return fr; }
return null; // An approved identity may never turn into unrelated legacy art.
```

웨이브 1~9 는 `w001`~`w009` 로 전부 `directional-art.js` 에 `ready: true` 로 등재돼 있다.
따라서 레거시 시트가 화면에 그려질 경로가 없고, 기다리는 조건은 영원히 거짓이다.
제한시간을 늘려도 결과는 같다 — 시간 문제가 아니라 관측 대상이 사라진 것이다.

## 지금 이 영역을 검사하는 것

| 무엇 | 도구 |
|---|---|
| 시트 분할·관절·접지 기하 | `tools/check-directional-art.mjs` (아트 빌드 파이프라인 단계) |
| 보행 모션 육안 검수 | `tools/preview-directional-motion.mjs` |
| 런타임 계약(식별자·방향·폴백·예산) | `tools/e2e/directional-runtime-contracts.cjs` |
| 코너·순환·감속·기절 등 경계 | `tools/e2e/directional-edge-cases.cjs` |
| 배포 바이트 대조 | `tools/e2e/directional-production.cjs` |

기록: [PR #29 보행 보고서](../../art-review/pr29-gait/README.md)
