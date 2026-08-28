"use client";

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

export function DateTimeField({ label, value, onChange, optionalDate = false }: { label: string; value: DateTimeDraft; onChange: (value: DateTimeDraft) => void; optionalDate?: boolean }) {
  return <div className="date-time-field">
    <label className="field"><span>{label}</span><input type="date" required={!optionalDate} value={value.date} onChange={(event) => onChange({ date: event.target.value, time: event.target.value ? value.time : "" })}/></label>
    {value.date && (value.time ? <label className="field date-time-clock"><span>Time <small>Optional</small></span><span className="date-time-clock-row"><input type="time" value={value.time} onChange={(event) => onChange({ ...value, time: event.target.value })}/><button type="button" className="text-button" onClick={() => onChange({ ...value, time: "" })}>Remove time</button></span></label> : <button type="button" className="date-time-add" onClick={() => onChange({ ...value, time: "09:00" })}>+ Add time</button>)}
  </div>;
}
