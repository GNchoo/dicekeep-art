# Casual menus and tower 1

The approved loading castle and home screen are the visual reference. The
remaining player menus share its warm brown surfaces, gold edges, ivory type
and illustrated cards. Deck selection now opens a dedicated view; optional
growth explanations follow the actual five slots and save actions. Store
products have artwork and account information remains available in a disclosure.
Payment values, eligibility, progression and combat rules are unchanged.

Tower 1 is redesigned because the original pilot's fine railings, masonry and
banners became noisy at gameplay size. `tower-1.png` is the preserved built-in
ImageGen output (no API key). `promotion.json` records the normalized runtime
files. Run `node tools/promote-casual-tower-v2.mjs`, then regenerate the art
manifest. This supersedes tower 1 from `promote-casual-pilot.mjs`; that older
script still reproduces its historical pilot.

Generation prompt: use the approved bright ivory loading castle as the style
reference and the previous tower as the redesign target. One isolated upright
three-quarter mobile tower sprite on transparent background, readable at
48–96 pixels tall. A compact ivory tower, simple pyramid dice roof with one
red pip, gold roof rim, one wide blue banner without emblem, large red front
firing lens and simple round base. Broad color fields and soft cel shading.
Remove railings, balconies, tiny studs, cracks, engraved ornaments, masonry
noise and photorealistic detail. Preserve full roof and base with margins.

Refinement prompt: preserve this design and view, remove external glow and
background completely, maintain a clean silhouette and transparent margins.
The alpha result was inspected composited on an opaque neutral background.
The generator's inline preview shows RGB glow outside the silhouette, but
those pixels are transparent in the saved PNG.

Only the default tower-1 skin and fallback are replaced. Other tower types and
owned cosmetic variants are retained. Full battlefield art conversion remains
a separate asset-production task.
