"use client";
import { useServerDataState } from "@/components/use-data-refresh";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight2, Plus } from "reicon-react";
import { PageHeading as PageHeader } from "@/components/page-heading";
import { useLocale } from "@/components/locale-controller";
import { CalendarRuleSheet, CalendarRuleSheetContent, CalendarRuleSummary } from "@/components/calendar-rule-sheet";
import type { CalendarInterpretation, CalendarRule } from "@/lib/calendar-interpretation";
import type { CalendarEvent } from "@/lib/types";

export function CalendarInterpretationView({ initialSettings, records, request = fetch, embedded = false, onAppleIntegration }: { initialSettings: CalendarInterpretation; records: CalendarEvent[]; request?: typeof fetch; embedded?: boolean; onAppleIntegration?: () => void }) {
  const { english } = useLocale(), [settings, setSettings] = useServerDataState(initialSettings), [editor, setEditor] = useState<{ rule?: CalendarRule } | null>(null);
  const RuleSheet = embedded ? CalendarRuleSheetContent : CalendarRuleSheet;
  return <div className="page settings-detail-page calendar-interpretation-page">
    <PageHeader eyebrow={english ? "CALENDAR" : "日历"} title={english ? "Calendar interpretation" : "日历解读"} description={english ? "Give title prefixes a meaning in EO. Multiple prefixes can share a category." : "为标题前缀定义 EO 含义。多个前缀可以归入同一分类。"} action={embedded ? undefined : <Link className="settings-back-link" href="/settings">{english ? "All settings" : "全部设置"}</Link>} />
    <section className="calendar-rule-directory">
      <header><h2>{english ? "Interpretation rules" : "解读规则"}</h2><button type="button" className="button secondary" onClick={() => setEditor({})}><Plus size={16} weight="Outline" aria-hidden="true" />{english ? "Add rule" : "添加规则"}</button></header>
      <p className="calendar-rule-hint">{english ? "Title prefixes only. Comments stay personal; durations come from actual event boundaries. Unmatched events remain visible in Timeline." : "只匹配标题开头。评论保持原样，时长取自实际起止时间。未匹配事项仍显示在 Timeline。"}</p>
      <div className="calendar-rule-list">{settings.rules.map(rule => <button type="button" key={rule.id} className="calendar-rule-row" aria-haspopup="dialog" onClick={() => setEditor({ rule })}><span><CalendarRuleSummary settings={settings} rule={rule} /></span><ArrowRight2 size={17} weight="Outline" aria-hidden="true" /></button>)}</div>
      {!settings.rules.length && <p>{english ? "No rules yet. Add one or define it from a Timeline event." : "还没有规则，可以在这里添加，也可以从 Timeline 事项里定义。"}</p>}
      {onAppleIntegration ? <button type="button" className="text-button section-link" onClick={onAppleIntegration}>{english ? "Manage Calendar sync sources" : "管理 Calendar 同步来源"}</button> : <Link className="section-link" href="/settings/apple-integration">{english ? "Manage Calendar sync sources" : "管理 Calendar 同步来源"}</Link>}
    </section>
    {editor && <RuleSheet request={request} settings={settings} rule={editor.rule} records={records} onClose={() => setEditor(null)} onSaved={setSettings} />}
  </div>;
}
