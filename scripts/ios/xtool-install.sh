#!/usr/bin/env bash
set -euo pipefail

ipa_path="${1:?usage: xtool-install.sh <path-to-EvaOrbitHost-ad-hoc.ipa>}"
if [[ ! -f "$ipa_path" ]]; then
  echo "IPA not found: $ipa_path" >&2
  exit 1
fi

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=xtool-env.sh
source "$script_directory/xtool-env.sh" --no-next-steps

echo "Using Windows usbmuxd through $USBMUXD_SOCKET_ADDRESS"
xtool install "$ipa_path"
