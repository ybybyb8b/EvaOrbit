import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { recordSubscriptionPayment } from "@/lib/services/subscription";
import { parseSubscriptionPayment } from "@/lib/validation";
type Context={params:Promise<{id:string}>};
export const runtime="nodejs";
export async function POST(request:NextRequest,{params}:Context){try{return NextResponse.json(await recordSubscriptionPayment(parseId((await params).id),parseSubscriptionPayment(await request.json())),{status:201});}catch(error){return apiError(error);}}
