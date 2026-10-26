"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeading } from "@/components/page-heading";
import { ErrorNotice } from "@/components/error-notice";
import { PageLoading } from "@/components/page-loading";
import { useLocale } from "@/components/locale-controller";
import { useDataRefresh } from "@/components/use-data-refresh";
import { responseError } from "@/lib/response-error";
import { dateInEvaOrbit, shiftDate } from "@/lib/time";
import type { InsightReport, InsightVersion, InsightVersionSummary, InsightPeriodType, InsightCommand } from "@/lib/insight-reports";
import styles from "./insights.module.css";

type Detail={report:InsightReport;version:InsightVersion;versions:InsightVersionSummary[];nextBeforeVersion:number|null};
const periodLabels={daily:["日报","Daily"],monthly:["月报","Monthly"],quarterly:["季报","Quarterly"],yearly:["年报","Yearly"]};
const insightPeriodTypes=["daily","monthly","quarterly","yearly"] as const;
const domainLabels={food:["饮食","Food & Drink"],drink:["饮品","Drinks"],tracker:["观测","Trackers"],training:["训练","Training"],health:["体征","Health"],tasks:["待办","Tasks"],cross_domain:["跨领域","Cross-domain"]};
const safeHref=(value:string|null)=>value&&/^\/(?:food|drinks|trackers|health|tasks|insights)(?:[/?#]|$)/.test(value)&&!value.includes("\\")?value:null;

export function InsightsView(){
  const{english}=useLocale(),copy=(zh:string,en:string)=>english?en:zh;
  const[period,setPeriod]=useState<InsightPeriodType>("daily"),[items,setItems]=useState<InsightReport[]>([]),[nextBefore,setNextBefore]=useState<string|null>(null);
  const[detail,setDetail]=useState<Detail|null>(null),[loading,setLoading]=useState(true),[opening,setOpening]=useState(false),[saving,setSaving]=useState(false),[historyLoading,setHistoryLoading]=useState(false),[error,setError]=useState("");
  const[date,setDate]=useState(()=>shiftDate(dateInEvaOrbit(),-1)),[revisionNote,setRevisionNote]=useState("");
  const retryCommand=useRef<InsightCommand|null>(null),detailRequest=useRef(0);
  const open=useCallback(async(id:string,version?:number)=>{
    const ticket=++detailRequest.current;retryCommand.current=null;setOpening(true);setError("");
    try{
      const response=await fetch(`/api/insights/${id}${version?`?version=${version}`:""}`,{cache:"no-store"});
      if(!response.ok)throw new Error(await responseError(response,"Could not load report. Please retry."));
      const next=await response.json() as Detail;
      if(ticket===detailRequest.current){setDetail(next);setPeriod(next.report.periodType);if(next.report.periodType==="daily")setDate(next.report.periodStart);}
    }catch(reason){if(ticket===detailRequest.current)setError((reason as Error).message);}
    finally{if(ticket===detailRequest.current)setOpening(false);}
  },[]);
  const load=useCallback(async(signal?:AbortSignal)=>{
    setLoading(true);setError("");
    try{
      const response=await fetch(`/api/insights?period=${period}`,{cache:"no-store",signal});
      if(!response.ok)throw new Error(await responseError(response,"Could not load Insights. Please retry."));
      const next=await response.json() as {items:InsightReport[];nextBefore:string|null};
      if(!signal?.aborted){setItems(next.items);setNextBefore(next.nextBefore);}
    }catch(reason){if(!signal?.aborted)setError((reason as Error).message);}
    finally{if(!signal?.aborted)setLoading(false);}
  },[period]);
  useEffect(()=>{const controller=new AbortController(),timer=setTimeout(()=>void load(controller.signal),0);return()=>{clearTimeout(timer);controller.abort();};},[load]);
  useEffect(()=>{const params=new URLSearchParams(window.location.search),id=params.get("report"),version=params.get("version");const timer=setTimeout(()=>{if(id)void open(id,version?Number(version):undefined);},0);return()=>clearTimeout(timer);},[open]);
  useDataRefresh("/insights",()=>load());
  async function moreReports(){
    setLoading(true);setError("");
    try{const response=await fetch(`/api/insights?period=${period}&before=${nextBefore}`,{cache:"no-store"});if(!response.ok)throw new Error(await responseError(response,"Could not load more reports."));const next=await response.json();setItems(current=>[...current,...next.items]);setNextBefore(next.nextBefore);}
    catch(reason){setError((reason as Error).message);}finally{setLoading(false);}
  }
  async function moreVersions(){
    if(!detail?.nextBeforeVersion||historyLoading)return;setHistoryLoading(true);setError("");
    try{const id=detail.report.id;const response=await fetch(`/api/insights/${id}?beforeVersion=${detail.nextBeforeVersion}`,{cache:"no-store"});if(!response.ok)throw new Error(await responseError(response,"Could not load version history."));const next=await response.json();setDetail(current=>current?.report.id===id?({...current,versions:[...current.versions,...next.items],nextBeforeVersion:next.nextBeforeVersion}):current);}
    catch(reason){setError((reason as Error).message);}finally{setHistoryLoading(false);}
  }
  async function generate(){
    if(saving)return;setSaving(true);setError("");
    try{
      let expectedVersion=detail?.report.periodStart===date?detail.report.currentVersion:undefined;
      if(expectedVersion===undefined&&!retryCommand.current){const response=await fetch(`/api/insights?date=${date}`,{cache:"no-store"});if(!response.ok)throw new Error(await responseError(response,"Could not read current report version."));expectedVersion=((await response.json()).report as InsightReport|null)?.currentVersion??0;}
      const command=retryCommand.current??{date,expectedVersion:expectedVersion??0,requestKey:crypto.randomUUID(),revisionNote};retryCommand.current=command;
      const response=await fetch("/api/insights",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"rules",command})});
      if(!response.ok){if(response.status===409){retryCommand.current=null;await load();if(detail?.report.periodStart===date)await open(detail.report.id);}throw new Error(await responseError(response,"Could not save report. Retry the same request."));}
      const result=await response.json() as {report:InsightReport;version:InsightVersion};retryCommand.current=null;setRevisionNote("");
      await load();await open(result.report.id,result.version.version);
    }catch(reason){setError((reason as Error).message);}finally{setSaving(false);}
  }
  const snapshot=detail?.version.snapshot;
  return <div className={`page ${styles.page}`}>
    <PageHeading eyebrow="" title="Insights" translatePage={false} description={copy("从生活记录中回看变化，每一次分析都留有来处。","Patterns from your records, with evidence and a history of every analysis.")}/>
    <nav className={styles.periods} aria-label={copy("报告周期","Report period")}>{insightPeriodTypes.map(value=><button type="button" aria-pressed={period===value} disabled={saving||loading||opening} key={value} onClick={()=>{if(value===period)return;setPeriod(value);setItems([]);setNextBefore(null);setLoading(true);setDetail(null);setOpening(false);detailRequest.current++;retryCommand.current=null;}}>{periodLabels[value][english?1:0]}</button>)}</nav>
    <ErrorNotice>{error}</ErrorNotice>
    {error&&<button className="text-button" onClick={()=>void load()}>{copy("重新加载","Reload")}</button>}
    {period==="daily"&&<form className={styles.compose} onSubmit={event=>{event.preventDefault();void generate();}}>
      <label>{copy("分析日期","Day to review")}<input type="date" required max={shiftDate(dateInEvaOrbit(),-1)} value={date} disabled={saving} onChange={event=>{setDate(event.target.value);retryCommand.current=null;}}/></label>
      <label className={styles.note}>{copy("修订说明（可选）","Revision note (optional)")}<input value={revisionNote} maxLength={2000} disabled={saving} onChange={event=>{setRevisionNote(event.target.value);retryCommand.current=null;}} placeholder={copy("例如：补齐记录后重新分析","For example: records added after the first analysis")}/></label>
      <button type="submit" className="button primary" disabled={saving||loading||opening}>{saving?copy("分析并保存中…","Analyzing and saving…"):copy("分析并保存日报","Analyze and save daily report")}</button>
      <p>{copy("使用已有记录进行规则分析。重新分析会创建新版本，保留此前的内容。","Uses rules to analyze recorded data. Reanalysis creates a new version and preserves earlier content.")}</p>
    </form>}
    {period!=="daily"&&<p className={styles.muted}>{copy("此处浏览已保存报告；月度、季度与年度自动分析将在后续阶段接入。","Browse saved reports here. Monthly, quarterly and yearly analysis will be added in later phases.")}</p>}
    <div className={styles.workspace}>
      <aside className={styles.archive} aria-label={copy("历史报告","Report archive")}>
        <h2>{copy("历史报告","Report archive")}</h2>
        {loading&&!items.length?<PageLoading inline title="报告" englishTitle="reports"/>:!items.length?<p className={styles.muted}>{copy("这个周期还没有保存的报告。","No saved reports for this period yet.")}</p>:<ul>{items.map(item=><li key={item.id}><button type="button" disabled={saving} aria-current={detail?.report.id===item.id?"true":undefined} onClick={()=>{retryCommand.current=null;void open(item.id);}}><strong>{item.periodStart}</strong><span>{item.status==="no_findings"?copy("暂无特别发现","No notable findings"):copy("查看发现","View findings")} · v{item.currentVersion}</span></button></li>)}</ul>}
        {nextBefore&&<button className="text-button" disabled={loading} onClick={()=>void moreReports()}>{copy("更早的报告","Earlier reports")}</button>}
      </aside>
      <section className={styles.reader} aria-busy={opening} aria-label={copy("报告内容","Report content")}>
        {opening?<PageLoading inline title="报告详情" englishTitle="report"/>:detail&&snapshot?<>
          <header className={styles.reportHeading}><div><h2>{detail.report.periodStart}</h2><p>{periodLabels[detail.report.periodType][english?1:0]} · {detail.report.timeZone} · v{detail.version.version}{detail.version.version!==detail.report.currentVersion&&` / ${copy("当前","current")} v${detail.report.currentVersion}`}</p></div><span className={styles.source}>{snapshot.method==="rule"?copy("规则分析","Rule analysis"):copy("AI 生成","AI generated")}</span></header>
          <p className={styles.summary}>{snapshot.summary}</p>
          <p className={styles.muted}>{copy("生成时间","Generated at")} · {new Date(detail.version.createdAt).toLocaleString(english?"en-US":"zh-CN",{timeZone:"Asia/Shanghai"})}</p>
          {snapshot.revisionNote&&<p className={styles.muted}>{copy("修订说明：","Revision: ")}{snapshot.revisionNote}</p>}
          <section className={styles.findings} aria-label={copy("具体发现","Findings")}>
            {!snapshot.findings.length&&<p className={styles.muted}>{copy("这也是一份有效报告。覆盖不足和样本限制可在下方查看。","This is a valid report too. Review coverage and sample limitations below.")}</p>}
            {snapshot.findings.map(finding=><article key={finding.id}>
              <div className={styles.tags}><span>{finding.method==="rule"?copy("规则","Rule"):"AI"}</span><span>{({fact:copy("事实","Fact"),interpretation:copy("解释","Interpretation"),hypothesis:copy("待验证假设","Hypothesis")})[finding.kind]}</span><span>{domainLabels[finding.domain][english?1:0]}</span>{finding.importance==="high"&&<span>{copy("值得关注","Important")}</span>}</div>
              <h3>{finding.title}</h3><p>{finding.body}</p>
              <div className={styles.references}>{finding.evidenceIds.map(id=><a href={`#evidence-${id}`} key={id} onClick={()=>document.getElementById(`evidence-${id}`)?.closest("details")?.setAttribute("open","")}>{copy("证据","Evidence")} · {snapshot.evidence.find(item=>item.id===id)?.label??id}</a>)}</div>
              {finding.revises.map(ref=><Link key={`${ref.reportId}-${ref.version}-${ref.findingId}`} href={`/insights?report=${ref.reportId}&version=${ref.version}`} onClick={event=>{event.preventDefault();void open(ref.reportId,ref.version);}}>{copy("延续或修订此前发现","Continues or revises a previous finding")} · v{ref.version}</Link>)}
            </article>)}
          </section>
          <details className={styles.disclosure}><summary>{copy("证据与来源","Evidence and sources")} · {snapshot.evidence.length}</summary><p className={styles.muted}>{copy("生成来源","Generated by")} · {snapshot.agent}</p><ol className={styles.evidence}>{snapshot.evidence.map(item=><li id={`evidence-${item.id}`} key={`${detail.version.id}:${item.id}`}><h3>{safeHref(item.href)?<Link href={safeHref(item.href)!}>{item.label}</Link>:item.label}</h3>{item.from&&<p>{item.from} → {item.to}</p>}{item.resource&&<p>{item.resource} · {item.resourceId??item.recordId}</p>}{item.recordId&&<SourceRecord reportId={detail.report.id} version={detail.version.version} evidenceId={item.id} english={english}/>}<details><summary>{copy("查看保存的指标","Saved metrics")}</summary><pre>{JSON.stringify(item.metrics,null,2)}</pre></details></li>)}</ol></details>
          <details className={styles.disclosure}><summary>{copy("数据覆盖与限制","Coverage and limitations")}</summary><p className={styles.muted}>{copy("采集时间","Captured at")} · {snapshot.input.capturedAt}</p><ul>{snapshot.input.limitations.map((line,index)=><li key={index}>{line}</li>)}</ul><pre>{JSON.stringify(snapshot.input.coverage,null,2)}</pre><details><summary>{copy("分析输入指标","Analysis metrics")}</summary><pre>{JSON.stringify(snapshot.input.metrics,null,2)}</pre></details><p className={styles.fingerprint}>{copy("快照指纹","Snapshot fingerprint")} · {snapshot.input.fingerprint}</p></details>
          <details className={styles.disclosure}><summary>{copy("历史版本","Version history")} · {detail.report.currentVersion}</summary><ol className={styles.history}>{detail.versions.map(version=><li key={version.id}><button type="button" className="text-button" aria-current={version.version===detail.version.version?"true":undefined} onClick={()=>void open(detail.report.id,version.version)}>v{version.version} · {version.method==="rule"?copy("规则","Rule"):"AI"} · {new Date(version.createdAt).toLocaleString(english?"en-US":"zh-CN",{timeZone:"Asia/Shanghai"})}</button>{version.revisionNote&&<p>{version.revisionNote}</p>}</li>)}</ol>{detail.nextBeforeVersion&&<button className="text-button" disabled={historyLoading} onClick={()=>void moreVersions()}>{copy("更早的版本","Earlier versions")}</button>}</details>
        </>:<div className={styles.empty}><h2>{copy("回看生活里值得留意的变化","Notice what has been changing")}</h2><p>{copy("选择一份历史报告，或分析一个已经结束的日期。证据、覆盖情况和每次修订会一起保存。","Select a saved report, or analyze a completed day. Evidence, coverage and each revision stay together.")}</p></div>}
      </section>
    </div>
  </div>;
}

function SourceRecord({reportId,version,evidenceId,english}:{reportId:string;version:number;evidenceId:string;english:boolean}){
  const[record,setRecord]=useState<Record<string,unknown>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function load(){setBusy(true);setError("");try{const response=await fetch(`/api/insights/${reportId}?version=${version}&evidence=${encodeURIComponent(evidenceId)}`,{cache:"no-store"});if(!response.ok)throw new Error(await responseError(response,"Original record is unavailable. The saved evidence is preserved."));setRecord((await response.json()).record);}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}
  const title=record?.title??record?.name??record?.note??record?.summary;
  return <div><button type="button" className="text-button" disabled={busy} onClick={()=>void load()}>{busy?(english?"Loading…":"读取中…"):(english?"View original record":"查看原始记录")}</button>{error&&<p role="status">{error}</p>}{record&&<><p>{typeof title==="string"?title:""}</p><details><summary>{english?"Current record · may have changed since analysis":"当前记录内容 · 可能已在分析后修改"}</summary><pre>{JSON.stringify(record,null,2)}</pre></details></>}</div>;
}
