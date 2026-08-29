import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createProjectItem, listProjectItems } from "@/lib/services/project";
import { parseNewProjectItem } from "@/lib/validation";

export const runtime = "nodejs";
export async function GET(request:NextRequest){try{const p=request.nextUrl.searchParams;return NextResponse.json(await listProjectItems({projectId:p.get("projectId")?Number(p.get("projectId")):undefined,project:p.get("project")||undefined,status:p.get("status") as never||undefined,type:p.get("type") as never||undefined,module:p.get("module")||undefined,query:p.get("q")||undefined}));}catch(error){return apiError(error);}}
export async function POST(request:NextRequest){try{return NextResponse.json(await createProjectItem(parseNewProjectItem(await request.json())),{status:201});}catch(error){return apiError(error);}}
