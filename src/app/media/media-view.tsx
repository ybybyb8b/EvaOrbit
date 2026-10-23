"use client";
import { ErrorNotice } from "@/components/error-notice";
import { responseError } from "@/lib/response-error";
import { useRememberedState } from "@/components/use-remembered-state";
import { useServerDataState, useDataRefresh } from "@/components/use-data-refresh";
import { useUiCopyScope } from "@/components/ui-copy-scope";
import { PageLogAction } from "@/components/bottom-log-core";
import { ToastNotice } from "@/components/action-toast";

import {MediaLink as Link,useMediaData} from "@/components/media-data-context";
import {useFormPreview,FormPreviewNotice} from "@/components/form-preview";
import {MediaFields,emptyMediaDraft as emptyDraft,type MediaDraft,mediaTypes,mediaStatuses,mediaRatings,statusLabel} from "@/components/media-fields";
import { FormEvent, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { MediaCover } from "@/components/media-cover";
import { MediaPageHeader as PageHeader } from "@/components/media-data-context";
import { getMediaDisplayTitle, groupMediaCollection } from "@/lib/media-display";
import { useLocale } from "@/components/locale-controller";
import { translateUiCopy } from "@/lib/ui-copy";
import type { MediaDetail, MediaListItem, MediaRating, MediaSeries, MediaStatus, MediaType } from "@/lib/types";

export function MediaPosterCard({item}:{item:MediaListItem}){
  const copyScope=useUiCopyScope<HTMLAnchorElement>(false),display=getMediaDisplayTitle(item);
  return <Link ref={copyScope} className="media-poster-card" href={`/media/${item.id}`}>
    <MediaCover item={item} compact/>
    <span className="media-poster-copy"><strong>{display.primary}</strong><small>{display.seasonLabel&&<b className="media-season-mark">{display.seasonLabel}</b>}<span>{statusLabel(item.status)}</span>{item.rating&&<span>{item.rating}</span>}</small></span>
    {item.isFavorite&&<span className="media-favorite-mark" aria-label="Favorite">♥</span>}
  </Link>;
}
function SeriesCard({group,items}:{group:MediaSeries;items:MediaListItem[]}){
  const {language}=useLocale(),copyScope=useUiCopyScope<HTMLAnchorElement>(false);
  const previews=[...items].sort((a,b)=>Number(Boolean(b.coverUrl))-Number(Boolean(a.coverUrl))||(a.seasonNumber??9999)-(b.seasonNumber??9999)||a.id-b.id).slice(0,3);
  const complete=items.length===group.itemCount&&items.length>0;
  const noun=complete&&items.every(item=>(item.mediaType==="tv"||item.mediaType==="anime")&&item.seasonNumber!==null)?"season":complete&&items.every(item=>item.mediaType==="movie")?"movie":"item";
  const quantity=language==="en"?`${group.itemCount} ${noun}${group.itemCount===1?"":"s"}`:`${group.itemCount} ${noun==="season"?"季":noun==="movie"?"部电影":"部作品"}`;
  const status=items.some(item=>item.status==="watching")?"watching":complete&&items.every(item=>item.status===items[0].status)?items[0].status:null;
  return <Link ref={copyScope} className="media-poster-card media-series-card" href={`/media/series/${group.id}`}>
    <span className="media-series-stack" aria-hidden="true">{previews.length?previews.map(item=><MediaCover key={item.id} item={item} compact/>):<span className="media-cover media-cover-fallback"><span className="media-cover-initial">{Array.from(group.name)[0]}</span></span>}</span>
    <span className="media-poster-copy"><strong>{group.name}</strong><small><span>{quantity}</span><span>{translateUiCopy(status?statusLabel(status):"Series / Franchise",language)}</span></small></span>
  </Link>;
}

export function MediaView({initial,initialSeries,defaultSeries}:{initial:MediaListItem[];initialSeries:MediaSeries[];defaultSeries?:MediaSeries}){
  const {read}=useMediaData(),preview=useFormPreview();
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  const[series,setSeries]=useServerDataState(initialSeries),[query,setQuery]=useRememberedState(`MediaView:${defaultSeries?.id??"all"}:query`, "");
  const[mediaType,setMediaType]=useRememberedState<""|MediaType>(`MediaView:${defaultSeries?.id??"all"}:mediaType`, ""),[status,setStatus]=useRememberedState<""|MediaStatus>(`MediaView:${defaultSeries?.id??"all"}:status`, "");
  const[rating,setRating]=useRememberedState<""|MediaRating>(`MediaView:${defaultSeries?.id??"all"}:rating`, "");
  const[favoriteOnly,setFavoriteOnly]=useRememberedState(`MediaView:${defaultSeries?.id??"all"}:favoriteOnly`, false),[rewatchedOnly,setRewatchedOnly]=useRememberedState(`MediaView:${defaultSeries?.id??"all"}:rewatchedOnly`, false);
  const[loading,setLoading]=useState(false),[showForm,setShowForm]=useState(false),[draft,setDraft]=useState<MediaDraft>(emptyDraft);
  const[coverFile,setCoverFile]=useState<File|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[saving,setSaving]=useState(false);
  const[renaming,setRenaming]=useState(false),[seriesName,setSeriesName]=useState(defaultSeries?.name??"");
  const[hasMore,setHasMore]=useState(initial.length>=200);
  const filtered=Boolean(query.trim()||mediaType||status||rating||favoriteOnly||rewatchedOnly);
  const[items,setItems]=useServerDataState(initial,!filtered);
  const seriesType=initial.find(item=>["tv","anime"].includes(item.mediaType))?.mediaType??initial[0]?.mediaType??"tv";
  const addLabel=defaultSeries&&["tv","anime"].includes(seriesType)?"Add season":"Add media";

  const load=useCallback(async(offset=0)=>{request.current?.abort();const controller=new AbortController();request.current=controller;setLoading(true);const params=new URLSearchParams({limit:"200"});if(offset)params.set("offset",String(offset));if(defaultSeries)params.set("seriesId",String(defaultSeries.id));if(query.trim())params.set("q",query.trim());if(mediaType)params.set("mediaType",mediaType);if(status)params.set("status",status);if(rating)params.set("rating",rating);if(favoriteOnly)params.set("favorite","true");if(rewatchedOnly)params.set("rewatched","true");try{const response=await read(`/api/media?${params}`,{cache:"no-store",signal:controller.signal});if(!response.ok){setError(await responseError(response,"Could not load media."));return;}const next=await response.json() as MediaListItem[];setHasMore(next.length===200);setItems(current=>offset?[...current,...next.filter(item=>!current.some(row=>row.id===item.id))]:next);setError("");}catch{if(!controller.signal.aborted)setError("Could not load media.");}finally{if(request.current===controller)setLoading(false);}},[read,setItems,defaultSeries,favoriteOnly,mediaType,query,rating,rewatchedOnly,status]);
  useDataRefresh("/media", () => load());
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),140);return()=>window.clearTimeout(timer);},[load]);
  const filterCount=Number(Boolean(status))+Number(Boolean(rating))+Number(favoriteOnly)+Number(rewatchedOnly);
  const collection=useMemo(()=>!defaultSeries&&!filtered?groupMediaCollection(items,series):(defaultSeries?[...items].sort((a,b)=>(a.seasonNumber??9999)-(b.seasonNumber??9999)||a.id-b.id):items).map(item=>({kind:"item" as const,item})),[items,series,defaultSeries,filtered]);

  async function resolveSeries(){if(draft.seriesChoice!=="__new__")return draft.seriesChoice?Number(draft.seriesChoice):null;const response=await read("/api/media/series",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:draft.newSeries})});if(!response.ok)throw new Error(await responseError(response,"Could not create series."));const created=await response.json() as MediaSeries;setSeries(current=>[...current.filter(item=>item.id!==created.id),created].sort((a,b)=>a.name.localeCompare(b.name)));return created.id;}
  async function submit(event:FormEvent){event.preventDefault();if(preview||saving)return;setSaving(true);setError("");setNotice("");try{const seriesId=await resolveSeries();const response=await read("/api/media",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({originalTitle:draft.originalTitle||null,translatedTitle:draft.translatedTitle||null,mediaType:draft.mediaType,status:draft.status,watchedDate:draft.status==="completed"?draft.watchedDate:null,rating:draft.rating||null,isFavorite:draft.isFavorite,note:draft.note||null,seriesId,seasonNumber:draft.seasonNumber||null,seasonTitle:draft.seasonTitle||null})});if(!response.ok){setError(await responseError(response,"Could not save media."));return;}const created=await response.json() as MediaDetail;let coverFailed=false;if(coverFile){const body=new FormData();body.set("file",coverFile);const upload=await read(`/api/media/${created.id}/cover`,{method:"POST",body});coverFailed=!upload.ok;}setShowForm(false);setDraft(emptyDraft());setCoverFile(null);setNotice(coverFailed?"Media added, but its cover could not be uploaded.":"Media added.");await load();const seriesResponse=await read("/api/media/series",{cache:"no-store"});if(seriesResponse.ok)setSeries(await seriesResponse.json() as MediaSeries[]);}catch(reason){setError(reason instanceof Error?reason.message:"Could not save media.");}finally{setSaving(false);}}
  function clearFilters(){setQuery("");setMediaType("");setStatus("");setRating("");setFavoriteOnly(false);setRewatchedOnly(false);}

  return <div className="page media-page">
    <PageHeader eyebrow="" title={defaultSeries?(series.find(item=>item.id===defaultSeries.id)?.name??defaultSeries.name):"Media"} translatePage={!defaultSeries} action={<PageLogAction label={addLabel} className="button primary" onClick={()=>{setDraft({...emptyDraft(),...(defaultSeries?{seriesChoice:String(defaultSeries.id),mediaType:seriesType,status:"planned" as const}:{})});setCoverFile(null);setError("");setShowForm(true);}}><Icon name="plus"/>{addLabel}</PageLogAction>}/>
    {showForm&&<FormSheet title={addLabel} onClose={()=>setShowForm(false)} formId="media-record-form" submitLabel={addLabel} busy={saving} submitDisabled={preview}><form id="media-record-form" className="editor-card media-editor" onSubmit={submit}><MediaFields draft={draft} setDraft={setDraft} coverFile={coverFile} setCoverFile={setCoverFile} series={series}/>{error&&<ErrorNotice>{error}</ErrorNotice>}</form></FormSheet>}
    {renaming&&<FormSheet title="Rename series" onClose={()=>setRenaming(false)} formId="media-series-form" submitLabel="Save changes" submitDisabled={preview} busy={saving}><form id="media-series-form" onSubmit={async event=>{event.preventDefault();if(preview||saving||!defaultSeries)return;setSaving(true);setError("");try{const response=await read(`/api/media/series/${defaultSeries.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:seriesName})});if(!response.ok)throw new Error(await responseError(response,"Could not rename series."));const updated=await response.json() as MediaSeries;setSeries(current=>current.map(item=>item.id===updated.id?updated:item));setRenaming(false);setNotice("Series renamed.");await load();}catch(e){setError(e instanceof Error?e.message:"Could not rename series.");}finally{setSaving(false);}}}>{preview&&<FormPreviewNotice/>}<label className="field"><span>Series name</span><input required maxLength={200} value={seriesName} onChange={event=>setSeriesName(event.target.value)}/></label>{error&&<ErrorNotice>{error}</ErrorNotice>}</form></FormSheet>}
    {!showForm&&error&&<ErrorNotice>{error}</ErrorNotice>}{notice&&<ToastNotice message={notice} onShown={() => setNotice("")} />}
    {defaultSeries&&<button className="button secondary media-rename-action" onClick={()=>{setSeriesName(series.find(item=>item.id===defaultSeries.id)?.name??defaultSeries.name);setError("");setRenaming(true);}}><Icon name="edit"/>Rename series</button>}
    <div className="media-toolbar"><label className="search-box media-search"><Icon name="search"/><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search names, series or season…" aria-label="Search Media"/>{query&&<button type="button" onClick={()=>setQuery("")} aria-label="Clear search"><Icon name="close"/></button>}</label></div>
    {!defaultSeries&&<>
      <div className="media-filters" role="group" aria-label="Filter Media"><button aria-pressed={!mediaType} className={!mediaType?"active":""} onClick={()=>setMediaType("")}>All</button>{mediaTypes.map(item=><button aria-pressed={mediaType===item.value} className={mediaType===item.value?"active":""} onClick={()=>setMediaType(current=>current===item.value?"":item.value)} key={item.value}>{item.label}</button>)}</div>
      <details className="media-filter-panel">
        <summary><span>Filters{filterCount>0&&<b>{filterCount}</b>}</span><Icon name="chevronDown"/></summary>
        <div className="media-secondary-filters" role="group" aria-label="Additional filters">
          <label className="field"><span>Status</span><select aria-label="Filter by status" value={status} onChange={event=>setStatus(event.target.value as ""|MediaStatus)}><option value="">Any status</option>{mediaStatuses.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
          <label className="field"><span>Rating</span><select aria-label="Filter by rating" value={rating} onChange={event=>setRating(event.target.value as ""|MediaRating)}><option value="">Any rating</option>{mediaRatings.map(value=><option value={value} key={value}>{value}</option>)}</select></label>
          <label className="media-filter-check"><input type="checkbox" checked={favoriteOnly} onChange={event=>setFavoriteOnly(event.target.checked)}/>Favorites</label>
          <label className="media-filter-check"><input type="checkbox" checked={rewatchedOnly} onChange={event=>setRewatchedOnly(event.target.checked)}/>Rewatched</label>
        </div>
      </details>
    </>}
    <section className="media-results" aria-busy={loading} aria-label="Media collection">
      <div className="media-shelf-heading"><h2>{defaultSeries?"Works":filtered?"Results":"Collection"}</h2><span role="status">{loading?"Loading…":`${collection.length}${hasMore?"+":""}`}</span>{filtered&&<button className="text-button" type="button" onClick={clearFilters}>Clear filters</button>}</div>
      {collection.length?<div className="media-poster-grid">{collection.map(entry=>entry.kind==="series"?<SeriesCard key={`series-${entry.group.id}`} group={entry.group} items={entry.items}/>:<MediaPosterCard key={`item-${entry.item.id}`} item={entry.item}/>)}</div>:!loading?<div className="empty-state media-empty"><span className="empty-icon"><Icon name="media"/></span><h2>{filtered?"No matching media":"Your private shelf"}</h2><p>{filtered?"Try a different title, series, or filter.":"Add the first work you want to keep close."}</p>{!filtered&&<button className="button secondary" onClick={()=>setShowForm(true)}><Icon name="plus"/>Add Media</button>}</div>:null}
    </section>
    {hasMore&&<button className="button secondary media-more" disabled={loading} onClick={()=>void load(items.length)}>{loading?"Loading…":"Load more"}</button>}
  </div>;
}
