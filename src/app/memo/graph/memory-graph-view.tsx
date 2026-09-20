"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import type { ApiError, MemoryFact, MemoryGraphSnapshot, MemoryRecallHit } from "@/lib/types";

const epistemicLabels={direct_statement:"直接陈述",recorded_observation:"记录观察",derived:"推导",agent_judgment:"Agent 判断",external_report:"外部资料",unknown:"未标注"} as const;
const channelLabels={exact:"精确",literal:"字面",lexical:"词项",graph:"一跳"} as const;

function literal(value:unknown){if(typeof value==="string")return value;if(value===null)return "空值";return JSON.stringify(value);}
function date(value:string){const zoned=value.endsWith("Z")||/[+-]\d\d:\d\d$/.test(value)?value:`${value.replace(" ","T")}Z`;return new Intl.DateTimeFormat("zh-CN",{year:"numeric",month:"short",day:"numeric"}).format(new Date(zoned));}

export function MemoryGraphView({initial}:{initial:MemoryGraphSnapshot}){
  const[data,setData]=useState(initial),[query,setQuery]=useState(""),[hits,setHits]=useState<MemoryRecallHit[]>([]),[searching,setSearching]=useState(false),[selectedId,setSelectedId]=useState<string|null>(initial.facts.find(fact=>fact.status==="active")?.id??initial.facts[0]?.id??null),[showHistory,setShowHistory]=useState(false),[entityFilter,setEntityFilter]=useState<string|null>(null),[error,setError]=useState("");
  const entityById=useMemo(()=>new Map(data.entities.map(entity=>[entity.id,entity])),[data.entities]);
  const sourcesByFact=useMemo(()=>{const map=new Map<string,typeof data.sources>();for(const source of data.sources){const values=map.get(source.factId)??[];values.push(source);map.set(source.factId,values);}return map;},[data]);
  const facts=useMemo(()=>data.facts.filter(fact=>(showHistory||fact.status==="active")&&(!entityFilter||fact.subjectEntityId===entityFilter||fact.objectEntityId===entityFilter||fact.perspectiveEntityId===entityFilter)),[data,entityFilter,showHistory]);
  const selected=data.facts.find(fact=>fact.id===selectedId)??null,selectedSources=selected?sourcesByFact.get(selected.id)??[]:[];
  const pending=data.candidates.filter(candidate=>candidate.status==="pending");

  async function search(event:React.FormEvent){event.preventDefault();if(!query.trim()){setHits([]);return;}setSearching(true);setError("");const response=await fetch(`/api/memory-graph?q=${encodeURIComponent(query.trim())}&limit=8`);if(response.ok)setHits(await response.json());else setError(((await response.json()) as ApiError).error);setSearching(false);}
  async function review(id:string,action:"promote"|"reject"){setError("");const response=await fetch(`/api/memory-graph/candidates/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action})});if(!response.ok){setError(((await response.json()) as ApiError).error);return;}const snapshot=await fetch("/api/memory-graph");if(snapshot.ok)setData(await snapshot.json());}
  function selectFact(fact:MemoryFact){setSelectedId(fact.id);}

  return <div className="page memory-graph-page">
    <PageHeader eyebrow="MEMORY GRAPH" title="记忆如何相连" description="查看事实、来源、视角与修正路径。" action={<Link className="button secondary" href="/memo"><Icon name="memory"/>返回 Memo</Link>}/>

    <section className="memory-graph-summary" aria-label="Memory Graph 摘要">
      <span><strong>{data.entities.filter(item=>item.status==="active").length}</strong><small>活跃实体</small></span>
      <span><strong>{data.facts.filter(item=>item.status==="active").length}</strong><small>当前 Fact</small></span>
      <span><strong>{data.sources.length}</strong><small>来源链接</small></span>
      <span data-attention={pending.length>0}><strong>{pending.length}</strong><small>待审核</small></span>
    </section>

    <form className="memory-recall-bar" onSubmit={search}>
      <label className="search-box"><Icon name="search"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="试着问：姐姐喜欢什么，项目由谁维护…" aria-label="检索 Memory Graph"/></label>
      <button className="button primary" disabled={searching}>{searching?"正在召回":"召回"}</button>
    </form>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {hits.length>0&&<section className="memory-recall-results" aria-label="召回结果"><header><strong>召回路径</strong><button type="button" onClick={()=>setHits([])}>收起</button></header>{hits.map(hit=><button type="button" key={hit.fact.id} onClick={()=>selectFact(hit.fact)}><span><strong>{hit.subject.canonicalName} · {hit.fact.predicate}</strong><small>{hit.objectEntity?.canonicalName??literal(hit.fact.objectValue)}</small></span><span className="memory-channel-line">{hit.channels.map(channel=><em key={channel}>{channelLabels[channel]}</em>)}</span></button>)}</section>}

    <section className="memory-entity-rail" aria-label="实体筛选">
      <button type="button" className={!entityFilter?"active":""} onClick={()=>setEntityFilter(null)}>全部实体</button>
      {data.entities.filter(entity=>entity.status==="active").map(entity=><button type="button" className={entityFilter===entity.id?"active":""} onClick={()=>setEntityFilter(entity.id)} key={entity.id}><span>{entity.canonicalName.slice(0,1)}</span><strong>{entity.canonicalName}</strong><small>{entity.entityType}</small></button>)}
    </section>

    <div className="memory-graph-layout">
      <section className="memory-fact-stream">
        <header className="memory-section-heading"><span><strong>{entityFilter?entityById.get(entityFilter)?.canonicalName:"Fact 路径"}</strong><small>{facts.length} 条可见</small></span><label><input type="checkbox" checked={showHistory} onChange={event=>setShowHistory(event.target.checked)}/>显示历史</label></header>
        {facts.length?facts.map(fact=>{const subject=entityById.get(fact.subjectEntityId),object=fact.objectEntityId?entityById.get(fact.objectEntityId):null,replaces=fact.supersedesFactId?data.facts.find(item=>item.id===fact.supersedesFactId):null;return <button type="button" className={`memory-fact-path ${selectedId===fact.id?"selected":""}`} data-status={fact.status} onClick={()=>selectFact(fact)} key={fact.id}>
          {replaces&&<span className="memory-lineage-note">修正了 {entityById.get(replaces.subjectEntityId)?.canonicalName??"旧 Fact"} · {replaces.predicate}</span>}
          <span className="memory-node"><em>{subject?.canonicalName.slice(0,1)}</em><strong>{subject?.canonicalName??"未知实体"}</strong><small>{subject?.entityType}</small></span>
          <span className="memory-edge"><i/><strong>{fact.predicate}</strong><small>{epistemicLabels[fact.epistemicType]}</small><i/></span>
          <span className="memory-node object"><em>{object?.canonicalName.slice(0,1)??"·"}</em><strong>{object?.canonicalName??literal(fact.objectValue)}</strong><small>{object?.entityType??"literal"}</small></span>
          <span className="memory-path-meta"><em>{fact.status==="active"?"当前":"已失效"}</em><small>{sourcesByFact.get(fact.id)?.length??0} 个来源 · 重要度 {fact.importance}</small></span>
        </button>;}) : <div className="empty-state compact"><h2>这里还没有 Fact</h2><p>换一个实体，或显示历史记录。</p></div>}
      </section>

      <aside className="memory-fact-inspector" aria-live="polite">
        {selected?<><header><span className="eyebrow">FACT INSPECTOR</span><h2>{entityById.get(selected.subjectEntityId)?.canonicalName} · {selected.predicate}</h2><p>{selected.objectEntityId?entityById.get(selected.objectEntityId)?.canonicalName:literal(selected.objectValue)}</p></header>
          <dl><div><dt>认知类型</dt><dd>{epistemicLabels[selected.epistemicType]}</dd></div><div><dt>可信度</dt><dd>{Math.round(selected.confidence*100)}%</dd></div><div><dt>有效期</dt><dd>{selected.validFrom??"未限定"} 至 {selected.validTo??"现在"}</dd></div><div><dt>视角</dt><dd>{selected.perspectiveEntityId?entityById.get(selected.perspectiveEntityId)?.canonicalName:"未指定"}</dd></div></dl>
          <section><h3>来源</h3>{selectedSources.length?selectedSources.map(source=><article key={source.id}><span><strong>{source.sourceResource}</strong>{source.sourceRecordId&&<small>#{source.sourceRecordId}</small>}</span>{source.excerpt&&<p>{source.excerpt}</p>}{source.note&&<p>{source.note}</p>}{source.sourceUrl&&<a href={source.sourceUrl} target="_blank" rel="noreferrer">打开来源</a>}</article>):<p className="memory-source-missing">这是 v0.1 遗留 Fact，尚未补充来源。</p>}</section>
          <footer><time>{date(selected.updatedAt)} 更新</time><code>{selected.id.slice(0,8)}</code></footer>
        </>:<div className="empty-state compact"><h2>选择一条 Fact</h2><p>这里会显示来源、有效期与认知性质。</p></div>}
      </aside>
    </div>

    <section className="memory-candidate-section">
      <header className="memory-section-heading"><span><strong>候选记忆</strong><small>模型可以提出，但不能直接写入正式 Graph。</small></span></header>
      {pending.length?<div className="memory-candidate-list">{pending.map(candidate=>{const fact=candidate.proposedFact;return <article key={candidate.id}><div><span>{candidate.proposedBy}{candidate.proposerModel?` · ${candidate.proposerModel}`:""}</span><strong>{entityById.get(fact.subjectEntityId)?.canonicalName??"未知实体"} · {fact.predicate}</strong><p>{fact.objectEntityId?entityById.get(fact.objectEntityId)?.canonicalName:literal(fact.objectValue)}</p><small>{epistemicLabels[fact.epistemicType]} · {candidate.proposedSources.length} 个来源</small></div><span><button className="button secondary" type="button" onClick={()=>review(candidate.id,"reject")}>拒绝</button><button className="button primary" type="button" onClick={()=>review(candidate.id,"promote")}>确认进入 Graph</button></span></article>;})}</div>:<div className="memory-candidate-empty"><strong>候选区是空的</strong><p>新的自动整理结果会先停在这里，直到被确认。</p></div>}
    </section>
  </div>;
}
