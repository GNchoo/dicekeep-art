# Premium skin production v101

Three matching families: 왕실 상아 (royal), 서리 수정 (frost), 잿불 흑요석 (ember). Each has a 512×512 generated material applied by the existing renderer to six dice geometries and twenty separate tower illustrations. Cosmetics do not change combat or roll probabilities.

Five builtin image-generation requests produced a three-material sheet, three twenty-tower sheets and one targeted royal background correction. Monetary cost was not returned. See `call-ledger.json` and `prompts/`; the material prompt file explicitly identifies its reconstructed wording. The original royal checkerboard sheet remains archived and is not a production source.

Run `node tools/art-review/premium-101/rebuild.mjs` from the repository root. `source-lock.json` guards reviewed input hashes. Sharp performs sheet segmentation, chroma matting and normalization; it does not synthesize the artwork. Connected components are assigned whole to measured cells so irregular gutters do not clip pinnacles or import a neighbor's pixels. Small detached noise below eight source pixels is discarded. Violet crystals and ivory highlights remain opaque. Production PNGs use true alpha, a 384×384 canvas, and common foot line 376.

`manifest.json` records source dimensions, cell/crop coordinates, hashes and output paths. `evidence/` contains the three reviewed contact sheets. Complete HTTP/hash, runtime draw, ownership/refund and cache checks are in `tools/e2e/cosmetics.cjs`; reports are generated under `gen/e2e/cosmetics/`. The game shop provides a free live preview of every dice family and all twenty towers before purchase.

Outputs:

- `dice/skins/{royal,frost,ember}/material-v101.png`
- `casual/towers/skins/{royal,frost,ember}/t01.png` through `t20.png`

Runtime loading: base-only boot, at most two premium packs, two parallel decodes and two material sets. Live payment activation remains gated by server configuration and verified provider setup.
