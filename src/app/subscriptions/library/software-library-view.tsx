"use client";

import { useBusinessRequest } from "@/components/business-request-context";
import { useFormPreview, FormPreviewNotice } from "@/components/form-preview";
import { useSubscriptionsData } from "@/components/subscriptions-data-context";
import { SubscriptionSections } from "../subscription-sections";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocale } from "@/components/locale-controller";
import { Icon } from "@/components/icons";
import { SuggestedInput } from "@/components/suggested-input";
import { ChoiceSelect } from "@/components/choice-select";
import { SelectDropdown } from "@/components/select-dropdown";
import { FormSheet } from "@/components/form-sheet";
import { ErrorNotice } from "@/components/error-notice";
import { PageLogAction } from "@/components/bottom-log-core";
import { useServerDataState, useDataRefresh } from "@/components/use-data-refresh";
import { responseError } from "@/lib/response-error";
import { libraryPlatforms, libraryIOSRegions, filterLibrary, librarySpend, type LibraryEntry, type LibraryAcquisition } from "@/lib/software-library";
import { SubscriptionIconField } from "../subscription-icon-field";
import { useIconColors } from "../preview/use-icon-colors";
import styles from "./library.module.css";

const categoryNames:Record<string,string>={"效率":"Productivity","创作":"Creative","摄影":"Photography","影音":"Media","开发":"Development","工具":"Utilities","学习":"Learning","生活":"Lifestyle"};

const emptyEntry = (): LibraryEntry => ({ id: 0, iconPath: "", name: "",alternateName:"",iosRegions:[],category: "", platforms: [], license: "perpetual", version: "", acquisition: "giveaway", acquiredOn: null, website: "", notes: "", createdAt: "", updatedAt: "" });

export function SoftwareLibraryView({ initial }: { initial: LibraryEntry[] }) {
  const businessFetch=useBusinessRequest(), previewOnly=useFormPreview();
  const {read,local,libraryIconSources}=useSubscriptionsData();
  const { english } = useLocale(), t = (en: string, zh: string) => english ? en : zh;
  const [entries, setEntries] = useServerDataState(initial), [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(""), [acquisition, setAcquisition] = useState<"all" | LibraryAcquisition>("all"), [category, setCategory] = useState(""), [platform, setPlatform] = useState("");
  const [selected, setSelected] = useState<LibraryEntry | null>(null), [editing, setEditing] = useState<LibraryEntry | null>(null), [error, setError] = useState("");
  const [iconFile,setIconFile]=useState<File|null>(null),[removeIcon,setRemoveIcon]=useState(false);
  const iconSource=(entry:LibraryEntry)=>!entry.iconPath?null:local?(initial.some(item=>item.id===entry.id&&item.iconPath===entry.iconPath)?libraryIconSources?.[entry.id]??null:null):`/api/subscriptions/library/${entry.id}/icon?v=${entry.iconPath}`;
  const sources=useMemo(()=>Object.fromEntries(entries.flatMap(entry=>{const source=!entry.iconPath?null:local?(initial.some(item=>item.id===entry.id&&item.iconPath===entry.iconPath)?libraryIconSources?.[entry.id]:null):`/api/subscriptions/library/${entry.id}/icon?v=${entry.iconPath}`;return source?[[entry.id,source]]:[];})),[entries,local,libraryIconSources,initial]);
  const {transparent,colors,neutralFilter}=useIconColors(sources);
  const storeEntry=(saved:LibraryEntry)=>setEntries(current=>(current.some(entry=>entry.id===saved.id)?current.map(entry=>entry.id===saved.id?saved:entry):[...current,saved]).sort((a,b)=>a.name.localeCompare(b.name)||a.id-b.id));
  const formId = useId();
  const [purchaseAmount,setPurchaseAmount]=useState("");
  const spend=librarySpend(entries);
  const cost=(minor:number,currency:string)=>new Intl.NumberFormat(english?"en":"zh-CN",{style:"currency",currency,currencyDisplay:"code"}).format(minor/100);
  useDataRefresh("/subscriptions", async () => { const response = await read("/api/subscriptions/library", { cache: "no-store" }); if (response.ok) setEntries(await response.json() as LibraryEntry[]); });
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
  const acquisitionLabel = (value: LibraryAcquisition) => value==="paid"?t("Purchased","买断"):t("Giveaway","限免");
  const licenseLabel = (entry: LibraryEntry) => entry.license === "perpetual" ? t("Perpetual licence", "永久授权") : t(`${entry.version} licence`, `${entry.version} 版本授权`);
  const categoryLabel = (value: string) => english ? (categoryNames[value]??value) : value;
  const iosRegionLabel=(region:string)=>region==="CN"?t("China store","国区"):t("US store","美区");
  const categorySuggestions=[...new Set([...categories,...Object.keys(categoryNames)].map(categoryLabel))];
  function resetFilters() { setQuery(""); setAcquisition("all"); setCategory(""); setPlatform(""); }
  function add() { setPurchaseAmount("");resetFilters(); setError(""); setIconFile(null);setRemoveIcon(false);setEditing(emptyEntry()); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (previewOnly || !editing || busy) return;
    if (!editing.name.trim()) { setError(t("Give this software a name.", "请填写软件名称。")); return; }
    if (editing.license === "version" && !editing.version.trim()) { setError(t("Enter the licensed version.", "请填写授权版本。")); return; }
    if (!editing.platforms.length) { setError(t("Choose at least one platform.", "请至少选择一个平台。")); return; }
    setBusy(true); setError("");
    try {
      const response = await businessFetch(`/api/subscriptions/library${editing.id ? `/${editing.id}` : ""}`, { method: editing.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...editing,acquisition:editing.acquisition==="gift"?"giveaway":editing.acquisition,purchaseAmount:purchaseAmount.trim()||null,purchaseCurrency:editing.purchaseCurrency||"CNY",name: editing.name.trim(), category: editing.category.trim(), version: editing.license === "version" ? editing.version.trim() : "" }) });
      if (!response.ok) { setError(await responseError(response, t("Couldn’t save. Try again.", "保存失败，请重试。"))); return; }
      let saved = await response.json() as LibraryEntry;
      storeEntry(saved);setEditing(saved);
      if(iconFile||removeIcon){
        const body=new FormData();if(iconFile)body.set("file",iconFile);
        const uploaded=await businessFetch(`/api/subscriptions/library/${saved.id}/icon`,{method:iconFile?"POST":"DELETE",...(iconFile?{body}:{})});
        if(!uploaded.ok){setError(t("Software saved; icon could not be saved. Retry to keep this image.","软件资料已保存，图标保存失败，请重试。"));return;}
        saved=await uploaded.json() as LibraryEntry;storeEntry(saved);
      }
      setIconFile(null);setRemoveIcon(false);
      setEditing(null);
    } catch { setError(t("Couldn’t save. Check your connection and try again.", "保存失败，请检查网络后重试。")); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (previewOnly || !selected || busy || !window.confirm(t(`Remove “${selected.name}” from your library?`, `从软件库移除「${selected.name}」？`))) return;
    setBusy(true); setError("");
    try {
      const response = await businessFetch(`/api/subscriptions/library/${selected.id}`, { method: "DELETE" });
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
    <header className={styles.header}><h1>{t("Software library", "软件库")}</h1><PageLogAction label={t("Add software", "添加软件")} onClick={add}><Icon name="plus" />{t("Add", "添加软件")}</PageLogAction></header>

    <SubscriptionSections active="library"/>
    <div className={styles.summary}><span><strong>{entries.length.toString().padStart(2, "0")}</strong>{t("software", "件软件")}</span><span>{entries.filter(entry => entry.acquisition !== "paid").length} {t("giveaways", "项限免")}</span><span>{platformCount} {t("platforms", "个平台")}</span></div>
    <section className={styles.costSummary} aria-label={t("Recorded software spending","软件已记录花费")}><div><span>{t("Recorded spending","已记录花费")}</span><small>{t(`${spend.recorded} of ${entries.length} software · unknown costs excluded`,`${spend.recorded} / ${entries.length} 件软件已记录金额 · 未知费用不计入`)}</small></div><div>{Object.entries(spend.totals).length?Object.entries(spend.totals).sort(([a],[b])=>a.localeCompare(b)).map(([currency,total])=><strong key={currency}>{cost(total,currency)}</strong>):<strong>—</strong>}</div></section>
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
        <div className={styles.listHeading}><h2>{category ? categoryLabel(category) : t("Your collection", "我的收藏")}<span>{visible.length}</span></h2><div className={styles.filters} role="group" aria-label={t("Acquisition type", "获取方式筛选")}>{(["all", "paid", "giveaway"] as const).map(value => <button key={value} aria-pressed={acquisition === value} onClick={() => setAcquisition(value)}>{value === "all" ? t("All", "全部") : acquisitionLabel(value)}</button>)}</div></div>
        {visible.length ? <ul className={styles.list} data-subscription-swipe-surface>{visible.map(entry => <li key={entry.id}><button className={styles.entry} onClick={() => setSelected(entry)}>
          {mark(entry)}<span className={styles.entryCopy} data-priced={entry.purchaseAmountMinor!=null&&Boolean(entry.purchaseCurrency)}><strong title={[entry.name,entry.alternateName].filter(Boolean).join(" · ")}>{entry.name}</strong>{entry.purchaseAmountMinor!=null&&entry.purchaseCurrency&&<small className={styles.entryPrice} title={cost(entry.purchaseAmountMinor,entry.purchaseCurrency)}>{entry.purchaseAmountMinor===0?t("Free","免费"):cost(entry.purchaseAmountMinor,entry.purchaseCurrency)}</small>}</span>
        </button></li>)}</ul> : <div className={styles.empty}><Icon name={entries.length ? "search" : "projects"} /><h3>{entries.length ? t("No matching software", "没有找到匹配的软件") : t("A place for what you own", "给拥有的软件，留一个位置")}</h3><p>{entries.length ? t("Try another name, category, or platform.", "换个关键词，或调整分类与平台。") : t("Keep the software you own, its licence, and what you paid.", "收好软件、授权与购买记录，下次需要时就能找到。")}</p><button className="button secondary" onClick={entries.length ? resetFilters : add}>{entries.length ? t("Clear filters", "清除筛选") : t("Add your first software", "添加第一件软件")}</button></div>}
      </section>
    </div>

    {selected && <FormSheet title={selected.name} onClose={() => { setSelected(null); setError(""); }} busy={busy}><article className={styles.detail}>
      <div className={styles.detailHead}>{mark(selected)}<div><span>{selected.platforms.join(" · ")}</span><strong>{licenseLabel(selected)}</strong></div><button className="text-button" onClick={() => { setIconFile(null);setRemoveIcon(false);setPurchaseAmount(selected.purchaseAmountMinor==null?"":(selected.purchaseAmountMinor/100).toFixed(2));setEditing(selected); setSelected(null); setError(""); }}>{t("Edit", "编辑资料")}</button></div>
      <dl>{selected.alternateName&&<div><dt>{t("Other language name","另一语言名称")}</dt><dd>{selected.alternateName}</dd></div>}{selected.platforms.includes("iOS")&&<div><dt>{t("iOS App Store regions","iOS 选区")}</dt><dd>{selected.iosRegions?.length?selected.iosRegions.map(iosRegionLabel).join(" · "):t("Not recorded","未记录")}</dd></div>}<div><dt>{t("Purchase price","实际购买金额")}</dt><dd>{selected.purchaseAmountMinor!=null&&selected.purchaseCurrency?cost(selected.purchaseAmountMinor,selected.purchaseCurrency):t("Not recorded","未记录")}</dd></div><div><dt>{t("Acquisition", "如何获得")}</dt><dd>{acquisitionLabel(selected.acquisition)}</dd></div><div><dt>{t("Acquired on", "获取日期")}</dt><dd>{selected.acquiredOn || t("Not recorded", "未记录")}</dd></div><div><dt>{t("Category", "分类")}</dt><dd>{selected.category ? categoryLabel(selected.category) : t("Uncategorised", "未分类")}</dd></div><div><dt>{t("Licence", "授权范围")}</dt><dd>{licenseLabel(selected)}</dd></div></dl>
      <section><h3>{t("A note to remember", "留给自己的备注")}</h3><p>{selected.notes || t("No notes yet.", "尚未添加备注。")}</p></section>
      <button className="text-button danger" disabled={previewOnly||busy} onClick={() => void remove()}>{t("Remove software", "移除软件")}</button>{error && <ErrorNotice>{error}</ErrorNotice>}
    </article></FormSheet>}

    {editing && <FormSheet title={editing.id ? t("Edit software", "编辑软件") : t("Add software", "添加软件")} onClose={() => { setEditing(null); setError(""); }} formId={formId} submitLabel={t("Save", "保存")} busy={busy} submitDisabled={previewOnly}><form id={formId} className="editor-card" onSubmit={save}>
      {previewOnly&&<FormPreviewNotice/>}
      <div className="form-grid"><SubscriptionIconField label={t("Software icon","软件图标")} name={editing.name} source={iconSource(editing)} file={iconFile} remove={removeIcon} disabled={previewOnly||busy} onChange={(file,remove)=>{setIconFile(file);setRemoveIcon(remove);}}/><label className="field wide"><span>{t("Software name", "软件名称")}</span><input required maxLength={80} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} /></label>
        <label className="field wide"><span>{t("Other language name · optional","另一语言名称 · 选填")}</span><input maxLength={80} value={editing.alternateName??""} onChange={event=>setEditing(current=>current?{...current,alternateName:event.target.value}:current)}/></label>
        <fieldset className={styles.platforms}><legend>{t("Platforms · choose one or more", "平台 · 可多选")}</legend><div>{libraryPlatforms.map(value => <button type="button" key={value} data-form-change aria-pressed={editing.platforms.includes(value)} onClick={() => {const platforms=editing.platforms.includes(value)?editing.platforms.filter(item=>item!==value):[...editing.platforms,value];setEditing({...editing,platforms,iosRegions:platforms.includes("iOS")?editing.iosRegions??[]:[]});}}>{value}</button>)}</div></fieldset>
        {editing.platforms.includes("iOS")&&<fieldset className={styles.platforms}><legend>{t("iOS App Store regions · optional","iOS 选区 · 选填")}</legend><div>{libraryIOSRegions.map(region=><button type="button" key={region} data-form-change aria-pressed={editing.iosRegions?.includes(region)??false} onClick={()=>setEditing(current=>current?{...current,iosRegions:current.iosRegions?.includes(region)?current.iosRegions.filter(value=>value!==region):[...(current.iosRegions??[]),region]}:current)}>{iosRegionLabel(region)}</button>)}</div></fieldset>}
        <label className="field"><span>{t("Acquisition", "获取方式")}</span><ChoiceSelect value={editing.acquisition==="gift"?"giveaway":editing.acquisition} onChange={event => setEditing({ ...editing, acquisition: event.target.value as LibraryAcquisition })}>{(["paid", "giveaway"] as const).map(value => <option key={value} value={value}>{acquisitionLabel(value)}</option>)}</ChoiceSelect></label>
        <label className="field"><span>{t("Licence", "授权方式")}</span><ChoiceSelect value={editing.license} onChange={event => setEditing({ ...editing, license: event.target.value as LibraryEntry["license"] })}><option value="perpetual">{t("Perpetual", "永久授权")}</option><option value="version">{t("Specific version", "指定版本买断")}</option></ChoiceSelect></label>
        {editing.license === "version" && <label className="field wide"><span>{t("Licensed version", "授权版本")}</span><input required maxLength={40} placeholder={t("For example, V2", "例如 V2")} value={editing.version} onChange={event => setEditing({ ...editing, version: event.target.value })} /></label>}
        <label className="field"><span>{t("Purchase price · optional","实付金额 · 选填")}</span><input inputMode="decimal" value={purchaseAmount} placeholder={t("Unknown","未知")} onChange={event=>setPurchaseAmount(event.target.value)}/></label>
        <label className="field"><span>{t("Purchase currency","购买币种")}</span><input maxLength={3} pattern="[A-Za-z]{3}" required={Boolean(purchaseAmount.trim())} value={editing.purchaseCurrency??"CNY"} onChange={event=>setEditing({...editing,purchaseCurrency:event.target.value.toUpperCase()})}/></label>
        <div className="field"><span>{t("Category · optional", "分类 · 选填")}</span><SuggestedInput aria-label={t("Category · optional","分类 · 选填")} maxLength={24} value={categoryLabel(editing.category)} suggestions={categorySuggestions} suggestionLabel={t("Recommended categories","推荐分类")} recommendationStyle="list" onValueChange={value=>setEditing(current=>current?{...current,category:categories.find(category=>categoryLabel(category)===value)??Object.keys(categoryNames).find(category=>categoryLabel(category)===value)??value}:current)} /></div>
        <label className="field"><span>{t("Acquired on · optional", "获取日期 · 选填")}</span><input type="date" value={editing.acquiredOn ?? ""} onChange={event => setEditing({ ...editing, acquiredOn: event.target.value || null })} /></label>
        <label className="field wide"><span>{t("Notes · optional", "备注 · 选填")}</span><textarea rows={3} maxLength={2000} placeholder={t("Where you got it, which account, what to remember…", "领取来源、账号提示，或以后想记得的事…")} value={editing.notes} onChange={event => setEditing({ ...editing, notes: event.target.value })} /></label>
      </div>{error && <ErrorNotice>{error}</ErrorNotice>}
    </form></FormSheet>}
  </div>;
}
