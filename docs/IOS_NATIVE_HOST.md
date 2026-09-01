# EvaOrbit iOS Native Host

EvaOrbit remains a Vercel-hosted Next.js application backed by Supabase. The iOS target is a small native host that loads `https://eva-orbit.vercel.app` in a persistent `WKWebView` and reserves a versioned JavaScript-to-Swift bridge for native capabilities.

## Build pipeline

Run the `iOS Native Host` GitHub Actions workflow. It:

1. Generates the Xcode project from `ios/EvaOrbitHost/project.yml`.
2. Compiles the host and test bundle for the Simulator.
3. Builds the device app with ad-hoc code signing.
4. Fails unless both `com.apple.developer.healthkit` and `com.apple.developer.healthkit.background-delivery` are present in the app signature.
5. Publishes `EvaOrbitHost-ad-hoc.ipa`, its extracted entitlements, checksum, dSYM, Git SHA, and Xcode version.

Do not replace the device build with `CODE_SIGNING_ALLOWED=NO`. A completely unsigned app does not preserve the entitlements that patched xtool needs to inspect and reproduce during free-Team signing.

The workflow contains no Apple ID, certificate, provisioning profile, Supabase key, or EvaOrbit secret. The IPA contains only the public production origin and native code.

## Build patched xtool

Run the `Build patched xtool` workflow. It checks out the pinned upstream commit recorded in the workflow, applies the HealthKit background-delivery patch followed by the password-auth compatibility patch, verifies both changes, builds xtool's official `build-xtool` Docker target, and publishes the AppImage together with the pinned commit, patches, and checksums.

The patch teaches xtool that `com.apple.developer.healthkit.background-delivery` is a free-Team entitlement backed by the same HealthKit Developer Services capability as `com.apple.developer.healthkit`. Without it, xtool's free-Team filter removes background delivery before signing.

Keep the upstream commit pinned. Upgrade only by reviewing the changed entitlement model, reapplying the patch, and rerunning both source checks and a real-device background-delivery test.

### Password-auth diagnostics

The compatibility patch does not print Apple credentials or response bodies. With diagnostics enabled it records only the authentication stage, request type, Apple endpoint without query parameters, HTTP status, Content-Type, coarse response type, and byte count:

```bash
xtool auth logout
XTL_AUTH_DIAGNOSTICS=1 xtool auth login
xtool auth status
xtool devices
bash scripts/ios/xtool-install.sh /mnt/c/Users/<you>/Downloads/EvaOrbitHost-ad-hoc.ipa
```

Save the diagnostic lines beginning with `[xtool-auth]` or `[xtool-auth-http]` if login fails. Do not copy the password or 2FA prompt. A successful login now writes the token atomically, restricts its file permissions, reads it back before reporting success, and lets `auth status` distinguish a missing token from an unreadable or malformed token file. `xtool auth logout` removes malformed stored auth data before a clean retry. The Xcode app-token request retries HTTP 503 at most twice with fresh anisette data; other authentication requests and errors are not retried.

## Windows and WSL device transport

The iPhone remains connected to Windows. Do not attach it to WSL with `usbipd`; this pipeline uses Apple's Windows usbmuxd service over TCP.

Prerequisites:

- Apple Devices, iTunes, or another package that installs Apple Mobile Device Service.
- WSL Ubuntu.
- The patched xtool AppImage downloaded into WSL.
- `usbmuxd`, `libimobiledevice-utils`, and `zip` installed in Ubuntu.
- The iPhone unlocked, trusted, and in Developer Mode.

In an elevated PowerShell window, verify Apple's service and create the forwarding rule:

```powershell
netstat -ano | findstr 27015
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=27016 connectaddress=127.0.0.1 connectport=27015
New-NetFirewallRule -DisplayName "usbmuxd-wsl" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 27016
```

This opens TCP 27016 on Windows. Use it only on a trusted network. To remove it later:

```powershell
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=27016
Remove-NetFirewallRule -DisplayName "usbmuxd-wsl"
```

Prepare WSL:

```bash
sudo apt-get update
sudo apt-get install -y usbmuxd libimobiledevice-utils zip
chmod +x xtool-x86_64.AppImage
sudo mv xtool-x86_64.AppImage /usr/local/bin/xtool
xtool auth
```

Choose password authentication and preferably use a dedicated Apple ID. Authentication data and the Apple password remain local to xtool; never add them to the repository or GitHub Actions.

Install or renew EvaOrbit from the same WSL process that sets `USBMUXD_SOCKET_ADDRESS`:

```bash
bash scripts/ios/xtool-install.sh /mnt/c/Users/<you>/Downloads/EvaOrbitHost-ad-hoc.ipa
```

The script stops WSL's local usbmuxd, resolves the Windows host address, exports `<windows-host>:27016`, verifies the device with `ideviceinfo`, and invokes `xtool install`. If xtool asks whether to revoke the old free-Team certificate, accept the revocation. A stable Apple ID and original bundle identifier should produce the same xtool-managed App ID prefix on renewal.

## Phase-one real-device checks

- Login, Supabase SSR cookie refresh, logout, app restart, and renewal persistence.
- Internal navigation, swipe-back, external links, and links that request a new window.
- Avatar, relation photo, media cover, and tracker image upload from Photos and Files.
- Safe areas, rotation, form sheets, keyboard focus, and interactive keyboard dismissal on iPhone 16 Pro.
- AI streaming and recovery after a WebKit content-process termination.
- Offline launch failure UI, retry, and reconnection.
- `window.EvaOrbitNative.call("host.ping")` and `host.getInfo()` from the main EvaOrbit frame.
- Final signed entitlements on device and successful `enableBackgroundDelivery` in the HealthKit phase.

## HealthKit phase boundary

The host declares the HealthKit entitlements now so the build-sign-install chain can be validated before health data code is added. It does not request Health authorization or read samples yet.

The next phase will add only basal energy (`basalEnergyBurned`) and active energy (`activeEnergyBurned`). Observer queries and fallback refresh registration belong in `application(_:didFinishLaunchingWithOptions:)`. Anchored query results, deletions, the new anchor, and a durable outbox must be committed locally before HealthKit's background completion handler is called. Initial anchorless reads must use a bounded time window. Uploads will be batched, idempotent, authenticated from Keychain with `kSecAttrAccessibleAfterFirstUnlock`, and retried through a background `URLSession`.

EvaOrbit will define its own server-side idempotency, provenance, daily aggregation, and Supabase schema. The reference pipeline's `(type, timestamp)` uniqueness and JSONL storage are not adopted as the product data model.
