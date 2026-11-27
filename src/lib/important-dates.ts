import { dateInEvaOrbit, shiftDate, zonedDateTimeToUtc, EVAORBIT_TIME_ZONE } from "./time.ts";
import { lunarToSolar, solarToLunar, lunarMonths, lunarMaxYear, lunarDateLabel, type LunarDate } from "./lunar-calendar.ts";
import { importantDateBackgroundRow,type ImportantDateBackground } from "./important-date-background.ts";

export type ImportantDateInput = {
  title: string;
  date: string;
  calendar?: "solar" | "lunar";
  lunar?: LunarDate | null;
  lunarLeapPolicy?: "regular" | "skip";
  recurrence: "none" | "weekly" | "monthly" | "yearly";
  category: string;
  categoryColor?: string | null;
  note: string;
  pinned: boolean;
  archived: boolean;
  reminderTime: string | null;
  reminderDaysBefore: number;
  background?: ImportantDateBackground;
  displayMode?: "auto" | "elapsed" | "countdown";
  countMode?: "elapsed" | "ordinal";
};
export type ImportantDate = ImportantDateInput & { id: number; createdAt: string; updatedAt: string; backgroundImageVersion?:string|null };
export const importantDateColumns=["id","title","date","recurrence","category","note","pinned","archived","reminder_time","reminder_days_before","created_at","updated_at","calendar_type","lunar_date","lunar_leap_policy","background","background_image_version","count_mode","display_mode"];
export type ImportantDateCategory = { name: string; color: string | null };

export const importantDateColors = ["#897181", "#75846F", "#718597", "#AB896C", "#8A7F9B", "#9C7972"];
export function importantDateCategoryColor(name: string, custom?: string | null) {
  if (custom && /^#[0-9a-f]{6}$/i.test(custom)) return custom;
  const defaults: Record<string,number> = {"纪念日":0,"anniversaries":0,"生日":3,"birthdays":3,"生活":1,"life":1,"工作":2,"work":2,"心愿":4,"wishes":4,"旅行":3,"travel":3};
  const known=defaults[name.trim().toLowerCase()];
  if(known!==undefined) return importantDateColors[known];
  const hash = Array.from(name.trim()).reduce((value, character) => (value * 31 + character.codePointAt(0)!) >>> 0, 0);
  return importantDateColors[hash % importantDateColors.length];
}

export function importantDateFromRow(row: Record<string, unknown>): ImportantDate {
  return { ...(row.display_mode!==undefined?{displayMode:row.display_mode as ImportantDate["displayMode"]}:{}), ...(row.count_mode!==undefined?{countMode:row.count_mode as "elapsed"|"ordinal"}:{}), ...(row.background!==undefined?{background:typeof row.background==="string"?JSON.parse(row.background):row.background as ImportantDateBackground,backgroundImageVersion:row.background_image_version?String(row.background_image_version):null}:{}), id: Number(row.id), title: String(row.title), date: String(row.date), ...(row.calendar_type!==undefined?{calendar:row.calendar_type as "solar"|"lunar",lunar:typeof row.lunar_date==="string"?JSON.parse(row.lunar_date):row.lunar_date as LunarDate|null,lunarLeapPolicy:(row.lunar_leap_policy??"regular") as "regular"|"skip"}:{}), recurrence: row.recurrence as ImportantDate["recurrence"], category: String(row.category), ...(row.category_color !== undefined ? {categoryColor: row.category_color ? String(row.category_color) : null} : {}), note: String(row.note), pinned: Boolean(row.pinned), archived: Boolean(row.archived), reminderTime: row.reminder_time ? String(row.reminder_time).slice(0, 5) : null, reminderDaysBefore: Number(row.reminder_days_before), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

export function importantDateToRow(input: ImportantDateInput) {
  return { ...(input.displayMode!==undefined?{display_mode:input.displayMode}:{}), ...(input.countMode!==undefined?{count_mode:input.countMode}:{}), ...importantDateBackgroundRow(input.background), title: input.title, date: input.date, ...(input.calendar!==undefined?{calendar_type:input.calendar,lunar_date:input.calendar==="lunar"?input.lunar:null,lunar_leap_policy:input.lunarLeapPolicy??"regular"}:{}), recurrence: input.recurrence, category: input.category, note: input.note, pinned: input.pinned, archived: input.archived, reminder_time: input.reminderTime, reminder_days_before: input.reminderDaysBefore };
}

export function calendarDayDifference(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

// February 29 anniversaries fall on February 28 in common years; always derive from the original date.
export function importantDateInYear(date: string, year: number) {
  const month = Number(date.slice(5, 7)), day = Number(date.slice(8, 10));
  const lastDay = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${date.slice(5, 7)}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

type DateCalendar=Pick<ImportantDateInput,"date"|"recurrence"|"calendar"|"lunar"|"lunarLeapPolicy">;
export function nextImportantDate(item: DateCalendar, today = dateInEvaOrbit()): string | null {
  if (item.recurrence === "none" || item.date >= today) return item.date;
  if(item.recurrence==="weekly"){
    const offset=Math.ceil(calendarDayDifference(item.date,today)/7)*7;
    return offset<=calendarDayDifference(item.date,"9999-12-31")?shiftDate(item.date,offset):null;
  }
  if(item.recurrence==="monthly"){
    if(item.calendar==="lunar"&&item.lunar){
      const current=solarToLunar(today);if(!current)return null;
      for(let year=current.year;year<=Math.min(current.year+1,lunarMaxYear);year++)for(const month of lunarMonths(year)){
        const candidate=shiftDate(month.date,Math.min(item.lunar.day,month.days)-1);
        if(candidate>=today&&candidate>=item.date)return candidate;
      }
      return null;
    }
    const index=Number(today.slice(0,4))*12+Number(today.slice(5,7))-1,day=Number(item.date.slice(8,10));
    for(let offset=0;offset<=1;offset++){
      const year=Math.floor((index+offset)/12),month=(index+offset)%12+1;if(year>9999)return null;
      const last=new Date(Date.UTC(year,month,0,12)).getUTCDate();
      const candidate=`${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(Math.min(day,last)).padStart(2,"0")}`;
      if(candidate>=today)return candidate;
    }
    return null;
  }
  if(item.calendar==="lunar"&&item.lunar){
    const current=solarToLunar(today);if(!current)return null;
    for(let year=Math.max(current.year,item.lunar.year);year<=lunarMaxYear;year++){
      const hasLeap=lunarMonths(year).some(month=>month.month===item.lunar!.month&&month.leap);
      if(item.lunar.leap&&!hasLeap&&item.lunarLeapPolicy==="skip")continue;
      const next=lunarToSolar({...item.lunar,year,leap:item.lunar.leap&&hasLeap},true);
      if(next&&next>=today)return next;
    }
    return null;
  }
  const year = Number(today.slice(0, 4));
  const candidate = importantDateInYear(item.date, year);
  return candidate >= today ? candidate : year < 9999 ? importantDateInYear(item.date, year + 1) : null;
}

export function importantDateStats(item: DateCalendar, today = dateInEvaOrbit()) {
  const next = nextImportantDate(item, today);
  const years=next ? item.calendar==="lunar"&&item.lunar ? (solarToLunar(next)?.year??item.lunar.year)-item.lunar.year : Number(next.slice(0,4))-Number(item.date.slice(0,4)) : 0;
  return { next, remaining: next ? calendarDayDifference(today, next) : null, elapsed: calendarDayDifference(item.date, today), years };
}

export function importantDateDateLabel(item:Pick<ImportantDateInput,"date"|"calendar"|"lunar">,english=false){return item.calendar==="lunar"&&item.lunar ? lunarDateLabel(item.lunar,english) : item.date.replaceAll("-","/");}

export function importantDateReminderAt(item: ImportantDateInput, today = dateInEvaOrbit()) {
  if (item.archived || !item.reminderTime) return null;
  const occurrence = nextImportantDate(item, today);
  if (!occurrence || occurrence < today) return null;
  return zonedDateTimeToUtc(shiftDate(occurrence, -item.reminderDaysBefore), item.reminderTime, EVAORBIT_TIME_ZONE);
}

export function sortImportantDates(items: ImportantDate[], today = dateInEvaOrbit(), prioritizePins = true) {
  return [...items].sort((a, b) => (prioritizePins ? Number(b.pinned) - Number(a.pinned) : 0) || rank(a) - rank(b) || a.id - b.id);
  function rank(item: ImportantDate) {
    const days = importantDateStats(item, today).remaining;
    return days === null ? Infinity : days >= 0 ? days : 1_000_000 + Math.abs(days);
  }
}

export function featuredImportantDates(items: ImportantDate[], today = dateInEvaOrbit()) {
  return sortImportantDates(items.filter(item => !item.archived), today).slice(0,3);
}

/** Presentation never changes natural-day sorting, occurrences or reminder scheduling. */
export function importantDateDisplay(item:DateCalendar & Pick<ImportantDateInput,"countMode"|"displayMode">,today:string,english=false){
  const stats=importantDateStats(item,today),mode=item.displayMode??"auto";
  const cumulative=stats.elapsed>=0&&(mode==="elapsed"||mode==="auto"&&item.countMode==="ordinal");
  const ordinal=cumulative&&item.countMode==="ordinal";
  const value=ordinal?stats.elapsed+1:cumulative?stats.elapsed:Math.abs(stats.remaining??stats.elapsed);
  const isToday=!cumulative&&stats.remaining===0;
  const number=value.toLocaleString(english?"en-US":"zh-CN");
  return {value,ordinal,isToday,text:isToday?(english?"Today":"今天"):ordinal?(english?`Day ${number}`:`第 ${number}`):number,unit:ordinal?(english?"":"天"):isToday?"":!cumulative&&stats.remaining!==null&&stats.remaining>0?(english?"days to go":"天后"):(english?"days since":"天前")};
}
