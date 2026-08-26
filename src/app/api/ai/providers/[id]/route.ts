import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { deleteAiProvider,updateAiProvider } from "@/lib/services/evaorbit";
import { parseAiProvider } from "@/lib/validation";
export const runtime="nodejs";type Context={params:Promise<{id:string}>};
export async function PATCH(request:NextRequest,context:Context){try{const provider=await updateAiProvider(parseId((await context.params).id),parseAiProvider(await request.json()));return provider?NextResponse.json(provider):NextResponse.json({error:"Provider 不存在"},{status:404});}catch(error){return apiError(error);}}
export async function DELETE(_:NextRequest,context:Context){try{return await deleteAiProvider(parseId((await context.params).id))?new NextResponse(null,{status:204}):NextResponse.json({error:"Provider 不存在"},{status:404});}catch(error){return apiError(error);}}
