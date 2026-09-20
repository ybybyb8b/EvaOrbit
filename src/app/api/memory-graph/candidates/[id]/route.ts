import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { memoryUuid } from "@/lib/memory-graph-validation";
import { promoteMemoryFactCandidate, rejectMemoryFactCandidate } from "@/lib/services/memory-graph";
import { ConflictError } from "@/lib/errors";
import { ValidationError } from "@/lib/validation";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try{
    const{id}=await context.params,body=await request.json() as Record<string,unknown>,action=body.action;
    if(action!=="promote"&&action!=="reject")throw new ValidationError("action 必须是 promote 或 reject");
    const note=body.reviewNote===undefined||body.reviewNote===null?null:String(body.reviewNote).trim();
    if(note&&note.length>2000)throw new ValidationError("reviewNote 太长");
    const item=action==="promote"?await promoteMemoryFactCandidate(memoryUuid(id),note):await rejectMemoryFactCandidate(memoryUuid(id),note);
    if(!item)throw new ConflictError("候选 Fact 不存在或已经处理");
    return NextResponse.json(item);
  }catch(error){return apiError(error);}
}
