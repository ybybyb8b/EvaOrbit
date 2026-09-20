import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getMemoryGraphSnapshot, proposeMemoryFactCandidate, recallMemory } from "@/lib/services/memory-graph";
import { ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request:NextRequest){
  try{
    const query=request.nextUrl.searchParams.get("q")?.trim();
    if(query){const raw=Number(request.nextUrl.searchParams.get("limit")??8);if(!Number.isSafeInteger(raw)||raw<1||raw>20)throw new ValidationError("limit 格式不正确");return NextResponse.json(await recallMemory(query,raw));}
    return NextResponse.json(await getMemoryGraphSnapshot());
  }catch(error){return apiError(error);}
}

export async function POST(request:NextRequest){
  try{
    const body=await request.json() as Record<string,unknown>;
    if(!Array.isArray(body.sources))throw new ValidationError("sources 必须是数组");
    return NextResponse.json(await proposeMemoryFactCandidate({fact:body.fact,sources:body.sources,proposedBy:typeof body.proposedBy==="string"?body.proposedBy as "user"|"model"|"system"|"import":undefined,proposerModel:typeof body.proposerModel==="string"?body.proposerModel:null}),{status:201});
  }catch(error){return apiError(error);}
}
