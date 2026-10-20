"use client";
import {useFormPreview,FormPreviewNotice} from "./form-preview";
import {ChoiceSelect} from "./choice-select";
import {SearchableSelect} from "./searchable-select";
import {Icon} from "./icons";
import {currentLocalDate} from "./date-time-field";
import type {Dispatch,SetStateAction} from "react";
import type {MediaSeries,MediaType,MediaStatus,MediaRating} from "@/lib/types";
export const mediaTypes: Array<{ value: MediaType; label: string }> = [
  { value: "movie", label: "Movies" }, { value: "tv", label: "TV Shows" }, { value: "anime", label: "Anime" },
  { value: "documentary", label: "Documentaries" }, { value: "other", label: "Other" },
];
export const mediaStatuses: Array<{value:MediaStatus;label:string}> = [
  {value:"planned",label:"Planned"},{value:"watching",label:"Watching"},{value:"completed",label:"Completed"},{value:"paused",label:"Paused"},{value:"dropped",label:"Dropped"},
];
export const mediaRatings: MediaRating[] = ["goat", "goat+", "goat-", "dope", "dope+", "dope-", "mid", "mid+", "mid-", "nope", "nope+", "nope-", "shit", "shit+", "shit-"];

export type MediaDraft={originalTitle:string;translatedTitle:string;mediaType:MediaType;status:MediaStatus;watchedDate:string;rating:MediaRating|"";isFavorite:boolean;note:string;seriesChoice:string;newSeries:string;seasonNumber:string;seasonTitle:string};
export function emptyMediaDraft():MediaDraft{return{originalTitle:"",translatedTitle:"",mediaType:"movie",status:"completed",watchedDate:currentLocalDate(),rating:"",isFavorite:false,note:"",seriesChoice:"",newSeries:"",seasonNumber:"",seasonTitle:""};}
export function typeLabel(value:MediaType){return mediaTypes.find(item=>item.value===value)?.label??"Other";}
export function statusLabel(value:MediaStatus){return mediaStatuses.find(item=>item.value===value)?.label??value;}


export function MediaFields({draft,setDraft,coverFile,setCoverFile,series,needsCompletion=true,hasCover=false}:{draft:MediaDraft;setDraft:Dispatch<SetStateAction<MediaDraft>>;coverFile:File|null;setCoverFile:Dispatch<SetStateAction<File|null>>;series:MediaSeries[];needsCompletion?:boolean;hasCover?:boolean}){const preview=useFormPreview();return <>{preview&&<FormPreviewNotice/>}<div className="form-grid">
      <label className="media-cover-picker wide"><span className="media-cover-picker-preview">{coverFile?<span>{coverFile.name}</span>:<><Icon name="media"/><strong>{hasCover?"Replace cover":"Choose cover"}</strong><small>JPG, PNG or WebP · up to 4 MB</small></>}</span><input disabled={preview} type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>setCoverFile(event.target.files?.[0]??null)}/></label>
      <label className="field"><span>Original title <small>Optional</small></span><input maxLength={300} value={draft.originalTitle} onChange={event=>setDraft({...draft,originalTitle:event.target.value})}/></label>
      <label className="field"><span>Translated title <small>Optional</small></span><input maxLength={300} value={draft.translatedTitle} onChange={event=>setDraft({...draft,translatedTitle:event.target.value})}/></label>
      <label className="field"><span>Type</span><ChoiceSelect value={draft.mediaType} onChange={event=>{const mediaType=event.target.value as MediaType;setDraft({...draft,mediaType,...(!["tv","anime"].includes(mediaType)?{seasonNumber:"",seasonTitle:""}:{})});}}>{mediaTypes.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}</ChoiceSelect></label>
      <label className="field"><span>Status</span><ChoiceSelect value={draft.status} onChange={event=>setDraft({...draft,status:event.target.value as MediaStatus})}>{mediaStatuses.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}</ChoiceSelect></label>
      {draft.status==="completed"&&needsCompletion&&<label className="field"><span>Completed date</span><input required type="date" value={draft.watchedDate} onChange={event=>setDraft({...draft,watchedDate:event.target.value})}/></label>}
      <label className="field"><span>Rating <small>Optional</small></span><ChoiceSelect value={draft.rating} onChange={event=>setDraft({...draft,rating:event.target.value as MediaDraft["rating"]})}><option value="">No rating</option>{mediaRatings.map(value=><option value={value} key={value}>{value}</option>)}</ChoiceSelect></label>
      <div className="field wide"><span>Series / Franchise <small>{["tv","anime"].includes(draft.mediaType)?"Parent work":"Optional"}</small></span><SearchableSelect value={String(draft.seriesChoice)} label="系列 / 母作品" options={[{value:"",label:"None"}, ...series.map(item => ({value:String(item.id),label:item.name})), {value:"__new__",label:"Create new series…"}]} onValueChange={value => setDraft({...draft,seriesChoice:value})} /></div>
      {draft.seriesChoice==="__new__"&&<label className="field wide"><span>New series name</span><input required maxLength={200} value={draft.newSeries} onChange={event=>setDraft({...draft,newSeries:event.target.value})}/></label>}
      {["tv","anime"].includes(draft.mediaType)&&<><label className="field"><span>Season number <small>Optional</small></span><input type="number" min="1" max="999" value={draft.seasonNumber} onChange={event=>setDraft({...draft,seasonNumber:event.target.value})}/></label><label className="field"><span>Season title <small>Optional · leave blank for numbered seasons</small></span><input maxLength={120} placeholder="The Final Chapter" value={draft.seasonTitle} onChange={event=>setDraft({...draft,seasonTitle:event.target.value})}/></label></>}
      <label className="media-favorite-toggle wide"><input type="checkbox" checked={draft.isFavorite} onChange={event=>setDraft({...draft,isFavorite:event.target.checked})}/><span><strong>Favorite</strong><small>Keep it on the Favorites shelf.</small></span></label>
      <label className="field wide"><span>Notes <small>Optional</small></span><textarea rows={4} maxLength={5000} value={draft.note} onChange={event=>setDraft({...draft,note:event.target.value})}/></label>
    </div></>;}