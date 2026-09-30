# Menu guidance v170

Keep the castle home. The battle and shop hubs now fill their existing frame; deck cards use compact artwork with readable roles, damage comparisons and illustrated conditions instead of tall empty cards.

## Reference research

Primary sources inspected on 2026-09-30:

- [Apple editorial introduction](https://apps.apple.com/kr/iphone/story/id6793009149): distinctive dice roles, growth through the tree, seven-pip awakening.
- [Developer's Google Play listing](https://play.google.com/store/apps/details?id=com.percent.aos.randomdice2&hl=ko): deck composition, special abilities, dice tree and supporters.

These support role → combination → growth → awakening guidance. They do **not** establish a universal combat-power number or an automatic recommendation UI. Dicekeep's numeric comparison and example placement are its own features.

## Decisions

- Growth overview starts with the deck being browsed, whether it is active, its five towers, and general/boss direct damage per second.
- Lineup and recommended decks show the saved-deck difference, five role counts, and one illustrated core interaction. Negative placement effects remain negative; solitary towers are never advised to accept a support neighbor.
- Research cards show a short ability and three-pip direct damage. Full descriptions remain in the detail pages.
- Placement, each tower's effects, and calculation assumptions use separate pages. Existing save, research and purchase handlers are retained.

## Numeric scope

Reuse `DKDECKRULES.preview`: one tower of each kind, three pips, power level one, the player's research, and a fixed example formation. Normal/boss values are direct damage only. The hunter bonus applies only to the hunter. Placement change compares with the same five towers independently placed.

AoE, poison, slow/shatter interaction, periodic explosions, crits, armor and attack downtime are excluded from the aggregate. They are shown as conditional effects instead. No estimated win rate or universal combat power is claimed. Account research applies to build/extreme/co-op, not pure luck; duel research is normalized.

## Verification

- `node tools/deck-rules-test.cjs`: actual combat formula and honest preview scope.
- `node tools/e2e/tree-collection.cjs`: real save/research writes, overview navigation, damage change and solitary/support warning.
- `node tools/e2e/paged-menus.cjs`: no scrolling or clipped controls across six portrait/landscape sizes, all dice pages, five effect pages, shops, help, rewards and rooms.
- `npm run build:www`: app copy build.

Screenshots and isolated public checks stay under ignored `gen/e2e/`. No gameplay damage, odds or progression costs changed.
