#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source_icon="$repository_root/ios/EvaOrbitHost/Resources/AppIconSources/AppIconLight.png"
source_dark_icon="$repository_root/ios/EvaOrbitHost/Resources/AppIconSources/AppIconDark.png"
target_icon="$repository_root/ios/EvaOrbitHost/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png"
target_dark_icon="$repository_root/ios/EvaOrbitHost/Resources/Assets.xcassets/AppIcon.appiconset/AppIconDark.png"

test -f "$source_icon"
test -f "$source_dark_icon"
cp "$source_icon" "$target_icon"
cp "$source_dark_icon" "$target_dark_icon"
echo "Prepared EvaOrbitHost app icon."
