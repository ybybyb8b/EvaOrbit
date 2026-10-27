"use client";
import NextLink from "next/link";
import {useBusinessRequest} from "@/components/business-request-context";
import { useCallback, useEffect, useRef, useState, type ComponentType, type ComponentProps } from "react";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice } from "@/components/error-notice";
import { PageLoading } from "@/components/page-loading";
import { useDataRefresh } from "@/components/use-data-refresh";
import { responseError } from "@/lib/response-error";
import { dateInEvaOrbit, shiftDate } from "@/lib/time";
import { readableInsightFindings } from "@/lib/insight-review";
import type { InsightReport, InsightSnapshot } from "@/lib/insight-reports";
import type { getInsightDayReview, getInsightReportDetail } from "@/lib/services/insight-reports";
import styles from "./insights.module.css";

type DayReview = Awaited<ReturnType<typeof getInsightDayReview>>;
type Detail = Awaited<ReturnType<typeof getInsightReportDetail>>;
const stateLabels = { deleted:"已删除", waiting_records: "待补录", waiting_analysis: "待分析", completed: "已完成", data_updated: "数据已更新" };
const sourceLabels:Record<string,string> = { food:"食物",food_log:"食物记录",drink:"饮品",drink_log:"饮品记录",training:"训练",training_log:"训练记录",tracker:"观测",task:"待办",tasks:"待办",health:"健康",health_record:"健康记录",weight:"体重",periodFlow:"经期" };
const dateLabel = (date:string, year=false) => !Number.isFinite(Date.parse(date+"T12:00:00+08:00"))?"选择日期":new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",...(year?{year:"numeric"}:{}),month:"long",day:"numeric"}).format(new Date(date+"T12:00:00+08:00"));
const timestamp = (value:string) => new Date(value).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
const reviewError=(reason:unknown)=>reason instanceof Error?(/fetch|network/i.test(reason.message)?"网络连接中断，请重试。":reason.message):"暂时无法完成操作，请重试。";
const safeHref = (value:string|null) => value&&/^\/(?:food|drinks|trackers|health|tasks|insights)(?:[/?#]|$)/.test(value)&&!value.includes("\\")?value:null;

export function InsightsView({LinkComponent:Link=NextLink,initialSearch,registerRefresh}:{LinkComponent?:ComponentType<ComponentProps<"a">&{href:string}>;initialSearch?:string;registerRefresh?:(refresh:()=>Promise<unknown>)=>()=>void}={}){
 const fetch=useBusinessRequest();
 const yesterday=shiftDate(dateInEvaOrbit(),-1),[date,setDate]=useState(yesterday),[dateInput,setDateInput]=useState(yesterday);
 const[items,setItems]=useState<InsightReport[]>([]),[nextBefore,setNextBefore]=useState<string|null>(null);
 const[day,setDay]=useState<DayReview|null>(null),[detail,setDetail]=useState<Detail|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const[debug,setDebug]=useState(false),ticket=useRef(0),versionTicket=useRef(0),requestDate=useRef(yesterday);
 const invalidate=useCallback(()=>{ticket.current++;versionTicket.current++;},[]);
 const loadDate=useCallback(async(selected:string)=>{
  const request=++ticket.current;versionTicket.current++;const changedDate=requestDate.current!==selected;requestDate.current=selected;setDate(selected);setDateInput(selected);setLoading(true);setError("");if(changedDate)setMessage("");
  try{const response=await fetch(`/api/insights/review?date=${selected}`,{cache:"no-store"});if(!response.ok)throw new Error(await responseError(response,"记录暂时未能加载，请重试。"));const result=await response.json() as DayReview;if(request===ticket.current){setDay(result);setDetail(result.detail);if(result.status==="deleted"||result.status==="completed"||result.status==="waiting_records"||result.run?.inputFingerprint!==result.fingerprint)setMessage("");if(result.detail)setItems(current=>[result.detail!.report,...current.filter(item=>item.id!==result.detail!.report.id)].sort((a,b)=>b.periodStart.localeCompare(a.periodStart)));}}
  catch(reason){if(request===ticket.current){setDay(null);setDetail(null);setError(reviewError(reason));}}finally{if(request===ticket.current)setLoading(false);}
 },[fetch]);
 const loadReports=useCallback(async(before?:string)=>{
  const response=await fetch(`/api/insights?period=daily${before?`&before=${before}`:""}`,{cache:"no-store"});if(!response.ok)throw new Error(await responseError(response,"历史日期暂时无法加载。"));
  const result=await response.json() as {items:InsightReport[];nextBefore:string|null};setItems(current=>before?[...current,...result.items]:result.items);setNextBefore(result.nextBefore);return result.items;
 },[fetch]);
 useEffect(()=>{let cancelled=false;const timer=setTimeout(()=>{void(async()=>{
  try{const params=new URLSearchParams(initialSearch??window.location.search);setDebug(process.env.NODE_ENV==="development"&&params.get("debug")==="1");const reports=await loadReports();if(cancelled)return;
   const selected=params.get("report")?reports.find(item=>item.id===params.get("report")):undefined;
   if(params.get("report")&&!selected){const response=await fetch(`/api/insights/${encodeURIComponent(params.get("report")!)}`,{cache:"no-store"});if(!response.ok)throw new Error(await responseError(response,"报告无法读取。"));const result=await response.json() as Detail;if(!cancelled)await loadDate(result.report.periodStart);}
   else await loadDate(params.get("date")??selected?.periodStart??reports.find(item=>item.readingMethod==="ai")?.periodStart??reports[0]?.periodStart??shiftDate(dateInEvaOrbit(),-1));
   if(!cancelled&&params.get("report")&&params.get("version")){const response=await fetch(`/api/insights/${params.get("report")}?version=${Number(params.get("version"))}`,{cache:"no-store"});if(!response.ok)throw new Error(await responseError(response,"历史版本无法读取。"));const result=await response.json() as Detail;if(!cancelled)setDetail(result);}
  }catch(reason){if(!cancelled){setError(reviewError(reason));setLoading(false);}}
 })();},0);return()=>{cancelled=true;clearTimeout(timer);invalidate();};},[loadDate,loadReports,invalidate,fetch,initialSearch]);
 useEffect(()=>registerRefresh?.(()=>Promise.all([loadReports(),loadDate(requestDate.current)])),[registerRefresh,loadReports,loadDate]);
 useDataRefresh("/insights",async()=>{try{await Promise.all([loadReports(),loadDate(requestDate.current)]);}catch(reason){setError(reviewError(reason));}});
 async function openVersion(version:number){
  if(!detail||busy)return;const request=++versionTicket.current;setBusy(true);setError("");
  try{const response=await fetch(`/api/insights/${detail.report.id}?version=${version}`,{cache:"no-store"});if(!response.ok)throw new Error(await responseError(response,"这个版本暂时无法读取。"));const result=await response.json() as Detail;if(request===versionTicket.current)setDetail(result);}catch(reason){if(request===versionTicket.current)setError(reviewError(reason));}finally{setBusy(false);}
 }
 async function queueAnalysis(){
  if(!day||busy)return;const requestedDate=day.date;setBusy(true);setError("");
  try{const response=await fetch("/api/insights/runs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date,fingerprint:day.fingerprint})});if(!response.ok)throw new Error(await responseError(response,"未能请求复盘，请重新检查记录。"));const result=await response.json();if(day.status==="deleted"&&requestDate.current===requestedDate)await loadDate(requestedDate);setDay(current=>current?.date===requestedDate?{...current,run:result.run}:current);if(requestDate.current===requestedDate)setMessage(result.queued?"已提交，自动复盘完成后会在这里显示。":"这份复盘已是最新，无需重复生成。");}catch(reason){setError(reviewError(reason));}finally{setBusy(false);}
 }
 async function removeReport(){
  if(!detail||!day||busy||loading)return;
  const report=detail.report,selectedDate=day.date,generation=day.run?.generation??0;
  if(!window.confirm(`删除 ${dateLabel(selectedDate,true)} 的整份日报？将从列表移除全部版本、取消正在进行的分析，并停止自动重建。历史引用会保留，原始生活记录不会删除。`))return;
  setBusy(true);setError("");
  try{const response=await fetch(`/api/insights/${report.id}?version=${report.currentVersion}&generation=${generation}`,{method:"DELETE"});
   if(!response.ok){if(response.status===409&&requestDate.current===selectedDate)await loadDate(selectedDate);throw new Error(await responseError(response,"删除日报失败，请重试。"));}
   setItems(current=>current.filter(item=>item.id!==report.id));await loadReports();if(requestDate.current===selectedDate)await loadDate(selectedDate);
  }catch(reason){setError(reviewError(reason));}finally{setBusy(false);}
 }
 async function moreHistory(){setBusy(true);try{await loadReports(nextBefore!);}catch(reason){setError(reviewError(reason));}finally{setBusy(false);}}
 async function moreVersions(){if(!detail?.nextBeforeVersion)return;const reportId=detail.report.id;setBusy(true);try{const response=await fetch(`/api/insights/${detail.report.id}?beforeVersion=${detail.nextBeforeVersion}`,{cache:"no-store"});if(!response.ok)throw new Error(await responseError(response,"历史版本暂时无法加载。"));const result=await response.json();setDetail(current=>current?.report.id===reportId?{...current,versions:[...current.versions,...result.items],nextBeforeVersion:result.nextBeforeVersion}:current);}catch(reason){setError(reviewError(reason));}finally{setBusy(false);}}
 const snapshot=detail?.version.snapshot,hasNarrative=snapshot?.method==="ai",findings=snapshot?readableInsightFindings(snapshot):[];
 const historical=Boolean(detail&&detail.version.version!==(detail.report.readingVersion??detail.report.currentVersion));
 const pending=day?.status!=="completed"&&day?.run&&day.run.inputFingerprint===day.fingerprint&&["running","waiting_retry"].includes(day.run.status);
 return <div className={`page ${styles.page}`}>
  <PageHeading eyebrow="" title="洞察" translatePage={false}/>
  <div className={styles.dateBar}>
   <div><h2>{dateLabel(date,true)}</h2>{day&&!loading&&<span className={styles.status} data-status={day.status}>{stateLabels[day.status]}</span>}</div>
   <details className={styles.dates}><summary>历史日期</summary><div>
    <form onSubmit={event=>{event.preventDefault();void loadDate(dateInput);}}><label>选择日期<input type="date" value={dateInput} max={yesterday} required onChange={event=>setDateInput(event.target.value)}/></label><button className="text-button" type="submit" disabled={busy}>查看</button></form>
    <button type="button" className="text-button" onClick={()=>void loadDate(yesterday)}>查看昨天</button>
    {!!items.length&&<ul>{items.map(item=><li key={item.id}><button type="button" aria-current={item.periodStart===date?"date":undefined} onClick={()=>void loadDate(item.periodStart)}>{dateLabel(item.periodStart,true)}<span>{item.readingMethod==="ai"?"已有回顾":item.readingMethod==="rule"?"记录已整理":"等待复盘"}</span></button></li>)}</ul>}
    {nextBefore&&<button className="text-button" disabled={busy} onClick={()=>void moreHistory()}>更早的日期</button>}
    <p>目前提供每日复盘。</p>
   </div></details>
  </div>
  <ErrorNotice>{error}</ErrorNotice>{message&&<p role="status" className={styles.notice}>{message}</p>}
  {loading?<PageLoading inline title="检查当天记录" englishTitle="daily records"/>:day?<article className={styles.reader} aria-label="每日复盘" aria-busy={busy}>
   <div className={styles.meals} aria-label="午餐晚餐记录状态">{(["lunch","dinner"] as const).map(meal=><span key={meal} data-recorded={day.recording[meal]}>{meal==="lunch"?"午餐":"晚餐"}<strong>{day.recording[meal]?"已记录":"待补录"}</strong></span>)}</div>
   {day.status==="deleted"?<div className={styles.notice} role="status"><p>这份日报已删除，自动复盘不会重新创建。</p><span>原始生活记录仍保留，可手动重新生成。{!day.recording.complete&&day.recording.message}</span>{!day.recording.complete&&<p><Link href={`/food?date=${date}`}>去补充记录</Link></p>}</div>:day.status==="waiting_records"?<div className={styles.notice} role="status"><p>{day.recording.message}</p><Link href={`/food?date=${date}`}>去补充记录</Link></div>:day.status==="data_updated"?<div className={styles.notice} role="status"><p>数据已更新，需要重新分析。</p><span>下方回顾保留更新前的内容。</span></div>:day.status==="waiting_analysis"?<p className={styles.notice}>记录已就绪，等待生成当天回顾。</p>:null}
   {historical&&<p className={styles.notice}>正在阅读历史版本。<button className="text-button" onClick={()=>void loadDate(date)}>返回当前复盘</button></p>}
   <section className={styles.overview} aria-labelledby="overview-heading"><h3 id="overview-heading">{historical?"当前记录概览":"当日概览"}</h3>
    <dl>{day.overview.foodCount>0&&<div><dt>食物记录</dt><dd>{day.overview.foodCount}<small>条</small></dd></div>}{day.overview.drinkCount>0&&<div><dt>饮品记录</dt><dd>{day.overview.drinkCount}<small>条</small></dd></div>}
    {day.recording.complete&&day.overview.recordedIntakeKcal!==null&&<div><dt>已记录摄入 · 估算</dt><dd>{day.overview.recordedIntakeKcal.toLocaleString("zh-CN")}<small>kcal</small></dd></div>}
    {day.overview.trainingCount>0&&<div><dt>训练记录</dt><dd>{day.overview.trainingCount}<small>次{day.overview.trainingMinutes>0?` · ${day.overview.trainingMinutes} 分钟`:""}</small></dd></div>}
    {day.overview.trackerCount>0&&<div><dt>观测记录</dt><dd>{day.overview.trackerCount}<small>条</small></dd></div>}{day.overview.completedTasks>0&&<div><dt>完成待办</dt><dd>{day.overview.completedTasks}<small>项</small></dd></div>}</dl>
    {day.overview.unknownCalories>0&&<p className={styles.muted}>{day.overview.unknownCalories} 条记录尚无热量估算；已记录摄入不代表全天实际摄入。</p>}
    {!!day.overview.events.length&&<p className={styles.events}>{day.overview.events.map(event=>event.label).filter(Boolean).join(" · ")}</p>}
   </section>
   {day.recording.complete&&snapshot&&hasNarrative&&<>
    {!!findings.length&&<section className={styles.findings} aria-labelledby="findings-heading"><h3 id="findings-heading">值得注意</h3>{findings.map(finding=><article key={finding.id}><h4>{finding.title}</h4><p>{finding.body}</p></article>)}</section>}
    <section className={styles.recap} aria-labelledby="recap-heading"><h3 id="recap-heading">当天回顾{day.status==="data_updated"&&<small>更新前</small>}</h3>{snapshot.summary.split(/\n\s*\n|\n/).filter(Boolean).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</section>
   </>}
   {pending&&<p className={styles.muted} role="status">{day.run?.status==="running"?"正在整理当天回顾…":"已等待自动复盘，可稍后重新检查。"}</p>}
   <div className={styles.actions}><button className="text-button" disabled={busy} onClick={()=>void loadDate(date)}>重新检查记录</button>
    {day.canAnalyze&&day.status!=="completed"&&<button className="text-button" disabled={busy||Boolean(pending)} onClick={()=>void queueAnalysis()}>{day.status==="deleted"?"重新生成日报":day.status==="data_updated"?"请求重新分析":"请求当天复盘"}</button>}
   </div>
   {detail&&snapshot&&<details className={styles.more}><summary>更多信息</summary>
    <p className={styles.muted}>整理于 {timestamp(detail.version.createdAt)}。结论仅基于已保存的记录；未记录不等于未发生。</p>
    {!day.recording.complete&&hasNarrative&&<details><summary>查看此前保存的回顾</summary><p className={styles.preserved}>{snapshot.summary}</p></details>}
    <details><summary>记录来源 · {snapshot.evidence.length}</summary><ul className={styles.sources}>{snapshot.evidence.map(evidence=><li key={evidence.id}><span>{evidence.resource?sourceLabels[evidence.resource]??"生活记录":evidence.id==="food-drink-window"?"饮食统计":sourceLabels[evidence.id.replace("window-","")]??"统计依据"}{evidence.recordId?` #${evidence.recordId}`:""}</span>{safeHref(evidence.href)&&<Link href={safeHref(evidence.href)!}>打开记录</Link>}{evidence.recordId&&<SourceRecord reportId={detail.report.id} version={detail.version.version} evidenceId={evidence.id}/>}</li>)}</ul></details>
    <details><summary>统计范围与口径</summary><Coverage snapshot={snapshot}/></details>
    <details><summary>历史版本 · {detail.report.currentVersion}</summary><ol className={styles.history}>{detail.versions.map(version=><li key={version.id}><button className="text-button" type="button" disabled={busy} aria-current={detail.version.version===version.version?"true":undefined} onClick={()=>void openVersion(version.version)}>{timestamp(version.createdAt)}<span>{version.method==="ai"?"当天回顾":"记录整理"} · 第 {version.version} 版</span></button>{version.revisionNote&&<p className={styles.muted}>{version.revisionNote}</p>}</li>)}</ol>{detail.nextBeforeVersion&&<button className="text-button" disabled={busy} onClick={()=>void moreVersions()}>更早的版本</button>}</details>
    <button type="button" className="text-button" disabled={busy||loading} onClick={()=>void removeReport()}>删除这份日报</button>
    {debug&&<details><summary>开发调试数据</summary><pre>{JSON.stringify(snapshot,null,2)}</pre></details>}
   </details>}
  </article>:<p className={styles.muted}>暂时无法读取这个日期的记录。<button className="text-button" onClick={()=>void loadDate(date)}>重试</button></p>}
 </div>;
}
function Coverage({snapshot}:{snapshot:InsightSnapshot}){
 const counts=snapshot.input.metrics.counts as Record<string,{observedCount?:number;complete?:boolean}>|undefined;
 return <div className={styles.coverage}><p>当日记录按上海时间的自然日统计，变化比较使用此前 7 天和 30 天的记录。空白日期不被视为没有活动。</p>{counts&&<dl>{Object.entries(counts).filter(([,value])=>(value.observedCount??0)>0||value.complete===false).map(([source,value])=><div key={source}><dt>{sourceLabels[source]??"其他记录"}</dt><dd>当日 {value.observedCount??0} 条 · {value.complete===false?"读取达到上限，结论受限":"已读取"}</dd></div>)}</dl>}<p>热量仅为已记录食物和饮品的估算；缺餐、缺少消耗或记录不全时，不据此判断热量缺口。</p></div>;
}
function SourceRecord({reportId,version,evidenceId}:{reportId:string;version:number;evidenceId:string}){
 const[record,setRecord]=useState<Record<string,unknown>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function load(){setBusy(true);setError("");try{const response=await fetch(`/api/insights/${reportId}?version=${version}&evidence=${encodeURIComponent(evidenceId)}`,{cache:"no-store"});if(!response.ok)throw new Error(await responseError(response,"原始记录无法读取，保存的报告仍然保留。"));setRecord((await response.json()).record);}catch(reason){setError(reviewError(reason));}finally{setBusy(false);}}
 const title=record?.title??record?.name??record?.note??record?.description;
 return <div><button className="text-button" type="button" disabled={busy} onClick={()=>void load()}>{busy?"读取中…":"查看当前内容"}</button>{error&&<p role="status">{error}</p>}{record&&<p>{typeof title==="string"?title:"记录仍可访问。"}</p>}</div>;
}
