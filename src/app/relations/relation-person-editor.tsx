"use client";
import {useRelationsData} from "@/components/relations-data-context";
import {useFormPreview,FormPreviewNotice} from "@/components/form-preview";
import { ErrorNotice } from "@/components/error-notice";
import { ChoiceSelect } from "@/components/choice-select";
import { SuggestedInput } from "@/components/suggested-input";
import { ImageUploadField } from "@/components/image-upload-field";
import { useLocale } from "@/components/locale-controller";
import { MAX_AVATAR_BYTES } from "@/lib/avatar";
import { responseError } from "@/lib/response-error";

import { useState,type FormEvent } from "react";
import type { RelationPerson } from "@/lib/types";

const empty={name:"",nickname:"",relationLabel:"",closenessRank:"",relationshipStatus:"active" as const,birthday:"",likes:"",avoid:"",note:""};
export function RelationPersonEditor({editing,relationshipSuggestions=[],onSaved,onBusy}:{editing?:RelationPerson;relationshipSuggestions?:string[];onSaved:()=>void;onBusy:(value:boolean)=>void}){
  const {read}=useRelationsData();const previewOnly=useFormPreview();
  const {english}=useLocale();
  const[data,setData]=useState(()=>editing?{name:editing.name,nickname:editing.nickname??"",relationLabel:editing.relationLabel??"",closenessRank:editing.closenessRank?String(editing.closenessRank):"",relationshipStatus:editing.relationshipStatus,birthday:editing.birthday??"",likes:editing.likes??"",avoid:editing.avoid??"",note:editing.note??""}:empty);
  const[file,setFile]=useState<File|null>(null),[error,setError]=useState("");
  const [personId,setPersonId]=useState(editing?.id);
  const [photoError,setPhotoError]=useState("");
  const [uploading,setUploading]=useState(false);
  const suggestedLabels=relationshipSuggestions.filter(label=>label!==data.relationLabel.trim()&&(!data.relationLabel.trim()||label.toLocaleLowerCase().includes(data.relationLabel.trim().toLocaleLowerCase()))).slice(0,6);
  async function submit(event:FormEvent){
    event.preventDefault();
    if(previewOnly)return;
    onBusy(true);
    setError("");
    setPhotoError("");
    const failure=english?"Could not save person":"无法保存人物";
    try{
      const response=await read(personId?`/api/relations/people/${personId}`:"/api/relations/people",{
        method:personId?"PATCH":"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...data,closenessRank:data.closenessRank?Number(data.closenessRank):null}),
      });
      if(!response.ok)throw new Error(await responseError(response,failure));
      const person=await response.json() as RelationPerson;
      setPersonId(person.id);
      if(file){
        const photoFailure=english?"Person saved, but the photo could not be uploaded.":"人物已保存，照片上传失败。";
        setUploading(true);
        try{
          const form=new FormData();
          form.set("file",file);
          const photo=await read(`/api/relations/people/${person.id}/photo`,{method:"POST",body:form});
          if(!photo.ok)throw new Error(await responseError(photo,photoFailure));
        }catch(reason){
          setPhotoError(reason instanceof Error?reason.message:photoFailure);
          return;
        }finally{setUploading(false);}
      }
      onSaved();
    }catch(reason){setError(reason instanceof Error?reason.message:failure);}
    finally{onBusy(false);}
  }
  return <form className="editor-card relation-editor" onSubmit={submit}>{previewOnly&&<FormPreviewNotice/>}<div className="form-grid"><label className="field"><span>Name</span><input required value={data.name} onChange={event=>setData({...data,name:event.target.value})}/></label><label className="field"><span>Nickname</span><input value={data.nickname} onChange={event=>setData({...data,nickname:event.target.value})}/></label><div className="field relation-label-field"><span>Relationship</span><SuggestedInput suggestionLabel="关系称谓" suggestions={suggestedLabels} placeholder="Friend, colleague…" value={data.relationLabel} onValueChange={nextValue =>setData({...data,relationLabel:nextValue})}/></div><label className="field"><span>Relationship status</span><ChoiceSelect value={data.relationshipStatus} onChange={event=>setData({...data,relationshipStatus:event.target.value as "active"|"ended"})}><option value="active">Current relationship</option><option value="ended">Ended</option></ChoiceSelect></label><label className="field"><span>Closeness</span><ChoiceSelect value={data.closenessRank} onChange={event=>setData({...data,closenessRank:event.target.value})}><option value="">Not set</option><option value="5">Very close</option><option value="4">Close</option><option value="3">Regular</option><option value="2">Distant</option><option value="1">Very distant</option></ChoiceSelect></label><label className="field"><span>Birthday</span><input type="date" value={data.birthday} onChange={event=>setData({...data,birthday:event.target.value})}/></label><label className="field wide"><span>Likes</span><textarea rows={2} value={data.likes} onChange={event=>setData({...data,likes:event.target.value})}/></label><label className="field wide"><span>Avoid</span><textarea rows={2} value={data.avoid} onChange={event=>setData({...data,avoid:event.target.value})}/></label><ImageUploadField className="field wide" shape="round" icon="people" title={english?"Photo":"人物照片"}
    source={editing?.photoPath} file={file} maxBytes={MAX_AVATAR_BYTES} busy={uploading} error={photoError}
    onSelect={chosen=>{setFile(chosen);setPhotoError("");}} onRemove={file ? ()=>{setFile(null);setPhotoError("");} : undefined}
    removeLabel={english?"Clear selection":"撤销选择"}/><label className="field wide"><span>Notes</span><textarea rows={3} value={data.note} onChange={event=>setData({...data,note:event.target.value})}/></label></div>{error&&<ErrorNotice>{error}</ErrorNotice>}</form>;
}
