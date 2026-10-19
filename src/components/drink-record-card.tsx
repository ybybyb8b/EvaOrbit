"use client";
import {useLocale} from "./locale-controller";
import {translateUiCopy} from "@/lib/ui-copy";
import {compactDateTimeValue} from "./date-time-field";
import {drinkRecordName,drinkTypeLabels} from "@/lib/drink-display";
import {placeRecordLabel} from "@/lib/place-menu";
import {Icon} from "./icons";
import type {DrinkLog} from "@/lib/types";
import {temperatureLabels,tasteLabels} from "@/lib/drink-record-labels";
import type {ComponentType,ReactNode} from "react";
import styles from "@/app/drinks/drink-place.module.css";
function momentLabel(log:DrinkLog,showDate:boolean,dateOnlyLabel:string){const compact=compactDateTimeValue(log.occurredAt,log.occurredHasExplicitTime);const date=compact.slice(0,10);const time=compact.length>10?compact.slice(11,16):dateOnlyLabel;return showDate?`${date} · ${time}`:time;}
export function DrinkRecordCard({log,onEdit,showDate=false,LinkComponent:Link,readOnly=false}:{log:DrinkLog;onEdit:(log:DrinkLog)=>void;showDate?:boolean;LinkComponent:ComponentType<{href:string;className?:string;children:ReactNode}>;readOnly?:boolean}){const {english}=useLocale();const t=(value:string)=>translateUiCopy(value,english?"en":"zh-CN");const specifications=[log.consumedVolumeMl!=null?`${log.consumedVolumeMl.toFixed(2)} ml`:"",t(log.sugarLevel),log.temperature?t(temperatureLabels[log.temperature]):""].filter(Boolean).join(" · ");const assessment=[log.rating?t(tasteLabels[log.rating]):"",log.kcalMin!==null&&log.kcalMax!==null?`${log.kcalMin}–${log.kcalMax} kcal`:log.estimatedKcal!==null?`${english?"About":"约"} ${log.estimatedKcal} kcal`:t("未估算热量")].filter(Boolean).join(" · ");return <article className="drink-record-card"><button className="drink-record-main" onClick={()=>onEdit(log)}><div className="drink-record-copy"><span>{t(drinkTypeLabels[log.drinkType])} · {momentLabel(log,showDate,t("日期记录"))}</span><h2 className="user-content">{log.drinkMenuName?.trim()||log.name.trim()?drinkRecordName(log):t(drinkRecordName(log))}</h2><small className="drink-record-specifications">{specifications}</small><small className="drink-record-assessment">{assessment}</small></div></button><button className="drink-record-edit" aria-label={`${readOnly?"View":"编辑"} ${drinkRecordName(log)}`} onClick={()=>onEdit(log)}><Icon name={readOnly?"arrow":"edit"}/></button>{log.foodPlaceId&&log.foodPlaceName&&<Link className={`${styles.link} user-content`} href={`/food/places/${log.foodPlaceId}`}>{placeRecordLabel(log)}</Link>}</article>;}
