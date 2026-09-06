import { getNativeHostInfo, nativeCall, nativeHapticsSupported } from "./native-bridge";

export type NativeHapticKind = "selection" | "light" | "medium" | "success" | "warning" | "error";

let supported = false;
let preparation: Promise<boolean> | null = null;

export function prepareNativeHaptics() {
  if (preparation) return preparation;
  preparation = getNativeHostInfo().then((info) => {
    supported = nativeHapticsSupported(info);
    return supported;
  }).catch(() => {
    supported = false;
    return false;
  });
  return preparation;
}

export function resetNativeHapticCapability() {
  supported = false;
  preparation = null;
}

export function playNativeHaptic(kind: NativeHapticKind) {
  if (!supported) return;
  void nativeCall<{ played: boolean; kind: NativeHapticKind }>("haptic.play", { kind }).catch(() => undefined);
}
