import { dateInEvaOrbit, shiftDate, zonedDateTimeToUtc, EVAORBIT_TIME_ZONE } from "./time.ts";

export type ImportantDateInput = {
  title: string;
  date: string;
  recurrence: "none" | "yearly";
  category: string;
  categoryColor?: string | null;
  note: string;
  pinned: boolean;
  archived: boolean;
  reminderTime: string | null;
  reminderDaysBefore: number;
};
export type ImportantDate = ImportantDateInput & { id: number; createdAt: string; updatedAt: string };
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
  return { id: Number(row.id), title: String(row.title), date: String(row.date), recurrence: row.recurrence as ImportantDate["recurrence"], category: String(row.category), ...(row.category_color !== undefined ? {categoryColor: row.category_color ? String(row.category_color) : null} : {}), note: String(row.note), pinned: Boolean(row.pinned), archived: Boolean(row.archived), reminderTime: row.reminder_time ? String(row.reminder_time).slice(0, 5) : null, reminderDaysBefore: Number(row.reminder_days_before), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

export function importantDateToRow(input: ImportantDateInput) {
  return { title: input.title, date: input.date, recurrence: input.recurrence, category: input.category, note: input.note, pinned: input.pinned, archived: input.archived, reminder_time: input.reminderTime, reminder_days_before: input.reminderDaysBefore };
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

export function nextImportantDate(item: Pick<ImportantDateInput, "date" | "recurrence">, today = dateInEvaOrbit()): string | null {
  if (item.recurrence === "none" || item.date >= today) return item.date;
  const year = Number(today.slice(0, 4));
  const candidate = importantDateInYear(item.date, year);
  return candidate >= today ? candidate : year < 9999 ? importantDateInYear(item.date, year + 1) : null;
}

export function importantDateStats(item: Pick<ImportantDateInput, "date" | "recurrence">, today = dateInEvaOrbit()) {
  const next = nextImportantDate(item, today);
  return { next, remaining: next ? calendarDayDifference(today, next) : null, elapsed: calendarDayDifference(item.date, today), years: next ? Number(next.slice(0, 4)) - Number(item.date.slice(0, 4)) : 0 };
}

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
