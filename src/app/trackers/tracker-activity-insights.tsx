"use client";
import { useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft2, ArrowRight2 } from "reicon-react";
import { SearchableSelect } from "@/components/searchable-select";
import { useLocale } from "@/components/locale-controller";
import { translateUiCopy } from "@/lib/ui-copy";
import { buildTrackerInsights, trackerInsightEntries, shiftTrackerMonth, trackerCalendarMonth, trackerHeatLevel, type TrackerInsightPeriod } from "@/lib/tracker-insights";
import type { TrackerField, TrackerInsights } from "@/lib/types";
import type { TrackerTimelineEntry } from "./tracker-timeline-records";
function elapsed(value:string|null,english:boolean){if(!value)return english?"No records yet":"暂无记录";const difference=Math.max(0,Date.now()-new Date(value).getTime());const days=Math.floor(difference/86400000);if(days)return english?`${days}d ago`:`${days} 天前`;const hours=Math.floor(difference/3600000);if(hours)return english?`${hours}h ago`:`${hours} 小时前`;return english?"Just now":"刚刚";}
export function TrackerActivityInsights({ entries, fields, historyInsights, total=entries.length, lastOccurredAt, archived=false, working=false, insightPeriod, onPeriodChange:setInsightPeriod, onCapture, onSelectChart, children }: { entries: TrackerTimelineEntry[]; fields:TrackerField[]; historyInsights?:TrackerInsights; total?:number; lastOccurredAt:string|null; archived?:boolean; working?:boolean; insightPeriod:TrackerInsightPeriod; onPeriodChange:(period:TrackerInsightPeriod)=>void; onCapture:()=>void; onSelectChart:(kind:"monthly"|"weekdays"|"dayParts",key:string,label:string)=>void; children?:ReactNode }) {
 const {english,language}=useLocale(); const copy=(value:string)=>translateUiCopy(value,language);
 const periodEntries=trackerInsightEntries(entries,insightPeriod);
 const insights=buildTrackerInsights(periodEntries,fields,new Date(),insightPeriod==="year"?13:12);
 const detail={fields,insights:historyInsights??buildTrackerInsights(entries,fields)};
 const stats={total,lastOccurredAt};
 const periodLabelText=english?{month:"This month","90d":"Last 90 days",year:"Last 365 days"}[insightPeriod]:{month:"本月","90d":"最近 90 天",year:"最近一年"}[insightPeriod];
 return <>
      <header className="tracker-insights-heading"><h2>{english?"Your activity":"记录概览"}</h2><SearchableSelect label={english?"Statistics period":"统计周期"} presentation="dropdown" searchable={false} value={insightPeriod} onValueChange={value=>setInsightPeriod(value as TrackerInsightPeriod)} options={(["month","90d","year"] as const).map(value=>({value,label:english?{month:"This month","90d":"Last 90 days",year:"Last 365 days"}[value]:{month:"本月","90d":"最近 90 天",year:"最近一年"}[value]}))}/></header>
      <p className="tracker-insights-summary" role="status">{english?`${periodLabelText}: ${periodEntries.length} records across ${insights.activeDays} active days.`:`${periodLabelText}共 ${periodEntries.length} 条记录，分布在 ${insights.activeDays} 天。`} <span>{english?"Last recorded":"最近记录"} · {elapsed(stats.lastOccurredAt,english)}</span></p>
      {children}
      {stats.total===0?<div className="empty-state"><h2>{english?"Start with one record":"从第一条记录开始"}</h2><p>{english?"Record an event to see your activity and property summaries here.":"记下发生过的事，之后就能在这里回看活跃日期和属性统计。"}</p>{!archived&&<button className="button primary" disabled={working} onClick={onCapture}>{english?"Add first record":"记录第一条"}</button>}</div>:<>
      <section className="tracker-insight-card"><div className="section-heading"><h2>{english?"Monthly activity":"月度热力图"}</h2></div><TrackerHeatmap insights={detail.insights}/><p className="tracker-chart-caption">{english?"Calendar shows the last year. Color represents records per day; charts below use the selected period.":"日历展示近一年；色阶代表每日次数。下方图表使用所选统计周期。"}</p></section>
      {periodEntries.length===0?<p className="empty-state compact-empty">{english?"No records in this period. Try a wider range.":"这个周期暂无记录，试试扩大统计范围。"}</p>:<>
      <div className="tracker-insight-grid">
        {insightPeriod!=="month"&&<section className="tracker-insight-card"><div className="section-heading"><h2>{english?"By month":"月度分布"}</h2></div><BarChart items={insights.monthly.filter(item=>insightPeriod==="year"||item.count>0)} onSelect={(key,label)=>onSelectChart("monthly",key,label)}/></section>}
        <section className="tracker-insight-card"><div className="section-heading"><h2>{english?"By weekday":"星期分布"}</h2></div><BarChart items={insights.weekdays} onSelect={(key,label)=>onSelectChart("weekdays",key,label)}/></section>
        <section className="tracker-insight-card"><div className="section-heading"><h2>{english?"By time of day":"时段分布"}</h2></div><BarChart items={insights.dayParts} onSelect={(key,label)=>onSelectChart("dayParts",key,label)}/></section>
      </div>
      {(insights.numericFields.length>0||insights.choiceFields.length>0)&&<section className="tracker-detail-section"><div className="section-heading"><h2>{english?"Property summaries":"属性统计"}</h2></div><div className="tracker-property-insights">
        {insights.numericFields.map((field)=><article className="metric" key={field.fieldKey}><span>{copy(field.name)}</span><strong>{field.average}{field.unit&&` ${field.unit}`}</strong><small>{english?`Average · ${field.minimum}-${field.maximum} · latest ${field.latest}`:`平均值 · ${field.minimum}-${field.maximum} · 最近 ${field.latest}`}</small></article>)}
        {insights.choiceFields.map((field)=>{const total=field.values.reduce((sum,value)=>sum+value.count,0);return <article className="choice" key={field.fieldKey}><header><strong>{copy(field.name)}</strong><span>{english?`${total} record${total===1?"":"s"}`:`${total} 条记录`}</span></header><div role="list">{field.values.map((value)=>{const label=copy(value.label);return <p role="listitem" aria-label={english?`${label}: ${value.count} records`:`${label}：${value.count} 条记录`} data-zero={value.count===0} key={value.key}><span>{label}</span><i aria-hidden="true"><b style={{width:`${value.percentage}%`}}/></i><strong>{value.count}</strong></p>;})}</div></article>;})}
      </div></section>}
      </>}</>}
    </>;
}
function TrackerHeatmap({insights}:{insights:TrackerInsights}) {
  const {english}=useLocale();
  const latestDate=insights.heatmap.at(-1)?.date??new Date().toISOString().slice(0,10);
  const latestMonth=latestDate.slice(0,7),earliestMonth=(insights.heatmap[0]?.date??latestDate).slice(0,7);
  const [month,setMonth]=useState(latestMonth);
  const calendar=trackerCalendarMonth(insights.heatmap,month,latestDate);
  const locale=english?"en-US":"zh-CN";
  const monthLabel=new Intl.DateTimeFormat(locale,{year:"numeric",month:"long",timeZone:"UTC"}).format(new Date(`${month}-15T12:00:00Z`));
  const weekdays=english?["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]:["一","二","三","四","五","六","日"];
  const summary=english?`${calendar.activeDays} active days · ${calendar.totalRecords} records`:`${calendar.activeDays} 个活跃日 · ${calendar.totalRecords} 条记录`;
  return <div className="tracker-heatmap-calendar">
    <header className="tracker-heatmap-toolbar"><div><strong>{monthLabel}</strong><span>{summary}</span></div><div>{month!==latestMonth&&<button type="button" onClick={()=>setMonth(latestMonth)}>{english?"This month":"本月"}</button>}<button type="button" aria-label={english?"Previous month":"上个月"} disabled={month<=earliestMonth} onClick={()=>setMonth(value=>shiftTrackerMonth(value,-1))}><ArrowLeft2 size={16} weight="Outline" aria-hidden="true"/></button><button type="button" aria-label={english?"Next month":"下个月"} disabled={month>=latestMonth} onClick={()=>setMonth(value=>shiftTrackerMonth(value,1))}><ArrowRight2 size={16} weight="Outline" aria-hidden="true"/></button></div></header>
    <div className="tracker-heatmap-weekdays" aria-hidden="true">{weekdays.map(day=><span key={day}>{day}</span>)}</div>
    <div className="tracker-heatmap" role="list" aria-label={english?`${monthLabel} activity calendar`:`${monthLabel}活动日历`}>{Array.from({length:calendar.leadingDays},(_,index)=><i className="blank" key={`blank-${index}`} aria-hidden="true"/>)}{calendar.days.map(day=>{const label=!day.available?(day.date>latestDate?(english?`${day.date}, future date`:`${day.date}，未来日期`):(english?`${day.date}, outside available history`:`${day.date}，超出可用历史范围`)):(english?`${day.date}, ${day.count} record${day.count===1?"":"s"}`:`${day.date}，${day.count} 条记录`);return <span role="listitem" tabIndex={day.available?0:undefined} className={`tracker-heatmap-cell level-${trackerHeatLevel(day.count)}`} data-today={day.date===latestDate} data-unavailable={!day.available} title={label} aria-label={label} key={day.date}><strong>{Number(day.date.slice(-2))}</strong>{day.available&&day.count>1&&<small>{english?`${day.count}×`:`${day.count}次`}</small>}</span>;})}</div>
    <div className="tracker-heatmap-legend" aria-label={english?"Records per day":"每日记录次数"}><span>{english?"Records":"次数"}</span>{[0,1,2,3,4].map(level=><span key={level}><i className={`level-${level}`}/><small>{level===4?"4+":level}</small></span>)}</div>
  </div>;
}

function BarChart({items,onSelect}:{items:TrackerInsights["monthly"];onSelect:(key:string,label:string)=>void}) {
  const {english}=useLocale();
  const maximum=Math.max(1,...items.map((item)=>item.count));
  const labelFor=(item:TrackerInsights["monthly"][number])=>{
    if(/^\d{4}-\d{2}$/.test(item.key))return new Intl.DateTimeFormat(english?"en-US":"zh-CN",{month:"short",timeZone:"UTC"}).format(new Date(`${item.key}-15T12:00:00Z`));
    return english?item.label:({"0":"日","1":"一","2":"二","3":"三","4":"四","5":"五","6":"六",morning:"早晨",afternoon:"下午",evening:"晚间",night:"深夜"} as Record<string,string>)[item.key]??item.label;
  };
  return <div className="tracker-bars" role="list">{items.map((item)=>{const height=item.count?Math.max(8,item.count/maximum*82):0;return <div role="listitem" aria-label={english?`${labelFor(item)}: ${item.count} records`:`${labelFor(item)}：${item.count} 条记录`} key={item.key}><button type="button" className="tracker-bar-plot" onClick={()=>onSelect(item.key,labelFor(item))} aria-label={english?`View ${item.count} records for ${labelFor(item)}`:`查看${labelFor(item)}的 ${item.count} 条记录`} style={{"--bar-height":`${height}%`} as CSSProperties} title={english?`${labelFor(item)}: ${item.count} records`:`${labelFor(item)}：${item.count} 条记录`} tabIndex={0}>{item.count>0&&<strong>{item.count}</strong>}<span aria-hidden="true"/></button><small>{labelFor(item)}</small></div>;})}</div>;
}
