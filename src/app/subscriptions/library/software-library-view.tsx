"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocale } from "@/components/locale-controller";
import { Icon } from "@/components/icons";
import { ChoiceSelect } from "@/components/choice-select";
import { SelectDropdown } from "@/components/select-dropdown";
import { FormSheet } from "@/components/form-sheet";
import { ErrorNotice } from "@/components/error-notice";
import { PageLogAction } from "@/components/bottom-log";
import { useServerDataState, useDataRefresh } from "@/components/use-data-refresh";
import { responseError } from "@/lib/response-error";
import { libraryPlatforms, libraryWebsite, filterLibrary, type LibraryEntry, type LibraryAcquisition } from "@/lib/software-library";
import { SubscriptionIconField } from "../subscription-icon-field";
import { useIconColors } from "../preview/use-icon-colors";
import styles from "./library.module.css";

const emptyEntry = (): LibraryEntry => ({ id: 0, iconPath: "", name: "", category: "", platforms: [], license: "perpetual", version: "", acquisition: "giveaway", acquiredOn: null, website: "", notes: "", createdAt: "", updatedAt: "" });

export function SoftwareLibraryView({ initial }: { initial: LibraryEntry[] }) {
  const { english } = useLocale(), t = (en: string, zh: string) => english ? en : zh;
  const [entries, setEntries] = useServerDataState(initial), [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(""), [acquisition, setAcquisition] = useState<"all" | LibraryAcquisition>("all"), [category, setCategory] = useState(""), [platform, setPlatform] = useState("");
  const [selected, setSelected] = useState<LibraryEntry | null>(null), [editing, setEditing] = useState<LibraryEntry | null>(null), [error, setError] = useState("");
  const [iconFile,setIconFile]=useState<File|null>(null),[removeIcon,setRemoveIcon]=useState(false);
  const iconSource=(entry:LibraryEntry)=>entry.iconPath ? `/api/subscriptions/library/${entry.id}/icon?v=${entry.iconPath}` : null;
  const sources=useMemo(()=>Object.fromEntries(entries.filter(entry=>entry.iconPath).map(entry=>[entry.id,`/api/subscriptions/library/${entry.id}/icon?v=${entry.iconPath}`])),[entries]);
  const {transparent,colors,neutralFilter}=useIconColors(sources);
  const storeEntry=(saved:LibraryEntry)=>setEntries(current=>(current.some(entry=>entry.id===saved.id)?current.map(entry=>entry.id===saved.id?saved:entry):[...current,saved]).sort((a,b)=>a.name.localeCompare(b.name)||a.id-b.id));
  const formId = useId();
  useDataRefresh("/subscriptions", async () => { const response = await fetch("/api/subscriptions/library", { cache: "no-store" }); if (response.ok) setEntries(await response.json() as LibraryEntry[]); });
  const platformId = useId(), platformAnchor = useRef<HTMLDivElement>(null), platformButton = useRef<HTMLButtonElement>(null);
  const [platformOpen, setPlatformOpen] = useState(false);
  useEffect(() => {
    if (platformOpen) document.getElementById(platformId)?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
  }, [platformOpen, platformId]);
  function closePlatforms() {
    if (document.getElementById(platformId)?.contains(document.activeElement)) platformButton.current?.focus({ preventScroll: true });
    setPlatformOpen(false);
  }
  const categories = [...new Set(entries.map(entry => entry.category).filter(Boolean))];
  const visible = filterLibrary(entries, query, acquisition, category, platform);
  const platformCount = new Set(entries.flatMap(entry => entry.platforms)).size;
  const acquisitionLabel = (value: LibraryAcquisition) => ({ paid: t("Purchased", "付费买断"), giveaway: t("Giveaway", "限免领取"), gift: t("Gift / code", "赠送／兑换") })[value];
  const licenseLabel = (entry: LibraryEntry) => entry.license === "perpetual" ? t("Perpetual licence", "永久授权") : t(`${entry.version} licence`, `${entry.version} 版本授权`);
  const categoryLabel = (value: string) => english ? ({ "创作": "Creative", "效率": "Productivity", "工具": "Utilities" }[value] ?? value) : value;
  function resetFilters() { setQuery(""); setAcquisition("all"); setCategory(""); setPlatform(""); }
  function add() { resetFilters(); setError(""); setIconFile(null);setRemoveIcon(false);setEditing(emptyEntry()); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing || busy) return;
    if (!editing.name.trim()) { setError(t("Give this software a name.", "请填写软件名称。")); return; }
    if (editing.license === "version" && !editing.version.trim()) { setError(t("Enter the licensed version.", "请填写授权版本。")); return; }
    if (!editing.platforms.length) { setError(t("Choose at least one platform.", "请至少选择一个平台。")); return; }
    const website = libraryWebsite(editing.website);
    if (website === null) { setError(t("Use a complete http or https link.", "请填写完整的 http 或 https 链接。")); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/subscriptions/library${editing.id ? `/${editing.id}` : ""}`, { method: editing.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...editing, name: editing.name.trim(), category: editing.category.trim(), version: editing.license === "version" ? editing.version.trim() : "", website }) });
      if (!response.ok) { setError(await responseError(response, t("Couldn’t save. Try again.", "保存失败，请重试。"))); return; }
      let saved = await response.json() as LibraryEntry;
      storeEntry(saved);setEditing(saved);
      if(iconFile||removeIcon){
        const body=new FormData();if(iconFile)body.set("file",iconFile);
        const uploaded=await fetch(`/api/subscriptions/library/${saved.id}/icon`,{method:iconFile?"POST":"DELETE",...(iconFile?{body}:{})});
        if(!uploaded.ok){setError(t("Software saved; icon could not be saved. Retry to keep this image.","软件资料已保存，图标保存失败，请重试。"));return;}
        saved=await uploaded.json() as LibraryEntry;storeEntry(saved);
      }
      setIconFile(null);setRemoveIcon(false);
      setEditing(null);
    } catch { setError(t("Couldn’t save. Check your connection and try again.", "保存失败，请检查网络后重试。")); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!selected || busy || !window.confirm(t(`Remove “${selected.name}” from your library?`, `从软件库移除「${selected.name}」？`))) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/subscriptions/library/${selected.id}`, { method: "DELETE" });
      if (!response.ok) { setError(await responseError(response, t("Couldn’t remove this software.", "移除失败，请重试。"))); return; }
      setEntries(current => current.filter(entry => entry.id !== selected.id));setSelected(null);
    } catch { setError(t("Couldn’t remove this software. Try again.", "移除失败，请检查网络后重试。")); }
    finally { setBusy(false); }
  }
  const mark = (entry: LibraryEntry) => iconSource(entry) ? <span className={styles.mark} data-image data-transparent={transparent[entry.id]} aria-hidden="true">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={iconSource(entry)!} alt="" style={transparent[entry.id]&&colors[entry.id]===null?{filter:neutralFilter}:undefined}/>
  </span> : <span className={styles.mark} data-tone={entry.acquisition} aria-hidden="true">{entry.name.trim().slice(0, 1).toUpperCase()}</span>;
  return <div className={`page ${styles.page}`}>
    <Link href="/subscriptions" className={styles.back}><Icon name="arrow" />{t("Subscriptions", "订阅")}</Link>
    <header className={styles.header}><h1>{t("Software library", "软件库")}</h1><PageLogAction label={t("Add software", "添加软件")} onClick={add}><Icon name="plus" />{t("Add", "添加软件")}</PageLogAction></header>

    <div className={styles.summary}><span><strong>{entries.length.toString().padStart(2, "0")}</strong>{t("software", "件软件")}</span><span>{entries.filter(entry => entry.acquisition === "giveaway").length} {t("giveaways", "项限免")}</span><span>{platformCount} {t("platforms", "个平台")}</span></div>
    <div className={styles.workspace}>
      <nav className={styles.categories} aria-label={t("Software categories", "软件分类")}>
        <h2>{t("Collections", "分类收藏")}</h2>
        <div><button aria-pressed={!category} onClick={() => setCategory("")}>{t("All software", "全部软件")}<span>{entries.length}</span></button>{categories.map(value => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{categoryLabel(value)}<span>{entries.filter(entry => entry.category === value).length}</span></button>)}</div>
      </nav>
      <section className={styles.collection} aria-label={t("Software collection", "软件收藏清单")}>
        <div className={styles.tools}><label className={styles.search}><Icon name="search" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Find software, a licence, a note…", "搜索软件、版本或备注…")} aria-label={t("Search software", "搜索软件")} /></label>
          <div className={styles.platformFilter} ref={platformAnchor} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setPlatformOpen(false); }}>
            <button ref={platformButton} type="button" role="combobox" aria-label={t("Filter by platform", "按平台筛选")} aria-controls={platformId} aria-expanded={platformOpen} aria-haspopup="listbox" onClick={() => setPlatformOpen(!platformOpen)} onKeyDown={event => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setPlatformOpen(true); }
              if (event.key === "Escape") setPlatformOpen(false);
            }}><span>{platform || t("All platforms", "全部平台")}</span><Icon name="chevronDown" /></button>
            {platformOpen && <SelectDropdown anchor={platformAnchor} onClose={closePlatforms} id={`${platformId}-panel`} label={t("Platforms", "平台选择")} minWidth={220} className={styles.platformMenu}>
              <div id={platformId} role="listbox" aria-label={t("Platforms", "平台选择")}>{["", ...libraryPlatforms].map(value => {
                const count = value ? entries.filter(entry => entry.platforms.some(platform => platform === value)).length : entries.length;
                return <button type="button" role="option" key={value} aria-selected={platform === value} disabled={Boolean(value) && count === 0} onClick={() => { setPlatform(value); setPlatformOpen(false); platformButton.current?.focus({ preventScroll: true }); }}><span>{value || t("All platforms", "全部平台")}</span><small>{count}</small>{platform === value && <Icon name="check" />}</button>;
              })}</div>
            </SelectDropdown>}
          </div>
        </div>
        <div className={styles.listHeading}><h2>{category ? categoryLabel(category) : t("Your collection", "我的收藏")}<span>{visible.length}</span></h2><div className={styles.filters} role="group" aria-label={t("Acquisition type", "获取方式筛选")}>{(["all", "giveaway", "paid", "gift"] as const).map(value => <button key={value} aria-pressed={acquisition === value} onClick={() => setAcquisition(value)}>{value === "all" ? t("All", "全部") : value === "gift" ? t("Gift", "赠送") : acquisitionLabel(value)}</button>)}</div></div>
        {visible.length ? <ul className={styles.list}>{visible.map(entry => <li key={entry.id}><button className={styles.entry} onClick={() => setSelected(entry)}>
          {mark(entry)}<span className={styles.entryCopy}><strong>{entry.name}</strong></span>
        </button></li>)}</ul> : <div className={styles.empty}><Icon name={entries.length ? "search" : "projects"} /><h3>{entries.length ? t("No matching software", "没有找到匹配的软件") : t("A place for what you own", "给拥有的软件，留一个位置")}</h3><p>{entries.length ? t("Try another name, category, or platform.", "换个关键词，或调整分类与平台。") : t("Keep its name, platform, licence, and the link to find it again.", "记下名称、平台、授权和链接，下次需要时就能找到。")}</p><button className="button secondary" onClick={entries.length ? resetFilters : add}>{entries.length ? t("Clear filters", "清除筛选") : t("Add your first software", "添加第一件软件")}</button></div>}
      </section>
    </div>

    {selected && <FormSheet title={selected.name} onClose={() => { setSelected(null); setError(""); }} busy={busy}><article className={styles.detail}>
      <div className={styles.detailHead}>{mark(selected)}<div><span>{selected.platforms.join(" · ")}</span><strong>{licenseLabel(selected)}</strong></div><button className="text-button" onClick={() => { setIconFile(null);setRemoveIcon(false);setEditing(selected); setSelected(null); setError(""); }}>{t("Edit", "编辑资料")}</button></div>
      <dl><div><dt>{t("Acquisition", "如何获得")}</dt><dd>{acquisitionLabel(selected.acquisition)}</dd></div><div><dt>{t("Acquired on", "获取日期")}</dt><dd>{selected.acquiredOn || t("Not recorded", "未记录")}</dd></div><div><dt>{t("Category", "分类")}</dt><dd>{selected.category ? categoryLabel(selected.category) : t("Uncategorised", "未分类")}</dd></div><div><dt>{t("Licence", "授权范围")}</dt><dd>{licenseLabel(selected)}</dd></div></dl>
      <section><h3>{t("A note to remember", "留给自己的备注")}</h3><p>{selected.notes || t("No notes yet.", "尚未添加备注。")}</p></section>
      {selected.website ? <a className={`button secondary ${styles.website}`} href={selected.website} target="_blank" rel="noopener noreferrer">{t("Open website / store", "前往官网／商店")}<Icon name="arrow" /><small>{new URL(selected.website).hostname}</small></a> : <p>{t("No link saved. Add one in Edit.", "尚未保存链接，可在编辑中补充。")}</p>}
      <button className="text-button danger" disabled={busy} onClick={() => void remove()}>{t("Remove software", "移除软件")}</button>{error && <ErrorNotice>{error}</ErrorNotice>}
    </article></FormSheet>}

    {editing && <FormSheet title={editing.id ? t("Edit software", "编辑软件") : t("Add software", "添加软件")} onClose={() => { setEditing(null); setError(""); }} formId={formId} submitLabel={t("Save", "保存")} busy={busy}><form id={formId} className="editor-card" onSubmit={save}>
      <div className="form-grid"><SubscriptionIconField label={t("Software icon","软件图标")} name={editing.name} source={iconSource(editing)} file={iconFile} remove={removeIcon} disabled={busy} onChange={(file,remove)=>{setIconFile(file);setRemoveIcon(remove);}}/><label className="field wide"><span>{t("Software name", "软件名称")}</span><input required maxLength={80} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} /></label>
        <fieldset className={styles.platforms}><legend>{t("Platforms · choose one or more", "平台 · 可多选")}</legend><div>{libraryPlatforms.map(value => <button type="button" key={value} data-form-change aria-pressed={editing.platforms.includes(value)} onClick={() => setEditing({ ...editing, platforms: editing.platforms.includes(value) ? editing.platforms.filter(item => item !== value) : [...editing.platforms, value] })}>{value}</button>)}</div></fieldset>
        <label className="field"><span>{t("Acquisition", "获取方式")}</span><ChoiceSelect value={editing.acquisition} onChange={event => setEditing({ ...editing, acquisition: event.target.value as LibraryAcquisition })}>{(["paid", "giveaway", "gift"] as const).map(value => <option key={value} value={value}>{acquisitionLabel(value)}</option>)}</ChoiceSelect></label>
        <label className="field"><span>{t("Licence", "授权方式")}</span><ChoiceSelect value={editing.license} onChange={event => setEditing({ ...editing, license: event.target.value as LibraryEntry["license"] })}><option value="perpetual">{t("Perpetual", "永久授权")}</option><option value="version">{t("Specific version", "指定版本买断")}</option></ChoiceSelect></label>
        {editing.license === "version" && <label className="field wide"><span>{t("Licensed version", "授权版本")}</span><input required maxLength={40} placeholder={t("For example, V2", "例如 V2")} value={editing.version} onChange={event => setEditing({ ...editing, version: event.target.value })} /></label>}
        <label className="field"><span>{t("Category · optional", "分类 · 选填")}</span><input maxLength={24} value={editing.category} placeholder={t("Creative, productivity…", "创作、效率、工具…")} onChange={event => setEditing({ ...editing, category: event.target.value })} /></label>
        <label className="field"><span>{t("Acquired on · optional", "获取日期 · 选填")}</span><input type="date" value={editing.acquiredOn ?? ""} onChange={event => setEditing({ ...editing, acquiredOn: event.target.value || null })} /></label>
        <label className="field wide"><span>{t("Website / store link", "官网／商店链接")}</span><input type="url" inputMode="url" maxLength={2000} placeholder="https://" value={editing.website} onChange={event => setEditing({ ...editing, website: event.target.value })} /></label>
        <label className="field wide"><span>{t("Notes · optional", "备注 · 选填")}</span><textarea rows={3} maxLength={2000} placeholder={t("Where you got it, which account, what to remember…", "领取来源、账号提示，或以后想记得的事…")} value={editing.notes} onChange={event => setEditing({ ...editing, notes: event.target.value })} /></label>
      </div>{error && <ErrorNotice>{error}</ErrorNotice>}
    </form></FormSheet>}
  </div>;
}
