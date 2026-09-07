import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { deleteInbox,updateInbox } from "@/lib/services/inbox";
import { parseInboxPatch, ValidationError } from "@/lib/validation";
export const runtime="nodejs";type Context={params:Promise<{id:string}>};
const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function PATCH(request:NextRequest,{params}:Context){try{const expected=request.headers.get("x-evaorbit-base-updated-at");if(expected&&Number.isNaN(Date.parse(expected)))throw new ValidationError("Inbox 版本时间格式不正确");const mutationId=request.headers.get("x-evaorbit-mutation-id");if(mutationId&&!UUID_PATTERN.test(mutationId))throw new ValidationError("Inbox mutation ID 格式不正确");const item=await updateInbox(parseId((await params).id),parseInboxPatch(await request.json()),expected,mutationId);return item?NextResponse.json(item):NextResponse.json({error:"Inbox 条目不存在"},{status:404});}catch(error){return apiError(error);}}
export async function DELETE(_:NextRequest,{params}:Context){try{return await deleteInbox(parseId((await params).id))?new NextResponse(null,{status:204}):NextResponse.json({error:"Inbox 条目不存在"},{status:404});}catch(error){return apiError(error);}}
