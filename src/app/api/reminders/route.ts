import { NextRequest,NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { parseReminder } from "@/lib/cats-validation";
import { createReminder,listReminders } from "@/lib/services/reminder";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{const p=request.nextUrl.searchParams;const targetId=p.get("targetId");return NextResponse.json(await listReminders({targetType:p.get("targetType")??undefined,targetId:targetId?Number(targetId):undefined,activeOnly:p.get("active")==="1"}));}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){try{return NextResponse.json(await createReminder(parseReminder(await request.json())),{status:201});}catch(error){return apiError(error);}}
