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
    const apiKey = draft.clearApiKey ? "" : draft.apiKey === undefined ? current.apiKey : draft.apiKey;
    const models = await discoverModels({
      ...current,
      ...draft,
      apiKey,
      hasApiKey: Boolean(apiKey),
      maskedApiKey: null,
    }, request.signal);
    return NextResponse.json({ models });
  } catch (error) {
    return apiError(error);
  }
}
