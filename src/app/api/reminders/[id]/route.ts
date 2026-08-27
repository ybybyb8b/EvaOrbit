import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { deleteReminder,updateReminder } from "@/lib/services/reminder";
export const runtime="nodejs";type Context={params:Promise<{id:string}>};
export async function PATCH(request:NextRequest,{params}:Context){try{const item=await updateReminder(parseId((await params).id),await request.json());return item?NextResponse.json(item):NextResponse.json({error:"Reminder not found"},{status:404});}catch(error){return apiError(error);}}
export async function DELETE(_:NextRequest,{params}:Context){try{return await deleteReminder(parseId((await params).id))?new NextResponse(null,{status:204}):NextResponse.json({error:"Reminder not found"},{status:404});}catch(error){return apiError(error);}}
