"use client";
import {useLocale} from "./locale-controller";
import {useHomeStyle} from "@/lib/home-style";
import vintageStyles from "@/app/home-vintage.module.css";
import type {ReactNode} from "react";
import type {UiLanguage} from "@/lib/locale";
import {EVAORBIT_TIME_ZONE} from "@/lib/time";
import styles from "@/app/home.module.css";
import themeStyles from "@/app/home-theme.module.css";
function dateLabel(english: boolean) {
  if (english) return new Intl.DateTimeFormat("en", { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: EVAORBIT_TIME_ZONE }).format(new Date());
  const parts = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric", weekday: "long", timeZone: EVAORBIT_TIME_ZONE }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}年${value("month")}月${value("day")}日 ${value("weekday")}`;
}

function greeting(english: boolean) {
  const hour = Number(new Intl.DateTimeFormat("en", { hour: "numeric", hourCycle: "h23", timeZone: EVAORBIT_TIME_ZONE }).format(new Date()));
  if (hour < 6) return english ? "Still awake?" : "还没睡吗";
  if (hour < 11) return english ? "Good morning" : "早上好";
  if (hour < 14) return english ? "Good afternoon" : "中午好";
  if (hour < 19) return english ? "Good afternoon" : "下午好";
  return english ? "Good evening" : "晚上好";
}


export function HomePageView({language,due,children}:{language:UiLanguage;due:ReactNode;children:ReactNode}){const variant=useHomeStyle();const {colorTheme}=useLocale();const english=language==="en";return <div className={`page home-page ${variant==="vintage"?`${themeStyles.home} ${vintageStyles.vintage}`:colorTheme==="rosewood"?themeStyles.home:""}`}><header className="home-masthead"><span className={styles.date}>{dateLabel(english)}</span><h1>{greeting(english)}</h1></header>{variant!=="vintage"&&due}<section className={`home-overview ${styles.overview}`}>{children}</section></div>;}
