"use client";

import { useId } from "react";
import { useLocale } from "@/components/locale-controller";

export function TrackerCaptureToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  const { english } = useLocale();
  const descriptionId = useId();
  const label = english ? "Quick record" : "快速记录";
  return <label className="tracker-capture-toggle">
    <span><strong>{label}</strong><small id={descriptionId}>{enabled
      ? english ? "Tap + to save the current moment. No form needed." : "点击＋直接记录当前时刻，无需填写表单。"
      : english ? "Tap + to fill in time, properties and a note before saving." : "点击＋打开表单，填写时间、属性及备注后保存。"}</small></span>
    <input role="switch" className="toggle-switch" type="checkbox" checked={enabled} aria-label={label} aria-describedby={descriptionId} onChange={event => onChange(event.target.checked)} />
  </label>;
}
