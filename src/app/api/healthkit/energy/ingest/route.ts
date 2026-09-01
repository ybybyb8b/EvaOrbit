import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { bearerCredential, parseHealthKitEnergySnapshots, parseInstallationId } from "@/lib/healthkit";
import { ingestHealthKitEnergy } from "@/lib/services/healthkit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const credential = bearerCredential(request.headers.get("authorization"));
  if (!credential) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const installationId = parseInstallationId(request.headers.get("x-evaorbit-installation-id"));
    const snapshots = parseHealthKitEnergySnapshots(await request.json());
    const result = await ingestHealthKitEnergy(installationId, credential, snapshots);
    if (!result.ok) return NextResponse.json({ error: result.status === 403 ? "Forbidden" : "Unauthorized" }, { status: result.status });
    return NextResponse.json({ accepted: result.accepted, received: result.received });
  } catch (error) {
    return apiError(error);
  }
}
