"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { TrackerIcon } from "@/components/tracker-icon";
import type { ApiError, TrackerFieldType, TrackerSummary } from "@/lib/types";

const emptyDraft = { name: "", groupName: "Everyday", quickCaptureEnabled: true };
const fieldTypes: Array<[TrackerFieldType, string, string]> = [
  ["number", "Number", "Amounts, weight, cost"],
  ["rating", "Rating", "A score from 1 to 5"],
  ["single_select", "Choice", "Choose one option"],
  ["multi_select", "Multiple", "Choose several options"],
  ["boolean", "Yes / No", "A simple toggle"],
  ["text", "Text", "A short observation"],
];
type FieldDraft = { clientId: string; name: string; type: TrackerFieldType; options: string; required: boolean; includeInStats: boolean; unit: string; precision: string };
function newFieldDraft(type: TrackerFieldType = "number"): FieldDraft {
  return { clientId: crypto.randomUUID(), name: "", type, options: "", required: false, includeInStats: type !== "text", unit: "", precision: "0" };
}

function ago(value: string | null) {
  if (!value) return "No records yet";
  const milliseconds = Date.now() - new Date(value).getTime();
  const days = Math.floor(milliseconds / 86400000);
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(milliseconds / 3600000);
  if (hours > 0) return `${hours}h ago`;
  return `${Math.max(1, Math.floor(milliseconds / 60000))}m ago`;
}

export function TrackersView() {
  const [trackers, setTrackers] = useState<TrackerSummary[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [fieldDrafts, setFieldDrafts] = useState<FieldDraft[]>([]);
  const [fieldEditor, setFieldEditor] = useState<FieldDraft | null>(null);
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const iconPreview = useMemo(() => iconFile ? URL.createObjectURL(iconFile) : "", [iconFile]);
  useEffect(() => () => { if (iconPreview) URL.revokeObjectURL(iconPreview); }, [iconPreview]);
  const load = useCallback(async () => { setLoading(true); const response = await fetch("/api/trackers", { cache: "no-store" }); if (response.ok) setTrackers(await response.json()); else setError("Trackers are unavailable right now."); setLoading(false); }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  function chooseIcon(file: File | undefined) {
    setError("");
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { setError("The image must be smaller than 4 MB."); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Use a JPG, PNG or WebP image."); return; }
    setIconFile(file);
  }

  function startField(type: TrackerFieldType) {
    setError("");
    setFieldEditor(newFieldDraft(type));
  }

  function addFieldDraft() {
    if (!fieldEditor) return;
    if (!fieldEditor.name.trim()) { setError("Give the property a name."); return; }
    if (["single_select", "multi_select"].includes(fieldEditor.type) && !fieldEditor.options.split(/[,，]/).some((item) => item.trim())) { setError("Add at least one option for this property."); return; }
    setFieldDrafts((current) => [...current, { ...fieldEditor, name: fieldEditor.name.trim() }]);
    setFieldEditor(null);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setWorking(true); setError("");
    const response = await fetch("/api/trackers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    if (!response.ok) setError(((await response.json()) as ApiError).error);
    else {
      const tracker = await response.json() as TrackerSummary;
      const followUpErrors: string[] = [];
      if (iconFile) {
        const body = new FormData(); body.set("file", iconFile);
        const upload = await fetch(`/api/trackers/${tracker.id}/icon`, { method: "POST", body });
        if (!upload.ok) followUpErrors.push("its image could not be uploaded");
      }
      for (const [sortOrder, field] of fieldDrafts.entries()) {
        const fieldResponse = await fetch(`/api/trackers/${tracker.id}/fields`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            name: field.name, type: field.type, options: field.options.split(/[,，]/).map((item) => item.trim()).filter(Boolean), required: field.required,
            includeInStats: field.includeInStats, showAfterQuickCapture: false, unit: field.unit, precision: Number(field.precision), defaultValue: null, sortOrder,
          }),
        });
        if (!fieldResponse.ok) followUpErrors.push(`the property “${field.name}” could not be added`);
      }
      setDraft(emptyDraft); setIconFile(null); setFieldDrafts([]); setFieldEditor(null); setShowForm(false); await load();
      if (followUpErrors.length) setError(`Tracker created, but ${followUpErrors.join(" and ")}. You can finish it in Settings.`);
    }
    setWorking(false);
  }

  async function quickCapture(tracker: TrackerSummary) {
    setWorking(true); setError("");
    const response = await fetch(`/api/trackers/${tracker.id}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ occurredAt: new Date().toISOString(), values: {}, note: "" }) });
    if (!response.ok) setError(((await response.json()) as ApiError).error); else await load();
    setWorking(false);
  }

  const groups = [...new Set(trackers.map((tracker) => tracker.groupName))];
  return <div className="page tracker-page">
    <PageHeader eyebrow="LIFE" title="Trackers" action={<button className="button primary" onClick={() => setShowForm((value) => !value)}><Icon name="plus" />New Tracker</button>} />
    {showForm && <form className="editor-card tracker-create-form" onSubmit={submit}>
      <div className="editor-title"><div><span className="eyebrow">NEW TRACKER</span><h2>What do you want to notice?</h2></div><button className="text-button" type="button" onClick={() => setShowForm(false)}>Cancel</button></div>
      <div className="tracker-create-basics">
        <label className="tracker-image-picker">
          <span className="tracker-image-preview" style={iconPreview ? { backgroundImage: `url(${iconPreview})` } : undefined}>{!iconPreview && <Icon name="tracker" />}</span>
          <span><strong>{iconFile ? "Change image" : "Choose image"}</strong><small>JPG, PNG or WebP · up to 4 MB</small></span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { chooseIcon(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
        <div className="tracker-basic-fields">
          <label className="field wide"><span>Name</span><input required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Poo, Home visit, Headache…" /></label>
          <label className="field"><span>Group</span><input maxLength={60} value={draft.groupName} onChange={(event) => setDraft({ ...draft, groupName: event.target.value })} /></label>
        </div>
      </div>
      <section className="tracker-property-builder">
        <div className="tracker-builder-heading"><div><span className="eyebrow">RECORD PROPERTIES</span><h3>What should each moment include?</h3><p>Add only what will be useful later. Every record already includes its time and an optional note.</p></div><span className="tracker-property-count">{fieldDrafts.length}</span></div>
        <div className="tracker-field-type-strip" aria-label="Property types">{fieldTypes.map(([type, label, description]) => <button type="button" key={type} onClick={() => startField(type)}><strong>{label}</strong><span>{description}</span></button>)}</div>
        {fieldDrafts.length > 0 && <div className="tracker-field-drafts">{fieldDrafts.map((field) => <article key={field.clientId}><div><strong>{field.name}</strong><span>{fieldTypes.find(([type]) => type === field.type)?.[1]}{field.unit ? ` · ${field.unit}` : ""}{field.required ? " · Required" : ""}</span></div><button type="button" aria-label={`Remove ${field.name}`} onClick={() => setFieldDrafts((current) => current.filter((item) => item.clientId !== field.clientId))}><Icon name="trash" /></button></article>)}</div>}
        {fieldEditor && <div className="tracker-property-draft-form">
            <div className="form-grid"><label className="field"><span>Property name</span><input autoFocus required maxLength={60} value={fieldEditor.name} onChange={(event) => setFieldEditor({ ...fieldEditor, name: event.target.value })} placeholder={fieldEditor.type === "number" ? "Amount, Weight, Cost…" : fieldEditor.type === "rating" ? "Comfort, Energy…" : "Type, Context…"} /></label><label className="field"><span>Type</span><select value={fieldEditor.type} onChange={(event) => { const type = event.target.value as TrackerFieldType; setFieldEditor({ ...fieldEditor, type, includeInStats: type !== "text" }); }}>{fieldTypes.map(([type,label]) => <option value={type} key={type}>{label}</option>)}</select></label>
            {["single_select","multi_select"].includes(fieldEditor.type) && <label className="field wide"><span>Options <small>separated by commas</small></span><input required value={fieldEditor.options} onChange={(event) => setFieldEditor({ ...fieldEditor, options: event.target.value })} placeholder="Home, Outside, Work" /></label>}
            {fieldEditor.type === "number" && <><label className="field"><span>Unit <small>optional</small></span><input maxLength={20} value={fieldEditor.unit} onChange={(event) => setFieldEditor({ ...fieldEditor, unit: event.target.value })} placeholder="ml, kg, ¥…" /></label><label className="field"><span>Decimal places</span><input type="number" min="0" max="6" value={fieldEditor.precision} onChange={(event) => setFieldEditor({ ...fieldEditor, precision: event.target.value })} /></label></>}
            </div><div className="tracker-property-draft-actions"><div className="tracker-inline-checks"><label><input type="checkbox" checked={fieldEditor.required} onChange={(event) => setFieldEditor({ ...fieldEditor, required: event.target.checked })} />Required</label><label><input type="checkbox" checked={fieldEditor.includeInStats} onChange={(event) => setFieldEditor({ ...fieldEditor, includeInStats: event.target.checked })} />Include in Insights</label></div><div><button className="text-button" type="button" onClick={() => setFieldEditor(null)}>Cancel</button><button className="button secondary" type="button" onClick={addFieldDraft}>Add property</button></div></div>
        </div>}
        {!fieldEditor && <button className="tracker-add-property" type="button" onClick={() => startField("number")}><Icon name="plus" />Add a custom property</button>}
      </section>
      <fieldset className="tracker-capture-mode">
        <legend><span className="eyebrow">CARD + ACTION</span><strong>How should the list button record?</strong></legend>
        <label className={draft.quickCaptureEnabled ? "selected" : ""}><input type="radio" name="capture-mode" checked={draft.quickCaptureEnabled} onChange={() => setDraft({ ...draft, quickCaptureEnabled: true })} /><span><strong>Quick record</strong><small>Tap + to save the current moment immediately.</small></span></label>
        <label className={!draft.quickCaptureEnabled ? "selected" : ""}><input type="radio" name="capture-mode" checked={!draft.quickCaptureEnabled} onChange={() => setDraft({ ...draft, quickCaptureEnabled: false })} /><span><strong>Detailed record</strong><small>Tap + to open the full time, properties and note form.</small></span></label>
      </fieldset>
      {error && <p className="form-error">{error}</p>}<button className="button primary" disabled={working}>{working ? "Creating…" : "Create Tracker"}</button>
    </form>}
    {error && !showForm && <p className="form-error">{error}</p>}
    {loading ? <div className="loading-state">Opening Trackers…</div> : trackers.length ? groups.map((group) => <section className="tracker-group" key={group}>
      <div className="section-heading"><div><span className="eyebrow">GROUP</span><h2>{group}</h2></div><span>{trackers.filter((tracker) => tracker.groupName === group).length}</span></div>
      <div className="tracker-card-grid">{trackers.filter((tracker) => tracker.groupName === group).map((tracker) => <article className={`tracker-card ${tracker.stats.reminderDue ? "due" : ""}`} key={tracker.id}>
        <Link href={`/trackers/${tracker.id}`}><div className="tracker-card-head"><TrackerIcon tracker={tracker} /><div><small>MOMENT</small><h3>{tracker.name}</h3></div></div><div className="tracker-card-stats"><span><strong>{tracker.stats.today}</strong>Today</span><span><strong>{tracker.stats.month}</strong>This month</span><span><strong>{tracker.stats.total}</strong>All time</span></div><p>{tracker.stats.reminderDue ? "An interval reminder is due" : `Last recorded · ${ago(tracker.stats.lastOccurredAt)}`}</p></Link>
        {tracker.quickCaptureEnabled ? <button className="tracker-quick" disabled={working} onClick={() => void quickCapture(tracker)} aria-label={`Quick record ${tracker.name}`} title="Quick record"><Icon name="plus" /></button> : <Link className="tracker-quick" href={`/trackers/${tracker.id}?capture=detail`} aria-label={`Add a detailed record to ${tracker.name}`} title="Add detailed record"><Icon name="plus" /></Link>}
      </article>)}</div>
    </section>) : showForm ? null : <div className="empty-state"><span className="empty-icon"><Icon name="tracker" /></span><h2>Your first Tracker</h2><p>Keep a low-friction record of anything that happens more than once.</p><button className="button primary" onClick={() => setShowForm(true)}>Create one</button></div>}
  </div>;
}
