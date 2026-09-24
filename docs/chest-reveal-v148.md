# Chest contents and readable landed dice — v148

The chest now reveals the die it actually awarded. Its existing physical model rises from behind the chest's front rim, pauses above the opening with its grade and number of sides, and follows a continuous arc into the input tray. The model, numbered faces and final tray orientation are the same throughout the reveal.

The 2.2-second sequence uses presentation time. The purchase is charged once; its final rolled value remains unset. Throw input becomes available when the die reaches the tray. Restarting a run clears the reveal, resizing recomputes its chest/tray anchors, and queue rewards retain their existing behavior. The d1/d4/d6 automatic roll policy is unchanged.

After a roll, the game no longer creates a second enlarged die in the center, a result caption, a face-border ring, or a radial reward celebration. The actual landed die remains visible during settling. Only its winning printed number or pips glow:

- d4: the shared winning vertex numeral on the adjacent visible faces.
- d6: the pips on the winning face, including the story die's actual labels.
- d8/d12/d20 and their rarer variants: the winning face's printed numeral.

The glow uses the die's existing pose and face-local coordinates. It does not turn the die, substitute a face, or use gameplay randomness. Automatic roll animation now runs on elapsed time, as the manually thrown die already does, so the resting number remains readable at 3× battle speed.

Regression coverage lives in `tools/e2e/presentation-fx.cjs`, `manual-chest-roll.cjs`, `physical-dice-outcomes.cjs` and `dice-rest-pose.cjs`. It covers blocked input during the reveal, unlocking afterward, unchanged purchase cost and physical results, continuity and chest-front occlusion, and absence of duplicate result presentation. Existing enhancement and tower-movement checks cover repeated interaction while a die is pending.

Local visual captures cover desktop, phone portrait and phone landscape. The comparison images in `gen/e2e/chest-reveal-v148/` are generated review artifacts, not game assets.
