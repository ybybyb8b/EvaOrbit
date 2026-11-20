"use client";
import { useState, type FormEvent } from "react";
import { FormSheet } from "@/components/form-sheet";
import { ChoiceSelect } from "@/components/choice-select";
import { SuggestedInput } from "@/components/suggested-input";
import { ErrorNotice } from "@/components/error-notice";
import { Icon } from "@/components/icons";
import { ImageUploadField } from "@/components/image-upload-field";
import { useLocale } from "@/components/locale-controller";
import { MAX_AVATAR_BYTES } from "@/lib/avatar";
import { newTrackerLocalId } from "@/lib/tracker-local-store";
import type { TrackerFieldType } from "@/lib/types";
import { TrackerCaptureToggle } from "./tracker-capture-toggle";
const emptyDraft = { name: "", groupName: "Everyday", quickCaptureEnabled: true };
const fieldTypes: Array<[TrackerFieldType, string, string]> = [
  ["time_range", "Time range", "Start, end and automatic duration"],
  ["number", "Number", "Amounts, weight, cost"],
  ["rating", "Rating", "A score from 1 to 5"],
  ["single_select", "Choice", "Choose one option"],
  ["multi_select", "Multiple", "Choose several options"],
  ["boolean", "Yes / No", "A simple toggle"],
  ["text", "Text", "A short observation"],
];
export type FieldDraft = { clientId: string; name: string; type: TrackerFieldType; options: string; required: boolean; includeInStats: boolean; unit: string; precision: string };
function newFieldDraft(type: TrackerFieldType = "number"): FieldDraft {
  return { clientId: newTrackerLocalId(), name: "", type, options: "", required: false, includeInStats: type !== "text", unit: "", precision: "0" };
}


export type TrackerCreateInput = { draft: typeof emptyDraft; iconFile: File | null; fields: FieldDraft[] };
export function TrackerCreateSheet({ groupNames, onCreate, onClose, allowImages = true,allowedFieldTypes }: { groupNames: string[]; onCreate: (input: TrackerCreateInput) => Promise<void>; onClose: () => void; allowImages?: boolean;allowedFieldTypes?:readonly TrackerFieldType[] }) {
  const {english} = useLocale();
  const [draft, setDraft] = useState(emptyDraft);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [fieldDrafts, setFieldDrafts] = useState<FieldDraft[]>([]);
  const [fieldEditor, setFieldEditor] = useState<FieldDraft | null>(null);
  const [working, setWorking] = useState(false), [error, setError] = useState("");

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
    event.preventDefault(); if (working) return;
    if (fieldEditor) { setError("Add or cancel the property before creating the Tracker."); return; }
    setWorking(true); setError("");
    try { await onCreate({ draft, iconFile, fields: fieldDrafts }); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create the Tracker. Please try again."); }
    finally { setWorking(false); }
  }
  return <FormSheet title="Create Tracker" onClose={onClose} formId="tracker-create-form" submitLabel="Create Tracker" busy={working} busyLabel="Creating…" submitDisabled={fieldEditor !== null}><form id="tracker-create-form" className="editor-card tracker-create-form" onSubmit={submit}>
      <p className="tracker-create-intro">What do you want to notice?</p>
      <div className="tracker-create-basics">
        <ImageUploadField title={allowImages ? (english ? "Tracker icon" : "Tracker 图标") : (english ? "Default icon" : "默认图标")}
          icon="tracker" file={iconFile} maxBytes={MAX_AVATAR_BYTES} disabled={!allowImages || working}
          help={!allowImages ? (english ? "Images can be changed on the Web" : "可在网页版更换图片") : undefined}
          onSelect={setIconFile} onRemove={iconFile ? () => setIconFile(null) : undefined}
          removeLabel={english ? "Use default" : "恢复默认"}/>
        <div className="tracker-basic-fields">
          <label className="field wide"><span>Name</span><input required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Poo, Home visit, Headache…" /></label>
          <div className="field"><span>Group</span><SuggestedInput recommendationStyle="search" suggestionLabel="分组" suggestions={groupNames} maxLength={60} value={draft.groupName} onValueChange={nextValue => setDraft({ ...draft, groupName: nextValue })} /></div>
        </div>
      </div>
      <section className="tracker-property-builder">
        <div className="tracker-builder-heading"><div><span className="eyebrow">RECORD PROPERTIES</span><h3>What should each moment include?</h3><p>Add only what will be useful later. Every record already includes its time and an optional note.</p></div><span className="tracker-property-count">{fieldDrafts.length}</span></div>
        <div className="tracker-field-type-strip" aria-label="Property types">{fieldTypes.filter(([type])=>!allowedFieldTypes||allowedFieldTypes.includes(type)).map(([type, label, description]) => <button type="button" key={type} onClick={() => startField(type)}><strong>{label}</strong><span>{description}</span></button>)}</div>
        {fieldDrafts.length > 0 && <div className="tracker-field-drafts">{fieldDrafts.map((field) => <article key={field.clientId}><div><strong>{field.name}</strong><span>{fieldTypes.find(([type]) => type === field.type)?.[1]}{field.unit ? ` · ${field.unit}` : ""}{field.required ? " · Required" : ""}</span></div><button type="button" data-form-change aria-label={`Remove ${field.name}`} onClick={() => setFieldDrafts((current) => current.filter((item) => item.clientId !== field.clientId))}><Icon name="trash" /></button></article>)}</div>}
        {fieldEditor && <div className="tracker-property-draft-form">
            <div className="form-grid"><label className="field"><span>Property name</span><input autoFocus required maxLength={60} value={fieldEditor.name} onChange={(event) => setFieldEditor({ ...fieldEditor, name: event.target.value })} placeholder={fieldEditor.type === "time_range" ? "Stay duration, Visit…" : fieldEditor.type === "number" ? "Amount, Weight, Cost…" : fieldEditor.type === "rating" ? "Comfort, Energy…" : "Type, Context…"} /></label><label className="field"><span>Type</span><ChoiceSelect value={fieldEditor.type} onChange={(event) => { const type = event.target.value as TrackerFieldType; setFieldEditor({ ...fieldEditor, type, includeInStats: type !== "text" }); }}>{fieldTypes.map(([type,label]) => <option value={type} key={type}>{label}</option>)}</ChoiceSelect></label>
            {["single_select","multi_select"].includes(fieldEditor.type) && <label className="field wide"><span>Options <small>separated by commas</small></span><input required value={fieldEditor.options} onChange={(event) => setFieldEditor({ ...fieldEditor, options: event.target.value })} placeholder="Home, Outside, Work" /></label>}
            {fieldEditor.type === "number" && <><label className="field"><span>Unit <small>optional</small></span><input maxLength={20} value={fieldEditor.unit} onChange={(event) => setFieldEditor({ ...fieldEditor, unit: event.target.value })} placeholder="ml, kg, ¥…" /></label><label className="field"><span>Decimal places</span><input type="number" min="0" max="6" value={fieldEditor.precision} onChange={(event) => setFieldEditor({ ...fieldEditor, precision: event.target.value })} /></label></>}
            </div><div className="tracker-property-draft-actions"><div className="tracker-inline-checks"><label><input role="switch" className="toggle-switch" type="checkbox" checked={fieldEditor.required} onChange={(event) => setFieldEditor({ ...fieldEditor, required: event.target.checked })} />Required</label><label><input role="switch" className="toggle-switch" type="checkbox" checked={fieldEditor.includeInStats} onChange={(event) => setFieldEditor({ ...fieldEditor, includeInStats: event.target.checked })} />Include in Insights</label></div><div><button className="text-button" type="button" onClick={() => setFieldEditor(null)}>Cancel</button><button className="button secondary" type="button" data-form-change onClick={addFieldDraft}>Add property</button></div></div>
        </div>}
        {!fieldEditor && <button className="tracker-add-property" type="button" onClick={() => startField("number")}><Icon name="plus" />Add a custom property</button>}
      </section>
      <TrackerCaptureToggle enabled={draft.quickCaptureEnabled} onChange={quickCaptureEnabled => setDraft({ ...draft, quickCaptureEnabled })} />
      {error && <ErrorNotice>{error}</ErrorNotice>}
    </form></FormSheet>;
}
