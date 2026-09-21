import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createCalendarEvent, listCalendarEvents } from "@/lib/services/calendar-event";
import { parseNewCalendarEvent, ValidationError } from "@/lib/validation";
import type { CalendarEventStatus } from "@/lib/types";

export const runtime="nodejs";
export async function GET(request:NextRequest){try{const p=request.nextUrl.searchParams,limit=p.get("limit")?Number(p.get("limit")):undefined;if(limit!==undefined&&(!Number.isSafeInteger(limit)||limit<1||limit>500))throw new ValidationError("数量格式不正确");const status=p.get("status")||undefined;if(status&&!(["confirmed","tentative","cancelled"] as string[]).includes(status))throw new ValidationError("事件状态格式不正确");return NextResponse.json(await listCalendarEvents({query:p.get("q")?.trim()||undefined,from:p.get("from")||undefined,to:p.get("to")||undefined,status:status as CalendarEventStatus|undefined,limit}));}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){try{return NextResponse.json(await createCalendarEvent(parseNewCalendarEvent(await request.json())),{status:201});}catch(error){return apiError(error);}}
