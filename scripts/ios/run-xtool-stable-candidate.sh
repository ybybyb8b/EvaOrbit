#!/usr/bin/env bash
set -euo pipefail

candidate_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$candidate_directory"
sha256sum -c SHA256SUMS
chmod u+x ./xtool-x86_64.AppImage
export APPIMAGE_EXTRACT_AND_RUN=1
exec ./xtool-x86_64.AppImage "$@"
