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

The existing WebView host, JS bridge, Vercel API, Supabase integration, notifications, HealthKit upload pipeline, signing patches, and installation transport are unchanged.

Generate the Xcode project on macOS with:

```bash
cd ios/EvaOrbitNative
xcodegen generate
```

The `iOS SwiftUI Foundation` workflow builds and tests the app, verifies the HealthKit entitlements, and publishes a separate `EvaOrbitNative-ad-hoc-<run>` artifact.
