import { NextRequest,NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createMenstrualFlowRecord,listMenstrualFlowRecords,listPendingMenstrualFlowRecords } from "@/lib/services/period-medication";
import { parseNewMenstrualFlowRecord } from "@/lib/validation";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{const q=request.nextUrl.searchParams;if(q.get("healthKitPending")==="true")return NextResponse.json(await listPendingMenstrualFlowRecords());const limit=Number(q.get("limit")??100),periodId=Number(q.get("periodId"));return NextResponse.json(await listMenstrualFlowRecords({periodId:Number.isSafeInteger(periodId)&&periodId>0?periodId:undefined,from:q.get("from")??undefined,to:q.get("to")??undefined,limit:Number.isSafeInteger(limit)?limit:100}));}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){try{return NextResponse.json(await createMenstrualFlowRecord(parseNewMenstrualFlowRecord(await request.json())),{status:201});}catch(error){return apiError(error);}}
