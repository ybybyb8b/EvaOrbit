import { NextResponse } from "next/server";
import { currentNativeAccount } from "@/lib/native-account";
import { apiError } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { homeResourceKey } from "@/lib/home-readonly";
import { withHomeReadOnlyRepository } from "@/lib/repositories";
import { getHomeDayOverview } from "@/lib/services/home-day";
import { getTimelineMonthSummary } from "@/lib/services/timeline";
import { getDueReminders } from "@/lib/services/reminder";
import { reiconSvg } from "@/lib/reicon-catalog";
import type { HomeDayOverview } from "@/lib/home-day";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ kind: string; key: string }> }) {
  try {
    const account = await currentNativeAccount();
    if (!account) throw new HttpError("Please sign in", 401);
    let resource;
    try { resource = homeResourceKey(await params); } catch { throw new HttpError("Invalid Home resource date", 400); }
    const { kind, key } = resource;
    const data = await withHomeReadOnlyRepository<unknown>(async () => kind === "day" ? getHomeDayOverview(key, { readOnly: true }) : kind === "month" ? getTimelineMonthSummary(key, { readOnly: true }) : getDueReminders(50, new Date(), { readOnly: true }));
    const icons: Record<string,string> = {};
    if (kind === "day") for (const name of new Set((data as HomeDayOverview).activities.flatMap(item => item.icon ? [item.icon] : []))) {
      if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name)) continue;
      const svg = await reiconSvg(name);
      if (svg && svg.length <= 65536) icons[name] = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
    }
    return NextResponse.json({ format: "eo-home-readonly-v1", accountId: account.id, kind, key, capturedAt: new Date().toISOString(), data, icons }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { const response = apiError(error); response.headers.set("Cache-Control", "no-store"); return response; }
}
