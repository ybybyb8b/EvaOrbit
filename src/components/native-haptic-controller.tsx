"use client";

import { useEffect } from "react";
import { playNativeHaptic, prepareNativeHaptics, resetNativeHapticCapability } from "@/lib/native-haptics";

const SELECTION_BUTTONS = [
  ".segmented button",
  ".cat-tabs button",
  ".case-view-tabs button",
  ".notification-tabs button",
  ".tracker-tabs button",
  "button.status-pill",
  ".routine-tab",
  ".quick-date-field button",
  ".routine-scope button",
  ".routine-suggestions button",
  ".appearance-option-grid button",
  ".composer-shortcuts button",
  "button[role='tab']",
  "button[aria-pressed]",
].join(",");

export function NativeHapticController() {
  useEffect(() => {
    let lastUserActionAt = 0;
    let lastError = { message: "", time: 0 };
    const prepare = () => {
      resetNativeHapticCapability();
      void prepareNativeHaptics();
    };
    const onClick = (event: MouseEvent) => {
      if (event.isTrusted) lastUserActionAt = performance.now();
      const target = event.target;
      if (!(target instanceof Element)) return;
      const destructive = target.closest<HTMLButtonElement>("button.danger,button.danger-text,button.danger-icon,button.row-icon-button.danger,.danger-zone button,button[aria-label^='删除'],button[aria-label^='Delete'],button[aria-label^='Archive']");
      if (destructive && !destructive.disabled && destructive.dataset.haptic !== "none") {
        playNativeHaptic("warning");
        return;
      }
      const button = target.closest<HTMLButtonElement>(SELECTION_BUTTONS);
      if (!button || button.disabled || button.dataset.haptic === "none") return;
      if (button.classList.contains("active") || button.getAttribute("aria-pressed") === "true") return;
      playNativeHaptic("selection");
    };
    const onChange = (event: Event) => {
      if (event.isTrusted) lastUserActionAt = performance.now();
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.dataset.haptic === "none") return;
      if (target.type === "checkbox" || target.type === "radio") playNativeHaptic("selection");
    };
    const onSubmit = (event: SubmitEvent) => {
      if (event.isTrusted) lastUserActionAt = performance.now();
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.matches(".tracker-search,[data-haptic='none']")) return;
      if (form.matches(".media-rewatch-form")) return;
      if (form.matches(".project-item-editor")) {
        const current = document.querySelector<HTMLElement>(".item-status[data-status]")?.dataset.status;
        const next = form.querySelector<HTMLSelectElement>("select")?.value;
        if ((next === "done" || next === "verified") && next !== current) {
          playNativeHaptic("success");
          return;
        }
      }
      playNativeHaptic("light");
    };
    const errorObserver = new MutationObserver((mutations) => {
      if (performance.now() - lastUserActionAt > 30_000) return;
      for (const mutation of mutations) {
        const element = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        const error = element?.matches(".form-error") ? element : element?.closest(".form-error") ?? element?.querySelector(".form-error");
        const message = error?.textContent?.trim() ?? "";
        const now = performance.now();
        if (!message || (message === lastError.message && now - lastError.time < 1_000)) continue;
        lastError = { message, time: now };
        playNativeHaptic("error");
        break;
      }
    });

    void prepareNativeHaptics();
    window.addEventListener("evaorbit:native-ready", prepare);
    document.addEventListener("click", onClick, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("submit", onSubmit, true);
    errorObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
    return () => {
      window.removeEventListener("evaorbit:native-ready", prepare);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("submit", onSubmit, true);
      errorObserver.disconnect();
    };
  }, []);

  return null;
}
