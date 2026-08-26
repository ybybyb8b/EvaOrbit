import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createTracker, listTrackerSummaries } from "@/lib/services/tracker";
import { parseNewTracker } from "@/lib/validation";

export const runtime = "nodejs";
export async function GET() { try { return NextResponse.json(await listTrackerSummaries()); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) { try { return NextResponse.json(await createTracker(parseNewTracker(await request.json())), { status: 201 }); } catch (error) { return apiError(error); } }
