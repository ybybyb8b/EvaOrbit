import { NextRequest,NextResponse } from "next/server";
import { apiError,parseId } from "@/lib/api";
import { createAiModelConfig } from "@/lib/services/evaorbit";
import { parseAiModelConfig } from "@/lib/validation";
export const runtime="nodejs";type Context={params:Promise<{id:string}>};
export async function POST(request:NextRequest,context:Context){try{return NextResponse.json(await createAiModelConfig(parseId((await context.params).id),parseAiModelConfig(await request.json())),{status:201});}catch(error){return apiError(error);}}
