import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { convertInbox } from "@/lib/services/inbox";
import { parseInboxConversion } from "@/lib/validation";
export const runtime="nodejs";
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){try{const{target}=parseInboxConversion(await request.json());const result=await convertInbox(parseId((await params).id),target);return result?NextResponse.json(result):NextResponse.json({error:"Inbox 条目不存在"},{status:404});}catch(error){return apiError(error);}}
