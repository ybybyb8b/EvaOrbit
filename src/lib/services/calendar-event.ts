import "server-only";

import { ConflictError } from "../errors";
import { getRepository } from "../repositories";
import type { CalendarEventListInput, CalendarEventPatch, NewCalendarEvent } from "../repositories/types";
import { ValidationError } from "../validation";

export async function listCalendarEvents(input:CalendarEventListInput={}){return(await getRepository()).listCalendarEvents(input);}
export async function getCalendarEvent(id:number){return(await getRepository()).getCalendarEvent(id);}
export async function createCalendarEvent(input:NewCalendarEvent){return(await getRepository()).createCalendarEvent(input);}
export async function updateCalendarEvent(id:number,input:CalendarEventPatch){const repository=await getRepository(),current=await repository.getCalendarEvent(id);if(!current)throw new ConflictError("Calendar event not found.");const next={...current,...input},dateOnly=/^\d{4}-\d{2}-\d{2}$/;if(next.endAt<=next.startAt)throw new ValidationError("结束时间必须晚于开始时间");if(next.isAllDay&&(!dateOnly.test(next.startAt)||!dateOnly.test(next.endAt)))throw new ValidationError("全天事件必须使用日期边界");if(!next.isAllDay&&(dateOnly.test(next.startAt)||dateOnly.test(next.endAt)))throw new ValidationError("定时事件必须使用 ISO date-time");return repository.updateCalendarEvent(id,input);}
export async function deleteCalendarEvent(id:number){return(await getRepository()).deleteCalendarEvent(id);}
