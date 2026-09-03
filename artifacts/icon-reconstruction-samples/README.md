# EO icon reconstruction — two-batch fidelity gate

These files preserve the visual-review history. The approved SVGs are now copied into `public/icons/features` and `public/icons/nav` and are wired into the application. Original PNGs remain in place as reconstruction truth and rollback references, but the icon component and offline cache no longer request them.

## Source policy

- Every SVG is traced from the corresponding original PNG alpha silhouette and color regions.
- No subject, ornament, orbit, letter, trend line, or major internal element is redrawn from semantic memory.
- The source PNG remains the comparison truth.
- Dark correction reuses the exact Eva/Trackers paths and only raises the green structural palette. Gold remains gold.
- Home compact is reconstructed from the existing feature Home PNG because it preserves the same house, doorway, star, and center of gravity while carrying the lighter contour weight used by Eva and Trackers. It is not a generic replacement house.
- Settings compact uses the existing feature Settings PNG: it preserves the same hexagonal plate, gear, star, and center of gravity while removing the overweight nav contour. It is not a generic replacement gear.
- Lucius compact retains the complete original composition and uses a modest optical crop. No object is removed at this gate.
- All batch-two SVGs use their corresponding feature PNG as the direct source. No semantic redraw or cross-icon shape substitution is used.

## Batches

- Batch 1 — navigation and dark-risk icons: Eva, Trackers, Home compact, Lucius main/compact, Settings main/compact. This batch is visually accepted.
- Batch 2 — remaining feature icons: Calendar, Cats, Chronicle, Drinks, Food, Health, Inbox, Media, Memo, More, Notifications, People, Projects.

## Files

- `eva.svg`, `eva-dark.svg`
- `trackers.svg`, `trackers-dark.svg`
- `home-compact.svg`
- `home-line-weight-comparison.png` — 32 px proof comparing the source Home, the previous heavy nav trace, the adjusted Home, Eva, and Trackers.
- `lucius.svg`, `lucius-compact.svg`
- `settings.svg`, `settings-compact.svg`
- `calendar.svg`, `cats.svg`, `chronicle.svg`, `drinks.svg`, `food.svg`, `health.svg`, `inbox.svg`
- `media.svg`, `memo.svg`, `more.svg`, `notifications.svg`, `people.svg`, `projects.svg`
- `batch-1-review-32px.png`
- `batch-2-review-a-32px.png`, `batch-2-review-b-32px.png`
- `original-vs-vector-32px.png` — actual 32 px rasterization enlarged with nearest-neighbor scaling for inspection.
- `silhouette-overlap.png` — silhouette registration proof. Gray means overlap; red is source-only; cyan is vector-only. Lucius has an intentional cyan outer fringe from compact optical enlargement.

## Measured 32 px fidelity

The metric is mean absolute RGB error after both assets are rendered on EO's light canvas. “Similarity” is `100 × (1 − MAE / 255)` and is used only as a regression signal; visual identity remains the acceptance criterion.

| Icon | Similarity |
| --- | ---: |
| Eva | 98.29% |
| Trackers | 98.73% |
| Home compact | 97.48% |
| Lucius compact | 94.24% |
| Settings compact | 97.17% |
| Calendar | 96.84% |
| Cats | 98.13% |
| Chronicle | 97.13% |
| Drinks | 98.02% |
| Food | 97.50% |
| Health | 97.85% |
| Inbox | 97.13% |
| Media | 96.74% |
| Memo | 97.61% |
| More | 99.59% |
| Notifications | 97.73% |
| People | 98.27% |
| Projects | 98.00% |

Lucius compact has a lower numerical score because its approved compact optical crop intentionally increases the complete composition at navigation size. No object or ornament is removed.

## Compact contour gate

- Home's adjusted outer contour is the reference weight for the bottom bar: it must remain readable at 24–32 px without becoming darker or heavier than Eva and Trackers.
- Settings now follows the same reference weight for both its hexagonal frame and gear contour. Internal geometry and the original Settings identity remain unchanged.
- Line-weight correction is evaluated at the final rendered size. Scaling the entire icon down is not an acceptable substitute for correcting an overweight contour.

## Next gate

The runtime uses external SVG files so the traced path data stays out of the client JavaScript bundle. Eva and Trackers select their approved dark files through CSS custom-property sources under `html[data-mode="dark"]`; all other icons reuse the same SVG skeleton in both modes. Further semantic color grouping (`base`, `surface`, `accent`, `detail`, `outline`, `shadow`) can happen without changing these accepted silhouettes.
