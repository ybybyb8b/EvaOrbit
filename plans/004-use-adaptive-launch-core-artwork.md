# 004 — Use adaptive launch core artwork

- **Status**: DONE
- **Severity**: MEDIUM
- **Category**: Native launch; visual polish; accessibility
- **Estimated scope**: 7 files plus 2 supplied image assets

## Problem

The native launch orbit still draws a generic geometric core from `CAShapeLayer`s. The supplied EvaOrbit light and dark core artwork should replace it, at a slightly smaller visual size and with restrained depth, while preserving the verified native loading lifecycle and packaging chain.

## Target

1. Package the two supplied PNGs as one adaptive `LoadingCore` image asset: white-marble artwork in light appearance and black/gold artwork in dark appearance.
2. Render that asset at 66×66 points in the center of the existing orbit, replacing the procedural core only.
3. Add an alpha-aware, restrained drop shadow to reinforce the artwork's existing depth without creating a rectangular shadow plate.
4. Preserve intro timing, interruption, quiet-loop behavior, Reduce Motion behavior, accessibility labeling, semantic launch colors, and all surrounding orbit artwork.
5. Document the new native resource in both iOS maintenance references without changing the bridge, entitlements, signing, or install chain.

## Repo conventions to follow

- `Resources/Assets.xcassets` is already the application resource build phase in `ios/EvaOrbitHost/project.yml`; no project configuration change is required.
- Native loading implementation remains in `OrbitArtworkView.swift`; use UIKit/Core Animation and the existing trait-change refresh path.
- Use the two user-supplied PNG files byte-for-byte. Do not regenerate, recolor, crop, or destructively optimize them.
- `docs/IOS_NATIVE_MAINTENANCE.md` and `docs/IOS_NATIVE_HOST.md` must both describe intentional Native Host changes.

## Steps

1. Create `ios/EvaOrbitHost/Resources/Assets.xcassets/LoadingCore.imageset`. Copy `D:/下载/ChatGPT Image 2026年9月5日 22_28_21.png` as the universal light appearance and `D:/下载/ChatGPT Image 2026年9月5日 22_27_45.png` as the universal dark luminosity appearance. Add a valid asset-catalog `Contents.json`.
2. In `OrbitArtworkView.swift`, replace `coreShapeLayer`, the three facet layers, and `coreStarLayer` with one image-backed `CALayer` inside `coreContainer`. Set aspect-fit contents gravity, appropriate contents scale/filtering, and a 66×66-point container.
3. Load `LoadingCore` against the current trait collection in `applyTheme()`. Refresh it when light/dark appearance changes through the existing `traitCollectionDidChange` path.
4. Apply the drop shadow to the alpha-bearing image layer, with no rectangular `shadowPath`. Use a modest downward offset and blur; slightly strengthen opacity in dark appearance so the black edge separates from the neutral dark launch background. Keep all shadow settings implicit-animation-free during theme/layout updates.
5. Remove obsolete procedural-core path and animation cleanup code, but do not alter the intro animation schedule or core-container transform/opacity animation.
6. Extend `NativeLoadingThemeTests.swift` to resolve the named image for both explicit light and dark trait collections, guarding against a missing or incorrectly configured appearance variant.
7. Update both native iOS documents with the `LoadingCore.imageset` ownership, appearance mapping, rebuild requirement, and an explicit statement that bridge, entitlements, signing, and the verified IPA installation chain are unchanged.

## Boundaries

- Do NOT modify the supplied PNG pixels or replace other icons/app artwork.
- Do NOT change launch background colors, wordmark text, orbit geometry, animation timings, or interruption state transitions.
- Do NOT add a new dependency, entitlement, capability, bridge action, Info.plist key, or project resource phase.
- Do NOT run or claim an iOS build on Windows. Defer compilation/signing to the existing macOS GitHub Actions workflow and final appearance validation to iPhone 16 Pro.
- Preserve unrelated working-tree documentation edits exactly.

## Verification

- **Mechanical**:
  - Validate the image-set JSON and confirm both referenced PNG files exist and retain the source byte sizes/checksums.
  - Run web validation once alongside plan 003: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.
  - Review `git diff` to confirm there are no changes to entitlements, capabilities, bridge protocols, signing scripts, workflow chain, or `project.yml`.
- **Native CI / device follow-up**:
  - In the next requested macOS GitHub Actions IPA build, run the existing Xcode tests and confirm `NativeLoadingThemeTests` resolves both appearances.
  - On iPhone 16 Pro, verify system/light/dark appearance, first launch and warm launch, fast WebView interruption, failure/retry, Reduce Motion, portrait safe areas, and no visible rectangular shadow boundary.
- **Done when**: the adaptive supplied artwork is centered, smaller, dimensional, and appearance-correct without changing any native lifecycle or packaging contract.
