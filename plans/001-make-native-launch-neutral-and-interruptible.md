# 001 — Make the native launch neutral and interruptible

- **Status**: DONE
- **Commit**: 8c70bdb
- **Severity**: HIGH
- **Category**: Purpose & frequency; accessibility; visual cohesion
- **Estimated scope**: 19 files, approximately 180 lines including tests and asset JSON

## Problem

The native iOS host forces every cold launch to finish a two-second branded intro even when the WebView is already ready. This turns a decorative sequence into input latency for a frequently opened personal tool.

```swift
// ios/EvaOrbitHost/Sources/LoadingExperienceCoordinator.swift:37 — current
func webViewDidBecomeReady() {
    switch state {
    case .introPlaying:
        state = .readyToDismiss
    case .waitingForWebView:
        state = .readyToDismiss
        dismissOnce()
```

```swift
// ios/EvaOrbitHost/Sources/LoadingOverlayView.swift:4 — current
enum Timing {
    static let introDuration: TimeInterval = 2.0
    static let reducedMotionIntroDuration: TimeInterval = 1.65
    static let wordmarkDelay: TimeInterval = 1.35
    static let wordmarkDuration: TimeInterval = 0.60
    static let exitDuration: TimeInterval = 0.30
}
```

The editorial dark loading background is a deep green (`red 0.063 / green 0.137 / blue 0.106`). It conflicts with rosewood, powder-blue, and future themes. The center of the orbital artwork is also an `EO` wordmark rather than the recognizable core of the shipping app icon.

```swift
// ios/EvaOrbitHost/Sources/OrbitArtworkView.swift:177 — current
private func configureMonogram() {
    monogramLabel.textAlignment = .center
    monogramLabel.adjustsFontForContentSizeCategory = false
    let font = UIFont(name: "Didot", size: 56) ?? UIFont(name: "TimesNewRomanPSMT", size: 56) ?? .systemFont(ofSize: 56, weight: .light)
    monogramLabel.attributedText = NSAttributedString(string: "EO", attributes: [.font: font, .kern: -13])
    addSubview(monogramLabel)
}
```

## Target

1. `webViewDidBecomeReady()` immediately begins dismissal even while the intro is playing. `dismissOnce()` remains the idempotency gate, so a later intro completion cannot dismiss twice.
2. Keep the two-second intro only as a loading experience when the WebView is genuinely not ready. Remove any artificial minimum display time.
3. Dismiss with `0.20` seconds and `.curveEaseOut`, using `.beginFromCurrentState`. The overlay must be interruptible at any point.
4. Replace the `EO` label with a code-native approximation of the app icon's central core: a softly irregular eight-lobed stone silhouette, subtle facet lines, and a centered four-point star. Do not crop or duplicate the 1,024px raster icon and do not add a new image dependency.
5. Under Reduce Motion, the core, wordmark, and overlay must use opacity only. No translation or scale animation.
6. Use one theme-neutral launch palette for both native theme identifiers so the static `UILaunchScreen` background and runtime overlay remain seamless:

| Role | Light sRGB hex | Dark sRGB hex |
| --- | --- | --- |
| Background | `#F7F4ED` | `#171719` |
| Primary/core/orbits/text | `#343638` | `#E8E5DE` |
| Accent/star | `#B58A4A` | `#D8B46A` |
| Secondary text | `#747474` | `#AAA7A0` |
| Button background | `#E9E5DC` | `#2A2A2E` |
| Button text | `#343638` | `#F2EFE8` |

Use exact sRGB decimal components derived from `hex / 255`, rounded to three decimals in asset JSON. Both `Loading*.colorset` and `RosewoodLoading*.colorset` receive the same values; retain the semantic asset names and theme mapping architecture.

## Repo conventions to follow

- Semantic native colors live under `ios/EvaOrbitHost/Resources/Assets.xcassets/*Loading*.colorset/Contents.json`; keep `NativeLoadingTheme.swift` asset-name mapping unchanged.
- `OrbitArtworkView` already builds the surrounding artwork with `CAShapeLayer`, `UIBezierPath`, final model values, and explicit animation keys. Implement the logo core the same way in `ios/EvaOrbitHost/Sources/OrbitArtworkView.swift` rather than introducing a rendering framework.
- Existing interruption uses `animationGeneration`, `.beginFromCurrentState`, and `dismissOnce()`; extend those patterns.
- The app icon reference is `public/icons/app-icon-1024.png`: the central dark irregular stone and its four-point gold star are the visual source. Do not reproduce the outer rounded-square tile or surrounding large orbital strokes inside the core.

## Steps

1. In `ios/EvaOrbitHost/Sources/LoadingExperienceCoordinator.swift`, change the `.introPlaying` branch of `webViewDidBecomeReady()` to set `.readyToDismiss` and call `dismissOnce()` immediately. Keep all other state transitions and the idempotency guard intact.
2. In `ios/EvaOrbitHost/Tests/LoadingExperienceCoordinatorTests.swift`, replace the fast-WebView test with assertions that dismissal starts immediately, repeated ready events do not duplicate it, and a stale intro completion still does not duplicate it. Preserve slow-load, failure, and recovery coverage.
3. In `ios/EvaOrbitHost/Sources/LoadingOverlayView.swift`, set `exitDuration` to `0.20`; use `.curveEaseOut` for dismissal. Branch initial/final wordmark transforms on `UIAccessibility.isReduceMotionEnabled`, leaving them at identity under Reduce Motion. Ensure stopping the artwork and beginning overlay dismissal does not snap the visible core to another transform first.
4. In `ios/EvaOrbitHost/Sources/OrbitArtworkView.swift`, replace `monogramLabel` with a `CALayer` container holding:
   - a `CAShapeLayer` core silhouette sized about `76x76` points at the artwork center;
   - an irregular, balanced eight-point outline built as a normalized `UIBezierPath` with rounded cubic segments, visually matching the central stone in `public/icons/app-icon-1024.png` without copying the full raster;
   - three subtle facet paths using the accent color at approximately `0.30` alpha;
   - a centered four-point star path filled with `loadingAccent`, no text.
   Keep the core layer centered in `layoutSubviews`/`updatePaths`, included in prepare/show/stop methods, and animated with the former monogram's opacity timing. For normal motion, scale from `0.97` to identity; under Reduce Motion, keep transform identity and animate opacity only.
5. Update all 14 semantic color assets covering background, primary, accent, text, secondary text, and button background/text for editorial and rosewood identifiers to the exact palette table above. Do not alter `NativeLoadingTheme.swift` or user preference keys.
6. Update `ios/EvaOrbitHost/Tests/NativeLoadingThemeTests.swift` to expect `exitDuration == 0.20` and rename the timing test so it describes interruptibility rather than forcing the full intro. Add deterministic assertions for the neutral dark background and key artwork colors if UIKit asset resolution can be tested without display-dependent color conversion; otherwise keep validation at the asset-presence and mapping level.

## Boundaries

- Do NOT change the web application's theme tokens or web UI.
- Do NOT change notification, HealthKit, persistence, WebView navigation, recovery, or failure semantics.
- Do NOT add dependencies or raster assets.
- Do NOT delete or modify the user's unrelated changes under `artifacts/`, `.agents/`, or `skills-lock.json`.
- Keep deployment compatibility with iOS 16 and Swift 5 mode.
- If a step does not match commit `8c70bdb`, stop and report the drift instead of improvising.

## Verification

- **Mechanical**:
  - Run the iOS unit tests with `xcodebuild test -project ios/EvaOrbitHost.xcodeproj -scheme EvaOrbitHost -destination 'platform=iOS Simulator,name=iPhone 16 Pro'` when macOS/Xcode is available.
  - At minimum, run repository lint, typecheck, tests, production build, and `git diff --check`; report iOS compilation as unavailable when running on Windows.
  - Confirm asset JSON parses and every semantic colorset still has universal light and dark entries.
- **Feel check**:
  - On iPhone 16 Pro, cold launch with a warm/fast WebView: the overlay should leave as soon as content is ready, without waiting for the orbit sequence and without flashing or snapping the core.
  - Cold launch with a throttled/slow WebView: the full orbit sequence may finish and enter the quiet loop until ready.
  - Toggle light/dark plus editorial/rosewood/powder-blue web themes: launch should remain warm neutral in light mode and charcoal—not green—in dark mode. The transition into themed web content should not read as a competing brand color.
  - Inspect the center at normal size and 200% zoom: it must read as the app icon's central stone and four-point star, never as `EO` or as a miniature full app-icon tile.
  - Enable Reduce Motion: only opacity changes; the core and wordmark do not translate or scale.
- **Done when**: fast readiness is never delayed by the decorative intro; dismissal occurs once; dark launch has no green cast; the center uses the recognizable code-native app-icon core; normal and Reduce Motion paths meet the checks above.
