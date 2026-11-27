"use client";
import { useRef } from "react";
import { FormSheet } from "@/components/form-sheet";
import { Icon } from "@/components/icons";
import { useLocale } from "@/components/locale-controller";
import { importantDateDisplay,importantDateDateLabel,importantDateStats,type ImportantDate } from "@/lib/important-dates";
import { DateBackground,useDateBackgroundImage } from "./date-background";
import styles from "./days.module.css";

export function DatePreview({item,rect,today,onClose,onEdit}:{item:ImportantDate;rect:DOMRect;today:string;onClose:()=>void;onEdit:()=>void}){
  const {english}=useLocale(),display=importantDateDisplay(item,today,english),stats=importantDateStats(item,today),animated=useRef(false);
  const photo=useDateBackgroundImage(item),hasPhoto=item.background?.kind==="photo";
  return <FormSheet bare className={styles.photoPreview} title={english?"Date preview":"日子预览"} onClose={onClose} dirty={false}>
    <article className={`${styles.themeCard} ${styles.expandedCard}`} data-photo={hasPhoto||undefined} ref={node=>{
      if(!node||animated.current)return;animated.current=true;
      const target=node.getBoundingClientRect(),reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const transform=`translate(${rect.left+rect.width/2-target.left-target.width/2}px,${rect.top+rect.height/2-target.top-target.height/2}px) scale(${rect.width/target.width},${rect.height/target.height})`;
      node.style.setProperty("--preview-origin",transform);
      if(!reduce)node.animate([{transform,opacity:.5},{transform:"none",opacity:1}],{duration:280,easing:"cubic-bezier(0.23, 1, 0.32, 1)"});
    }}>
      {hasPhoto?<div className={styles.fullPhoto}>
        {/* The cached data URL is displayed intact; the thumbnail crop does not apply here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo?<img src={photo} alt={item.title} draggable={false}/>:<span className={styles.photoPlaceholder}><Icon name="media"/></span>}
      </div>:<DateBackground item={item}/>}
      <div className={styles.previewInformation}>
      <header><span>{item.category}</span><h2 className="user-content">{item.title}</h2></header>
      <div className={styles.themeCount}><strong data-large={display.text.length>10}>{display.text}</strong>{display.unit&&<span>{display.unit}</span>}</div>
      <footer><span>{english?"Starting date":"起始日"}</span><time dateTime={item.date}>{importantDateDateLabel(item,english)}</time>{(display.ordinal||item.displayMode==="elapsed")&&item.recurrence!=="none"&&stats.next&&<small>{english?"Next occurrence":"下一次"} · {stats.next.replaceAll("-","/")}</small>}</footer>
      </div>
    </article>
    <div className={styles.previewActions}><button type="button" className="text-button" onClick={onEdit}><Icon name="edit"/>{english?"Edit date":"编辑日子"}</button></div>
    {item.note&&<p className={`${styles.previewNote} user-content`}>{item.note}</p>}
  </FormSheet>;
}
