import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getInsightRunStatus, listInsightRunStatus } from "@/lib/services/insight-runs";

export const runtime="nodejs";
export async function GET(request:NextRequest){
  try{const date=request.nextUrl.searchParams.get("date");return NextResponse.json(date===null?await listInsightRunStatus():await getInsightRunStatus(`day/${date}`));}
  catch(error){return apiError(error);}
}
