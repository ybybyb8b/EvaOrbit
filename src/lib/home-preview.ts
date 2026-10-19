import type { HomeReadonlyResource, HomeResourceKind } from "./home-readonly";
import { defaultCalendarInterpretation } from "./calendar-interpretation";
import { dateInEvaOrbit } from "./time";

/** Explicit synthetic browser preview only. Never used for a real account. */
export function previewHomeResource(accountId: string, kind: HomeResourceKind, key: string): HomeReadonlyResource {
  if (key === "latest") key = dateInEvaOrbit();
  const capturedAt = new Date().toISOString();
  const day = { date:key, events:[], tasks:[{id:1,title:"Sample task · Local preview",completed:false,dueTime:null,priority:"medium"}], meals:[], journal:[{id:1,date:key,content:"Sample day note · Preview data stays on this device.",moodScore:null,energyLevel:2 as const,hasFullDiary:false,emotion:"neutral" as const,createdAt:capturedAt,updatedAt:capturedAt}], sleep:null,activities:[],activityRecords:[],calendarInterpretation:defaultCalendarInterpretation() };
  return {format:"eo-home-readonly-v1",accountId,kind,key,capturedAt,data:kind==="day"?day:kind==="month"?{month:key,days:{},periods:[]}:[],icons:{}};
}
