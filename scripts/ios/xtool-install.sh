#!/usr/bin/env bash
set -euo pipefail

ipa_path="${1:?usage: xtool-install.sh <path-to-EvaOrbitHost-ad-hoc.ipa>}"
if [[ ! -f "$ipa_path" ]]; then
  echo "IPA not found: $ipa_path" >&2
  exit 1
fi

windows_gateway="$(ip route show default | awk 'NR == 1 { print $3 }')"
if [[ -z "$windows_gateway" ]]; then
  echo "Could not determine the Windows host address from WSL." >&2
  exit 1
fi

sudo service usbmuxd stop >/dev/null 2>&1 || true
export USBMUXD_SOCKET_ADDRESS="${windows_gateway}:27016"
export APPIMAGE_EXTRACT_AND_RUN=1

echo "Using Windows usbmuxd through $USBMUXD_SOCKET_ADDRESS"
ideviceinfo -k ActivationState
xtool install "$ipa_path"
