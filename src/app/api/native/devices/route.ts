import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { parseInstallationId } from "@/lib/healthkit";
import { registerNativeDevice, revokeNativeDevice } from "@/lib/services/healthkit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await registerNativeDevice(parseInstallationId(body.installationId)), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await revokeNativeDevice(parseInstallationId(body.installationId)));
  } catch (error) {
    return apiError(error);
  }
}
