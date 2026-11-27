"use client";
import { useState } from "react";
import { ChoiceSelect } from "@/components/choice-select";
import { useLocale } from "@/components/locale-controller";
import type { ImportantDateInput } from "@/lib/important-dates";
import { lunarMonths,lunarToSolar,solarToLunar,lunarMinYear,lunarMaxYear,lunarMonthLabel,lunarDayLabel,lunarDateLabel,type LunarDate } from "@/lib/lunar-calendar";
import styles from "./days.module.css";

export function DateCalendarFields({value,onChange}:{value:ImportantDateInput;onChange:(patch:Partial<ImportantDateInput>)=>void}){
  const {english}=useLocale(),[notice,setNotice]=useState("");
  const calendar=value.calendar??"solar",lunar=value.lunar;
  function changeCalendar(next:"solar"|"lunar"){
    setNotice("");
    if(next==="solar"){onChange({calendar:next,lunar:null,lunarLeapPolicy:"regular"});return;}
    const converted=solarToLunar(value.date);
    if(!converted){setNotice(english?"Choose a Gregorian date within lunar years 1901–2100 first.":"请先选择农历 1901—2100 年范围内的公历日期。原日期已保留。 ");return;}
    onChange({calendar:next,lunar:converted,lunarLeapPolicy:"regular"});
  }
  function changeLunar(patch:Partial<LunarDate>){
    if(!lunar)return;
    const next={...lunar,...patch};
    const months=lunarMonths(next.year);
    const month=months.find(month=>month.month===next.month&&month.leap===next.leap)??months.find(month=>month.month===next.month);
    if(!month)return;
    const adjusted=next.leap!==month.leap||next.day>month.days;
    next.leap=month.leap;next.day=Math.min(next.day,month.days);
    const date=lunarToSolar(next);if(!date)return;
    onChange({date,lunar:next});
    setNotice(adjusted?(english?`Adjusted to ${lunarDateLabel(next,true)} for this year's month length or leap month.`:`按该年的闰月和大小月，已调整为${lunarDateLabel(next)}。`):"");
  }
  const month=lunar&&lunarMonths(lunar.year).find(month=>month.month===lunar.month&&month.leap===lunar.leap);
  return <>
    <label className="field"><span>{english?"Calendar":"历法"}</span><ChoiceSelect value={calendar} onChange={event=>changeCalendar(event.target.value as "solar"|"lunar")}><option value="solar">{english?"Gregorian":"公历"}</option><option value="lunar">{english?"Chinese lunar":"农历"}</option></ChoiceSelect></label>
    {calendar==="solar"?<label className="field"><span>{english?(value.recurrence!=="none"?"Original date":"Date"):(value.recurrence!=="none"?"原始日期":"日期")}</span><input type="date" required min="0100-01-01" max="9999-12-31" value={value.date} onChange={event=>onChange({date:event.target.value})}/></label>:lunar&&<>
      <div className={styles.lunarFields}>
        <label className="field"><span>{english?"Lunar year":"农历年份"}</span><select aria-label={english?"Lunar year":"农历年份"} required value={lunar.year} onChange={event=>changeLunar({year:Number(event.target.value)})}>{Array.from({length:lunarMaxYear-lunarMinYear+1},(_,index)=>lunarMinYear+index).map(year=><option key={year} value={year}>{year}</option>)}</select></label>
        <label className="field"><span>{english?"Lunar month":"农历月份"}</span><select aria-label={english?"Lunar month":"农历月份"} required value={lunar.leap?-lunar.month:lunar.month} onChange={event=>changeLunar({month:Math.abs(Number(event.target.value)),leap:Number(event.target.value)<0})}>{lunarMonths(lunar.year).map(month=><option key={month.leap?-month.month:month.month} value={month.leap?-month.month:month.month}>{lunarMonthLabel(month.month,month.leap,english)}</option>)}</select></label>
        <label className="field"><span>{english?"Lunar day":"农历日期"}</span><select aria-label={english?"Lunar day":"农历日期"} required value={lunar.day} onChange={event=>changeLunar({day:Number(event.target.value)})}>{Array.from({length:month?.days??29},(_,index)=>index+1).map(day=><option key={day} value={day}>{english?day:lunarDayLabel(day)}</option>)}</select></label>
      </div>
      <p className={styles.hint}>{english?"Gregorian equivalent: ":"对应公历："}<time dateTime={value.date}>{value.date.replaceAll("-","/")}</time>{english?" · Lunar years 1901–2100":" · 农历支持 1901—2100 年"}</p>
    </>}
    {notice&&<p className={styles.hint} role="status">{notice}</p>}
  </>;
}
