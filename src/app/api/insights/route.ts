import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { ValidationError } from "@/lib/validation";
import { generateRuleInsightReport, listInsightReports, publishInsightReport, getInsightReportForDate } from "@/lib/services/insight-reports";

export const runtime = "nodejs";
export const maxDuration = 60;
const writeSchema=z.discriminatedUnion("mode",[
  z.object({mode:z.literal("rules"),command:z.unknown()}).strict(),
  z.object({mode:z.literal("publish"),command:z.unknown(),snapshot:z.unknown()}).strict(),
]);
export async function GET(request: NextRequest) {
  try {const date=request.nextUrl.searchParams.get("date");return NextResponse.json(date!==null?await getInsightReportForDate(date):await listInsightReports({periodType:request.nextUrl.searchParams.get("period")??undefined,before:request.nextUrl.searchParams.get("before")??undefined}));}
  catch(error){return apiError(error);}
}
export async function POST(request: NextRequest) {
  try {
    const input=writeSchema.safeParse(await request.json());
    if(!input.success)throw new ValidationError("报告操作参数无效。");
    return NextResponse.json(input.data.mode==="rules"?await generateRuleInsightReport(input.data.command):await publishInsightReport(input.data.command,input.data.snapshot));
  }catch(error){return apiError(error);}
}
