# Animation plans

| # | Plan | Severity | Status |
| --- | --- | --- | --- |
| 001 | [Make the native launch neutral and interruptible](001-make-native-launch-neutral-and-interruptible.md) | HIGH | DONE |
| 002 | [Make the spaces drawer exit and reverse cleanly](002-make-spaces-drawer-exit-and-reverse-cleanly.md) | HIGH | DONE |
| 003 | [Preserve feedback under Reduced Motion](003-preserve-feedback-under-reduced-motion.md) | HIGH | DONE |
| 004 | [Use adaptive launch core artwork](004-use-adaptive-launch-core-artwork.md) | MEDIUM | DONE |
| 005 | [Make pull-to-refresh follow the gesture](005-make-pull-to-refresh-follow-the-gesture.md) | MEDIUM | DONE |

## Recommended execution order

1. Plan 001 is complete and has no dependency on the remaining audit findings.
2. Plan 002 is complete and preserves the native launch chain.
3. Plan 003 is complete; the accessibility policy now preserves non-spatial feedback under Reduced Motion.
4. Plan 004 is complete and preserves the verified native packaging chain.
5. Plan 005 is complete and inherits the final Reduced Motion policy from plan 003.
