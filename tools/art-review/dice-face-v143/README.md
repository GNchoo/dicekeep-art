# Standard D6 face correction (v143)

The arena broken die and title artwork showed adjacent 5 and 2 faces. On a standard six-sided die, the opposite pairs are 1/6, 2/5 and 3/4, so 5 and 2 cannot meet at an edge. The corrected rubble has 5 on the broad top, 1 on the front and 3 on the right outer face. The smaller fragment's top is an unnumbered broken surface. This preserves one cracked die instead of depicting two complete dice.

`source-arena-prop-3.png` is the selected transparent built-in imagegen edit; `previous-arena-prop-3.png` preserves the prior runtime sprite. `prompts-arena.json` records both edit passes and the input reference roles. Run `node tools/promote-arena-die-v143.mjs` to rebuild the 1024px runtime asset and hash record, with no API key.
