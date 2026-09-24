# VFX audit — v146 baseline, v147 remediation

Date: 2026-09-25. Scope: runtime combat and reward presentation in `game.js` and `presentation-fx.js`, action/result HUD, packaging and browser checks. The findings below describe the implemented v147 change. Browser measurements are relative diagnostics on one PC, not a mobile performance certification.

## Reported problems and completed fixes

| Priority | Baseline cause | v147 remediation and verification |
| --- | --- | --- |
| Critical | `syncInfo()` inserted an outcome box into a shared flex row. Changing result, name, sale text, odds or cost moved action buttons; a repeat enhancement tap could hit Sell. | The outcome slot is reserved from first selection and each action has a fixed grid cell. `enhancement-flow.cjs` clicks the original screen coordinate through keep, success, 6→7, a long-name 19-star tower, confirmation and maximum grade on desktop, phone landscape and portrait. All action rectangles remain stable. |
| High | Power-up stacked body-height rings, filled circles, plus signs, blur and radial lines over every matching tower. | One anchored feedback sequence per affected tower replaces the stack: subtle ground light below entities and restrained side accents drawn with the tower's depth order. Success, keep and destruction use different colors and shapes. Desktop and phone captures were visually inspected; target and layer checks pass. |
| High | Four separately illustrated chest poses were crossfaded. Scaling continuously could not prevent discontinuous lid geometry and doubled silhouettes. | `presentation-fx.js` draws one stable chest body and a continuously rotating lid with anticipation, opening and settling. A 24-frame opening sample verifies distinct frames and bounded angular steps. |
| High | `acquireColumn` was appended after the chest and painted over its front. | The new renderer draws rear light and cavity effects before the opaque chest body and rim. A pixel regression changes light from cyan to magenta and verifies the lower chest-front pixels do not change. Opening captures were also visually inspected. |
| Medium | `updateVisuals()` integrated sprite/burst origins, then the renderer added velocity × age again; delayed particles moved before appearing. | Sprite/burst origins stay fixed for analytic rendering. Integrated particles only advance during active time. `fx-motion.cjs` observes actual Canvas positions across both clocks, delayed starts and step subdivisions. |
| Medium | Lightning generated different random paths for halo/core and for every render. | Both passes reuse one smooth path derived from effect age. Rendering does not consume gameplay RNG or produce independent core/halo jitter. |
| Medium | Recoil reduced `kick` by a fixed amount in `draw()`, depending on refresh rate. | `advancePresentation()` advances recoil by real elapsed time for the player and remote-view towers. Repeated draws cannot advance recoil. |
| Medium | At ×3, the landed die disappeared after about 0.6 real seconds while its new 1.68-second celebration continued. | The 1.8-second landed-result hold now advances on the same real-time presentation clock. A regression verifies combat updates do not shorten it. |

## Effect inventory and disposition

| Family | Entry/render points | Final disposition |
| --- | --- | --- |
| Chest purchase | `buyChest`, `DKFX.drawChest`, `stageNotice` | Continuous geometry, rear/cavity/front ordering, bounded size and particles. Duplicate chest notices are cleared. Chest tier, cost and die acquisition are unchanged. |
| High die result | `acquireFx*`, `DKFX.drawReward`, `ROLL_SHOW` | One compact celebration replaces simultaneous column, confetti, shake, rings and border glow. Result stays legible in the center for real elapsed time at ×3. New decorative rendering uses no RNG. |
| Power-up | `upgradeFace`, `powerTowerFx`, `drawTowerFeedback` | Matching towers receive compact anchored cyan feedback; retriggering replaces the previous power feedback on that tower. No full-body rings or plus signs. |
| Enhancement | `enhanceTower`, `towerHalo`, result HUD | Distinct success/keep/destruction sequences, reserved outcome slot and fixed action cells. Cost, probabilities, confirmation and destruction behavior are preserved. |
| Placement / merge / move | `tryPlace`, `drawMergeHalo`, `circle`, `ring` | Ground circles render before entities. Merge highlight no longer redraws the whole tower through multiple blur filters. Tower selection and movement logic are unchanged. |
| Tower shot / muzzle | `towerFire`, `paintMuzzle`, muzzle sprites | Authored emitters stay anchored. Recoil is real-time and render-independent. Short combat muzzle effects still follow the simulation clock. |
| Projectiles / trails | `updateVisuals`, projectile render loop | Corrected decorative particle movement; removed die-bomb sprite blur. Gameplay projectile travel, targeting, collisions and damage are unchanged. |
| Lightning / laser / ruby shot | `towerFire`, beam render loop | Lightning core and halo share a smooth path; ruby shot remains tied to its lens emitter. Beam damage and expiry retain their existing simulation timing. |
| Hit / explosion / frost | `projHit`, `sheetHit`, `starImpact` | Particle-origin correction, continuous scale/fade and removal of burst blur reduce jumps and draw cost. Short four-frame impact sheets remain; this change does not replace every combat animation asset. |
| Enemy hit flash / status | directional flash canvas, enemy draw loop | Scratch surfaces resize only when needed and otherwise clear/reuse their allocation. Existing status indicators and health bars are preserved. |
| Death / boss entrance / boss death | corpse loop, spawn/kill helpers | Reviewed, with no gameplay/timing changes. Existing continuous entrance easing, corpse effects and short impact art remain. |
| Persistent star / awakening | `drawStarBadge`, `drawAwakeningAura` | Removed repeated blur from tower star/merge rendering. Existing cached awakening base glow and some awakening/map blur remain. |
| Physical die landing | `updateDie`, `drawDie`, face outline | Physical orientation, face selection and RNG are unchanged. Only the center result's presentation hold moved to real time. |
| HUD / log / screen feedback | `stageNotice`, floating text, `glowT`, `hurtT`, `shakeT` | Reward/upgrade notices no longer stack on top of one another. Existing combat shake and damage feedback remain simulation-time. Intentional screen shake still varies at render time; determinism assertions apply to the new chest/reward/upgrade geometry and beam path, not all canvas pixels. |

`draw()` now separates ground, world and reward passes. Tower-front accents render immediately with each depth-sorted tower. Physical dice and their result remain above reward decoration. `index.html` loads the new module before `game.js`, and `tools/build-www.mjs` includes it in the packaged application.

## Verification and measured performance

- `enhancement-flow.cjs`: 66 checks passed, including repeat clicks at one unchanged screen coordinate on desktop, phone landscape and portrait. The final phone layouts were visually inspected.
- `fx-motion.cjs`: 18 rendered particle cases passed, including real-time/simulation clocks, delayed starts and different update subdivisions.
- `presentation-fx.cjs`: desktop and phone semantic cases pass: correct targets, ground/body/front ordering, real-time clocks, draw purity, d8/d20 chest continuity, opaque chest front, enhancement result, high-die focus and RNG isolation, deck targets and portrait reanchoring. This replaces the former count/scale-only checks that could pass despite a choppy four-pose chest.
- CI includes the three regression scripts and syntax-checks the new module. Gameplay branches for chest draw, physical result, upgrade cost/probability and combat damage were reviewed for unintended changes; none were found in the presentation diff.
- Existing manual-chest, physical-dice, casual-world/emitter and arena-parity checks also passed in the final local run.

`tools/e2e/fx-performance.cjs` compares baseline `game.js` from commit `151d8e076c396411861287562b84c0614a8e1f2f` against current code, using current assets in both runs. It uses the same PC/browser with desktop 1240×860/DPR 1 and phone-shaped 390×844/DPR 2 viewports, 80 enemies and 14/15 towers. The “phone” row is desktop browser emulation, not a physical phone.

For the matched 15-tower simultaneous power-up scenario, during a 1.1-second RAF sampling window:

| Viewport | RAF callbacks, baseline → v147 | RAF interval p95, baseline → v147 | v147 synchronous draw p95 | v147 no-effect control callbacks |
| --- | --- | --- | --- | --- |
| Desktop | 52 → 160 | 27.9 → 7.1 ms | 1.8 ms | 160 |
| Phone-shaped | 64 → 160 | 20.9 → 7.1 ms | 1.9 ms | 161 |

These samples show the old mass-upgrade presentation causing a large delivery penalty on this setup and the replacement returning close to the matched no-effect control. They do not establish a universal FPS value. JavaScript draw timings alone were small even in the baseline, which is why RAF intervals and callbacks were measured separately. Other scenarios include normal battle, chest, enhancement and high-die result; reports and before/after filmstrips are written to `gen/e2e/fx-performance/`.

## Remaining limits

- Representative Android/iOS hardware, sustained play, thermal throttling and lower-end GPU testing remain necessary before a commercial mobile performance claim. Short desktop browser samples do not cover them.
- Existing four-frame combat impact sheets, boss/death effects, awakening and map effects were inventoried, but not all were replaced. Their art cadence may still warrant a later focused pass.
- There is no global visual budget for every concurrent combat effect. The repaired reward and upgrade effects are bounded, but long crowded battles with many area impacts still need sustained profiling.
- Automated continuity, layer and pixel checks supplement visual inspection; they do not certify the artistic quality of every effect or animation.
