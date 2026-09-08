# EvaOrbit Native

`EvaOrbitNative` is the separate SwiftUI client under development. It uses the development-only bundle identifier `com.evaorbit.native.dev`, so it can be installed beside the existing `EvaOrbitHost` app.

Stage A contains a local SwiftUI permission check screen:

- Notifications requests alerts and sounds after an explicit button tap. It does not request badges or schedule notifications.
- Apple Health requests read-only access to resting and active energy after an explicit button tap. It does not read or upload health data yet.

Stage B adds the smallest online session foundation:

- The native app signs in through `https://eva-orbit.vercel.app/api/native/session`.
- Supabase credentials and tokens stay behind Vercel. The app persists only the HTTPS session cookies managed by `URLSession`.
- App launch checks the existing cookie session, and the signed-in screen can log out.
- Existing web login and protected business APIs remain unchanged. No business-resource UI is included yet.

Stage C adds the first online business slice:

- Daily Energy loads a selected EvaOrbit calendar date through the existing Vercel API.
- Manual resting energy, active energy, and notes save through the existing validated upsert path.
- Effective values still come from the server, so blank manual fields continue to fall back to Apple Health when available.
- This stage does not add local persistence, an offline queue, or any new database migration.

Stage D turns the validation screens into the first product-facing native shell:

- The visual system translates EvaOrbit's warm canvas, editorial hierarchy, material cards, and rose accent into native SwiftUI.
- Home, Health, and Settings use native tab and navigation behavior instead of a test dashboard.
- Daily Energy keeps the Stage C API contract but moves editing into an iOS sheet with explicit cancel, save, error, and completion feedback.
- Notification and HealthKit controls remain user-initiated and now live in Settings.
- No additional business resource, API, database migration, or offline behavior is introduced in this stage.

The existing WebView host, JS bridge, Vercel API, Supabase integration, notifications, HealthKit upload pipeline, signing patches, and installation transport are unchanged.

Generate the Xcode project on macOS with:

```bash
cd ios/EvaOrbitNative
xcodegen generate
```

The `iOS SwiftUI Foundation` workflow builds and tests the app, verifies the HealthKit entitlements, and publishes a separate `EvaOrbitNative-ad-hoc-<run>` artifact.
