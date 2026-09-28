# Upright landscape entrance — v158

Generated with the built-in image_gen tool using casual/tiles/arena/start.png as the style reference. No external image API or key.

## Final prompt

Use case: stylized-concept. Asset type: a single production PNG sprite for the LEFT entrance portal of a landscape casual tower-defense board. Reference image is the existing Dicekeep portal; preserve its chunky ivory stone blocks, gray-purple stone feet, small gold diamond keystone, luminous purple spiral, dark warm outlines and simple clean cel shading. Redesign the CAMERA ANGLE, not just stretch the old picture. The portal must stand distinctly TALL AND UPRIGHT with straight vertical pillars and no diagonal lean. Turn the doorway farther toward SCREEN RIGHT into a restrained near-side three-quarter view: its tall magic opening is a narrow vertical ellipse, its opening faces the right-hand path where enemies walk horizontally to the right. Much less broad frontal doorway, much less diagonal stagger between feet than the reference. Tall slender arch silhouette with occupied height about 1.8 times occupied width. Camera only slightly above the structure; understated top surfaces, compact aligned feet, rigid vertical architecture. Purple doorway remains legible at 80 pixels high and visibly opens on the RIGHT of the structure. Polished friendly toy-like ivory fantasy architecture, broad two-tone bevels, upper-left key light, smooth crisp edges, no realistic texture or microdetail. Center the complete isolated portal with generous transparent padding. No path, no landscape, no extra floor plane, no large magic circle, no characters, no text, no UI, no logo, no watermark. Real transparent alpha background, not a painted checkerboard. Generate only ONE portal.

## Integration

Keep the portrait start-front.png unchanged. The replacement start.png faces right without horizontal mirroring. Runtime height remains 120 world units. Place its visible doorway threshold at the existing path start with xOffset -3 and footOffset 18; do not change enemy paths, spawn count, timers or combat geometry.

Only resize and PNG compression are used to package the generated alpha artwork. No color keying or invented transparency.
