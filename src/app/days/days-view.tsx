"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Disclosure } from "@/components/disclosure";
import { PageLogAction } from "@/components/bottom-log-core";
import { PageHeader } from "@/components/page-header";
import { FormSheet } from "@/components/form-sheet";
import { ChoiceSelect } from "@/components/choice-select";
import { ErrorNotice } from "@/components/error-notice";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { useBusinessRequest } from "@/components/business-request-context";
import { showActionToast } from "@/components/action-toast";
import { responseError } from "@/lib/response-error";
import { clientChangeAffects, clientDataChanged, invalidateClientData } from "@/lib/client-data-cache";
import { dateInEvaOrbit } from "@/lib/time";
import { importantDateStats, importantDateCategoryColor, importantDateColors, sortImportantDates, type ImportantDate, type ImportantDateInput, type ImportantDateCategory } from "@/lib/important-dates";
import { parseImportantDate } from "@/lib/important-dates-validation";
import { FeaturedDates } from "./featured-dates";
import styles from "./days.module.css";

export function useDaysToday() {
  const [today, setToday] = useState(dateInEvaOrbit);
  useEffect(() => {
    const update = () => setToday(dateInEvaOrbit());
    const timer = window.setInterval(update, 30_000);
    window.addEventListener("focus", update); document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, []);
  return today;
}

export function DateCount({ item, today }: { item: ImportantDate; today: string }) {
  const { english } = useLocale(), stats = importantDateStats(item, today);
  const days = stats.remaining;
  return <div className={styles.count}>
    <span>{days === null ? english ? "Since" : "已经" : days === 0 ? english ? "The day is here" : "就是今天" : days > 0 ? english ? "In" : "还有" : english ? "Since" : "已经"}</span>
    <div><strong>{(days === null ? stats.elapsed : Math.abs(days)).toLocaleString(english ? "en-US" : "zh-CN")}</strong><span>{english ? "days" : "天"}</span></div>
    {item.recurrence === "yearly" && stats.elapsed > 0 && <small>{english ? `${stats.elapsed.toLocaleString("en-US")} days since · ${stats.years} year anniversary` : `已过 ${stats.elapsed.toLocaleString("zh-CN")} 天${stats.years > 0 ? ` · ${stats.years} 周年` : ""}`}</small>}
  </div>;
}

export function DaysView({ initial, local = false }: { initial?: ImportantDate[]; local?: boolean }) {
  const { english } = useLocale(), request = useBusinessRequest(), today = useDaysToday();
  const [items, setItems] = useState(initial ?? []), [loaded, setLoaded] = useState(initial !== undefined), [loading, setLoading] = useState(initial === undefined);
  const [query, setQuery] = useState(""), [category, setCategory] = useState("");
  const [editing, setEditing] = useState<ImportantDate | "new" | null>(null), [error, setError] = useState("");
  const [categoryDefinitions,setCategoryDefinitions]=useState<ImportantDateCategory[]>([]);
  const alive = useRef(true);
  const readVersion = useRef(0);
  const read = useCallback(async (signal?: AbortSignal) => {
    const [response,definitions]=await Promise.all([request("/api/important-dates", { cache: "reload", signal }),request("/api/important-dates/categories",{cache:"reload",signal}).then(async response=>response.ok ? await response.json() as ImportantDateCategory[] : null).catch(()=>null)]);
    if (!response.ok) throw new Error(await responseError(response, english ? "Could not load important dates" : "未能读取重要日子"));
    const next = await response.json() as ImportantDate[];
    if (!Array.isArray(next)) throw new Error("Invalid important dates response");
    return {items:next,categories:Array.isArray(definitions)?definitions:next.filter(item=>item.category).map(item=>({name:item.category,color:item.categoryColor??null}))};
  }, [request, english]);
  const reload = useCallback((signal?: AbortSignal) => {
    const version = ++readVersion.current;
    const current = () => alive.current && !signal?.aborted && version === readVersion.current;
    return read(signal).then(next => {
      if (current()) { setItems(next.items); setCategoryDefinitions(next.categories); setLoaded(true); setError(""); }
    }, reason => {
      if (current()) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => { if (current()) setLoading(false); });
  }, [read]);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    void reload(controller.signal);
    const refresh = () => { setLoading(true); void reload(controller.signal); };
    window.addEventListener("online", refresh); window.addEventListener("evaorbit:native-active", refresh);
    window.addEventListener("eo:days-refresh", refresh);
    const changed=(event:Event)=>{if(clientChangeAffects("/api/important-dates",event))refresh();};
    window.addEventListener(clientDataChanged,changed);
    return () => { alive.current = false; controller.abort(); window.removeEventListener("online", refresh); window.removeEventListener("evaorbit:native-active", refresh); window.removeEventListener("eo:days-refresh", refresh); window.removeEventListener(clientDataChanged,changed); };
  }, [reload]);
  const categories = [...new Set([...categoryDefinitions.map(item=>item.name),...items.map(item => item.category).filter(Boolean)])].sort();
  const matching = sortImportantDates(items.filter(item => (!category || item.category === category) && `${item.title} ${item.note} ${item.category} ${item.date}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), today, false);
  const visible = matching.filter(item => !item.archived), archivedItems = matching.filter(item => item.archived);
  function renderItems(entries: ImportantDate[]) {
    return entries.map(item => {
        const {remaining,elapsed}=importantDateStats(item,today),value=remaining===null?elapsed:Math.abs(remaining);
        return <button type="button" key={item.id} className={styles.row} onClick={() => setEditing(item)} aria-label={`${item.title} · ${english ? "View and edit" : "查看与编辑"}`}>
          <span className={styles.rowCopy}>
            <span className={styles.rowTitle}><span className="user-content" title={item.title}>{item.title}</span>{item.category&&<small className={styles.categoryBadge} style={{"--category-color":importantDateCategoryColor(item.category,item.categoryColor)} as CSSProperties}>{item.category}</small>}</span>
            <span className={styles.rowMeta}><time dateTime={item.date}>{item.date.replaceAll("-", "/")}</time>{item.recurrence==="yearly"&&<span>{english?"Yearly":"每年"}</span>}</span>
          </span>
          <span className={styles.rowCount} data-elapsed={remaining===null||remaining<0} data-large={value>=100000}><strong>{remaining===0?english?"Today":"今天":value.toLocaleString(english?"en-US":"zh-CN")}</strong>{remaining!==0&&<span>{remaining!==null&&remaining>0?english?"days to go":"天后":english?"days since":"天前"}</span>}</span>
        </button>;
    });

  }
  function saved(item: ImportantDate | null, deletedId?: number) {
    readVersion.current++; setLoading(false);
    setItems(current => item ? [...current.filter(existing => existing.id !== item.id).map(existing=>existing.category===item.category?{...existing,categoryColor:item.categoryColor}:existing), item] : current.filter(existing => existing.id !== deletedId));
    if(item?.category) setCategoryDefinitions(current=>[...current.filter(entry=>entry.name!==item.category),{name:item.category,color:item.categoryColor??null}]);
    setEditing(null); invalidateClientData(["important-dates", "notifications", "home"]);
    if (local) window.dispatchEvent(new Event("eo:days-saved"));
  }
  return <div className={`page ${styles.page}`}>
    <PageHeader eyebrow="" title={english ? "Days" : "如期"} action={<PageLogAction label={english ? "Add date" : "添加日子"} onClick={() => setEditing("new")}><Icon name="plus" />{english ? "Add date" : "添加日子"}</PageLogAction>} />
    {error && <ErrorNotice>{error}</ErrorNotice>}
    <FeaturedDates items={visible} today={today} onEdit={setEditing} />
    <div className={styles.toolbar}>
      <label className={styles.search}><Icon name="search" /><input type="search" aria-label={english ? "Search important dates" : "搜索重要日子"} placeholder={english ? "Find a day…" : "寻找一个日子……"} value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label className={styles.filter}><select aria-label={english ? "Category" : "分类"} value={category} onChange={event => setCategory(event.target.value)}><option value="">{english ? "All" : "全部分类"}</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    {local && <p className={styles.connection}>{english ? "Save while online; previously opened dates are available offline." : "联网保存，已读取的日子可离线查看。"}</p>}
    <div className={styles.list} aria-busy={loading}>
      {renderItems(visible)}
    </div>
    {!visible.length && <div className={styles.empty}>
      <Icon name="calendar" /><h2>{!loaded && loading ? english ? "Loading your days…" : "正在读取……" : query || category ? english ? "No matching dates" : "没有匹配的日子" : archivedItems.length ? english ? "No active dates" : "暂无当前日子" : english ? "Keep your first important day" : "记下第一个重要日子"}</h2>
      <p>{query || category ? english ? "Try another search or category." : "试试其他关键词或分类。" : archivedItems.length ? english ? "Your archived dates are below, with reminders paused." : "归档的日子保留在下方，并已停止提醒。" : english ? "A birthday, an anniversary, or something you look forward to." : "一个生日、一段纪念，或一件正在期待的事。"}</p>
      {!query && !category && loaded && <button type="button" className="button secondary" onClick={() => setEditing("new")}>{english ? "Add a date" : "添加日子"}</button>}
      {error && <button type="button" className="button secondary" onClick={() => { setLoading(true); void reload(); }}>{english ? "Retry" : "重新读取"}</button>}
    </div>}
    <Disclosure className={styles.archive} title={english ? "Archived" : "已归档"} trailing={archivedItems.length}>
      {archivedItems.length ? <div className={styles.list}>{renderItems(archivedItems)}</div> : <p className={styles.archiveEmpty}>{query || category ? english ? "No matching archived dates" : "没有匹配的归档日子" : english ? "No archived dates" : "暂无归档的日子"}</p>}
    </Disclosure>
    {editing && <DateEditor item={editing === "new" ? null : editing} categories={categories} categoryDefinitions={categoryDefinitions} today={today} onClose={() => setEditing(null)} onSaved={saved} />}
  </div>;
}

function DateEditor({ item, categories, categoryDefinitions, today, onClose, onSaved }: { item: ImportantDate | null; categories: string[]; categoryDefinitions:ImportantDateCategory[]; today: string; onClose: () => void; onSaved: (item: ImportantDate | null, deletedId?: number) => void }) {
  const { english } = useLocale(), request = useBusinessRequest(), id = useId();
  const original: ImportantDateInput = item ? { title: item.title, date: item.date, recurrence: item.recurrence, category: item.category, categoryColor:item.categoryColor, note: item.note, pinned: item.pinned, archived: item.archived, reminderTime: item.reminderTime, reminderDaysBefore: item.reminderDaysBefore } : { title: "", date: today, recurrence: "none", category: "", note: "", pinned: false, archived: false, reminderTime: null, reminderDaysBefore: 0 };
  const [draft, setDraft] = useState(original), [reminderEnabled, setReminderEnabled] = useState(Boolean(item?.reminderTime));
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [confirmDelete, setConfirmDelete] = useState(false);
  const [colorChanged,setColorChanged]=useState(false);
  const submitting = useRef(false);
  const categoryName=draft.category.trim();
  const selectedColor=importantDateCategoryColor(categoryName,draft.categoryColor);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original) || reminderEnabled !== Boolean(item?.reminderTime);
  function change<K extends keyof ImportantDateInput>(key: K, value: ImportantDateInput[K]) { setDraft(current => ({ ...current, [key]: value })); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      if (reminderEnabled && !draft.archived && !draft.reminderTime) throw new Error(english ? "Choose a reminder time" : "请选择提醒时间");
      const input = parseImportantDate({ ...draft, categoryColor:colorChanged ? draft.categoryColor : undefined, reminderTime: reminderEnabled ? draft.reminderTime : null });
      const response = await request(`/api/important-dates${item ? `/${item.id}` : ""}`, { method: item ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!response.ok) throw new Error(await responseError(response, english ? "Could not save the date" : "未能保存日子"));
      onSaved(await response.json()); showActionToast(english ? "Date saved" : "日子已保存");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function remove() {
    if (!item || submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const response = await request(`/api/important-dates/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response, english ? "Could not delete the date" : "未能删除日子"));
      onSaved(null, item.id); showActionToast(english ? "Date deleted" : "日子已删除");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setConfirmDelete(false); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <FormSheet title={confirmDelete ? english ? "Delete this date?" : "删除这个日子？" : item ? english ? "Edit date" : "编辑日子" : english ? "Add date" : "添加日子"} onClose={onClose} dirty={dirty} busy={busy} formId={confirmDelete ? undefined : id} submitLabel={confirmDelete ? undefined : english ? "Save date" : "保存日子"}>
    {error && <ErrorNotice>{error}</ErrorNotice>}
    {confirmDelete ? <div className={styles.deleteConfirmation}><p className="user-content">{item?.title}</p><p>{english ? "This permanently deletes the date and cancels its reminders. You can archive it to keep it instead." : "这会永久删除日子并取消提醒。若想保留记录，可以使用归档。"}</p><button type="button" className="button danger" disabled={busy} onClick={() => void remove()}>{english ? "Delete permanently" : "永久删除"}</button><button type="button" className="button secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>{english ? "Keep date" : "保留日子"}</button></div> : <form id={id} className={`editor-card ${styles.editor}`} onSubmit={save}>
      <fieldset disabled={busy}>
        <label className="field"><span>{english ? "Name" : "日子名称"}</span><input required maxLength={120} value={draft.title} placeholder={english ? "What makes this day special?" : "这个日子有什么特别之处？"} onChange={event => change("title", event.target.value)} /></label>
        <label className="field"><span>{english ? (draft.recurrence==="yearly"?"Original date":"Date") : (draft.recurrence==="yearly"?"原始日期":"日期")}</span><input type="date" required min="0100-01-01" max="9999-12-31" value={draft.date} onChange={event => change("date", event.target.value)} /></label>
        <label className="field"><span>{english ? "Repeat" : "重复"}</span><ChoiceSelect value={draft.recurrence} onChange={event => change("recurrence", event.target.value as ImportantDateInput["recurrence"])}><option value="none">{english ? "Does not repeat" : "不重复"}</option><option value="yearly">{english ? "Every year" : "每年"}</option></ChoiceSelect></label>
        {draft.recurrence === "yearly" && <p className={styles.hint}>{english ? "Keep the original year to count anniversaries. February 29 falls on February 28 in common years." : "保留最初的年份，用来计算周年和累计天数。2 月 29 日在平年按 2 月 28 日计算。"}</p>}
      {/^\d{4}-\d{2}-\d{2}$/.test(draft.date) && Number.isFinite(Date.parse(`${draft.date}T12:00:00Z`)) && <div className={styles.preview} aria-live="polite"><DateCount item={{ id:0,createdAt:"",updatedAt:"", ...item, ...draft }} today={today} /></div>}
        <label className="field"><span>{english ? "Category" : "分类"}</span><input maxLength={40} list={`${id}-categories`} value={draft.category} placeholder={english ? "Anniversaries, life, work…" : "纪念日、生活、工作……"} onChange={event => {const name=event.target.value;setColorChanged(false);setDraft(current=>({...current,category:name,categoryColor:categoryDefinitions.find(entry=>entry.name===name.trim())?.color}));}} /><datalist id={`${id}-categories`}>{[...new Set([...categories, ...(english ? ["Anniversaries", "Life", "Work"] : ["纪念日", "生活", "工作"])])].map(value => <option key={value} value={value} />)}</datalist></label>
        {categoryName&&<div className={styles.categoryColors} role="group" aria-label={english?"Category color":"分类颜色"}>
          <div className={styles.colorHeading}><span>{english?"Category color":"分类颜色"}</span><small className={styles.categoryBadge} style={{"--category-color":selectedColor} as CSSProperties}>{categoryName}</small></div>
          <div className={styles.swatches}>{importantDateColors.map((color,index)=><button type="button" key={color} aria-label={english?`Muted color ${index+1}`:`低饱和配色 ${index+1}`} aria-pressed={selectedColor.toLowerCase()===color.toLowerCase()} style={{"--category-color":color} as CSSProperties} onClick={()=>{setColorChanged(true);change("categoryColor",color);}}>{selectedColor.toLowerCase()===color.toLowerCase()?"✓":""}</button>)}<label className={styles.customColor}><span>{english?"Custom":"自选"}</span><input type="color" aria-label={english?"Custom category color":"自定义分类颜色"} value={selectedColor} onChange={event=>{setColorChanged(true);change("categoryColor",event.target.value);}} /></label></div>
          <p className={styles.hint}>{english?"Shared by every date in this category. Changes apply when you save.":"同分类日子共用此颜色，保存后一起更新。"}</p>
        </div>}
        <Disclosure title={english ? "Note (optional)" : "备注（选填）"} defaultOpen={Boolean(draft.note)}><label className="field"><span>{english ? "Note" : "备注"}</span><textarea rows={3} maxLength={2000} value={draft.note} onChange={event => change("note", event.target.value)} /></label></Disclosure>
        <label className={styles.toggle}><span>{english ? "Feature this date" : "置于顶部卡片"}</span><input type="checkbox" checked={draft.pinned} onChange={event => change("pinned", event.target.checked)} /></label>
        <p className={styles.hint}>{english?"Up to three dates appear above. Pinned dates come first; the nearest days fill the remaining places.":"顶部最多展示三个日子，手动置顶优先，其余位置按日期临近补齐。"}</p>
        <label className={styles.toggle}><span>{english ? "Remind me" : "提醒我"}</span><input type="checkbox" checked={reminderEnabled} onChange={event => setReminderEnabled(event.target.checked)} /></label>
        {reminderEnabled && !draft.archived && <div className={styles.reminderFields}><label className="field"><span>{english ? "Days before" : "提前天数"}</span><input type="number" aria-label={english?"Days before":"提前天数"} aria-describedby={`${id}-lead-hint`} required min={0} max={366} step={1} value={Number.isFinite(draft.reminderDaysBefore)?draft.reminderDaysBefore:""} onChange={event => change("reminderDaysBefore", event.target.value === "" ? NaN : Number(event.target.value))} /><small id={`${id}-lead-hint`}>{english ? "0 = on the day" : "0 表示当天"}</small></label><label className="field"><span>{english ? "Time (Shanghai)" : "提醒时间（上海）"}</span><input type="time" required value={draft.reminderTime ?? ""} onChange={event => change("reminderTime", event.target.value || null)} /></label><p className={styles.hint}>{english ? "Uses your configured Bark / Web Push channel. Past alert times are skipped; dates never become overdue tasks." : "通过已配置的 Bark／Web Push 通道发送。已过的提醒时间会跳过，日子不会变成逾期待办。"}</p></div>}
        {item && <label className={styles.toggle}><span>{english ? "Archive · pause reminders" : "归档 · 停止提醒"}</span><input type="checkbox" checked={draft.archived} onChange={event => change("archived", event.target.checked)} /></label>}
        {draft.archived&&<p className={styles.hint}>{english?"Archived dates leave the featured cards and active list. Reminders stay paused until restored.":"归档后移至页面底部，不参与顶部展示。恢复后按所填规则重新安排提醒。"}</p>}
        {item && <button type="button" className={styles.deleteAction} onClick={() => setConfirmDelete(true)}><Icon name="trash" />{english ? "Delete date" : "删除日子"}</button>}
      </fieldset>
    </form>}
  </FormSheet>;
}
