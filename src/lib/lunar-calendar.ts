import { lunarYears } from "./lunar-calendar-data.ts";
import { shiftDate } from "./time.ts";

export type LunarDate={year:number;month:number;day:number;leap:boolean};
export const lunarMinYear=1901,lunarMaxYear=2100;
const monthNames=["正月","二月","三月","四月","五月","六月","七月","八月","九月","十月","冬月","腊月"];
const monthCache=new Map<number,ReturnType<typeof buildMonths>>();
function buildMonths(year:number){
  const row=lunarYears[year-lunarMinYear];
  if(!Number.isInteger(year)||!row)return [];
  const [start,leapMonth,bits]=row;let offset=0,index=0;
  const months:{month:number;leap:boolean;days:number;date:string}[]=[];
  for(let month=1;month<=12;month++)for(const leap of month===leapMonth?[false,true]:[false]){
    const days=29+((bits>>index++)&1);months.push({month,leap,days,date:shiftDate(start,offset)});offset+=days;
  }
  return months;
}
export function lunarMonths(year:number){if(!Number.isInteger(year)||year<lunarMinYear||year>lunarMaxYear)return [];if(!monthCache.has(year))monthCache.set(year,buildMonths(year));return monthCache.get(year)!;}
export function lunarToSolar(value:LunarDate,clampDay=false):string|null{
  const month=lunarMonths(value.year).find(month=>month.month===value.month&&month.leap===value.leap);
  if(!month||!Number.isInteger(value.day)||value.day<1||value.day>30||(!clampDay&&value.day>month.days))return null;
  return shiftDate(month.date,Math.min(value.day,month.days)-1);
}
export function solarToLunar(date:string):LunarDate|null{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(`${date}T12:00:00Z`))||new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date)return null;
  const year=lunarYears.findLastIndex(row=>row[0]<=date)+lunarMinYear;
  if(year<lunarMinYear)return null;
  const month=lunarMonths(year).findLast(month=>month.date<=date);
  if(!month)return null;
  const day=Math.round((Date.parse(`${date}T12:00:00Z`)-Date.parse(`${month.date}T12:00:00Z`))/86400000)+1;
  return day<=month.days?{year,month:month.month,day,leap:month.leap}:null;
}
export function lunarMonthLabel(month:number,leap:boolean,english=false){return english?`${leap?"Leap ":""}month ${month}`:`${leap?"闰":""}${monthNames[month-1]}`;}
export function lunarDayLabel(day:number){return day<=10?`初${"一二三四五六七八九十"[day-1]}`:day<20?`十${"一二三四五六七八九"[day-11]}`:day===20?"二十":day<30?`廿${"一二三四五六七八九"[day-21]}`:"三十";}
export function lunarDateLabel(value:LunarDate,english=false){return english?`Lunar ${value.year} · ${lunarMonthLabel(value.month,value.leap,true)} · ${value.day}`:`农历 ${value.year}年${lunarMonthLabel(value.month,value.leap)}${lunarDayLabel(value.day)}`;}
