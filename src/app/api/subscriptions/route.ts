import { NextRequest,NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createSubscription,listSubscriptions } from "@/lib/services/subscription";
import { parseNewSubscription } from "@/lib/validation";

export const runtime="nodejs";
export async function GET(request:NextRequest){try{const p=request.nextUrl.searchParams;return NextResponse.json(await listSubscriptions({query:p.get("q")||undefined,status:(p.get("status")||undefined) as "active"|"paused"|"ended"|undefined}));}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){try{return NextResponse.json(await createSubscription(parseNewSubscription(await request.json())),{status:201});}catch(error){return apiError(error);}}
