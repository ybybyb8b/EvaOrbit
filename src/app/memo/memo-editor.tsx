"use client";
import type {ReactNode} from "react";
import {ChoiceSelect} from "@/components/choice-select";
import {SuggestedInput} from "@/components/suggested-input";
import {FormPreviewNotice,useFormPreview} from "@/components/form-preview";
import {memoStatusOptions,memoTypeOptions} from "@/lib/long-term-memory";
import type {MemoStatus,MemoType} from "@/lib/types";
export type MemoDraft={title:string;content:string;type:MemoType;status:MemoStatus;tags:string;eventDate:string;confirmedAt:string;mergedIntoId:string};
export function MemoEditor({draft,onChange,knownTags,mergeControl}:{draft:MemoDraft;onChange:(draft:MemoDraft)=>void;knownTags:string[];mergeControl?:ReactNode}){
 const readonly=useFormPreview();
 return <>{readonly&&<FormPreviewNotice/>}
      <div className="form-grid">
        <label className="field wide"><span>Title</span><input required maxLength={300} value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} /></label>
        <label className="field"><span>Type</span><ChoiceSelect value={draft.type} onChange={(event) => onChange({ ...draft, type: event.target.value as MemoType })}>{memoTypeOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</ChoiceSelect></label>
        <label className="field"><span>Status</span><ChoiceSelect value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value as MemoStatus })}>{memoStatusOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</ChoiceSelect></label>
        <label className="field"><span>Event date <small>Optional</small></span><input type="date" value={draft.eventDate} onChange={(event) => onChange({ ...draft, eventDate: event.target.value })} /></label>
        <label className="field"><span>Confirmed at <small>Optional</small></span><input type="datetime-local" value={draft.confirmedAt} onChange={(event) => onChange({ ...draft, confirmedAt: event.target.value })} /></label>
        {mergeControl}
        <div className="field wide"><span>Tags <small>Enter to add</small></span><SuggestedInput suggestionLabel="标签" suggestions={knownTags} tags value={draft.tags} onValueChange={nextValue => onChange({ ...draft, tags: nextValue })} placeholder="人物, 规则, 长期资料" /></div>
        <label className="field wide"><span>Content</span><textarea aria-label="Content" required rows={10} maxLength={100000} value={draft.content} onChange={(event) => onChange({ ...draft, content: event.target.value })} /></label>
      </div>
</>;
}
