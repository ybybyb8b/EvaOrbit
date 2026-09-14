import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { setSubscriptionStatus } from "@/lib/services/subscription";
import { dateOnly,ValidationError } from "@/lib/validation";
type Context={params:Promise<{id:string}>};
export const runtime="nodejs";
export async function POST(request:NextRequest,{params}:Context){try{const body=await request.json() as Record<string,unknown>;if(!["active","paused","ended"].includes(String(body.status)))throw new ValidationError("订阅状态格式不正确");const next=body.nextRenewalOn?dateOnly(body.nextRenewalOn,"下次续费日期"):undefined;const item=await setSubscriptionStatus(parseId((await params).id),body.status as "active"|"paused"|"ended",next);return item?NextResponse.json(item):NextResponse.json({error:"订阅不存在"},{status:404});}catch(error){return apiError(error);}}
