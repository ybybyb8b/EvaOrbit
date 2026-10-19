"use client";
import {useState} from "react";
import {ChoiceSelect} from "@/components/choice-select";
import {MarkdownMessage} from "@/components/markdown-message";
import {FormPreviewNotice,useFormPreview} from "@/components/form-preview";
import {useLocale} from "@/components/locale-controller";
import type {ChronicleEntry,ChronicleSource} from "@/lib/types";
export type ChronicleDraft=Pick<ChronicleEntry,"date"|"title"|"contentMd"|"source">;
export function ChronicleEditor({draft,onChange}:{draft:ChronicleDraft;onChange:(value:ChronicleDraft)=>void}){
  const [preview,setPreview]=useState(false),readonly=useFormPreview(),{english}=useLocale();
  return <>{readonly&&<FormPreviewNotice/>}<div className="form-grid">
    <label className="field"><span>{english?"Date":"日期"}</span><input required type="date" value={draft.date} onChange={event=>onChange({...draft,date:event.target.value})}/></label>
    <label className="field"><span>{english?"Source":"来源"}</span><ChoiceSelect value={draft.source} onChange={event=>onChange({...draft,source:event.target.value as ChronicleSource})}><option value="manual">{english?"Manual":"手动"}</option><option value="chatgpt">ChatGPT</option></ChoiceSelect></label>
    <label className="field wide"><span>{english?"Title":"标题"}</span><input required maxLength={300} value={draft.title} onChange={event=>onChange({...draft,title:event.target.value})}/></label>
    <div className="field wide"><div className="chronicle-editor-modes" role="group" aria-label={english?"Entry editor":"正文编辑器"}><button type="button" className="text-button" aria-pressed={!preview} onClick={()=>setPreview(false)}>{english?"Write":"撰写"}</button><button type="button" className="text-button" aria-pressed={preview} disabled={!draft.contentMd.trim()} onClick={()=>setPreview(true)}>{english?"Preview":"预览"}</button></div>
      <label hidden={preview}><span className="sr-only">Markdown</span><textarea aria-label="Markdown" required rows={14} maxLength={100000} value={draft.contentMd} onChange={event=>onChange({...draft,contentMd:event.target.value})} placeholder={english?"Write in Markdown…":"使用 Markdown 撰写…"}/></label>
      {preview&&<div className="chronicle-draft-preview">{draft.contentMd?<MarkdownMessage content={draft.contentMd} offlineMedia={readonly}/>:<p>{english?"Your entry will appear here.":"正文预览将显示在这里。"}</p>}</div>}
    </div>
  </div></>;
}
