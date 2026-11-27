"use client";

import { useLocale } from "@/components/locale-controller";
import { featuredImportantDates, importantDateDisplay, type ImportantDate } from "@/lib/important-dates";
import { lunarMonthLabel,lunarDayLabel } from "@/lib/lunar-calendar";
import { DateBackground } from "./date-background";
import styles from "./days.module.css";

export function FeaturedDates({items,today,onEdit}:{items:ImportantDate[];today:string;onEdit:(item:ImportantDate,rect:DOMRect)=>void}) {
  const candidates=featuredImportantDates(items,today);
  const {english}=useLocale();
  const [current,left,right]=candidates;
  if(!current) return null;
  function card(item:ImportantDate|undefined,position:"left"|"center"|"right") {
    if(!item) return <span key={position} />;
    const display=importantDateDisplay(item,today,english),value=display.value;
    return <button key={position} type="button" data-feature-card data-position={position} className={styles.featureCard} data-photo={item.background?.kind==="photo"||undefined} data-long={item.title.length>18||undefined}
      aria-label={`${item.title} · ${english?"Preview date":"预览日子"}`}
      onClick={event=>onEdit(item,event.currentTarget.getBoundingClientRect())}>
      {item.background?.kind==="photo"?<span aria-hidden="true" className={styles.featureCover}><DateBackground item={item}/></span>:<DateBackground item={item}/>}
      <span className={styles.featureContent}>
      <span className={`${styles.featureTitle} user-content`} title={item.title}>{item.title}</span>
      <span className={styles.featureMeta}><time dateTime={item.date}>{item.calendar==="lunar"&&item.lunar?(english?`Lunar ${item.lunar.leap?"L":""}${item.lunar.month}/${item.lunar.day}`:`农历 ${lunarMonthLabel(item.lunar.month,item.lunar.leap)}${lunarDayLabel(item.lunar.day)}`):item.date.replaceAll("-","/")}</time>{item.category&&<span>{item.category}</span>}</span>
      <strong data-ordinal={display.ordinal||undefined} data-large={value>=10000} data-million={value>=1000000} data-today={display.isToday}>{display.text}</strong>
      {display.unit&&<span className={styles.featureUnit}>{display.unit}</span>}
      </span>
    </button>;
  }
  return <section className={styles.featured} aria-label={english?"Featured dates":"精选日子"}>
    <div className={styles.featureDeck} data-count={candidates.length}>{card(left,"left")}{card(current,"center")}{card(right,"right")}</div>
  </section>;
}
