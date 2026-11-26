"use client";
import type { ComponentType } from "react";
import { useLocale } from "./locale-controller";
import { importantDateStats, type ImportantDate } from "@/lib/important-dates";
import styles from "@/app/days/days.module.css";

export function HomeImportantDates({items,date,Link}:{items:ImportantDate[];date:string;Link:ComponentType<{href:string;className?:string;children?:React.ReactNode}>}) {
  const {english}=useLocale();
  if(!items.length)return null;
  return <section className={styles.home} aria-label={english?"Days":"如期"}><header><h2>{english?"Days":"如期"}</h2><Link href="/days">{english?"All dates":"全部日子"}</Link></header><div>{items.map(item=>{
    const {remaining,elapsed}=importantDateStats(item,date),value=remaining===null?elapsed:Math.abs(remaining);
    return <Link href="/days" key={item.id} className={styles.homeDate}><span className="user-content">{item.title}</span><strong>{remaining===0?english?"Today":"今天":`${remaining!==null&&remaining>0?english?"In ":"还有 ":english?"Since ":"已过 "}${value.toLocaleString(english?"en-US":"zh-CN")}${english?" days":" 天"}`}</strong></Link>;
  })}</div></section>;
}
