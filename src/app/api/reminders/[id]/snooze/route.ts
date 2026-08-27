import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { snoozeReminder } from "@/lib/services/reminder";
import { ValidationError } from "@/lib/validation";
export const runtime="nodejs";type Context={params:Promise<{id:string}>};
export async function POST(request:NextRequest,{params}:Context){try{const body=await request.json();if(!["later_today","tomorrow","custom"].includes(body.choice))throw new ValidationError("Snooze choice is invalid");return NextResponse.json(await snoozeReminder(parseId((await params).id),body.choice,body.custom));}catch(error){return apiError(error);}}
