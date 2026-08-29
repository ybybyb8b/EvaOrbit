import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { getProject, updateProject } from "@/lib/services/project";
import { parseProjectPatch } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: NextRequest, { params }: Context) { try { const item=await getProject(parseId((await params).id));return item?NextResponse.json(item):NextResponse.json({error:"Project not found"},{status:404}); } catch(error){return apiError(error);} }
export async function PATCH(request:NextRequest,{params}:Context){try{const item=await updateProject(parseId((await params).id),parseProjectPatch(await request.json()));return item?NextResponse.json(item):NextResponse.json({error:"Project not found"},{status:404});}catch(error){return apiError(error);}}
