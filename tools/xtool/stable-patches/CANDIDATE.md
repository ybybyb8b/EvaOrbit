# Isolated xtool 1.24.0 candidate

This is a source-built candidate, not the installed, real-device-verified default.

- Official source: xtool 1.24.0, commit `70e1568fdfcb20b560774057cd783f02361293b9`.
- Authentication uses upstream's Mac Omnisette service, `https://mac-ani.jkcoxson.com`.
- The service receives the generated device identifier and provisioning data, then produces Anisette headers. Apple ID, password, 2FA codes and Apple account tokens are sent to Apple, not to the Anisette service. Authentication now depends on this third-party service.
- State is confined to `~/.config/evaorbit-xtool-1.24-candidate`. The original `~/.config/xtool` is neither imported nor reset. Use this same candidate for login and installation; do not copy a token back to an older Android-provider tool.
- The patch preserves HealthKit background-delivery recognition and its free Personal Team capability mapping; CI tests decoding and re-encoding both HealthKit entitlements.
- It retains safe authentication diagnostics, at most three AppTokens attempts on HTTP 503, atomic credential writes, restrictive file permissions, and upstream's fresh HTTP client per GrandSlam request. It removes the upstream TLS-verification bypass and response-body printing in generic HTTP errors.
- CI checks compilation, HealthKit round-trip and profile isolation. This does not prove live Apple login or iPhone installation.

Do not overwrite `~/.local/bin/xtool`, change the default installer SHA, use `--skip-sha256`, reset existing provisioning, or install until this candidate has been reviewed and explicitly approved for the authentication change. The project requires migration authorization and subsequent device validation.

After approval, extract this folder, verify SHA256SUMS, then run `bash candidate.sh auth login`. Credentials are entered locally. `bash candidate.sh ds teams list` is the subsequent live read-only check. Before device installation, initialize the unchanged Windows usbmuxd/WSL environment using the project script, and invoke this candidate's `install` command against the existing IPA. Device installation and exported entitlements must be verified before making it the default. Production renewal reminders are not updated by calling `install` directly.
