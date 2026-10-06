import "server-only";
import { parseCalendarInterpretation } from "../calendar-interpretation";
import { getRepository } from "../repositories";
import { dateInEvaOrbit, dateRange, shiftDate } from "../time";
import { ValidationError } from "../validation";
import { reiconNames } from "../reicon-catalog";

export async function getCalendarInterpretationOverview() {
  const repository = await getRepository(), today = dateInEvaOrbit();
  const [settings, records] = await Promise.all([
    repository.getCalendarInterpretation(),
    repository.listCalendarEvents({ from: shiftDate(today, -30), to: dateRange(shiftDate(today, 1)).to, limit: 500 }),
  ]);
  return { settings, records: records.filter(record => record.status !== "cancelled").sort((a, b) => b.startAt.localeCompare(a.startAt)).slice(0, 50) };
}

export async function saveCalendarInterpretation(value: unknown) {
  let settings;
  try { settings = parseCalendarInterpretation(value); }
  catch (error) { throw new ValidationError(error instanceof Error ? error.message : "日历解读格式不正确"); }
  if (settings.categories.some(category => category.icon)) {
    const names = new Set(await reiconNames());
    if (settings.categories.some(category => category.icon && !names.has(category.icon))) throw new ValidationError("图标不存在，请重新选择 Reicon 图标");
  }
  return (await getRepository()).updateCalendarInterpretation(settings);
}
