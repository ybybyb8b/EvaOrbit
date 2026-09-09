import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { bearerCredential, parseHealthKitUpload, parseInstallationId } from "@/lib/healthkit";
import { ingestHealthKitBodyMass, ingestHealthKitEnergy } from "@/lib/services/healthkit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const credential = bearerCredential(request.headers.get("authorization"));
  if (!credential) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const installationId = parseInstallationId(request.headers.get("x-evaorbit-installation-id"));
    const upload = parseHealthKitUpload(await request.json());
    const results = await Promise.all([
      upload.snapshots.length ? ingestHealthKitEnergy(installationId, credential, upload.snapshots) : Promise.resolve({ ok: true as const, accepted: 0, received: 0 }),
      upload.bodyMassChanges.length ? ingestHealthKitBodyMass(installationId, credential, upload.bodyMassChanges) : Promise.resolve({ ok: true as const, accepted: 0, received: 0 }),
    ]);
    const denied = results.find((result) => !result.ok);
    if (denied && !denied.ok) return NextResponse.json({ error: denied.status === 403 ? "Forbidden" : "Unauthorized" }, { status: denied.status });
    return NextResponse.json({ accepted: results.reduce((sum,result)=>sum+(result.ok?result.accepted:0),0), received: results.reduce((sum,result)=>sum+(result.ok?result.received:0),0) });
  } catch (error) {
    return apiError(error);
  }
}
