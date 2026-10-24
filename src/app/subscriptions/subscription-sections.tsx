"use client";
import Link from "next/link";
import { useLocale } from "@/components/locale-controller";
import styles from "./subscription-sections.module.css";
export function SubscriptionSections({active,onViewChange}:{active:"overview"|"trends"|"library";onViewChange?:(view:"overview"|"trends")=>void}){
 const {english}=useLocale();
 const sections=[{key:"overview",href:"/subscriptions?view=overview",label:english?"Overview":"订阅首页"},{key:"trends",href:"/subscriptions?view=trends",label:english?"Trends":"趋势统计"},{key:"library",href:"/subscriptions/library",label:english?"Library":"软件库"}] as const;
 return <nav className={styles.sections} aria-label={english?"Subscriptions sections":"订阅分区"}>{sections.map(section=>onViewChange&&section.key!=="library"?<button key={section.key} aria-pressed={active===section.key} onClick={()=>onViewChange(section.key as "overview"|"trends")}>{section.label}</button>:<Link key={section.key} href={section.href} aria-current={active===section.key?"page":undefined}>{section.label}</Link>)}</nav>;
}
