#!/usr/bin/env bash

# This file must be sourced so the exported variables remain in the current
# WSL shell: source scripts/ios/xtool-env.sh

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  echo "This script must be sourced so its environment remains active:" >&2
  echo "  source scripts/ios/xtool-env.sh" >&2
  exit 2
fi

_evaorbit_xtool_env() {
  local verify_sha256=true
  local show_next_steps=true
  local xtool_path="${HOME}/.local/bin/xtool"
  local expected_sha256="9f23739f9ca45a7506d3290878853e067706b26f510deefafc9728add3c5a628"
  local actual_sha256
  local windows_gateway

  while (($# > 0)); do
    case "$1" in
      --skip-sha256)
        verify_sha256=false
        ;;
      --no-next-steps)
        show_next_steps=false
        ;;
      *)
        echo "Unknown option: $1" >&2
        return 2
        ;;
    esac
    shift
  done

  if [[ ! -f "$xtool_path" ]]; then
    echo "Patched xtool was not found at $xtool_path" >&2
    echo "Install the audited AppImage there before continuing." >&2
    return 1
  fi
  if [[ ! -x "$xtool_path" ]]; then
    echo "Patched xtool is not executable: $xtool_path" >&2
    echo "Run: chmod 755 $xtool_path" >&2
    return 1
  fi

  for command_name in awk bash ideviceinfo ip service sha256sum sudo timeout; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
      echo "Required WSL command is missing: $command_name" >&2
      return 1
    fi
  done

  actual_sha256="$(sha256sum "$xtool_path" | awk '{ print $1 }')"
  echo "xtool SHA-256: $actual_sha256"
  if [[ "$verify_sha256" == true && "$actual_sha256" != "$expected_sha256" ]]; then
    echo "Unexpected xtool SHA-256; refusing to continue." >&2
    echo "Expected the 2026-09-01 real-device-tested build: $expected_sha256" >&2
    echo "Audit a rebuilt binary before using --skip-sha256." >&2
    return 1
  fi

  case ":${PATH}:" in
    *":${HOME}/.local/bin:"*) ;;
    *) export PATH="${HOME}/.local/bin:${PATH}" ;;
  esac
  export APPIMAGE_EXTRACT_AND_RUN=1

  # The verified transport uses Apple's Windows usbmuxd through portproxy.
  # A local WSL usbmuxd would compete with that transport.
  sudo service usbmuxd stop >/dev/null 2>&1 || true

  windows_gateway="$(ip route show default | awk 'NR == 1 { print $3 }')"
  if [[ -z "$windows_gateway" ]]; then
    echo "Could not determine the Windows host address from WSL." >&2
    return 1
  fi

  export USBMUXD_SOCKET_ADDRESS="${windows_gateway}:27016"
  echo "Windows usbmuxd endpoint: $USBMUXD_SOCKET_ADDRESS"

  if ! timeout 3 bash -c "exec 3<>/dev/tcp/${windows_gateway}/27016" 2>/dev/null; then
    echo "Cannot reach Windows portproxy at $USBMUXD_SOCKET_ADDRESS." >&2
    echo "Check Apple Mobile Device Service, portproxy, firewall, cable, trust, and Developer Mode." >&2
    return 1
  fi
  echo "TCP 27016: reachable"

  # Query only the activation state. Do not print device identifiers.
  local activation_state
  if ! activation_state="$(ideviceinfo -k ActivationState 2>/dev/null)"; then
    echo "TCP is reachable, but ideviceinfo could not read the iPhone." >&2
    echo "Unlock the phone, confirm Trust, and reconnect the cable before retrying." >&2
    return 1
  fi
  echo "iPhone activation state: $activation_state"

  if [[ "$show_next_steps" == true ]]; then
    echo
    echo "Environment is ready in this WSL shell. Next:"
    echo "  xtool auth status"
    echo "  xtool devices"
    echo "  bash scripts/ios/xtool-install.sh /path/to/EvaOrbitHost-ad-hoc.ipa"
    echo "Do not paste device identifiers or authentication data into logs or issues."
  fi
}

_evaorbit_xtool_env "$@"
_evaorbit_xtool_env_status=$?
unset -f _evaorbit_xtool_env
return "$_evaorbit_xtool_env_status"
