"use client";

import { useLocale } from "@/components/locale-controller";
import { featuredImportantDates, importantDateStats, type ImportantDate } from "@/lib/important-dates";
import styles from "./days.module.css";

export function FeaturedDates({items,today,onEdit}:{items:ImportantDate[];today:string;onEdit:(item:ImportantDate)=>void}) {
  const candidates=featuredImportantDates(items,today);
  const {english}=useLocale();
  const [current,left,right]=candidates;
  if(!current) return null;
  function card(item:ImportantDate|undefined,position:"left"|"center"|"right") {
    if(!item) return <span key={position} />;
    const {remaining,elapsed}=importantDateStats(item,today), value=remaining===null?elapsed:Math.abs(remaining);
    return <button key={position} type="button" data-feature-card data-position={position} className={styles.featureCard}
      aria-label={`${item.title} · ${english?"Edit date":"编辑日子"}`}
      onClick={()=>onEdit(item)}>
      <span className={`${styles.featureTitle} user-content`} title={item.title}>{item.title}</span>
      <span className={styles.featureMeta}><time dateTime={item.date}>{item.date.replaceAll("-","/")}</time>{item.category&&<span>{item.category}</span>}</span>
      <strong data-large={value>=10000} data-million={value>=1000000} data-today={remaining===0}>{remaining===0 ? english?"Today":"今天" : value.toLocaleString(english?"en-US":"zh-CN")}</strong>
      {remaining!==0&&<span className={styles.featureUnit}>{remaining!==null&&remaining>0 ? english?"days to go":"天后" : english?"days since":"天前"}</span>}
    </button>;
  }
  return <section className={styles.featured} aria-label={english?"Featured dates":"精选日子"}>
    <div className={styles.featureDeck} data-count={candidates.length}>{card(left,"left")}{card(current,"center")}{card(right,"right")}</div>
  </section>;
}
