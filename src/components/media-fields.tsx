"use client";
import {useFormPreview,FormPreviewNotice} from "./form-preview";
import {ChoiceSelect} from "./choice-select";
import {SearchableSelect} from "./searchable-select";
import {ImageUploadField} from "./image-upload-field";
import {Icon} from "./icons";
import {useLocale} from "./locale-controller";
import {currentLocalDate} from "./date-time-field";
import {useId,useState} from "react";
import type {Dispatch,ReactNode,SetStateAction} from "react";
import {MAX_AVATAR_BYTES} from "@/lib/avatar";
import {shiftDate} from "@/lib/time";
import type {MediaSeries,MediaType,MediaStatus,MediaRating} from "@/lib/types";
import styles from "./media-fields.module.css";
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


export function MediaQuickDates({value,onChange}:{value:string;onChange:(date:string)=>void}) {
  const {english}=useLocale();
  const today=currentLocalDate();
  const dates=[[today,english?"Today":"今天"],[shiftDate(today,-1),english?"Yesterday":"昨天"]];
  return <div className={styles.presets} role="group" aria-label={english?"Quick dates":"快捷日期"}>
    {dates.map(([date,label])=><button key={date} type="button" data-form-change aria-pressed={value===date} onClick={()=>onChange(date)}>{label}</button>)}
  </div>;
}

export function MediaFields({draft,setDraft,coverFile,setCoverFile,series,needsCompletion=true,coverPreview}:{draft:MediaDraft;setDraft:Dispatch<SetStateAction<MediaDraft>>;coverFile:File|null;setCoverFile:Dispatch<SetStateAction<File|null>>;series:MediaSeries[];needsCompletion?:boolean;coverPreview?:ReactNode}) {
  const preview=useFormPreview();
  const {english}=useLocale();
  const [linkingSeries,setLinkingSeries]=useState(false);
  const statusLabelId=useId();
  const ratingLabelId=useId();
  const episodic=draft.mediaType==="tv"||draft.mediaType==="anime";
  const completed=draft.status==="completed";
  const seriesLabel=english?"Series / Franchise":"系列 / 母作品";
  const rating=<label className="field"><span id={ratingLabelId}>Rating</span><ChoiceSelect aria-labelledby={ratingLabelId} value={draft.rating} onChange={event=>setDraft({...draft,rating:event.target.value as MediaDraft["rating"]})}><option value="">No rating</option>{mediaRatings.map(value=><option value={value} key={value}>{value}</option>)}</ChoiceSelect></label>;
  const linkSeries=!episodic&&!draft.seriesChoice&&!linkingSeries&&
    <button className={styles.linkSeries} type="button" onClick={()=>setLinkingSeries(true)}><Icon name="plus"/>{english?"Link a series":"关联系列"}</button>;
  return <>{preview&&<FormPreviewNotice/>}<div className={`${styles.fields} field-focus-surface`}>
      <ImageUploadField className="field wide" shape="portrait" title={english?"Cover":"封面"} file={coverFile}
        thumbnail={coverPreview} hasImage={Boolean(coverFile||coverPreview)} maxBytes={MAX_AVATAR_BYTES}
        chooseLabel={english?"Choose cover":"选择封面"} replaceLabel={english?"Replace cover":"更换封面"}
        onSelect={setCoverFile} onRemove={coverFile ? () => setCoverFile(null) : undefined}
        removeLabel={english?"Clear selection":"撤销选择"}/>
      <div className={styles.pair}>
        <label className="field"><span>Original title</span><input maxLength={300} value={draft.originalTitle} onChange={event=>setDraft({...draft,originalTitle:event.target.value})}/></label>
        <label className="field"><span>Translated title</span><input maxLength={300} value={draft.translatedTitle} onChange={event=>setDraft({...draft,translatedTitle:event.target.value})}/></label>
        {!(episodic&&draft.seriesChoice)&&<small className={styles.titleHint}>{english?"Either title is enough.":"原名或译名填一个即可。"}</small>}
      </div>
      <label className="field"><span>Type</span><ChoiceSelect value={draft.mediaType} onChange={event=>{const mediaType=event.target.value as MediaType;setDraft({...draft,mediaType,...(!["tv","anime"].includes(mediaType)?{seasonNumber:"",seasonTitle:""}:{})});}}>{mediaTypes.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}</ChoiceSelect></label>
      {(episodic||draft.seriesChoice||linkingSeries)&&<div className={styles.series}>
        <div className="field"><span>{seriesLabel}</span><SearchableSelect
          value={draft.seriesChoice} label={seriesLabel}
          options={[{value:"",label:"None"},...series.map(item=>({value:String(item.id),label:item.name})),{value:"__new__",label:"Create new series…"}]}
          onValueChange={value=>setDraft({...draft,seriesChoice:value})}/>
        </div>
        {draft.seriesChoice==="__new__"&&<label className="field"><span>New series name</span><input required maxLength={200} value={draft.newSeries} onChange={event=>setDraft({...draft,newSeries:event.target.value})}/></label>}
        {episodic&&<div className={styles.pair}>
          <label className="field"><span>Season number</span><input type="number" min="1" max="999" value={draft.seasonNumber} onChange={event=>setDraft({...draft,seasonNumber:event.target.value})}/></label>
          <label className="field"><span>Season title</span><input maxLength={120} value={draft.seasonTitle} onChange={event=>setDraft({...draft,seasonTitle:event.target.value})}/></label>
        </div>}
      </div>}
      {completed&&(needsCompletion?<div className={`${styles.pair} ${styles.completion}`}>
        <div className="field">
          <label className="field"><span>Completed date</span><input required type="date" value={draft.watchedDate} onChange={event=>setDraft({...draft,watchedDate:event.target.value})}/></label>
          <MediaQuickDates value={draft.watchedDate} onChange={date=>setDraft({...draft,watchedDate:date})}/>
        </div>
        {rating}
      </div>:rating)}
      <div className={styles.pair}>
        <label className="field"><span id={statusLabelId}>Status</span><select aria-labelledby={statusLabelId} value={draft.status} onChange={event=>setDraft({...draft,status:event.target.value as MediaStatus})}>{mediaStatuses.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        {completed?linkSeries:rating}
      </div>
      {!completed&&linkSeries}
      <label className="media-favorite-toggle wide"><input type="checkbox" checked={draft.isFavorite} onChange={event=>setDraft({...draft,isFavorite:event.target.checked})}/><span><strong>Favorite</strong><small>Keep it on the Favorites shelf.</small></span></label>
      <label className="field wide"><span>Notes <small>Optional</small></span><textarea rows={4} maxLength={5000} value={draft.note} onChange={event=>setDraft({...draft,note:event.target.value})}/></label>
    </div></>;
}
