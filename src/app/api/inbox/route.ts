import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createInbox, listInbox } from "@/lib/services/inbox";
import { parseNewInbox } from "@/lib/validation";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{return NextResponse.json(await listInbox(request.nextUrl.searchParams.get("status")||"inbox"));}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){try{return NextResponse.json(await createInbox(parseNewInbox(await request.json())),{status:201});}catch(error){return apiError(error);}}
