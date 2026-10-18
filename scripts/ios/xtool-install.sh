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

if [[ "${EVAORBIT_SKIP_RENEWAL:-0}" == "1" ]]; then
  echo "Host installed; production renewal reminders were left unchanged."
  exit 0
fi

# Only a successful install resets the reminder. Never let reminder delivery turn an install into a failure.
installed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
repository_directory="$(cd -- "$script_directory/../.." && pwd)"
reminder_script="$script_directory/host-renewal-reminder.mjs"
if command -v node.exe >/dev/null 2>&1; then
  (cd "$repository_directory" && node.exe "$(wslpath -w "$reminder_script")" "$installed_at") || true
elif command -v node >/dev/null 2>&1; then
  (cd "$repository_directory" && node "$reminder_script" "$installed_at") || true
else
  echo "Host installed, but Node.js 24+ is required to record the installation and update the renewal reminder." >&2
fi
