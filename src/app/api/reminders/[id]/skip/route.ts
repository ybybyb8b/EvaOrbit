import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { skipReminder } from "@/lib/services/reminder";
export const runtime="nodejs";type Context={params:Promise<{id:string}>};
export async function POST(request:NextRequest,{params}:Context){try{const body=await request.json().catch(()=>({}));return NextResponse.json(await skipReminder(parseId((await params).id),body.actedAt?new Date(body.actedAt):new Date()));}catch(error){return apiError(error);}}
