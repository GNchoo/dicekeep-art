# Biped knee correction visual review

- Baseline: Git `5630cdd` manifests and binary sprite sheets, read with `git show`.
- Candidate: `gen/biped-knees-110/original` and `gen/biped-knees-110/extreme`.
- Review sequence: the initial 100 candidates were inspected on 20 side comparison boards. Two avian hocks were identified and excluded, leaving 98 previously inspected identities; no sprite content changed for those 98 when the final boards were regenerated.
- Final correction scope: 98 identities (46 original, 52 extreme). All corrected identities were visually reviewed at side frames 2 and 6 (zero-based), comparing both old and new sprites. This is 196 corrected sample poses and 392 comparison images, not a human inspection of every frame in every direction.
- Human, humanoid, armored and mechanical biped samples now show the knee toward sagittal forward. No visible detached limb pieces or frame-edge clipping were found in these side samples. Torso shape, root and foot locations remain consistent between the compared versions.
- Intentional avian exceptions: `w075` and `w176` are rooster/cockatrice forms. Their backward-facing exposed leg joint is an avian hock, so both are excluded from the human-knee correction and retain their previous sprites. This distinction was found during sampled visual review and confirmed by the main agent before promotion.
- Six representative three-view loops were generated from the actual 8-frame sheets: `w035`, `w049`, `b050`, `b100`, `w103`, `b201`. The side, front and back browser captures were inspected. No visual clipping or new separation was found in those captures. Front/back joints naturally overlap more strongly in the projected art.
- Browser check: 36 embedded sheet images decoded; 12 canvases present; pause holds the frame; side/front/back controls work; no page errors. This check does not measure native mobile performance.
- Full-cycle numerical guard coverage is provided by the build geometry reports and the directional rig tests. This document records only the sampled visual review above.
