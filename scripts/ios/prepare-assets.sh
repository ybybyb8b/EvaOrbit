#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source_icon="$repository_root/public/icons/app-icon-1024.png"
target_icon="$repository_root/ios/EvaOrbitHost/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png"

test -f "$source_icon"
cp "$source_icon" "$target_icon"
echo "Prepared EvaOrbitHost app icon."
