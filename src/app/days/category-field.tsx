"use client";
import { useState,type CSSProperties } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import { useLocale } from "@/components/locale-controller";
import { useBusinessRequest } from "@/components/business-request-context";
import { ErrorNotice } from "@/components/error-notice";
import { responseError } from "@/lib/response-error";
import { importantDateCategoryColor,importantDateColors,type ImportantDateCategory } from "@/lib/important-dates";
import styles from "./days.module.css";

export function CategoryField({value,categories,onChange,onSaved,onEditing,onBusy}:{value:string;categories:ImportantDateCategory[];onChange:(name:string)=>void;onSaved:(category:ImportantDateCategory)=>void;onEditing:(editing:boolean)=>void;onBusy:(busy:boolean)=>void}){
  const {english}=useLocale(),request=useBusinessRequest();
  const [editor,setEditor]=useState<{existing:boolean;name:string;color:string}|null>(null),[error,setError]=useState("");
  const names=[...new Set([...categories.map(item=>item.name),...(value?[value]:[]),...(english?["Anniversaries","Life","Work"]:["纪念日","生活","工作"])])];
  function color(name:string){return importantDateCategoryColor(name,categories.find(item=>item.name===name)?.color);}
  function close(){setEditor(null);onEditing(false);setError("");}
  async function save(){
    if(!editor)return;setError("");if(!editor.name.trim()){setError(english?"Enter a category name":"请填写分类名称");return;}
    if(!editor.existing&&categories.some(item=>item.name===editor.name.trim())){setError(english?"This category already exists. Select it to edit its color.":"分类已存在，请选择该分类后编辑颜色。");return;}
    onBusy(true);
    try{const response=await request("/api/important-dates/categories",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:editor.name.trim(),color:editor.color})});if(!response.ok)throw new Error(await responseError(response,english?"Could not save category":"未能保存分类"));const saved=await response.json() as ImportantDateCategory;onSaved(saved);onChange(saved.name);close();}
    catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{onBusy(false);}
  }
  return <div className="field"><span>{english?"Category":"分类"}</span>
    <SearchableSelect label={english?"Category":"分类"} presentation="dropdown" value={value?`category:${value}`:""} options={[{value:"",label:english?"Uncategorized":"未分类"},...names.map(name=>({value:`category:${name}`,label:name,color:color(name)})),{value:"new",label:english?"New category…":"新建分类……"},...(value?[{value:"edit",label:english?`Edit ${value}…`:`编辑「${value}」……`}]:[])]} onValueChange={next=>{
      if(next==="new"||next==="edit"){const name=next==="edit"?value:"";setEditor({existing:next==="edit",name,color:color(name)});onEditing(true);setError("");}
      else{close();onChange(next.startsWith("category:")?next.slice(9):"");}
    }}/>
    {editor&&<div className={styles.categoryEditor} role="group" aria-label={english?"Edit category":"编辑分类"}>
      <label className="field"><span>{english?"Category name":"分类名称"}</span><input aria-label={english?"Category name":"分类名称"} maxLength={40} value={editor.name} readOnly={editor.existing} onChange={event=>setEditor({...editor,name:event.target.value})}/></label>
      <div className={styles.swatches} role="group" aria-label={english?"Category color":"分类颜色"}>{importantDateColors.map((color,index)=><button type="button" key={color} aria-label={english?`Muted color ${index+1}`:`低饱和配色 ${index+1}`} aria-pressed={editor.color.toLowerCase()===color.toLowerCase()} style={{"--category-color":color} as CSSProperties} onClick={()=>setEditor({...editor,color})}>{editor.color.toLowerCase()===color.toLowerCase()?"✓":""}</button>)}<label className={styles.customColor}><span>{english?"Custom":"自选"}</span><input type="color" aria-label={english?"Custom category color":"自定义分类颜色"} value={editor.color} onChange={event=>setEditor({...editor,color:event.target.value})}/></label></div>
      <p className={styles.hint}>{english?"Saved independently of this event. Every date in this category shares the color.":"分类独立保存；同分类的所有日子共用此颜色，下次选择会自动沿用。"}</p>
      {error&&<ErrorNotice inline>{error}</ErrorNotice>}
      <div className={styles.categoryActions}><button type="button" className="button secondary" onClick={close}>{english?"Cancel":"取消分类修改"}</button><button type="button" className="button primary" onClick={()=>void save()}>{english?"Save category":"保存分类"}</button></div>
    </div>}
  </div>;
}
