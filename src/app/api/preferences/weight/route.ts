import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getWeightSettings, updateWeightSettings } from "@/lib/services/weight";
import { parseWeightSettings } from "@/lib/validation";

export const runtime = "nodejs";
export async function GET() { try { return NextResponse.json(await getWeightSettings()); } catch (error) { return apiError(error); } }
export async function PATCH(request: NextRequest) { try { return NextResponse.json(await updateWeightSettings(parseWeightSettings(await request.json()))); } catch (error) { return apiError(error); } }
