"use client";

import { useLocale } from "@/components/locale-controller";
import { useId, useRef, useState } from "react";
import { flushSync } from "react-dom";

export type DateTimeDraft = { date: string; time: string };

export function currentLocalDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function dateTimeDraft(value?: string | null, hasExplicitTime = true): DateTimeDraft {
  if (!value) return { date: "", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString();
  return { date: local.slice(0, 10), time: hasExplicitTime ? local.slice(11, 16) : "" };
}

export function dateTimePayload(value: DateTimeDraft) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date)) throw new Error("Date is required");
  const hasExplicitTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time);
  const local = new Date(`${value.date}T${hasExplicitTime ? value.time : "12:00"}:00`);
  if (Number.isNaN(local.getTime())) throw new Error("Date is invalid");
  return { value: local.toISOString(), hasExplicitTime };
}

export function compactDateTimeValue(value?: string | null, hasExplicitTime = true) {
  const draft = dateTimeDraft(value, hasExplicitTime);
  return draft.date && draft.time ? `${draft.date}T${draft.time}` : draft.date;
}

export function compactDateTimePayload(value: string) {
  return dateTimePayload({ date: value.slice(0, 10), time: value.length > 10 ? value.slice(11, 16) : "" });
}

export function DateTimeField({ label, timeLabel, value, onChange, optionalDate = false }: {
  label: string;
  timeLabel?: string;
  value: DateTimeDraft;
  onChange: (value: DateTimeDraft) => void;
  optionalDate?: boolean;
}) {
  const { english } = useLocale();
  const [addingTime, setAddingTime] = useState(false);
  const timeCaptionId = useId();
  const timeInput = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const showTimeInput = Boolean(value.date && (value.time || addingTime));
  const optional = english ? "Optional" : "可选";
  const resolvedTimeLabel = timeLabel ?? (english ? "Time" : "时间");

  function addTime() {
    // Mount the native input before requesting its picker during the same user gesture.
    flushSync(() => setAddingTime(true));
    const input = timeInput.current;
    input?.focus({ preventScroll: true });
    try { input?.showPicker?.(); } catch { /* The focused time input is still editable. */ }
  }

  function clearTime() {
    flushSync(() => {
      setAddingTime(false);
      if (value.time) onChange({ ...value, time: "" });
    });
    addButton.current?.focus({ preventScroll: true });
  }

  return <div className="date-time-field date-time-inline date-time-optional">
    <label className="field">
      <span>{label} {optionalDate && <small>{optional}</small>}</span>
      <input type="date" required={!optionalDate} value={value.date} onChange={event => {
        const date = event.target.value;
        if (!date) setAddingTime(false);
        onChange({ date, time: date ? value.time : "" });
      }}/>
    </label>
    <div className="field date-time-clock">
      <span id={timeCaptionId}>{resolvedTimeLabel} <small>{optional}</small></span>
      {showTimeInput ? <div className="date-time-clock-row">
        <input type="time" ref={timeInput} aria-labelledby={timeCaptionId} value={value.time}
          onChange={event => {
            const time = event.target.value;
            setAddingTime(!time);
            onChange({ ...value, time });
          }}
          onBlur={event => {
            if (!value.time && event.relatedTarget) setAddingTime(false);
          }}
          onKeyDown={event => {
            if (event.key !== "Escape" || value.time) return;
            event.preventDefault();
            event.stopPropagation();
            clearTime();
          }} />
        {value.time && <button type="button" className="date-time-clear" data-form-change onClick={clearTime}
          aria-label={english ? `Remove ${resolvedTimeLabel.toLowerCase()}` : `移除${resolvedTimeLabel}`}>×</button>}
      </div> : <button type="button" ref={addButton} className="date-time-add" disabled={!value.date}
        aria-describedby={timeCaptionId} onClick={addTime}>{english ? "Add time" : "添加时间"}</button>}
    </div>
  </div>;
}
