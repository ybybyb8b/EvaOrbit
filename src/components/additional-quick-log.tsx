"use client";

import {useRef,useState,type FormEvent} from "react";
import {MemoEditor,type MemoDraft} from "@/app/memo/memo-editor";
import {ChronicleEditor,type ChronicleDraft} from "@/app/chronicle/chronicle-editor";
import {TaskEditor,emptyTaskDraft,type TaskDraft} from "@/app/tasks/task-editor";
import {RelationEventEditor} from "@/app/relations/relation-event-editor";
import {FormSheet} from "./form-sheet";
import {ErrorNotice} from "./error-notice";
import {useBusinessRequest} from "./business-request-context";
import {useFormPreview,FormPreviewNotice} from "./form-preview";
import {useLocale} from "./locale-controller";
import {showActionToast} from "./action-toast";
import {parseTagInput} from "@/lib/long-term-memory";
import {parseInputTags} from "@/lib/form-input";
import {responseError} from "@/lib/response-error";
import {reconcileNativeNotifications} from "@/lib/native-bridge";
import type {RelationPerson} from "@/lib/types";
import taskStyles from "@/app/tasks/task-editor.module.css";

export type AdditionalQuickLogKind="task"|"memo"|"chronicle"|"relation";
export function isAdditionalQuickLog(kind:unknown):kind is AdditionalQuickLogKind{
  return kind==="task"||kind==="memo"||kind==="chronicle"||kind==="relation";
}

export function AdditionalQuickLog({kind,initialDate,people=[],onClose,onSaved}:{
  kind:AdditionalQuickLogKind;initialDate:string;people?:RelationPerson[];onClose:()=>void;onSaved:()=>Promise<void>;
}){
  const request=useBusinessRequest(),preview=useFormPreview(),{english}=useLocale();
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const submitting=useRef(false);
  const [task,setTask]=useState<TaskDraft>(()=>({...emptyTaskDraft,dueDate:initialDate}));
  const [memo,setMemo]=useState<MemoDraft>(()=>({title:"",content:"",type:"note",status:"active",tags:"",eventDate:initialDate,confirmedAt:"",mergedIntoId:""}));
  const [chronicle,setChronicle]=useState<ChronicleDraft>(()=>({date:initialDate,title:"",contentMd:"",source:"manual"}));
  const title=kind==="task"?(english?"New task":"新增任务"):kind==="memo"?(english?"New Memo":"新增碎片"):kind==="chronicle"?(english?"Add to Chronicle":"新增纪事"):(english?"New exchange":"新增往来");
  async function saved(){
    showActionToast(english?"Saved.":"已保存。");
    onClose();
    await onSaved();
  }
  async function submit(event:FormEvent){
    event.preventDefault();if(preview||submitting.current)return;
    submitting.current=true;setBusy(true);setError("");
    try{
      const body=kind==="task"?{...task,dueDate:task.dueDate||null,dueTime:task.dueTime||null,reminderDate:task.reminderDate||null,reminderTime:task.reminderTime||null,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"Asia/Shanghai",tags:parseInputTags(task.tags)}
        :kind==="memo"?{...memo,mergedIntoId:null,tags:parseTagInput(memo.tags),eventDate:memo.eventDate||null,confirmedAt:memo.confirmedAt||null}:chronicle;
      const response=await request(kind==="task"?"/api/tasks":kind==="memo"?"/api/memos":"/api/chronicle",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      if(!response.ok)throw new Error(await responseError(response,english?"Could not save. Try again.":"保存失败，请重试。"));
    }catch(reason){setError(reason instanceof Error?reason.message:String(reason));return;}
    finally{submitting.current=false;setBusy(false);}
    if(kind==="task")void reconcileNativeNotifications().catch(()=>{});
    await saved();
  }
  if(kind==="relation")return <FormSheet title={title} onClose={onClose} busy={busy} submitLabel={people.some(person=>!person.archivedAt)?(english?"Save exchange":"保存往来"):undefined} submitDisabled={preview}>
    {people.some(person=>!person.archivedAt)?<RelationEventEditor people={people} initialDate={initialDate} onBusy={setBusy} onSaved={()=>void saved()}/>:<p>{english?"Add a person in Relations before logging an exchange.":"请先在 Relations 添加人物，再记录往来。"}</p>}
  </FormSheet>;
  return <FormSheet title={title} onClose={onClose} formId="additional-quick-log-form" submitLabel={english?"Save":"保存"} busy={busy} submitDisabled={preview}>
    <form id="additional-quick-log-form" className={`editor-card field-focus-surface ${kind==="task"?taskStyles.editor:kind==="memo"?"long-term-editor":""}`} onSubmit={submit}>
      {preview&&<FormPreviewNotice/>}
      {kind==="task"?<TaskEditor draft={task} setDraft={setTask}/>:kind==="memo"?<MemoEditor draft={memo} onChange={setMemo} knownTags={[]}/>:<ChronicleEditor draft={chronicle} onChange={setChronicle} error={error}/>}
      {error&&kind!=="chronicle"&&<ErrorNotice>{error}</ErrorNotice>}
    </form>
  </FormSheet>;
}
