import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getInsightRunStatus, listInsightRunStatus, requestInsightAnalysis } from "@/lib/services/insight-runs";
import { z } from "zod";
import { ValidationError } from "@/lib/validation";

export const runtime="nodejs";
export const maxDuration=60;
export async function GET(request:NextRequest){
  try{const date=request.nextUrl.searchParams.get("date");return NextResponse.json(date===null?await listInsightRunStatus():await getInsightRunStatus(`day/${date}`));}
  catch(error){return apiError(error);}
}
export async function POST(request:NextRequest){
  try{const input=z.object({date:z.string(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict().safeParse(await request.json());
    if(!input.success)throw new ValidationError("请选择日期并重新检查记录。");
    return NextResponse.json(await requestInsightAnalysis(input.data.date,input.data.fingerprint));
  }catch(error){return apiError(error);}
}
