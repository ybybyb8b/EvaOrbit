import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { getProjectItem, updateProjectItem } from "@/lib/services/project";
import { parseProjectItemPatch } from "@/lib/validation";

export const runtime = "nodejs";
type Context={params:Promise<{id:string}>};
export async function GET(_:NextRequest,{params}:Context){try{const item=await getProjectItem(parseId((await params).id));return item?NextResponse.json(item):NextResponse.json({error:"Project item not found"},{status:404});}catch(error){return apiError(error);}}
export async function PATCH(request:NextRequest,{params}:Context){try{const item=await updateProjectItem(parseId((await params).id),parseProjectItemPatch(await request.json()));return item?NextResponse.json(item):NextResponse.json({error:"Project item not found"},{status:404});}catch(error){return apiError(error);}}
