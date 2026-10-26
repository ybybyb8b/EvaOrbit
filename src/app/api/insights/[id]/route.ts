import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getInsightReportDetail, listInsightVersionHistory, getInsightSourceEvidence } from "@/lib/services/insight-reports";

export const runtime="nodejs";
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try {
    const{id}=await params,version=request.nextUrl.searchParams.get("version"),before=request.nextUrl.searchParams.get("beforeVersion"),evidenceId=request.nextUrl.searchParams.get("evidence");
    return NextResponse.json(evidenceId!==null?await getInsightSourceEvidence(id,Number(version),evidenceId):before!==null?await listInsightVersionHistory(id,Number(before)):await getInsightReportDetail(id,version===null?undefined:Number(version)));
  }catch(error){return apiError(error);}
}
