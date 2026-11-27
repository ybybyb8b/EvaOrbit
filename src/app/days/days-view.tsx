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
import { importantDateDateLabel, importantDateDisplay, importantDateStats, importantDateCategoryColor, sortImportantDates, type ImportantDate, type ImportantDateInput, type ImportantDateCategory } from "@/lib/important-dates";
import { parseImportantDate } from "@/lib/important-dates-validation";
import { CategoryField } from "./category-field";
import { BackgroundField } from "./background-field";
import { DatePreview } from "./date-preview";
import { DateBackground } from "./date-background";
import { DateCalendarFields } from "./date-calendar-fields";
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
  const display=importantDateDisplay(item,today,english);
  return <div className={styles.count}>

    <div><strong>{display.text}</strong><span>{display.unit}</span></div>
    {item.recurrence!=="none"&&<small>{stats.next?(english?`Next: ${stats.next.replaceAll("-","/")}`:`下一次：${stats.next.replaceAll("-","/")}`):(english?"No next occurrence within the supported range; reminders are paused.":"支持范围内暂无下一次日期，不会安排提醒。")}</small>}
    {item.recurrence === "yearly" && stats.elapsed > 0 && !display.ordinal && <small>{english ? `${stats.elapsed.toLocaleString("en-US")} days since · ${stats.years} year anniversary` : `已过 ${stats.elapsed.toLocaleString("zh-CN")} 天${stats.years > 0 ? ` · ${stats.years} 周年` : ""}`}</small>}
  </div>;
}

export function DaysView({ initial, local = false }: { initial?: ImportantDate[]; local?: boolean }) {
  const { english } = useLocale(), request = useBusinessRequest(), today = useDaysToday();
  const [items, setItems] = useState(initial ?? []), [loaded, setLoaded] = useState(initial !== undefined), [loading, setLoading] = useState(initial === undefined);
  const [query, setQuery] = useState(""), [category, setCategory] = useState("");
  const [editing, setEditing] = useState<ImportantDate | "new" | null>(null), [error, setError] = useState("");
  const [preview,setPreview]=useState<{item:ImportantDate;rect:DOMRect}|null>(null);
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
        const display=importantDateDisplay(item,today,english),value=display.value;
        return <button type="button" key={item.id} className={styles.row} onClick={event => setPreview({item,rect:event.currentTarget.getBoundingClientRect()})} aria-label={`${item.title} · ${english ? "View and edit" : "查看与编辑"}`}>
          <DateBackground item={item} compact/>
          <span className={styles.rowCopy}>
            <span className={styles.rowTitle}><span className="user-content" title={item.title}>{item.title}</span>{item.category&&<small className={styles.categoryBadge} style={{"--category-color":importantDateCategoryColor(item.category,item.categoryColor)} as CSSProperties}>{item.category}</small>}</span>
            <span className={styles.rowMeta}><time dateTime={item.date}>{importantDateDateLabel(item,english)}</time>{item.recurrence!=="none"&&<span>{item.recurrence==="weekly"?english?"Weekly":"每周":item.recurrence==="monthly"?english?"Monthly":"每月":english?"Yearly":"每年"}</span>}</span>
          </span>
          <span className={styles.rowCount} data-elapsed={display.ordinal||importantDateStats(item,today).elapsed>0} data-large={value>=100000}><strong>{display.text}</strong>{display.unit&&<span>{display.unit}</span>}</span>
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
    <FeaturedDates items={visible} today={today} onEdit={(item,rect)=>setPreview({item,rect})} />
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
    {preview&&<DatePreview item={preview.item} rect={preview.rect} today={today} onClose={()=>setPreview(null)} onEdit={()=>{setPreview(null);setEditing(preview.item);}}/>}
    {editing && <DateEditor item={editing === "new" ? null : editing} categoryDefinitions={categories.map(name=>({name,color:categoryDefinitions.find(entry=>entry.name===name)?.color??items.find(entry=>entry.category===name)?.categoryColor??null}))} onCategorySaved={entry=>{setCategoryDefinitions(current=>[...current.filter(value=>value.name!==entry.name),entry]);setItems(current=>current.map(item=>item.category===entry.name?{...item,categoryColor:entry.color}:item));invalidateClientData(["important-dates","home"]);}} today={today} onClose={() => setEditing(null)} onSaved={saved} />}
  </div>;
}

function DateEditor({ item, categoryDefinitions, onCategorySaved, today, onClose, onSaved }: { item: ImportantDate | null; categoryDefinitions:ImportantDateCategory[]; onCategorySaved:(category:ImportantDateCategory)=>void; today: string; onClose: () => void; onSaved: (item: ImportantDate | null, deletedId?: number) => void }) {
  const { english } = useLocale(), request = useBusinessRequest(), id = useId();
  const original: ImportantDateInput = item ? { title: item.title, date: item.date, calendar:item.calendar??"solar",lunar:item.lunar??null,lunarLeapPolicy:item.lunarLeapPolicy??"regular", recurrence: item.recurrence, category: item.category, categoryColor:item.categoryColor, note: item.note, pinned: item.pinned, archived: item.archived, reminderTime: item.reminderTime, reminderDaysBefore: item.reminderDaysBefore,displayMode:item.displayMode??"auto",countMode:item.countMode??"elapsed",background:item.background??{kind:"none"} } : { title: "", date: today, calendar:"solar",lunar:null,lunarLeapPolicy:"regular", recurrence: "none", category: "", note: "", pinned: false, archived: false, reminderTime: null, reminderDaysBefore: 0,displayMode:"auto",countMode:"elapsed",background:{kind:"none"} };
  const [draft, setDraft] = useState(original), [reminderEnabled, setReminderEnabled] = useState(Boolean(item?.reminderTime));
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [confirmDelete, setConfirmDelete] = useState(false);
  const [categoryEditing,setCategoryEditing]=useState(false),[categoryBusy,setCategoryBusy]=useState(false),[photoBusy,setPhotoBusy]=useState(false);
  const submitting = useRef(false);
  const dirty = categoryEditing || JSON.stringify(draft) !== JSON.stringify(original) || reminderEnabled !== Boolean(item?.reminderTime);
  function change<K extends keyof ImportantDateInput>(key: K, value: ImportantDateInput[K]) { setDraft(current => ({ ...current, [key]: value })); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      if(categoryEditing)throw new Error(english?"Save or cancel category changes first":"请先保存或取消分类修改");
      if (reminderEnabled && !draft.archived && !draft.reminderTime) throw new Error(english ? "Choose a reminder time" : "请选择提醒时间");
      const input = parseImportantDate({ ...draft, categoryColor:undefined, reminderTime: reminderEnabled ? draft.reminderTime : null });
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
  return <FormSheet title={confirmDelete ? english ? "Delete this date?" : "删除这个日子？" : item ? english ? "Edit date" : "编辑日子" : english ? "Add date" : "添加日子"} onClose={onClose} dirty={dirty} busy={busy||categoryBusy||photoBusy} formId={confirmDelete ? undefined : id} submitLabel={confirmDelete ? undefined : english ? "Save date" : "保存日子"}>
    {error && <ErrorNotice>{error}</ErrorNotice>}
    {confirmDelete ? <div className={styles.deleteConfirmation}><p className="user-content">{item?.title}</p><p>{english ? "This permanently deletes the date and cancels its reminders. You can archive it to keep it instead." : "这会永久删除日子并取消提醒。若想保留记录，可以使用归档。"}</p><button type="button" className="button danger" disabled={busy} onClick={() => void remove()}>{english ? "Delete permanently" : "永久删除"}</button><button type="button" className="button secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>{english ? "Keep date" : "保留日子"}</button></div> : <form id={id} className={`editor-card ${styles.editor}`} onSubmit={save}>
      <fieldset disabled={busy||categoryBusy||photoBusy}>
        <label className="field"><span>{english ? "Name" : "日子名称"}</span><input required maxLength={120} value={draft.title} placeholder={english ? "What makes this day special?" : "这个日子有什么特别之处？"} onChange={event => change("title", event.target.value)} /></label>
        <DateCalendarFields value={draft} onChange={patch=>setDraft(current=>({...current,...patch}))} />
        <label className="field"><span>{english ? "Repeat" : "重复"}</span><ChoiceSelect value={draft.recurrence} onChange={event => change("recurrence", event.target.value as ImportantDateInput["recurrence"])}><option value="none">{english ? "Does not repeat" : "不重复"}</option><option value="weekly">{english?"Every week":"每周"}</option><option value="monthly">{english?"Every month":"每月"}</option><option value="yearly">{english ? "Every year" : "每年"}</option></ChoiceSelect></label>
        {draft.recurrence==="weekly"&&<p className={styles.hint}>{english?"Repeats every 7 natural days, on the original weekday.":"每 7 个自然日重复，固定为原始日期的星期。"}</p>}
        {draft.recurrence==="monthly"&&<p className={styles.hint}>{draft.calendar==="lunar"?(english?"Repeats on the same lunar day in every actual month, including leap months. Day 30 falls on day 29 in short months.":"按每个实际农历月的同一天重复，包含闰月；三十日遇到小月按二十九计算。"):(english?"Repeats on the original day of each month. Missing days use month end; later months return to the original day.":"按每月同一日号重复；当月没有该日期时取月底，下个月仍按原始日号计算。")}</p>}
        {draft.recurrence === "yearly" && <p className={styles.hint}>{draft.calendar==="lunar"?(english?"Repeats by the lunar month and day, preserving the original year. Day 30 falls on day 29 in short months.":"按农历月、日计算每年的纪念日，保留原始年份。三十日遇到小月按二十九计算。"):(english?"Keep the original year to count anniversaries. February 29 falls on February 28 in common years.":"保留最初的年份，用来计算周年和累计天数。2 月 29 日在平年按 2 月 28 日计算。")}</p>}
        {draft.calendar==="lunar"&&draft.lunar?.leap&&draft.recurrence==="yearly"&&<label className="field"><span>{english?"In years without this leap month":"没有该闰月的年份"}</span><ChoiceSelect value={draft.lunarLeapPolicy??"regular"} onChange={event=>change("lunarLeapPolicy",event.target.value as "regular"|"skip")}><option value="regular">{english?"Use the regular month":"按同名普通月"}</option><option value="skip">{english?"Skip that year":"仅闰月年份纪念"}</option></ChoiceSelect></label>}
      {/^\d{4}-\d{2}-\d{2}$/.test(draft.date) && Number.isFinite(Date.parse(`${draft.date}T12:00:00Z`)) && <div className={styles.preview} aria-live="polite"><DateCount item={{ id:0,createdAt:"",updatedAt:"", ...item, ...draft }} today={today} /></div>}
        <label className="field"><span>{english?"Display":"展示方式"}</span><ChoiceSelect value={draft.displayMode??"auto"} onChange={event=>change("displayMode",event.target.value as ImportantDateInput["displayMode"])}><option value="auto">{english?"Automatic":"自动"}</option><option value="elapsed">{english?"Count up":"正数累计"}</option><option value="countdown">{english?"Count down":"倒数"}</option></ChoiceSelect><small>{english?"Count up keeps accumulating from the original date. Count down uses the next occurrence; one-time dates show elapsed days after passing.":"正数从原始日期累计；倒数使用下一次发生日，单次日子过后显示已过天数。"}</small></label>
        {draft.displayMode!=="countdown"&&<label className="field"><span>{english?"Starting day":"起始日计数"}</span><ChoiceSelect value={draft.countMode??"elapsed"} onChange={event=>change("countMode",event.target.value as "elapsed"|"ordinal")}><option value="elapsed">{english?"Elapsed · start at 0":"已过天数 · 当天算 0 天"}</option><option value="ordinal">{english?"Day N · start at 1":"第几天 · 当天算第 1 天"}</option></ChoiceSelect><small>{english?"Future dates always count down. Day N counts from the original date, including anniversaries.":"未来日期仍显示倒数；「第几天」从原始日期累计，重复事件也不重置。"}</small></label>}
        <CategoryField value={draft.category} categories={categoryDefinitions} onChange={name=>change("category",name)} onSaved={onCategorySaved} onEditing={setCategoryEditing} onBusy={setCategoryBusy}/>
        <Disclosure title={english?"Card background":"卡片背景"} defaultOpen={Boolean(item?.background&&item.background.kind!=="none")}><BackgroundField draft={draft} item={item} today={today} onChange={background=>change("background",background)} onBusy={setPhotoBusy}/></Disclosure>
        <Disclosure title={english ? "Note (optional)" : "备注（选填）"} defaultOpen={Boolean(draft.note)}><label className="field"><span>{english ? "Note" : "备注"}</span><textarea rows={3} maxLength={2000} value={draft.note} onChange={event => change("note", event.target.value)} /></label></Disclosure>
        <label className={styles.toggle}><span>{english ? "Feature this date" : "置于顶部卡片"}</span><input type="checkbox" checked={draft.pinned} onChange={event => change("pinned", event.target.checked)} /></label>
        <p className={styles.hint}>{english?"Up to three dates appear above. Pinned dates come first; the nearest days fill the remaining places.":"顶部最多展示三个日子，手动置顶优先，其余位置按日期临近补齐。"}</p>
        <label className={styles.toggle}><span>{english ? "Remind me" : "提醒我"}</span><input type="checkbox" checked={reminderEnabled} onChange={event => setReminderEnabled(event.target.checked)} /></label>
        {reminderEnabled && !draft.archived && <div className={styles.reminderFields}><label className="field"><span>{english ? "Days before" : "提前天数"}</span><input type="number" aria-label={english?"Days before":"提前天数"} aria-describedby={`${id}-lead-hint`} required min={0} max={draft.recurrence==="weekly"?6:draft.recurrence==="monthly"?27:366} step={1} value={Number.isFinite(draft.reminderDaysBefore)?draft.reminderDaysBefore:""} onChange={event => change("reminderDaysBefore", event.target.value === "" ? NaN : Number(event.target.value))} /><small id={`${id}-lead-hint`}>{english ? `0 = same day${draft.recurrence==="weekly"?" · max 6":draft.recurrence==="monthly"?" · max 27":""}` : `0 表示当天${draft.recurrence==="weekly"?"，最多提前 6 天":draft.recurrence==="monthly"?"，最多提前 27 天":""}`}</small></label><label className="field"><span>{english ? "Time (Shanghai)" : "提醒时间（上海）"}</span><input type="time" required value={draft.reminderTime ?? ""} onChange={event => change("reminderTime", event.target.value || null)} /></label><p className={styles.hint}>{english ? "Uses your configured Bark / Web Push channel. Past alert times are skipped; dates never become overdue tasks." : "通过已配置的 Bark／Web Push 通道发送。已过的提醒时间会跳过，日子不会变成逾期待办。"}</p></div>}
        {item && <label className={styles.toggle}><span>{english ? "Archive · pause reminders" : "归档 · 停止提醒"}</span><input type="checkbox" checked={draft.archived} onChange={event => change("archived", event.target.checked)} /></label>}
        {draft.archived&&<p className={styles.hint}>{english?"Archived dates leave the featured cards and active list. Reminders stay paused until restored.":"归档后移至页面底部，不参与顶部展示。恢复后按所填规则重新安排提醒。"}</p>}
        {item && <button type="button" className={styles.deleteAction} onClick={() => setConfirmDelete(true)}><Icon name="trash" />{english ? "Delete date" : "删除日子"}</button>}
      </fieldset>
    </form>}
  </FormSheet>;
}
