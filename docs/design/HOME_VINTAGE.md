# Vintage · Global theme and Home

Operate surface. Existing fonts, header, routing, data and action semantics remain authoritative. Vintage is an independent global design theme; the four existing palettes belong to Classic and are retained when switching designs.

## Direction contract

THESIS: a daily editorial workspace in cool white and plum, with the calendar leading and all actionable reminders inside Tasks.

OWN-WORLD: #5f3e54 plum, #dbe1e6 cool blue grey, #d8d0d7 dusty plum; neutral graphite dark surfaces. Flat content, thin transparent capsules and smoky silver navigation.

STORY: choose a date, see the day's tasks and live pending reminders, act through the existing reminder transport, then read sleep, meals and notes.

FIRST VIEWPORT: existing greeting, month controls and seven glass date capsules, Today with Tasks first. Keep Home / centered Universal Log / Settings in the continuous raised glass silhouette.

FORM: user-specified existing Home composition; no concept tournament or seed needed. Signature interaction: concentric milk-glass capsules, identical selected and normal dimensions, and restrained plum press feedback.

FINISH: inspect real browser renders at 320, 402 and desktop in both modes; exercise empty, overdue, large lists, deduplication, actions, calendar and rollback. No production deployment.

## Implementation

- Switch in Settings → App & Appearance → Theme. Classic exposes its four colors; Vintage currently has one plum palette. Switching retains the previous Classic color. Web saves through the existing appearance API; local saves on-device only.
- `src/app/vintage-theme.css`: route-independent semantic colors, cool-white / neutral-charcoal surfaces, serif headings and Canger body, flat content and aligned icon palettes. It loads through shared globals on Web and local builds.
- `src/app/home-vintage.module.css`: Home geometry, calendar material and task layout only. `src/components/bottom-navigation.module.css` owns the shared milk-glass navigation. Both modes have separate materials.
- `designTheme` is separate from the unchanged Classic `colorTheme`. The first-paint script and shared runtime apply both. Old `evaorbit.homeStyle` Vintage previews remain visible until the next explicit appearance save, which upgrades the legacy key; existing cloud preferences otherwise keep their normal precedence. Home follows the same shared context.
- SQLite migration 92 and Postgres `202610290001_design_theme.sql` add the default-Classic design field. Old clients omitting it preserve the stored theme. The Postgres migration is prepared, not applied to production.
- `home-tasks-summary.tsx`: full-height Tasks first in DOM and visual order, dated states, sources/counts, inline action disclosure, ordinary task completion. Missing reminder snapshots remain explicit.
- `home-task-items.ts`: group by task identity or exact source projection, never by title or by cat/person subject alone. All reminder IDs in a group retain their own actions.
- `due-reminders-view.tsx`: extract the existing reminder action hook; keep Classic and its 1/2/3+ stack behavior.
- Web and local Home wrappers pass the existing Due payload to the shared calendar/overview. No new business endpoints. Appearance storage uses the additive design migration above.

## Verification

- 14 focused tests passed: identity deduplication (including different routines for one cat), empty/large lists, initial Home loading, journal create/edit/delete, timeline loading and appearance persistence/isolation.
- TypeScript, targeted ESLint, Next production build and local Vite production build passed.
- Eight primary/secondary/date/status text pairs passed contrast checks; minimum ratio 6.39:1 (`tmp/vintage-contrast-audit.json`).
- `scripts/home-vintage-browser.mjs` exercises the real local Home with explicitly synthetic intercepted data: both modes × 320/402/1440, normal/selected/pressed calendar, month/week, reduced motion, 0/4/26 task rows, task completion, reminder complete/snooze/skip, failed-write retry, fixed navigation during scroll and actual Classic/Vintage rollback. All passed. No cloud records were modified.
- Screenshots and audit: `tmp/vintage-*.png`, `tmp/vintage-preview-audit.json`. The browser launcher accepts `EVAORBIT_PLAYWRIGHT_MODULE`, matching existing browser tests.
- No deployment, commit, push or IPA build. No iPhone/Safari/PWA physical-device verification. Temporary preview servers close in a finally block.

## Second refinement · 2026-10-29

- Calendar geometry: outer width W ≤ 56px, height 1.55W, fixed 4px glass rim, inner disc diameter W−8px with top/left 4px. Inner and outer top arcs share the same centre. State indicators sit inside the lower capsule. Selection and pressing change shadows only; the whole-button scale is disabled within Vintage.
- Tasks use compact two-line rows, 13px primary titles, 10px neutral metadata and smaller source labels. Tight row spacing and 7px corners read as a list inside one surface. Long titles wrap without limits. Existing task/reminder APIs and grouping are unchanged; ordinary-task details remain reachable from the trailing entry.
- Navigation is Home / central Log / Settings, with symmetric links. Log uses a 72px glass ring and a concentric 56px plum disc (8px rim). Smoke-silver/cool glass materials replace the large solid tinted fill. The Vintage navigation composition persists when following Settings, so the active state and central Log do not jump between layouts. Classic remains unaffected.
- Main content and scroll padding reserve 124px plus the bottom safe area. The slightly raised central control and the navigation stay above scrolling content; the final timeline clears the bar at scroll end.
- Browser checks passed for both modes at 320/402/1440, resting/selected/pressed concentric geometry, calendar date and month changes, empty/ordinary/26-row/long-title task states, all reminder actions and failure retry, completed tasks, Home/Settings selection, scrolling, simulated 34px bottom inset, and Log picker → Inbox form → close. All business traffic remained intercepted.
- 14 focused tests, targeted ESLint, Next and local production builds passed. Screenshots/audit for this round use `tmp/vintage-refine-*`. No deployment or physical-device claim.

## Typography and continuous glass calibration · 2026-10-29

- Preserve the selected serif for headings and calendar numerals. Home body content, task names, status/date text, weekday labels, buttons and navigation use the existing EO Canger Huaxin font. No stored font or color-theme preferences change.
- Remove module source chips from task rows. Cat care uses the actual reminder subject name in the title, avoids repeating an existing name prefix, and keeps household context from real data. Identity grouping and all operations remain unchanged.
- Light date shells use a more visible cool-grey transparent material; dark shells have separate silver edge/opacity values. The concentric 4px rim and stationary pressed geometry are preserved.
- `vintage-nav-glass.tsx` measures the real bar width and draws one continuous surface, with level shoulders and a symmetric central rise. A clipped material layer provides real backdrop blur, separate vector edges provide reflection, and a subtle shadow sits underneath. The existing Log trigger overlays the shared glass, keeping its concentric plum disc and original handlers.
- Navigation now uses existing stroke icons with currentColor, plum selection text/icons plus a 4px dot, without a filled selection oval. Classic retains its original themed PNGs and material.
- 15 focused tests passed, including cat/household title presentation. Browser checks cover both modes at 320/402/1440, long/completed/ordinary/due task rows, calendar selection/pressing, identity deduplication, all task/reminder operations, failure retry, continuous-surface width, dot selection, Log picker/form, scroll clearance, simulated safe area and Classic rollback. No cloud business writes occurred.
- Deliverables: `tmp/vintage-calibrate-home-comparison.png`, `calendar-comparison.png`, `bar-comparison.png`, `settings-bar-comparison.png`, `tasks-comparison.png` (all names share the `vintage-calibrate-` prefix). No deployment or iPhone/Safari physical-device claim.

## Calendar reference correction

The user's red-capsule reference supersedes the earlier deep-recess interpretation. Match its translucent past-date shells, milk-white future/selected shells, thin neutral circle edges, soft shadows and selected-disc gradient using the current plum hue. Per the user's clarification, selection never enlarges the capsule, disc or numerals. All shells use a 1:1.5 ratio and concentric 10% insets. The previously lowered record markers remain. Only Vintage calendar presentation changes; Tasks/navigation stay intact. Both modes at 320/402/1440, equal selected dimensions, concentric geometry, calendar interaction and Classic rollback passed browser checks. Six relevant Home regression tests and both production builds passed. Latest close-up: `tmp/vintage-reference-calendar-comparison.png`. Not deployed.

Calendar controls now share the exact shell material, edge/highlight, shadow and backdrop blur with date capsules. Tokens live on the calendar container so Today/previous/next/month controls inherit both light and dark values. Button dimensions, type and handlers are unchanged. All four computed materials match the date shell at 320/402/1440; navigation, return-to-today and month/week disclosure passed. Both builds passed. Close-up: `tmp/vintage-controls-comparison.png`. Not deployed.

## Frosted navigation refinement

Keep the existing continuous-rise geometry. Increase the light milk-white and dark smoke-silver tint and use 32px backdrop blur with reduced saturation; an underlying-text stress capture shows only diffuse shapes inside the glass. Add a concentric 68px thin glass rim around the 56px Log disc without changing the 72px trigger or handlers. Navigation icons become 22px with 11px Huaxin labels, and the 4px active dot remains. Main/scroll bottom reserve increases to 144px plus safe area, with focused controls receiving scroll margin. Task names remain 14px with 1.45 line height (20.3px). Browser checks passed at 320/402/1440 in both modes, including ring alignment, unchanged task size, scroll clearance, simulated safe area, navigation, Log form, task/reminder actions and Classic rollback. No deployment. Preview: `tmp/vintage-frosted-bar-comparison.png`.

Latest density adjustment: task names are now 13px with 1.3 line height (16.9px); metadata stays 11px with 1.25 line height and a 1px gap below the title row. Completion and action targets remain 44px. Increase navigation backdrop blur to 36px while preserving the exact milk/smoke gradients, opacity, contour and selection dots. Both-mode 320/402/1440 browser checks and long-title/operation regression passed. Latest previews: `tmp/vintage-compact-tasks-comparison.png` and `tmp/vintage-compact-bar-comparison.png`. Not deployed.

Recorded-time summary is a flat, background-free statistics section in Vintage only. The small title always occupies its own line; existing icons and durations run horizontally below it. There is no card background, radius or shadow. Reuse the original button, accessible summary and detail sheet. The sample three-value section is about 56px tall at 320/402/1440; six-value wrapping and Classic remain intact. Both-mode browser checks passed; opening/closing details preserves Timeline markup exactly. Timeline implementation/styles are untouched. Preview: tmp/vintage-time-summary-comparison.png. No deployment.

## Global theme · 2026-10-29

- Theme selection now uses Classic / Vintage. Classic owns all four existing color palettes; Vintage currently uses the approved plum palette, with no additional color variants.
- Palette and body/title type roles apply without Home mounted. Shared settings/content cards stay flat; floating navigation retains its continuous glass contour, centered Log and active dots.
- Real-browser coverage passed on Home, Settings, Tasks, Inbox and Trackers at 320/402/1440 in both modes. All four Classic palette switch/restore paths, Vintage reload, task/reminder actions and Universal Log passed using synthetic fixtures; no cloud business writes.
- Full regression: 781 tests, 14 skipped. Initial 7 failures resolved: six Home fixture dependencies corrected and passed; one temporary avatar-file permission failure passed on isolated retry. Focused final suite: 17/17 passed.
- SQLite upgrade/default/old-client compatibility and Postgres migration idempotency/constraint tests passed against isolated databases. Production schema migration remains unapplied. Screenshots: `tmp/vintage-global-*.png`; reproducible browser harness: `scripts/home-vintage-browser.mjs`.

## Web release candidate · 2026-10-29

User authorized publishing all theme/Home refinements and Web deployment, explicitly skipping IPA packaging. Removed the empty brand-mark container from the shared login surface; Classic/Vintage × light/dark × 320/402/1440 browser checks passed. Release is based on production main 8ad92ec; only the additive design-theme migration is pending. Unrelated combobox/suggested-input edits are excluded. The iOS workflow path filters do not match this release, and no workflow dispatch is requested.
