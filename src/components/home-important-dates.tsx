"use client";
import type { ComponentType } from "react";
import { useLocale } from "./locale-controller";
import { importantDateStats, importantDateDisplay, sortImportantDates, type ImportantDate } from "@/lib/important-dates";
import styles from "@/app/days/days.module.css";

export function HomeImportantDates({items,date,Link}:{items:ImportantDate[];date:string;Link:ComponentType<{href:string;className?:string;children?:React.ReactNode}>}) {
  const {english}=useLocale();
  const featured=sortImportantDates(items.filter(item=>!item.archived&&(item.pinned||(importantDateStats(item,date).remaining??-1)>=0)),date).slice(0,1);
  return <section className={styles.home} aria-label={english?"Days":"如期"}><header><h2>{english?"Days":"如期"}</h2><Link href="/days">{english?"All dates":"全部日子"}</Link></header><div>{featured.map(item=>{
    const display=importantDateDisplay(item,date,english);
    return <Link href="/days" key={item.id} className={styles.homeDate}><span className={styles.homeDateCopy}><span className="user-content">{item.title}</span>{item.category&&<small className="user-content">{item.category}</small>}</span><span className={styles.homeCountdown}><strong>{display.text}</strong><small>{display.unit}</small></span></Link>;
  })}{!featured.length&&<Link href="/days" className={styles.homeDate}>{english?"Add a date to look forward to":"添加一个值得期待的日子"}</Link>}</div></section>;
}
