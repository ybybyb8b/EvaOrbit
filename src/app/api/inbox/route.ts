import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createInbox, listInbox } from "@/lib/services/inbox";
import { parseInboxStatus, parseNewInbox, ValidationError } from "@/lib/validation";
export const runtime="nodejs";
const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(request:NextRequest){try{return NextResponse.json(await listInbox(parseInboxStatus(request.nextUrl.searchParams.get("status"))));}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){try{const input=parseNewInbox(await request.json());const mutationId=request.headers.get("x-evaorbit-mutation-id");if(mutationId&&!UUID_PATTERN.test(mutationId))throw new ValidationError("Inbox mutation ID 格式不正确");return NextResponse.json(await createInbox({...input,...(mutationId?{clientMutationId:mutationId}:{})}),{status:201});}catch(error){return apiError(error);}}
