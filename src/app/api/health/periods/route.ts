import { NextRequest,NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createMenstrualPeriod,listMenstrualPeriods } from "@/lib/services/period-medication";
import { parseNewMenstrualPeriod } from "@/lib/validation";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{const limit=Number(request.nextUrl.searchParams.get("limit")??100);return NextResponse.json(await listMenstrualPeriods({from:request.nextUrl.searchParams.get("from")??undefined,to:request.nextUrl.searchParams.get("to")??undefined,limit:Number.isSafeInteger(limit)?limit:100}));}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){try{return NextResponse.json(await createMenstrualPeriod(parseNewMenstrualPeriod(await request.json())),{status:201});}catch(error){return apiError(error);}}
