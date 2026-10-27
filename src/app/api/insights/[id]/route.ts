import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { ValidationError } from "@/lib/validation";
import { getInsightReportDetail, listInsightVersionHistory, getInsightSourceEvidence, deleteInsightReport } from "@/lib/services/insight-reports";

export const runtime="nodejs";
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try {
    const{id}=await params,version=request.nextUrl.searchParams.get("version"),before=request.nextUrl.searchParams.get("beforeVersion"),evidenceId=request.nextUrl.searchParams.get("evidence");
    return NextResponse.json(evidenceId!==null?await getInsightSourceEvidence(id,Number(version),evidenceId):before!==null?await listInsightVersionHistory(id,Number(before)):await getInsightReportDetail(id,version===null?undefined:Number(version)));
  }catch(error){return apiError(error);}
}
export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{if(!request.nextUrl.searchParams.has("generation"))throw new ValidationError("删除操作需要当前执行状态，请刷新后重试。");
    const{id}=await params;return NextResponse.json(await deleteInsightReport(id,Number(request.nextUrl.searchParams.get("version")),Number(request.nextUrl.searchParams.get("generation"))));}
  catch(error){return apiError(error);}
}
