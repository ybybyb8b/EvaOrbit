import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { deleteAiModelConfig,updateAiModelConfig } from "@/lib/services/evaorbit";
import { parseAiModelConfig } from "@/lib/validation";
export const runtime="nodejs";type Context={params:Promise<{id:string}>};
export async function PATCH(request:NextRequest,context:Context){try{const model=await updateAiModelConfig(parseId((await context.params).id),parseAiModelConfig(await request.json()));return model?NextResponse.json(model):NextResponse.json({error:"模型不存在"},{status:404});}catch(error){return apiError(error);}}
export async function DELETE(_:NextRequest,context:Context){try{return await deleteAiModelConfig(parseId((await context.params).id))?new NextResponse(null,{status:204}):NextResponse.json({error:"模型不存在"},{status:404});}catch(error){return apiError(error);}}
