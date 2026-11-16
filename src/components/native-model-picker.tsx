"use client";
import {useDeferredValue,useId,useMemo,useState} from "react";
import type {EvaModel,EvaModelCatalog} from "@/lib/native-eva";
import {findCatalogModels,clearModelPrices,type CatalogSort} from "@/lib/native-model-catalog";
import {FormSheet} from "./form-sheet";
import styles from "./native-eva-settings.module.css";

export function NativeModelPicker({catalog,models,english,onApply,onClose}:{catalog:EvaModelCatalog;models:EvaModel[];english:boolean;onApply:(ids:ReadonlySet<string>)=>void;onClose:()=>void}) {
  const t=(en:string,zh:string)=>english?en:zh,formId=useId();
  const [query,setQuery]=useState(""),[family,setFamily]=useState(""),[sort,setSort]=useState<CatalogSort>("name");
  const [selectedOnly,setSelectedOnly]=useState(false),[freeOnly,setFreeOnly]=useState(false),[limit,setLimit]=useState(50);
  const [selected,setSelected]=useState(()=>new Set(models.filter(m=>m.id.trim()).map(m=>m.id)));
  const deferredQuery=useDeferredValue(query);
  const available=useMemo(()=>new Set(catalog.models.map(item=>item.model.id)),[catalog]);
  const all=useMemo(()=>[...catalog.models,...models.filter(m=>m.id.trim()&&!available.has(m.id)).map(model=>({model:clearModelPrices(model),family:"",textCapability:"unknown" as const}))],[catalog,models,available]);
  const families=useMemo(()=>[...new Set(all.map(m=>m.family).filter(Boolean))].sort(),[all]);
  const results=useMemo(()=>findCatalogModels(all,deferredQuery,family,selectedOnly,selected,sort,freeOnly),[all,deferredQuery,family,selectedOnly,selected,sort,freeOnly]);
  const money=(value:number|undefined)=>value===undefined?t("Unknown","未知"):value.toLocaleString(english?"en-US":"zh-CN",{maximumSignificantDigits:6});
  return <FormSheet title={t("Choose models","选择模型")} formId={formId} submitLabel={t(`Use ${selected.size} models`,`使用 ${selected.size} 个模型`)} submitDisabled={!selected.size} dirty={false} onClose={onClose}>
    <form id={formId} className={styles.catalog} data-model-catalog onSubmit={event=>{event.preventDefault();event.stopPropagation();onApply(selected);}}>
      <label className="field"><input type="search" aria-label={t("Search models","搜索模型")} placeholder={t("Search name, ID or developer","搜索名称、ID 或厂商")} value={query} onChange={event=>{setQuery(event.target.value);setLimit(50);}} onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing)event.preventDefault();}}/></label>
      <div className={styles.catalogFilters}>
        <label className="field"><select aria-label={t("Model developer","模型厂商")} value={family} onChange={e=>{setFamily(e.target.value);setLimit(50);}}><option value="">{t("All developers","全部厂商")}</option>{families.map(value=><option key={value}>{value}</option>)}</select></label>
        <label className="field"><select aria-label={t("Model ordering","模型排序")} value={sort} onChange={e=>{setSort(e.target.value as CatalogSort);setLimit(50);}}><option value="name">{t("Name / match","名称 / 匹配度")}</option><option value="input">{t("Input price: low first","输入价格从低到高")}</option><option value="output">{t("Output price: low first","输出价格从低到高")}</option><option value="context">{t("Context: large first","上下文从大到小")}</option></select></label>
      </div>
      <div className={styles.catalogFilters}>
        <label className={styles.toggle}><input type="checkbox" checked={selectedOnly} onChange={e=>{setSelectedOnly(e.target.checked);setLimit(50);}}/>{t("Selected only","只看已选")}</label>
        <label className={styles.toggle}><input type="checkbox" checked={freeOnly} onChange={e=>{setFreeOnly(e.target.checked);setLimit(50);}}/>{t("Free token rates","Token 免费")}</label>
      </div>
      <p className={styles.catalogSummary} aria-live="polite">{t(`${results.length} matches · ${selected.size}/50 selected`,`${results.length} 个结果 · 已选 ${selected.size}/50`)}{catalog.currency&&` · ${catalog.currency} / ${t("1M tokens · directory quote","百万 Token · 目录报价")}`}</p>
      {catalog.partial&&<p className={styles.catalogSummary}>{t("This provider returned a partial list. Missing models can be entered manually.","服务商只返回了部分清单，缺少的模型可手动填写。")}</p>}
      <div className={styles.catalogList}>
        {results.slice(0,limit).map(({model,family,textCapability})=><label className={styles.catalogRow} key={model.id}>
          <input type="checkbox" aria-label={t(`Select ${model.id}`,`选择 ${model.id}`)} checked={selected.has(model.id)} disabled={!selected.has(model.id)&&selected.size>=50} onChange={event=>setSelected(current=>{const next=new Set(current);if(event.target.checked)next.add(model.id);else next.delete(model.id);return next;})}/>
          <span><strong data-no-translate>{model.name}</strong><code data-no-translate>{model.id}</code>
            <small>{[family,model.contextWindow?`${model.contextWindow.toLocaleString()} ${t("context","上下文")}`:"",textCapability==="unknown"?t("Text support unverified","文本能力待确认"):""].filter(Boolean).join(" · ")}</small>
            <small>{!available.has(model.id)?t("Not in this list · saved pricing kept","清单未返回 · 保留已存计价"):model.inputPrice===undefined&&model.outputPrice===undefined?t("Pricing unavailable","价格未知"):`${t("In","输入")} ${money(model.inputPrice)} · ${t("Out","输出")} ${money(model.outputPrice)}`}{model.priceEstimateLimited&&` · ${t("Conditional / extra charges","条件或额外计费")}`}</small>
          </span>
        </label>)}
        {!results.length&&<p className={styles.catalogSummary}>{t("No matches. Try another keyword or filter.","没有匹配结果，试试其他关键词或筛选条件。")}</p>}
      </div>
      {results.length>limit&&<button className="text-button" type="button" onClick={()=>setLimit(value=>value+50)}>{t("Show 50 more","再显示 50 个")}</button>}
    </form>
  </FormSheet>;
}
