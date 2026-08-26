import { NextRequest,NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { discoverModels } from "@/lib/ai-provider";
import { getAiProvider,getAiSettings } from "@/lib/services/evaorbit";
import { parseAiProvider,ValidationError } from "@/lib/validation";
export const runtime="nodejs";
export async function POST(request:NextRequest){try{const body=await request.json() as Record<string,unknown>;const draft=parseAiProvider(body);const providerId=body.providerId===undefined||body.providerId===null?null:Number(body.providerId);if(providerId!==null&&(!Number.isSafeInteger(providerId)||providerId<=0))throw new ValidationError("Provider ID 格式不正确");const saved=providerId?await getAiProvider(providerId):null;const apiKey=draft.clearApiKey?"":draft.apiKey??saved?.apiKey??"";const current=await getAiSettings();const models=await discoverModels({...current,providerPreset:draft.providerType,providerName:draft.name,baseUrl:draft.baseUrl,apiKey,hasApiKey:Boolean(apiKey),maskedApiKey:null,enabled:draft.enabled,providerId,modelConfigId:null},request.signal);return NextResponse.json({ok:true,models});}catch(error){return apiError(error);}}
