# Portrait playfield and readability — v149

Manual dice used the landscape tray's fixed y=526 as their lower collision wall. On a 440×956 portrait viewport, the 720×1239 game canvas sent a descending die from y=805 back to y=526 in one frame. The wall and tray now follow the current canvas and HUD clearance; the same case reaches y=1114 before reflecting.

Portrait dice keep a readable screen size, including their touch target, boundary padding, shadow and chest-to-tray arrival. Rotation maps the ongoing throw's position and velocity into the new playfield without replacing its pose or reward. Rotating while holding a die returns it without charging; rotating during its return delivers the result once.

Portrait towers use one label at their base for star grade and level. The text stays at least 12.5 CSS px on 320–440px phones, and a compact level gets its own gold chip so it cannot be mistaken for part of the star number. Landscape tower labels retain their previous positions.

Manual dice render above log cards on a transparent layer that passes input through to the game. Narrow portrait logs leave room for the pending die and show the latest three messages with up to three lines per card. Their existing dwell time is unchanged.

Validation:

- `test:die-arena-bounds`: lower-half travel, floor reflection, enlarged edge grab, both rotations, same-direction resize, grab cancellation and exactly-once return reward.
- `test:manual-die-visibility`: 320px/390px phones, near-square and short landscape layouts; pending visibility, multiplayer cards, log-corner rendering and layer cleanup.
- `node tools/e2e/portrait-tower-labels.cjs`: 15 occupied cells, 320/390/440px portrait and landscape; readable text with no label overlaps.
- `test:manual-chest-roll`, `test:physical-dice-outcomes`, `test:presentation-fx`, `test:arena-orientation` and `build:www`.
