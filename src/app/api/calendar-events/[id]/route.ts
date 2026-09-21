import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { deleteCalendarEvent, getCalendarEvent, updateCalendarEvent } from "@/lib/services/calendar-event";
import { parseCalendarEventPatch } from "@/lib/validation";

export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export async function GET(_:NextRequest,{params}:Context){try{const item=await getCalendarEvent(parseId((await params).id));return item?NextResponse.json(item):NextResponse.json({error:"Calendar event not found"},{status:404});}catch(error){return apiError(error);}}
export async function PATCH(request:NextRequest,{params}:Context){try{return NextResponse.json(await updateCalendarEvent(parseId((await params).id),parseCalendarEventPatch(await request.json())));}catch(error){return apiError(error);}}
export async function DELETE(_:NextRequest,{params}:Context){try{return await deleteCalendarEvent(parseId((await params).id))?new NextResponse(null,{status:204}):NextResponse.json({error:"Calendar event not found"},{status:404});}catch(error){return apiError(error);}}
