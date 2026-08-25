import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { deleteInbox,updateInbox } from "@/lib/services/inbox";
import { parseInboxPatch } from "@/lib/validation";
export const runtime="nodejs";type Context={params:Promise<{id:string}>};
export async function PATCH(request:NextRequest,{params}:Context){try{const item=await updateInbox(parseId((await params).id),parseInboxPatch(await request.json()));return item?NextResponse.json(item):NextResponse.json({error:"Inbox 条目不存在"},{status:404});}catch(error){return apiError(error);}}
export async function DELETE(_:NextRequest,{params}:Context){try{return await deleteInbox(parseId((await params).id))?new NextResponse(null,{status:204}):NextResponse.json({error:"Inbox 条目不存在"},{status:404});}catch(error){return apiError(error);}}
