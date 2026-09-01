#!/usr/bin/env bash
set -euo pipefail

app_path="${1:?usage: package-ad-hoc-ipa.sh <app-path> <output-directory>}"
output_directory="${2:?usage: package-ad-hoc-ipa.sh <app-path> <output-directory>}"

if [[ ! -d "$app_path" || "${app_path##*.}" != "app" ]]; then
  echo "Expected an iOS .app bundle: $app_path" >&2
  exit 1
fi

mkdir -p "$output_directory/Payload"
entitlements_path="$output_directory/EvaOrbitHost-ad-hoc-entitlements.plist"
ipa_path="$output_directory/EvaOrbitHost-ad-hoc.ipa"

codesign --verify --deep --strict "$app_path"
codesign -d --entitlements :- "$app_path" > "$entitlements_path"

/usr/libexec/PlistBuddy -c "Print :com.apple.developer.healthkit" "$entitlements_path" | grep -qx "true"
/usr/libexec/PlistBuddy -c "Print :com.apple.developer.healthkit.background-delivery" "$entitlements_path" | grep -qx "true"

ditto "$app_path" "$output_directory/Payload/EvaOrbitHost.app"
(
  cd "$output_directory"
  ditto -c -k --sequesterRsrc --keepParent Payload "$(basename "$ipa_path")"
)

shasum -a 256 "$ipa_path" > "$output_directory/SHA256SUMS"
echo "Packaged $ipa_path with HealthKit entitlements intact."
