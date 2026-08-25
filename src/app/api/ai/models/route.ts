import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { discoverModels } from "@/lib/ai-provider";
import { getAiSettings } from "@/lib/services/evaorbit";
import { parseAiSettings } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const draft = parseAiSettings(await request.json());
    const current = await getAiSettings();
    const models = await discoverModels({
      ...current,
      ...draft,
      apiKey: draft.apiKey === undefined ? current.apiKey : draft.apiKey,
      hasApiKey: Boolean(draft.apiKey === undefined ? current.apiKey : draft.apiKey),
    }, request.signal);
    return NextResponse.json({ models });
  } catch (error) {
    return apiError(error);
  }
}
