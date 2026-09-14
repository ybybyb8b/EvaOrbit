import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { getSubscriptionDetail,updateSubscription } from "@/lib/services/subscription";
import { parseSubscriptionPatch } from "@/lib/validation";
type Context={params:Promise<{id:string}>};
export const runtime="nodejs";
export async function GET(_:NextRequest,{params}:Context){try{const item=await getSubscriptionDetail(parseId((await params).id));return item?NextResponse.json(item):NextResponse.json({error:"订阅不存在"},{status:404});}catch(error){return apiError(error);}}
export async function PATCH(request:NextRequest,{params}:Context){try{const item=await updateSubscription(parseId((await params).id),parseSubscriptionPatch(await request.json()));return item?NextResponse.json(item):NextResponse.json({error:"订阅不存在"},{status:404});}catch(error){return apiError(error);}}
