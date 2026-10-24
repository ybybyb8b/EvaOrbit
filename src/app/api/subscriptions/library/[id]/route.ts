import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { updateSoftwareLibraryEntry, deleteSoftwareLibraryEntry } from "@/lib/services/software-library";
type Context={params:Promise<{id:string}>};
export const runtime="nodejs";
export async function PATCH(request:NextRequest,{params}:Context){try{const item=await updateSoftwareLibraryEntry(parseId((await params).id),await request.json());return item?NextResponse.json(item):NextResponse.json({error:"软件不存在"},{status:404});}catch(error){return apiError(error);}}
export async function DELETE(_:NextRequest,{params}:Context){try{return await deleteSoftwareLibraryEntry(parseId((await params).id))?new NextResponse(null,{status:204}):NextResponse.json({error:"软件不存在"},{status:404});}catch(error){return apiError(error);}}
