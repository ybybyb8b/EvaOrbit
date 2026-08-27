import { NextRequest,NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getDueReminders } from "@/lib/services/reminder";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{const limit=Math.min(50,Math.max(1,Number(request.nextUrl.searchParams.get("limit")??50)));return NextResponse.json(await getDueReminders(limit));}catch(error){return apiError(error);}}
