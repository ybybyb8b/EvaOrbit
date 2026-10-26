import { NextRequest, NextResponse } from "next/server";
import { deliverDueReminderPushes } from "@/lib/push/deliver";
import { deliveryErrorLog } from "@/lib/push/delivery-error";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await deliverDueReminderPushes());
  } catch (error) {
    console.error("Reminder delivery failed", deliveryErrorLog(error));
    return NextResponse.json({ error: "Reminder delivery failed" }, { status: 500 });
  }
}
